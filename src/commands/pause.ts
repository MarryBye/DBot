import { GuildMember, SlashCommandBuilder } from 'discord.js';
import { actorFromDiscord, AuditLogService, toAuditTrack } from '../services/audit-log.js';
import { workerPool } from '../voice/index.js';
import type { Command } from '../types.js';

export const command: Command = {
  data: new SlashCommandBuilder()
    .setName('pause')
    .setDescription('Приостановить воспроизведение музыки'),
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

    const paused = worker.queue.pause();
    if (!paused) {
      await interaction.reply({
        content: '⚠️ Музыка уже стоит на паузе.',
        ephemeral: true,
      });
      return;
    }

    if (worker.currentGuildId && worker.currentChannelId) {
      void AuditLogService.record({
        guildId: worker.currentGuildId,
        channelId: worker.currentChannelId,
        channelName: member.voice.channel?.name ?? null,
        workerId: worker.id,
        actor: actorFromDiscord(interaction.user, member),
        source: 'discord',
        action: 'pause',
        tracks: worker.queue.currentTrack ? [toAuditTrack(worker.queue.currentTrack)] : [],
      });
      workerPool.emitActivity({
        guildId: worker.currentGuildId,
        channelId: worker.currentChannelId,
        action: 'pause',
        actorId: interaction.user.id,
        actorName: member.displayName || interaction.user.username,
      });
    }
    await interaction.reply(`⏸️ Воспроизведение приостановлено воркером **#${worker.id}**.`);
  },
  async executePrefix(message) {
    const worker = workerPool.getWorkerForMember(message.member);

    if (!worker || !worker.queue.currentTrack) {
      await message.reply('❌ В вашем голосовом канале сейчас ничего не играет.');
      return;
    }

    const paused = worker.queue.pause();
    if (!paused) {
      await message.reply('⚠️ Музыка уже стоит на паузе.');
      return;
    }

    if (worker.currentGuildId && worker.currentChannelId) {
      void AuditLogService.record({
        guildId: worker.currentGuildId,
        channelId: worker.currentChannelId,
        channelName: message.member?.voice.channel?.name ?? null,
        workerId: worker.id,
        actor: actorFromDiscord(message.author, message.member),
        source: 'discord',
        action: 'pause',
        tracks: worker.queue.currentTrack ? [toAuditTrack(worker.queue.currentTrack)] : [],
      });
      workerPool.emitActivity({
        guildId: worker.currentGuildId,
        channelId: worker.currentChannelId,
        action: 'pause',
        actorId: message.author.id,
        actorName: message.member?.displayName || message.author.username,
      });
    }
    await message.reply(`⏸️ Воспроизведение приостановлено воркером **#${worker.id}**.`);
  },
};
