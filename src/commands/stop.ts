import { GuildMember, SlashCommandBuilder } from 'discord.js';
import { workerPool } from '../voice/index.js';
import type { Command } from '../types.js';

export const command: Command = {
  data: new SlashCommandBuilder()
    .setName('stop')
    .setDescription('Остановить воспроизведение, очистить очередь и отключить воркера'),
  async execute(interaction) {
    const member = interaction.member as GuildMember;
    const worker = workerPool.getWorkerForMember(member);

    if (!worker) {
      await interaction.reply({
        content: '❌ В вашем голосовом канале нет активного воркера.',
        ephemeral: true,
      });
      return;
    }

    const guildId = worker.currentGuildId;
    const channelId = worker.currentChannelId;
    worker.queue.stop();
    if (guildId && channelId) {
      workerPool.emitActivity({
        guildId,
        channelId,
        action: 'stop',
        actorId: interaction.user.id,
        actorName: member.displayName || interaction.user.username,
      });
    }
    await interaction.reply(`⏹️ Воспроизведение остановлено, очередь очищена. **Воркер #${worker.id}** отключен.`);
  },
  async executePrefix(message) {
    const worker = workerPool.getWorkerForMember(message.member);

    if (!worker) {
      await message.reply('❌ В вашем голосовом канале нет активного воркера.');
      return;
    }

    const guildId = worker.currentGuildId;
    const channelId = worker.currentChannelId;
    worker.queue.stop();
    if (guildId && channelId) {
      workerPool.emitActivity({
        guildId,
        channelId,
        action: 'stop',
        actorId: message.author.id,
        actorName: message.member?.displayName || message.author.username,
      });
    }
    await message.reply(`⏹️ Воспроизведение остановлено, очередь очищена. **Воркер #${worker.id}** отключен.`);
  },
};
