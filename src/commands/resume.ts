import { GuildMember, SlashCommandBuilder } from 'discord.js';
import { workerPool } from '../voice/index.js';
import type { Command } from '../types.js';

export const command: Command = {
  data: new SlashCommandBuilder()
    .setName('resume')
    .setDescription('Возобновить воспроизведение музыки'),
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

    const resumed = worker.queue.resume();
    if (!resumed) {
      await interaction.reply({
        content: '⚠️ Музыка не находится на паузе.',
        ephemeral: true,
      });
      return;
    }

    await interaction.reply(`▶️ Воспроизведение возобновлено воркером **#${worker.id}**.`);
  },
  async executePrefix(message) {
    const worker = workerPool.getWorkerForMember(message.member);

    if (!worker || !worker.queue.currentTrack) {
      await message.reply('❌ В вашем голосовом канале сейчас ничего не играет.');
      return;
    }

    const resumed = worker.queue.resume();
    if (!resumed) {
      await message.reply('⚠️ Музыка не находится на паузе.');
      return;
    }

    await message.reply(`▶️ Воспроизведение возобновлено воркером **#${worker.id}**.`);
  },
};
