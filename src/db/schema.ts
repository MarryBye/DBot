import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const notes = sqliteTable('notes', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: text('user_id').notNull(),
  guildId: text('guild_id').notNull(),
  title: text('title').notNull(),
  content: text('content').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const sounds = sqliteTable('sounds', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  guildId: text('guild_id').notNull(),
  name: text('name').notNull(),
  filename: text('filename').notNull(),
  mimeType: text('mime_type').notNull(),
  color: text('color').notNull().default('#5865f2'),
  emoji: text('emoji').notNull().default('🔊'),
  uploadedById: text('uploaded_by_id').notNull(),
  uploadedByTag: text('uploaded_by_tag').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const webSessions = sqliteTable('web_sessions', {
  token: text('token').primaryKey(),
  userId: text('user_id').notNull(),
  username: text('username').notNull(),
  avatar: text('avatar'),
  activeGuildId: text('active_guild_id'),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const dashboardSettings = sqliteTable('dashboard_settings', {
  guildId: text('guild_id').primaryKey(),
  requiredRoleId: text('required_role_id'),
  allowedChannelId: text('allowed_channel_id'),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const userPlaylists = sqliteTable('user_playlists', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: text('user_id').notNull(),
  name: text('name').notNull(),
  tracksJson: text('tracks_json').notNull(),
  trackCount: integer('track_count').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
});

export type Note = typeof notes.$inferSelect;
export type NewNote = typeof notes.$inferInsert;
export type SoundRecord = typeof sounds.$inferSelect;
export type NewSoundRecord = typeof sounds.$inferInsert;
export type WebSession = typeof webSessions.$inferSelect;
export type DashboardSetting = typeof dashboardSettings.$inferSelect;
export type UserPlaylistRecord = typeof userPlaylists.$inferSelect;
