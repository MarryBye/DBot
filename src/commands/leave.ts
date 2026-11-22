import { GuildMember, SlashCommandBuilder } from 'discord.js';
import { workerPool } from '../voice/index.js';
import type { Command } from '../types.js';

export const command: Command = {
  data: new SlashCommandBuilder()
    .setName('leave')
    .setDescription('Отключает воркер-бота из вашего текущего голосового канала'),
  async execute(interaction) {
    const member = interaction.member as GuildMember;
    const voiceChannel = member?.voice?.channel;

    if (!voiceChannel) {
      await interaction.reply({
        content: '❌ Вы не находитесь в голосовом канале.',
        ephemeral: true,
      });
      return;
    }

    const worker = workerPool.getWorkerForChannel(voiceChannel.id);
    if (!worker) {
      await interaction.reply({
        content: `ℹ️ В канале **${voiceChannel.name}** нет активных воркеров.`,
        ephemeral: true,
      });
      return;
    }

    worker.leave();

    await interaction.reply({
      content: `👋 **Воркер #${worker.id}** отключен от канала **${voiceChannel.name}** и освобожден в пул.`,
    });
  },
  async executePrefix(message) {
    const member = message.member;
    const voiceChannel = member?.voice?.channel;

    if (!voiceChannel) {
      await message.reply('❌ Вы не находитесь в голосовом канале.');
      return;
    }

    const worker = workerPool.getWorkerForChannel(voiceChannel.id);
    if (!worker) {
      await message.reply(`ℹ️ В канале **${voiceChannel.name}** нет активных воркеров.`);
      return;
    }

    worker.leave();

    await message.reply(
      `👋 **Воркер #${worker.id}** отключен от канала **${voiceChannel.name}** и освобожден в пул.`
    );
  },
};
