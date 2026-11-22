import { EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import type { Command } from '../types.js';

export const command: Command = {
  data: new SlashCommandBuilder()
    .setName('info')
    .setDescription('Показывает общую информацию о боте или выбранном пользователе')
    .addUserOption((option) =>
      option
        .setName('user')
        .setDescription('Пользователь, информацию о котором нужно отобразить')
        .setRequired(false)
    ),
  async execute(interaction) {
    const targetUser = interaction.options.getUser('user') ?? interaction.user;
    const member = interaction.guild?.members.cache.get(targetUser.id);

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle(`ℹ️ Информация: ${targetUser.tag}`)
      .setThumbnail(targetUser.displayAvatarURL())
      .addFields(
        { name: 'ID пользователя', value: targetUser.id, inline: true },
        { name: 'Бот?', value: targetUser.bot ? 'Да' : 'Нет', inline: true },
        {
          name: 'Дата регистрации',
          value: `<t:${Math.floor(targetUser.createdTimestamp / 1000)}:f>`,
          inline: false,
        }
      )
      .setTimestamp();

    if (member?.joinedTimestamp) {
      embed.addFields({
        name: 'Присоединился к серверу',
        value: `<t:${Math.floor(member.joinedTimestamp / 1000)}:f>`,
        inline: false,
      });
    }

    await interaction.reply({ embeds: [embed] });
  },
  async executePrefix(message, args) {
    let targetUser = message.mentions.users.first();
    if (!targetUser && args[0]) {
      try {
        targetUser = await message.client.users.fetch(args[0]);
      } catch {
        targetUser = message.author;
      }
    }
    if (!targetUser) {
      targetUser = message.author;
    }

    const member = message.guild?.members.cache.get(targetUser.id);

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle(`ℹ️ Информация: ${targetUser.tag}`)
      .setThumbnail(targetUser.displayAvatarURL())
      .addFields(
        { name: 'ID пользователя', value: targetUser.id, inline: true },
        { name: 'Бот?', value: targetUser.bot ? 'Да' : 'Нет', inline: true },
        {
          name: 'Дата регистрации',
          value: `<t:${Math.floor(targetUser.createdTimestamp / 1000)}:f>`,
          inline: false,
        }
      )
      .setTimestamp();

    if (member?.joinedTimestamp) {
      embed.addFields({
        name: 'Присоединился к серверу',
        value: `<t:${Math.floor(member.joinedTimestamp / 1000)}:f>`,
        inline: false,
      });
    }

    await message.reply({ embeds: [embed] });
  },
};
