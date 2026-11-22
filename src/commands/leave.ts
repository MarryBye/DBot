import { GuildMember, SlashCommandBuilder } from 'discord.js';
import { actorFromDiscord, AuditLogService, toAuditTrack } from '../services/audit-log.js';
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

    const guildId = worker.currentGuildId;
    const channelId = worker.currentChannelId;
    const droppedTracks = [
      ...(worker.queue.currentTrack ? [toAuditTrack(worker.queue.currentTrack)] : []),
      ...worker.queue.tracks.map(toAuditTrack),
    ];
    worker.leave();
    if (guildId && channelId) {
      void AuditLogService.record({
        guildId,
        channelId,
        channelName: voiceChannel.name,
        workerId: worker.id,
        actor: actorFromDiscord(interaction.user, member),
        source: 'discord',
        action: 'stop',
        tracks: droppedTracks,
      });
      workerPool.emitActivity({
        guildId,
        channelId,
        action: 'leave',
        actorId: interaction.user.id,
        actorName: member.displayName || interaction.user.username,
      });
    }

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

    const guildId = worker.currentGuildId;
    const channelId = worker.currentChannelId;
    const droppedTracks = [
      ...(worker.queue.currentTrack ? [toAuditTrack(worker.queue.currentTrack)] : []),
      ...worker.queue.tracks.map(toAuditTrack),
    ];
    worker.leave();
    if (guildId && channelId) {
      void AuditLogService.record({
        guildId,
        channelId,
        channelName: voiceChannel.name,
        workerId: worker.id,
        actor: actorFromDiscord(message.author, member),
        source: 'discord',
        action: 'stop',
        tracks: droppedTracks,
      });
      workerPool.emitActivity({
        guildId,
        channelId,
        action: 'leave',
        actorId: message.author.id,
        actorName: member?.displayName || message.author.username,
      });
    }

    await message.reply(
      `👋 **Воркер #${worker.id}** отключен от канала **${voiceChannel.name}** и освобожден в пул.`
    );
  },
};
