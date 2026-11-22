import type { Client, VoiceBasedChannel } from 'discord.js';
import { and, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import {
  actionLogs,
  favoriteTracks,
  reactions,
  sounds,
  userPlaylists,
  userStats,
} from '../db/schema.js';
import { workerPool, type ChannelActivityEvent } from '../voice/index.js';

export type LeaderboardSortBy =
  | 'score'
  | 'voiceSeconds'
  | 'tracksAdded'
  | 'totalLikes'
  | 'sfxPlayed'
  | 'skipsCount';

export type LeaderboardSortDir = 'desc' | 'asc';

export interface LeaderboardActorProfile {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
}

export interface LeaderboardEntryDTO {
  rank: number;
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  inVoiceNow: boolean;
  score: number;
  tracksAdded: number;
  voiceSeconds: number;
  sfxPlayed: number;
  skipsCount: number;
  playlistsLoaded: number;
  playlistLikes: number;
  soundLikes: number;
  totalLikes: number;
  playlistsCount: number;
  soundsCount: number;
  favoritesCount: number;
  updatedAt: number;
}

export interface LeaderboardSummaryDTO {
  totalParticipants: number;
  totalTracksAdded: number;
  totalVoiceSeconds: number;
  totalLikes: number;
  totalSfxPlayed: number;
  activeListenersNow: number;
}

export interface LeaderboardQueryResult {
  entries: LeaderboardEntryDTO[];
  myEntry: LeaderboardEntryDTO | null;
  summary: LeaderboardSummaryDTO;
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  sortBy: LeaderboardSortBy;
  sortDir: LeaderboardSortDir;
}

export const VALID_LEADERBOARD_SORTS: readonly LeaderboardSortBy[] = [
  'score',
  'voiceSeconds',
  'tracksAdded',
  'totalLikes',
  'sfxPlayed',
  'skipsCount',
];

interface PendingVoiceDelta {
  guildId: string;
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  seconds: number;
  updatedAt: number;
}

const VOICE_TICK_INTERVAL_MS = 15_000;
const VOICE_TICK_SECONDS = 15;
const FLUSH_EVERY_TICKS = 4; // Каждую минуту сохраняем накопленные секунды в SQLite

const pendingVoiceMap = new Map<string, PendingVoiceDelta>();
const backfilledGuilds = new Set<string>();
let voiceTrackerTimer: NodeJS.Timeout | null = null;
let voiceTickCount = 0;
let activityListenerAttached = false;
let shutdownHooksAttached = false;

export function computeActivityScore(metrics: {
  voiceSeconds: number;
  tracksAdded: number;
  sfxPlayed: number;
  totalLikes: number;
  playlistsCount: number;
  soundsCount: number;
}): number {
  const voiceMinutes = Math.floor(Math.max(0, metrics.voiceSeconds) / 60);
  return Math.round(
    voiceMinutes * 1 +
      Math.max(0, metrics.tracksAdded) * 3 +
      Math.max(0, metrics.sfxPlayed) * 2 +
      Math.max(0, metrics.totalLikes) * 5 +
      Math.max(0, metrics.playlistsCount) * 4 +
      Math.max(0, metrics.soundsCount) * 3
  );
}

function getSortValue(entry: LeaderboardEntryDTO, sortBy: LeaderboardSortBy): number {
  switch (sortBy) {
    case 'voiceSeconds':
      return entry.voiceSeconds;
    case 'tracksAdded':
      return entry.tracksAdded;
    case 'totalLikes':
      return entry.totalLikes;
    case 'sfxPlayed':
      return entry.sfxPlayed;
    case 'skipsCount':
      return entry.skipsCount;
    case 'score':
    default:
      return entry.score;
  }
}

export class LeaderboardService {
  /**
   * Запускает фоновый учёт времени в голосовых каналах с ботом и подписку на события саундборда.
   */
  public static startTracking(discordClient: Client): void {
    if (!voiceTrackerTimer) {
      voiceTrackerTimer = setInterval(() => {
        try {
          this.sampleActiveVoiceListeners(discordClient);
          voiceTickCount += 1;
          if (voiceTickCount >= FLUSH_EVERY_TICKS) {
            voiceTickCount = 0;
            void this.flushPendingVoice();
          }
        } catch (err) {
          console.error('❌ [Leaderboard] Ошибка трекера голосового времени:', err);
        }
      }, VOICE_TICK_INTERVAL_MS);
      voiceTrackerTimer.unref?.();
    }

    if (!activityListenerAttached) {
      activityListenerAttached = true;
      workerPool.events.on('activity', (event: ChannelActivityEvent) => {
        if (event.action !== 'sfx') return;
        if (!event.guildId || !event.actorId) return;

        const guild = discordClient.guilds.cache.get(event.guildId);
        const liveMember = guild?.members.cache.get(event.actorId);
        void this.incrementStats({
          guildId: event.guildId,
          actor: {
            id: event.actorId,
            username: liveMember?.user.username ?? event.actorName,
            displayName: liveMember?.displayName ?? event.actorName,
            avatarUrl: liveMember?.displayAvatarURL({ size: 64 }) ?? null,
          },
          sfxPlayed: 1,
        });
      });
    }

    if (!shutdownHooksAttached) {
      shutdownHooksAttached = true;
      const flushOnExit = () => {
        void this.flushPendingVoice();
      };
      process.once('SIGINT', flushOnExit);
      process.once('SIGTERM', flushOnExit);
    }
  }

  private static sampleActiveVoiceListeners(discordClient: Client): void {
    const now = Date.now();
    const seenKeys = new Set<string>();

    for (const status of workerPool.getAllStatuses()) {
      if (!status.isInChannel || !status.guildId || !status.channelId) continue;

      const guild = discordClient.guilds.cache.get(status.guildId);
      if (!guild) continue;
      const channel = guild.channels.cache.get(status.channelId) as VoiceBasedChannel | undefined;
      if (!channel || !channel.isVoiceBased()) continue;

      for (const member of channel.members.values()) {
        if (member.user.bot) continue;
        const key = `${status.guildId}:${member.id}`;
        if (seenKeys.has(key)) continue;
        seenKeys.add(key);

        const existing = pendingVoiceMap.get(key);
        if (existing) {
          existing.seconds += VOICE_TICK_SECONDS;
          existing.username = member.user.username;
          existing.displayName = member.displayName || member.user.displayName || member.user.username;
          existing.avatarUrl = member.displayAvatarURL({ size: 64 });
          existing.updatedAt = now;
        } else {
          pendingVoiceMap.set(key, {
            guildId: status.guildId,
            userId: member.id,
            username: member.user.username,
            displayName: member.displayName || member.user.displayName || member.user.username,
            avatarUrl: member.displayAvatarURL({ size: 64 }),
            seconds: VOICE_TICK_SECONDS,
            updatedAt: now,
          });
        }
      }
    }
  }

  public static async flushPendingVoice(): Promise<void> {
    if (pendingVoiceMap.size === 0) return;

    const batch = [...pendingVoiceMap.values()];
    pendingVoiceMap.clear();

    try {
      for (const item of batch) {
        if (item.seconds <= 0) continue;
        await this.incrementStats({
          guildId: item.guildId,
          actor: {
            id: item.userId,
            username: item.username,
            displayName: item.displayName,
            avatarUrl: item.avatarUrl,
          },
          voiceSeconds: item.seconds,
          updatedAt: item.updatedAt,
        });
      }
    } catch (err) {
      console.error('❌ [Leaderboard] Ошибка сохранения времени в войсе:', err);
    }
  }

  public static async incrementStats(params: {
    guildId: string;
    actor: LeaderboardActorProfile;
    tracksAdded?: number;
    voiceSeconds?: number;
    sfxPlayed?: number;
    skipsCount?: number;
    playlistsLoaded?: number;
    updatedAt?: number;
  }): Promise<void> {
    if (!params.guildId || !params.actor.id) return;

    const tracksAdded = Math.max(0, Math.floor(params.tracksAdded ?? 0));
    const voiceSeconds = Math.max(0, Math.floor(params.voiceSeconds ?? 0));
    const sfxPlayed = Math.max(0, Math.floor(params.sfxPlayed ?? 0));
    const skipsCount = Math.max(0, Math.floor(params.skipsCount ?? 0));
    const playlistsLoaded = Math.max(0, Math.floor(params.playlistsLoaded ?? 0));

    if (
      tracksAdded === 0 &&
      voiceSeconds === 0 &&
      sfxPlayed === 0 &&
      skipsCount === 0 &&
      playlistsLoaded === 0
    ) {
      return;
    }

    const now = params.updatedAt ?? Date.now();
    const cleanUsername = String(params.actor.username || 'user').slice(0, 100);
    const cleanDisplayName = String(params.actor.displayName || cleanUsername).slice(0, 100);
    const cleanAvatar = params.actor.avatarUrl ? String(params.actor.avatarUrl).slice(0, 500) : null;

    try {
      await db
        .insert(userStats)
        .values({
          guildId: params.guildId,
          userId: params.actor.id,
          username: cleanUsername,
          displayName: cleanDisplayName,
          avatarUrl: cleanAvatar,
          tracksAdded,
          voiceSeconds,
          sfxPlayed,
          skipsCount,
          playlistsLoaded,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [userStats.guildId, userStats.userId],
          set: {
            username: cleanUsername,
            displayName: cleanDisplayName,
            avatarUrl: cleanAvatar ? cleanAvatar : sql`COALESCE(${userStats.avatarUrl}, ${cleanAvatar})`,
            tracksAdded: sql`${userStats.tracksAdded} + ${tracksAdded}`,
            voiceSeconds: sql`${userStats.voiceSeconds} + ${voiceSeconds}`,
            sfxPlayed: sql`${userStats.sfxPlayed} + ${sfxPlayed}`,
            skipsCount: sql`${userStats.skipsCount} + ${skipsCount}`,
            playlistsLoaded: sql`${userStats.playlistsLoaded} + ${playlistsLoaded}`,
            updatedAt: now,
          },
        });
    } catch (err) {
      console.error('❌ [Leaderboard] Ошибка обновления user_stats:', err);
    }
  }

  /**
   * Одноразовый перенос накопленных треков/скипов из action_logs в user_stats для гильдии,
   * если статистика гильдии ещё пуста (чтобы существующие серверы не стартовали с нуля).
   */
  private static async ensureGuildBackfill(guildId: string): Promise<void> {
    if (backfilledGuilds.has(guildId)) return;
    backfilledGuilds.add(guildId);

    try {
      const [existing] = await db
        .select({ count: sql<number>`count(*)` })
        .from(userStats)
        .where(eq(userStats.guildId, guildId));

      if (Number(existing?.count ?? 0) > 0) return;

      const logRows = await db
        .select({
          actorId: actionLogs.actorId,
          actorUsername: actionLogs.actorUsername,
          actorDisplayName: actionLogs.actorDisplayName,
          actorAvatarUrl: actionLogs.actorAvatarUrl,
          action: actionLogs.action,
          detailsJson: actionLogs.detailsJson,
          trackCount: actionLogs.trackCount,
          updatedAt: actionLogs.updatedAt,
        })
        .from(actionLogs)
        .where(
          and(
            eq(actionLogs.guildId, guildId),
            inArray(actionLogs.action, ['add_tracks', 'skip'])
          )
        );

      if (logRows.length === 0) return;

      const agg = new Map<
        string,
        {
          actor: LeaderboardActorProfile;
          tracksAdded: number;
          skipsCount: number;
          playlistsLoaded: number;
          updatedAt: number;
        }
      >();

      for (const row of logRows) {
        let entry = agg.get(row.actorId);
        if (!entry) {
          entry = {
            actor: {
              id: row.actorId,
              username: row.actorUsername,
              displayName: row.actorDisplayName,
              avatarUrl: row.actorAvatarUrl ?? null,
            },
            tracksAdded: 0,
            skipsCount: 0,
            playlistsLoaded: 0,
            updatedAt: row.updatedAt,
          };
          agg.set(row.actorId, entry);
        }
        if (row.updatedAt >= entry.updatedAt) {
          entry.actor.username = row.actorUsername;
          entry.actor.displayName = row.actorDisplayName;
          if (row.actorAvatarUrl) entry.actor.avatarUrl = row.actorAvatarUrl;
          entry.updatedAt = row.updatedAt;
        }

        if (row.action === 'add_tracks') {
          entry.tracksAdded += Math.max(0, Number(row.trackCount) || 0);
          if (row.detailsJson && row.detailsJson.includes('"playlistName"')) {
            entry.playlistsLoaded += 1;
          }
        } else if (row.action === 'skip') {
          entry.skipsCount += Math.max(1, Number(row.trackCount) || 1);
        }
      }

      for (const item of agg.values()) {
        await this.incrementStats({
          guildId,
          actor: item.actor,
          tracksAdded: item.tracksAdded,
          skipsCount: item.skipsCount,
          playlistsLoaded: item.playlistsLoaded,
          updatedAt: item.updatedAt,
        });
      }
    } catch (err) {
      console.error('❌ [Leaderboard] Ошибка backfill из action_logs:', err);
    }
  }

  private static getActiveListenerIds(guildId: string, discordClient?: Client): Set<string> {
    const active = new Set<string>();
    if (!discordClient) return active;

    const guild = discordClient.guilds.cache.get(guildId);
    if (!guild) return active;

    for (const status of workerPool.getAllStatuses()) {
      if (!status.isInChannel || status.guildId !== guildId || !status.channelId) continue;
      const channel = guild.channels.cache.get(status.channelId) as VoiceBasedChannel | undefined;
      if (!channel || !channel.isVoiceBased()) continue;
      for (const member of channel.members.values()) {
        if (!member.user.bot) active.add(member.id);
      }
    }
    return active;
  }

  public static async query(params: {
    guildId: string;
    viewerUserId?: string;
    page?: number;
    pageSize?: number;
    sortBy?: string | null;
    sortDir?: string | null;
    search?: string | null;
    discordClient?: Client;
  }): Promise<LeaderboardQueryResult> {
    await this.flushPendingVoice();
    await this.ensureGuildBackfill(params.guildId);

    const pageSize = Math.max(5, Math.min(50, Math.floor(Number(params.pageSize) || 15)));
    const requestedPage = Math.max(1, Math.floor(Number(params.page) || 1));
    const sortBy: LeaderboardSortBy = (VALID_LEADERBOARD_SORTS as readonly string[]).includes(
      params.sortBy ?? ''
    )
      ? (params.sortBy as LeaderboardSortBy)
      : 'score';
    const sortDir: LeaderboardSortDir = params.sortDir === 'asc' ? 'asc' : 'desc';

    // 1. Базовая статистика участников гильдии
    const statRows = await db
      .select()
      .from(userStats)
      .where(eq(userStats.guildId, params.guildId));

    interface MutableRow {
      userId: string;
      username: string;
      displayName: string;
      avatarUrl: string | null;
      tracksAdded: number;
      voiceSeconds: number;
      sfxPlayed: number;
      skipsCount: number;
      playlistsLoaded: number;
      playlistLikes: number;
      soundLikes: number;
      playlistsCount: number;
      soundsCount: number;
      favoritesCount: number;
      updatedAt: number;
    }

    const byUser = new Map<string, MutableRow>();

    const ensureUser = (
      userId: string,
      fallbackUsername: string,
      fallbackDisplayName?: string | null,
      fallbackAvatar?: string | null,
      updatedAt = 0
    ): MutableRow => {
      let row = byUser.get(userId);
      if (!row) {
        row = {
          userId,
          username: fallbackUsername || 'user',
          displayName: fallbackDisplayName || fallbackUsername || 'User',
          avatarUrl: fallbackAvatar ?? null,
          tracksAdded: 0,
          voiceSeconds: 0,
          sfxPlayed: 0,
          skipsCount: 0,
          playlistsLoaded: 0,
          playlistLikes: 0,
          soundLikes: 0,
          playlistsCount: 0,
          soundsCount: 0,
          favoritesCount: 0,
          updatedAt,
        };
        byUser.set(userId, row);
      }
      return row;
    };

    for (const s of statRows) {
      const row = ensureUser(s.userId, s.username, s.displayName, s.avatarUrl, s.updatedAt);
      row.tracksAdded = s.tracksAdded;
      row.voiceSeconds = s.voiceSeconds;
      row.sfxPlayed = s.sfxPlayed;
      row.skipsCount = s.skipsCount;
      row.playlistsLoaded = s.playlistsLoaded;
      row.updatedAt = Math.max(row.updatedAt, s.updatedAt);
    }

    // 2. Звуки этого сервера (и авторы звуков)
    const soundRows = await db
      .select({
        id: sounds.id,
        uploadedById: sounds.uploadedById,
        uploadedByTag: sounds.uploadedByTag,
        uploadedByUsername: sounds.uploadedByUsername,
        createdAt: sounds.createdAt,
      })
      .from(sounds)
      .where(eq(sounds.guildId, params.guildId));

    const soundOwnerById = new Map<number, string>();
    for (const snd of soundRows) {
      soundOwnerById.set(snd.id, snd.uploadedById);
      const row = ensureUser(
        snd.uploadedById,
        snd.uploadedByUsername || snd.uploadedByTag,
        snd.uploadedByTag,
        null,
        snd.createdAt instanceof Date ? snd.createdAt.getTime() : Number(snd.createdAt) || 0
      );
      row.soundsCount += 1;
    }

    // 3. Плейлисты участников сервера (с guildId этой гильдии, либо старые без guildId от уже известных участников)
    const knownUserIds = [...byUser.keys()];
    const playlistWhere =
      knownUserIds.length > 0
        ? or(
            eq(userPlaylists.guildId, params.guildId),
            and(isNull(userPlaylists.guildId), inArray(userPlaylists.userId, knownUserIds))
          )
        : eq(userPlaylists.guildId, params.guildId);

    const playlistRows = await db
      .select({
        id: userPlaylists.id,
        userId: userPlaylists.userId,
        authorName: userPlaylists.authorName,
        authorUsername: userPlaylists.authorUsername,
        updatedAt: userPlaylists.updatedAt,
      })
      .from(userPlaylists)
      .where(playlistWhere);

    const playlistOwnerById = new Map<number, string>();
    for (const pl of playlistRows) {
      playlistOwnerById.set(pl.id, pl.userId);
      const row = ensureUser(
        pl.userId,
        pl.authorUsername || pl.authorName || 'user',
        pl.authorName || pl.authorUsername || 'User',
        null,
        pl.updatedAt instanceof Date ? pl.updatedAt.getTime() : Number(pl.updatedAt) || 0
      );
      row.playlistsCount += 1;
    }

    // 4. Лайки на плейлистах и звуках (value === 1)
    const soundIds = [...soundOwnerById.keys()];
    if (soundIds.length > 0) {
      const soundReactions = await db
        .select({
          targetId: reactions.targetId,
          likes: sql<number>`count(*)`,
        })
        .from(reactions)
        .where(
          and(
            eq(reactions.targetType, 'sound'),
            eq(reactions.value, 1),
            inArray(reactions.targetId, soundIds)
          )
        )
        .groupBy(reactions.targetId);

      for (const r of soundReactions) {
        const ownerId = soundOwnerById.get(r.targetId);
        if (!ownerId) continue;
        const row = byUser.get(ownerId);
        if (row) row.soundLikes += Number(r.likes) || 0;
      }
    }

    const playlistIds = [...playlistOwnerById.keys()];
    if (playlistIds.length > 0) {
      const playlistReactions = await db
        .select({
          targetId: reactions.targetId,
          likes: sql<number>`count(*)`,
        })
        .from(reactions)
        .where(
          and(
            eq(reactions.targetType, 'playlist'),
            eq(reactions.value, 1),
            inArray(reactions.targetId, playlistIds)
          )
        )
        .groupBy(reactions.targetId);

      for (const r of playlistReactions) {
        const ownerId = playlistOwnerById.get(r.targetId);
        if (!ownerId) continue;
        const row = byUser.get(ownerId);
        if (row) row.playlistLikes += Number(r.likes) || 0;
      }
    }

    // 5. Количество любимых треков у собранных участников
    const allUserIds = [...byUser.keys()];
    if (allUserIds.length > 0) {
      const favCounts = await db
        .select({
          userId: favoriteTracks.userId,
          count: sql<number>`count(*)`,
        })
        .from(favoriteTracks)
        .where(inArray(favoriteTracks.userId, allUserIds))
        .groupBy(favoriteTracks.userId);

      for (const f of favCounts) {
        const row = byUser.get(f.userId);
        if (row) row.favoritesCount = Number(f.count) || 0;
      }
    }

    // 6. Обогащаем профили из кеша Discord + отмечаем тех, кто прямо сейчас слушает в войсе
    const guild = params.discordClient?.guilds.cache.get(params.guildId);
    const activeListeners = this.getActiveListenerIds(params.guildId, params.discordClient);

    // Если кто-то прямо сейчас слушает с ботом, но ещё не успел попасть в user_stats — показываем его тоже
    for (const listenerId of activeListeners) {
      if (!byUser.has(listenerId)) {
        const liveMember = guild?.members.cache.get(listenerId);
        if (liveMember && !liveMember.user.bot) {
          ensureUser(
            listenerId,
            liveMember.user.username,
            liveMember.displayName || liveMember.user.displayName || liveMember.user.username,
            liveMember.displayAvatarURL({ size: 64 }),
            Date.now()
          );
        }
      }
    }

    const allEntries: LeaderboardEntryDTO[] = [];
    for (const raw of byUser.values()) {
      const liveMember = guild?.members.cache.get(raw.userId);
      const totalLikes = raw.playlistLikes + raw.soundLikes;
      const score = computeActivityScore({
        voiceSeconds: raw.voiceSeconds,
        tracksAdded: raw.tracksAdded,
        sfxPlayed: raw.sfxPlayed,
        totalLikes,
        playlistsCount: raw.playlistsCount,
        soundsCount: raw.soundsCount,
      });

      allEntries.push({
        rank: 0,
        userId: raw.userId,
        username: liveMember?.user.username ?? raw.username,
        displayName: liveMember?.displayName ?? raw.displayName,
        avatarUrl: liveMember?.displayAvatarURL({ size: 64 }) ?? raw.avatarUrl,
        inVoiceNow: activeListeners.has(raw.userId),
        score,
        tracksAdded: raw.tracksAdded,
        voiceSeconds: raw.voiceSeconds,
        sfxPlayed: raw.sfxPlayed,
        skipsCount: raw.skipsCount,
        playlistsLoaded: raw.playlistsLoaded,
        playlistLikes: raw.playlistLikes,
        soundLikes: raw.soundLikes,
        totalLikes,
        playlistsCount: raw.playlistsCount,
        soundsCount: raw.soundsCount,
        favoritesCount: raw.favoritesCount,
        updatedAt: raw.updatedAt,
      });
    }

    // 7. Сводка сервера (до поискового фильтра)
    const summary: LeaderboardSummaryDTO = {
      totalParticipants: allEntries.length,
      totalTracksAdded: allEntries.reduce((sum, e) => sum + e.tracksAdded, 0),
      totalVoiceSeconds: allEntries.reduce((sum, e) => sum + e.voiceSeconds, 0),
      totalLikes: allEntries.reduce((sum, e) => sum + e.totalLikes, 0),
      totalSfxPlayed: allEntries.reduce((sum, e) => sum + e.sfxPlayed, 0),
      activeListenersNow: activeListeners.size,
    };

    // 8. Сортировка и присвоение рангов (1..N)
    const dirMul = sortDir === 'asc' ? 1 : -1;
    allEntries.sort((a, b) => {
      const diff = (getSortValue(a, sortBy) - getSortValue(b, sortBy)) * dirMul;
      if (diff !== 0) return diff;
      if (b.score !== a.score) return b.score - a.score;
      if (b.voiceSeconds !== a.voiceSeconds) return b.voiceSeconds - a.voiceSeconds;
      if (b.tracksAdded !== a.tracksAdded) return b.tracksAdded - a.tracksAdded;
      return a.userId.localeCompare(b.userId);
    });

    for (let i = 0; i < allEntries.length; i += 1) {
      allEntries[i].rank = i + 1;
    }

    const myEntry = params.viewerUserId
      ? allEntries.find((e) => e.userId === params.viewerUserId) ?? null
      : null;

    // 9. Поиск (сохраняя оригинальные ранги!)
    const rawQuery = (params.search || '').trim().replace(/^@+/, '').toLowerCase();
    const filtered = rawQuery
      ? allEntries.filter(
          (e) =>
            e.displayName.toLowerCase().includes(rawQuery) ||
            e.username.toLowerCase().includes(rawQuery) ||
            e.userId.includes(rawQuery)
        )
      : allEntries;

    const total = filtered.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const page = Math.min(requestedPage, totalPages);
    const start = (page - 1) * pageSize;

    return {
      entries: filtered.slice(start, start + pageSize),
      myEntry,
      summary,
      total,
      page,
      pageSize,
      totalPages,
      sortBy,
      sortDir,
    };
  }
}
