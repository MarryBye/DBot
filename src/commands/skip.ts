import { GuildMember, SlashCommandBuilder } from 'discord.js';
import { workerPool } from '../voice/index.js';
import type { Command } from '../types.js';

export const command: Command = {
  data: new SlashCommandBuilder()
    .setName('skip')
    .setDescription('Пропустить текущий трек')
    .addIntegerOption((option) =>
      option
        .setName('count')
        .setDescription('Количество треков для пропуска (по умолчанию 1)')
        .setMinValue(1)
        .setRequired(false)
    ),
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

    const count = interaction.options.getInteger('count') ?? 1;
    const skipped = worker.queue.skip(count);

    await interaction.reply(
      `⏭️ Пропущен трек **"${skipped?.title ?? 'Текущий'}"** ${count > 1 ? `(${count} шт.)` : ''}`
    );
  },
  async executePrefix(message, args) {
    const worker = workerPool.getWorkerForMember(message.member);

    if (!worker || !worker.queue.currentTrack) {
      await message.reply('❌ В вашем голосовом канале сейчас ничего не играет.');
      return;
    }

    const count = args[0] ? parseInt(args[0], 10) : 1;
    const safeCount = isNaN(count) || count < 1 ? 1 : count;

    const skipped = worker.queue.skip(safeCount);

    await message.reply(
      `⏭️ Пропущен трек **"${skipped?.title ?? 'Текущий'}"** ${safeCount > 1 ? `(${safeCount} шт.)` : ''}`
    );
  },
};
