import { sqliteTable, text, integer, primaryKey } from 'drizzle-orm/sqlite-core';

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
  uploadedByUsername: text('uploaded_by_username'),
  isPublic: integer('is_public', { mode: 'boolean' }).notNull().default(true),
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
  logsAdminOnly: integer('logs_admin_only', { mode: 'boolean' }).notNull().default(false),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const userPlaylists = sqliteTable('user_playlists', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: text('user_id').notNull(),
  guildId: text('guild_id'),
  authorName: text('author_name'),
  authorUsername: text('author_username'),
  name: text('name').notNull(),
  color: text('color').notNull().default('#0067b8'),
  isPublic: integer('is_public', { mode: 'boolean' }).notNull().default(false),
  tracksJson: text('tracks_json').notNull(),
  trackCount: integer('track_count').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const favoriteTracks = sqliteTable('favorite_tracks', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: text('user_id').notNull(),
  trackKey: text('track_key').notNull(),
  trackJson: text('track_json').notNull(),
  createdAt: integer('created_at').notNull(),
});

export const reactions = sqliteTable('reactions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  targetType: text('target_type').notNull(),
  targetId: integer('target_id').notNull(),
  userId: text('user_id').notNull(),
  value: integer('value').notNull(),
  createdAt: integer('created_at').notNull(),
});

export const actionLogs = sqliteTable('action_logs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  guildId: text('guild_id').notNull(),
  channelId: text('channel_id'),
  channelName: text('channel_name'),
  workerId: integer('worker_id'),
  actorId: text('actor_id').notNull(),
  actorUsername: text('actor_username').notNull(),
  actorDisplayName: text('actor_display_name').notNull(),
  actorAvatarUrl: text('actor_avatar_url'),
  source: text('source').notNull().default('web'),
  action: text('action').notNull(),
  detailsJson: text('details_json'),
  tracksJson: text('tracks_json'),
  trackCount: integer('track_count').notNull().default(0),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export const userStats = sqliteTable(
  'user_stats',
  {
    guildId: text('guild_id').notNull(),
    userId: text('user_id').notNull(),
    username: text('username').notNull(),
    displayName: text('display_name').notNull(),
    avatarUrl: text('avatar_url'),
    tracksAdded: integer('tracks_added').notNull().default(0),
    voiceSeconds: integer('voice_seconds').notNull().default(0),
    sfxPlayed: integer('sfx_played').notNull().default(0),
    skipsCount: integer('skips_count').notNull().default(0),
    playlistsLoaded: integer('playlists_loaded').notNull().default(0),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => [primaryKey({ columns: [table.guildId, table.userId] })]
);

export type Note = typeof notes.$inferSelect;
export type NewNote = typeof notes.$inferInsert;
export type SoundRecord = typeof sounds.$inferSelect;
export type NewSoundRecord = typeof sounds.$inferInsert;
export type WebSession = typeof webSessions.$inferSelect;
export type DashboardSetting = typeof dashboardSettings.$inferSelect;
export type UserPlaylistRecord = typeof userPlaylists.$inferSelect;
export type FavoriteTrackRecord = typeof favoriteTracks.$inferSelect;
export type ReactionRecord = typeof reactions.$inferSelect;
export type ActionLogRecord = typeof actionLogs.$inferSelect;
export type UserStatRecord = typeof userStats.$inferSelect;
