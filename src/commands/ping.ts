import { SlashCommandBuilder } from 'discord.js';
import type { Command } from '../types.js';

export const command: Command = {
  data: new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Проверяет задержку бота и WebSocket соединения'),
  async execute(interaction) {
    const sent = await interaction.reply({
      content: '🏓 Измеряю задержку...',
      fetchReply: true,
    });

    const latency = sent.createdTimestamp - interaction.createdTimestamp;
    const wsPing = interaction.client.ws.ping;

    await interaction.editReply(
      `🏓 **Понг!**\n• Ответ бота: **${latency}мс**\n• WebSocket API: **${wsPing}мс**`
    );
  },
  async executePrefix(message) {
    const sent = await message.reply('🏓 Измеряю задержку...');
    const latency = sent.createdTimestamp - message.createdTimestamp;
    const wsPing = message.client.ws.ping;

    await sent.edit(
      `🏓 **Понг!**\n• Ответ бота: **${latency}мс**\n• WebSocket API: **${wsPing}мс**`
    );
  },
};
