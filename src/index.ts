import { Client, Events, GatewayIntentBits, MessageFlags, PermissionFlagsBits, type GuildMember } from 'discord.js';
import { config } from './config.js';
import { commandMap } from './commands/index.js';
import { LeaderboardService } from './services/leaderboard.js';
import { workerPool } from './voice/index.js';
import { getAllowedChannelId } from './web/auth.js';
import { startWebServer } from './web/server.js';
import './db/index.js'; // Инициализация SQLite базы

const { discordToken, prefix } = config;

if (!discordToken) {
  console.error('❌ Ошибка: DISCORD_TOKEN не задан в .env файле.');
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
  ],
});

client.once(Events.ClientReady, async (readyClient) => {
  console.log(`🤖 Основной бот запущен как ${readyClient.user.tag}`);
  console.log(`🌍 Режим работы: все серверы (подключён к ${readyClient.guilds.cache.size} серв.)`);
  console.log(`⚡ Префикс для текстовых команд: "${prefix}"`);

  // Запуск пула голосовых воркеров
  await workerPool.init();

  // Запуск учёта статистики участников (время в войсе с ботом + саундборд)
  LeaderboardService.startTracking(readyClient);

  // Запуск встроенного веб-сервера панели управления
  startWebServer(readyClient);

  console.log(`📡 Бот, воркеры и веб-панель готовы к работе!`);
});

// Отслеживание входов/выходов пользователей из голосовых каналов на всех серверах
client.on(Events.VoiceStateUpdate, (oldState, newState) => {
  workerPool.handleGuildVoiceUpdate(newState.guild, [
    oldState.channelId,
    newState.channelId,
  ]);
});

async function checkAllowedBotChannel(
  guildId: string,
  channelId: string,
  parentChannelId: string | null,
  member: GuildMember | null
): Promise<{ allowed: boolean; allowedChannelId: string | null }> {
  const allowedChannelId = await getAllowedChannelId(guildId);
  if (!allowedChannelId) {
    return { allowed: true, allowedChannelId: null };
  }

  // Администраторы сервера всегда могут вызывать команды из любого канала
  if (member?.permissions.has(PermissionFlagsBits.Administrator)) {
    return { allowed: true, allowedChannelId };
  }

  // Если настроенный канал был удалён с сервера — не блокируем бота
  const guild = client.guilds.cache.get(guildId);
  if (guild && !guild.channels.cache.has(allowedChannelId)) {
    return { allowed: true, allowedChannelId: null };
  }

  if (channelId === allowedChannelId || parentChannelId === allowedChannelId) {
    return { allowed: true, allowedChannelId };
  }

  return { allowed: false, allowedChannelId };
}

// 1. Обработка Slash-команд (/) и Autocomplete на всех серверах
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.guildId) {
    if (interaction.isChatInputCommand() && interaction.isRepliable()) {
      await interaction.reply({
        content: '⚠️ Команды бота работают на серверах Discord (не в личных сообщениях).',
        flags: MessageFlags.Ephemeral,
      });
    }
    return;
  }

  if (interaction.isAutocomplete()) {
    const command = commandMap.get(interaction.commandName);
    if (command?.autocomplete) {
      try {
        await command.autocomplete(interaction);
      } catch (err) {
        console.error(`❌ Ошибка autocomplete для ${interaction.commandName}:`, err);
      }
    }
    return;
  }

  if (!interaction.isChatInputCommand()) return;

  const command = commandMap.get(interaction.commandName);
  if (!command) {
    console.warn(`⚠️ Команда ${interaction.commandName} не найдена в реестре`);
    return;
  }

  const parentId =
    interaction.channel && 'parentId' in interaction.channel
      ? interaction.channel.parentId
      : null;
  const channelCheck = await checkAllowedBotChannel(
    interaction.guildId,
    interaction.channelId,
    parentId,
    (interaction.member as GuildMember | null) ?? null
  );
  if (!channelCheck.allowed && channelCheck.allowedChannelId) {
    await interaction.reply({
      content: `Команды бота разрешены только в канале <#${channelCheck.allowedChannelId}>.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  try {
    await command.execute(interaction);
  } catch (error) {
    console.error(`❌ Ошибка выполнения команды ${interaction.commandName}:`, error);

    const errorMessage = 'Произошла непредвиденная ошибка при выполнении команды.';
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ content: errorMessage, flags: MessageFlags.Ephemeral });
    } else {
      await interaction.reply({ content: errorMessage, flags: MessageFlags.Ephemeral });
    }
  }
});

// 2. Обработка текстовых команд через префикс (+) на всех серверах
client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot || !message.guildId) return;

  if (!message.content.startsWith(prefix)) return;

  const rawArgs = message.content.slice(prefix.length).trim().split(/\s+/);
  const commandName = rawArgs.shift()?.toLowerCase();
  if (!commandName) return;

  const command = commandMap.get(commandName);
  if (!command) return;

  const parentId = 'parentId' in message.channel ? message.channel.parentId : null;
  const channelCheck = await checkAllowedBotChannel(
    message.guildId,
    message.channelId,
    parentId,
    message.member
  );
  if (!channelCheck.allowed && channelCheck.allowedChannelId) {
    await message.reply(
      `Команды бота разрешены только в канале <#${channelCheck.allowedChannelId}>.`
    );
    return;
  }

  try {
    await command.executePrefix(message, rawArgs);
  } catch (error) {
    console.error(`❌ Ошибка выполнения префикс-команды ${prefix}${commandName}:`, error);
    await message.reply('❌ Произошла ошибка при выполнении команды.');
  }
});

client.on('error', (err) => {
  if (err?.message?.includes('disallowed intents')) {
    console.error('\n❌ [Discord API] Ошибка: Не включен "Message Content Intent"!');
    console.error(`👉 Откройте https://discord.com/developers/applications/${config.clientId}/bot`);
    console.error('👉 Прокрутите до "Privileged Gateway Intents" -> Включите "MESSAGE CONTENT INTENT" -> Сохраните.\n');
  } else {
    console.error('❌ Ошибка клиента Discord:', err);
  }
});

client.login(discordToken).catch((err) => {
  if (err?.message?.includes('disallowed intents')) {
    console.error('\n❌ [Discord API] Ошибка: Не включен "Message Content Intent"!');
    console.error(`👉 Откройте https://discord.com/developers/applications/${config.clientId}/bot`);
    console.error('👉 Прокрутите до "Privileged Gateway Intents" -> Включите "MESSAGE CONTENT INTENT" -> Сохраните.\n');
  } else {
    console.error('❌ Ошибка авторизации основного бота:', err);
  }
});
