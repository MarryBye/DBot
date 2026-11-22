import {
  AudioResource,
  createAudioResource,
  StreamType,
} from '@discordjs/voice';
import { Ytdl } from '@distube/ytdl-core';
import ffmpegStatic from 'ffmpeg-static';
import { spawn, type ChildProcess } from 'node:child_process';
import crypto from 'node:crypto';
import { Readable } from 'node:stream';
import type { ReadableStream as WebReadableStream } from 'node:stream/web';
import { config } from '../config.js';

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

export interface PlayableResource {
  resource: AudioResource;
  cleanup: () => void;
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

  // Поддержка слитного формата: yt:название, sc:название, sp:название
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

  // Поддержка раздельного формата: +play sc phonk (только если есть сам запрос после платформы)
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

const ytdl = new Ytdl();

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

  public static async searchTracks(query: string, limit = 5): Promise<any[]> {
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

    // Если трек Go+ (policy === 'SNIP' / preview 30с), лучше найти полную версию на YouTube
    const isSnipOnly = raw.policy === 'SNIP' || raw.monetization_model === 'SUB_HIGH_TIER';
    const transcodings: any[] = Array.isArray(raw.media?.transcodings)
      ? raw.media.transcodings
      : [];

    const progressive = transcodings.find(
      (t) => t?.format?.protocol === 'progressive' && !t?.snipped
    );
    const hls = transcodings.find((t) => t?.format?.protocol === 'hls' && !t?.snipped);
    const chosen = !isSnipOnly ? progressive ?? hls : null;

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
      soundcloudProtocol: chosen?.format?.protocol === 'progressive' ? 'progressive' : 'hls',
      requestedBy,
    };
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
    // 1. Если настроены ключи Spotify API — ищем напрямую в Spotify
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
            searchQuery: `${artists} - ${item.name} audio`,
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

    // 2. Без ключей Spotify используем открытый каталог Deezer для точных метаданных студийного трека
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
            searchQuery: `${artist} - ${title} audio`,
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
      // Фолбэк ниже
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
                  searchQuery: `${artists} - ${entity.name} audio`,
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
                  searchQuery: `${artist} - ${title} audio`,
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

    // Фолбэк на oEmbed
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
        searchQuery: `${data.title} audio`,
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

    // 1. Прямые ссылки всегда определяются автоматически по домену
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

    // 2. Текстовый поиск по выбранной платформе
    if (platform === 'soundcloud') {
      return this.searchSoundCloud(trimmed, requestedBy);
    }

    if (platform === 'spotify') {
      const spTrack = await SpotifyClient.searchTrackByName(trimmed, requestedBy);
      if (spTrack) return [spTrack];
      // Фолбэк на YouTube, если каталог не ответил
      return this.searchYouTube(trimmed, requestedBy);
    }

    if (platform === 'youtube') {
      return this.searchYouTube(trimmed, requestedBy);
    }

    // 3. Режим AUTO: пробуем YouTube, при ошибке/пустом результате автоматически фолбэк на SoundCloud
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
    const tracks = await SoundCloudClient.searchTracks(query, 5);
    if (!tracks.length) {
      throw new Error(`На SoundCloud ничего не найдено по запросу "${query}".`);
    }
    // Предпочитаем полные треки (не SNIP/Go+ превью)
    const best =
      tracks.find((t) => t.policy !== 'SNIP' && t.media?.transcodings?.length > 0) ?? tracks[0];
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

    // Фолбэк на oEmbed
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
    // Проверяем явный плейлист YouTube
    if (url.includes('/playlist?list=') || (url.includes('list=') && !url.includes('watch?v=') && !url.includes('youtu.be/'))) {
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
   * Создаёт готовый AudioResource для трека (поддерживает ленивое разрешение URL, SoundCloud direct/HLS и YouTube).
   */
  public static async createAudioResourceForTrack(
    track: Track,
    volumePercent: number
  ): Promise<PlayableResource> {
    // 1. Попытка прямого стриминга SoundCloud (если доступно)
    if (track.streamKind === 'soundcloud-direct' && track.soundcloudTranscodingUrl) {
      try {
        const mediaUrl = await SoundCloudClient.fetchMediaStreamUrl(
          track.soundcloudTranscodingUrl
        );

        if (track.soundcloudProtocol === 'progressive') {
          const res = await fetch(mediaUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
          if (res.ok && res.body) {
            const nodeStream = Readable.fromWeb(res.body as unknown as WebReadableStream);
            const resource = createAudioResource(nodeStream, { inlineVolume: true });
            resource.volume?.setVolume(volumePercent / 100);
            return {
              resource,
              cleanup: () => {
                nodeStream.destroy();
              },
            };
          }
        } else {
          const ffmpegBin: string | null =
            typeof ffmpegStatic === 'string'
              ? ffmpegStatic
              : ((ffmpegStatic as unknown as { default?: string })?.default ?? null);
          if (ffmpegBin) {
          // HLS (.m3u8) декодируем напрямую через ffmpeg-static в raw PCM 48kHz stereo
          const proc: ChildProcess = spawn(
            ffmpegBin,
            [
              '-reconnect', '1',
              '-reconnect_streamed', '1',
              '-reconnect_delay_max', '5',
              '-i', mediaUrl,
              '-analyzeduration', '0',
              '-loglevel', '0',
              '-f', 's16le',
              '-ar', '48000',
              '-ac', '2',
              'pipe:1',
            ],
            { stdio: ['ignore', 'pipe', 'ignore'] }
          );

          if (proc.stdout) {
            const resource = createAudioResource(proc.stdout, {
              inputType: StreamType.Raw,
              inlineVolume: true,
            });
            resource.volume?.setVolume(volumePercent / 100);
            return {
              resource,
              cleanup: () => {
                if (!proc.killed) proc.kill('SIGKILL');
              },
            };
          }
          }
        }
      } catch (scErr) {
        console.warn(
          `⚠️ Прямой поток SoundCloud недоступен для "${track.title}", переключаюсь на YouTube:`,
          scErr
        );
      }
    }

    // 2. Ленивый поиск на YouTube (для треков Spotify / плейлистов / фолбэка SoundCloud)
    let playableUrl = track.url;
    if (!playableUrl || !playableUrl.includes('youtube.com') && !playableUrl.includes('youtu.be')) {
      const q = track.searchQuery || `${track.author} - ${track.title}`;
      const results = await ytdl.search(q);
      const best = results[0];
      if (!best) {
        throw new Error(`Не удалось найти аудиопоток для "${track.title}"`);
      }
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

    const rawStream = await ytdl.download(playableUrl, {
      filter: { hasAudio: true, hasVideo: false },
      highWaterMark: 1 << 25,
    });

    const resource = createAudioResource(rawStream, {
      inlineVolume: true,
    });
    resource.volume?.setVolume(volumePercent / 100);

    return {
      resource,
      cleanup: () => {
        rawStream.destroy();
      },
    };
  }
}
