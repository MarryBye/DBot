import { AudioPlayerStatus } from '@discordjs/voice';
import {
  spawnPcmDecoder,
  spawnPcmDecoderFromUrl,
  verifyPcmStream,
} from './ffmpeg.js';
import { AudioMixer } from './mixer.js';
import { MusicResolver, type Track } from './music-resolver.js';
import type { VoiceWorker } from './worker-pool.js';

export const IDLE_PLAYBACK_TIMEOUT_MS = 5 * 60 * 1000; // 5 минут без воспроизведения музыки
export const MAX_QUEUE_SIZE = 500; // Защита от переполнения памяти очередью

export interface SoundEffectPlayback {
  name: string;
  filePath?: string;
  url?: string;
}

export class AudioQueue {
  public readonly worker: VoiceWorker;
  public readonly mixer: AudioMixer;
  public tracks: Track[] = [];
  public currentTrack: Track | null = null;
  public volume = 80;
  public loopMode: 'off' | 'track' | 'queue' = 'off';
  public isPaused = false;
  public startedAt: number | null = null;
  public pausedAt: number | null = null;
  public totalPausedMs = 0;
  public idleLeaveAt: number | null = null;
  public activeSfxName: string | null = null;

  private idleTimeout: NodeJS.Timeout | null = null;

  constructor(worker: VoiceWorker) {
    this.worker = worker;

    this.mixer = new AudioMixer({
      workerId: worker.id,
      onMusicEnd: () => {
        this.handleTrackEnd();
      },
      onSfxStateChange: (activeNames) => {
        this.activeSfxName = activeNames.length > 0 ? activeNames[activeNames.length - 1] : null;
        if (activeNames.length === 0 && (!this.currentTrack || this.isPaused)) {
          this.startIdleTimer();
        }
        this.worker.notifyStateChange();
      },
    });

    this.setupPlayerEvents();
  }

  private setupPlayerEvents() {
    this.worker.player.on('error', (err) => {
      console.error(`❌ [Queue #${this.worker.id}] Ошибка AudioPlayer:`, err.message);
      this.mixer.stopAll();
      this.handleTrackEnd();
    });

    this.worker.player.on('stateChange', (oldState, newState) => {
      if (oldState.status !== newState.status) {
        console.log(`🎚️ [Player #${this.worker.id}] ${oldState.status} → ${newState.status}`);
      }
      if (newState.status === AudioPlayerStatus.Idle) {
        // Самовосстановление: если плеер неожиданно ушёл в Idle при ещё живом треке/меме,
        // автоматически переподключаем выходной поток микшера!
        if (this.worker.currentChannelId && this.mixer.hasActiveAudio && !this.isPaused) {
          console.warn(
            `🔄 [Player #${this.worker.id}] Неожиданный переход в Idle во время воспроизведения — восстанавливаю поток!`
          );
          setTimeout(() => {
            if (this.worker.currentChannelId && this.mixer.hasActiveAudio && !this.isPaused) {
              this.ensureMixerPlaying();
            }
          }, 50);
          return;
        }

        if (!this.currentTrack && this.mixer.activeSfxNames.length === 0) {
          this.startIdleTimer();
          this.worker.notifyStateChange();
        }
      }
    });
  }

  private ensureMixerPlaying() {
    if (this.worker.connection) {
      this.worker.connection.subscribe(this.worker.player);
    }

    const playerStatus = this.worker.player.state.status;
    // Если плеер по какой-то причине в Idle, принудительно пересоздаём выходной поток микшера!
    const needRecreate = playerStatus === AudioPlayerStatus.Idle;
    const { resource, created } = this.mixer.ensureResource(needRecreate);

    if (created && resource) {
      this.worker.player.play(resource);
    } else if (playerStatus === AudioPlayerStatus.Paused || playerStatus === AudioPlayerStatus.AutoPaused) {
      this.worker.player.unpause();
    }
  }

  private handleTrackEnd() {
    this.startedAt = null;
    this.pausedAt = null;
    this.totalPausedMs = 0;

    if (this.currentTrack) {
      if (this.loopMode === 'track') {
        void this.play(this.currentTrack).catch(() => {});
        return;
      } else if (this.loopMode === 'queue') {
        this.tracks.push(this.currentTrack);
      }
    }

    if (this.tracks.length > 0) {
      const next = this.tracks.shift()!;
      void this.play(next).catch(() => {});
    } else {
      this.currentTrack = null;
      this.isPaused = false;
      if (this.mixer.activeSfxNames.length === 0) {
        this.startIdleTimer();
      }
      this.worker.notifyStateChange();
    }
  }

  public async play(track: Track): Promise<void> {
    this.clearIdleTimer();

    // Показываем трек в UI, пока идёт загрузка первых байт
    this.currentTrack = track;
    this.isPaused = false;
    this.pausedAt = null;
    this.totalPausedMs = 0;
    this.worker.notifyStateChange();

    try {
      const { handle, actualSource } = await MusicResolver.createPcmSourceForTrack(track);

      // Убеждаемся, что трек не пропустили/остановили, пока он загружался
      if (this.currentTrack?.uid !== track.uid) {
        handle.cleanup();
        return;
      }

      console.log(`▶️ [Worker #${this.worker.id}] Играет [${actualSource}]: ${track.title}`);
      this.mixer.setVolume(this.volume);
      this.mixer.setMusic(track.title, handle);
      this.ensureMixerPlaying();

      this.startedAt = Date.now();
      this.worker.notifyStateChange();
    } catch (err: any) {
      console.error(
        `❌ [Queue #${this.worker.id}] Не удалось запустить "${track.title}":`,
        err?.message || err
      );
      // Очищаем неудавшийся трек и переходим к следующему
      if (this.currentTrack?.uid === track.uid) {
        this.currentTrack = null;
        this.handleTrackEnd();
      }
      throw err;
    }
  }

  public async add(
    trackOrTracks: Track | Track[]
  ): Promise<{ position: number; isPlayingNow: boolean; addedCount: number }> {
    const rawToAdd = Array.isArray(trackOrTracks) ? trackOrTracks : [trackOrTracks];
    if (rawToAdd.length === 0) return { position: 0, isPlayingNow: false, addedCount: 0 };

    const remainingCapacity = Math.max(0, MAX_QUEUE_SIZE - this.tracks.length);
    if (!this.currentTrack && this.tracks.length === 0) {
      const [first, ...rest] = rawToAdd;
      const acceptedRest = rest.slice(0, MAX_QUEUE_SIZE);
      this.tracks.push(...acceptedRest);
      await this.play(first);
      return { position: 1, isPlayingNow: true, addedCount: 1 + acceptedRest.length };
    }

    if (remainingCapacity === 0) {
      throw new Error(`Очередь переполнена (максимум ${MAX_QUEUE_SIZE} треков).`);
    }

    const toAdd = rawToAdd.slice(0, remainingCapacity);
    this.tracks.push(...toAdd);
    this.worker.notifyStateChange();
    return {
      position: this.tracks.length - toAdd.length + 1,
      isPlayingNow: false,
      addedCount: toAdd.length,
    };
  }

  public skip(count = 1): Track | null {
    if (!this.currentTrack) return null;
    if (count > 1) {
      this.tracks.splice(0, count - 1);
    }

    const skipped = this.currentTrack;
    if (this.loopMode === 'track') {
      this.currentTrack = null;
    }

    this.mixer.clearMusic();
    this.handleTrackEnd();
    return skipped;
  }

  public pause(): boolean {
    if (this.isPaused || !this.currentTrack) return false;
    this.mixer.pauseMusic();
    this.isPaused = true;
    this.pausedAt = Date.now();
    this.startIdleTimer();
    this.worker.notifyStateChange();
    return true;
  }

  public resume(): boolean {
    if (!this.isPaused || !this.currentTrack) return false;
    if (this.pausedAt) {
      this.totalPausedMs += Date.now() - this.pausedAt;
      this.pausedAt = null;
    }
    this.isPaused = false;
    this.clearIdleTimer();
    this.mixer.resumeMusic();
    this.ensureMixerPlaying();
    this.worker.notifyStateChange();
    return true;
  }

  public removeAt(index: number): Track | null {
    if (index < 0 || index >= this.tracks.length) return null;
    const [removed] = this.tracks.splice(index, 1);
    this.worker.notifyStateChange();
    return removed ?? null;
  }

  public async playAt(index: number): Promise<Track | null> {
    if (!Number.isInteger(index) || index < 0 || index >= this.tracks.length) return null;
    const [chosen] = this.tracks.splice(index, 1);
    if (!chosen) return null;

    if (this.currentTrack && this.loopMode === 'queue') {
      this.tracks.push(this.currentTrack);
    }

    this.mixer.clearMusic();
    await this.play(chosen);
    return chosen;
  }

  public move(fromIndex: number, toIndex: number): boolean {
    if (
      fromIndex < 0 ||
      fromIndex >= this.tracks.length ||
      toIndex < 0 ||
      toIndex >= this.tracks.length ||
      fromIndex === toIndex
    ) {
      return false;
    }
    const [item] = this.tracks.splice(fromIndex, 1);
    this.tracks.splice(toIndex, 0, item);
    this.worker.notifyStateChange();
    return true;
  }

  public clearUpcoming(): number {
    const count = this.tracks.length;
    this.tracks = [];
    this.worker.notifyStateChange();
    return count;
  }

  /**
   * Полностью стирает текущую очередь и играющий трек (не отключая агента из канала!)
   * и ставит на воспроизведение новый список треков (например, сохранённый плейлист).
   */
  public async replaceQueue(tracks: Track[]): Promise<{ loadedCount: number; firstTrack: Track }> {
    if (tracks.length === 0) {
      throw new Error('Плейлист пуст.');
    }

    this.clearIdleTimer();
    this.mixer.clearMusic();
    this.tracks = [];
    this.currentTrack = null;
    this.isPaused = false;
    this.startedAt = null;
    this.pausedAt = null;
    this.totalPausedMs = 0;

    const [first, ...rest] = tracks;
    this.tracks.push(...rest);
    await this.play(first);

    return {
      loadedCount: tracks.length,
      firstTrack: first,
    };
  }

  /**
   * Проигрывание звука саундборда ПОВЕРХ текущей музыки!
   * AudioMixer плавно приглушает музыку до 18%, накладывает мем на полной громкости,
   * а после завершения мема плавно возвращает громкость музыки обратно.
   */
  public async playSoundEffect(effect: SoundEffectPlayback): Promise<void> {
    if (!this.worker.connection) {
      throw new Error('Воркер не подключен к голосовому каналу.');
    }

    const sourceInput = effect.filePath || effect.url;
    if (!sourceInput) {
      throw new Error('Не указан источник звука.');
    }

    this.clearIdleTimer();
    const rawDecoder = effect.filePath
      ? spawnPcmDecoder(effect.filePath, `sfx:${effect.name}`)
      : await spawnPcmDecoderFromUrl(effect.url!, `sfx:${effect.name}`);
    const verified = await verifyPcmStream(rawDecoder, 8_000);
    console.log(`🔊 [Worker #${this.worker.id}] Мем поверх микса: ${effect.name}`);
    this.mixer.setVolume(this.volume);
    this.mixer.addSfx(effect.name, verified);
    this.ensureMixerPlaying();
  }

  public resetStateWithoutLeaving(): void {
    this.clearIdleTimer();
    this.tracks = [];
    this.currentTrack = null;
    this.isPaused = false;
    this.startedAt = null;
    this.pausedAt = null;
    this.totalPausedMs = 0;
    this.loopMode = 'off';
    this.activeSfxName = null;
    this.mixer.stopAll();
    this.worker.player.stop(true);
  }

  public stop(): void {
    this.resetStateWithoutLeaving();
    this.worker.leave();
  }

  public setVolume(vol: number): number {
    const clamped = this.mixer.setVolume(vol);
    this.volume = clamped;
    this.worker.notifyStateChange();
    return clamped;
  }

  public setLoop(mode: 'off' | 'track' | 'queue'): 'off' | 'track' | 'queue' {
    this.loopMode = mode;
    this.worker.notifyStateChange();
    return mode;
  }

  public shuffle(): number {
    for (let i = this.tracks.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.tracks[i], this.tracks[j]] = [this.tracks[j], this.tracks[i]];
    }
    this.worker.notifyStateChange();
    return this.tracks.length;
  }

  public getPlaybackProgressSec(): number {
    if (!this.startedAt || !this.currentTrack) return 0;
    const referenceNow = this.pausedAt ?? Date.now();
    const elapsedMs = Math.max(0, referenceNow - this.startedAt - this.totalPausedMs);
    return Math.floor(elapsedMs / 1000);
  }

  public startIdleTimer() {
    if (!this.worker.currentChannelId) return;
    this.clearIdleTimer();
    this.idleLeaveAt = Date.now() + IDLE_PLAYBACK_TIMEOUT_MS;

    this.idleTimeout = setTimeout(() => {
      console.log(
        `⏱️ [Worker #${this.worker.id}] 5 минут без воспроизведения музыки — выхожу из канала.`
      );
      this.stop();
    }, IDLE_PLAYBACK_TIMEOUT_MS);
  }

  public clearIdleTimer() {
    if (this.idleTimeout) {
      clearTimeout(this.idleTimeout);
      this.idleTimeout = null;
    }
    this.idleLeaveAt = null;
  }
}
