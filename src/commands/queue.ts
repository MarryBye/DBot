import { EmbedBuilder, GuildMember, SlashCommandBuilder } from 'discord.js';
import { workerPool } from '../voice/index.js';
import type { Command } from '../types.js';

export const command: Command = {
  data: new SlashCommandBuilder()
    .setName('queue')
    .setDescription('Показать текущую очередь воспроизведения музыки'),
  async execute(interaction) {
    const member = interaction.member as GuildMember;
    const worker = workerPool.getWorkerForMember(member);

    if (!worker || (!worker.queue.currentTrack && worker.queue.tracks.length === 0)) {
      await interaction.reply({
        content: '📭 Очередь воспроизведения в вашем канале пуста.',
        ephemeral: true,
      });
      return;
    }

    const { currentTrack, tracks, loopMode, volume } = worker.queue;

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle(`🎵 Очередь канала (Воркер #${worker.id})`)
      .setDescription(
        `• **Режим повтора:** \`${loopMode.toUpperCase()}\` • **Громкость:** \`${volume}%\` • **Всего треков:** \`${tracks.length + (currentTrack ? 1 : 0)}\``
      );

    if (currentTrack) {
      embed.addFields({
        name: '▶️ Сейчас играет:',
        value: `[**${currentTrack.title}**](${currentTrack.originalUrl}) (${currentTrack.durationFormatted}) | *Запросил: ${currentTrack.requestedBy.tag}*`,
        inline: false,
      });
    }

    if (tracks.length > 0) {
      const displayTracks = tracks.slice(0, 10);
      const list = displayTracks
        .map(
          (t, i) =>
            `\`${i + 1}.\` [${t.title}](${t.originalUrl}) \`[${t.durationFormatted}]\` — *${t.requestedBy.tag}*`
        )
        .join('\n');

      const remaining = tracks.length - displayTracks.length;
      const footerExtra = remaining > 0 ? `\n\n*...и ещё ${remaining} трек(ов) в очереди*` : '';

      embed.addFields({
        name: '📑 Далее в очереди:',
        value: list + footerExtra,
        inline: false,
      });
    }

    await interaction.reply({ embeds: [embed] });
  },
  async executePrefix(message) {
    const worker = workerPool.getWorkerForMember(message.member);

    if (!worker || (!worker.queue.currentTrack && worker.queue.tracks.length === 0)) {
      await message.reply('📭 Очередь воспроизведения в вашем канале пуста.');
      return;
    }

    const { currentTrack, tracks, loopMode, volume } = worker.queue;

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle(`🎵 Очередь канала (Воркер #${worker.id})`)
      .setDescription(
        `• **Режим повтора:** \`${loopMode.toUpperCase()}\` • **Громкость:** \`${volume}%\` • **Всего треков:** \`${tracks.length + (currentTrack ? 1 : 0)}\``
      );

    if (currentTrack) {
      embed.addFields({
        name: '▶️ Сейчас играет:',
        value: `[**${currentTrack.title}**](${currentTrack.originalUrl}) (${currentTrack.durationFormatted}) | *Запросил: ${currentTrack.requestedBy.tag}*`,
        inline: false,
      });
    }

    if (tracks.length > 0) {
      const displayTracks = tracks.slice(0, 10);
      const list = displayTracks
        .map(
          (t, i) =>
            `\`${i + 1}.\` [${t.title}](${t.originalUrl}) \`[${t.durationFormatted}]\` — *${t.requestedBy.tag}*`
        )
        .join('\n');

      const remaining = tracks.length - displayTracks.length;
      const footerExtra = remaining > 0 ? `\n\n*...и ещё ${remaining} трек(ов) в очереди*` : '';

      embed.addFields({
        name: '📑 Далее в очереди:',
        value: list + footerExtra,
        inline: false,
      });
    }

    await message.reply({ embeds: [embed] });
  },
};
