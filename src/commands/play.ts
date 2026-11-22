import {
  EmbedBuilder,
  GuildMember,
  SlashCommandBuilder,
} from 'discord.js';
import { actorFromDiscord, AuditLogService, toAuditTrack } from '../services/audit-log.js';
import { workerPool } from '../voice/index.js';
import {
  MusicResolver,
  parsePlatformFromPrefixArgs,
  type PlatformOption,
  type Track,
} from '../voice/music-resolver.js';
import type { Command } from '../types.js';

function getPlatformBadge(source: Track['source']): string {
  if (source === 'spotify') return '🟢 Spotify';
  if (source === 'soundcloud') return '🟠 SoundCloud';
  return '🔴 YouTube';
}

function buildPlayEmbed(params: {
  tracks: Track[];
  isPlayingNow: boolean;
  position: number;
  workerId: number;
  workerTag: string;
  volume: number;
  requestedByTag: string;
}): EmbedBuilder {
  const { tracks, isPlayingNow, position, workerId, workerTag, volume, requestedByTag } = params;
  const first = tracks[0];
  const isPlaylist = tracks.length > 1;

  const embed = new EmbedBuilder()
    .setColor(isPlayingNow ? 0x57f287 : 0x5865f2)
    .setTitle(
      isPlaylist
        ? `📚 Плейлист добавлен (${tracks.length} треков)`
        : isPlayingNow
          ? '▶️ Сейчас играет'
          : '➕ Добавлено в очередь'
    )
    .setDescription(
      isPlaylist
        ? `Первый трек: [**${first.title}**](${first.originalUrl})\nВсего добавлено в очередь: **${tracks.length}**`
        : `[**${first.title}**](${first.originalUrl})\nАвтор: **${first.author}**`
    )
    .addFields(
      { name: 'Длительность', value: first.durationFormatted, inline: true },
      { name: 'Источник', value: getPlatformBadge(first.source), inline: true },
      { name: 'Агент', value: `🎙️ #${workerId} (${workerTag})`, inline: true }
    );

  if (!isPlayingNow) {
    embed.addFields({ name: 'Позиция в очереди', value: `#${position}`, inline: true });
  }

  if (first.thumbnail) {
    embed.setThumbnail(first.thumbnail);
  }

  embed.setFooter({
    text: `Запросил: ${requestedByTag} • Громкость: ${volume}%`,
  });

  return embed;
}

export const command: Command = {
  data: new SlashCommandBuilder()
    .setName('play')
    .setDescription('Воспроизвести музыку по названию или ссылке (YouTube, Spotify, SoundCloud)')
    .addStringOption((option) =>
      option
        .setName('query')
        .setDescription('Название песни или ссылка на трек/плейлист')
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName('platform')
        .setDescription('Платформа для поиска по названию (для ссылок определяется автоматически)')
        .setRequired(false)
        .addChoices(
          { name: 'Авто (ссылка или лучший поиск)', value: 'auto' },
          { name: 'YouTube', value: 'youtube' },
          { name: 'SoundCloud', value: 'soundcloud' },
          { name: 'Spotify', value: 'spotify' }
        )
    ),
  async execute(interaction) {
    const member = interaction.member as GuildMember;
    const voiceChannel = member?.voice?.channel;

    if (!voiceChannel) {
      await interaction.reply({
        content: '❌ Сначала зайдите в голосовой канал!',
        ephemeral: true,
      });
      return;
    }

    const query = interaction.options.getString('query', true).trim();
    const platform = (interaction.options.getString('platform') ?? 'auto') as PlatformOption;

    await interaction.deferReply();

    try {
      const wasInChannel = Boolean(workerPool.getWorkerForChannel(voiceChannel.id));
      const worker = await workerPool.ensureWorkerInChannel(
        voiceChannel.id,
        interaction.guildId!
      );
      const actor = actorFromDiscord(interaction.user, member);
      if (!wasInChannel) {
        void AuditLogService.record({
          guildId: interaction.guildId!,
          channelId: voiceChannel.id,
          channelName: voiceChannel.name,
          workerId: worker.id,
          actor,
          source: 'discord',
          action: 'summon',
        });
      }

      const tracks = await MusicResolver.resolve(
        query,
        {
          id: interaction.user.id,
          tag: interaction.user.tag,
        },
        platform
      );

      if (tracks.length === 0) {
        await interaction.editReply('❌ Не удалось найти аудио по вашему запросу.');
        return;
      }

      const { position, isPlayingNow, addedCount } = await worker.queue.add(tracks);
      if (addedCount > 0) {
        void AuditLogService.record({
          guildId: interaction.guildId!,
          channelId: voiceChannel.id,
          channelName: voiceChannel.name,
          workerId: worker.id,
          actor,
          source: 'discord',
          action: 'add_tracks',
          tracks: tracks.slice(0, addedCount).map(toAuditTrack),
        });
      }

      const embed = buildPlayEmbed({
        tracks,
        isPlayingNow,
        position,
        workerId: worker.id,
        workerTag: worker.client.user?.tag ?? `Worker #${worker.id}`,
        volume: worker.queue.volume,
        requestedByTag: interaction.user.tag,
      });

      await interaction.editReply({ embeds: [embed] });
    } catch (err: any) {
      console.error('Ошибка в команде /play:', err);
      await interaction.editReply(err?.message || '❌ Ошибка воспроизведения трека.');
    }
  },
  async executePrefix(message, args) {
    const member = message.member;
    const voiceChannel = member?.voice?.channel;

    if (!voiceChannel) {
      await message.reply('❌ Сначала зайдите в голосовой канал!');
      return;
    }

    const { platform, query } = parsePlatformFromPrefixArgs(args);
    if (!query) {
      await message.reply(
        'Использование:\n' +
          '• `+play <название или ссылка>` — автопоиск\n' +
          '• `+play yt <название>` — поиск в YouTube\n' +
          '• `+play sc <название>` — поиск в SoundCloud\n' +
          '• `+play sp <название>` — поиск в Spotify'
      );
      return;
    }

    const platLabel =
      platform === 'auto'
        ? ''
        : ` (${platform === 'youtube' ? 'YouTube' : platform === 'soundcloud' ? 'SoundCloud' : 'Spotify'})`;
    const statusMsg = await message.reply(`🔎 Ищу трек${platLabel}...`);

    try {
      const wasInChannel = Boolean(workerPool.getWorkerForChannel(voiceChannel.id));
      const worker = await workerPool.ensureWorkerInChannel(
        voiceChannel.id,
        message.guildId!
      );
      const actor = actorFromDiscord(message.author, member);
      if (!wasInChannel) {
        void AuditLogService.record({
          guildId: message.guildId!,
          channelId: voiceChannel.id,
          channelName: voiceChannel.name,
          workerId: worker.id,
          actor,
          source: 'discord',
          action: 'summon',
        });
      }

      const tracks = await MusicResolver.resolve(
        query,
        {
          id: message.author.id,
          tag: message.author.tag,
        },
        platform
      );

      if (tracks.length === 0) {
        await statusMsg.edit('❌ Не удалось найти аудио по вашему запросу.');
        return;
      }

      const { position, isPlayingNow, addedCount } = await worker.queue.add(tracks);
      if (addedCount > 0) {
        void AuditLogService.record({
          guildId: message.guildId!,
          channelId: voiceChannel.id,
          channelName: voiceChannel.name,
          workerId: worker.id,
          actor,
          source: 'discord',
          action: 'add_tracks',
          tracks: tracks.slice(0, addedCount).map(toAuditTrack),
        });
      }

      const embed = buildPlayEmbed({
        tracks,
        isPlayingNow,
        position,
        workerId: worker.id,
        workerTag: worker.client.user?.tag ?? `Worker #${worker.id}`,
        volume: worker.queue.volume,
        requestedByTag: message.author.tag,
      });

      await statusMsg.edit({ content: '', embeds: [embed] });
    } catch (err: any) {
      console.error('Ошибка в команде +play:', err);
      await statusMsg.edit(err?.message || '❌ Ошибка воспроизведения трека.');
    }
  },
};
