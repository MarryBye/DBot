import { GuildMember, SlashCommandBuilder } from 'discord.js';
import { workerPool } from '../voice/index.js';
import type { Command } from '../types.js';

export const command: Command = {
  data: new SlashCommandBuilder()
    .setName('loop')
    .setDescription('Переключить режим повтора воспроизведения')
    .addStringOption((option) =>
      option
        .setName('mode')
        .setDescription('Режим повтора: off (выключен), track (один трек), queue (вся очередь)')
        .setRequired(true)
        .addChoices(
          { name: 'Выключить повтор (off)', value: 'off' },
          { name: 'Повторять текущий трек (track)', value: 'track' },
          { name: 'Повторять всю очередь (queue)', value: 'queue' }
        )
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

    const mode = interaction.options.getString('mode', true) as 'off' | 'track' | 'queue';
    worker.queue.setLoop(mode);

    let modeText = 'выключен';
    if (mode === 'track') modeText = 'повтор одного трека 🔂';
    else if (mode === 'queue') modeText = 'повтор всей очереди 🔁';

    await interaction.reply(`🔄 Режим зацикливания: **${modeText}**.`);
  },
  async executePrefix(message, args) {
    const worker = workerPool.getWorkerForMember(message.member);

    if (!worker) {
      await message.reply('❌ В вашем голосовом канале нет активного воркера.');
      return;
    }

    const choice = args[0]?.toLowerCase();
    if (!choice || !['off', 'track', 'queue'].includes(choice)) {
      await message.reply(
        'Использование: `+loop <off | track | queue>` (текущий: `' + worker.queue.loopMode + '`)'
      );
      return;
    }

    const mode = choice as 'off' | 'track' | 'queue';
    worker.queue.setLoop(mode);

    let modeText = 'выключен';
    if (mode === 'track') modeText = 'повтор одного трека 🔂';
    else if (mode === 'queue') modeText = 'повтор всей очереди 🔁';

    await message.reply(`🔄 Режим зацикливания: **${modeText}**.`);
  },
};
