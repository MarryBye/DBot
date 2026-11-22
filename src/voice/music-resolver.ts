import { Client as YtdlClient, SearchType, Ytdl, chooseFormat } from '@distube/ytdl-core';
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
import {
  assertSafePublicHttpUrl,
  sanitizeYouTubeCookies,
} from '../web/security.js';

export type PlatformOption = 'auto' | 'youtube' | 'soundcloud' | 'spotify';
export type SearchResultKind = 'music' | 'video' | 'stream' | 'track' | 'playlist';

export interface SearchResultItem {
  id: string;
  title: string;
  author: string;
  url: string;
  durationSec: number;
  durationFormatted: string;
  thumbnail: string | null;
  source: 'youtube' | 'soundcloud' | 'spotify';
  kind: SearchResultKind;
  isLive?: boolean;
  trackCount?: number;
}

const MAX_PLAYLIST_IMPORT = 150;
const SEARCH_PAGE_SIZE = 6;
const SEARCH_MAX_PAGES = 5;
const SEARCH_CACHE_TTL_MS = 3 * 60 * 1000;
const SEARCH_CACHE_MAX_ENTRIES = 80;

export type TrackMediaKind = 'video' | 'music' | 'stream';

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
  mediaKind?: TrackMediaKind;
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
    const lstat = fs.lstatSync(COOKIE_FILE_PATH);
    if (lstat.isSymbolicLink() || !lstat.isFile()) {
      throw new Error('Файл data/cookies.txt не является обычным файлом (symlink запрещён).');
    }
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

  private static async apiGet(endpoint: string, signal?: AbortSignal): Promise<any> {
    let clientId = await this.getClientId();
    const sep = endpoint.includes('?') ? '&' : '?';
    let res = await fetch(`${endpoint}${sep}client_id=${clientId}`, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal,
    });

    if (res.status === 401 || res.status === 403) {
      clientId = await this.getClientId(true);
      res = await fetch(`${endpoint}${sep}client_id=${clientId}`, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal,
      });
    }

    if (!res.ok) {
      throw new Error(`SoundCloud API вернул ${res.status}`);
    }
    return res.json();
  }

  public static async searchTracks(
    query: string,
    limit = 8,
    offset = 0,
    signal?: AbortSignal
  ): Promise<any[]> {
    const data = await this.apiGet(
      `https://api-v2.soundcloud.com/search/tracks?q=${encodeURIComponent(query)}&limit=${limit}&offset=${offset}`,
      signal
    );
    return Array.isArray(data?.collection) ? data.collection : [];
  }

  public static async searchPlaylists(
    query: string,
    limit = 4,
    offset = 0,
    signal?: AbortSignal
  ): Promise<any[]> {
    const data = await this.apiGet(
      `https://api-v2.soundcloud.com/search/playlists?q=${encodeURIComponent(query)}&limit=${limit}&offset=${offset}`,
      signal
    );
    return Array.isArray(data?.collection) ? data.collection : [];
  }

  public static async fetchTracksByIds(ids: number[]): Promise<Map<number, any>> {
    const result = new Map<number, any>();
    const safeIds = ids.filter((id) => Number.isInteger(id) && id > 0);
    for (let i = 0; i < safeIds.length; i += 50) {
      const batch = safeIds.slice(i, i + 50);
      try {
        const items = await this.apiGet(
          `https://api-v2.soundcloud.com/tracks?ids=${batch.join(',')}`
        );
        if (Array.isArray(items)) {
          for (const item of items) {
            if (item && typeof item.id === 'number') {
              result.set(item.id, item);
            }
          }
        }
      } catch {
        // Если часть треков недоступна — не прерываем весь плейлист
      }
    }
    return result;
  }

  public static async resolveUrl(url: string): Promise<any> {
    return this.apiGet(
      `https://api-v2.soundcloud.com/resolve?url=${encodeURIComponent(url)}`
    );
  }

  public static async fetchMediaStreamUrl(transcodingUrl: string): Promise<string> {
    const validated = await assertSafePublicHttpUrl(transcodingUrl, {
      httpsOnly: true,
      allowedHosts: ['api-v2.soundcloud.com', 'soundcloud.com', '*.soundcloud.com'],
    });
    const data = await this.apiGet(validated.toString());
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
      mediaKind: 'music',
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

  public static async searchCatalog(
    query: string,
    limit = 6,
    offset = 0,
    signal?: AbortSignal
  ): Promise<SearchResultItem[]> {
    const results: SearchResultItem[] = [];
    const token = await this.getAppToken();

    if (token) {
      try {
        const trackLimit = Math.min(10, Math.max(1, limit));
        const plLimit = offset === 0 ? 2 : 1;
        const res = await fetch(
          `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track,playlist&limit=${trackLimit}&offset=${offset}`,
          { headers: { Authorization: `Bearer ${token}` }, signal }
        );
        if (res.ok) {
          const json = (await res.json()) as any;
          const trackItems: any[] = json?.tracks?.items ?? [];
          for (const item of trackItems) {
            if (!item?.id || !item?.name) continue;
            const artists = (item.artists ?? []).map((a: any) => a.name).join(', ') || 'Spotify';
            const durationSec = Math.round((item.duration_ms ?? 0) / 1000);
            results.push({
              id: String(item.id),
              title: item.name,
              author: artists,
              url: item.external_urls?.spotify ?? '',
              durationSec,
              durationFormatted: formatDuration(durationSec),
              thumbnail: item.album?.images?.[1]?.url ?? item.album?.images?.[0]?.url ?? null,
              source: 'spotify',
              kind: 'track',
            });
          }

          const playlistItems: any[] = (json?.playlists?.items ?? []).slice(0, plLimit);
          for (const pl of playlistItems) {
            if (!pl?.id || !pl?.name) continue;
            results.push({
              id: `pl-${pl.id}`,
              title: pl.name,
              author: pl.owner?.display_name || 'Spotify',
              url: pl.external_urls?.spotify ?? `https://open.spotify.com/playlist/${pl.id}`,
              durationSec: 0,
              durationFormatted: '',
              thumbnail: pl.images?.[0]?.url ?? null,
              source: 'spotify',
              kind: 'playlist',
              trackCount: typeof pl.tracks?.total === 'number' ? pl.tracks.total : undefined,
            });
          }
          if (results.length > 0) return results;
        }
      } catch {
        // Fallback below
      }
    }

    // Публичный фолбэк поиска треков (без URL чужого домена — при добавлении резолвится по названию и исполнителю)
    try {
      const dzRes = await fetch(
        `https://api.deezer.com/search/track?q=${encodeURIComponent(query)}&limit=${limit}&index=${offset}`,
        { signal }
      );
      if (dzRes.ok) {
        const dz = (await dzRes.json()) as any;
        const items: any[] = Array.isArray(dz?.data) ? dz.data : [];
        for (const item of items) {
          const artist = item.artist?.name ?? 'Artist';
          const title = item.title ?? query;
          const durationSec = Number(item.duration ?? 0);
          results.push({
            id: `dz-${item.id}`,
            title,
            author: artist,
            url: '',
            durationSec,
            durationFormatted: formatDuration(durationSec),
            thumbnail: item.album?.cover_medium ?? item.album?.cover_big ?? null,
            source: 'spotify',
            kind: 'track',
          });
        }
      }
    } catch {
      // ignore
    }

    return results;
  }

  public static async resolveUrl(
    url: string,
    requestedBy: { id: string; tag: string }
  ): Promise<Track[]> {
    const match = url.match(/open\.spotify\.com\/(?:intl-[a-z-]+\/)?(track|album|playlist)\/([a-zA-Z0-9]+)/);

    if (match) {
      const [, entityType, entityId] = match;

      // 1) При наличии ключей Spotify API — грузим полные плейлисты/альбомы с пагинацией до MAX_PLAYLIST_IMPORT
      const token = await this.getAppToken();
      if (token && (entityType === 'playlist' || entityType === 'album')) {
        try {
          const collected: Track[] = [];
          let nextUrl: string | null =
            entityType === 'playlist'
              ? `https://api.spotify.com/v1/playlists/${entityId}/tracks?limit=100`
              : `https://api.spotify.com/v1/albums/${entityId}/tracks?limit=50`;

          let albumCover: string | null = null;
          if (entityType === 'album') {
            const albRes = await fetch(`https://api.spotify.com/v1/albums/${entityId}`, {
              headers: { Authorization: `Bearer ${token}` },
            });
            if (albRes.ok) {
              const albJson = (await albRes.json()) as any;
              albumCover = albJson?.images?.[0]?.url ?? null;
            }
          }

          while (nextUrl && collected.length < MAX_PLAYLIST_IMPORT) {
            const apiRes = await fetch(nextUrl, {
              headers: { Authorization: `Bearer ${token}` },
            });
            if (!apiRes.ok) break;
            const pageData = (await apiRes.json()) as any;
            const items: any[] = Array.isArray(pageData?.items) ? pageData.items : [];
            for (const entry of items) {
              if (collected.length >= MAX_PLAYLIST_IMPORT) break;
              const t = entityType === 'playlist' ? entry?.track : entry;
              if (!t?.name) continue;
              const artists = (t.artists ?? []).map((a: any) => a.name).join(', ') || 'Spotify';
              const durationSec = Math.round((t.duration_ms ?? 0) / 1000);
              const trackId = String(t.id || makeUid());
              collected.push({
                uid: makeUid(),
                id: trackId,
                title: t.name,
                author: artists,
                url: '',
                originalUrl: t.external_urls?.spotify ?? url,
                searchQuery: `${artists} - ${t.name}`,
                durationSec,
                durationFormatted: formatDuration(durationSec),
                thumbnail: t.album?.images?.[0]?.url ?? albumCover,
                source: 'spotify',
                streamKind: 'youtube',
                requestedBy,
              });
            }
            nextUrl = null;
            if (typeof pageData?.next === 'string') {
              try {
                const parsedNext = new URL(pageData.next);
                if (parsedNext.protocol === 'https:' && parsedNext.hostname === 'api.spotify.com') {
                  nextUrl = parsedNext.toString();
                }
              } catch {
                nextUrl = null;
              }
            }
          }

          if (collected.length > 0) return collected;
        } catch (err) {
          console.warn('⚠️ Spotify Web API playlist fallback to embed:', err);
        }
      }

      // 2) Публичный Spotify embed (работает без API-ключей, отдаёт до 100 треков плейлиста/альбома)
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
              return entity.trackList.slice(0, MAX_PLAYLIST_IMPORT).map((item: any) => {
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
   * Автоматически вырезает все посторонние домены, проверяет формат и пишет атомарно с правами 0600.
   */
  public static updateCookies(
    rawContent: string,
    actorLabel = 'admin'
  ): YouTubeCookiesStatus & { keptCount: number; strippedCount: number } {
    const { sanitized, keptCount, strippedCount } = sanitizeYouTubeCookies(rawContent);

    // Сначала валидируем через Ytdl — если нет SAPISID / __Secure-3PAPISID, существующий файл не затрётся!
    const nextYtdl = createYtdlInstance(sanitized);

    if (fs.existsSync(COOKIE_FILE_PATH)) {
      const lstat = fs.lstatSync(COOKIE_FILE_PATH);
      if (lstat.isSymbolicLink() || !lstat.isFile()) {
        throw new Error('Целевой путь data/cookies.txt не является обычным файлом.');
      }
    }

    const tmpPath = path.join(dataDir, `.cookies.tmp.${crypto.randomBytes(6).toString('hex')}`);
    fs.writeFileSync(tmpPath, sanitized + '\n', { encoding: 'utf-8', mode: 0o600 });
    fs.renameSync(tmpPath, COOKIE_FILE_PATH);
    if (process.platform !== 'win32') {
      try {
        fs.chmodSync(COOKIE_FILE_PATH, 0o600);
      } catch {
        // ignore
      }
    }

    ytdl = nextYtdl;
    activeCookieSource = 'file';
    console.log(
      `🍪 [YouTube] Новые cookies применены на лету (кем: ${actorLabel}, оставлено youtube: ${keptCount}, отброшено посторонних: ${strippedCount})`
    );
    return {
      ...this.getCookiesStatus(),
      keptCount,
      strippedCount,
    };
  }

  /**
   * Перечитывает cookies с диска (data/cookies.txt или YT_COOKIE) и обновляет Ytdl на лету.
   */
  public static reloadCookiesFromDisk(actorLabel = 'admin'): YouTubeCookiesStatus {
    const loaded = loadYouTubeCookie();
    ytdl = createYtdlInstance(loaded.cookie);
    activeCookieSource = loaded.source;
    console.log(
      `🔄 [YouTube] Cookies перечитаны (кем: ${actorLabel}, источник: ${activeCookieSource})`
    );
    return this.getCookiesStatus();
  }

  /**
   * Удаляет data/cookies.txt и сбрасывает Ytdl на работу без cookies.
   */
  public static clearCookies(actorLabel = 'admin'): YouTubeCookiesStatus {
    if (fs.existsSync(COOKIE_FILE_PATH)) {
      const lstat = fs.lstatSync(COOKIE_FILE_PATH);
      if (lstat.isSymbolicLink() || !lstat.isFile()) {
        throw new Error('Целевой путь data/cookies.txt не является обычным файлом.');
      }
      fs.unlinkSync(COOKIE_FILE_PATH);
    }
    const fallbackEnv = config.ytCookie.trim().length > 10 ? config.ytCookie.trim() : undefined;
    ytdl = createYtdlInstance(fallbackEnv);
    activeCookieSource = fallbackEnv ? 'env' : 'none';
    console.log(`🗑️ [YouTube] Файл data/cookies.txt удалён (кем: ${actorLabel}).`);
    return this.getCookiesStatus();
  }

  private static parseSupportedUrl(rawUrl: string): {
    platform: 'spotify' | 'soundcloud' | 'youtube';
    normalizedUrl: string;
  } | null {
    let parsed: URL;
    try {
      parsed = new URL(rawUrl);
    } catch {
      return null;
    }

    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return null;
    }
    if (parsed.username || parsed.password) {
      return null;
    }

    const host = parsed.hostname.toLowerCase();
    if (host === 'open.spotify.com') {
      return { platform: 'spotify', normalizedUrl: parsed.toString() };
    }
    if (
      host === 'soundcloud.com' ||
      host === 'www.soundcloud.com' ||
      host === 'm.soundcloud.com' ||
      host === 'on.soundcloud.com'
    ) {
      return { platform: 'soundcloud', normalizedUrl: parsed.toString() };
    }
    if (
      host === 'youtube.com' ||
      host === 'www.youtube.com' ||
      host === 'm.youtube.com' ||
      host === 'music.youtube.com' ||
      host === 'youtu.be'
    ) {
      return { platform: 'youtube', normalizedUrl: parsed.toString() };
    }

    return null;
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

    const normalizedCandidate =
      !/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) &&
      !/\s/.test(trimmed) &&
      /^(www\.)?(youtube\.com|youtu\.be|music\.youtube\.com|open\.spotify\.com|soundcloud\.com|on\.soundcloud\.com)\//i.test(
        trimmed
      )
        ? `https://${trimmed}`
        : trimmed;

    const isUrl = /^[a-z][a-z0-9+.-]*:\/\//i.test(normalizedCandidate);

    if (isUrl) {
      const supported = this.parseSupportedUrl(normalizedCandidate);
      if (!supported) {
        throw new Error('Неподдерживаемая ссылка. Разрешены только YouTube, Spotify и SoundCloud.');
      }
      if (supported.platform === 'spotify') {
        return SpotifyClient.resolveUrl(supported.normalizedUrl, requestedBy);
      }
      if (supported.platform === 'soundcloud') {
        return this.resolveSoundCloudUrl(supported.normalizedUrl, requestedBy);
      }
      return this.resolveYouTubeUrl(supported.normalizedUrl, requestedBy);
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
        const sliced = resolved.tracks.slice(0, MAX_PLAYLIST_IMPORT);
        // SoundCloud API v2 возвращает только ID без метаданных для части треков плейлиста — дозагружаем их!
        const missingIds = sliced
          .filter((t: any) => t && !t.title && typeof t.id === 'number')
          .map((t: any) => t.id as number);
        const hydratedMap =
          missingIds.length > 0
            ? await SoundCloudClient.fetchTracksByIds(missingIds)
            : new Map<number, any>();

        const mapped: Track[] = [];
        for (const rawItem of sliced) {
          const fullTrack =
            rawItem && rawItem.title
              ? rawItem
              : typeof rawItem?.id === 'number'
                ? hydratedMap.get(rawItem.id)
                : null;
          if (fullTrack && fullTrack.title) {
            mapped.push(SoundCloudClient.mapRawTrack(fullTrack, requestedBy));
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

  private static async fetchYouTubeOEmbed(url: string): Promise<{
    title: string;
    author: string;
    thumbnail: string | null;
  } | null> {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5_000);
      try {
        const res = await fetch(
          `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`,
          { signal: controller.signal }
        );
        if (!res.ok) return null;
        const oe = (await res.json()) as {
          title?: string;
          author_name?: string;
          thumbnail_url?: string;
        };
        const title = String(oe.title || '').trim();
        if (!title) return null;
        return {
          title,
          author: String(oe.author_name || '').trim(),
          thumbnail: oe.thumbnail_url ?? null,
        };
      } finally {
        clearTimeout(timer);
      }
    } catch {
      return null;
    }
  }

  private static async resolveYouTubeUrl(
    url: string,
    requestedBy: { id: string; tag: string }
  ): Promise<Track[]> {
    let parsedUrl: URL | null = null;
    try {
      parsedUrl = new URL(url);
    } catch {
      parsedUrl = null;
    }

    const listId = parsedUrl?.searchParams.get('list')?.trim() || '';
    const isPlaylistPath = parsedUrl?.pathname === '/playlist';
    // Поддерживаем как /playlist?list=..., так и watch?v=...&list=PL... (кроме авто-радио RD без /playlist)
    const shouldLoadPlaylist =
      Boolean(listId) && (isPlaylistPath || !listId.startsWith('RD'));

    if (shouldLoadPlaylist) {
      try {
        const playlist = await ytdl.getPlaylist(url, { limit: MAX_PLAYLIST_IMPORT });
        const items = playlist?.videos ?? [];
        if (items.length > 0) {
          const isYtMusicUrl = parsedUrl?.hostname.toLowerCase() === 'music.youtube.com';
          return items.slice(0, MAX_PLAYLIST_IMPORT).map((item: any) => {
            const durationSec = Number(item.lengthSeconds ?? 0);
            const authorName = String(item.author?.name ?? '').trim() || 'YouTube';
            const rawTitle = String(item.title ?? '').trim();
            const isMusicTrack = isYtMusicUrl || authorName.endsWith(' - Topic');
            const mediaKind: TrackMediaKind = item.isLive
              ? 'stream'
              : isMusicTrack
                ? 'music'
                : 'video';
            return {
              uid: makeUid(),
              id: item.id,
              title: rawTitle || `YouTube (${item.id || 'Video'})`,
              author: authorName.replace(/ - Topic$/, ''),
              url: item.url,
              originalUrl: item.url,
              durationSec,
              durationFormatted: formatDuration(durationSec),
              thumbnail: item.thumbnails?.[0]?.url ?? (item.id ? `https://i.ytimg.com/vi/${item.id}/hqdefault.jpg` : null),
              source: 'youtube',
              mediaKind,
              streamKind: 'youtube',
              requestedBy,
            };
          });
        }
      } catch (err) {
        console.warn('⚠️ YouTube playlist fetch failed, trying single video:', err);
      }
    }

    const isYtMusicHost = parsedUrl?.hostname.toLowerCase() === 'music.youtube.com';

    try {
      const info = await ytdl.getInfo(url);
      const details = info.videoDetails;
      const durationSec = Number(details.lengthSeconds ?? 0);
      let title = String(details.title ?? '').trim();
      let authorName = String(details.author?.name ?? '').trim();
      let thumbnail: string | null = details.thumbnails?.[0]?.url ?? null;

      // Клиенты Tv/WebEmbedded иногда возвращают пустой title/author — добираем метаданные через oEmbed!
      if (!title || !authorName || !thumbnail) {
        const canonicalUrl = details.id ? `https://www.youtube.com/watch?v=${details.id}` : url;
        const oe = await this.fetchYouTubeOEmbed(canonicalUrl);
        if (oe) {
          if (!title) title = oe.title;
          if (!authorName) authorName = oe.author;
          if (!thumbnail) thumbnail = oe.thumbnail;
        }
      }

      const finalAuthor = authorName || 'YouTube';
      const finalTitle = title || (details.id ? `YouTube (${details.id})` : 'YouTube Video');
      const finalThumb =
        thumbnail || (details.id ? `https://i.ytimg.com/vi/${details.id}/hqdefault.jpg` : null);
      const isLive = Boolean((details as any).isLiveContent || (details as any).isLive);
      const isMusicTrack = isYtMusicHost || finalAuthor.endsWith(' - Topic');
      const mediaKind: TrackMediaKind = isLive
        ? 'stream'
        : isMusicTrack
          ? 'music'
          : 'video';

      return [
        {
          uid: makeUid(),
          id: details.id,
          title: finalTitle,
          author: finalAuthor.replace(/ - Topic$/, ''),
          url: details.url || url,
          originalUrl: url,
          durationSec,
          durationFormatted: formatDuration(durationSec),
          thumbnail: finalThumb,
          source: 'youtube',
          mediaKind,
          streamKind: 'youtube',
          requestedBy,
        },
      ];
    } catch (ytErr) {
      console.warn('⚠️ YouTube getInfo заблокирован, беру метаданные через oEmbed:', ytErr);
      const oe = await this.fetchYouTubeOEmbed(url);
      if (!oe) {
        throw new Error('Не удалось получить информацию о видео YouTube.');
      }
      const authorName = oe.author || 'YouTube';
      const isMusicTrack = isYtMusicHost || authorName.endsWith(' - Topic');
      return [
        {
          uid: makeUid(),
          id: makeUid(),
          title: oe.title,
          author: authorName.replace(/ - Topic$/, ''),
          url,
          originalUrl: url,
          searchQuery: cleanTrackQueryForFallback(oe.title, oe.author),
          durationSec: 0,
          durationFormatted: '0:00',
          thumbnail: oe.thumbnail,
          source: 'youtube',
          mediaKind: isMusicTrack ? 'music' : 'video',
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
    let title = String(first.title ?? '').trim();
    let authorName = String(first.author?.name ?? '').trim();
    let thumbnail: string | null = first.thumbnails?.[0]?.url ?? null;

    if (!title || !authorName) {
      const oe = await this.fetchYouTubeOEmbed(first.url);
      if (oe) {
        if (!title) title = oe.title;
        if (!authorName) authorName = oe.author;
        if (!thumbnail) thumbnail = oe.thumbnail;
      }
    }

    const finalAuthor = authorName || 'YouTube';
    const mediaKind: TrackMediaKind = first.isLive
      ? 'stream'
      : finalAuthor.endsWith(' - Topic')
        ? 'music'
        : 'video';

    return [
      {
        uid: makeUid(),
        id: first.id,
        title: title || query,
        author: finalAuthor.replace(/ - Topic$/, ''),
        url: first.url,
        originalUrl: first.url,
        durationSec,
        durationFormatted: formatDuration(durationSec),
        thumbnail: thumbnail || (first.id ? `https://i.ytimg.com/vi/${first.id}/hqdefault.jpg` : null),
        source: 'youtube',
        mediaKind,
        streamKind: 'youtube',
        requestedBy,
      },
    ];
  }

  private static searchCache = new Map<
    string,
    {
      items: SearchResultItem[];
      seenKeys: Set<string>;
      fetchedPages: number;
      exhausted: boolean;
      updatedAt: number;
    }
  >();

  private static pruneSearchCache(): void {
    const now = Date.now();
    for (const [key, entry] of this.searchCache.entries()) {
      if (now - entry.updatedAt > SEARCH_CACHE_TTL_MS) {
        this.searchCache.delete(key);
      }
    }
    while (this.searchCache.size > SEARCH_CACHE_MAX_ENTRIES) {
      const oldest = this.searchCache.keys().next().value;
      if (!oldest) break;
      this.searchCache.delete(oldest);
    }
  }

  private static mapYouTubeVideoToSearchItem(
    video: any,
    preferredKind: 'music' | 'video'
  ): SearchResultItem | null {
    if (!video?.id || !video?.url) return null;
    const isLive = Boolean(video.isLive);
    const authorName = video.author?.name || 'YouTube';
    const badges: string[] = Array.isArray(video.author?.badges) ? video.author.badges : [];
    const looksLikeMusic =
      preferredKind === 'music' ||
      authorName.endsWith(' - Topic') ||
      badges.some((b) => String(b).toLowerCase().includes('artist'));

    const kind: SearchResultKind = isLive ? 'stream' : looksLikeMusic ? 'music' : 'video';
    const durationSec = isLive ? 0 : Number(video.lengthSeconds ?? 0);

    return {
      id: `yt-${video.id}`,
      title: video.title || 'YouTube',
      author: authorName.replace(/ - Topic$/, ''),
      url: video.url,
      durationSec,
      durationFormatted: isLive ? '' : formatDuration(durationSec),
      thumbnail: video.thumbnails?.[0]?.url ?? null,
      source: 'youtube',
      kind,
      isLive,
    };
  }

  private static mapYouTubePlaylistToSearchItem(pl: any): SearchResultItem | null {
    if (!pl?.id || !pl?.url) return null;
    return {
      id: `ytpl-${pl.id}`,
      title: pl.title || 'YouTube Playlist',
      author: pl.author?.name || 'YouTube',
      url: pl.url,
      durationSec: 0,
      durationFormatted: '',
      thumbnail: pl.thumbnails?.[0]?.url ?? null,
      source: 'youtube',
      kind: 'playlist',
      trackCount: typeof pl.videoCount === 'number' ? pl.videoCount : undefined,
    };
  }

  private static mapSoundCloudTrackToSearchItem(raw: any): SearchResultItem | null {
    if (!raw?.id || !raw?.title) return null;
    const durationSec = Math.round((raw.duration ?? 0) / 1000);
    const artwork = raw.artwork_url
      ? String(raw.artwork_url).replace('-large.', '-t200x200.')
      : raw.user?.avatar_url ?? null;
    return {
      id: `sc-${raw.id}`,
      title: raw.title,
      author: raw.user?.username || 'SoundCloud',
      url: raw.permalink_url || '',
      durationSec,
      durationFormatted: formatDuration(durationSec),
      thumbnail: artwork,
      source: 'soundcloud',
      kind: 'track',
    };
  }

  private static mapSoundCloudPlaylistToSearchItem(raw: any): SearchResultItem | null {
    if (!raw?.id || !raw?.title || !raw?.permalink_url) return null;
    const artwork = raw.artwork_url
      ? String(raw.artwork_url).replace('-large.', '-t200x200.')
      : raw.user?.avatar_url ?? null;
    return {
      id: `scpl-${raw.id}`,
      title: raw.title,
      author: raw.user?.username || 'SoundCloud',
      url: raw.permalink_url,
      durationSec: 0,
      durationFormatted: '',
      thumbnail: artwork,
      source: 'soundcloud',
      kind: 'playlist',
      trackCount: typeof raw.track_count === 'number' ? raw.track_count : undefined,
    };
  }

  /**
   * Постепенный поиск треков, видео, стримов и плейлистов с кэшированием и пагинацией.
   * Вызывает onItem сразу, как только очередной провайдер отдаёт результаты.
   */
  public static async searchStream(
    rawQuery: string,
    platform: PlatformOption,
    rawPage: number,
    callbacks: {
      onItem: (item: SearchResultItem) => void;
      onComplete: (hasNextPage: boolean) => void;
    },
    signal?: AbortSignal
  ): Promise<void> {
    const query = rawQuery.trim();
    const page = Math.max(1, Math.min(SEARCH_MAX_PAGES, Math.floor(rawPage) || 1));
    if (!query) {
      callbacks.onComplete(false);
      return;
    }

    this.pruneSearchCache();

    const cacheKey = `${platform}:${query.toLowerCase()}`;
    let entry = this.searchCache.get(cacheKey);
    if (!entry) {
      entry = {
        items: [],
        seenKeys: new Set<string>(),
        fetchedPages: 0,
        exhausted: false,
        updatedAt: Date.now(),
      };
      this.searchCache.set(cacheKey, entry);
    }
    entry.updatedAt = Date.now();

    const startIdx = (page - 1) * SEARCH_PAGE_SIZE;
    const endIdx = page * SEARCH_PAGE_SIZE;

    // Отдаём уже закэшированные элементы текущей страницы сразу
    let emittedCount = 0;
    const emitIfInPage = (item: SearchResultItem, indexInCache: number) => {
      if (signal?.aborted) return;
      if (indexInCache >= startIdx && indexInCache < endIdx) {
        callbacks.onItem(item);
        emittedCount++;
      }
    };

    for (let i = startIdx; i < Math.min(endIdx, entry.items.length); i++) {
      emitIfInPage(entry.items[i], i);
    }

    // Если в кэше уже хватает элементов для всей страницы (или источник исчерпан) — завершаем
    if (entry.items.length >= endIdx || entry.exhausted) {
      const hasNext =
        page < SEARCH_MAX_PAGES &&
        (entry.items.length > endIdx || (!entry.exhausted && entry.items.length >= endIdx));
      callbacks.onComplete(hasNext);
      return;
    }

    const pushItem = (item: SearchResultItem | null) => {
      if (!item || signal?.aborted) return;
      const dedupeKey = `${item.source}:${item.id}`;
      if (entry!.seenKeys.has(dedupeKey)) return;
      entry!.seenKeys.add(dedupeKey);
      const nextIndex = entry!.items.length;
      entry!.items.push(item);
      emitIfInPage(item, nextIndex);
    };

    const countBefore = entry.items.length;
    const ytTargetLimit = Math.min(30, page * 6);
    const scOffset = Math.max(0, (page - 1) * 6);
    const spOffset = Math.max(0, (page - 1) * 6);

    // Ограничиваем, сколько элементов с одного провайдера уходит в первую пачку, чтобы на 1-й странице
    // всегда чередовались видео, музыка, плейлисты и разные платформы (а не 6 песен с одного провайдера).
    const perProviderBurstCap = platform === 'auto' ? 2 : 3;
    const overflowBuffer: SearchResultItem[] = [];

    const pushProviderItems = (items: Array<SearchResultItem | null>) => {
      let sent = 0;
      for (const item of items) {
        if (!item) continue;
        if (sent < perProviderBurstCap) {
          pushItem(item);
          sent++;
        } else {
          overflowBuffer.push(item);
        }
      }
    };

    const tasks: Array<Promise<void>> = [];

    if (platform === 'youtube' || platform === 'auto') {
      tasks.push(
        ytdl
          .search(query, {
            type: SearchType.Video,
            limit: platform === 'youtube' ? ytTargetLimit : Math.min(18, page * 4),
            signal,
          })
          .then((videos) => {
            pushProviderItems(
              videos.map((v) => this.mapYouTubeVideoToSearchItem(v, 'video'))
            );
          })
          .catch(() => {})
      );

      tasks.push(
        ytdl
          .search(query, {
            type: SearchType.Song,
            limit: platform === 'youtube' ? ytTargetLimit : Math.min(18, page * 4),
            signal,
          })
          .then((songs) => {
            pushProviderItems(
              songs.map((s) => this.mapYouTubeVideoToSearchItem(s, 'music'))
            );
          })
          .catch(() => {})
      );

      if (page <= 2) {
        tasks.push(
          ytdl
            .search(query, {
              type: SearchType.Playlist,
              limit: platform === 'youtube' ? 4 : 2,
              signal,
            })
            .then((playlists) => {
              pushProviderItems(
                playlists.map((pl) => this.mapYouTubePlaylistToSearchItem(pl))
              );
            })
            .catch(() => {})
        );
      }
    }

    if (platform === 'soundcloud' || platform === 'auto') {
      tasks.push(
        SoundCloudClient.searchTracks(
          query,
          platform === 'soundcloud' ? 8 : 4,
          scOffset,
          signal
        )
          .then((tracks) => {
            pushProviderItems(
              tracks.map((t) => this.mapSoundCloudTrackToSearchItem(t))
            );
          })
          .catch(() => {})
      );

      if (page <= 2) {
        tasks.push(
          SoundCloudClient.searchPlaylists(
            query,
            platform === 'soundcloud' ? 3 : 2,
            0,
            signal
          )
            .then((playlists) => {
              pushProviderItems(
                playlists.map((pl) => this.mapSoundCloudPlaylistToSearchItem(pl))
              );
            })
            .catch(() => {})
        );
      }
    }

    if (platform === 'spotify' || platform === 'auto') {
      tasks.push(
        SpotifyClient.searchCatalog(
          query,
          platform === 'spotify' ? 8 : 4,
          spOffset,
          signal
        )
          .then((items) => {
            pushProviderItems(items);
          })
          .catch(() => {})
      );
    }

    await Promise.allSettled(tasks);
    if (signal?.aborted) return;

    // Досыпаем оставшиеся результаты из всех провайдеров (для дозаполнения текущей и следующих страниц)
    for (const item of overflowBuffer) {
      pushItem(item);
    }

    entry.fetchedPages = Math.max(entry.fetchedPages, page);
    const addedThisFetch = entry.items.length - countBefore;
    if (addedThisFetch === 0 && entry.items.length <= endIdx) {
      entry.exhausted = true;
    }

    const hasNext =
      page < SEARCH_MAX_PAGES &&
      (entry.items.length > endIdx || (!entry.exhausted && emittedCount >= SEARCH_PAGE_SIZE));
    callbacks.onComplete(hasNext);
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
      const parsedPlayable = track.url ? this.parseSupportedUrl(track.url) : null;
      let playableUrl =
        parsedPlayable?.platform === 'youtube' ? parsedPlayable.normalizedUrl : '';
      if (!playableUrl) {
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

        if (!track.title?.trim() || track.title.startsWith('YouTube (')) {
          const liveTitle = String(info.videoDetails?.title || '').trim();
          if (liveTitle) {
            track.title = liveTitle;
          } else {
            const oe = await this.fetchYouTubeOEmbed(playableUrl);
            if (oe?.title) track.title = oe.title;
            if ((!track.author || track.author === 'YouTube') && oe?.author) {
              track.author = oe.author;
            }
            if (!track.thumbnail && oe?.thumbnail) {
              track.thumbnail = oe.thumbnail;
            }
          }
        }
        if (track.durationSec <= 0 && info.videoDetails?.lengthSeconds) {
          track.durationSec = Number(info.videoDetails.lengthSeconds);
          track.durationFormatted = formatDuration(track.durationSec);
        }

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
