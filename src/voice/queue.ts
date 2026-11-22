import {
  AudioPlayerStatus,
  AudioResource,
} from '@discordjs/voice';
import { MusicResolver, type PlayableResource, type Track } from './music-resolver.js';
import { SoundboardService } from './soundboard.js';
import type { VoiceWorker } from './worker-pool.js';

export const IDLE_PLAYBACK_TIMEOUT_MS = 5 * 60 * 1000; // 5 минут без воспроизведения музыки

export interface SoundEffectPlayback {
  name: string;
  filePath?: string;
  url?: string;
}

export class AudioQueue {
  public readonly worker: VoiceWorker;
  public tracks: Track[] = [];
  public currentTrack: Track | null = null;
  public currentResource: AudioResource | null = null;
  public volume = 80;
  public loopMode: 'off' | 'track' | 'queue' = 'off';
  public isPaused = false;
  public startedAt: number | null = null;
  public pausedAt: number | null = null;
  public totalPausedMs = 0;
  public idleLeaveAt: number | null = null;
  public activeSfxName: string | null = null;

  private idleTimeout: NodeJS.Timeout | null = null;
  private sfxGuardTimeout: NodeJS.Timeout | null = null;
  private currentCleanup: (() => void) | null = null;
  private isPlayingSfx = false;
  private musicWasPlayingBeforeSfx = false;
  private suppressNextIdle = false;

  constructor(worker: VoiceWorker) {
    this.worker = worker;
    this.setupPlayerEvents();
  }

  private setupPlayerEvents() {
    this.worker.player.on(AudioPlayerStatus.Idle, () => {
      if (this.suppressNextIdle) {
        this.suppressNextIdle = false;
        return;
      }
      this.handleTrackEnd();
    });

    this.worker.player.on('error', (err) => {
      console.error(`❌ [Queue #${this.worker.id}] Ошибка плеера:`, err);
      this.handleTrackEnd();
    });

    // События отдельного плеера звуковых эффектов (саундборд)
    this.worker.sfxPlayer.on(AudioPlayerStatus.Idle, () => {
      if (this.isPlayingSfx) {
        this.finishSoundEffect();
      }
    });

    this.worker.sfxPlayer.on('error', (err) => {
      console.error(`❌ [SFX #${this.worker.id}] Ошибка саундборда:`, err);
      if (this.isPlayingSfx) {
        this.finishSoundEffect();
      }
    });
  }

  private cleanupCurrentStream() {
    if (this.currentCleanup) {
      try {
        this.currentCleanup();
      } catch {
        // ignore
      }
      this.currentCleanup = null;
    }
  }

  private handleTrackEnd() {
    this.cleanupCurrentStream();
    this.currentResource = null;
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
      this.startIdleTimer();
      this.worker.notifyStateChange();
    }
  }

  public async play(track: Track): Promise<void> {
    this.clearIdleTimer();
    this.cleanupCurrentStream();

    this.currentTrack = track;
    this.isPaused = false;
    this.pausedAt = null;
    this.totalPausedMs = 0;

    try {
      const playable: PlayableResource = await MusicResolver.createAudioResourceForTrack(
        track,
        this.volume
      );

      this.currentResource = playable.resource;
      this.currentCleanup = playable.cleanup;
      this.startedAt = Date.now();

      // Если не играет SFX, убеждаемся что подключение подписано на музыкальный плеер
      if (!this.isPlayingSfx && this.worker.connection) {
        this.worker.connection.subscribe(this.worker.player);
      }

      this.worker.player.play(playable.resource);
      this.worker.notifyStateChange();
    } catch (err) {
      console.error(`❌ [Queue #${this.worker.id}] Ошибка старта трека "${track.title}":`, err);
      this.handleTrackEnd();
      throw err;
    }
  }

  public async add(
    trackOrTracks: Track | Track[]
  ): Promise<{ position: number; isPlayingNow: boolean; addedCount: number }> {
    const toAdd = Array.isArray(trackOrTracks) ? trackOrTracks : [trackOrTracks];
    if (toAdd.length === 0) return { position: 0, isPlayingNow: false, addedCount: 0 };

    // Если сейчас ничего не играет
    if (!this.currentTrack && this.tracks.length === 0) {
      const [first, ...rest] = toAdd;
      this.tracks.push(...rest);
      await this.play(first);
      return { position: 1, isPlayingNow: true, addedCount: toAdd.length };
    }

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
    // При ручном skip в режиме track loop — переходим к следующему треку
    if (this.loopMode === 'track') {
      this.currentTrack = null;
    }
    this.worker.player.stop(true);
    this.worker.notifyStateChange();
    return skipped;
  }

  public pause(): boolean {
    if (this.isPaused || !this.currentTrack) return false;
    this.worker.player.pause();
    this.isPaused = true;
    this.pausedAt = Date.now();
    // 5 минут без музыки (в паузе) -> автовыход
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
    if (!this.isPlayingSfx) {
      this.worker.player.unpause();
    }
    this.worker.notifyStateChange();
    return true;
  }

  public removeAt(index: number): Track | null {
    if (index < 0 || index >= this.tracks.length) return null;
    const [removed] = this.tracks.splice(index, 1);
    this.worker.notifyStateChange();
    return removed ?? null;
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
   * Проигрывание звука саундборда (мем с MyInstants или загруженный файл).
   * Аккуратно ставит музыку на микро-паузу на время звука, затем продолжает с того же места!
   */
  public async playSoundEffect(effect: SoundEffectPlayback): Promise<void> {
    if (!this.worker.connection) {
      throw new Error('Воркер не подключен к голосовому каналу.');
    }

    const resource = effect.filePath
      ? await SoundboardService.createResourceFromFile(effect.filePath, this.volume)
      : effect.url
        ? await SoundboardService.createResourceFromUrl(effect.url, this.volume)
        : null;

    if (!resource) {
      throw new Error('Не указан источник звука.');
    }

    this.clearIdleTimer();
    if (this.sfxGuardTimeout) {
      clearTimeout(this.sfxGuardTimeout);
      this.sfxGuardTimeout = null;
    }

    // Запоминаем состояние музыки только если это не повторный клик поверх уже идущего SFX
    if (!this.isPlayingSfx) {
      this.musicWasPlayingBeforeSfx =
        this.currentTrack !== null &&
        !this.isPaused &&
        this.worker.player.state.status === AudioPlayerStatus.Playing;

      if (this.musicWasPlayingBeforeSfx) {
        this.worker.player.pause();
        this.pausedAt = Date.now();
      }
    }

    this.isPlayingSfx = true;
    this.activeSfxName = effect.name;

    this.worker.connection.subscribe(this.worker.sfxPlayer);
    this.worker.sfxPlayer.play(resource);
    this.worker.notifyStateChange();

    // Предохранитель на случай зависшего потока (макс. 45 сек)
    this.sfxGuardTimeout = setTimeout(() => {
      if (this.isPlayingSfx) {
        this.worker.sfxPlayer.stop(true);
        this.finishSoundEffect();
      }
    }, 45_000);
  }

  private finishSoundEffect() {
    if (this.sfxGuardTimeout) {
      clearTimeout(this.sfxGuardTimeout);
      this.sfxGuardTimeout = null;
    }

    this.isPlayingSfx = false;
    this.activeSfxName = null;

    if (this.worker.connection) {
      this.worker.connection.subscribe(this.worker.player);
    }

    if (this.musicWasPlayingBeforeSfx && !this.isPaused && this.currentTrack) {
      if (this.pausedAt) {
        this.totalPausedMs += Date.now() - this.pausedAt;
        this.pausedAt = null;
      }
      this.worker.player.unpause();
    } else if (!this.currentTrack || this.isPaused) {
      this.startIdleTimer();
    }

    this.musicWasPlayingBeforeSfx = false;
    this.worker.notifyStateChange();
  }

  public resetStateWithoutLeaving(): void {
    this.clearIdleTimer();
    if (this.sfxGuardTimeout) {
      clearTimeout(this.sfxGuardTimeout);
      this.sfxGuardTimeout = null;
    }
    this.cleanupCurrentStream();
    this.tracks = [];
    this.currentTrack = null;
    this.currentResource = null;
    this.isPaused = false;
    this.startedAt = null;
    this.pausedAt = null;
    this.totalPausedMs = 0;
    this.loopMode = 'off';
    this.isPlayingSfx = false;
    this.activeSfxName = null;
    this.musicWasPlayingBeforeSfx = false;
    this.suppressNextIdle = true;
    this.worker.player.stop(true);
    this.worker.sfxPlayer.stop(true);
  }

  public stop(): void {
    this.resetStateWithoutLeaving();
    this.worker.leave();
  }

  public setVolume(vol: number): number {
    const clamped = Math.max(1, Math.min(100, Math.round(vol)));
    this.volume = clamped;
    if (this.currentResource?.volume) {
      this.currentResource.volume.setVolume(clamped / 100);
    }
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
