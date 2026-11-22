import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import * as schema from './schema.js';

// Создаем папки data/ и data/sounds/ при необходимости
export const dataDir = path.resolve(process.cwd(), 'data');
export const soundsDir = path.join(dataDir, 'sounds');

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
}
if (!fs.existsSync(soundsDir)) {
  fs.mkdirSync(soundsDir, { recursive: true, mode: 0o700 });
}

const dbPath = path.join(dataDir, 'bot.db');
const sqlite = new Database(dbPath);
sqlite.pragma('journal_mode = WAL');

// На Linux ограничиваем права доступа к папке data/ и базе сессий только владельцу процесса
if (process.platform !== 'win32') {
  try {
    fs.chmodSync(dataDir, 0o700);
    fs.chmodSync(dbPath, 0o600);
  } catch {
    // ignore on filesystems without POSIX chmod
  }
}

// Инициализация таблиц
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    guild_id TEXT NOT NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sounds (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    name TEXT NOT NULL,
    filename TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    color TEXT NOT NULL DEFAULT '#5865f2',
    emoji TEXT NOT NULL DEFAULT '🔊',
    uploaded_by_id TEXT NOT NULL,
    uploaded_by_tag TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS web_sessions (
    token TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    username TEXT NOT NULL,
    avatar TEXT,
    active_guild_id TEXT,
    expires_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS dashboard_settings (
    guild_id TEXT PRIMARY KEY,
    required_role_id TEXT,
    allowed_channel_id TEXT,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS user_playlists (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    tracks_json TEXT NOT NULL,
    track_count INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
`);

// Мягкая миграция: добавляем active_guild_id, если база создавалась ранее
const sessionCols = sqlite.prepare('PRAGMA table_info(web_sessions)').all() as Array<{ name: string }>;
if (!sessionCols.some((c) => c.name === 'active_guild_id')) {
  sqlite.exec('ALTER TABLE web_sessions ADD COLUMN active_guild_id TEXT;');
}

// Мягкая миграция: добавляем allowed_channel_id в dashboard_settings
const settingsCols = sqlite.prepare('PRAGMA table_info(dashboard_settings)').all() as Array<{ name: string }>;
if (!settingsCols.some((c) => c.name === 'allowed_channel_id')) {
  sqlite.exec('ALTER TABLE dashboard_settings ADD COLUMN allowed_channel_id TEXT;');
}

export const db = drizzle(sqlite, { schema });
