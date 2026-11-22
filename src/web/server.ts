import { ChannelType, Client } from 'discord.js';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import path from 'node:path';
import { config } from '../config.js';
import { soundsDir } from '../db/index.js';
import { workerPool, type ChannelActivityEvent } from '../voice/index.js';
import { MusicResolver, type PlatformOption, type Track } from '../voice/music-resolver.js';
import { PlaylistService } from '../voice/playlists.js';
import {
  getSafeAudioMimeType,
  MyInstantsClient,
  SoundboardService,
} from '../voice/soundboard.js';
import {
  canManageGlobalCookies,
  consumeMagicToken,
  createWebSession,
  deleteWebSession,
  getGuildSettings,
  getWebSession,
  resolveMemberContext,
  setGuildSettings,
  updateSessionActiveGuild,
  verifyLiveGuildAdmin,
} from './auth.js';
import {
  applySecurityHeaders,
  assertTrustedMyInstantsAudioUrl,
  getClientIp,
  RateLimiter,
  redactSensitiveText,
  verifyCsrfProtection,
} from './security.js';

const COOKIE_NAME = 'dbot_session';
const publicDir = path.resolve(process.cwd(), 'public');
const oauthStates = new Map<string, number>();
const rateLimiter = new RateLimiter();

interface WatchPresenceEntry {
  sessionToken: string;
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  guildId: string;
  channelId: string;
  updatedAt: number;
}

const WATCH_PRESENCE_TTL_MS = 30 * 60 * 1000;
const watchSessions = new Map<string, WatchPresenceEntry>();
const recentSfxPlays = new Map<string, number>();

function isDuplicateSfxRequest(key: string, windowMs = 1500): boolean {
  const now = Date.now();
  if (recentSfxPlays.size > 300) {
    for (const [k, ts] of recentSfxPlays.entries()) {
      if (now - ts > 10_000) recentSfxPlays.delete(k);
    }
  }
  const prev = recentSfxPlays.get(key);
  if (prev !== undefined && now - prev < windowMs) {
    return true;
  }
  recentSfxPlays.set(key, now);
  return false;
}

function serializePublicTrack(track: Track) {
  return {
    id: track.id,
    title: track.title,
    author: track.author,
    url: track.url,
    originalUrl: track.originalUrl,
    durationSec: track.durationSec,
    durationFormatted: track.durationFormatted,
    thumbnail: track.thumbnail,
    source: track.source,
    mediaKind: track.mediaKind ?? (track.source === 'youtube' ? 'video' : 'music'),
    requestedBy: track.requestedBy,
  };
}

function getChannelListeners(
  client: Client,
  guildId: string | null,
  channelId: string | null
): Array<{ id: string; displayName: string; avatarUrl: string | null }> {
  if (!guildId || !channelId) return [];
  const guild = client.guilds.cache.get(guildId);
  if (!guild) return [];
  const channel = guild.channels.cache.get(channelId);
  if (!channel || !channel.isVoiceBased()) return [];

  const members = [...channel.members.values()]
    .filter((m) => !m.user.bot)
    .slice(0, 50);

  return members.map((m) => ({
    id: m.id,
    displayName: m.displayName,
    avatarUrl: m.displayAvatarURL({ size: 64 }),
  }));
}

function getWatchViewersForChannel(
  client: Client,
  guildId: string | null,
  channelId: string | null
): Array<{ id: string; displayName: string; avatarUrl: string | null }> {
  if (!guildId || !channelId) return [];
  const guild = client.guilds.cache.get(guildId);
  if (!guild) return [];

  const now = Date.now();
  const seenUsers = new Set<string>();
  const viewers: Array<{ id: string; displayName: string; avatarUrl: string | null }> = [];

  for (const [token, entry] of watchSessions.entries()) {
    if (now - entry.updatedAt > WATCH_PRESENCE_TTL_MS) {
      watchSessions.delete(token);
      continue;
    }
    if (entry.guildId !== guildId || entry.channelId !== channelId) continue;

    // Проверяем, что пользователь всё ещё физически находится в этом голосовом канале
    const voiceState = guild.voiceStates.cache.get(entry.userId);
    if (!voiceState || voiceState.channelId !== channelId) {
      watchSessions.delete(token);
      continue;
    }

    if (seenUsers.has(entry.userId)) continue;
    seenUsers.add(entry.userId);
    viewers.push({
      id: entry.userId,
      displayName: entry.displayName,
      avatarUrl: entry.avatarUrl,
    });
  }

  return viewers;
}

// Белый список корневых статических файлов и безопасных расширений для собранных Vite-ассетов
const STATIC_FILES = new Map<string, { file: string; contentType: string }>([
  ['/', { file: 'index.html', contentType: 'text/html; charset=utf-8' }],
  ['/index.html', { file: 'index.html', contentType: 'text/html; charset=utf-8' }],
  ['/favicon.ico', { file: 'favicon.ico', contentType: 'image/x-icon' }],
  ['/favicon.svg', { file: 'favicon.svg', contentType: 'image/svg+xml' }],
]);

const ASSET_CONTENT_TYPES = new Map<string, string>([
  ['.js', 'application/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
  ['.ico', 'image/x-icon'],
  ['.woff2', 'font/woff2'],
  ['.woff', 'font/woff'],
]);

function resolveStaticAsset(
  pathname: string
): { filePath: string; contentType: string; cacheControl: string } | null {
  const staticEntry = STATIC_FILES.get(pathname);
  if (staticEntry) {
    const filePath = path.join(publicDir, staticEntry.file);
    return {
      filePath,
      contentType: staticEntry.contentType,
      cacheControl: 'no-cache',
    };
  }

  // Собранные Vite-бандлы в /assets/<safe-name> (строгая валидация имени файла исключает Path Traversal)
  if (/^\/assets\/[a-zA-Z0-9._-]+$/.test(pathname) && !pathname.includes('..')) {
    const ext = path.extname(pathname).toLowerCase();
    const contentType = ASSET_CONTENT_TYPES.get(ext);
    if (!contentType) return null;
    const relativeName = pathname.slice('/assets/'.length);
    const filePath = path.join(publicDir, 'assets', relativeName);
    return {
      filePath,
      contentType,
      cacheControl: 'public, max-age=31536000, immutable',
    };
  }

  return null;
}

function parseCookies(req: IncomingMessage): Record<string, string> {
  const header = req.headers.cookie;
  if (!header) return {};
  const result: Record<string, string> = {};
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const rawVal = part.slice(idx + 1).trim();
    try {
      result[key] = decodeURIComponent(rawVal);
    } catch {
      // Игнорируем некорректно закодированные cookie
    }
  }
  return result;
}

function setSessionCookie(res: ServerResponse, token: string): void {
  const maxAge = 7 * 24 * 60 * 60;
  const secureFlag = config.publicUrl.startsWith('https://') ? '; Secure' : '';
  res.setHeader(
    'Set-Cookie',
    `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax${secureFlag}; Max-Age=${maxAge}`
  );
}

function clearSessionCookie(res: ServerResponse): void {
  const secureFlag = config.publicUrl.startsWith('https://') ? '; Secure' : '';
  res.setHeader(
    'Set-Cookie',
    `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax${secureFlag}; Max-Age=0`
  );
}

function sendJson(res: ServerResponse, statusCode: number, data: unknown): void {
  const body = JSON.stringify(data);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function redirect(res: ServerResponse, location: string): void {
  res.writeHead(302, { Location: location });
  res.end();
}

async function readJsonBody<T = any>(
  req: IncomingMessage,
  maxBytes = 1024 * 1024
): Promise<T> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;

    req.on('data', (chunk: Buffer) => {
      total += chunk.length;
      if (total > maxBytes) {
        reject(new Error('Превышен максимальный размер запроса'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', () => {
      if (chunks.length === 0) {
        resolve({} as T);
        return;
      }
      try {
        const text = Buffer.concat(chunks).toString('utf-8');
        resolve(JSON.parse(text) as T);
      } catch {
        reject(new Error('Некорректный JSON в теле запроса'));
      }
    });

    req.on('error', reject);
  });
}

async function buildUserStatePayload(
  client: Client,
  userId: string,
  preferredGuildId?: string | null
) {
  const ctx = await resolveMemberContext(client, userId, preferredGuildId);
  const myWorker =
    ctx.voice.inVoice && ctx.voice.channelId
      ? workerPool.getWorkerForChannel(ctx.voice.channelId) ?? null
      : null;

  const userGuildIds = new Set(ctx.sharedGuilds.map((g) => g.id));
  const poolStatuses = workerPool.getAllStatuses().map((w) => {
    const canSeeDetails = Boolean(w.isInChannel && w.guildId && userGuildIds.has(w.guildId));
    const workerInst = canSeeDetails ? workerPool.getWorkerById(w.id) ?? null : null;
    const listeners = canSeeDetails
      ? getChannelListeners(client, w.guildId, w.channelId)
      : [];
    const currentTrack =
      canSeeDetails && workerInst?.queue.currentTrack
        ? serializePublicTrack(workerInst.queue.currentTrack)
        : null;
    const queue =
      canSeeDetails && workerInst
        ? workerInst.queue.tracks.map(serializePublicTrack)
        : [];

    return {
      ...w,
      guildId: canSeeDetails ? w.guildId : null,
      guildName: canSeeDetails ? w.guildName : null,
      channelId: canSeeDetails ? w.channelId : null,
      channelName: canSeeDetails ? w.channelName : null,
      currentTrackTitle: canSeeDetails ? w.currentTrackTitle : null,
      queueLength: canSeeDetails ? w.queueLength : 0,
      isMine: myWorker !== null && w.id === myWorker.id,
      canInspect: canSeeDetails,
      listeners,
      currentTrack,
      queue,
      progressSec: canSeeDetails && workerInst ? workerInst.queue.getPlaybackProgressSec() : 0,
    };
  });

  const watchViewers =
    ctx.voice.inVoice && ctx.guildId && ctx.voice.channelId
      ? getWatchViewersForChannel(client, ctx.guildId, ctx.voice.channelId)
      : [];

  const availableForGuild = ctx.guildId
    ? workerPool.getAvailableCountForGuild(ctx.guildId)
    : workerPool.availableCount;

  return {
    guildId: ctx.guildId,
    guildName: ctx.guildName,
    guilds: ctx.sharedGuilds,
    user: {
      id: userId,
      username: ctx.member?.user.tag ?? ctx.displayName,
      displayName: ctx.displayName,
      avatarUrl: ctx.avatarUrl,
      inGuild: ctx.inGuild,
      isAdmin: ctx.isAdmin,
      canManageCookies: ctx.canManageCookies,
      hasAccess: ctx.hasAccess,
      requiredRoleId: ctx.requiredRoleId,
      requiredRoleName: ctx.requiredRoleName,
    },
    voice: ctx.voice,
    myWorker: myWorker
      ? {
          id: myWorker.id,
          name: `Воркер #${myWorker.id}`,
          tag: myWorker.client.user?.tag ?? `Worker #${myWorker.id}`,
          avatarUrl: myWorker.client.user?.displayAvatarURL({ size: 64 }) ?? null,
          channelId: myWorker.currentChannelId,
          volume: myWorker.queue.volume,
          loopMode: myWorker.queue.loopMode,
          isPaused: myWorker.queue.isPaused,
          progressSec: myWorker.queue.getPlaybackProgressSec(),
          activeSfxName: myWorker.queue.activeSfxName,
          idleLeaveAt: myWorker.queue.idleLeaveAt,
          emptyLeaveAt: myWorker.emptyLeaveAt,
          currentTrack: myWorker.queue.currentTrack
            ? serializePublicTrack(myWorker.queue.currentTrack)
            : null,
          queue: myWorker.queue.tracks.map(serializePublicTrack),
        }
      : null,
    watchViewers,
    pool: {
      totalCount: workerPool.totalCount,
      availableCount: availableForGuild,
      workers: poolStatuses,
    },
  };
}

export function startWebServer(discordClient: Client): http.Server {
  interface SseClient {
    sessionToken: string;
    userId: string;
    res: ServerResponse;
  }

  const sseClients = new Set<SseClient>();
  let broadcastTimer: NodeJS.Timeout | null = null;

  const scheduleBroadcast = (eventType: 'state' | 'sounds') => {
    if (eventType === 'sounds') {
      const payload = `event: sounds\ndata: ${JSON.stringify({ updatedAt: Date.now() })}\n\n`;
      for (const c of sseClients) {
        try {
          c.res.write(payload);
        } catch {
          sseClients.delete(c);
        }
      }
      return;
    }

    if (broadcastTimer) return;
    broadcastTimer = setTimeout(async () => {
      broadcastTimer = null;
      if (sseClients.size === 0) return;

      const payloadBySession = new Map<string, string>();

      for (const c of [...sseClients]) {
        try {
          let serialized = payloadBySession.get(c.sessionToken);
          if (!serialized) {
            const session = await getWebSession(c.sessionToken);
            if (!session) {
              sseClients.delete(c);
              continue;
            }
            const state = await buildUserStatePayload(
              discordClient,
              c.userId,
              session.activeGuildId
            );
            serialized = `event: state\ndata: ${JSON.stringify(state)}\n\n`;
            payloadBySession.set(c.sessionToken, serialized);
          }
          c.res.write(serialized);
        } catch {
          sseClients.delete(c);
        }
      }
    }, 80);
  };

  workerPool.events.on('stateChanged', () => scheduleBroadcast('state'));
  workerPool.events.on('soundsChanged', () => scheduleBroadcast('sounds'));
  workerPool.events.on('playlistsChanged', (userId?: string) => {
    const payload = `event: playlists\ndata: ${JSON.stringify({ updatedAt: Date.now() })}\n\n`;
    for (const c of sseClients) {
      if (userId && c.userId !== userId) continue;
      try {
        c.res.write(payload);
      } catch {
        sseClients.delete(c);
      }
    }
  });

  // Адресная рассылка уведомлений о действиях (кто остановил, очистил очередь, пропустил и т.д.)
  // СТРОГО только участникам этого голосового канала на этом сервере!
  workerPool.events.on('activity', (event: ChannelActivityEvent) => {
    const guild = discordClient.guilds.cache.get(event.guildId);
    if (!guild) return;

    const publicPayload = {
      id: event.id,
      action: event.action,
      actorId: event.actorId,
      actorName: event.actorName,
      detail: event.detail,
      count: event.count,
      timestamp: event.timestamp,
    };
    const serialized = `event: activity\ndata: ${JSON.stringify(publicPayload)}\n\n`;

    for (const c of [...sseClients]) {
      const voiceState = guild.voiceStates.cache.get(c.userId);
      if (!voiceState || voiceState.channelId !== event.channelId) continue;
      try {
        c.res.write(serialized);
      } catch {
        sseClients.delete(c);
      }
    }
  });

  setInterval(() => {
    for (const c of sseClients) {
      try {
        c.res.write(': ping\n\n');
      } catch {
        sseClients.delete(c);
      }
    }
  }, 25_000);

  const server = http.createServer(async (req, res) => {
    try {
      applySecurityHeaders(res);

      // Используем фиксированный базовый хост, чтобы некорректный Host-заголовок не ломал парсер
      const url = new URL(req.url || '/', 'http://dbot.local');
      const pathname = url.pathname;
      const method = (req.method || 'GET').toUpperCase();
      const clientIp = getClientIp(req);

      if (pathname.startsWith('/api/')) {
        if (!rateLimiter.check(`api:${clientIp}`, 180, 60_000)) {
          sendJson(res, 429, { error: 'Слишком много запросов. Подождите немного.' });
          return;
        }
        const csrfCheck = verifyCsrfProtection(req);
        if (!csrfCheck.ok) {
          sendJson(res, 403, { error: csrfCheck.reason || 'Ошибка проверки CSRF.' });
          return;
        }
      }

      // ====================================================
      // 1. Публичные Auth маршруты
      // ====================================================
      if (pathname.startsWith('/api/auth/') && !rateLimiter.check(`auth:${clientIp}`, 30, 60_000)) {
        sendJson(res, 429, { error: 'Слишком много попыток входа. Попробуйте через минуту.' });
        return;
      }

      if (pathname === '/api/auth/info' && method === 'GET') {
        const cookies = parseCookies(req);
        const session = await getWebSession(cookies[COOKIE_NAME]);
        sendJson(res, 200, {
          authenticated: Boolean(session),
          oauthEnabled: Boolean(config.clientId && config.clientSecret),
          prefix: config.prefix,
        });
        return;
      }

      if (pathname === '/api/auth/magic' && method === 'GET') {
        const token = url.searchParams.get('token') || '';
        const entry = consumeMagicToken(token);
        if (!entry) {
          redirect(res, '/?authError=expired');
          return;
        }
        const session = await createWebSession({
          userId: entry.userId,
          username: entry.username,
          avatar: entry.avatar,
          activeGuildId: entry.guildId ?? null,
        });
        setSessionCookie(res, session.token);
        redirect(res, '/');
        return;
      }

      if (pathname === '/api/auth/discord' && method === 'GET') {
        if (!config.clientId || !config.clientSecret) {
          redirect(res, '/?authError=no_oauth');
          return;
        }
        const now = Date.now();
        for (const [k, exp] of oauthStates.entries()) {
          if (exp < now) oauthStates.delete(k);
        }
        while (oauthStates.size >= 500) {
          const oldest = oauthStates.keys().next().value;
          if (!oldest) break;
          oauthStates.delete(oldest);
        }
        const state = crypto.randomBytes(16).toString('hex');
        oauthStates.set(state, now + 10 * 60 * 1000);

        const redirectUri = `${config.publicUrl}/api/auth/callback`;
        const params = new URLSearchParams({
          client_id: config.clientId,
          redirect_uri: redirectUri,
          response_type: 'code',
          scope: 'identify',
          state,
        });
        redirect(res, `https://discord.com/oauth2/authorize?${params.toString()}`);
        return;
      }

      if (pathname === '/api/auth/callback' && method === 'GET') {
        const code = url.searchParams.get('code');
        const state = url.searchParams.get('state');
        if (!code || !state || !oauthStates.has(state)) {
          redirect(res, '/?authError=invalid_state');
          return;
        }
        oauthStates.delete(state);

        const redirectUri = `${config.publicUrl}/api/auth/callback`;
        const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id: config.clientId,
            client_secret: config.clientSecret,
            grant_type: 'authorization_code',
            code,
            redirect_uri: redirectUri,
          }),
        });

        if (!tokenRes.ok) {
          redirect(res, '/?authError=oauth_failed');
          return;
        }

        const tokenData = (await tokenRes.json()) as { access_token: string };
        const userRes = await fetch('https://discord.com/api/users/@me', {
          headers: { Authorization: `Bearer ${tokenData.access_token}` },
        });
        if (!userRes.ok) {
          redirect(res, '/?authError=user_fetch_failed');
          return;
        }

        const user = (await userRes.json()) as {
          id: string;
          username: string;
          global_name?: string;
          avatar?: string;
        };

        const avatarUrl = user.avatar
          ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=128`
          : null;

        const session = await createWebSession({
          userId: user.id,
          username: user.global_name || user.username,
          avatar: avatarUrl,
        });

        setSessionCookie(res, session.token);
        redirect(res, '/');
        return;
      }

      if (pathname === '/api/auth/logout' && method === 'POST') {
        const cookies = parseCookies(req);
        if (cookies[COOKIE_NAME]) {
          if (watchSessions.delete(cookies[COOKIE_NAME])) {
            workerPool.events.emit('stateChanged');
          }
          await deleteWebSession(cookies[COOKIE_NAME]).catch(() => {});
        }
        clearSessionCookie(res);
        sendJson(res, 200, { ok: true });
        return;
      }

      // ====================================================
      // 2. Защищённые API маршруты (требуют сессию)
      // ====================================================
      if (pathname.startsWith('/api/')) {
        const cookies = parseCookies(req);
        const session = await getWebSession(cookies[COOKIE_NAME]);
        if (!session) {
          sendJson(res, 401, { error: 'Требуется авторизация.' });
          return;
        }

        const ctx = await resolveMemberContext(
          discordClient,
          session.userId,
          session.activeGuildId
        );

        if (pathname === '/api/state' && method === 'GET') {
          const payload = await buildUserStatePayload(
            discordClient,
            session.userId,
            session.activeGuildId
          );
          sendJson(res, 200, payload);
          return;
        }

        if (pathname === '/api/events' && method === 'GET') {
          res.writeHead(200, {
            'Content-Type': 'text/event-stream; charset=utf-8',
            'Cache-Control': 'no-cache, no-transform',
            Connection: 'keep-alive',
          });
          res.write('\n');

          const clientEntry: SseClient = {
            sessionToken: session.token,
            userId: session.userId,
            res,
          };
          sseClients.add(clientEntry);

          const initial = await buildUserStatePayload(
            discordClient,
            session.userId,
            session.activeGuildId
          );
          res.write(`event: state\ndata: ${JSON.stringify(initial)}\n\n`);

          req.on('close', () => {
            sseClients.delete(clientEntry);
            const stillHasSse = [...sseClients].some(
              (c) => c.sessionToken === session.token
            );
            if (!stillHasSse && watchSessions.delete(session.token)) {
              workerPool.events.emit('stateChanged');
            }
          });
          return;
        }

        // Переключение активного сервера (доступно любому авторизованному пользователю для своих серверов)
        if (pathname === '/api/guild/select' && method === 'POST') {
          const body = await readJsonBody<{ guildId?: string }>(req);
          const targetGuildId = String(body.guildId || '').trim();
          if (!ctx.sharedGuilds.some((g) => g.id === targetGuildId)) {
            sendJson(res, 403, { error: 'Вы не состоите на выбранном сервере.' });
            return;
          }
          await updateSessionActiveGuild(session.token, targetGuildId);
          const nextPayload = await buildUserStatePayload(
            discordClient,
            session.userId,
            targetGuildId
          );
          workerPool.events.emit('stateChanged');
          sendJson(res, 200, nextPayload);
          return;
        }

        if (!ctx.inGuild || !ctx.guildId) {
          sendJson(res, 403, { error: 'У вас нет общих серверов с ботом.' });
          return;
        }
        if (!ctx.hasAccess) {
          sendJson(res, 403, {
            error: `Недостаточно прав на сервере "${ctx.guildName}". Требуется роль: ${ctx.requiredRoleName ?? ctx.requiredRoleId}.`,
          });
          return;
        }

        const activeGuildId = ctx.guildId;

        // ---- Настройки администратора (роль доступа и разрешённый текстовый канал для активного сервера) ----
        // На всех /api/admin/* выполняем ЖИВУЮ проверку прав Администратора в Discord API (force: true)!
        if (pathname === '/api/admin/settings' && method === 'GET') {
          const liveAdmin = await verifyLiveGuildAdmin(discordClient, activeGuildId, session.userId);
          if (!liveAdmin) {
            sendJson(res, 403, { error: 'Только администраторы сервера могут изменять настройки.' });
            return;
          }
          const guild = discordClient.guilds.cache.get(activeGuildId);
          const roles = guild
            ? [...guild.roles.cache.values()]
                .filter((r) => r.id !== guild.id && !r.managed)
                .sort((a, b) => b.position - a.position)
                .map((r) => ({ id: r.id, name: r.name, color: r.hexColor }))
            : [];
          const channels = guild
            ? [...guild.channels.cache.values()]
                .filter(
                  (c) =>
                    c.type === ChannelType.GuildText ||
                    c.type === ChannelType.GuildAnnouncement
                )
                .sort((a, b) => a.rawPosition - b.rawPosition)
                .map((c) => ({
                  id: c.id,
                  name: c.name,
                  parentName: c.parent?.name ?? null,
                }))
            : [];
          const guildSettings = await getGuildSettings(activeGuildId);
          sendJson(res, 200, {
            requiredRoleId: guildSettings.requiredRoleId,
            allowedChannelId: guildSettings.allowedChannelId,
            roles,
            channels,
          });
          return;
        }

        if (pathname === '/api/admin/settings' && method === 'POST') {
          const liveAdmin = await verifyLiveGuildAdmin(discordClient, activeGuildId, session.userId);
          if (!liveAdmin) {
            sendJson(res, 403, { error: 'Только администраторы сервера могут изменять настройки.' });
            return;
          }
          const body = await readJsonBody<{
            requiredRoleId?: string | null;
            allowedChannelId?: string | null;
          }>(req);

          const guild = discordClient.guilds.cache.get(activeGuildId);
          const patch: { requiredRoleId?: string | null; allowedChannelId?: string | null } = {};

          if ('requiredRoleId' in body) {
            const roleId = body.requiredRoleId ? String(body.requiredRoleId).trim() : null;
            if (roleId) {
              if (!/^\d{15,22}$/.test(roleId)) {
                sendJson(res, 400, { error: 'Некорректный ID роли Discord.' });
                return;
              }
              const roleObj = guild?.roles.cache.get(roleId);
              if (!roleObj || roleObj.id === guild?.id || roleObj.managed) {
                sendJson(res, 400, { error: 'Указанная роль не найдена на этом сервере.' });
                return;
              }
            }
            patch.requiredRoleId = roleId;
          }

          if ('allowedChannelId' in body) {
            const channelId = body.allowedChannelId ? String(body.allowedChannelId).trim() : null;
            if (channelId) {
              if (!/^\d{15,22}$/.test(channelId)) {
                sendJson(res, 400, { error: 'Некорректный ID канала Discord.' });
                return;
              }
              const channelObj = guild?.channels.cache.get(channelId);
              if (
                !channelObj ||
                (channelObj.type !== ChannelType.GuildText &&
                  channelObj.type !== ChannelType.GuildAnnouncement)
              ) {
                sendJson(res, 400, { error: 'Указанный текстовый канал не найден на этом сервере.' });
                return;
              }
            }
            patch.allowedChannelId = channelId;
          }

          const updated = await setGuildSettings(activeGuildId, patch);
          workerPool.events.emit('stateChanged');
          sendJson(res, 200, {
            ok: true,
            requiredRoleId: updated.requiredRoleId,
            allowedChannelId: updated.allowedChannelId,
          });
          return;
        }

        // ---- Настройки администратора: YouTube Cookies (горячая загрузка и обновление) ----
        if (pathname === '/api/admin/cookies' && method === 'GET') {
          const allowed = await canManageGlobalCookies(discordClient, activeGuildId, session.userId);
          if (!allowed) {
            sendJson(res, 403, { error: 'Доступ запрещён: требуется роль Администратора сервера.' });
            return;
          }
          sendJson(res, 200, MusicResolver.getCookiesStatus());
          return;
        }

        if (pathname === '/api/admin/cookies' && method === 'POST') {
          const allowed = await canManageGlobalCookies(discordClient, activeGuildId, session.userId);
          if (!allowed) {
            sendJson(res, 403, { error: 'Доступ запрещён: требуется роль Администратора сервера.' });
            return;
          }
          if (!rateLimiter.check(`cookies:${session.userId}`, 10, 60_000)) {
            sendJson(res, 429, { error: 'Слишком частая загрузка cookies. Попробуйте через минуту.' });
            return;
          }
          const body = await readJsonBody<{ content?: string }>(req, 260 * 1024);
          const content = String(body.content || '');
          try {
            const actor = `${ctx.displayName} (${session.userId})`;
            const result = MusicResolver.updateCookies(content, actor);
            sendJson(res, 200, {
              ok: true,
              status: {
                hasCookies: result.hasCookies,
                source: result.source,
                updatedAt: result.updatedAt,
                lineCount: result.lineCount,
              },
              keptCount: result.keptCount,
              strippedCount: result.strippedCount,
            });
          } catch (err: any) {
            sendJson(res, 400, {
              error: redactSensitiveText(err?.message || 'Некорректный формат cookies.txt.'),
            });
          }
          return;
        }

        if (pathname === '/api/admin/cookies/reload' && method === 'POST') {
          const allowed = await canManageGlobalCookies(discordClient, activeGuildId, session.userId);
          if (!allowed) {
            sendJson(res, 403, { error: 'Доступ запрещён: требуется роль Администратора сервера.' });
            return;
          }
          if (!rateLimiter.check(`cookies:${session.userId}`, 10, 60_000)) {
            sendJson(res, 429, { error: 'Слишком частые запросы обновления cookies.' });
            return;
          }
          try {
            const actor = `${ctx.displayName} (${session.userId})`;
            const status = MusicResolver.reloadCookiesFromDisk(actor);
            sendJson(res, 200, { ok: true, status });
          } catch (err: any) {
            sendJson(res, 400, {
              error: redactSensitiveText(err?.message || 'Не удалось перечитать cookies.txt с диска.'),
            });
          }
          return;
        }

        if (pathname === '/api/admin/cookies' && method === 'DELETE') {
          const allowed = await canManageGlobalCookies(discordClient, activeGuildId, session.userId);
          if (!allowed) {
            sendJson(res, 403, { error: 'Доступ запрещён: требуется роль Администратора сервера.' });
            return;
          }
          if (!rateLimiter.check(`cookies:${session.userId}`, 10, 60_000)) {
            sendJson(res, 429, { error: 'Слишком частые запросы управления cookies.' });
            return;
          }
          const actor = `${ctx.displayName} (${session.userId})`;
          const status = MusicResolver.clearCookies(actor);
          sendJson(res, 200, { ok: true, status });
          return;
        }

        // ---- Присутствие на вкладке «Просмотр вместе» (только для своего голосового канала) ----
        if (pathname === '/api/watch/presence' && method === 'POST') {
          if (!rateLimiter.check(`watch:${session.userId}`, 60, 60_000)) {
            sendJson(res, 429, { error: 'Слишком частые запросы статуса просмотра.' });
            return;
          }
          const body = await readJsonBody<{ active?: boolean }>(req);
          const active = Boolean(body.active);

          if (!active || !ctx.voice.inVoice || !ctx.voice.channelId) {
            const removed = watchSessions.delete(session.token);
            if (removed) {
              workerPool.events.emit('stateChanged');
            }
            sendJson(res, 200, { ok: true, active: false });
            return;
          }

          const prev = watchSessions.get(session.token);
          const nextEntry: WatchPresenceEntry = {
            sessionToken: session.token,
            userId: session.userId,
            displayName: ctx.displayName,
            avatarUrl: ctx.avatarUrl,
            guildId: activeGuildId,
            channelId: ctx.voice.channelId,
            updatedAt: Date.now(),
          };
          watchSessions.set(session.token, nextEntry);

          if (
            !prev ||
            prev.channelId !== nextEntry.channelId ||
            prev.guildId !== nextEntry.guildId
          ) {
            workerPool.events.emit('stateChanged');
          }
          sendJson(res, 200, { ok: true, active: true });
          return;
        }

        // ---- Постепенный поиск треков и плейлистов (NDJSON-стрим) ----
        if (pathname === '/api/player/search' && method === 'GET') {
          if (!rateLimiter.check(`search:${session.userId}`, 30, 60_000)) {
            sendJson(res, 429, { error: 'Слишком частые запросы поиска. Подождите немного.' });
            return;
          }
          const rawQuery = (url.searchParams.get('q') || '').trim();
          if (!rawQuery || rawQuery.length > 200 || /[\0\r\n]/.test(rawQuery)) {
            sendJson(res, 400, { error: 'Некорректный поисковый запрос.' });
            return;
          }
          const rawPlatform = (url.searchParams.get('platform') || 'auto').toLowerCase();
          const platform: PlatformOption = ['auto', 'youtube', 'soundcloud', 'spotify'].includes(
            rawPlatform
          )
            ? (rawPlatform as PlatformOption)
            : 'auto';
          const page = Math.max(1, Math.min(5, Number(url.searchParams.get('page')) || 1));

          res.writeHead(200, {
            'Content-Type': 'application/x-ndjson; charset=utf-8',
            'Cache-Control': 'no-store',
            'X-Accel-Buffering': 'no',
          });

          const abortController = new AbortController();
          req.on('close', () => {
            abortController.abort();
          });

          try {
            await MusicResolver.searchStream(
              rawQuery,
              platform,
              page,
              {
                onItem: (item) => {
                  if (!res.writableEnded && !abortController.signal.aborted) {
                    res.write(`${JSON.stringify({ type: 'item', item })}\n`);
                  }
                },
                onComplete: (hasNextPage) => {
                  if (!res.writableEnded && !abortController.signal.aborted) {
                    res.write(`${JSON.stringify({ type: 'done', hasNextPage })}\n`);
                  }
                },
              },
              abortController.signal
            );
          } catch (err: any) {
            if (!res.writableEnded && !abortController.signal.aborted) {
              res.write(
                `${JSON.stringify({
                  type: 'error',
                  error: redactSensitiveText(err?.message || 'Ошибка поиска.'),
                })}\n`
              );
            }
          } finally {
            if (!res.writableEnded) {
              res.end();
            }
          }
          return;
        }

        // ---- Личные сохранённые плейлисты (просмотр и удаление доступны даже вне войса) ----
        if (pathname === '/api/playlists' && method === 'GET') {
          const playlists = await PlaylistService.listUserPlaylists(session.userId);
          sendJson(res, 200, { playlists });
          return;
        }

        const deletePlaylistMatch = pathname.match(/^\/api\/playlists\/(\d+)$/);
        if (deletePlaylistMatch && method === 'DELETE') {
          const id = Number(deletePlaylistMatch[1]);
          const deleted = await PlaylistService.deletePlaylist(session.userId, id);
          if (!deleted) {
            sendJson(res, 404, { error: 'Плейлист не найден.' });
            return;
          }
          workerPool.events.emit('playlistsChanged', session.userId);
          sendJson(res, 200, { ok: true, deleted });
          return;
        }

        // ---- Саундборд ----
        if (pathname === '/api/soundboard/custom' && method === 'GET') {
          const list = await SoundboardService.listCustomSounds(activeGuildId);
          sendJson(res, 200, { sounds: list });
          return;
        }

        if (pathname === '/api/soundboard/memes' && method === 'GET') {
          const q = (url.searchParams.get('q') || '').trim();
          const region = url.searchParams.get('region') === 'us' ? 'us' : 'ru';
          const items = q
            ? await MyInstantsClient.search(q, 24)
            : await MyInstantsClient.getTrending(region, 24);
          sendJson(res, 200, { memes: items });
          return;
        }

        if (pathname === '/api/soundboard/upload' && method === 'POST') {
          if (!rateLimiter.check(`upload:${session.userId}`, 15, 60_000)) {
            sendJson(res, 429, { error: 'Слишком частая загрузка файлов. Подождите минуту.' });
            return;
          }
          const body = await readJsonBody<{
            name?: string;
            filename?: string;
            dataBase64?: string;
            color?: string;
            emoji?: string;
          }>(req, 15 * 1024 * 1024);

          if (!body.name || !body.dataBase64) {
            sendJson(res, 400, { error: 'Укажите название звука и выберите аудиофайл.' });
            return;
          }

          const rawBase64 = body.dataBase64.includes(',')
            ? body.dataBase64.split(',')[1]
            : body.dataBase64;
          const buffer = Buffer.from(rawBase64, 'base64');

          try {
            const saved = await SoundboardService.saveCustomSound({
              guildId: activeGuildId,
              name: body.name,
              buffer,
              originalFilename: body.filename || 'sound.mp3',
              color: body.color,
              emoji: body.emoji,
              uploadedById: session.userId,
              uploadedByTag: ctx.displayName,
            });

            workerPool.events.emit('soundsChanged');
            sendJson(res, 201, { sound: saved });
          } catch (err: any) {
            sendJson(res, 400, { error: redactSensitiveText(err?.message || 'Ошибка загрузки звука.') });
          }
          return;
        }

        if (pathname === '/api/soundboard/save-meme' && method === 'POST') {
          if (!rateLimiter.check(`upload:${session.userId}`, 15, 60_000)) {
            sendJson(res, 429, { error: 'Слишком частое сохранение мемов. Подождите минуту.' });
            return;
          }
          const body = await readJsonBody<{
            name?: string;
            url?: string;
            color?: string;
            emoji?: string;
          }>(req);

          if (!body.name || !body.url) {
            sendJson(res, 400, { error: 'Не указано имя или ссылка на мем-звук.' });
            return;
          }

          try {
            const saved = await SoundboardService.saveSoundFromUrl({
              guildId: activeGuildId,
              name: body.name,
              url: body.url,
              color: body.color,
              emoji: body.emoji || '😂',
              uploadedById: session.userId,
              uploadedByTag: ctx.displayName,
            });

            workerPool.events.emit('soundsChanged');
            sendJson(res, 201, { sound: saved });
          } catch (err: any) {
            sendJson(res, 400, { error: redactSensitiveText(err?.message || 'Ошибка сохранения мема.') });
          }
          return;
        }

        const deleteSoundMatch = pathname.match(/^\/api\/soundboard\/custom\/(\d+)$/);
        if (deleteSoundMatch && method === 'DELETE') {
          const id = Number(deleteSoundMatch[1]);
          const deleted = await SoundboardService.deleteCustomSound(activeGuildId, id);
          if (!deleted) {
            sendJson(res, 404, { error: 'Звук не найден.' });
            return;
          }
          workerPool.events.emit('soundsChanged');
          sendJson(res, 200, { ok: true, deleted });
          return;
        }

        const soundFileMatch = pathname.match(/^\/api\/soundboard\/file\/(\d+)$/);
        if (soundFileMatch && method === 'GET') {
          const id = Number(soundFileMatch[1]);
          const record = await SoundboardService.getCustomSoundById(activeGuildId, id);
          if (!record) {
            sendJson(res, 404, { error: 'Звук не найден.' });
            return;
          }
          const filePath = SoundboardService.getSoundFilePath(record);
          if (!fs.existsSync(filePath)) {
            sendJson(res, 404, { error: 'Файл не найден на диске.' });
            return;
          }
          const lstat = fs.lstatSync(filePath);
          const realFile = fs.realpathSync(filePath);
          const realSoundsRoot = fs.realpathSync(soundsDir);
          if (lstat.isSymbolicLink() || !lstat.isFile() || !realFile.startsWith(realSoundsRoot + path.sep)) {
            sendJson(res, 403, { error: 'Доступ к файлу запрещён.' });
            return;
          }
          // Изолированный аудио-ответ: только безопасный audio/* MIME + sandbox CSP (полная защита от Stored XSS!)
          applySecurityHeaders(res, { isSandboxedMedia: true });
          res.writeHead(200, {
            'Content-Type': getSafeAudioMimeType(record.filename),
            'Cache-Control': 'private, no-store',
          });
          fs.createReadStream(realFile).pipe(res);
          return;
        }

        // ====================================================
        // 3. Управление ботом и очередью — ТОЛЬКО если человек в голосовом канале!
        // ====================================================
        if (!ctx.voice.inVoice || !ctx.voice.channelId) {
          sendJson(res, 403, {
            error:
              'Вы не находитесь в голосовом канале! Зайдите в любой голосовой канал на сервере, чтобы вызывать агента и управлять очередью.',
          });
          return;
        }

        const userChannelId = ctx.voice.channelId;

        if (pathname === '/api/worker/summon' && method === 'POST') {
          try {
            const worker = await workerPool.ensureWorkerInChannel(userChannelId, activeGuildId);
            sendJson(res, 200, {
              ok: true,
              workerId: worker.id,
              message: `Воркер #${worker.id} подключён к каналу ${ctx.voice.channelName}`,
            });
          } catch (err: any) {
            sendJson(res, 409, { error: err.message });
          }
          return;
        }

        if (pathname === '/api/worker/leave' && method === 'POST') {
          const worker = workerPool.getWorkerForChannel(userChannelId);
          if (!worker) {
            sendJson(res, 404, { error: 'В вашем канале нет активного агента.' });
            return;
          }
          worker.queue.stop();
          workerPool.emitActivity({
            guildId: activeGuildId,
            channelId: userChannelId,
            action: 'leave',
            actorId: session.userId,
            actorName: ctx.displayName,
          });
          sendJson(res, 200, { ok: true });
          return;
        }

        if (pathname === '/api/player/play' && method === 'POST') {
          const body = await readJsonBody<{ query?: string; platform?: PlatformOption }>(req);
          const query = (body.query || '').trim();
          const platform: PlatformOption =
            body.platform && ['auto', 'youtube', 'soundcloud', 'spotify'].includes(body.platform)
              ? body.platform
              : 'auto';

          if (!query) {
            sendJson(res, 400, { error: 'Введите название трека или вставьте ссылку.' });
            return;
          }

          let worker;
          try {
            worker = await workerPool.ensureWorkerInChannel(userChannelId, activeGuildId);
          } catch (err: any) {
            sendJson(res, 409, { error: err.message });
            return;
          }

          try {
            const tracks = await MusicResolver.resolve(
              query,
              { id: session.userId, tag: ctx.displayName },
              platform
            );
            if (tracks.length === 0) {
              sendJson(res, 404, { error: 'Ничего не найдено по вашему запросу.' });
              return;
            }

            const result = await worker.queue.add(tracks);
            sendJson(res, 200, {
              ok: true,
              addedCount: result.addedCount,
              isPlayingNow: result.isPlayingNow,
              track: tracks[0],
            });
          } catch (err: any) {
            sendJson(res, 400, {
              error: redactSensitiveText(err?.message || 'Не удалось воспроизвести трек.'),
            });
          }
          return;
        }

        if (pathname === '/api/soundboard/play' && method === 'POST') {
          const body = await readJsonBody<{
            type?: 'custom' | 'url';
            id?: number;
            url?: string;
            name?: string;
          }>(req);

          let worker;
          try {
            worker = await workerPool.ensureWorkerInChannel(userChannelId, activeGuildId);
          } catch (err: any) {
            sendJson(res, 409, { error: err.message });
            return;
          }

          if (body.type === 'custom' && body.id) {
            const soundId = Number(body.id);
            const record = await SoundboardService.getCustomSoundById(activeGuildId, soundId);
            if (!record) {
              sendJson(res, 404, { error: 'Звук не найден.' });
              return;
            }
            const dedupeKey = `${userChannelId}:${session.userId}:custom:${soundId}`;
            if (isDuplicateSfxRequest(dedupeKey)) {
              sendJson(res, 200, { ok: true, played: record.name, deduplicated: true });
              return;
            }
            try {
              await worker.queue.playSoundEffect({
                name: record.name,
                filePath: SoundboardService.getSoundFilePath(record),
              });
              workerPool.emitActivity({
                guildId: activeGuildId,
                channelId: userChannelId,
                action: 'sfx',
                actorId: session.userId,
                actorName: ctx.displayName,
                detail: record.name,
              });
              sendJson(res, 200, { ok: true, played: record.name });
            } catch (err: any) {
              sendJson(res, 400, {
                error: redactSensitiveText(err?.message || 'Не удалось воспроизвести звук.'),
              });
            }
            return;
          }

          if (body.type === 'url' && body.url) {
            // Строго разрешаем только проверенные HTTPS аудиоссылки MyInstants (блокирует SSRF и FFmpeg file://!)
            try {
              const safeMemeUrl = await assertTrustedMyInstantsAudioUrl(body.url);
              const safeName = String(body.name || 'Мем').slice(0, 80);
              const dedupeKey = `${userChannelId}:${session.userId}:url:${safeMemeUrl.toString()}`;
              if (isDuplicateSfxRequest(dedupeKey)) {
                sendJson(res, 200, { ok: true, played: safeName, deduplicated: true });
                return;
              }
              await worker.queue.playSoundEffect({
                name: safeName,
                url: safeMemeUrl.toString(),
              });
              workerPool.emitActivity({
                guildId: activeGuildId,
                channelId: userChannelId,
                action: 'sfx',
                actorId: session.userId,
                actorName: ctx.displayName,
                detail: safeName,
              });
              sendJson(res, 200, { ok: true, played: safeName });
            } catch (err: any) {
              sendJson(res, 400, {
                error: redactSensitiveText(err?.message || 'Разрешены только звуки с MyInstants.'),
              });
            }
            return;
          }

          sendJson(res, 400, { error: 'Неверные параметры воспроизведения звука.' });
          return;
        }

        if (pathname === '/api/playlists/load' && method === 'POST') {
          const body = await readJsonBody<{ id?: number }>(req);
          const id = Number(body.id);
          if (!Number.isFinite(id)) {
            sendJson(res, 400, { error: 'Укажите корректный ID плейлиста.' });
            return;
          }

          const playlist = await PlaylistService.getUserPlaylistById(session.userId, id);
          if (!playlist) {
            sendJson(res, 404, { error: 'Плейлист не найден.' });
            return;
          }
          if (playlist.tracks.length === 0) {
            sendJson(res, 400, { error: 'Плейлист пуст.' });
            return;
          }

          let worker;
          try {
            worker = await workerPool.ensureWorkerInChannel(userChannelId, activeGuildId);
          } catch (err: any) {
            sendJson(res, 409, { error: err.message });
            return;
          }

          const tracks = PlaylistService.buildPlayableTracks(playlist, {
            id: session.userId,
            tag: ctx.displayName,
          });
          try {
            const result = await worker.queue.add(tracks);
            sendJson(res, 200, {
              ok: true,
              playlistName: playlist.name,
              loadedCount: result.addedCount,
              isPlayingNow: result.isPlayingNow,
              firstTrack: tracks[0],
            });
          } catch (err: any) {
            sendJson(res, 400, {
              error: redactSensitiveText(err?.message || 'Не удалось загрузить плейлист.'),
            });
          }
          return;
        }

        const worker = workerPool.getWorkerForChannel(userChannelId);
        if (!worker) {
          sendJson(res, 404, {
            error: 'В вашем голосовом канале сейчас нет агента. Сначала вызовите агента или включите трек.',
          });
          return;
        }

        if (pathname === '/api/playlists/save' && method === 'POST') {
          const body = await readJsonBody<{ name?: string }>(req);
          const name = String(body.name || '').trim();
          if (!name) {
            sendJson(res, 400, { error: 'Введите название плейлиста.' });
            return;
          }
          if (!worker.queue.currentTrack && worker.queue.tracks.length === 0) {
            sendJson(res, 400, { error: 'Очередь пуста — нечего сохранять.' });
            return;
          }
          try {
            const saved = await PlaylistService.savePlaylist({
              userId: session.userId,
              name,
              currentTrack: worker.queue.currentTrack,
              upcomingTracks: worker.queue.tracks,
            });
            workerPool.events.emit('playlistsChanged', session.userId);
            sendJson(res, 201, {
              ok: true,
              playlist: saved.playlist,
              overwritten: saved.overwritten,
            });
          } catch (err: any) {
            sendJson(res, 400, { error: err?.message || 'Не удалось сохранить плейлист.' });
          }
          return;
        }

        if (pathname === '/api/player/pause' && method === 'POST') {
          if (worker.queue.pause()) {
            workerPool.emitActivity({
              guildId: activeGuildId,
              channelId: userChannelId,
              action: 'pause',
              actorId: session.userId,
              actorName: ctx.displayName,
            });
          }
          sendJson(res, 200, { ok: true });
          return;
        }

        if (pathname === '/api/player/resume' && method === 'POST') {
          if (worker.queue.resume()) {
            workerPool.emitActivity({
              guildId: activeGuildId,
              channelId: userChannelId,
              action: 'resume',
              actorId: session.userId,
              actorName: ctx.displayName,
            });
          }
          sendJson(res, 200, { ok: true });
          return;
        }

        if (pathname === '/api/player/skip' && method === 'POST') {
          const body = await readJsonBody<{ count?: number }>(req);
          const count = Math.max(1, Number(body.count) || 1);
          const skipped = worker.queue.skip(count);
          if (skipped) {
            workerPool.emitActivity({
              guildId: activeGuildId,
              channelId: userChannelId,
              action: 'skip',
              actorId: session.userId,
              actorName: ctx.displayName,
              detail: skipped.title,
              count,
            });
          }
          sendJson(res, 200, { ok: true });
          return;
        }

        if (pathname === '/api/player/stop' && method === 'POST') {
          worker.queue.stop();
          workerPool.emitActivity({
            guildId: activeGuildId,
            channelId: userChannelId,
            action: 'stop',
            actorId: session.userId,
            actorName: ctx.displayName,
          });
          sendJson(res, 200, { ok: true });
          return;
        }

        if (pathname === '/api/player/shuffle' && method === 'POST') {
          const count = worker.queue.shuffle();
          if (count > 1) {
            workerPool.emitActivity({
              guildId: activeGuildId,
              channelId: userChannelId,
              action: 'shuffle',
              actorId: session.userId,
              actorName: ctx.displayName,
            });
          }
          sendJson(res, 200, { ok: true });
          return;
        }

        if (pathname === '/api/player/volume' && method === 'POST') {
          const body = await readJsonBody<{ volume?: number }>(req);
          const vol = Number(body.volume);
          if (!Number.isFinite(vol)) {
            sendJson(res, 400, { error: 'Укажите громкость от 1 до 100.' });
            return;
          }
          const updated = worker.queue.setVolume(vol);
          sendJson(res, 200, { ok: true, volume: updated });
          return;
        }

        if (pathname === '/api/player/loop' && method === 'POST') {
          const body = await readJsonBody<{ mode?: 'off' | 'track' | 'queue' }>(req);
          if (!body.mode || !['off', 'track', 'queue'].includes(body.mode)) {
            sendJson(res, 400, { error: 'Некорректный режим loop.' });
            return;
          }
          worker.queue.setLoop(body.mode);
          workerPool.emitActivity({
            guildId: activeGuildId,
            channelId: userChannelId,
            action: 'loop',
            actorId: session.userId,
            actorName: ctx.displayName,
            detail: body.mode,
          });
          sendJson(res, 200, { ok: true, mode: body.mode });
          return;
        }

        if (pathname === '/api/queue/remove' && method === 'POST') {
          const body = await readJsonBody<{ index?: number }>(req);
          const removed = worker.queue.removeAt(Number(body.index));
          if (!removed) {
            sendJson(res, 404, { error: 'Трек с таким индексом не найден.' });
            return;
          }
          workerPool.emitActivity({
            guildId: activeGuildId,
            channelId: userChannelId,
            action: 'remove_track',
            actorId: session.userId,
            actorName: ctx.displayName,
            detail: removed.title,
          });
          sendJson(res, 200, { ok: true, removed });
          return;
        }

        if (pathname === '/api/queue/move' && method === 'POST') {
          const body = await readJsonBody<{ from?: number; to?: number }>(req);
          const moved = worker.queue.move(Number(body.from), Number(body.to));
          sendJson(res, moved ? 200 : 400, { ok: moved });
          return;
        }

        if (pathname === '/api/queue/clear' && method === 'POST') {
          const cleared = worker.queue.clearUpcoming();
          if (cleared > 0) {
            workerPool.emitActivity({
              guildId: activeGuildId,
              channelId: userChannelId,
              action: 'clear_queue',
              actorId: session.userId,
              actorName: ctx.displayName,
              count: cleared,
            });
          }
          sendJson(res, 200, { ok: true, cleared });
          return;
        }

        sendJson(res, 404, { error: 'API endpoint не найден.' });
        return;
      }

      // ====================================================
      // 4. Раздача статических файлов веб-приложения (строгий белый список — Path Traversal невозможен!)
      // ====================================================
      if (method !== 'GET' && method !== 'HEAD') {
        res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Method Not Allowed');
        return;
      }

      const resolvedStatic = resolveStaticAsset(pathname);
      if (!resolvedStatic || !fs.existsSync(resolvedStatic.filePath)) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Not Found');
        return;
      }

      const lstat = fs.lstatSync(resolvedStatic.filePath);
      const realFile = fs.realpathSync(resolvedStatic.filePath);
      const realPublicRoot = fs.realpathSync(publicDir);
      if (lstat.isSymbolicLink() || !lstat.isFile() || !realFile.startsWith(realPublicRoot + path.sep)) {
        res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Forbidden');
        return;
      }

      res.writeHead(200, {
        'Content-Type': resolvedStatic.contentType,
        'Cache-Control': resolvedStatic.cacheControl,
      });
      if (method === 'HEAD') {
        res.end();
        return;
      }
      fs.createReadStream(realFile).pipe(res);
    } catch (err: any) {
      console.error('❌ [WebServer] Ошибка обработки запроса:', err);
      if (!res.headersSent) {
        // Не раскрываем внутренние пути, стек или детали исключений клиенту
        sendJson(res, 500, { error: 'Внутренняя ошибка сервера.' });
      }
    }
  });

  server.listen(config.port, config.host, () => {
    console.log(`🌐 Веб-панель запущена: ${config.publicUrl} (слушает ${config.host}:${config.port})`);
  });

  return server;
}
