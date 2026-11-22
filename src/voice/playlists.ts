import { and, desc, eq } from 'drizzle-orm';
import crypto from 'node:crypto';
import { db } from '../db/index.js';
import { userPlaylists } from '../db/schema.js';
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
  name: string;
  trackCount: number;
  tracks: SavedTrackSnapshot[];
  createdAt: Date;
  updatedAt: Date;
}

const MAX_PLAYLISTS_PER_USER = 50;
const MAX_TRACKS_PER_PLAYLIST = 200;

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

function hydratePlaylist(row: typeof userPlaylists.$inferSelect): UserPlaylist {
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
    name: row.name,
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

    return rows.map(hydratePlaylist);
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

    return row ? hydratePlaylist(row) : null;
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
    name: string;
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

    const existingList = await this.listUserPlaylists(params.userId);
    const sameName = existingList.find(
      (p) => p.name.toLowerCase() === cleanName.toLowerCase()
    );

    if (sameName) {
      const [updated] = await db
        .update(userPlaylists)
        .set({
          name: cleanName,
          tracksJson,
          trackCount: snapshots.length,
          updatedAt: now,
        })
        .where(
          and(eq(userPlaylists.id, sameName.id), eq(userPlaylists.userId, params.userId))
        )
        .returning();

      return { playlist: hydratePlaylist(updated), overwritten: true };
    }

    if (existingList.length >= MAX_PLAYLISTS_PER_USER) {
      throw new Error(`Достигнут лимит сохранённых плейлистов (${MAX_PLAYLISTS_PER_USER}).`);
    }

    const [inserted] = await db
      .insert(userPlaylists)
      .values({
        userId: params.userId,
        name: cleanName,
        tracksJson,
        trackCount: snapshots.length,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    return { playlist: hydratePlaylist(inserted), overwritten: false };
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

    return existing;
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
