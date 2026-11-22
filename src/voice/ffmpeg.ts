import ffmpegStatic from 'ffmpeg-static';
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import type { Readable } from 'node:stream';

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
export function spawnPcmDecoder(input: string | Readable): PcmDecoderHandle {
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

  if (isStream && proc.stdin) {
    input.pipe(proc.stdin);
    input.on('error', () => {
      try {
        proc.stdin?.end();
      } catch {}
    });
    proc.stdin.on('error', () => {
      // EPIPE при досрочной остановке — нормальное явление
    });
  }

  proc.stderr?.on('data', (chunk: Buffer) => {
    const msg = chunk.toString('utf-8').trim();
    if (msg && !msg.includes('Broken pipe')) {
      console.warn(`⚠️ [FFmpeg] ${msg.slice(0, 200)}`);
    }
  });

  const cleanup = () => {
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

  return {
    stdout: proc.stdout!,
    cleanup,
  };
}
