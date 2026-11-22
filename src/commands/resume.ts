import { GuildMember, SlashCommandBuilder } from 'discord.js';
import { actorFromDiscord, AuditLogService, toAuditTrack } from '../services/audit-log.js';
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

    if (worker.currentGuildId && worker.currentChannelId) {
      void AuditLogService.record({
        guildId: worker.currentGuildId,
        channelId: worker.currentChannelId,
        channelName: member.voice.channel?.name ?? null,
        workerId: worker.id,
        actor: actorFromDiscord(interaction.user, member),
        source: 'discord',
        action: 'resume',
        tracks: worker.queue.currentTrack ? [toAuditTrack(worker.queue.currentTrack)] : [],
      });
      workerPool.emitActivity({
        guildId: worker.currentGuildId,
        channelId: worker.currentChannelId,
        action: 'resume',
        actorId: interaction.user.id,
        actorName: member.displayName || interaction.user.username,
      });
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

    if (worker.currentGuildId && worker.currentChannelId) {
      void AuditLogService.record({
        guildId: worker.currentGuildId,
        channelId: worker.currentChannelId,
        channelName: message.member?.voice.channel?.name ?? null,
        workerId: worker.id,
        actor: actorFromDiscord(message.author, message.member),
        source: 'discord',
        action: 'resume',
        tracks: worker.queue.currentTrack ? [toAuditTrack(worker.queue.currentTrack)] : [],
      });
      workerPool.emitActivity({
        guildId: worker.currentGuildId,
        channelId: worker.currentChannelId,
        action: 'resume',
        actorId: message.author.id,
        actorName: message.member?.displayName || message.author.username,
      });
    }
    await message.reply(`▶️ Воспроизведение возобновлено воркером **#${worker.id}**.`);
  },
};
