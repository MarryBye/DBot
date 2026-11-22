import { AudioResource, createAudioResource } from '@discordjs/voice';
import { and, desc, eq } from 'drizzle-orm';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import type { ReadableStream as WebReadableStream } from 'node:stream/web';
import { db, soundsDir } from '../db/index.js';
import { sounds, type SoundRecord } from '../db/schema.js';
import {
  assertTrustedMyInstantsAudioUrl,
  MYINSTANTS_ALLOWED_HOSTS,
  readResponseBufferWithLimit,
  safeFetch,
} from '../web/security.js';

export interface MemeSound {
  name: string;
  slug: string;
  url: string;
  color: string;
}

const SAFE_AUDIO_MIME_BY_EXT: Record<string, string> = {
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.m4a': 'audio/mp4',
  '.webm': 'audio/webm',
  '.flac': 'audio/flac',
};

const ALLOWED_EXTENSIONS = new Set(Object.keys(SAFE_AUDIO_MIME_BY_EXT));
const MAX_SOUND_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
const MAX_SOUNDS_PER_GUILD = 100;

export function getSafeAudioMimeType(filename: string): string {
  const ext = path.extname(filename || '').toLowerCase();
  return SAFE_AUDIO_MIME_BY_EXT[ext] ?? 'audio/mpeg';
}

function looksLikeActiveWebDocument(buffer: Buffer): boolean {
  const head = buffer.subarray(0, 512).toString('utf-8').trimStart().toLowerCase();
  return (
    head.startsWith('<!doctype') ||
    head.startsWith('<html') ||
    head.startsWith('<script') ||
    head.startsWith('<svg') ||
    head.startsWith('<?xml')
  );
}

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#(\d+);/g, (_, num) => String.fromCharCode(Number(num)));
}

function normalizeColor(color?: string | null): string {
  if (!color) return '#5865f2';
  const clean = color.trim().replace(/^#/, '');
  if (/^[0-9a-fA-F]{6}$/.test(clean)) return `#${clean}`;
  return '#5865f2';
}

// ========================================================
// MyInstants API v1 + Trending Мемы (без сторонних пакетов)
// ========================================================
export class MyInstantsClient {
  private static trendingCache = new Map<
    string,
    { items: MemeSound[]; fetchedAt: number }
  >();

  public static async search(query: string, limit = 20): Promise<MemeSound[]> {
    const trimmed = query.trim();
    if (!trimmed) return this.getTrending('ru', limit);

    const res = await fetch(
      `https://www.myinstants.com/api/v1/instants/?name=${encodeURIComponent(trimmed)}`,
      { headers: { 'User-Agent': 'Mozilla/5.0' } }
    );

    if (!res.ok) {
      throw new Error(`MyInstants API вернул код ${res.status}`);
    }

    const data = (await res.json()) as {
      results?: Array<{
        name: string;
        slug: string;
        sound: string;
        color?: string;
      }>;
    };

    const results = data.results ?? [];
    return results
      .filter((item) => item?.sound && item.sound.startsWith('http'))
      .slice(0, limit)
      .map((item) => ({
        name: decodeHtmlEntities(item.name || 'Meme Sound').trim(),
        slug: item.slug || crypto.randomBytes(4).toString('hex'),
        url: item.sound,
        color: normalizeColor(item.color),
      }));
  }

  public static async getTrending(
    region: 'ru' | 'us' = 'ru',
    limit = 24
  ): Promise<MemeSound[]> {
    const cached = this.trendingCache.get(region);
    if (cached && Date.now() - cached.fetchedAt < 10 * 60 * 1000) {
      return cached.items.slice(0, limit);
    }

    const pageUrl =
      region === 'ru'
        ? 'https://www.myinstants.com/en/index/ru/'
        : 'https://www.myinstants.com/en/index/us/';

    const res = await fetch(pageUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });

    if (!res.ok) {
      throw new Error(`MyInstants trending вернул код ${res.status}`);
    }

    const html = await res.text();
    const regex =
      /background-color:(#[0-9a-fA-F]{6});[\s\S]*?onclick="play\('(\/media\/sounds\/[^']+)'[\s\S]*?class="instant-link[^"]*">([^<]+)<\/a>/g;

    const items: MemeSound[] = [];
    const seen = new Set<string>();

    for (const match of html.matchAll(regex)) {
      const soundUrl = `https://www.myinstants.com${match[2]}`;
      if (seen.has(soundUrl)) continue;
      seen.add(soundUrl);
      const name = decodeHtmlEntities(match[3]).trim();
      const slug = path.basename(match[2], path.extname(match[2]));
      items.push({
        name,
        slug,
        url: soundUrl,
        color: normalizeColor(match[1]),
      });
      if (items.length >= 40) break;
    }

    this.trendingCache.set(region, { items, fetchedAt: Date.now() });
    return items.slice(0, limit);
  }
}

// ========================================================
// Хранилище локальных звуков (SQLite + data/sounds/)
// ========================================================
export class SoundboardService {
  public static async listCustomSounds(guildId: string): Promise<SoundRecord[]> {
    return db
      .select()
      .from(sounds)
      .where(eq(sounds.guildId, guildId))
      .orderBy(desc(sounds.createdAt));
  }

  public static async getCustomSoundById(
    guildId: string,
    id: number
  ): Promise<SoundRecord | null> {
    const [row] = await db
      .select()
      .from(sounds)
      .where(and(eq(sounds.guildId, guildId), eq(sounds.id, id)))
      .limit(1);
    return row ?? null;
  }

  public static async findCustomSoundByName(
    guildId: string,
    name: string
  ): Promise<SoundRecord | null> {
    const all = await this.listCustomSounds(guildId);
    const target = name.trim().toLowerCase();
    return (
      all.find((s) => s.name.toLowerCase() === target) ??
      all.find((s) => s.name.toLowerCase().includes(target)) ??
      null
    );
  }

  public static getSoundFilePath(sound: SoundRecord): string {
    const safeName = path.basename(sound.filename);
    const full = path.resolve(soundsDir, safeName);
    const root = path.resolve(soundsDir);
    if (!full.startsWith(root + path.sep)) {
      throw new Error('Некорректный путь к аудиофайлу.');
    }
    return full;
  }

  public static async saveCustomSound(params: {
    guildId: string;
    name: string;
    buffer: Buffer;
    originalFilename: string;
    mimeType?: string;
    color?: string;
    emoji?: string;
    uploadedById: string;
    uploadedByTag: string;
  }): Promise<SoundRecord> {
    const cleanName = params.name.trim().slice(0, 50);
    if (!cleanName) {
      throw new Error('Название звука не может быть пустым.');
    }

    if (params.buffer.length === 0) {
      throw new Error('Аудиофайл пуст.');
    }
    if (params.buffer.length > MAX_SOUND_SIZE_BYTES) {
      throw new Error('Файл слишком большой (максимум 10 МБ).');
    }
    if (looksLikeActiveWebDocument(params.buffer)) {
      throw new Error('Загруженный файл не является аудиофайлом (обнаружен HTML/SVG/XML).');
    }

    const rawExt = path.extname(params.originalFilename || '').toLowerCase() || '.mp3';
    const ext = ALLOWED_EXTENSIONS.has(rawExt) ? rawExt : '.mp3';

    // Проверяем лимит и дубликат по имени (без учёта регистра)
    const existing = await this.listCustomSounds(params.guildId);
    if (existing.length >= MAX_SOUNDS_PER_GUILD) {
      throw new Error(`Достигнут лимит звуков на сервере (${MAX_SOUNDS_PER_GUILD}).`);
    }
    if (existing.some((s) => s.name.toLowerCase() === cleanName.toLowerCase())) {
      throw new Error(`Звук с названием "${cleanName}" уже существует.`);
    }

    const safeFileName = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`;
    const fullPath = path.join(soundsDir, safeFileName);
    await fs.promises.writeFile(fullPath, params.buffer);

    // НИКОГДА не доверяем client-supplied mimeType (защита от Stored XSS через text/html!)
    const mimeType = getSafeAudioMimeType(safeFileName);

    const [inserted] = await db
      .insert(sounds)
      .values({
        guildId: params.guildId,
        name: cleanName,
        filename: safeFileName,
        mimeType,
        color: normalizeColor(params.color),
        emoji: (params.emoji || '🔊').trim().slice(0, 8) || '🔊',
        uploadedById: params.uploadedById,
        uploadedByTag: params.uploadedByTag,
      })
      .returning();

    return inserted;
  }

  public static async saveSoundFromUrl(params: {
    guildId: string;
    name: string;
    url: string;
    color?: string;
    emoji?: string;
    uploadedById: string;
    uploadedByTag: string;
  }): Promise<SoundRecord> {
    // Строго разрешаем только проверенные HTTPS аудиоссылки MyInstants (блокирует SSRF / IMDS!)
    const validated = await assertTrustedMyInstantsAudioUrl(params.url);

    const res = await safeFetch(validated.toString(), {
      httpsOnly: true,
      allowedHosts: MYINSTANTS_ALLOWED_HOSTS,
      timeoutMs: 15_000,
    });
    if (!res.ok) {
      throw new Error(`Не удалось скачать аудио (код ${res.status})`);
    }
    const buffer = await readResponseBufferWithLimit(res, MAX_SOUND_SIZE_BYTES);
    const filename = path.basename(validated.pathname) || 'sound.mp3';

    return this.saveCustomSound({
      guildId: params.guildId,
      name: params.name,
      buffer,
      originalFilename: filename,
      color: params.color,
      emoji: params.emoji || '😂',
      uploadedById: params.uploadedById,
      uploadedByTag: params.uploadedByTag,
    });
  }

  public static async deleteCustomSound(
    guildId: string,
    id: number
  ): Promise<SoundRecord | null> {
    const existing = await this.getCustomSoundById(guildId, id);
    if (!existing) return null;

    await db
      .delete(sounds)
      .where(and(eq(sounds.guildId, guildId), eq(sounds.id, id)));

    const filePath = this.getSoundFilePath(existing);
    if (fs.existsSync(filePath)) {
      await fs.promises.unlink(filePath).catch(() => {});
    }

    return existing;
  }

  public static async createResourceFromFile(
    filePath: string,
    volumePercent: number
  ): Promise<AudioResource> {
    if (!fs.existsSync(filePath)) {
      throw new Error('Аудиофайл не найден на диске.');
    }
    const stream = fs.createReadStream(filePath);
    const resource = createAudioResource(stream, { inlineVolume: true });
    resource.volume?.setVolume(Math.max(0.05, Math.min(1.5, volumePercent / 100)));
    return resource;
  }

  public static async createResourceFromUrl(
    url: string,
    volumePercent: number
  ): Promise<AudioResource> {
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!res.ok || !res.body) {
      throw new Error(`Не удалось загрузить звук по URL (код ${res.status})`);
    }
    const stream = Readable.fromWeb(res.body as unknown as WebReadableStream);
    const resource = createAudioResource(stream, { inlineVolume: true });
    resource.volume?.setVolume(Math.max(0.05, Math.min(1.5, volumePercent / 100)));
    return resource;
  }
}
