import {
  EmbedBuilder,
  GuildMember,
  SlashCommandBuilder,
} from 'discord.js';
import { config } from '../config.js';
import { workerPool } from '../voice/index.js';
import { MyInstantsClient, SoundboardService } from '../voice/soundboard.js';
import type { Command } from '../types.js';

export const command: Command = {
  data: new SlashCommandBuilder()
    .setName('sound')
    .setDescription('Саундборд: мемы с MyInstants и ваши загруженные звуки')
    .addSubcommand((sub) =>
      sub
        .setName('play')
        .setDescription('Воспроизвести загруженный звук из библиотеки сервера')
        .addStringOption((opt) =>
          opt
            .setName('name')
            .setDescription('Название звука из библиотеки')
            .setRequired(true)
            .setAutocomplete(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('meme')
        .setDescription('Найти и воспроизвести мем-звук через открытое API MyInstants')
        .addStringOption((opt) =>
          opt
            .setName('query')
            .setDescription('Название мема (например: vine boom, bruh, apple pay)')
            .setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('upload')
        .setDescription('Загрузить свой аудиофайл в саундборд сервера (mp3/wav/ogg)')
        .addStringOption((opt) =>
          opt
            .setName('name')
            .setDescription('Уникальное название кнопки звука')
            .setRequired(true)
        )
        .addAttachmentOption((opt) =>
          opt
            .setName('file')
            .setDescription('Аудиофайл (.mp3, .wav, .ogg, до 10 МБ)')
            .setRequired(true)
        )
        .addStringOption((opt) =>
          opt
            .setName('emoji')
            .setDescription('Эмодзи для кнопки (например: 😂 или 🔥)')
            .setRequired(false)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('list')
        .setDescription('Показать список всех загруженных звуков сервера')
    )
    .addSubcommand((sub) =>
      sub
        .setName('delete')
        .setDescription('Удалить загруженный звук из саундборда')
        .addStringOption((opt) =>
          opt
            .setName('name')
            .setDescription('Название звука для удаления')
            .setRequired(true)
            .setAutocomplete(true)
        )
    ),
  async autocomplete(interaction) {
    const focused = interaction.options.getFocused().toLowerCase();
    const list = await SoundboardService.listCustomSounds(interaction.guildId!);
    const matches = list
      .filter((s) => s.name.toLowerCase().includes(focused))
      .slice(0, 25)
      .map((s) => ({
        name: `${s.emoji} ${s.name}`,
        value: s.name,
      }));
    await interaction.respond(matches);
  },
  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId!;

    if (sub === 'list') {
      const list = await SoundboardService.listCustomSounds(guildId);
      if (list.length === 0) {
        await interaction.reply({
          content:
            '📭 В саундборде сервера пока нет загруженных звуков.\n' +
            'Загрузите звук через `/sound upload` или веб-панель (`/web`), либо проиграйте любой мем командой `/sound meme <название>`!',
          ephemeral: true,
        });
        return;
      }

      const lines = list
        .slice(0, 30)
        .map((s, i) => `\`${i + 1}.\` ${s.emoji} **${s.name}** *(от ${s.uploadedByTag})*`)
        .join('\n');

      const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle(`🔊 Саундборд сервера (${list.length})`)
        .setDescription(lines)
        .setFooter({ text: 'Воспроизвести: /sound play <название> или +sound <название>' });

      await interaction.reply({ embeds: [embed] });
      return;
    }

    if (sub === 'upload') {
      const name = interaction.options.getString('name', true).trim();
      const attachment = interaction.options.getAttachment('file', true);
      const emoji = interaction.options.getString('emoji') ?? '🔊';

      await interaction.deferReply({ ephemeral: true });

      try {
        const res = await fetch(attachment.url);
        if (!res.ok) throw new Error(`Не удалось скачать вложение (${res.status})`);
        const buffer = Buffer.from(await res.arrayBuffer());

        const saved = await SoundboardService.saveCustomSound({
          guildId,
          name,
          buffer,
          originalFilename: attachment.name || 'sound.mp3',
          mimeType: attachment.contentType ?? undefined,
          emoji,
          uploadedById: interaction.user.id,
          uploadedByTag: interaction.user.tag,
        });

        workerPool.events.emit('soundsChanged');
        await interaction.editReply(
          `✅ Звук ${saved.emoji} **${saved.name}** успешно загружен! Теперь он доступен через \`/sound play\`, \`+sound ${saved.name}\` и в веб-панели.`
        );
      } catch (err: any) {
        await interaction.editReply(`❌ Ошибка загрузки: ${err?.message || 'Неизвестная ошибка'}`);
      }
      return;
    }

    if (sub === 'delete') {
      const name = interaction.options.getString('name', true).trim();
      const found = await SoundboardService.findCustomSoundByName(guildId, name);
      if (!found) {
        await interaction.reply({ content: `❌ Звук **"${name}"** не найден.`, ephemeral: true });
        return;
      }
      await SoundboardService.deleteCustomSound(guildId, found.id);
      workerPool.events.emit('soundsChanged');
      await interaction.reply({
        content: `🗑️ Звук ${found.emoji} **${found.name}** удалён из саундборда.`,
        ephemeral: true,
      });
      return;
    }

    // Play / Meme требуют нахождения пользователя в голосовом канале
    const member = interaction.member as GuildMember;
    const voiceChannel = member?.voice?.channel;
    if (!voiceChannel) {
      await interaction.reply({
        content: '❌ Сначала зайдите в голосовой канал!',
        ephemeral: true,
      });
      return;
    }

    await interaction.deferReply();

    try {
      const worker = await workerPool.ensureWorkerInChannel(voiceChannel.id, guildId);

      if (sub === 'play') {
        const name = interaction.options.getString('name', true).trim();
        const found = await SoundboardService.findCustomSoundByName(guildId, name);
        if (!found) {
          await interaction.editReply(`❌ Звук **"${name}"** не найден в библиотеке сервера.`);
          return;
        }
        await worker.queue.playSoundEffect({
          name: found.name,
          filePath: SoundboardService.getSoundFilePath(found),
        });
        await interaction.editReply(
          `${found.emoji} Воспроизвожу звук **${found.name}** (Агент #${worker.id})`
        );
        return;
      }

      if (sub === 'meme') {
        const query = interaction.options.getString('query', true).trim();
        const results = await MyInstantsClient.search(query, 3);
        if (results.length === 0) {
          await interaction.editReply(`❌ На MyInstants не найдено мемов по запросу **"${query}"**.`);
          return;
        }
        const best = results[0];
        await worker.queue.playSoundEffect({
          name: best.name,
          url: best.url,
        });
        await interaction.editReply(
          `😂 Воспроизвожу мем **${best.name}** *(MyInstants • Агент #${worker.id})*`
        );
      }
    } catch (err: any) {
      await interaction.editReply(err?.message || '❌ Не удалось воспроизвести звук.');
    }
  },
  async executePrefix(message, args) {
    const guildId = message.guildId!;
    const invokedCmd = message.content
      .slice(config.prefix.length)
      .trim()
      .split(/\s+/)[0]
      ?.toLowerCase();

    // Прямой алиас +meme <запрос>
    if (invokedCmd === 'meme') {
      const query = args.join(' ').trim();
      if (!query) {
        await message.reply('Использование: `+meme <название мема>` (например: `+meme vine boom`)');
        return;
      }
      const voiceChannel = message.member?.voice?.channel;
      if (!voiceChannel) {
        await message.reply('❌ Сначала зайдите в голосовой канал!');
        return;
      }
      const statusMsg = await message.reply(`🔎 Ищу мем "${query}" на MyInstants...`);
      try {
        const worker = await workerPool.ensureWorkerInChannel(voiceChannel.id, guildId);
        const results = await MyInstantsClient.search(query, 3);
        if (results.length === 0) {
          await statusMsg.edit(`❌ На MyInstants не найдено мемов по запросу **"${query}"**.`);
          return;
        }
        const best = results[0];
        await worker.queue.playSoundEffect({ name: best.name, url: best.url });
        await statusMsg.edit(`😂 Воспроизвожу мем **${best.name}** *(MyInstants • Агент #${worker.id})*`);
      } catch (err: any) {
        await statusMsg.edit(err?.message || '❌ Не удалось воспроизвести мем.');
      }
      return;
    }

    const sub = args[0]?.toLowerCase();

    if (!sub) {
      await message.reply(
        '🔊 **Саундборд — команды:**\n' +
          '• `+sound <название>` — проиграть свой звук (или мем с MyInstants)\n' +
          '• `+meme <запрос>` — найти и проиграть мем с MyInstants\n' +
          '• `+sound list` — список загруженных звуков\n' +
          '• `+sound upload <название>` *(прикрепите mp3/wav/ogg к сообщению)*\n' +
          '• `+sound delete <название>` — удалить звук'
      );
      return;
    }

    if (sub === 'list') {
      const list = await SoundboardService.listCustomSounds(guildId);
      if (list.length === 0) {
        await message.reply('📭 Пока нет загруженных звуков. Загрузите через `+sound upload <название>` с прикреплённым файлом или в веб-панели!');
        return;
      }
      const lines = list
        .slice(0, 30)
        .map((s, i) => `\`${i + 1}.\` ${s.emoji} **${s.name}** *(от ${s.uploadedByTag})*`)
        .join('\n');
      const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle(`🔊 Саундборд сервера (${list.length})`)
        .setDescription(lines);
      await message.reply({ embeds: [embed] });
      return;
    }

    if (sub === 'upload') {
      const name = args.slice(1).join(' ').trim();
      const attachment = message.attachments.first();
      if (!name || !attachment) {
        await message.reply('Использование: прикрепите аудиофайл к сообщению и напишите `+sound upload <название>`');
        return;
      }
      const statusMsg = await message.reply('⏳ Загружаю звук...');
      try {
        const res = await fetch(attachment.url);
        if (!res.ok) throw new Error(`Не удалось скачать файл (${res.status})`);
        const buffer = Buffer.from(await res.arrayBuffer());
        const saved = await SoundboardService.saveCustomSound({
          guildId,
          name,
          buffer,
          originalFilename: attachment.name || 'sound.mp3',
          mimeType: attachment.contentType ?? undefined,
          uploadedById: message.author.id,
          uploadedByTag: message.author.tag,
        });
        workerPool.events.emit('soundsChanged');
        await statusMsg.edit(`✅ Звук ${saved.emoji} **${saved.name}** загружен в саундборд!`);
      } catch (err: any) {
        await statusMsg.edit(`❌ Ошибка загрузки: ${err?.message || 'Неизвестная ошибка'}`);
      }
      return;
    }

    if (sub === 'delete') {
      const name = args.slice(1).join(' ').trim();
      if (!name) {
        await message.reply('Использование: `+sound delete <название>`');
        return;
      }
      const found = await SoundboardService.findCustomSoundByName(guildId, name);
      if (!found) {
        await message.reply(`❌ Звук **"${name}"** не найден.`);
        return;
      }
      await SoundboardService.deleteCustomSound(guildId, found.id);
      workerPool.events.emit('soundsChanged');
      await message.reply(`🗑️ Звук ${found.emoji} **${found.name}** удалён.`);
      return;
    }

    // Проигрывание: сначала ищем в локальной библиотеке, если нет — ищем на MyInstants!
    const voiceChannel = message.member?.voice?.channel;
    if (!voiceChannel) {
      await message.reply('❌ Сначала зайдите в голосовой канал!');
      return;
    }

    const query = args.join(' ').trim();
    try {
      const worker = await workerPool.ensureWorkerInChannel(voiceChannel.id, guildId);
      const local = await SoundboardService.findCustomSoundByName(guildId, query);
      if (local) {
        await worker.queue.playSoundEffect({
          name: local.name,
          filePath: SoundboardService.getSoundFilePath(local),
        });
        await message.reply(`${local.emoji} Воспроизвожу звук **${local.name}** (Агент #${worker.id})`);
        return;
      }

      const memes = await MyInstantsClient.search(query, 3);
      if (memes.length === 0) {
        await message.reply(`❌ Звук **"${query}"** не найден ни в библиотеке, ни на MyInstants.`);
        return;
      }
      const best = memes[0];
      await worker.queue.playSoundEffect({ name: best.name, url: best.url });
      await message.reply(`😂 Воспроизвожу мем **${best.name}** *(MyInstants • Агент #${worker.id})*`);
    } catch (err: any) {
      await message.reply(err?.message || '❌ Не удалось воспроизвести звук.');
    }
  },
};
