import { AudioResource, createAudioResource, StreamType } from '@discordjs/voice';
import { PassThrough } from 'node:stream';
import type { PcmDecoderHandle } from './ffmpeg.js';

const FRAME_MS = 20;
const FRAME_BYTES = 3840; // 48000 Hz * 0.02s * 2 ch * 2 bytes (s16le)
const SAMPLES_PER_FRAME = FRAME_BYTES / 2; // 1920 Int16 samples
const MAX_BUFFER_BYTES = FRAME_BYTES * 64; // ~240 KB (~1.28s предбуфер)

const DUCK_TARGET_GAIN = 0.18; // Музыка приглушается до 18% во время мема
const DUCK_DOWN_STEP = 0.14;   // Быстрое плавное приглушение (~120мс)
const DUCK_UP_STEP = 0.045;    // Плавный возврат громкости (~360мс)

class BufferedPcmSource {
  public readonly name: string;
  private handle: PcmDecoderHandle;
  private chunks: Buffer[] = [];
  private bufferedBytes = 0;
  private ended = false;
  private closed = false;
  private isPausedBackpressure = false;

  constructor(name: string, handle: PcmDecoderHandle) {
    this.name = name;
    this.handle = handle;

    handle.stdout.on('data', (chunk: Buffer) => {
      if (this.closed) return;
      this.chunks.push(chunk);
      this.bufferedBytes += chunk.length;
      if (this.bufferedBytes >= MAX_BUFFER_BYTES && !this.isPausedBackpressure) {
        this.isPausedBackpressure = true;
        handle.stdout.pause();
      }
    });

    handle.stdout.on('end', () => {
      this.ended = true;
    });

    handle.stdout.on('close', () => {
      this.ended = true;
    });

    handle.stdout.on('error', () => {
      this.ended = true;
    });
  }

  public get isFinished(): boolean {
    return this.closed || (this.ended && this.bufferedBytes === 0);
  }

  public get hasData(): boolean {
    return this.bufferedBytes > 0;
  }

  /**
   * Извлекает ровно FRAME_BYTES (или меньше, если поток заканчивается).
   * Возвращает null, если данных временно нет (буферизация) или поток завершён.
   */
  public readFrame(): Buffer | null {
    if (this.closed || this.bufferedBytes === 0) return null;

    const toRead = Math.min(FRAME_BYTES, this.bufferedBytes);
    const out = Buffer.alloc(FRAME_BYTES); // остаток автоматически заполнен нулями (тишина)
    let offset = 0;

    while (offset < toRead && this.chunks.length > 0) {
      const head = this.chunks[0];
      const need = toRead - offset;
      if (head.length <= need) {
        head.copy(out, offset);
        offset += head.length;
        this.chunks.shift();
      } else {
        head.copy(out, offset, 0, need);
        this.chunks[0] = head.subarray(need);
        offset += need;
      }
    }

    this.bufferedBytes -= toRead;

    if (this.isPausedBackpressure && this.bufferedBytes < MAX_BUFFER_BYTES / 2) {
      this.isPausedBackpressure = false;
      try {
        this.handle.stdout.resume();
      } catch {}
    }

    return out;
  }

  public destroy(): void {
    if (this.closed) return;
    this.closed = true;
    this.ended = true;
    this.chunks = [];
    this.bufferedBytes = 0;
    this.handle.cleanup();
  }
}

export interface AudioMixerCallbacks {
  onMusicEnd: () => void;
  onSfxStateChange: (activeNames: string[]) => void;
}

/**
 * Реалтайм PCM-микшер (48kHz Stereo s16le):
 * - Воспроизводит музыку и звуки саундборда одновременно в одном потоке.
 * - Плавно приглушает музыку до 18% при запуске любого мема/звука и плавно возвращает громкость обратно!
 * - Поддерживает наложение нескольких звуков одновременно без паузы музыки.
 */
export class AudioMixer {
  public volume = 80;
  public musicPaused = false;

  private output: PassThrough | null = null;
  private musicSource: BufferedPcmSource | null = null;
  private sfxSources: BufferedPcmSource[] = [];
  private currentDuckGain = 1.0;
  private tickTimer: NodeJS.Timeout | null = null;
  private nextTickNs = 0n;
  private callbacks: AudioMixerCallbacks;

  constructor(callbacks: AudioMixerCallbacks) {
    this.callbacks = callbacks;
  }

  public get activeSfxNames(): string[] {
    return this.sfxSources.map((s) => s.name);
  }

  public get isActive(): boolean {
    return this.output !== null;
  }

  /**
   * Создаёт (если ещё не запущен) непрерывный Raw PCM AudioResource для AudioPlayer.
   */
  public ensureResource(): { resource: AudioResource; created: boolean } {
    if (this.output) {
      return { resource: null as unknown as AudioResource, created: false };
    }

    this.output = new PassThrough({ highWaterMark: FRAME_BYTES * 8 });
    const resource = createAudioResource(this.output, {
      inputType: StreamType.Raw,
      inlineVolume: false, // громкость и ducking управляются прямо в микшере с нулевой задержкой
    });

    this.startLoop();
    return { resource, created: true };
  }

  public setMusic(name: string, handle: PcmDecoderHandle): void {
    if (this.musicSource) {
      this.musicSource.destroy();
    }
    this.musicPaused = false;
    this.musicSource = new BufferedPcmSource(name, handle);
  }

  public clearMusic(): void {
    if (this.musicSource) {
      this.musicSource.destroy();
      this.musicSource = null;
    }
    this.musicPaused = false;
  }

  public addSfx(name: string, handle: PcmDecoderHandle): void {
    // Ограничиваем максимум 4 одновременных наложенных звука
    if (this.sfxSources.length >= 4) {
      const oldest = this.sfxSources.shift();
      oldest?.destroy();
    }
    this.sfxSources.push(new BufferedPcmSource(name, handle));
    this.callbacks.onSfxStateChange(this.activeSfxNames);
  }

  public setVolume(vol: number): number {
    this.volume = Math.max(1, Math.min(100, Math.round(vol)));
    return this.volume;
  }

  public pauseMusic(): void {
    this.musicPaused = true;
  }

  public resumeMusic(): void {
    this.musicPaused = false;
  }

  public stopAll(): void {
    this.clearMusic();
    for (const s of this.sfxSources) {
      s.destroy();
    }
    this.sfxSources = [];
    this.currentDuckGain = 1.0;
    this.stopLoopAndCloseOutput();
  }

  private startLoop(): void {
    if (this.tickTimer) return;
    this.nextTickNs = process.hrtime.bigint();
    this.scheduleNextTick();
  }

  private scheduleNextTick(): void {
    const now = process.hrtime.bigint();
    this.nextTickNs += BigInt(FRAME_MS) * 1_000_000n;
    // Если сильно отстали (например, GC пауза), синхронизируемся
    if (this.nextTickNs < now - 100_000_000n) {
      this.nextTickNs = now;
    }
    const delayMs = Math.max(0, Number(this.nextTickNs - now) / 1_000_000);

    this.tickTimer = setTimeout(() => {
      this.tickTimer = null;
      this.processFrame();
      if (this.output) {
        this.scheduleNextTick();
      }
    }, delayMs);
  }

  private stopLoopAndCloseOutput(): void {
    if (this.tickTimer) {
      clearTimeout(this.tickTimer);
      this.tickTimer = null;
    }
    if (this.output) {
      try {
        this.output.end();
      } catch {}
      this.output = null;
    }
  }

  private processFrame(): void {
    if (!this.output) return;

    // 1. Очищаем завершившиеся SFX
    const prevSfxCount = this.sfxSources.length;
    if (prevSfxCount > 0) {
      const remaining: BufferedPcmSource[] = [];
      for (const sfx of this.sfxSources) {
        if (sfx.isFinished) {
          sfx.destroy();
        } else {
          remaining.push(sfx);
        }
      }
      if (remaining.length !== prevSfxCount) {
        this.sfxSources = remaining;
        this.callbacks.onSfxStateChange(this.activeSfxNames);
      }
    }

    // 2. Проверяем завершение текущего музыкального трека
    if (this.musicSource && !this.musicPaused && this.musicSource.isFinished) {
      this.musicSource.destroy();
      this.musicSource = null;
      this.callbacks.onMusicEnd();
    }

    // 3. Если больше нет ни музыки, ни SFX — аккуратно завершаем выходной поток
    if (!this.musicSource && this.sfxSources.length === 0) {
      this.currentDuckGain = 1.0;
      this.stopLoopAndCloseOutput();
      return;
    }

    // 4. Плавное приглушение музыки (Audio Ducking), когда играет хотя бы один звук саундборда
    const hasActiveSfx = this.sfxSources.length > 0;
    const targetDuck = hasActiveSfx ? DUCK_TARGET_GAIN : 1.0;
    if (this.currentDuckGain > targetDuck) {
      this.currentDuckGain = Math.max(targetDuck, this.currentDuckGain - DUCK_DOWN_STEP);
    } else if (this.currentDuckGain < targetDuck) {
      this.currentDuckGain = Math.min(targetDuck, this.currentDuckGain + DUCK_UP_STEP);
    }

    // 5. Читаем 20мс кадр музыки (если не на паузе) и кадры всех активных SFX
    const musicFrame =
      this.musicSource && !this.musicPaused ? this.musicSource.readFrame() : null;

    const sfxFrames: Buffer[] = [];
    for (const sfx of this.sfxSources) {
      const f = sfx.readFrame();
      if (f) sfxFrames.push(f);
    }

    const outFrame = Buffer.alloc(FRAME_BYTES);

    if (musicFrame || sfxFrames.length > 0) {
      const masterGain = this.volume / 100;
      const musicGain = masterGain * this.currentDuckGain;
      // Мемы звучат чётко поверх приглушённой музыки
      const sfxGain = Math.min(1.25, masterGain * 1.1);

      for (let i = 0; i < SAMPLES_PER_FRAME; i++) {
        const byteOffset = i * 2;
        let sample = 0;

        if (musicFrame) {
          sample += musicFrame.readInt16LE(byteOffset) * musicGain;
        }
        for (let j = 0; j < sfxFrames.length; j++) {
          sample += sfxFrames[j].readInt16LE(byteOffset) * sfxGain;
        }

        // Защита от клиппинга (перегруза)
        if (sample > 32767) sample = 32767;
        else if (sample < -32768) sample = -32768;

        outFrame.writeInt16LE(sample | 0, byteOffset);
      }
    }

    this.output.write(outFrame);
  }
}
