import { REST, Routes } from 'discord.js';
import { config } from './config.js';
import { commands } from './commands/index.js';

const { discordToken, clientId, guildId } = config;

if (!discordToken || !clientId) {
  console.error('❌ Ошибка: Укажите DISCORD_TOKEN и CLIENT_ID в файле .env');
  process.exit(1);
}

const rest = new REST({ version: '10' }).setToken(discordToken);

async function deploy() {
  const commandsData = commands.map((c) => c.data.toJSON());

  try {
    console.log(`⏳ Регистрирую ${commandsData.length} слэш-команд(ы) глобально для всех серверов...`);

    // 1. Глобальная регистрация — команды доступны на ЛЮБОМ сервере, куда добавлен бот
    await rest.put(Routes.applicationCommands(clientId), {
      body: commandsData,
    });
    console.log(`✅ ${commandsData.length} глобальных слэш-команд успешно зарегистрированы!`);

    // 2. Очищаем старые локальные команды на тестовом сервере, чтобы в списке не было дублей
    if (guildId) {
      await rest.put(Routes.applicationGuildCommands(clientId, guildId), {
        body: [],
      });
      console.log(`🧹 Старые дубли команд для тестовой гильдии (${guildId}) очищены.`);
    }
  } catch (error) {
    console.error('❌ Ошибка при регистрации команд:', error);
  }
}

deploy();
