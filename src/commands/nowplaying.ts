import { EmbedBuilder, GuildMember, SlashCommandBuilder } from 'discord.js';
import { workerPool } from '../voice/index.js';
import { formatDuration } from '../voice/music-resolver.js';
import type { Command } from '../types.js';

function createProgressBar(currentSec: number, totalSec: number, barLength = 15): string {
  if (totalSec <= 0) return '🔘' + '▬'.repeat(barLength - 1);
  const progress = Math.min(1, Math.max(0, currentSec / totalSec));
  const progressIndex = Math.round(progress * (barLength - 1));
  const bar = '▬'.repeat(progressIndex) + '🔘' + '▬'.repeat(barLength - 1 - progressIndex);
  return bar;
}

export const command: Command = {
  data: new SlashCommandBuilder()
    .setName('nowplaying')
    .setDescription('Показать информацию о текущем играющем треке и прогресс'),
  async execute(interaction) {
    const member = interaction.member as GuildMember;
    const worker = workerPool.getWorkerForMember(member);

    if (!worker || !worker.queue.currentTrack) {
      await interaction.reply({
        content: '❌ В вашем голосовом канале сейчас ничего не играет.',
        ephemeral: true,
      });
      return;
    }

    const { currentTrack, loopMode, volume, isPaused } = worker.queue;
    const currentSec = worker.queue.getPlaybackProgressSec();
    const totalSec = currentTrack.durationSec;
    const bar = createProgressBar(currentSec, totalSec);

    let platformBadge = '🔴 YouTube';
    if (currentTrack.source === 'spotify') platformBadge = '🟢 Spotify';
    else if (currentTrack.source === 'soundcloud') platformBadge = '🟠 SoundCloud';

    const embed = new EmbedBuilder()
      .setColor(0x57f287)
      .setTitle(`${isPaused ? '⏸️ На паузе' : '▶️ Сейчас играет'}`)
      .setDescription(`[**${currentTrack.title}**](${currentTrack.originalUrl})\nАвтор: **${currentTrack.author}**`)
      .addFields(
        {
          name: 'Прогресс',
          value: `${formatDuration(currentSec)} ${bar} ${currentTrack.durationFormatted}`,
          inline: false,
        },
        { name: 'Источник', value: platformBadge, inline: true },
        { name: 'Громкость', value: `${volume}%`, inline: true },
        { name: 'Повтор', value: `\`${loopMode.toUpperCase()}\``, inline: true }
      )
      .setFooter({
        text: `Воркер #${worker.id} • Запросил: ${currentTrack.requestedBy.tag}`,
      });

    if (currentTrack.thumbnail) {
      embed.setThumbnail(currentTrack.thumbnail);
    }

    await interaction.reply({ embeds: [embed] });
  },
  async executePrefix(message) {
    const worker = workerPool.getWorkerForMember(message.member);

    if (!worker || !worker.queue.currentTrack) {
      await message.reply('❌ В вашем голосовом канале сейчас ничего не играет.');
      return;
    }

    const { currentTrack, loopMode, volume, isPaused } = worker.queue;
    const currentSec = worker.queue.getPlaybackProgressSec();
    const totalSec = currentTrack.durationSec;
    const bar = createProgressBar(currentSec, totalSec);

    let platformBadge = '🔴 YouTube';
    if (currentTrack.source === 'spotify') platformBadge = '🟢 Spotify';
    else if (currentTrack.source === 'soundcloud') platformBadge = '🟠 SoundCloud';

    const embed = new EmbedBuilder()
      .setColor(0x57f287)
      .setTitle(`${isPaused ? '⏸️ На паузе' : '▶️ Сейчас играет'}`)
      .setDescription(`[**${currentTrack.title}**](${currentTrack.originalUrl})\nАвтор: **${currentTrack.author}**`)
      .addFields(
        {
          name: 'Прогресс',
          value: `${formatDuration(currentSec)} ${bar} ${currentTrack.durationFormatted}`,
          inline: false,
        },
        { name: 'Источник', value: platformBadge, inline: true },
        { name: 'Громкость', value: `${volume}%`, inline: true },
        { name: 'Повтор', value: `\`${loopMode.toUpperCase()}\``, inline: true }
      )
      .setFooter({
        text: `Воркер #${worker.id} • Запросил: ${currentTrack.requestedBy.tag}`,
      });

    if (currentTrack.thumbnail) {
      embed.setThumbnail(currentTrack.thumbnail);
    }

    await message.reply({ embeds: [embed] });
  },
};
