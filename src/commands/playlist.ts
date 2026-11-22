import {
  EmbedBuilder,
  GuildMember,
  MessageFlags,
  SlashCommandBuilder,
} from 'discord.js';
import { workerPool } from '../voice/index.js';
import { formatDuration } from '../voice/music-resolver.js';
import { PlaylistService, type UserPlaylist } from '../voice/playlists.js';
import type { Command } from '../types.js';

function getPlaylistTotalDuration(playlist: UserPlaylist): number {
  return playlist.tracks.reduce((sum, t) => sum + (Number(t.durationSec) || 0), 0);
}

function buildPlaylistListEmbed(username: string, list: UserPlaylist[]): EmbedBuilder {
  const lines = list
    .slice(0, 25)
    .map((p, i) => {
      const totalDur = getPlaylistTotalDuration(p);
      const durText = totalDur > 0 ? ` • \`${formatDuration(totalDur)}\`` : '';
      return `\`${i + 1}.\` **${p.name}** — ${p.trackCount} тр.${durText}`;
    })
    .join('\n');

  return new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(`💾 Плейлисты пользователя ${username} (${list.length})`)
    .setDescription(lines)
    .setFooter({
      text: 'Загрузить: /playlist load <название> или +pl load <название> (добавит треки в очередь)',
    });
}

function buildPlaylistShowEmbed(playlist: UserPlaylist): EmbedBuilder {
  const totalDur = getPlaylistTotalDuration(playlist);
  const shown = playlist.tracks.slice(0, 20);
  const lines = shown
    .map((t, i) => {
      const icon = t.source === 'spotify' ? '🟢' : t.source === 'soundcloud' ? '🟠' : '🔴';
      const link = t.originalUrl ? `[${t.title}](${t.originalUrl})` : `**${t.title}**`;
      return `\`${i + 1}.\` ${icon} ${link} — *${t.author}* \`[${t.durationFormatted}]\``;
    })
    .join('\n');

  const extra =
    playlist.tracks.length > shown.length
      ? `\n\n*...и ещё ${playlist.tracks.length - shown.length} трек(ов)*`
      : '';

  return new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(`💾 Плейлист: ${playlist.name}`)
    .setDescription((lines || 'Плейлист пуст') + extra)
    .setFooter({
      text: `Всего треков: ${playlist.trackCount}${totalDur > 0 ? ` • Длительность: ${formatDuration(totalDur)}` : ''}`,
    });
}

export const command: Command = {
  data: new SlashCommandBuilder()
    .setName('playlist')
    .setDescription('Личные сохранённые плейлисты: сохранить, загрузить, посмотреть или удалить')
    .addSubcommand((sub) =>
      sub
        .setName('save')
        .setDescription('Сохранить текущую очередь вашего голосового канала в личный плейлист')
        .addStringOption((opt) =>
          opt
            .setName('name')
            .setDescription('Название плейлиста (если уже есть — обновится)')
            .setRequired(true)
            .setMaxLength(60)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('load')
        .setDescription('Добавить треки вашего сохранённого плейлиста в очередь канала')
        .addStringOption((opt) =>
          opt
            .setName('name')
            .setDescription('Название сохранённого плейлиста')
            .setRequired(true)
            .setAutocomplete(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('list')
        .setDescription('Показать список всех ваших сохранённых плейлистов')
    )
    .addSubcommand((sub) =>
      sub
        .setName('show')
        .setDescription('Показать треки внутри вашего сохранённого плейлиста')
        .addStringOption((opt) =>
          opt
            .setName('name')
            .setDescription('Название плейлиста')
            .setRequired(true)
            .setAutocomplete(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('delete')
        .setDescription('Удалить ваш сохранённый плейлист')
        .addStringOption((opt) =>
          opt
            .setName('name')
            .setDescription('Название плейлиста для удаления')
            .setRequired(true)
            .setAutocomplete(true)
        )
    ),

  async autocomplete(interaction) {
    const focused = interaction.options.getFocused().toLowerCase();
    const list = await PlaylistService.listUserPlaylists(interaction.user.id);
    const matches = list
      .filter((p) => p.name.toLowerCase().includes(focused))
      .slice(0, 25)
      .map((p) => ({
        name: `${p.name} (${p.trackCount} тр.)`.slice(0, 100),
        value: p.name,
      }));
    await interaction.respond(matches);
  },

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const userId = interaction.user.id;
    const guildId = interaction.guildId!;

    if (sub === 'list') {
      const list = await PlaylistService.listUserPlaylists(userId);
      if (list.length === 0) {
        await interaction.reply({
          content:
            '📭 У вас пока нет сохранённых плейлистов.\n' +
            'Включите музыку и сохраните текущую очередь командой `/playlist save <название>` или кнопкой **«💾 Сохранить»** в веб-панели (`/web`).',
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      await interaction.reply({
        embeds: [buildPlaylistListEmbed(interaction.user.displayName || interaction.user.username, list)],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (sub === 'show') {
      const name = interaction.options.getString('name', true).trim();
      const playlist = await PlaylistService.findUserPlaylistByName(userId, name);
      if (!playlist) {
        await interaction.reply({
          content: `❌ Плейлист **"${name}"** не найден среди ваших сохранённых.`,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      await interaction.reply({
        embeds: [buildPlaylistShowEmbed(playlist)],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (sub === 'delete') {
      const name = interaction.options.getString('name', true).trim();
      const playlist = await PlaylistService.findUserPlaylistByName(userId, name);
      if (!playlist) {
        await interaction.reply({
          content: `❌ Плейлист **"${name}"** не найден среди ваших сохранённых.`,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      await PlaylistService.deletePlaylist(userId, playlist.id);
      workerPool.events.emit('playlistsChanged', userId);
      await interaction.reply({
        content: `🗑️ Плейлист **«${playlist.name}»** (${playlist.trackCount} тр.) удалён.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // save и load требуют нахождения в голосовом канале
    const member = interaction.member as GuildMember;
    const voiceChannel = member?.voice?.channel;
    if (!voiceChannel) {
      await interaction.reply({
        content: '❌ Сначала зайдите в голосовой канал!',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (sub === 'save') {
      const name = interaction.options.getString('name', true).trim();
      const worker = workerPool.getWorkerForChannel(voiceChannel.id);
      if (!worker || (!worker.queue.currentTrack && worker.queue.tracks.length === 0)) {
        await interaction.reply({
          content: '❌ В вашем голосовом канале сейчас нет играющих или добавленных в очередь треков.',
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      try {
        const { playlist, overwritten } = await PlaylistService.savePlaylist({
          userId,
          name,
          currentTrack: worker.queue.currentTrack,
          upcomingTracks: worker.queue.tracks,
        });
        workerPool.events.emit('playlistsChanged', userId);
        await interaction.reply({
          content: overwritten
            ? `💾 Плейлист **«${playlist.name}»** обновлён! Сохранено треков: **${playlist.trackCount}**.`
            : `💾 Плейлист **«${playlist.name}»** сохранён! Треков: **${playlist.trackCount}**.`,
          flags: MessageFlags.Ephemeral,
        });
      } catch (err: any) {
        await interaction.reply({
          content: `❌ ${err?.message || 'Не удалось сохранить плейлист.'}`,
          flags: MessageFlags.Ephemeral,
        });
      }
      return;
    }

    if (sub === 'load') {
      const name = interaction.options.getString('name', true).trim();
      const playlist = await PlaylistService.findUserPlaylistByName(userId, name);
      if (!playlist) {
        await interaction.reply({
          content: `❌ Плейлист **"${name}"** не найден среди ваших сохранённых.`,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      if (playlist.tracks.length === 0) {
        await interaction.reply({
          content: `❌ Плейлист **«${playlist.name}»** пуст.`,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      await interaction.deferReply();

      try {
        const worker = await workerPool.ensureWorkerInChannel(voiceChannel.id, guildId);
        const tracks = PlaylistService.buildPlayableTracks(playlist, {
          id: userId,
          tag: interaction.user.tag,
        });
        const { addedCount, isPlayingNow } = await worker.queue.add(tracks);
        const firstTrack = tracks[0];

        const embed = new EmbedBuilder()
          .setColor(0x23a55a)
          .setTitle(`💾 Плейлист добавлен в очередь: ${playlist.name}`)
          .setDescription(
            (isPlayingNow
              ? `Загружено треков: **${addedCount}**.\n▶️ Сейчас играет: **${firstTrack.title}** \`[${firstTrack.durationFormatted}]\``
              : `В конец текущей очереди добавлено треков: **${addedCount}**.`)
          )
          .setFooter({
            text: `Агент #${worker.id} • Запустил ${interaction.user.tag}`,
          });

        if (firstTrack.thumbnail) embed.setThumbnail(firstTrack.thumbnail);
        await interaction.editReply({ embeds: [embed] });
      } catch (err: any) {
        await interaction.editReply(
          `❌ ${err?.message || 'Не удалось загрузить плейлист.'}`
        );
      }
    }
  },

  async executePrefix(message, args) {
    const userId = message.author.id;
    const guildId = message.guildId!;
    const sub = args[0]?.toLowerCase();

    if (!sub) {
      await message.reply(
        '💾 **Личные плейлисты — команды (`+playlist` или `+pl`):**\n' +
          '• `+pl save <название>` — сохранить текущую очередь канала в свой плейлист\n' +
          '• `+pl load <название>` — добавить плейлист в очередь\n' +
          '• `+pl list` — список ваших сохранённых плейлистов\n' +
          '• `+pl show <название>` — посмотреть треки внутри плейлиста\n' +
          '• `+pl delete <название>` — удалить плейлист'
      );
      return;
    }

    if (sub === 'list' || sub === 'ls') {
      const list = await PlaylistService.listUserPlaylists(userId);
      if (list.length === 0) {
        await message.reply(
          '📭 У вас пока нет сохранённых плейлистов. Сохраните текущую очередь командой `+pl save <название>` или в веб-панели (`+web`).'
        );
        return;
      }
      await message.reply({
        embeds: [buildPlaylistListEmbed(message.author.displayName || message.author.username, list)],
      });
      return;
    }

    if (sub === 'show' || sub === 'info') {
      const name = args.slice(1).join(' ').trim();
      if (!name) {
        await message.reply('Использование: `+pl show <название>`');
        return;
      }
      const playlist = await PlaylistService.findUserPlaylistByName(userId, name);
      if (!playlist) {
        await message.reply(`❌ Плейлист **"${name}"** не найден.`);
        return;
      }
      await message.reply({ embeds: [buildPlaylistShowEmbed(playlist)] });
      return;
    }

    if (sub === 'delete' || sub === 'del' || sub === 'rm') {
      const name = args.slice(1).join(' ').trim();
      if (!name) {
        await message.reply('Использование: `+pl delete <название>`');
        return;
      }
      const playlist = await PlaylistService.findUserPlaylistByName(userId, name);
      if (!playlist) {
        await message.reply(`❌ Плейлист **"${name}"** не найден.`);
        return;
      }
      await PlaylistService.deletePlaylist(userId, playlist.id);
      workerPool.events.emit('playlistsChanged', userId);
      await message.reply(`🗑️ Плейлист **«${playlist.name}»** (${playlist.trackCount} тр.) удалён.`);
      return;
    }

    if (sub === 'save' || sub === 's') {
      const name = args.slice(1).join(' ').trim();
      if (!name) {
        await message.reply('Использование: `+pl save <название плейлиста>`');
        return;
      }
      const voiceChannel = message.member?.voice?.channel;
      if (!voiceChannel) {
        await message.reply('❌ Сначала зайдите в голосовой канал!');
        return;
      }
      const worker = workerPool.getWorkerForChannel(voiceChannel.id);
      if (!worker || (!worker.queue.currentTrack && worker.queue.tracks.length === 0)) {
        await message.reply('❌ В вашем голосовом канале сейчас нет треков для сохранения.');
        return;
      }
      try {
        const { playlist, overwritten } = await PlaylistService.savePlaylist({
          userId,
          name,
          currentTrack: worker.queue.currentTrack,
          upcomingTracks: worker.queue.tracks,
        });
        workerPool.events.emit('playlistsChanged', userId);
        await message.reply(
          overwritten
            ? `💾 Плейлист **«${playlist.name}»** обновлён! Сохранено треков: **${playlist.trackCount}**.`
            : `💾 Плейлист **«${playlist.name}»** сохранён! Треков: **${playlist.trackCount}**.`
        );
      } catch (err: any) {
        await message.reply(`❌ ${err?.message || 'Не удалось сохранить плейлист.'}`);
      }
      return;
    }

    if (sub === 'load' || sub === 'play' || sub === 'p' || sub === 'restore') {
      const name = args.slice(1).join(' ').trim();
      if (!name) {
        await message.reply('Использование: `+pl load <название плейлиста>`');
        return;
      }
      const voiceChannel = message.member?.voice?.channel;
      if (!voiceChannel) {
        await message.reply('❌ Сначала зайдите в голосовой канал!');
        return;
      }
      const playlist = await PlaylistService.findUserPlaylistByName(userId, name);
      if (!playlist) {
        await message.reply(`❌ Плейлист **"${name}"** не найден среди ваших сохранённых.`);
        return;
      }
      if (playlist.tracks.length === 0) {
        await message.reply(`❌ Плейлист **«${playlist.name}»** пуст.`);
        return;
      }

      const statusMsg = await message.reply(
        `⏳ Загружаю плейлист **«${playlist.name}»** (${playlist.trackCount} тр.)...`
      );
      try {
        const worker = await workerPool.ensureWorkerInChannel(voiceChannel.id, guildId);
        const tracks = PlaylistService.buildPlayableTracks(playlist, {
          id: userId,
          tag: message.author.tag,
        });
        const { addedCount, isPlayingNow } = await worker.queue.add(tracks);
        const firstTrack = tracks[0];

        const embed = new EmbedBuilder()
          .setColor(0x23a55a)
          .setTitle(`💾 Плейлист добавлен в очередь: ${playlist.name}`)
          .setDescription(
            (isPlayingNow
              ? `Загружено треков: **${addedCount}**.\n▶️ Сейчас играет: **${firstTrack.title}** \`[${firstTrack.durationFormatted}]\``
              : `В конец текущей очереди добавлено треков: **${addedCount}**.`)
          )
          .setFooter({
            text: `Агент #${worker.id} • Запустил ${message.author.tag}`,
          });

        if (firstTrack.thumbnail) embed.setThumbnail(firstTrack.thumbnail);
        await statusMsg.edit({ content: '', embeds: [embed] });
      } catch (err: any) {
        await statusMsg.edit(`❌ ${err?.message || 'Не удалось загрузить плейлист.'}`);
      }
      return;
    }

    await message.reply(
      '❓ Неизвестная подкоманда. Используйте `+pl save <название>`, `+pl load <название>`, `+pl list`, `+pl show <название>` или `+pl delete <название>`.'
    );
  },
};
