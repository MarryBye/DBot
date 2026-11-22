import { Client as YtdlClient, Ytdl, chooseFormat } from '@distube/ytdl-core';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import { dataDir } from '../db/index.js';
import {
  spawnPcmDecoder,
  spawnPcmDecoderFromUrl,
  verifyPcmStream,
  type PcmDecoderHandle,
} from './ffmpeg.js';

export type PlatformOption = 'auto' | 'youtube' | 'soundcloud' | 'spotify';

export interface Track {
  uid: string;
  id: string;
  title: string;
  author: string;
  url: string;
  originalUrl: string;
  searchQuery?: string;
  durationSec: number;
  durationFormatted: string;
  thumbnail: string | null;
  source: 'youtube' | 'spotify' | 'soundcloud';
  streamKind: 'youtube' | 'soundcloud-direct';
  soundcloudTranscodingUrl?: string;
  soundcloudProtocol?: 'progressive' | 'hls';
  requestedBy: {
    id: string;
    tag: string;
  };
}

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function parsePlatformFromPrefixArgs(args: string[]): {
  platform: PlatformOption;
  query: string;
} {
  if (args.length === 0) return { platform: 'auto', query: '' };

  const first = args[0].toLowerCase();

  const prefixMatch = first.match(/^(yt|youtube|sc|soundcloud|sp|spotify):(.*)$/);
  if (prefixMatch) {
    const platKey = prefixMatch[1];
    const restFirst = prefixMatch[2];
    const query = [restFirst, ...args.slice(1)].join(' ').trim();
    const platform: PlatformOption =
      platKey.startsWith('yt') || platKey === 'youtube'
        ? 'youtube'
        : platKey.startsWith('sc') || platKey === 'soundcloud'
          ? 'soundcloud'
          : 'spotify';
    return { platform, query };
  }

  if (args.length >= 2) {
    if (first === 'yt' || first === 'youtube') {
      return { platform: 'youtube', query: args.slice(1).join(' ').trim() };
    }
    if (first === 'sc' || first === 'soundcloud') {
      return { platform: 'soundcloud', query: args.slice(1).join(' ').trim() };
    }
    if (first === 'sp' || first === 'spotify') {
      return { platform: 'spotify', query: args.slice(1).join(' ').trim() };
    }
  }

  return { platform: 'auto', query: args.join(' ').trim() };
}

function makeUid(): string {
  return crypto.randomBytes(6).toString('hex');
}

function cleanTrackQueryForFallback(title: string, author?: string): string {
  const cleanedTitle = title
    .replace(/\((?:official\s*(?:music\s*)?video|official\s*audio|lyric\s*video|lyrics|4k\s*remaster|hd|hq|mv|visualizer|audio)[^)]*\)/gi, '')
    .replace(/\[(?:official\s*(?:music\s*)?video|official\s*audio|lyric\s*video|lyrics|4k|hd|hq|mv|audio)[^\]]*\]/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (
    author &&
    author !== 'YouTube' &&
    author !== 'Spotify' &&
    author !== 'SoundCloud' &&
    !cleanedTitle.toLowerCase().includes(author.toLowerCase())
  ) {
    return `${author} ${cleanedTitle}`.trim();
  }
  return cleanedTitle || title;
}

const COOKIE_FILE_PATH = path.join(dataDir, 'cookies.txt');

export interface YouTubeCookiesStatus {
  hasCookies: boolean;
  source: 'file' | 'env' | 'none';
  updatedAt: string | null;
  lineCount: number;
}

function loadYouTubeCookie(): { cookie?: string; source: 'file' | 'env' | 'none' } {
  if (fs.existsSync(COOKIE_FILE_PATH)) {
    const content = fs.readFileSync(COOKIE_FILE_PATH, 'utf-8').replace(/\r\n/g, '\n').trim();
    if (content.length > 20) {
      console.log('🍪 [YouTube] Загружены cookies из data/cookies.txt');
      return { cookie: content, source: 'file' };
    }
  }

  if (config.ytCookie && config.ytCookie.trim().length > 10) {
    console.log('🍪 [YouTube] Загружены cookies из YT_COOKIE (.env)');
    return { cookie: config.ytCookie.trim(), source: 'env' };
  }

  return { cookie: undefined, source: 'none' };
}

function createYtdlInstance(cookie?: string): Ytdl {
  // При наличии cookies ставим лёгкие клиенты с поддержкой cookies (Tv, WebEmbedded) первыми,
  // избегая тяжёлых PO-token BotGuard потоков на слабом CPU (Oracle E2.1.Micro)!
  return new Ytdl({
    ...(cookie ? { cookie } : {}),
    clients: cookie
      ? [YtdlClient.Tv, YtdlClient.WebEmbedded, YtdlClient.VisionOS, YtdlClient.Mweb]
      : [YtdlClient.VisionOS, YtdlClient.WebEmbedded, YtdlClient.Tv],
    timeoutMs: 12_000,
  });
}

let activeCookieSource: 'file' | 'env' | 'none' = 'none';
let ytdl: Ytdl;
try {
  const initialLoaded = loadYouTubeCookie();
  ytdl = createYtdlInstance(initialLoaded.cookie);
  activeCookieSource = initialLoaded.source;
} catch (err: any) {
  console.warn(
    '⚠️ [YouTube] Не удалось применить сохранённые cookies при старте (запускаюсь без них):',
    err?.message || err
  );
  ytdl = createYtdlInstance(undefined);
  activeCookieSource = 'none';
}

// ========================================================
// Внутренний клиент SoundCloud API v2 (без сторонних пакетов)
// ========================================================
class SoundCloudClient {
  private static clientId: string | null = null;
  private static fetchedAt = 0;

  public static async getClientId(forceRefresh = false): Promise<string> {
    const now = Date.now();
    if (!forceRefresh && this.clientId && now - this.fetchedAt < 6 * 3600 * 1000) {
      return this.clientId;
    }

    const res = await fetch('https://soundcloud.com/', {
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    if (!res.ok) throw new Error(`SoundCloud homepage returned ${res.status}`);
    const html = await res.text();
    const scripts = [...html.matchAll(/src="(https:\/\/a-v2\.sndcdn\.com\/assets\/[^"]+\.js)"/g)].map(
      (m) => m[1]
    );

    for (const scriptUrl of scripts.slice(-5).reverse()) {
      const jsRes = await fetch(scriptUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      if (!jsRes.ok) continue;
      const js = await jsRes.text();
      const match = js.match(/client_id:"([a-zA-Z0-9]+)"/);
      if (match) {
        this.clientId = match[1];
        this.fetchedAt = now;
        return this.clientId;
      }
    }

    throw new Error('Не удалось получить client_id SoundCloud');
  }

  private static async apiGet(endpoint: string): Promise<any> {
    let clientId = await this.getClientId();
    const sep = endpoint.includes('?') ? '&' : '?';
    let res = await fetch(`${endpoint}${sep}client_id=${clientId}`, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });

    if (res.status === 401 || res.status === 403) {
      clientId = await this.getClientId(true);
      res = await fetch(`${endpoint}${sep}client_id=${clientId}`, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
      });
    }

    if (!res.ok) {
      throw new Error(`SoundCloud API вернул ${res.status}`);
    }
    return res.json();
  }

  public static async searchTracks(query: string, limit = 8): Promise<any[]> {
    const data = await this.apiGet(
      `https://api-v2.soundcloud.com/search/tracks?q=${encodeURIComponent(query)}&limit=${limit}`
    );
    return Array.isArray(data?.collection) ? data.collection : [];
  }

  public static async resolveUrl(url: string): Promise<any> {
    return this.apiGet(
      `https://api-v2.soundcloud.com/resolve?url=${encodeURIComponent(url)}`
    );
  }

  public static async fetchMediaStreamUrl(transcodingUrl: string): Promise<string> {
    const data = await this.apiGet(transcodingUrl);
    if (!data?.url) throw new Error('SoundCloud не вернул ссылку на аудиопоток');
    return data.url;
  }

  public static pickPlayableTranscoding(raw: any): {
    url: string;
    protocol: 'progressive' | 'hls';
  } | null {
    const isSnipOnly = raw.policy === 'SNIP' || raw.monetization_model === 'SUB_HIGH_TIER';
    if (isSnipOnly) return null;

    const transcodings: any[] = Array.isArray(raw.media?.transcodings)
      ? raw.media.transcodings
      : [];

    const progressive = transcodings.find(
      (t) => t?.format?.protocol === 'progressive' && !t?.snipped
    );
    const hls = transcodings.find((t) => t?.format?.protocol === 'hls' && !t?.snipped);
    const chosen = progressive ?? hls;
    if (!chosen?.url) return null;

    return {
      url: chosen.url,
      protocol: chosen.format?.protocol === 'progressive' ? 'progressive' : 'hls',
    };
  }

  public static mapRawTrack(
    raw: any,
    requestedBy: { id: string; tag: string }
  ): Track {
    const title = raw.title || 'SoundCloud Track';
    const author = raw.user?.username || 'SoundCloud';
    const durationSec = Math.round((raw.duration ?? 0) / 1000);
    const artwork = raw.artwork_url
      ? String(raw.artwork_url).replace('-large.', '-t500x500.')
      : raw.user?.avatar_url ?? null;

    const chosen = this.pickPlayableTranscoding(raw);

    return {
      uid: makeUid(),
      id: String(raw.id ?? raw.permalink_url),
      title,
      author,
      url: chosen ? raw.permalink_url : '',
      originalUrl: raw.permalink_url || 'https://soundcloud.com',
      searchQuery: `${author} - ${title}`,
      durationSec,
      durationFormatted: formatDuration(durationSec),
      thumbnail: artwork,
      source: 'soundcloud',
      streamKind: chosen ? 'soundcloud-direct' : 'youtube',
      soundcloudTranscodingUrl: chosen?.url,
      soundcloudProtocol: chosen?.protocol,
      requestedBy,
    };
  }

  public static async findDirectStreamForQuery(query: string): Promise<string | null> {
    const candidates = await this.searchTracks(query, 8);
    for (const raw of candidates) {
      const picked = this.pickPlayableTranscoding(raw);
      if (picked) {
        return this.fetchMediaStreamUrl(picked.url);
      }
    }
    for (const raw of candidates) {
      const t = raw?.media?.transcodings?.[0];
      if (t?.url) {
        return this.fetchMediaStreamUrl(t.url);
      }
    }
    return null;
  }
}

// ========================================================
// Вспомогательный клиент Spotify (опциональный OAuth + публичный embed)
// ========================================================
class SpotifyClient {
  private static accessToken: string | null = null;
  private static expiresAt = 0;

  private static async getAppToken(): Promise<string | null> {
    if (!config.spotifyClientId || !config.spotifyClientSecret) return null;
    if (this.accessToken && Date.now() < this.expiresAt - 60_000) {
      return this.accessToken;
    }

    const creds = Buffer.from(
      `${config.spotifyClientId}:${config.spotifyClientSecret}`
    ).toString('base64');

    const res = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${creds}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    });

    if (!res.ok) return null;
    const data = (await res.json()) as { access_token: string; expires_in: number };
    this.accessToken = data.access_token;
    this.expiresAt = Date.now() + data.expires_in * 1000;
    return this.accessToken;
  }

  public static async searchTrackByName(
    query: string,
    requestedBy: { id: string; tag: string }
  ): Promise<Track | null> {
    const token = await this.getAppToken();
    if (token) {
      const res = await fetch(
        `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=1`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.ok) {
        const json = (await res.json()) as any;
        const item = json?.tracks?.items?.[0];
        if (item) {
          const artists = (item.artists ?? []).map((a: any) => a.name).join(', ') || 'Spotify';
          const durationSec = Math.round((item.duration_ms ?? 0) / 1000);
          return {
            uid: makeUid(),
            id: item.id,
            title: item.name,
            author: artists,
            url: '',
            originalUrl: item.external_urls?.spotify ?? 'https://open.spotify.com',
            searchQuery: `${artists} - ${item.name}`,
            durationSec,
            durationFormatted: formatDuration(durationSec),
            thumbnail: item.album?.images?.[0]?.url ?? null,
            source: 'spotify',
            streamKind: 'youtube',
            requestedBy,
          };
        }
      }
    }

    try {
      const dzRes = await fetch(
        `https://api.deezer.com/search?q=${encodeURIComponent(query)}&limit=1`
      );
      if (dzRes.ok) {
        const dz = (await dzRes.json()) as any;
        const item = dz?.data?.[0];
        if (item) {
          const artist = item.artist?.name ?? 'Artist';
          const title = item.title ?? query;
          const durationSec = Number(item.duration ?? 0);
          return {
            uid: makeUid(),
            id: String(item.id),
            title,
            author: artist,
            url: '',
            originalUrl: item.link ?? 'https://open.spotify.com',
            searchQuery: `${artist} - ${title}`,
            durationSec,
            durationFormatted: formatDuration(durationSec),
            thumbnail: item.album?.cover_big ?? item.album?.cover_medium ?? null,
            source: 'spotify',
            streamKind: 'youtube',
            requestedBy,
          };
        }
      }
    } catch {
      // ignore
    }

    return null;
  }

  public static async resolveUrl(
    url: string,
    requestedBy: { id: string; tag: string }
  ): Promise<Track[]> {
    const match = url.match(/open\.spotify\.com\/(?:intl-[a-z-]+\/)?(track|album|playlist)\/([a-zA-Z0-9]+)/);

    if (match) {
      const [, entityType, entityId] = match;
      try {
        const embedRes = await fetch(
          `https://open.spotify.com/embed/${entityType}/${entityId}`,
          { headers: { 'User-Agent': 'Mozilla/5.0' } }
        );
        if (embedRes.ok) {
          const html = await embedRes.text();
          const nextDataMatch = html.match(
            /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/
          );
          if (nextDataMatch) {
            const json = JSON.parse(nextDataMatch[1]);
            const entity = json?.props?.pageProps?.state?.data?.entity;
            const cover =
              entity?.visualIdentity?.image?.[0]?.url ??
              entity?.coverArt?.sources?.[0]?.url ??
              null;

            if (entityType === 'track' && entity?.name) {
              const artists =
                (entity.artists ?? []).map((a: any) => a.name).join(', ') || 'Spotify';
              const durationSec = Math.round((entity.duration ?? 0) / 1000);
              return [
                {
                  uid: makeUid(),
                  id: entityId,
                  title: entity.name,
                  author: artists,
                  url: '',
                  originalUrl: url,
                  searchQuery: `${artists} - ${entity.name}`,
                  durationSec,
                  durationFormatted: formatDuration(durationSec),
                  thumbnail: cover,
                  source: 'spotify',
                  streamKind: 'youtube',
                  requestedBy,
                },
              ];
            }

            if (
              (entityType === 'playlist' || entityType === 'album') &&
              Array.isArray(entity?.trackList) &&
              entity.trackList.length > 0
            ) {
              return entity.trackList.slice(0, 50).map((item: any) => {
                const title = item.title || 'Unknown Track';
                const artist = (item.subtitle || 'Spotify').replace(/\u00a0/g, ' ');
                const durationSec = Math.round((item.duration ?? 0) / 1000);
                const trackId = String(item.uri || item.uid || makeUid()).replace('spotify:track:', '');
                return {
                  uid: makeUid(),
                  id: trackId,
                  title,
                  author: artist,
                  url: '',
                  originalUrl: trackId.length === 22 ? `https://open.spotify.com/track/${trackId}` : url,
                  searchQuery: `${artist} - ${title}`,
                  durationSec,
                  durationFormatted: formatDuration(durationSec),
                  thumbnail: cover,
                  source: 'spotify',
                  streamKind: 'youtube',
                  requestedBy,
                };
              });
            }
          }
        }
      } catch (err) {
        console.warn('⚠️ Spotify embed parser fallback to oEmbed:', err);
      }
    }

    const res = await fetch(
      `https://open.spotify.com/oembed?url=${encodeURIComponent(url)}`
    );
    if (!res.ok) {
      throw new Error(`Spotify вернул код ${res.status}`);
    }
    const data = (await res.json()) as { title: string; thumbnail_url?: string };

    return [
      {
        uid: makeUid(),
        id: makeUid(),
        title: data.title,
        author: 'Spotify',
        url: '',
        originalUrl: url,
        searchQuery: data.title,
        durationSec: 0,
        durationFormatted: '0:00',
        thumbnail: data.thumbnail_url ?? null,
        source: 'spotify',
        streamKind: 'youtube',
        requestedBy,
      },
    ];
  }
}

export class MusicResolver {
  public static getCookiesStatus(): YouTubeCookiesStatus {
    if (activeCookieSource === 'file' && fs.existsSync(COOKIE_FILE_PATH)) {
      const stat = fs.statSync(COOKIE_FILE_PATH);
      const raw = fs.readFileSync(COOKIE_FILE_PATH, 'utf-8');
      const lineCount = raw
        .split(/\r?\n/)
        .filter((l) => l.trim() && !l.trim().startsWith('#')).length;
      return {
        hasCookies: true,
        source: 'file',
        updatedAt: stat.mtime.toISOString(),
        lineCount,
      };
    }

    if (activeCookieSource === 'env' && config.ytCookie.trim().length > 10) {
      return {
        hasCookies: true,
        source: 'env',
        updatedAt: null,
        lineCount: 1,
      };
    }

    return {
      hasCookies: false,
      source: 'none',
      updatedAt: null,
      lineCount: 0,
    };
  }

  /**
   * Сохраняет новые YouTube cookies в data/cookies.txt и горячо пересоздаёт Ytdl-инстанс без перезапуска бота!
   */
  public static updateCookies(rawContent: string): YouTubeCookiesStatus {
    const normalized = rawContent.replace(/\r\n/g, '\n').trim();
    if (normalized.length < 20) {
      throw new Error('Файл cookies пустой или слишком короткий.');
    }

    // Сначала валидируем через Ytdl — если нет SAPISID / __Secure-3PAPISID, сразу вернёт понятную ошибку!
    const nextYtdl = createYtdlInstance(normalized);

    fs.writeFileSync(COOKIE_FILE_PATH, normalized + '\n', 'utf-8');
    ytdl = nextYtdl;
    activeCookieSource = 'file';
    console.log('🍪 [YouTube] Новые cookies сохранены и применены на лету (data/cookies.txt)');
    return this.getCookiesStatus();
  }

  /**
   * Перечитывает cookies с диска (data/cookies.txt или YT_COOKIE) и обновляет Ytdl на лету.
   */
  public static reloadCookiesFromDisk(): YouTubeCookiesStatus {
    const loaded = loadYouTubeCookie();
    ytdl = createYtdlInstance(loaded.cookie);
    activeCookieSource = loaded.source;
    console.log(`🔄 [YouTube] Cookies перечитаны (источник: ${activeCookieSource})`);
    return this.getCookiesStatus();
  }

  /**
   * Удаляет data/cookies.txt и сбрасывает Ytdl на работу без cookies.
   */
  public static clearCookies(): YouTubeCookiesStatus {
    if (fs.existsSync(COOKIE_FILE_PATH)) {
      fs.unlinkSync(COOKIE_FILE_PATH);
    }
    const fallbackEnv = config.ytCookie.trim().length > 10 ? config.ytCookie.trim() : undefined;
    ytdl = createYtdlInstance(fallbackEnv);
    activeCookieSource = fallbackEnv ? 'env' : 'none';
    console.log('🗑️ [YouTube] Файл data/cookies.txt удалён.');
    return this.getCookiesStatus();
  }

  public static async resolve(
    query: string,
    requestedBy: { id: string; tag: string },
    platform: PlatformOption = 'auto'
  ): Promise<Track[]> {
    const trimmed = query.trim();
    if (!trimmed) {
      throw new Error('Пустой запрос.');
    }

    const isUrl = /^https?:\/\//i.test(trimmed);

    if (isUrl) {
      if (trimmed.includes('open.spotify.com/')) {
        return SpotifyClient.resolveUrl(trimmed, requestedBy);
      }
      if (trimmed.includes('soundcloud.com/') || trimmed.includes('on.soundcloud.com/')) {
        return this.resolveSoundCloudUrl(trimmed, requestedBy);
      }
      if (
        trimmed.includes('youtube.com/') ||
        trimmed.includes('youtu.be/') ||
        trimmed.includes('music.youtube.com/')
      ) {
        return this.resolveYouTubeUrl(trimmed, requestedBy);
      }
      throw new Error('Неподдерживаемая ссылка. Поддерживаются YouTube, Spotify и SoundCloud.');
    }

    if (platform === 'soundcloud') {
      return this.searchSoundCloud(trimmed, requestedBy);
    }

    if (platform === 'spotify') {
      const spTrack = await SpotifyClient.searchTrackByName(trimmed, requestedBy);
      if (spTrack) return [spTrack];
      return this.searchYouTube(trimmed, requestedBy);
    }

    if (platform === 'youtube') {
      return this.searchYouTube(trimmed, requestedBy);
    }

    try {
      const ytTracks = await this.searchYouTube(trimmed, requestedBy);
      if (ytTracks.length > 0) return ytTracks;
    } catch (ytErr) {
      console.warn('⚠️ Auto-search YouTube fallback to SoundCloud:', ytErr);
    }

    return this.searchSoundCloud(trimmed, requestedBy);
  }

  private static async searchSoundCloud(
    query: string,
    requestedBy: { id: string; tag: string }
  ): Promise<Track[]> {
    const tracks = await SoundCloudClient.searchTracks(query, 8);
    if (!tracks.length) {
      throw new Error(`На SoundCloud ничего не найдено по запросу "${query}".`);
    }
    const best =
      tracks.find((t) => SoundCloudClient.pickPlayableTranscoding(t) !== null) ?? tracks[0];
    return [SoundCloudClient.mapRawTrack(best, requestedBy)];
  }

  private static async resolveSoundCloudUrl(
    url: string,
    requestedBy: { id: string; tag: string }
  ): Promise<Track[]> {
    try {
      const resolved = await SoundCloudClient.resolveUrl(url);
      if (resolved?.kind === 'track') {
        return [SoundCloudClient.mapRawTrack(resolved, requestedBy)];
      }
      if (resolved?.kind === 'playlist' && Array.isArray(resolved.tracks)) {
        const mapped: Track[] = [];
        for (const t of resolved.tracks.slice(0, 50)) {
          if (t && t.title) {
            mapped.push(SoundCloudClient.mapRawTrack(t, requestedBy));
          }
        }
        if (mapped.length > 0) return mapped;
      }
    } catch (err) {
      console.warn('⚠️ SoundCloud API v2 resolve fallback to oEmbed:', err);
    }

    const res = await fetch(
      `https://soundcloud.com/oembed?format=json&url=${encodeURIComponent(url)}`
    );
    if (!res.ok) {
      throw new Error(`Ошибка загрузки SoundCloud (код ${res.status})`);
    }
    const data = (await res.json()) as {
      title: string;
      author_name?: string;
      thumbnail_url?: string;
    };
    return [
      {
        uid: makeUid(),
        id: makeUid(),
        title: data.title,
        author: data.author_name ?? 'SoundCloud',
        url: '',
        originalUrl: url,
        searchQuery: `${data.title} ${data.author_name ?? ''}`.trim(),
        durationSec: 0,
        durationFormatted: '0:00',
        thumbnail: data.thumbnail_url ?? null,
        source: 'soundcloud',
        streamKind: 'youtube',
        requestedBy,
      },
    ];
  }

  private static async resolveYouTubeUrl(
    url: string,
    requestedBy: { id: string; tag: string }
  ): Promise<Track[]> {
    if (
      url.includes('/playlist?list=') ||
      (url.includes('list=') && !url.includes('watch?v=') && !url.includes('youtu.be/'))
    ) {
      try {
        const playlist = await ytdl.getPlaylist(url);
        const items = playlist?.videos ?? [];
        if (items.length > 0) {
          return items.slice(0, 50).map((item: any) => {
            const durationSec = Number(item.lengthSeconds ?? 0);
            return {
              uid: makeUid(),
              id: item.id,
              title: item.title || 'YouTube Video',
              author: item.author?.name ?? 'YouTube',
              url: item.url,
              originalUrl: item.url,
              durationSec,
              durationFormatted: formatDuration(durationSec),
              thumbnail: item.thumbnails?.[0]?.url ?? null,
              source: 'youtube',
              streamKind: 'youtube',
              requestedBy,
            };
          });
        }
      } catch (err) {
        console.warn('⚠️ YouTube playlist fetch failed, trying single video:', err);
      }
    }

    try {
      const info = await ytdl.getInfo(url);
      const details = info.videoDetails;
      const durationSec = Number(details.lengthSeconds ?? 0);

      return [
        {
          uid: makeUid(),
          id: details.id,
          title: details.title,
          author: details.author?.name ?? 'YouTube',
          url: details.url || url,
          originalUrl: url,
          durationSec,
          durationFormatted: formatDuration(durationSec),
          thumbnail: details.thumbnails?.[0]?.url ?? null,
          source: 'youtube',
          streamKind: 'youtube',
          requestedBy,
        },
      ];
    } catch (ytErr) {
      console.warn('⚠️ YouTube getInfo заблокирован, беру метаданные через oEmbed:', ytErr);
      const oeRes = await fetch(
        `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`
      );
      if (!oeRes.ok) {
        throw new Error('Не удалось получить информацию о видео YouTube.');
      }
      const oe = (await oeRes.json()) as {
        title: string;
        author_name?: string;
        thumbnail_url?: string;
      };
      return [
        {
          uid: makeUid(),
          id: makeUid(),
          title: oe.title,
          author: oe.author_name ?? 'YouTube',
          url,
          originalUrl: url,
          searchQuery: cleanTrackQueryForFallback(oe.title, oe.author_name),
          durationSec: 0,
          durationFormatted: '0:00',
          thumbnail: oe.thumbnail_url ?? null,
          source: 'youtube',
          streamKind: 'youtube',
          requestedBy,
        },
      ];
    }
  }

  private static async searchYouTube(
    query: string,
    requestedBy: { id: string; tag: string }
  ): Promise<Track[]> {
    const searchRes = await ytdl.search(query);
    if (!searchRes || searchRes.length === 0) {
      throw new Error(`По запросу "${query}" ничего не найдено.`);
    }

    const first = searchRes[0];
    const durationSec = Number(first.lengthSeconds ?? 0);

    return [
      {
        uid: makeUid(),
        id: first.id,
        title: first.title || query,
        author: first.author?.name ?? 'YouTube',
        url: first.url,
        originalUrl: first.url,
        durationSec,
        durationFormatted: formatDuration(durationSec),
        thumbnail: first.thumbnails?.[0]?.url ?? null,
        source: 'youtube',
        streamKind: 'youtube',
        requestedBy,
      },
    ];
  }

  /**
   * Создаёт и ГАРАНТИРОВАННО ПРОВЕРЯЕТ (первые реальные PCM-байты) аудиопоток для AudioMixer.
   * Если YouTube завис, выдал 403 или пустой поток — мгновенно отменяет YouTube и
   * автоматически включает проверенный прямой поток с SoundCloud!
   */
  public static async createPcmSourceForTrack(
    track: Track
  ): Promise<{ handle: PcmDecoderHandle; actualSource: string }> {
    // 1. Прямой стриминг с SoundCloud (если трек уже с SoundCloud)
    if (track.streamKind === 'soundcloud-direct' && track.soundcloudTranscodingUrl) {
      try {
        const mediaUrl = await SoundCloudClient.fetchMediaStreamUrl(
          track.soundcloudTranscodingUrl
        );
        const decoder = await spawnPcmDecoderFromUrl(mediaUrl, 'soundcloud');
        const verified = await verifyPcmStream(decoder, 10_000);
        return { handle: verified, actualSource: 'SoundCloud' };
      } catch (scErr: any) {
        console.warn(
          `⚠️ Прямой поток SoundCloud не сработал для "${track.title}": ${scErr?.message || scErr}`
        );
      }
    }

    // 2. Попытка воспроизведения через YouTube с проверкой реальных байт
    try {
      let playableUrl = track.url;
      if (
        !playableUrl ||
        (!playableUrl.includes('youtube.com') && !playableUrl.includes('youtu.be'))
      ) {
        const q = track.searchQuery || `${track.author} - ${track.title}`;
        const results = await ytdl.search(q);
        const best = results[0];
        if (best) {
          playableUrl = best.url;
          track.url = best.url;
          if (track.durationSec <= 0 && best.lengthSeconds) {
            track.durationSec = Number(best.lengthSeconds);
            track.durationFormatted = formatDuration(track.durationSec);
          }
          if (!track.thumbnail && best.thumbnails?.[0]?.url) {
            track.thumbnail = best.thumbnails[0].url;
          }
        }
      }

      if (playableUrl) {
        const info = await ytdl.getInfo(playableUrl);

        // Предпочитаем webm/opus (нативно потоковый контейнер без проблем с moov-атомом в pipe:0!)
        const hasWebmAudio = info.formats.some(
          (f) => f.hasAudio && !f.hasVideo && f.container === 'webm'
        );
        const chosenFilter = hasWebmAudio
          ? { hasAudio: true, hasVideo: false, container: 'webm' }
          : { hasAudio: true, hasVideo: false };
        const chosenFmt = chooseFormat(info.formats, { filter: chosenFilter });

        const rawStream = ytdl.download(info, {
          filter: chosenFilter,
          highWaterMark: 512 * 1024,
          chunkSize: 1024 * 1024,
        });

        const verified = await verifyPcmStream(
          spawnPcmDecoder(rawStream, `youtube:${chosenFmt.itag}`),
          10_000
        );
        return {
          handle: verified,
          actualSource: `YouTube (${chosenFmt.container}, itag=${chosenFmt.itag}, client=${chosenFmt.client})`,
        };
      }
    } catch (ytErr: any) {
      console.warn(
        `⚠️ YouTube не отдал аудио для "${track.title}" (${ytErr?.message ?? ytErr}) — пробую фолбэк через SoundCloud...`
      );
    }

    // 3. Автоматический фолбэк на SoundCloud API v2 (проверенный PCM поток)
    const fallbackQuery =
      track.searchQuery || cleanTrackQueryForFallback(track.title, track.author);
    const scMediaUrl = await SoundCloudClient.findDirectStreamForQuery(fallbackQuery);
    if (scMediaUrl) {
      const decoder = await spawnPcmDecoderFromUrl(scMediaUrl, 'soundcloud-fallback');
      const verified = await verifyPcmStream(decoder, 10_000);
      return { handle: verified, actualSource: 'SoundCloud (fallback)' };
    }

    throw new Error(
      `Не удалось получить звук для "${track.title}" ни с YouTube, ни с SoundCloud.`
    );
  }
}
