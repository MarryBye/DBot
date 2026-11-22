import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import * as schema from './schema.js';

// Создаем папки data/ и data/sounds/ при необходимости
export const dataDir = path.resolve(process.cwd(), 'data');
export const soundsDir = path.join(dataDir, 'sounds');

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}
if (!fs.existsSync(soundsDir)) {
  fs.mkdirSync(soundsDir, { recursive: true });
}

const sqlite = new Database(path.join(dataDir, 'bot.db'));
sqlite.pragma('journal_mode = WAL');

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

export const db = drizzle(sqlite, { schema });
