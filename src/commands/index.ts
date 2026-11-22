import { command as ping } from './ping.js';
import { command as info } from './info.js';
import { command as note } from './note.js';
import { command as workers } from './workers.js';
import { command as join } from './join.js';
import { command as leave } from './leave.js';
import { command as health } from './health.js';
import { command as play } from './play.js';
import { command as pause } from './pause.js';
import { command as resume } from './resume.js';
import { command as skip } from './skip.js';
import { command as stop } from './stop.js';
import { command as queue } from './queue.js';
import { command as nowplaying } from './nowplaying.js';
import { command as volume } from './volume.js';
import { command as loop } from './loop.js';
import { command as shuffle } from './shuffle.js';
import { command as sound } from './sound.js';
import { command as web } from './web.js';
import type { Command } from '../types.js';

export const commands: Command[] = [
  play,
  pause,
  resume,
  skip,
  stop,
  queue,
  nowplaying,
  volume,
  loop,
  shuffle,
  sound,
  web,
  workers,
  health,
  join,
  leave,
  ping,
  info,
  note,
];

export const commandMap = new Map<string, Command>(
  commands.map((cmd) => [cmd.data.name, cmd])
);

// Текстовые алиасы (для удобства ввода через префикс +)
commandMap.set('np', nowplaying);
commandMap.set('p', play);
commandMap.set('s', skip);
commandMap.set('q', queue);
commandMap.set('vol', volume);
commandMap.set('sfx', sound);
commandMap.set('meme', sound);
commandMap.set('panel', web);
