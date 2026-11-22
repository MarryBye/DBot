import ffmpegStatic from 'ffmpeg-static';
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { PassThrough, Readable } from 'node:stream';
import type { ReadableStream as WebReadableStream } from 'node:stream/web';
import { soundsDir } from '../db/index.js';
import { assertSafePublicHttpUrl, safeFetch } from '../web/security.js';

let cachedFfmpegPath: string | null = null;

export function getFfmpegPath(): string {
  if (cachedFfmpegPath) return cachedFfmpegPath;

  // На Linux (Ubuntu / Oracle Cloud) всегда предпочитаем системный /usr/bin/ffmpeg —
  // у него полноценный системный OpenSSL, CA-сертификаты, HLS и оптимизация под CPU!
  if (process.platform !== 'win32') {
    for (const sysPath of ['/usr/bin/ffmpeg', '/usr/local/bin/ffmpeg']) {
      if (fs.existsSync(sysPath)) {
        cachedFfmpegPath = sysPath;
        console.log(`🎬 [FFmpeg] Используется системный бинарник: ${cachedFfmpegPath}`);
        return cachedFfmpegPath;
      }
    }
  }

  const staticPath: string | null =
    typeof ffmpegStatic === 'string'
      ? ffmpegStatic
      : ((ffmpegStatic as unknown as { default?: string })?.default ?? null);

  if (staticPath && fs.existsSync(staticPath)) {
    cachedFfmpegPath = staticPath;
    console.log(`🎬 [FFmpeg] Используется ffmpeg-static: ${cachedFfmpegPath}`);
    return cachedFfmpegPath;
  }

  cachedFfmpegPath = 'ffmpeg';
  console.log(`🎬 [FFmpeg] Используется ffmpeg из PATH`);
  return cachedFfmpegPath;
}

export interface PcmDecoderHandle {
  stdout: Readable;
  cleanup: () => void;
  getLastError?: () => string;
}

/**
 * Декодирует локальный файл, URL (HLS .m3u8) или Node Readable stream
 * в сырой PCM 48kHz stereo signed 16-bit LE (формат Discord Voice).
 */
export function spawnPcmDecoder(
  input: string | Readable,
  label = 'audio'
): PcmDecoderHandle {
  const ffmpegBin = getFfmpegPath();
  const isStream = typeof input !== 'string';

  const args: string[] = ['-loglevel', 'error'];
  let safeInputArg = 'pipe:0';

  if (isStream) {
    args.push('-protocol_whitelist', 'pipe');
  } else {
    const trimmed = input.trim();
    if (!trimmed || trimmed.startsWith('-') || /[\0\r\n]/.test(trimmed)) {
      throw new Error('Недопустимый источник аудиопотока.');
    }

    if (/^https?:\/\//i.test(trimmed)) {
      // Строго ограничиваем протоколы FFmpeg (исключает file://, concat:, subfile: внутри HLS .m3u8!)
      args.push(
        '-protocol_whitelist', 'http,https,tcp,tls,crypto',
        '-reconnect', '1',
        '-reconnect_streamed', '1',
        '-reconnect_delay_max', '5',
        '-user_agent', 'Mozilla/5.0'
      );
      safeInputArg = trimmed;
    } else {
      // Локальные файлы разрешены ТОЛЬКО внутри папки data/sounds/ (никаких .env или data/cookies.txt!)
      const realSoundsRoot = fs.realpathSync(soundsDir);
      const lstat = fs.lstatSync(trimmed);
      if (lstat.isSymbolicLink() || !lstat.isFile()) {
        throw new Error('Запрещённый локальный файл аудио.');
      }
      const realFile = fs.realpathSync(trimmed);
      if (!realFile.startsWith(realSoundsRoot + path.sep)) {
        throw new Error('Доступ к файлам вне библиотеки саундборда запрещён.');
      }
      args.push('-protocol_whitelist', 'file');
      safeInputArg = realFile;
    }
  }

  args.push(
    '-i', safeInputArg,
    '-vn',
    '-f', 's16le',
    '-ar', '48000',
    '-ac', '2',
    'pipe:1'
  );

  const proc: ChildProcess = spawn(ffmpegBin, args, {
    stdio: [isStream ? 'pipe' : 'ignore', 'pipe', 'pipe'],
  });

  let stderrBuf = '';
  let exitCode: number | null = null;
  let cleaned = false;

  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    if (isStream) {
      try {
        input.unpipe(proc.stdin ?? undefined);
        input.destroy();
      } catch {}
    }
    if (!proc.killed) {
      try {
        proc.kill('SIGKILL');
      } catch {}
    }
  };

  if (isStream && proc.stdin) {
    input.pipe(proc.stdin);
    input.on('error', (err) => {
      const msg = err?.message || String(err);
      stderrBuf += (stderrBuf ? ' | ' : '') + `InputStreamError: ${msg}`;
      console.error(`❌ [Stream:${label}] Ошибка входного потока:`, msg);
      try {
        proc.stdin?.end();
      } catch {}
      cleanup();
    });
    proc.stdin.on('error', () => {
      // EPIPE при досрочной остановке — нормальное явление
    });
  }

  proc.stderr?.on('data', (chunk: Buffer) => {
    const msg = chunk.toString('utf-8').trim();
    if (msg) {
      stderrBuf = (stderrBuf + ' ' + msg).trim().slice(-400);
      if (!msg.includes('Broken pipe') && !msg.includes('Error writing trailer')) {
        console.warn(`⚠️ [FFmpeg:${label}] ${msg.slice(0, 240)}`);
      }
    }
  });

  proc.on('close', (code) => {
    exitCode = code;
  });

  proc.on('error', (err) => {
    stderrBuf += ` SpawnError: ${err.message}`;
    console.error(`❌ [FFmpeg:${label}] Не удалось запустить ffmpeg:`, err.message);
  });

  return {
    stdout: proc.stdout!,
    cleanup,
    getLastError: () => {
      const parts: string[] = [];
      if (exitCode !== null && exitCode !== 0) parts.push(`exit=${exitCode}`);
      if (stderrBuf) parts.push(stderrBuf);
      return parts.join(' | ');
    },
  };
}

/**
 * Надёжное декодирование аудио по HTTP/HTTPS URL:
 * - Для обычных аудиофайлов (.mp3, progressive) скачивает через встроенный Node fetch()
 *   и подаёт в ffmpeg через pipe:0 (никаких проблем с TLS/SSL внутри FFmpeg!).
 * - Для HLS (.m3u8) передаёт URL напрямую системному /usr/bin/ffmpeg.
 */
export async function spawnPcmDecoderFromUrl(
  url: string,
  label = 'url'
): Promise<PcmDecoderHandle> {
  // Гарантируем, что URL ведёт строго на публичный HTTP(S)-ресурс (блокирует SSRF / file:// / IMDS)
  const validated = await assertSafePublicHttpUrl(url);
  const safeUrl = validated.toString();

  const isHls = validated.pathname.includes('.m3u8') || validated.pathname.includes('/hls/');
  if (isHls) {
    return spawnPcmDecoder(safeUrl, label);
  }

  const res = await safeFetch(safeUrl, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
    timeoutMs: 15_000,
  });

  if (!res.ok || !res.body) {
    throw new Error(`HTTP ${res.status} при загрузке аудио (${label})`);
  }

  const nodeStream = Readable.fromWeb(res.body as unknown as WebReadableStream);
  return spawnPcmDecoder(nodeStream, label);
}

/**
 * Дожидается первых реальных PCM-байт от FFmpeg (до timeoutMs) без потери начала трека.
 * Если входной поток завис, вернул 403 или пуст — сразу отклоняет Promise с точной причиной
 * из stderr FFmpeg и убивает процесс.
 */
export async function verifyPcmStream(
  handle: PcmDecoderHandle,
  timeoutMs = 10_000
): Promise<PcmDecoderHandle> {
  return new Promise((resolve, reject) => {
    let settled = false;

    const cleanupListeners = () => {
      handle.stdout.off('data', onData);
      handle.stdout.off('end', onEnd);
      handle.stdout.off('close', onEnd);
      handle.stdout.off('error', onError);
    };

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanupListeners();
      const details = handle.getLastError?.();
      handle.cleanup();
      reject(
        new Error(
          `Таймаут ожидания аудиоданных (${Math.round(timeoutMs / 1000)}с)${details ? ` [${details}]` : ''}`
        )
      );
    }, timeoutMs);

    const onData = (firstChunk: Buffer) => {
      if (settled) return;
      if (!firstChunk || firstChunk.length === 0) return;
      settled = true;
      clearTimeout(timer);
      cleanupListeners();

      const merged = new PassThrough({ highWaterMark: 128 * 1024 });
      merged.write(firstChunk);
      handle.stdout.pipe(merged);
      handle.stdout.on('error', (err) => {
        if (!merged.destroyed) merged.destroy(err);
      });

      resolve({
        stdout: merged,
        cleanup: () => {
          try {
            handle.stdout.unpipe(merged);
            merged.destroy();
          } catch {}
          handle.cleanup();
        },
        getLastError: handle.getLastError,
      });
    };

    const onEnd = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      cleanupListeners();
      // Даём 60мс чтобы stderr успел дописать причину выхода FFmpeg
      setTimeout(() => {
        const details = handle.getLastError?.();
        handle.cleanup();
        reject(
          new Error(
            `Аудиопоток закрылся без передачи звуковых данных${details ? ` (${details})` : ''}`
          )
        );
      }, 60);
    };

    const onError = (err: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      cleanupListeners();
      handle.cleanup();
      reject(err);
    };

    handle.stdout.on('data', onData);
    handle.stdout.once('end', onEnd);
    handle.stdout.once('close', onEnd);
    handle.stdout.once('error', onError);
  });
}
