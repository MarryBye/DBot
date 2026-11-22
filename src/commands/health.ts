import { Client, EmbedBuilder, Routes, SlashCommandBuilder } from 'discord.js';
import { workerPool } from '../voice/index.js';
import type { Command } from '../types.js';

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / (3600 * 24));
  const h = Math.floor((seconds % (3600 * 24)) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);

  const parts: string[] = [];
  if (d > 0) parts.push(`${d}д`);
  if (h > 0) parts.push(`${h}ч`);
  if (m > 0) parts.push(`${m}м`);
  parts.push(`${s}с`);
  return parts.join(' ');
}

async function buildHealthEmbed(
  client: Client,
  guildId: string,
  checkStartTime: number
): Promise<EmbedBuilder> {
  let mainRestMs: number | null = null;
  let mainError: string | null = null;
  try {
    const restStart = Date.now();
    await client.rest.get(Routes.user('@me'));
    mainRestMs = Date.now() - restStart;
  } catch (err: any) {
    mainError = err?.message ?? 'Сбой REST-запроса';
  }

  const mainWsPing = client.ws.ping;
  const uptimeSec = Math.floor((client.uptime ?? 0) / 1000);
  const memUsageMb = (process.memoryUsage().rss / 1024 / 1024).toFixed(1);

  const workerResults = await workerPool.checkAllHealth(guildId);

  const totalNodes = 1 + workerResults.length;
  let onlineCount = mainRestMs !== null ? 1 : 0;
  for (const w of workerResults) {
    if (w.status === 'healthy' || w.status === 'degraded') {
      onlineCount++;
    }
  }

  const isAllHealthy = onlineCount === totalNodes && workerResults.every((w) => w.status === 'healthy');
  const embedColor = isAllHealthy ? 0x57f287 : onlineCount > 0 ? 0xfee75c : 0xed4245;

  const embed = new EmbedBuilder()
    .setColor(embedColor)
    .setTitle('🩺 Проверка работоспособности агентов')
    .setDescription(
      `Состояние системы: **${onlineCount}/${totalNodes}** узлов в сети.\n` +
        `Серверов у координатора: **${client.guilds.cache.size}**`
    );

  const mainIcon = mainRestMs !== null ? '🟢' : '🔴';
  const mainStatusText =
    mainRestMs !== null
      ? `• **Статус:** Онлайн\n• **Время ответа:** REST: \`${mainRestMs}мс\` | WebSocket: \`${mainWsPing}мс\`\n• **Память процесса:** \`${memUsageMb} MB\` | **Аптайм:** \`${formatUptime(uptimeSec)}\``
      : `• **Статус:** 🔴 Ошибка связи (${mainError})`;

  embed.addFields({
    name: `${mainIcon} Основной координатор (${client.user?.tag ?? 'Бот'})`,
    value: mainStatusText,
    inline: false,
  });

  if (workerResults.length === 0) {
    embed.addFields({
      name: '🎙️ Воркер-агенты',
      value: '⚠️ Токены воркеров не настроены в `.env` файле.',
      inline: false,
    });
  } else {
    for (const w of workerResults) {
      let icon = '🔴';
      let details = '';

      if (w.status === 'healthy') {
        icon = '🟢';
        const voiceState = w.isInVoice
          ? `🔊 В канале: **${w.voiceChannelName ?? 'Голосовой'}**${w.voiceGuildName ? ` *(${w.voiceGuildName})*` : ''}`
          : '💤 Свободен (в ожидании)';
        details = `• **Статус:** Онлайн (${w.tag})\n• **Время ответа:** REST: \`${w.restLatencyMs}мс\` | WebSocket: \`${w.wsPingMs}мс\`\n• **Голос:** ${voiceState}`;
      } else if (w.status === 'degraded') {
        icon = '🟡';
        details = `• **Статус:** В сети (${w.tag}), но ⚠️ **не добавлен на этот сервер**\n• **Время ответа:** REST: \`${w.restLatencyMs}мс\` | WS: \`${w.wsPingMs}мс\``;
      } else {
        icon = '🔴';
        details = `• **Статус:** Офлайн / Не отвечает\n• **Причина:** ${w.error ?? 'Таймаут запроса'}`;
      }

      embed.addFields({
        name: `${icon} ${w.name}`,
        value: details,
        inline: false,
      });
    }
  }

  const duration = Date.now() - checkStartTime;
  embed.setFooter({
    text: `⏱️ Проверка завершена за ${duration}мс`,
  });
  embed.setTimestamp();

  return embed;
}

export const command: Command = {
  data: new SlashCommandBuilder()
    .setName('health')
    .setDescription('Проверяет отклик и здоровье основного бота и всех голосовых агентов'),
  async execute(interaction) {
    const checkStartTime = Date.now();
    await interaction.deferReply();

    const embed = await buildHealthEmbed(interaction.client, interaction.guildId!, checkStartTime);
    await interaction.editReply({ embeds: [embed] });
  },
  async executePrefix(message) {
    const checkStartTime = Date.now();
    const statusMsg = await message.reply('🩺 Опрашиваю всех агентов, пожалуйста подождите...');

    const embed = await buildHealthEmbed(message.client, message.guildId!, checkStartTime);
    await statusMsg.edit({ content: '', embeds: [embed] });
  },
};
