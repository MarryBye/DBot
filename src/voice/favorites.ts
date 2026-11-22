import { and, desc, eq } from 'drizzle-orm';
import crypto from 'node:crypto';
import { db } from '../db/index.js';
import { favoriteTracks } from '../db/schema.js';
import type { Track } from './music-resolver.js';

export interface FavoriteTrackInput {
  id?: string;
  title: string;
  author?: string;
  url?: string;
  originalUrl?: string;
  durationSec?: number;
  durationFormatted?: string;
  thumbnail?: string | null;
  source: 'youtube' | 'soundcloud' | 'spotify';
  mediaKind?: 'video' | 'music' | 'stream';
}

export interface FavoriteTrackItem {
  id: number;
  trackKey: string;
  trackId: string;
  title: string;
  author: string;
  url: string;
  originalUrl: string;
  durationSec: number;
  durationFormatted: string;
  thumbnail: string | null;
  source: 'youtube' | 'soundcloud' | 'spotify';
  mediaKind?: 'video' | 'music' | 'stream';
  createdAt: number;
}

const MAX_FAVORITES_PER_USER = 500;

export function buildTrackKey(track: {
  originalUrl?: string | null;
  url?: string | null;
  source?: string | null;
  id?: string | null;
  title?: string | null;
}): string {
  const rawUrl = (track.originalUrl || track.url || '').trim();
  if (rawUrl) {
    try {
      const parsed = new URL(rawUrl);
      // Канонизируем YouTube watch / youtu.be ссылки к единому ключу yt:<videoId>
      const host = parsed.hostname.toLowerCase();
      if (host === 'youtu.be') {
        const vid = parsed.pathname.replace(/^\/+/, '').split('/')[0];
        if (vid) return `yt:${vid}`;
      }
      if (host.endsWith('youtube.com')) {
        const v = parsed.searchParams.get('v');
        if (v) return `yt:${v}`;
      }
      parsed.hash = '';
      return parsed.toString().toLowerCase().slice(0, 400);
    } catch {
      return rawUrl.toLowerCase().slice(0, 400);
    }
  }
  const source = (track.source || 'youtube').toLowerCase();
  const id = (track.id || track.title || '').trim().toLowerCase();
  return `${source}:${id}`.slice(0, 400);
}

function hydrateFavorite(row: typeof favoriteTracks.$inferSelect): FavoriteTrackItem | null {
  try {
    const parsed = JSON.parse(row.trackJson) as FavoriteTrackInput;
    return {
      id: row.id,
      trackKey: row.trackKey,
      trackId: parsed.id || row.trackKey,
      title: parsed.title || 'Unknown',
      author: parsed.author || '',
      url: parsed.url || parsed.originalUrl || '',
      originalUrl: parsed.originalUrl || parsed.url || '',
      durationSec: Number(parsed.durationSec) || 0,
      durationFormatted: parsed.durationFormatted || '',
      thumbnail: parsed.thumbnail ?? null,
      source:
        parsed.source === 'spotify' || parsed.source === 'soundcloud'
          ? parsed.source
          : 'youtube',
      mediaKind: parsed.mediaKind,
      createdAt: row.createdAt,
    };
  } catch {
    return null;
  }
}

export class FavoriteService {
  public static async list(userId: string): Promise<FavoriteTrackItem[]> {
    const rows = await db
      .select()
      .from(favoriteTracks)
      .where(eq(favoriteTracks.userId, userId))
      .orderBy(desc(favoriteTracks.createdAt), desc(favoriteTracks.id));

    return rows
      .map(hydrateFavorite)
      .filter((item): item is FavoriteTrackItem => item !== null);
  }

  public static async toggle(
    userId: string,
    input: FavoriteTrackInput
  ): Promise<{ favorited: boolean; item: FavoriteTrackItem | null; trackKey: string }> {
    const cleanTitle = String(input.title || '').trim().slice(0, 300);
    const cleanUrl = String(input.originalUrl || input.url || '').trim().slice(0, 500);
    if (!cleanTitle && !cleanUrl) {
      throw new Error('Некорректные данные трека.');
    }

    const trackKey = buildTrackKey({
      originalUrl: cleanUrl,
      url: input.url,
      source: input.source,
      id: input.id,
      title: cleanTitle,
    });

    const [existing] = await db
      .select()
      .from(favoriteTracks)
      .where(and(eq(favoriteTracks.userId, userId), eq(favoriteTracks.trackKey, trackKey)))
      .limit(1);

    if (existing) {
      await db.delete(favoriteTracks).where(eq(favoriteTracks.id, existing.id));
      return { favorited: false, item: null, trackKey };
    }

    const currentAll = await db
      .select({ id: favoriteTracks.id })
      .from(favoriteTracks)
      .where(eq(favoriteTracks.userId, userId));
    if (currentAll.length >= MAX_FAVORITES_PER_USER) {
      throw new Error(`Достигнут лимит любимых треков (${MAX_FAVORITES_PER_USER}).`);
    }

    const payload: FavoriteTrackInput = {
      id: String(input.id || crypto.randomBytes(6).toString('hex')).slice(0, 128),
      title: cleanTitle || cleanUrl,
      author: String(input.author || '').trim().slice(0, 200),
      url: String(input.url || cleanUrl).trim().slice(0, 500),
      originalUrl: cleanUrl || String(input.url || '').trim().slice(0, 500),
      durationSec: Math.max(0, Math.floor(Number(input.durationSec) || 0)),
      durationFormatted: String(input.durationFormatted || '').slice(0, 32),
      thumbnail: input.thumbnail ? String(input.thumbnail).slice(0, 500) : null,
      source:
        input.source === 'spotify' || input.source === 'soundcloud'
          ? input.source
          : 'youtube',
      mediaKind: input.mediaKind,
    };

    const [inserted] = await db
      .insert(favoriteTracks)
      .values({
        userId,
        trackKey,
        trackJson: JSON.stringify(payload),
        createdAt: Date.now(),
      })
      .returning();

    return {
      favorited: true,
      item: hydrateFavorite(inserted),
      trackKey,
    };
  }

  public static async removeById(userId: string, id: number): Promise<boolean> {
    const [existing] = await db
      .select({ id: favoriteTracks.id })
      .from(favoriteTracks)
      .where(and(eq(favoriteTracks.userId, userId), eq(favoriteTracks.id, id)))
      .limit(1);
    if (!existing) return false;
    await db.delete(favoriteTracks).where(eq(favoriteTracks.id, id));
    return true;
  }

  public static async getById(userId: string, id: number): Promise<FavoriteTrackItem | null> {
    const [row] = await db
      .select()
      .from(favoriteTracks)
      .where(and(eq(favoriteTracks.userId, userId), eq(favoriteTracks.id, id)))
      .limit(1);
    return row ? hydrateFavorite(row) : null;
  }

  public static toPlayQuery(fav: FavoriteTrackItem): {
    query: string;
    platform: 'youtube' | 'soundcloud' | 'spotify';
  } {
    const query = fav.originalUrl || fav.url || `${fav.author} - ${fav.title}`;
    return { query, platform: fav.source };
  }

  public static toBasicTrack(
    fav: FavoriteTrackItem,
    requestedBy: { id: string; tag: string }
  ): Track {
    return {
      id: fav.trackId,
      uid: crypto.randomBytes(6).toString('hex'),
      title: fav.title,
      author: fav.author,
      url: fav.url,
      originalUrl: fav.originalUrl,
      durationSec: fav.durationSec,
      durationFormatted: fav.durationFormatted,
      thumbnail: fav.thumbnail,
      source: fav.source,
      streamKind: fav.source === 'soundcloud' ? 'soundcloud-direct' : 'youtube',
      mediaKind: fav.mediaKind,
      requestedBy,
    };
  }
}
