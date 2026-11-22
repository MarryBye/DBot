import {
  AudioPlayer,
  createAudioPlayer,
  DiscordGatewayAdapterCreator,
  entersState,
  joinVoiceChannel,
  NoSubscriberBehavior,
  VoiceConnection,
  VoiceConnectionStatus,
} from '@discordjs/voice';
import {
  Client,
  Events,
  GatewayIntentBits,
  Guild,
  GuildMember,
  Routes,
  VoiceBasedChannel,
} from 'discord.js';
import { EventEmitter } from 'node:events';
import { AudioQueue } from './queue.js';

export const EMPTY_CHANNEL_TIMEOUT_MS = 5 * 60 * 1000; // 5 минут без людей в канале

export interface WorkerStatus {
  id: number;
  name: string;
  tag: string;
  avatarUrl: string | null;
  isOnline: boolean;
  isInChannel: boolean;
  guildId: string | null;
  guildName: string | null;
  channelId: string | null;
  channelName: string | null;
  ping: number;
  currentTrackTitle: string | null;
  queueLength: number;
  isPaused: boolean;
  volume: number;
}

export interface WorkerHealthResult {
  id: number;
  name: string;
  tag: string;
  status: 'healthy' | 'degraded' | 'offline';
  restLatencyMs: number | null;
  wsPingMs: number | null;
  isInGuild: boolean;
  isInVoice: boolean;
  voiceGuildName: string | null;
  voiceChannelName: string | null;
  error?: string;
}

export class VoiceWorker {
  public readonly id: number;
  public readonly token: string;
  public client: Client;
  public player: AudioPlayer;
  public queue: AudioQueue;
  public connection: VoiceConnection | null = null;
  public currentGuildId: string | null = null;
  public currentChannelId: string | null = null;
  public reservedChannelId: string | null = null;
  public emptyLeaveAt: number | null = null;
  public isReady = false;

  private emptyChannelTimeout: NodeJS.Timeout | null = null;
  private onStateChange: () => void;

  constructor(id: number, token: string, onStateChange: () => void) {
    this.id = id;
    this.token = token;
    this.onStateChange = onStateChange;

    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
      ],
    });

    this.player = createAudioPlayer({
      behaviors: {
        noSubscriber: NoSubscriberBehavior.Pause,
        // По умолчанию 5 кадров (100мс) — на слабом vCPU (Oracle Micro) холодный старт
        // легко даёт скачок на 120мс и сбрасывает плеер в idle. Ставим запас 5 секунд (250 кадров)!
        maxMissedFrames: 250,
      },
    });

    this.queue = new AudioQueue(this);

    this.setupEvents();
  }

  public notifyStateChange(): void {
    this.onStateChange();
  }

  private setupEvents() {
    this.client.once(Events.ClientReady, (readyClient) => {
      this.isReady = true;
      console.log(`🎙️ [Worker #${this.id}] Авторизован как ${readyClient.user.tag}`);
      this.notifyStateChange();
    });

    this.client.on(Events.VoiceStateUpdate, (oldState, newState) => {
      // Если самого воркера выгнали из канала вручную
      if (newState.member?.id === this.client.user?.id && oldState.channelId && !newState.channelId) {
        console.log(`👋 [Worker #${this.id}] Отключён из голосового канала вручную.`);
        this.queue.resetStateWithoutLeaving();
        this.cleanupConnectionOnly();
        return;
      }

      // Проверяем наполненность текущего канала воркера
      if (
        this.currentChannelId &&
        (oldState.channelId === this.currentChannelId || newState.channelId === this.currentChannelId)
      ) {
        this.evaluateChannelOccupancy(newState.guild);
      }
    });

    this.client.on('error', (err) => {
      console.error(`❌ [Worker #${this.id}] Ошибка клиента:`, err);
    });
  }

  public async login(): Promise<void> {
    try {
      await this.client.login(this.token);
    } catch (error) {
      console.error(`❌ [Worker #${this.id}] Не удалось войти в сеть:`, error);
    }
  }

  public get isFree(): boolean {
    return this.isReady && this.currentChannelId === null && this.reservedChannelId === null;
  }

  public isInGuild(guildId: string): boolean {
    return this.client.guilds.cache.has(guildId);
  }

  public async join(channelId: string, guildId: string): Promise<VoiceConnection> {
    const guild = this.client.guilds.cache.get(guildId);
    if (!guild) {
      this.reservedChannelId = null;
      throw new Error(
        `[Воркер #${this.id}] Не добавлен на этот сервер! Пригласите бота ${this.client.user?.tag ?? '#' + this.id} на сервер.`
      );
    }

    this.reservedChannelId = channelId;

    try {
      const connection = joinVoiceChannel({
        channelId,
        guildId,
        adapterCreator: guild.voiceAdapterCreator as unknown as DiscordGatewayAdapterCreator,
        group: `worker-${this.id}`,
      });

      this.connection = connection;
      this.currentGuildId = guildId;
      this.currentChannelId = channelId;
      this.reservedChannelId = null;

      connection.subscribe(this.player);

      connection.on(VoiceConnectionStatus.Disconnected, async () => {
        try {
          await Promise.race([
            entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
            entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
          ]);
        } catch {
          this.queue.stop();
        }
      });

      await entersState(connection, VoiceConnectionStatus.Ready, 20_000);
      // Короткая пауза для стабилизации UDP/DAVE E2EE рукопожатия на первом подключении
      await new Promise((r) => setTimeout(r, 200));

      // Запускаем оба предохранительных таймера по 5 минут:
      this.queue.startIdleTimer();
      this.evaluateChannelOccupancy(guild);

      this.notifyStateChange();
      return connection;
    } catch (err) {
      this.reservedChannelId = null;
      this.leave();
      throw err;
    }
  }

  public evaluateChannelOccupancy(guild?: Guild | null): void {
    if (!this.currentChannelId) {
      this.clearEmptyChannelTimer();
      return;
    }

    const targetGuild =
      guild ?? (this.currentGuildId ? this.client.guilds.cache.get(this.currentGuildId) : null);
    if (!targetGuild) return;

    const channel = targetGuild.channels.cache.get(this.currentChannelId) as
      | VoiceBasedChannel
      | undefined;
    if (!channel || !channel.isVoiceBased()) return;

    const humanCount = channel.members.filter((m) => !m.user.bot).size;

    if (humanCount === 0) {
      if (!this.emptyChannelTimeout) {
        this.emptyLeaveAt = Date.now() + EMPTY_CHANNEL_TIMEOUT_MS;
        console.log(
          `⏳ [Worker #${this.id}] В канале "${channel.name}" не осталось людей. Автовыход через 5 минут.`
        );
        this.emptyChannelTimeout = setTimeout(() => {
          console.log(
            `👋 [Worker #${this.id}] 5 минут в пустом канале "${channel.name}" — выхожу.`
          );
          this.queue.stop();
        }, EMPTY_CHANNEL_TIMEOUT_MS);
        this.notifyStateChange();
      }
    } else if (this.emptyChannelTimeout) {
      console.log(
        `👤 [Worker #${this.id}] Пользователь вернулся в "${channel.name}" — таймер пустого канала сброшен.`
      );
      this.clearEmptyChannelTimer();
      this.notifyStateChange();
    }
  }

  private clearEmptyChannelTimer(): void {
    if (this.emptyChannelTimeout) {
      clearTimeout(this.emptyChannelTimeout);
      this.emptyChannelTimeout = null;
    }
    this.emptyLeaveAt = null;
  }

  private cleanupConnectionOnly(): void {
    this.clearEmptyChannelTimer();
    this.queue.clearIdleTimer();
    if (this.connection) {
      try {
        this.connection.destroy();
      } catch {
        // ignore
      }
      this.connection = null;
    }
    this.currentGuildId = null;
    this.currentChannelId = null;
    this.reservedChannelId = null;
    this.notifyStateChange();
  }

  public leave(): void {
    this.queue.resetStateWithoutLeaving();
    this.cleanupConnectionOnly();
  }

  public getStatus(): WorkerStatus {
    const guild = this.currentGuildId ? this.client.guilds.cache.get(this.currentGuildId) : null;
    const channel =
      this.currentChannelId && guild
        ? guild.channels.cache.get(this.currentChannelId)
        : null;

    return {
      id: this.id,
      name: `Воркер #${this.id}`,
      tag: this.client.user?.tag ?? 'Не подключен',
      avatarUrl: this.client.user?.displayAvatarURL({ size: 64 }) ?? null,
      isOnline: this.isReady && this.client.isReady(),
      isInChannel: this.currentChannelId !== null,
      guildId: this.currentGuildId,
      guildName: guild?.name ?? null,
      channelId: this.currentChannelId,
      channelName: channel?.name ?? null,
      ping: this.client.ws.ping,
      currentTrackTitle: this.queue.currentTrack?.title ?? null,
      queueLength: this.queue.tracks.length,
      isPaused: this.queue.isPaused,
      volume: this.queue.volume,
    };
  }

  public async checkHealth(guildId: string): Promise<WorkerHealthResult> {
    const name = `Воркер #${this.id}`;

    if (!this.client.isReady()) {
      return {
        id: this.id,
        name,
        tag: this.client.user?.tag ?? 'Не подключен',
        status: 'offline',
        restLatencyMs: null,
        wsPingMs: null,
        isInGuild: false,
        isInVoice: false,
        voiceGuildName: null,
        voiceChannelName: null,
        error: 'Офлайн (клиент не подключен к Gateway)',
      };
    }

    try {
      const start = Date.now();
      await this.client.rest.get(Routes.user('@me'));
      const restLatencyMs = Date.now() - start;

      const wsPingMs = this.client.ws.ping;
      const isInGuild = this.client.guilds.cache.has(guildId);
      const voiceGuild = this.currentGuildId
        ? this.client.guilds.cache.get(this.currentGuildId)
        : null;
      const channel =
        this.currentChannelId && voiceGuild
          ? voiceGuild.channels.cache.get(this.currentChannelId)
          : null;

      return {
        id: this.id,
        name,
        tag: this.client.user?.tag ?? 'Воркер',
        status: !isInGuild ? 'degraded' : 'healthy',
        restLatencyMs,
        wsPingMs,
        isInGuild,
        isInVoice: this.currentChannelId !== null,
        voiceGuildName: voiceGuild?.name ?? null,
        voiceChannelName: channel?.name ?? null,
        error: !isInGuild ? 'Не добавлен на этот сервер' : undefined,
      };
    } catch (error: any) {
      return {
        id: this.id,
        name,
        tag: this.client.user?.tag ?? 'Ошибка',
        status: 'offline',
        restLatencyMs: null,
        wsPingMs: null,
        isInGuild: false,
        isInVoice: false,
        voiceGuildName: null,
        voiceChannelName: null,
        error: error?.message ?? 'Не ответил на запрос',
      };
    }
  }
}

export class VoiceWorkerPool {
  public readonly events = new EventEmitter();
  private workers: VoiceWorker[] = [];

  constructor(tokens: string[]) {
    this.workers = tokens.map(
      (token, index) =>
        new VoiceWorker(index + 1, token, () => {
          this.events.emit('stateChanged');
        })
    );
  }

  public async init(): Promise<void> {
    if (this.workers.length === 0) {
      console.log('ℹ️ [VoiceWorkerPool] Токены воркеров не указаны в .env. Пул пуст.');
      return;
    }

    console.log(`🚀 [VoiceWorkerPool] Инициализация ${this.workers.length} воркер-агентов...`);
    await Promise.allSettled(this.workers.map((w) => w.login()));
  }

  public getWorkerById(workerId: number): VoiceWorker | undefined {
    return this.workers.find((w) => w.id === workerId);
  }

  public getWorkerForChannel(channelId: string): VoiceWorker | undefined {
    return this.workers.find(
      (w) => w.currentChannelId === channelId || w.reservedChannelId === channelId
    );
  }

  /**
   * Строгое выделение агента для канала:
   * - Если в канале уже есть агент -> возвращаем его.
   * - Иначе ищем ТОЛЬКО свободного агента, который присутствует на нужном сервере (guildId).
   * - Занятых в других каналах агентов НИКОГДА не переманиваем!
   */
  public acquireWorker(channelId: string, guildId?: string): VoiceWorker | null {
    const existing = this.getWorkerForChannel(channelId);
    if (existing) return existing;

    const available = this.workers.find(
      (w) => w.isFree && (!guildId || w.isInGuild(guildId))
    );
    if (!available) return null;

    available.reservedChannelId = channelId;
    return available;
  }

  public async ensureWorkerInChannel(
    channelId: string,
    guildId: string
  ): Promise<VoiceWorker> {
    const existing = this.workers.find((w) => w.currentChannelId === channelId);
    if (existing) return existing;

    const worker = this.acquireWorker(channelId, guildId);
    if (!worker) {
      throw new Error(this.formatAllBusyMessage(guildId));
    }

    if (worker.currentChannelId !== channelId) {
      await worker.join(channelId, guildId);
    }

    return worker;
  }

  public formatAllBusyMessage(guildId?: string): string {
    const statuses = this.getAllStatuses();
    const online = statuses.filter((s) => s.isOnline);
    if (online.length === 0) {
      return '⚠️ Ни один голосовой агент сейчас не в сети! Проверьте статус командой `/health`.';
    }

    if (guildId) {
      const inThisGuild = this.workers.filter((w) => w.isReady && w.isInGuild(guildId));
      if (inThisGuild.length === 0) {
        return '⚠️ На этот сервер ещё не добавлен ни один голосовой агент! Пригласите агентов на сервер (проверить можно командой `/health`).';
      }
    }

    const busyList = online
      .filter((s) => s.isInChannel)
      .map((s) => {
        const srv = guildId && s.guildId && s.guildId !== guildId && s.guildName
          ? ` (${s.guildName})`
          : '';
        return `• **${s.name}** → 🔊 ${s.channelName ?? s.channelId}${srv}`;
      })
      .join('\n');

    return (
      `⚠️ **Все доступные голосовые агенты сейчас заняты в других каналах!**\n` +
      `Агенты не переходят из чужих комнат. Подождите, пока кто-то освободится, или попросите ребят отпустить агента (\`+stop\` / \`+leave\`).` +
      (busyList ? `\n\n**Где сейчас агенты:**\n${busyList}` : '')
    );
  }

  public handleGuildVoiceUpdate(guild: Guild, channelIds: Array<string | null>): void {
    for (const worker of this.workers) {
      if (worker.currentChannelId && channelIds.includes(worker.currentChannelId)) {
        worker.evaluateChannelOccupancy(guild);
      }
    }
    this.events.emit('stateChanged');
  }

  public getWorkerForMember(member: GuildMember | null | undefined): VoiceWorker | null {
    const voiceChannelId = member?.voice?.channelId;
    if (!voiceChannelId) return null;
    return this.getWorkerForChannel(voiceChannelId) ?? null;
  }

  public releaseWorker(workerId: number): void {
    const worker = this.workers.find((w) => w.id === workerId);
    if (worker) {
      worker.leave();
    }
  }

  public getAllStatuses(): WorkerStatus[] {
    return this.workers.map((w) => w.getStatus());
  }

  public async checkAllHealth(guildId: string): Promise<WorkerHealthResult[]> {
    return Promise.all(this.workers.map((w) => w.checkHealth(guildId)));
  }

  public get totalCount(): number {
    return this.workers.length;
  }

  public get availableCount(): number {
    return this.workers.filter((w) => w.isFree).length;
  }

  public getAvailableCountForGuild(guildId: string): number {
    return this.workers.filter((w) => w.isFree && w.isInGuild(guildId)).length;
  }
}
