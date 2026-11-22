import { and, desc, eq } from 'drizzle-orm';
import crypto from 'node:crypto';
import { db } from '../db/index.js';
import { userPlaylists } from '../db/schema.js';
import { ReactionService, type ReactionVote } from '../services/reactions.js';
import { buildTrackKey, type FavoriteTrackInput } from './favorites.js';
import type { Track } from './music-resolver.js';

export interface SavedTrackSnapshot {
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
}

export interface UserPlaylist {
  id: number;
  userId: string;
  guildId: string | null;
  authorName: string;
  authorUsername: string | null;
  name: string;
  color: string;
  isPublic: boolean;
  isOwner: boolean;
  likes: number;
  dislikes: number;
  myVote: ReactionVote;
  trackCount: number;
  tracks: SavedTrackSnapshot[];
  createdAt: Date;
  updatedAt: Date;
}

const MAX_PLAYLISTS_PER_USER = 50;
const MAX_TRACKS_PER_PLAYLIST = 200;
const DEFAULT_PLAYLIST_COLOR = '#0067b8';

function normalizeColor(color?: string | null): string {
  if (!color) return DEFAULT_PLAYLIST_COLOR;
  const clean = color.trim().replace(/^#/, '');
  if (/^[0-9a-fA-F]{6}$/.test(clean)) return `#${clean}`;
  return DEFAULT_PLAYLIST_COLOR;
}

function serializeTrack(track: Track): SavedTrackSnapshot {
  return {
    id: track.id,
    title: track.title,
    author: track.author,
    url: track.url,
    originalUrl: track.originalUrl,
    searchQuery: track.searchQuery,
    durationSec: track.durationSec,
    durationFormatted: track.durationFormatted,
    thumbnail: track.thumbnail,
    source: track.source,
    streamKind: track.streamKind,
    soundcloudTranscodingUrl: track.soundcloudTranscodingUrl,
    soundcloudProtocol: track.soundcloudProtocol,
  };
}

function hydratePlaylist(
  row: typeof userPlaylists.$inferSelect,
  viewerUserId?: string,
  reaction?: { likes: number; dislikes: number; myVote: ReactionVote }
): UserPlaylist {
  let tracks: SavedTrackSnapshot[] = [];
  try {
    const parsed = JSON.parse(row.tracksJson);
    if (Array.isArray(parsed)) tracks = parsed;
  } catch {
    tracks = [];
  }

  return {
    id: row.id,
    userId: row.userId,
    guildId: row.guildId ?? null,
    authorName: row.authorName || row.authorUsername || 'User',
    authorUsername: row.authorUsername ?? null,
    name: row.name,
    color: normalizeColor(row.color),
    isPublic: Boolean(row.isPublic),
    isOwner: viewerUserId ? row.userId === viewerUserId : true,
    likes: reaction?.likes ?? 0,
    dislikes: reaction?.dislikes ?? 0,
    myVote: reaction?.myVote ?? 0,
    trackCount: tracks.length,
    tracks,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class PlaylistService {
  public static async listUserPlaylists(userId: string): Promise<UserPlaylist[]> {
    const rows = await db
      .select()
      .from(userPlaylists)
      .where(eq(userPlaylists.userId, userId))
      .orderBy(desc(userPlaylists.updatedAt));

    const ids = rows.map((r) => r.id);
    const reactionMap = await ReactionService.getSummaries('playlist', ids, userId);

    return rows.map((row) => hydratePlaylist(row, userId, reactionMap.get(row.id)));
  }

  public static async listPublicPlaylists(
    guildId: string,
    viewerUserId: string
  ): Promise<UserPlaylist[]> {
    const rows = await db
      .select()
      .from(userPlaylists)
      .where(and(eq(userPlaylists.guildId, guildId), eq(userPlaylists.isPublic, true)))
      .orderBy(desc(userPlaylists.updatedAt));

    const ids = rows.map((r) => r.id);
    const reactionMap = await ReactionService.getSummaries('playlist', ids, viewerUserId);

    return rows.map((row) => hydratePlaylist(row, viewerUserId, reactionMap.get(row.id)));
  }

  public static async getUserPlaylistById(
    userId: string,
    id: number
  ): Promise<UserPlaylist | null> {
    const [row] = await db
      .select()
      .from(userPlaylists)
      .where(and(eq(userPlaylists.userId, userId), eq(userPlaylists.id, id)))
      .limit(1);

    if (!row) return null;
    const reactionMap = await ReactionService.getSummaries('playlist', [row.id], userId);
    return hydratePlaylist(row, userId, reactionMap.get(row.id));
  }

  public static async getAccessiblePlaylistById(
    guildId: string,
    viewerUserId: string,
    id: number
  ): Promise<UserPlaylist | null> {
    const [row] = await db
      .select()
      .from(userPlaylists)
      .where(eq(userPlaylists.id, id))
      .limit(1);

    if (!row) return null;
    const isOwner = row.userId === viewerUserId;
    const isPublicOnGuild = Boolean(row.isPublic) && row.guildId === guildId;
    if (!isOwner && !isPublicOnGuild) return null;

    const reactionMap = await ReactionService.getSummaries('playlist', [row.id], viewerUserId);
    return hydratePlaylist(row, viewerUserId, reactionMap.get(row.id));
  }

  public static async findUserPlaylistByName(
    userId: string,
    name: string
  ): Promise<UserPlaylist | null> {
    const all = await this.listUserPlaylists(userId);
    const target = name.trim().toLowerCase();
    return (
      all.find((p) => p.name.toLowerCase() === target) ??
      all.find((p) => p.name.toLowerCase().includes(target)) ??
      null
    );
  }

  public static async savePlaylist(params: {
    userId: string;
    guildId?: string | null;
    authorName?: string | null;
    authorUsername?: string | null;
    name: string;
    color?: string;
    isPublic?: boolean;
    currentTrack: Track | null;
    upcomingTracks: Track[];
  }): Promise<{ playlist: UserPlaylist; overwritten: boolean }> {
    const cleanName = params.name.trim().slice(0, 60);
    if (!cleanName) {
      throw new Error('Название плейлиста не может быть пустым.');
    }

    const combined: Track[] = [];
    if (params.currentTrack) combined.push(params.currentTrack);
    combined.push(...params.upcomingTracks);

    if (combined.length === 0) {
      throw new Error('Очередь пуста — нечего сохранять в плейлист.');
    }

    const snapshots = combined.slice(0, MAX_TRACKS_PER_PLAYLIST).map(serializeTrack);
    const tracksJson = JSON.stringify(snapshots);
    const now = new Date();
    const safeColor = normalizeColor(params.color);
    const isPublic = Boolean(params.isPublic);

    const existingList = await this.listUserPlaylists(params.userId);
    const sameName = existingList.find(
      (p) => p.name.toLowerCase() === cleanName.toLowerCase()
    );

    if (sameName) {
      const [updated] = await db
        .update(userPlaylists)
        .set({
          name: cleanName,
          color: params.color ? safeColor : sameName.color,
          isPublic: params.isPublic !== undefined ? isPublic : sameName.isPublic,
          guildId: params.guildId ?? sameName.guildId ?? null,
          authorName: params.authorName ?? sameName.authorName,
          authorUsername: params.authorUsername ?? sameName.authorUsername,
          tracksJson,
          trackCount: snapshots.length,
          updatedAt: now,
        })
        .where(
          and(eq(userPlaylists.id, sameName.id), eq(userPlaylists.userId, params.userId))
        )
        .returning();

      const reactionMap = await ReactionService.getSummaries('playlist', [updated.id], params.userId);
      return {
        playlist: hydratePlaylist(updated, params.userId, reactionMap.get(updated.id)),
        overwritten: true,
      };
    }

    if (existingList.length >= MAX_PLAYLISTS_PER_USER) {
      throw new Error(`Достигнут лимит сохранённых плейлистов (${MAX_PLAYLISTS_PER_USER}).`);
    }

    const [inserted] = await db
      .insert(userPlaylists)
      .values({
        userId: params.userId,
        guildId: params.guildId ?? null,
        authorName: params.authorName ?? null,
        authorUsername: params.authorUsername ?? null,
        name: cleanName,
        color: safeColor,
        isPublic,
        tracksJson,
        trackCount: snapshots.length,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    return { playlist: hydratePlaylist(inserted, params.userId), overwritten: false };
  }

  public static async updatePlaylist(params: {
    userId: string;
    guildId: string;
    authorName?: string | null;
    authorUsername?: string | null;
    id: number;
    name?: string;
    color?: string;
    isPublic?: boolean;
  }): Promise<UserPlaylist | null> {
    const existing = await this.getUserPlaylistById(params.userId, params.id);
    if (!existing) return null;

    let nextName = existing.name;
    if (params.name !== undefined) {
      const clean = params.name.trim().slice(0, 60);
      if (!clean) {
        throw new Error('Название плейлиста не может быть пустым.');
      }
      const userList = await this.listUserPlaylists(params.userId);
      if (
        userList.some(
          (p) => p.id !== existing.id && p.name.toLowerCase() === clean.toLowerCase()
        )
      ) {
        throw new Error(`У вас уже есть плейлист с названием "${clean}".`);
      }
      nextName = clean;
    }

    const nextColor = params.color !== undefined ? normalizeColor(params.color) : existing.color;
    const nextIsPublic =
      params.isPublic !== undefined ? Boolean(params.isPublic) : existing.isPublic;
    const nextGuildId = nextIsPublic ? params.guildId : existing.guildId ?? params.guildId;

    const [updated] = await db
      .update(userPlaylists)
      .set({
        name: nextName,
        color: nextColor,
        isPublic: nextIsPublic,
        guildId: nextGuildId,
        authorName: params.authorName ?? existing.authorName,
        authorUsername: params.authorUsername ?? existing.authorUsername,
        updatedAt: new Date(),
      })
      .where(and(eq(userPlaylists.id, params.id), eq(userPlaylists.userId, params.userId)))
      .returning();

    const reactionMap = await ReactionService.getSummaries('playlist', [updated.id], params.userId);
    return hydratePlaylist(updated, params.userId, reactionMap.get(updated.id));
  }

  public static async copyPlaylistToUser(params: {
    sourceId: number;
    guildId: string;
    userId: string;
    authorName: string;
    authorUsername: string;
    copySuffix?: string;
  }): Promise<UserPlaylist> {
    const source = await this.getAccessiblePlaylistById(
      params.guildId,
      params.userId,
      params.sourceId
    );
    if (!source) {
      throw new Error('Плейлист не найден или недоступен.');
    }

    const existingList = await this.listUserPlaylists(params.userId);
    if (existingList.length >= MAX_PLAYLISTS_PER_USER) {
      throw new Error(`Достигнут лимит сохранённых плейлистов (${MAX_PLAYLISTS_PER_USER}).`);
    }

    const suffix = (params.copySuffix || 'копия').trim().slice(0, 20) || 'копия';
    const baseMaxLen = Math.max(10, 60 - suffix.length - 6);
    const baseName = source.name.slice(0, baseMaxLen).trim();
    let candidate = `${baseName} (${suffix})`;
    let counter = 2;
    while (existingList.some((p) => p.name.toLowerCase() === candidate.toLowerCase())) {
      candidate = `${baseName} (${suffix} ${counter})`.slice(0, 60);
      counter += 1;
    }

    const now = new Date();
    const [inserted] = await db
      .insert(userPlaylists)
      .values({
        userId: params.userId,
        guildId: params.guildId,
        authorName: params.authorName,
        authorUsername: params.authorUsername,
        name: candidate,
        color: source.color,
        isPublic: false,
        tracksJson: JSON.stringify(source.tracks),
        trackCount: source.tracks.length,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    return hydratePlaylist(inserted, params.userId);
  }

  public static async deletePlaylist(
    userId: string,
    id: number
  ): Promise<UserPlaylist | null> {
    const existing = await this.getUserPlaylistById(userId, id);
    if (!existing) return null;

    await db
      .delete(userPlaylists)
      .where(and(eq(userPlaylists.id, id), eq(userPlaylists.userId, userId)));
    await ReactionService.deleteAllForTarget('playlist', id);

    return existing;
  }

  private static inputToSnapshot(input: FavoriteTrackInput): SavedTrackSnapshot {
    const cleanUrl = String(input.originalUrl || input.url || '').trim().slice(0, 500);
    const cleanTitle = String(input.title || cleanUrl || 'Unknown').trim().slice(0, 300);
    const source =
      input.source === 'spotify' || input.source === 'soundcloud'
        ? input.source
        : 'youtube';
    return {
      id: String(input.id || crypto.randomBytes(6).toString('hex')).slice(0, 128),
      title: cleanTitle,
      author: String(input.author || '').trim().slice(0, 200),
      url: String(input.url || cleanUrl).trim().slice(0, 500),
      originalUrl: cleanUrl || String(input.url || '').trim().slice(0, 500),
      durationSec: Math.max(0, Math.floor(Number(input.durationSec) || 0)),
      durationFormatted: String(input.durationFormatted || '0:00').slice(0, 32),
      thumbnail: input.thumbnail ? String(input.thumbnail).slice(0, 500) : null,
      source,
      streamKind: source === 'soundcloud' ? 'soundcloud-direct' : 'youtube',
    };
  }

  public static async addTrackToPlaylist(params: {
    userId: string;
    playlistId: number;
    track: FavoriteTrackInput;
  }): Promise<{ playlist: UserPlaylist; alreadyExists: boolean } | null> {
    const existing = await this.getUserPlaylistById(params.userId, params.playlistId);
    if (!existing) return null;

    const snapshot = this.inputToSnapshot(params.track);
    const incomingKey = buildTrackKey(snapshot);
    if (existing.tracks.some((t) => buildTrackKey(t) === incomingKey)) {
      return { playlist: existing, alreadyExists: true };
    }

    if (existing.tracks.length >= MAX_TRACKS_PER_PLAYLIST) {
      throw new Error(`Достигнут лимит треков в плейлисте (${MAX_TRACKS_PER_PLAYLIST}).`);
    }

    const nextTracks = [...existing.tracks, snapshot];
    const [updated] = await db
      .update(userPlaylists)
      .set({
        tracksJson: JSON.stringify(nextTracks),
        trackCount: nextTracks.length,
        updatedAt: new Date(),
      })
      .where(
        and(eq(userPlaylists.id, params.playlistId), eq(userPlaylists.userId, params.userId))
      )
      .returning();

    const reactionMap = await ReactionService.getSummaries(
      'playlist',
      [updated.id],
      params.userId
    );
    return {
      playlist: hydratePlaylist(updated, params.userId, reactionMap.get(updated.id)),
      alreadyExists: false,
    };
  }

  public static async removeTrackFromPlaylist(params: {
    userId: string;
    playlistId: number;
    trackKey?: string;
    index?: number;
  }): Promise<{ playlist: UserPlaylist; removed: boolean } | null> {
    const existing = await this.getUserPlaylistById(params.userId, params.playlistId);
    if (!existing) return null;

    let nextTracks = [...existing.tracks];
    let removed = false;

    if (typeof params.index === 'number' && Number.isInteger(params.index)) {
      if (params.index >= 0 && params.index < nextTracks.length) {
        nextTracks.splice(params.index, 1);
        removed = true;
      }
    } else if (params.trackKey) {
      const targetKey = params.trackKey.trim();
      const idx = nextTracks.findIndex((t) => buildTrackKey(t) === targetKey);
      if (idx !== -1) {
        nextTracks.splice(idx, 1);
        removed = true;
      }
    }

    if (!removed) {
      return { playlist: existing, removed: false };
    }

    const [updated] = await db
      .update(userPlaylists)
      .set({
        tracksJson: JSON.stringify(nextTracks),
        trackCount: nextTracks.length,
        updatedAt: new Date(),
      })
      .where(
        and(eq(userPlaylists.id, params.playlistId), eq(userPlaylists.userId, params.userId))
      )
      .returning();

    const reactionMap = await ReactionService.getSummaries(
      'playlist',
      [updated.id],
      params.userId
    );
    return {
      playlist: hydratePlaylist(updated, params.userId, reactionMap.get(updated.id)),
      removed: true,
    };
  }

  public static async createPlaylistWithTrack(params: {
    userId: string;
    guildId?: string | null;
    authorName?: string | null;
    authorUsername?: string | null;
    name: string;
    color?: string;
    isPublic?: boolean;
    track: FavoriteTrackInput;
  }): Promise<UserPlaylist> {
    const cleanName = params.name.trim().slice(0, 60);
    if (!cleanName) {
      throw new Error('Название плейлиста не может быть пустым.');
    }

    const existingList = await this.listUserPlaylists(params.userId);
    if (existingList.some((p) => p.name.toLowerCase() === cleanName.toLowerCase())) {
      throw new Error(`У вас уже есть плейлист с названием "${cleanName}".`);
    }
    if (existingList.length >= MAX_PLAYLISTS_PER_USER) {
      throw new Error(`Достигнут лимит сохранённых плейлистов (${MAX_PLAYLISTS_PER_USER}).`);
    }

    const snapshot = this.inputToSnapshot(params.track);
    const now = new Date();
    const [inserted] = await db
      .insert(userPlaylists)
      .values({
        userId: params.userId,
        guildId: params.guildId ?? null,
        authorName: params.authorName ?? null,
        authorUsername: params.authorUsername ?? null,
        name: cleanName,
        color: normalizeColor(params.color),
        isPublic: Boolean(params.isPublic),
        tracksJson: JSON.stringify([snapshot]),
        trackCount: 1,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    return hydratePlaylist(inserted, params.userId);
  }

  public static buildPlayableTracks(
    playlist: UserPlaylist,
    requestedBy: { id: string; tag: string }
  ): Track[] {
    return playlist.tracks.map((s) => ({
      ...s,
      uid: crypto.randomBytes(6).toString('hex'),
      requestedBy,
    }));
  }
}
