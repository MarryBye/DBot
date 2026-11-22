import ffmpegStatic from 'ffmpeg-static';
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import { PassThrough, type Readable } from 'node:stream';

let cachedFfmpegPath: string | null = null;

export function getFfmpegPath(): string {
  if (cachedFfmpegPath) return cachedFfmpegPath;

  const staticPath: string | null =
    typeof ffmpegStatic === 'string'
      ? ffmpegStatic
      : ((ffmpegStatic as unknown as { default?: string })?.default ?? null);

  if (staticPath && fs.existsSync(staticPath)) {
    cachedFfmpegPath = staticPath;
    return cachedFfmpegPath;
  }

  // Фолбэк на системный ffmpeg (например, /usr/bin/ffmpeg на Ubuntu/Oracle Cloud)
  cachedFfmpegPath = 'ffmpeg';
  return cachedFfmpegPath;
}

export interface PcmDecoderHandle {
  stdout: Readable;
  cleanup: () => void;
}

/**
 * Декодирует любой аудиофайл, URL (включая HLS .m3u8 и MP3) или Node Readable stream
 * в сырой PCM 48kHz stereo signed 16-bit LE (формат Discord Voice).
 */
export function spawnPcmDecoder(
  input: string | Readable,
  label = 'audio'
): PcmDecoderHandle {
  const ffmpegBin = getFfmpegPath();
  const isStream = typeof input !== 'string';

  const args: string[] = ['-loglevel', 'error'];

  if (!isStream && /^https?:\/\//i.test(input)) {
    args.push(
      '-reconnect', '1',
      '-reconnect_streamed', '1',
      '-reconnect_delay_max', '5',
      '-user_agent', 'Mozilla/5.0'
    );
  }

  args.push(
    '-i', isStream ? 'pipe:0' : input,
    '-vn',
    '-f', 's16le',
    '-ar', '48000',
    '-ac', '2',
    'pipe:1'
  );

  const proc: ChildProcess = spawn(ffmpegBin, args, {
    stdio: [isStream ? 'pipe' : 'ignore', 'pipe', 'pipe'],
  });

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
      console.error(`❌ [Stream:${label}] Ошибка входного потока:`, err?.message || err);
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
    if (msg && !msg.includes('Broken pipe') && !msg.includes('Error writing trailer')) {
      console.warn(`⚠️ [FFmpeg:${label}] ${msg.slice(0, 240)}`);
    }
  });

  proc.on('error', (err) => {
    console.error(`❌ [FFmpeg:${label}] Не удалось запустить ffmpeg:`, err.message);
  });

  return {
    stdout: proc.stdout!,
    cleanup,
  };
}

/**
 * Дожидается первых реальных PCM-байт от FFmpeg (до timeoutMs) без потери начала трека.
 * Если входной поток завис, вернул 403 или пуст — сразу отклоняет Promise и убивает процесс,
 * позволяя мгновенно переключиться на резервный источник (SoundCloud)!
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
      handle.cleanup();
      reject(new Error(`Таймаут ожидания аудиоданных (${Math.round(timeoutMs / 1000)}с)`));
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
      });
    };

    const onEnd = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      cleanupListeners();
      handle.cleanup();
      reject(new Error('Аудиопоток закрылся без передачи звуковых данных'));
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
