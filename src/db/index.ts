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
    uploaded_by_username TEXT,
    is_public INTEGER NOT NULL DEFAULT 1,
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
    logs_admin_only INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS user_playlists (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    guild_id TEXT,
    author_name TEXT,
    author_username TEXT,
    name TEXT NOT NULL,
    color TEXT NOT NULL DEFAULT '#0067b8',
    is_public INTEGER NOT NULL DEFAULT 0,
    tracks_json TEXT NOT NULL,
    track_count INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS favorite_tracks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    track_key TEXT NOT NULL,
    track_json TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_favorite_tracks_user_key
    ON favorite_tracks (user_id, track_key);
  CREATE INDEX IF NOT EXISTS idx_favorite_tracks_user_created
    ON favorite_tracks (user_id, created_at DESC);

  CREATE TABLE IF NOT EXISTS reactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    target_type TEXT NOT NULL,
    target_id INTEGER NOT NULL,
    user_id TEXT NOT NULL,
    value INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_reactions_unique_vote
    ON reactions (target_type, target_id, user_id);
  CREATE INDEX IF NOT EXISTS idx_reactions_target
    ON reactions (target_type, target_id);

  CREATE TABLE IF NOT EXISTS action_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    channel_id TEXT,
    channel_name TEXT,
    worker_id INTEGER,
    actor_id TEXT NOT NULL,
    actor_username TEXT NOT NULL,
    actor_display_name TEXT NOT NULL,
    actor_avatar_url TEXT,
    source TEXT NOT NULL DEFAULT 'web',
    action TEXT NOT NULL,
    details_json TEXT,
    tracks_json TEXT,
    track_count INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_action_logs_guild_updated
    ON action_logs (guild_id, updated_at DESC, id DESC);
  CREATE INDEX IF NOT EXISTS idx_action_logs_guild_actor
    ON action_logs (guild_id, actor_id);
  CREATE INDEX IF NOT EXISTS idx_action_logs_guild_action
    ON action_logs (guild_id, action);

  CREATE TABLE IF NOT EXISTS user_stats (
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    username TEXT NOT NULL,
    display_name TEXT NOT NULL,
    avatar_url TEXT,
    tracks_added INTEGER NOT NULL DEFAULT 0,
    voice_seconds INTEGER NOT NULL DEFAULT 0,
    sfx_played INTEGER NOT NULL DEFAULT 0,
    skips_count INTEGER NOT NULL DEFAULT 0,
    playlists_loaded INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (guild_id, user_id)
  );

  CREATE INDEX IF NOT EXISTS idx_user_stats_guild
    ON user_stats (guild_id);
`);

// Мягкая миграция: добавляем active_guild_id, если база создавалась ранее
const sessionCols = sqlite.prepare('PRAGMA table_info(web_sessions)').all() as Array<{ name: string }>;
if (!sessionCols.some((c) => c.name === 'active_guild_id')) {
  sqlite.exec('ALTER TABLE web_sessions ADD COLUMN active_guild_id TEXT;');
}

// Мягкая миграция: добавляем allowed_channel_id и logs_admin_only в dashboard_settings
const settingsCols = sqlite.prepare('PRAGMA table_info(dashboard_settings)').all() as Array<{ name: string }>;
if (!settingsCols.some((c) => c.name === 'allowed_channel_id')) {
  sqlite.exec('ALTER TABLE dashboard_settings ADD COLUMN allowed_channel_id TEXT;');
}
if (!settingsCols.some((c) => c.name === 'logs_admin_only')) {
  sqlite.exec('ALTER TABLE dashboard_settings ADD COLUMN logs_admin_only INTEGER NOT NULL DEFAULT 0;');
}

// Мягкие миграции для sounds (is_public, uploaded_by_username)
const soundCols = sqlite.prepare('PRAGMA table_info(sounds)').all() as Array<{ name: string }>;
if (!soundCols.some((c) => c.name === 'is_public')) {
  sqlite.exec('ALTER TABLE sounds ADD COLUMN is_public INTEGER NOT NULL DEFAULT 1;');
}
if (!soundCols.some((c) => c.name === 'uploaded_by_username')) {
  sqlite.exec('ALTER TABLE sounds ADD COLUMN uploaded_by_username TEXT;');
}

// Мягкие миграции для user_playlists (guild_id, author_name, author_username, color, is_public)
const playlistCols = sqlite.prepare('PRAGMA table_info(user_playlists)').all() as Array<{ name: string }>;
if (!playlistCols.some((c) => c.name === 'guild_id')) {
  sqlite.exec('ALTER TABLE user_playlists ADD COLUMN guild_id TEXT;');
}
if (!playlistCols.some((c) => c.name === 'author_name')) {
  sqlite.exec('ALTER TABLE user_playlists ADD COLUMN author_name TEXT;');
}
if (!playlistCols.some((c) => c.name === 'author_username')) {
  sqlite.exec('ALTER TABLE user_playlists ADD COLUMN author_username TEXT;');
}
if (!playlistCols.some((c) => c.name === 'color')) {
  sqlite.exec("ALTER TABLE user_playlists ADD COLUMN color TEXT NOT NULL DEFAULT '#0067b8';");
}
if (!playlistCols.some((c) => c.name === 'is_public')) {
  sqlite.exec('ALTER TABLE user_playlists ADD COLUMN is_public INTEGER NOT NULL DEFAULT 0;');
}

export const db = drizzle(sqlite, { schema });
