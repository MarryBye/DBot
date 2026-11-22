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

    worker.queue.stop();
    await interaction.reply(`⏹️ Воспроизведение остановлено, очередь очищена. **Воркер #${worker.id}** отключен.`);
  },
  async executePrefix(message) {
    const worker = workerPool.getWorkerForMember(message.member);

    if (!worker) {
      await message.reply('❌ В вашем голосовом канале нет активного воркера.');
      return;
    }

    worker.queue.stop();
    await message.reply(`⏹️ Воспроизведение остановлено, очередь очищена. **Воркер #${worker.id}** отключен.`);
  },
};
