import { EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import { config } from '../config.js';
import { createMagicLoginLink } from '../web/auth.js';
import type { Command } from '../types.js';

export const command: Command = {
  data: new SlashCommandBuilder()
    .setName('web')
    .setDescription('Получить личную ссылку для мгновенного входа в веб-панель управления'),
  async execute(interaction) {
    const magicLink = createMagicLoginLink({
      id: interaction.user.id,
      tag: interaction.user.tag,
      avatarUrl: interaction.user.displayAvatarURL({ size: 128 }),
      guildId: interaction.guildId ?? undefined,
    });

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle('🌐 Веб-панель управления DBot')
      .setDescription(
        `Нажмите по вашей персональной ссылке для мгновенного входа:\n` +
          `👉 **[Открыть веб-панель](${magicLink})**\n\n` +
          `• Ссылка одноразовая и действует **10 минут**.\n` +
          `• Панель автоматически видит ваш сервер и голосовой канал и привязывает кнопки к вашему агенту.\n` +
          `• Прямой адрес панели: \`${config.publicUrl}\``
      )
      .setFooter({ text: 'Не пересылайте ссылку другим — она привязана к вашему аккаунту Discord' });

    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
  async executePrefix(message) {
    const magicLink = createMagicLoginLink({
      id: message.author.id,
      tag: message.author.tag,
      avatarUrl: message.author.displayAvatarURL({ size: 128 }),
      guildId: message.guildId ?? undefined,
    });

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle('🌐 Веб-панель управления DBot')
      .setDescription(
        `Ваша личная одноразовая ссылка (действует 10 минут):\n` +
          `👉 **[Открыть веб-панель](${magicLink})**\n\n` +
          `Прямой адрес: \`${config.publicUrl}\``
      );

    try {
      await message.author.send({ embeds: [embed] });
      await message.reply('📩 Отправил личную ссылку для входа в веб-панель вам в личные сообщения (ЛС)!');
    } catch {
      await message.reply(
        `⚠️ Не удалось отправить ЛС (возможно, у вас закрыты личные сообщения). Используйте слэш-команду \`/web\` — она выдаст приватную ссылку прямо здесь, видимую только вам!`
      );
    }
  },
};
