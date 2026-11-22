import { Client, GuildMember, User } from 'discord.js';
import { and, desc, eq, inArray, lt, or, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { actionLogs, type ActionLogRecord } from '../db/schema.js';
import type { Track } from '../voice/music-resolver.js';
import { workerPool } from '../voice/index.js';
import { LeaderboardService } from './leaderboard.js';

export type AuditLogAction =
  | 'summon'
  | 'add_tracks'
  | 'remove_tracks'
  | 'play_now'
  | 'skip'
  | 'clear_queue'
  | 'stop'
  | 'loop'
  | 'shuffle'
  | 'pause'
  | 'resume'
  | 'settings_update'
  | 'cookies_update';

export type AuditLogSource = 'web' | 'discord';

export interface AuditTrackSnapshot {
  id: string;
  title: string;
  author: string;
  originalUrl: string;
  durationFormatted: string;
  source: 'youtube' | 'soundcloud' | 'spotify';
}

export interface AuditLogDetails {
  loopMode?: 'off' | 'track' | 'queue';
  playlistName?: string;
  requiredRoleId?: string | null;
  requiredRoleName?: string | null;
  allowedChannelId?: string | null;
  allowedChannelName?: string | null;
  logsAdminOnly?: boolean;
  cookiesOp?: 'uploaded' | 'reloaded' | 'cleared';
  cookiesLineCount?: number;
  count?: number;
}

export interface AuditLogActor {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
}

export interface AuditLogEntryDTO {
  id: number;
  guildId: string;
  channelId: string | null;
  channelName: string | null;
  workerId: number | null;
  actorId: string;
  actorUsername: string;
  actorDisplayName: string;
  actorAvatarUrl: string | null;
  source: AuditLogSource;
  action: AuditLogAction;
  details: AuditLogDetails | null;
  tracks: AuditTrackSnapshot[];
  trackCount: number;
  createdAt: number;
  updatedAt: number;
}

export interface AuditLogQueryResult {
  entries: AuditLogEntryDTO[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  actors: AuditLogActor[];
}

export const VALID_AUDIT_ACTIONS: readonly AuditLogAction[] = [
  'summon',
  'add_tracks',
  'remove_tracks',
  'play_now',
  'skip',
  'clear_queue',
  'stop',
  'loop',
  'shuffle',
  'pause',
  'resume',
  'settings_update',
  'cookies_update',
];

const MERGE_WINDOW_MS = 90_000; // Склеиваем подряд идущие add_tracks / remove_tracks одного пользователя за 90 сек
const MAX_TRACKS_STORED_PER_ENTRY = 500;
const MAX_LOGS_PER_GUILD = 5000;

let writeCounter = 0;

export function toAuditTrack(track: Pick<Track, 'id' | 'title' | 'author' | 'originalUrl' | 'durationFormatted' | 'source'>): AuditTrackSnapshot {
  return {
    id: String(track.id || '').slice(0, 128),
    title: String(track.title || track.originalUrl || 'Unknown').slice(0, 300),
    author: String(track.author || '').slice(0, 200),
    originalUrl: String(track.originalUrl || '').slice(0, 500),
    durationFormatted: String(track.durationFormatted || ''),
    source: track.source,
  };
}

export function actorFromDiscord(user: User, member?: GuildMember | null): AuditLogActor {
  return {
    id: user.id,
    username: user.username,
    displayName: member?.displayName || user.displayName || user.username,
    avatarUrl: (member ?? user).displayAvatarURL({ size: 64 }),
  };
}

function parseJsonSafe<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function hydrateRecord(row: ActionLogRecord): AuditLogEntryDTO {
  return {
    id: row.id,
    guildId: row.guildId,
    channelId: row.channelId ?? null,
    channelName: row.channelName ?? null,
    workerId: row.workerId ?? null,
    actorId: row.actorId,
    actorUsername: row.actorUsername,
    actorDisplayName: row.actorDisplayName,
    actorAvatarUrl: row.actorAvatarUrl ?? null,
    source: row.source === 'discord' ? 'discord' : 'web',
    action: row.action as AuditLogAction,
    details: parseJsonSafe<AuditLogDetails | null>(row.detailsJson, null),
    tracks: parseJsonSafe<AuditTrackSnapshot[]>(row.tracksJson, []),
    trackCount: row.trackCount ?? 0,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class AuditLogService {
  /**
   * Записывает действие пользователя в БД.
   * Если пользователь подряд добавляет или удаляет треки (в рамках 90 секунд и без чужих действий между ними),
   * записи автоматически объединяются в одну с полным списком треков.
   */
  public static async record(params: {
    guildId: string;
    channelId?: string | null;
    channelName?: string | null;
    workerId?: number | null;
    actor: AuditLogActor;
    source: AuditLogSource;
    action: AuditLogAction;
    details?: AuditLogDetails | null;
    tracks?: AuditTrackSnapshot[];
    mergeable?: boolean;
  }): Promise<void> {
    if (!params.guildId || !params.actor.id) return;

    const now = Date.now();
    const incomingTracks = (params.tracks ?? []).slice(0, MAX_TRACKS_STORED_PER_ENTRY);
    const incomingCount = params.tracks?.length ?? 0;
    const canMerge =
      (params.mergeable ?? true) &&
      (params.action === 'add_tracks' || params.action === 'remove_tracks') &&
      incomingCount > 0 &&
      !params.details?.playlistName;

    try {
      if (params.action === 'add_tracks' && incomingCount > 0) {
        void LeaderboardService.incrementStats({
          guildId: params.guildId,
          actor: params.actor,
          tracksAdded: incomingCount,
          playlistsLoaded: params.details?.playlistName ? 1 : 0,
        });
      } else if (params.action === 'skip') {
        void LeaderboardService.incrementStats({
          guildId: params.guildId,
          actor: params.actor,
          skipsCount: Math.max(1, incomingCount || params.details?.count || 1),
        });
      }

      if (canMerge) {
        const [latest] = await db
          .select()
          .from(actionLogs)
          .where(eq(actionLogs.guildId, params.guildId))
          .orderBy(desc(actionLogs.updatedAt), desc(actionLogs.id))
          .limit(1);

        const latestDetails = latest ? parseJsonSafe<AuditLogDetails | null>(latest.detailsJson, null) : null;
        if (
          latest &&
          latest.action === params.action &&
          latest.actorId === params.actor.id &&
          (latest.channelId ?? null) === (params.channelId ?? null) &&
          !latestDetails?.playlistName &&
          now - latest.updatedAt <= MERGE_WINDOW_MS &&
          latest.trackCount < MAX_TRACKS_STORED_PER_ENTRY
        ) {
          const prevTracks = parseJsonSafe<AuditTrackSnapshot[]>(latest.tracksJson, []);
          const mergedTracks = [...prevTracks, ...incomingTracks].slice(0, MAX_TRACKS_STORED_PER_ENTRY);
          const nextCount = latest.trackCount + incomingCount;

          await db
            .update(actionLogs)
            .set({
              actorUsername: params.actor.username,
              actorDisplayName: params.actor.displayName,
              actorAvatarUrl: params.actor.avatarUrl,
              tracksJson: JSON.stringify(mergedTracks),
              trackCount: nextCount,
              updatedAt: now,
            })
            .where(eq(actionLogs.id, latest.id));

          workerPool.events.emit('logsChanged', params.guildId);
          return;
        }
      }

      await db.insert(actionLogs).values({
        guildId: params.guildId,
        channelId: params.channelId ?? null,
        channelName: params.channelName ?? null,
        workerId: params.workerId ?? null,
        actorId: params.actor.id,
        actorUsername: params.actor.username,
        actorDisplayName: params.actor.displayName,
        actorAvatarUrl: params.actor.avatarUrl,
        source: params.source,
        action: params.action,
        detailsJson: params.details ? JSON.stringify(params.details) : null,
        tracksJson: incomingTracks.length > 0 ? JSON.stringify(incomingTracks) : null,
        trackCount: incomingCount,
        createdAt: now,
        updatedAt: now,
      });

      workerPool.events.emit('logsChanged', params.guildId);

      // Периодическая очистка очень старых записей (чтобы БД не росла бесконечно)
      writeCounter += 1;
      if (writeCounter % 100 === 0) {
        void AuditLogService.pruneGuildLogs(params.guildId);
      }
    } catch (err) {
      console.error('❌ [AuditLog] Не удалось записать лог действия:', err);
    }
  }

  private static async pruneGuildLogs(guildId: string): Promise<void> {
    try {
      const cutoffRows = await db
        .select({ id: actionLogs.id })
        .from(actionLogs)
        .where(eq(actionLogs.guildId, guildId))
        .orderBy(desc(actionLogs.id))
        .limit(1)
        .offset(MAX_LOGS_PER_GUILD);

      if (cutoffRows.length > 0) {
        await db
          .delete(actionLogs)
          .where(and(eq(actionLogs.guildId, guildId), lt(actionLogs.id, cutoffRows[0].id)));
      }
    } catch {
      // ignore pruning errors
    }
  }

  public static async query(params: {
    guildId: string;
    page?: number;
    pageSize?: number;
    action?: string | null;
    actorId?: string | null;
    userQuery?: string | null;
    discordClient?: Client;
  }): Promise<AuditLogQueryResult> {
    const pageSize = Math.max(5, Math.min(50, Math.floor(Number(params.pageSize) || 15)));
    const requestedPage = Math.max(1, Math.floor(Number(params.page) || 1));

    const conditions = [eq(actionLogs.guildId, params.guildId)];

    const actionFilter = (params.action || '').trim();
    if (actionFilter && actionFilter !== 'all') {
      if (actionFilter === 'playback') {
        conditions.push(inArray(actionLogs.action, ['pause', 'resume', 'shuffle']));
      } else if ((VALID_AUDIT_ACTIONS as readonly string[]).includes(actionFilter)) {
        conditions.push(eq(actionLogs.action, actionFilter));
      }
    }

    const actorIdFilter = (params.actorId || '').trim();
    if (actorIdFilter && actorIdFilter !== 'all' && /^\d{15,22}$/.test(actorIdFilter)) {
      conditions.push(eq(actionLogs.actorId, actorIdFilter));
    }

    // Поиск СТРОГО по реальному глобальному username Discord (без ведущего @) или по Discord User ID —
    // чтобы нельзя было скрыть/подменить логи сменой серверного никнейма!
    const rawUserQuery = (params.userQuery || '').trim().replace(/^@+/, '').slice(0, 80);
    if (rawUserQuery) {
      const escaped = rawUserQuery.toLowerCase().replace(/[\\%_]/g, '\\$&');
      const pattern = `%${escaped}%`;
      conditions.push(
        or(
          sql`lower(${actionLogs.actorUsername}) LIKE ${pattern} ESCAPE '\\'`,
          sql`${actionLogs.actorId} LIKE ${pattern} ESCAPE '\\'`
        )!
      );
    }

    const whereClause = conditions.length === 1 ? conditions[0] : and(...conditions);

    const [countRow] = await db
      .select({ total: sql<number>`count(*)` })
      .from(actionLogs)
      .where(whereClause);

    const total = Number(countRow?.total ?? 0);
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const page = Math.min(requestedPage, totalPages);
    const offset = (page - 1) * pageSize;

    const rows = await db
      .select()
      .from(actionLogs)
      .where(whereClause)
      .orderBy(desc(actionLogs.updatedAt), desc(actionLogs.id))
      .limit(pageSize)
      .offset(offset);

    // Список уникальных участников из логов этого сервера (для выпадающего фильтра)
    const actorRows = await db
      .select({
        id: actionLogs.actorId,
        username: actionLogs.actorUsername,
        displayName: actionLogs.actorDisplayName,
        avatarUrl: actionLogs.actorAvatarUrl,
        latestAt: sql<number>`max(${actionLogs.updatedAt})`,
      })
      .from(actionLogs)
      .where(eq(actionLogs.guildId, params.guildId))
      .groupBy(actionLogs.actorId)
      .orderBy(desc(sql`max(${actionLogs.updatedAt})`))
      .limit(100);

    const guild = params.discordClient?.guilds.cache.get(params.guildId);
    const actors: AuditLogActor[] = actorRows.map((a) => {
      const liveMember = guild?.members.cache.get(a.id);
      return {
        id: a.id,
        username: liveMember?.user.username ?? a.username,
        displayName: liveMember?.displayName ?? a.displayName,
        avatarUrl: liveMember?.displayAvatarURL({ size: 64 }) ?? a.avatarUrl ?? null,
      };
    });

    return {
      entries: rows.map(hydrateRecord),
      total,
      page,
      pageSize,
      totalPages,
      actors,
    };
  }
}
