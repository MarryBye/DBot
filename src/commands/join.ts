import { GuildMember, SlashCommandBuilder } from 'discord.js';
import { actorFromDiscord, AuditLogService } from '../services/audit-log.js';
import { workerPool } from '../voice/index.js';
import type { Command } from '../types.js';

export const command: Command = {
  data: new SlashCommandBuilder()
    .setName('join')
    .setDescription('Вызывает свободного воркер-бота в ваш текущий голосовой канал'),
  async execute(interaction) {
    const member = interaction.member as GuildMember;
    const voiceChannel = member?.voice?.channel;

    if (!voiceChannel) {
      await interaction.reply({
        content: '❌ Сначала зайдите в любой голосовой канал!',
        ephemeral: true,
      });
      return;
    }

    const existing = workerPool.getWorkerForChannel(voiceChannel.id);
    if (existing) {
      await interaction.reply({
        content: `ℹ️ В этом канале уже находится **Воркер #${existing.id}** (${existing.client.user?.tag}).`,
        ephemeral: true,
      });
      return;
    }

    await interaction.deferReply();

    try {
      const worker = await workerPool.ensureWorkerInChannel(
        voiceChannel.id,
        interaction.guildId!
      );
      void AuditLogService.record({
        guildId: interaction.guildId!,
        channelId: voiceChannel.id,
        channelName: voiceChannel.name,
        workerId: worker.id,
        actor: actorFromDiscord(interaction.user, member),
        source: 'discord',
        action: 'summon',
      });
      await interaction.editReply(
        `✅ **Воркер #${worker.id}** (${worker.client.user?.tag}) подключился к каналу **${voiceChannel.name}**!`
      );
    } catch (error: any) {
      await interaction.editReply(error?.message || '❌ Не удалось подключить воркера.');
    }
  },
  async executePrefix(message) {
    const member = message.member;
    const voiceChannel = member?.voice?.channel;

    if (!voiceChannel) {
      await message.reply('❌ Сначала зайдите в любой голосовой канал!');
      return;
    }

    const existing = workerPool.getWorkerForChannel(voiceChannel.id);
    if (existing) {
      await message.reply(
        `ℹ️ В этом канале уже находится **Воркер #${existing.id}** (${existing.client.user?.tag}).`
      );
      return;
    }

    const statusMsg = await message.reply('⏳ Подключаю свободного агента к каналу...');

    try {
      const worker = await workerPool.ensureWorkerInChannel(
        voiceChannel.id,
        message.guildId!
      );
      void AuditLogService.record({
        guildId: message.guildId!,
        channelId: voiceChannel.id,
        channelName: voiceChannel.name,
        workerId: worker.id,
        actor: actorFromDiscord(message.author, member),
        source: 'discord',
        action: 'summon',
      });
      await statusMsg.edit(
        `✅ **Воркер #${worker.id}** (${worker.client.user?.tag}) подключился к каналу **${voiceChannel.name}**!`
      );
    } catch (error: any) {
      await statusMsg.edit(error?.message || '❌ Не удалось подключить воркера.');
    }
  },
};
