import { AudioResource, createAudioResource, StreamType } from '@discordjs/voice';
import { PassThrough } from 'node:stream';
import type { PcmDecoderHandle } from './ffmpeg.js';

const FRAME_MS = 20;
const FRAME_BYTES = 3840; // 48000 Hz * 0.02s * 2 ch * 2 bytes (s16le)
const SAMPLES_PER_FRAME = FRAME_BYTES / 2; // 1920 Int16 samples
const MAX_BUFFER_BYTES = FRAME_BYTES * 64; // ~240 KB (~1.28s предбуфер на источник)
const MAX_OUTPUT_QUEUE_BYTES = FRAME_BYTES * 6; // 120мс запас против джиттера CPU (мемы всё равно мгновенные!)

const DUCK_TARGET_GAIN = 0.18; // Музыка приглушается до 18% во время мема
const DUCK_DOWN_STEP = 0.14;   // Быстрое плавное приглушение (~120мс)
const DUCK_UP_STEP = 0.045;    // Плавный возврат громкости (~360мс)

class BufferedPcmSource {
  public readonly name: string;
  public totalBytesReceived = 0;
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
      this.totalBytesReceived += chunk.length;
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

  public get bufferedKB(): number {
    return Math.round(this.bufferedBytes / 1024);
  }

  public readFrame(): Buffer | null {
    if (this.closed || this.bufferedBytes === 0) return null;

    const toRead = Math.min(FRAME_BYTES, this.bufferedBytes);
    const out = Buffer.alloc(FRAME_BYTES);
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
  workerId: number;
  onMusicEnd: () => void;
  onSfxStateChange: (activeNames: string[]) => void;
}

/**
 * Реалтайм PCM-микшер (48kHz Stereo s16le):
 * - Жёсткий контроль backpressure (не более 40мс буфера на выходе -> нулевая задержка мемов!).
 * - Плавно приглушает музыку до 18% при запуске любого мема/звука и плавно возвращает громкость обратно.
 * - Поддерживает наложение до 4 звуков одновременно поверх музыки.
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

  // Диагностика первых 2.5с воспроизведения каждого трека
  private diagFramesTotal = 0;
  private diagMusicFrames = 0;
  private diagNonZeroFrames = 0;
  private diagPeak = 0;
  private diagLogged = true;

  constructor(callbacks: AudioMixerCallbacks) {
    this.callbacks = callbacks;
  }

  public get activeSfxNames(): string[] {
    return this.sfxSources.map((s) => s.name);
  }

  public get isActive(): boolean {
    return this.output !== null && !this.output.destroyed;
  }

  public get hasActiveAudio(): boolean {
    return (this.musicSource !== null && !this.musicSource.isFinished) || this.sfxSources.length > 0;
  }

  public ensureResource(forceRecreate = false): { resource: AudioResource | null; created: boolean } {
    if (this.output && !this.output.destroyed && !forceRecreate) {
      return { resource: null, created: false };
    }

    this.stopLoopAndCloseOutput();

    this.output = new PassThrough({ highWaterMark: FRAME_BYTES * 12 });
    const resource = createAudioResource(this.output, {
      inputType: StreamType.Raw,
      inlineVolume: false,
    });

    // Сразу прогреваем буфер 3 кадрами (60мс), чтобы AudioPlayer не голодал на холодном старте
    for (let i = 0; i < 3; i++) {
      if (this.output && !this.output.destroyed) {
        this.processFrame();
      }
    }

    this.startLoop();
    return { resource, created: true };
  }

  public setMusic(name: string, handle: PcmDecoderHandle): void {
    if (this.musicSource) {
      this.musicSource.destroy();
    }
    this.musicPaused = false;
    this.musicSource = new BufferedPcmSource(name, handle);
    this.diagFramesTotal = 0;
    this.diagMusicFrames = 0;
    this.diagNonZeroFrames = 0;
    this.diagPeak = 0;
    this.diagLogged = false;
  }

  public clearMusic(): void {
    if (this.musicSource) {
      this.musicSource.destroy();
      this.musicSource = null;
    }
    this.musicPaused = false;
    this.diagLogged = true;
  }

  public addSfx(name: string, handle: PcmDecoderHandle): void {
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
    if (this.nextTickNs < now - 100_000_000n) {
      this.nextTickNs = now;
    }
    const delayMs = Math.max(0, Number(this.nextTickNs - now) / 1_000_000);

    this.tickTimer = setTimeout(() => {
      this.tickTimer = null;
      this.processFrame();
      if (this.output && !this.output.destroyed) {
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
    if (!this.output || this.output.destroyed) return;

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
      if (!this.diagLogged) {
        this.diagLogged = true;
        console.log(
          `📊 [Mixer #${this.callbacks.workerId}] Трек завершился рано: frames=${this.diagMusicFrames}/${this.diagFramesTotal}, nonZero=${this.diagNonZeroFrames}, peak=${this.diagPeak}, totalKB=${Math.round(this.musicSource.totalBytesReceived / 1024)}`
        );
      }
      this.musicSource.destroy();
      this.musicSource = null;
      this.callbacks.onMusicEnd();
    }

    // 3. Если больше нет ни музыки, ни SFX — аккуратно закрываем выходной поток
    if (!this.musicSource && this.sfxSources.length === 0) {
      this.currentDuckGain = 1.0;
      this.stopLoopAndCloseOutput();
      return;
    }

    // 4. Жёсткий backpressure (проверяем И readableLength, И writableLength!)
    if (this.output.readableLength + this.output.writableLength >= MAX_OUTPUT_QUEUE_BYTES) {
      return;
    }

    // 5. Плавное приглушение музыки (Audio Ducking), когда играет хотя бы один звук саундборда
    const hasActiveSfx = this.sfxSources.length > 0;
    const targetDuck = hasActiveSfx ? DUCK_TARGET_GAIN : 1.0;
    if (this.currentDuckGain > targetDuck) {
      this.currentDuckGain = Math.max(targetDuck, this.currentDuckGain - DUCK_DOWN_STEP);
    } else if (this.currentDuckGain < targetDuck) {
      this.currentDuckGain = Math.min(targetDuck, this.currentDuckGain + DUCK_UP_STEP);
    }

    // 6. Читаем 20мс кадр музыки (если не на паузе) и кадры всех активных SFX
    const musicFrame =
      this.musicSource && !this.musicPaused ? this.musicSource.readFrame() : null;

    const sfxFrames: Buffer[] = [];
    for (const sfx of this.sfxSources) {
      const f = sfx.readFrame();
      if (f) sfxFrames.push(f);
    }

    const outFrame = Buffer.alloc(FRAME_BYTES);
    let framePeak = 0;

    if (musicFrame || sfxFrames.length > 0) {
      const masterGain = this.volume / 100;
      const musicGain = masterGain * this.currentDuckGain;
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

        if (sample > 32767) sample = 32767;
        else if (sample < -32768) sample = -32768;

        const intSample = sample | 0;
        const absVal = intSample < 0 ? -intSample : intSample;
        if (absVal > framePeak) framePeak = absVal;

        outFrame.writeInt16LE(intSample, byteOffset);
      }
    }

    // Однократный лог диагностики через 2.5с (125 кадров) после старта трека
    if (!this.diagLogged && this.musicSource && !this.musicPaused) {
      this.diagFramesTotal++;
      if (musicFrame) this.diagMusicFrames++;
      if (framePeak > 50) this.diagNonZeroFrames++;
      if (framePeak > this.diagPeak) this.diagPeak = framePeak;

      if (this.diagFramesTotal >= 125) {
        this.diagLogged = true;
        console.log(
          `📊 [Mixer #${this.callbacks.workerId}] 2.5с: musicFrames=${this.diagMusicFrames}/125, nonZero=${this.diagNonZeroFrames}, peak=${this.diagPeak}, bufKB=${this.musicSource.bufferedKB}, totalKB=${Math.round(this.musicSource.totalBytesReceived / 1024)}`
        );
      }
    }

    this.output.write(outFrame);
  }
}
