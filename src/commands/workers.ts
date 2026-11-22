import { EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import { workerPool } from '../voice/index.js';
import type { Command } from '../types.js';

function buildWorkersEmbed(currentGuildId: string): EmbedBuilder | null {
  const statuses = workerPool.getAllStatuses();

  if (statuses.length === 0) {
    return null;
  }

  const availableHere = workerPool.getAvailableCountForGuild(currentGuildId);

  const embed = new EmbedBuilder()
    .setColor(0x57f287)
    .setTitle('🎙️ Статус пула голосовых воркеров')
    .setDescription(
      `Всего настроено: **${workerPool.totalCount}** | Свободно на этом сервере: **${availableHere}**`
    );

  for (const w of statuses) {
    let stateIcon = '🔴';
    let stateText = 'Офлайн (не подключен)';

    if (w.isOnline) {
      if (w.isInChannel) {
        stateIcon = '🔊';
        const otherGuild =
          w.guildId && w.guildId !== currentGuildId && w.guildName
            ? ` *(сервер: ${w.guildName})*`
            : '';
        stateText = `Играет в канале: **${w.channelName ?? w.channelId}**${otherGuild}`;
      } else {
        stateIcon = '🟢';
        stateText = 'Свободен (готов подключиться в войс)';
      }
    }

    embed.addFields({
      name: `${stateIcon} ${w.name} (${w.tag})`,
      value: `Состояние: ${stateText}${w.isOnline ? ` • Задержка: ${w.ping}мс` : ''}`,
      inline: false,
    });
  }

  return embed;
}

export const command: Command = {
  data: new SlashCommandBuilder()
    .setName('workers')
    .setDescription('Показывает текущий статус и занятость голосовых воркер-агентов'),
  async execute(interaction) {
    const embed = buildWorkersEmbed(interaction.guildId!);

    if (!embed) {
      await interaction.reply({
        content: '⚙️ В пуле нет настроенных воркеров. Добавьте токены `WORKER_TOKEN_1`..`5` в файл `.env`.',
        ephemeral: true,
      });
      return;
    }

    await interaction.reply({ embeds: [embed] });
  },
  async executePrefix(message) {
    const embed = buildWorkersEmbed(message.guildId!);

    if (!embed) {
      await message.reply('⚙️ В пуле нет настроенных воркеров. Добавьте токены `WORKER_TOKEN_1`..`5` в файл `.env`.');
      return;
    }

    await message.reply({ embeds: [embed] });
  },
};
