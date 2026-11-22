import { GuildMember, SlashCommandBuilder } from 'discord.js';
import { workerPool } from '../voice/index.js';
import type { Command } from '../types.js';

export const command: Command = {
  data: new SlashCommandBuilder()
    .setName('volume')
    .setDescription('Настроить уровень громкости воспроизведения (1-100%)')
    .addIntegerOption((option) =>
      option
        .setName('level')
        .setDescription('Желаемый уровень громкости от 1 до 100')
        .setMinValue(1)
        .setMaxValue(100)
        .setRequired(true)
    ),
  async execute(interaction) {
    const member = interaction.member as GuildMember;
    const worker = workerPool.getWorkerForMember(member);

    if (!worker) {
      await interaction.reply({
        content: '❌ В вашем голосовом канале нет активного воркера.',
        ephemeral: true,
      });
      return;
    }

    const level = interaction.options.getInteger('level', true);
    const newVol = worker.queue.setVolume(level);

    let volIcon = '🔊';
    if (newVol < 30) volIcon = '🔈';
    else if (newVol < 70) volIcon = '🔉';

    await interaction.reply(`${volIcon} Громкость воркера **#${worker.id}** установлена на **${newVol}%**.`);
  },
  async executePrefix(message, args) {
    const worker = workerPool.getWorkerForMember(message.member);

    if (!worker) {
      await message.reply('❌ В вашем голосовом канале нет активного воркера.');
      return;
    }

    const level = args[0] ? parseInt(args[0], 10) : NaN;
    if (isNaN(level) || level < 1 || level > 100) {
      await message.reply('Использование: `+volume <число от 1 до 100>` (текущая громкость: **' + worker.queue.volume + '%**)');
      return;
    }

    const newVol = worker.queue.setVolume(level);

    let volIcon = '🔊';
    if (newVol < 30) volIcon = '🔈';
    else if (newVol < 70) volIcon = '🔉';

    await message.reply(`${volIcon} Громкость воркера **#${worker.id}** установлена на **${newVol}%**.`);
  },
};
