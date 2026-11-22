import { EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import { and, eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { notes } from '../db/schema.js';
import type { Command } from '../types.js';

export const command: Command = {
  data: new SlashCommandBuilder()
    .setName('note')
    .setDescription('Управление личными заметками в базе данных SQLite')
    .addSubcommand((subcommand) =>
      subcommand
        .setName('add')
        .setDescription('Добавить новую заметку')
        .addStringOption((option) =>
          option
            .setName('title')
            .setDescription('Заголовок или ключевое слово заметки')
            .setRequired(true)
        )
        .addStringOption((option) =>
          option
            .setName('content')
            .setDescription('Текст содержимого заметки')
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('get')
        .setDescription('Получить заметку по заголовку')
        .addStringOption((option) =>
          option
            .setName('title')
            .setDescription('Заголовок заметки для поиска')
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('list')
        .setDescription('Показать список всех ваших сохраненных заметок')
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('delete')
        .setDescription('Удалить заметку по заголовку')
        .addStringOption((option) =>
          option
            .setName('title')
            .setDescription('Заголовок заметки для удаления')
            .setRequired(true)
        )
    ),
  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    const userId = interaction.user.id;
    const guildId = interaction.guildId!;

    if (subcommand === 'add') {
      const title = interaction.options.getString('title', true).trim();
      const content = interaction.options.getString('content', true).trim();

      const existing = await db
        .select()
        .from(notes)
        .where(
          and(
            eq(notes.userId, userId),
            eq(notes.guildId, guildId),
            eq(notes.title, title)
          )
        )
        .limit(1);

      if (existing.length > 0) {
        await interaction.reply({
          content: `⚠️ Заметка с заголовком **"${title}"** уже существует. Сначала удалите её или выберите другое имя.`,
          ephemeral: true,
        });
        return;
      }

      await db.insert(notes).values({
        userId,
        guildId,
        title,
        content,
      });

      await interaction.reply({
        content: `✅ Заметка **"${title}"** успешно сохранена в SQLite!`,
        ephemeral: true,
      });
    } else if (subcommand === 'get') {
      const title = interaction.options.getString('title', true).trim();

      const [found] = await db
        .select()
        .from(notes)
        .where(
          and(
            eq(notes.userId, userId),
            eq(notes.guildId, guildId),
            eq(notes.title, title)
          )
        )
        .limit(1);

      if (!found) {
        await interaction.reply({
          content: `❌ Заметка с заголовком **"${title}"** не найдена.`,
          ephemeral: true,
        });
        return;
      }

      const embed = new EmbedBuilder()
        .setColor(0x57f287)
        .setTitle(`📝 ${found.title}`)
        .setDescription(found.content)
        .setFooter({ text: `Создана: ${found.createdAt.toLocaleString('ru-RU')}` });

      await interaction.reply({ embeds: [embed] });
    } else if (subcommand === 'list') {
      const userNotes = await db
        .select()
        .from(notes)
        .where(and(eq(notes.userId, userId), eq(notes.guildId, guildId)));

      if (userNotes.length === 0) {
        await interaction.reply({
          content: '📭 У вас пока нет сохраненных заметок. Добавьте первую через `/note add`!',
          ephemeral: true,
        });
        return;
      }

      const listText = userNotes
        .map((n, i) => `${i + 1}. **${n.title}** — ${n.content.slice(0, 50)}${n.content.length > 50 ? '...' : ''}`)
        .join('\n');

      const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle(`📚 Ваши сохраненные заметки (${userNotes.length})`)
        .setDescription(listText);

      await interaction.reply({ embeds: [embed], ephemeral: true });
    } else if (subcommand === 'delete') {
      const title = interaction.options.getString('title', true).trim();

      const deleted = await db
        .delete(notes)
        .where(
          and(
            eq(notes.userId, userId),
            eq(notes.guildId, guildId),
            eq(notes.title, title)
          )
        )
        .returning();

      if (deleted.length === 0) {
        await interaction.reply({
          content: `❌ Заметка с заголовком **"${title}"** не найдена.`,
          ephemeral: true,
        });
        return;
      }

      await interaction.reply({
        content: `🗑️ Заметка **"${title}"** удалена.`,
        ephemeral: true,
      });
    }
  },
  async executePrefix(message, args) {
    const sub = args[0]?.toLowerCase();
    const userId = message.author.id;
    const guildId = message.guildId!;

    if (sub === 'add') {
      const title = args[1];
      const content = args.slice(2).join(' ').trim();

      if (!title || !content) {
        await message.reply('Использование: `+note add <заголовок> <текст заметки>`');
        return;
      }

      const existing = await db
        .select()
        .from(notes)
        .where(
          and(
            eq(notes.userId, userId),
            eq(notes.guildId, guildId),
            eq(notes.title, title)
          )
        )
        .limit(1);

      if (existing.length > 0) {
        await message.reply(`⚠️ Заметка с заголовком **"${title}"** уже существует.`);
        return;
      }

      await db.insert(notes).values({
        userId,
        guildId,
        title,
        content,
      });

      await message.reply(`✅ Заметка **"${title}"** успешно сохранена в SQLite!`);
    } else if (sub === 'get') {
      const title = args.slice(1).join(' ').trim();
      if (!title) {
        await message.reply('Использование: `+note get <заголовок>`');
        return;
      }

      const [found] = await db
        .select()
        .from(notes)
        .where(
          and(
            eq(notes.userId, userId),
            eq(notes.guildId, guildId),
            eq(notes.title, title)
          )
        )
        .limit(1);

      if (!found) {
        await message.reply(`❌ Заметка с заголовком **"${title}"** не найдена.`);
        return;
      }

      const embed = new EmbedBuilder()
        .setColor(0x57f287)
        .setTitle(`📝 ${found.title}`)
        .setDescription(found.content)
        .setFooter({ text: `Создана: ${found.createdAt.toLocaleString('ru-RU')}` });

      await message.reply({ embeds: [embed] });
    } else if (sub === 'list') {
      const userNotes = await db
        .select()
        .from(notes)
        .where(and(eq(notes.userId, userId), eq(notes.guildId, guildId)));

      if (userNotes.length === 0) {
        await message.reply('📭 У вас пока нет сохраненных заметок. Добавьте первую через `+note add <заголовок> <текст>`!');
        return;
      }

      const listText = userNotes
        .map((n, i) => `${i + 1}. **${n.title}** — ${n.content.slice(0, 50)}${n.content.length > 50 ? '...' : ''}`)
        .join('\n');

      const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle(`📚 Ваши сохраненные заметки (${userNotes.length})`)
        .setDescription(listText);

      await message.reply({ embeds: [embed] });
    } else if (sub === 'delete') {
      const title = args.slice(1).join(' ').trim();
      if (!title) {
        await message.reply('Использование: `+note delete <заголовок>`');
        return;
      }

      const deleted = await db
        .delete(notes)
        .where(
          and(
            eq(notes.userId, userId),
            eq(notes.guildId, guildId),
            eq(notes.title, title)
          )
        )
        .returning();

      if (deleted.length === 0) {
        await message.reply(`❌ Заметка с заголовком **"${title}"** не найдена.`);
        return;
      }

      await message.reply(`🗑️ Заметка **"${title}"** удалена.`);
    } else {
      await message.reply(
        'ℹ️ **Формат вызова +note:**\n' +
          '• `+note add <заголовок> <текст>` — создать заметку\n' +
          '• `+note get <заголовок>` — прочитать заметку\n' +
          '• `+note list` — список всех заметок\n' +
          '• `+note delete <заголовок>` — удалить заметку'
      );
    }
  },
};
