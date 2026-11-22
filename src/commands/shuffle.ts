import { GuildMember, SlashCommandBuilder } from 'discord.js';
import { workerPool } from '../voice/index.js';
import type { Command } from '../types.js';

export const command: Command = {
  data: new SlashCommandBuilder()
    .setName('shuffle')
    .setDescription('Перемешать треки в текущей очереди воспроизведения'),
  async execute(interaction) {
    const member = interaction.member as GuildMember;
    const worker = workerPool.getWorkerForMember(member);

    if (!worker || worker.queue.tracks.length < 2) {
      await interaction.reply({
        content: '⚠️ В очереди должно быть минимум 2 ожидающих трека для перемешивания.',
        ephemeral: true,
      });
      return;
    }

    const count = worker.queue.shuffle();
    if (worker.currentGuildId && worker.currentChannelId) {
      workerPool.emitActivity({
        guildId: worker.currentGuildId,
        channelId: worker.currentChannelId,
        action: 'shuffle',
        actorId: interaction.user.id,
        actorName: member.displayName || interaction.user.username,
      });
    }
    await interaction.reply(`🔀 Очередь перемешана! (${count} треков).`);
  },
  async executePrefix(message) {
    const worker = workerPool.getWorkerForMember(message.member);

    if (!worker || worker.queue.tracks.length < 2) {
      await message.reply('⚠️ В очереди должно быть минимум 2 ожидающих трека для перемешивания.');
      return;
    }

    const count = worker.queue.shuffle();
    if (worker.currentGuildId && worker.currentChannelId) {
      workerPool.emitActivity({
        guildId: worker.currentGuildId,
        channelId: worker.currentChannelId,
        action: 'shuffle',
        actorId: message.author.id,
        actorName: message.member?.displayName || message.author.username,
      });
    }
    await message.reply(`🔀 Очередь перемешана! (${count} треков).`);
  },
};
