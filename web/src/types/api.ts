export type PlatformOption = 'auto' | 'youtube' | 'soundcloud' | 'spotify';
export type TrackSource = 'youtube' | 'soundcloud' | 'spotify';
export type TrackMediaKind = 'video' | 'music' | 'stream';
export type SearchResultKind = 'music' | 'video' | 'stream' | 'track' | 'playlist';
export type LoopMode = 'off' | 'track' | 'queue';
export type MemeRegion = 'ru' | 'us';
export type AppTab =
  | 'player'
  | 'watch'
  | 'playlists'
  | 'soundboard'
  | 'agents'
  | 'leaderboard'
  | 'logs'
  | 'admin';
export type MyTracksTab = 'favorites' | 'my' | 'public';
export type SoundboardTab = 'my' | 'public' | 'memes';
export type AdminSectionId = 'access' | 'cookies';
export type ToastVariant = 'info' | 'success' | 'warning' | 'danger';
export type ReactionVote = 1 | -1 | 0;
export type LibrarySortOption = 'newest' | 'oldest' | 'likes' | 'dislikes' | 'author' | 'name';

export type ChannelActivityAction =
  | 'stop'
  | 'leave'
  | 'clear_queue'
  | 'skip'
  | 'play_now'
  | 'remove_track'
  | 'shuffle'
  | 'pause'
  | 'resume'
  | 'loop'
  | 'sfx';

export interface ChannelActivityEvent {
  id: string;
  action: ChannelActivityAction;
  actorId: string;
  actorName: string;
  detail?: string;
  count?: number;
  timestamp: number;
}

export interface VoiceMemberInfo {
  id: string;
  displayName: string;
  avatarUrl: string | null;
}

export interface SearchResultItem {
  id: string;
  title: string;
  author: string;
  url: string;
  durationSec: number;
  durationFormatted: string;
  thumbnail: string | null;
  source: TrackSource;
  kind: SearchResultKind;
  isLive?: boolean;
  trackCount?: number;
}

export interface SearchPageResult {
  page: number;
  items: SearchResultItem[];
  hasNextPage: boolean;
}

export interface ToastMessage {
  id: string;
  message: string;
  variant: ToastVariant;
}

export interface AuthInfo {
  authenticated: boolean;
  oauthEnabled: boolean;
  prefix: string;
}

export interface SharedGuildInfo {
  id: string;
  name: string;
  iconUrl: string | null;
  inVoice: boolean;
  channelId: string | null;
  channelName: string | null;
}

export interface UserProfile {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  inGuild: boolean;
  isAdmin: boolean;
  canManageCookies: boolean;
  canViewLogs: boolean;
  hasAccess: boolean;
  requiredRoleId: string | null;
  requiredRoleName: string | null;
}

export interface VoiceState {
  inVoice: boolean;
  channelId: string | null;
  channelName: string | null;
  membersCount: number;
}

export interface TrackItem {
  id: string;
  title: string;
  author: string;
  url: string;
  originalUrl: string;
  durationSec: number;
  durationFormatted: string;
  thumbnail: string | null;
  source: TrackSource;
  mediaKind?: TrackMediaKind;
  requestedBy?: {
    id: string;
    tag: string;
  };
}

export interface ActiveWorkerState {
  id: number;
  name: string;
  tag: string;
  avatarUrl: string | null;
  channelId: string | null;
  volume: number;
  loopMode: LoopMode;
  isPaused: boolean;
  progressSec: number;
  activeSfxName: string | null;
  idleLeaveAt: number | null;
  emptyLeaveAt: number | null;
  currentTrack: TrackItem | null;
  queue: TrackItem[];
}

export interface PoolWorkerStatus {
  id: number;
  name: string;
  tag: string;
  avatarUrl: string | null;
  isOnline: boolean;
  isInChannel: boolean;
  guildId: string | null;
  guildName: string | null;
  channelId: string | null;
  channelName: string | null;
  ping: number;
  currentTrackTitle: string | null;
  queueLength: number;
  isPaused: boolean;
  volume: number;
  isMine: boolean;
  canInspect: boolean;
  listeners: VoiceMemberInfo[];
  currentTrack: TrackItem | null;
  queue: TrackItem[];
  progressSec: number;
}

export interface WorkerPoolState {
  totalCount: number;
  availableCount: number;
  workers: PoolWorkerStatus[];
}

export interface DashboardState {
  guildId: string | null;
  guildName: string;
  guilds: SharedGuildInfo[];
  user: UserProfile;
  voice: VoiceState;
  myWorker: ActiveWorkerState | null;
  watchViewers: VoiceMemberInfo[];
  pool: WorkerPoolState;
}

export interface CustomSound {
  id: number;
  name: string;
  filename: string;
  mimeType: string;
  color: string;
  emoji: string;
  uploadedById: string;
  uploadedByTag: string;
  uploadedByUsername?: string | null;
  isPublic: boolean;
  isOwner: boolean;
  likes: number;
  dislikes: number;
  myVote: ReactionVote;
  createdAt: string | number;
}

export interface SoundboardLibrary {
  mySounds: CustomSound[];
  publicSounds: CustomSound[];
}

export interface MemeSound {
  name: string;
  url: string;
  color: string;
}

export interface SavedTrackSnapshot {
  id: string;
  title: string;
  author: string;
  url: string;
  originalUrl: string;
  durationSec: number;
  durationFormatted: string;
  thumbnail: string | null;
  source: TrackSource;
}

export interface FavoriteTrackInput {
  id?: string;
  title: string;
  author?: string;
  url?: string;
  originalUrl?: string;
  durationSec?: number;
  durationFormatted?: string;
  thumbnail?: string | null;
  source: TrackSource;
  mediaKind?: TrackMediaKind;
}

export interface FavoriteTrackItem {
  id: number;
  trackKey: string;
  trackId: string;
  title: string;
  author: string;
  url: string;
  originalUrl: string;
  durationSec: number;
  durationFormatted: string;
  thumbnail: string | null;
  source: TrackSource;
  mediaKind?: TrackMediaKind;
  createdAt: number;
}

export interface UserPlaylist {
  id: number;
  userId: string;
  guildId: string | null;
  authorName: string;
  authorUsername: string | null;
  name: string;
  color: string;
  isPublic: boolean;
  isOwner: boolean;
  likes: number;
  dislikes: number;
  myVote: ReactionVote;
  trackCount: number;
  tracks: SavedTrackSnapshot[];
  createdAt: string | number;
  updatedAt: string | number;
}

export interface PlaylistsLibrary {
  myPlaylists: UserPlaylist[];
  publicPlaylists: UserPlaylist[];
}

export interface ReactionSummary {
  likes: number;
  dislikes: number;
  myVote: ReactionVote;
}

export interface GuildRoleOption {
  id: string;
  name: string;
  color: string;
}

export interface GuildChannelOption {
  id: string;
  name: string;
  parentName: string | null;
}

export interface AdminSettings {
  requiredRoleId: string | null;
  allowedChannelId: string | null;
  logsAdminOnly: boolean;
  roles: GuildRoleOption[];
  channels: GuildChannelOption[];
}

export interface CookiesStatus {
  hasCookies: boolean;
  source: 'file' | 'env' | 'none';
  updatedAt: number | null;
  lineCount: number;
}

export interface PlayTrackResponse {
  ok: boolean;
  addedCount: number;
  isPlayingNow: boolean;
  track: TrackItem;
}

export interface SavePlaylistResponse {
  ok: boolean;
  playlist: UserPlaylist;
  overwritten: boolean;
}

export interface LoadPlaylistResponse {
  ok: boolean;
  playlistName: string;
  loadedCount: number;
  isPlayingNow?: boolean;
  firstTrack?: TrackItem;
}

export interface UpdateCookiesResponse {
  ok: boolean;
  status: CookiesStatus;
  keptCount: number;
  strippedCount: number;
}

export type AuditLogAction =
  | 'summon'
  | 'add_tracks'
  | 'remove_tracks'
  | 'play_now'
  | 'skip'
  | 'clear_queue'
  | 'stop'
  | 'loop'
  | 'shuffle'
  | 'pause'
  | 'resume'
  | 'settings_update'
  | 'cookies_update';

export type AuditLogFilterAction = 'all' | 'playback' | AuditLogAction;

export type AuditLogSource = 'web' | 'discord';

export interface AuditTrackSnapshot {
  id: string;
  title: string;
  author: string;
  originalUrl: string;
  durationFormatted: string;
  source: TrackSource;
}

export interface AuditLogDetails {
  loopMode?: LoopMode;
  playlistName?: string;
  requiredRoleId?: string | null;
  requiredRoleName?: string | null;
  allowedChannelId?: string | null;
  allowedChannelName?: string | null;
  logsAdminOnly?: boolean;
  cookiesOp?: 'uploaded' | 'reloaded' | 'cleared';
  cookiesLineCount?: number;
  count?: number;
}

export interface AuditLogActor {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
}

export interface AuditLogEntry {
  id: number;
  guildId: string;
  channelId: string | null;
  channelName: string | null;
  workerId: number | null;
  actorId: string;
  actorUsername: string;
  actorDisplayName: string;
  actorAvatarUrl: string | null;
  source: AuditLogSource;
  action: AuditLogAction;
  details: AuditLogDetails | null;
  tracks: AuditTrackSnapshot[];
  trackCount: number;
  createdAt: number;
  updatedAt: number;
}

export interface AuditLogQueryParams {
  page: number;
  pageSize?: number;
  action?: AuditLogFilterAction;
  actorId?: string;
  userQuery?: string;
}

export interface AuditLogQueryResult {
  entries: AuditLogEntry[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  actors: AuditLogActor[];
}

export type LeaderboardSortBy =
  | 'score'
  | 'voiceSeconds'
  | 'tracksAdded'
  | 'totalLikes'
  | 'sfxPlayed'
  | 'skipsCount';

export type LeaderboardSortDir = 'desc' | 'asc';

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  inVoiceNow: boolean;
  score: number;
  tracksAdded: number;
  voiceSeconds: number;
  sfxPlayed: number;
  skipsCount: number;
  playlistsLoaded: number;
  playlistLikes: number;
  soundLikes: number;
  totalLikes: number;
  playlistsCount: number;
  soundsCount: number;
  favoritesCount: number;
  updatedAt: number;
}

export interface LeaderboardSummary {
  totalParticipants: number;
  totalTracksAdded: number;
  totalVoiceSeconds: number;
  totalLikes: number;
  totalSfxPlayed: number;
  activeListenersNow: number;
}

export interface LeaderboardQueryParams {
  page: number;
  pageSize?: number;
  sortBy?: LeaderboardSortBy;
  sortDir?: LeaderboardSortDir;
  search?: string;
}

export interface LeaderboardQueryResult {
  entries: LeaderboardEntry[];
  myEntry: LeaderboardEntry | null;
  summary: LeaderboardSummary;
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  sortBy: LeaderboardSortBy;
  sortDir: LeaderboardSortDir;
}
