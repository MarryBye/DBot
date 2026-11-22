export type PlatformOption = 'auto' | 'youtube' | 'soundcloud' | 'spotify';
export type TrackSource = 'youtube' | 'soundcloud' | 'spotify';
export type TrackMediaKind = 'video' | 'music' | 'stream';
export type SearchResultKind = 'music' | 'video' | 'stream' | 'track' | 'playlist';
export type LoopMode = 'off' | 'track' | 'queue';
export type MemeRegion = 'ru' | 'us';
export type AppTab = 'player' | 'watch' | 'playlists' | 'soundboard' | 'agents' | 'admin';
export type SoundboardTab = 'custom' | 'memes';
export type AdminSectionId = 'access' | 'cookies';
export type ToastVariant = 'info' | 'success' | 'warning' | 'danger';

export type ChannelActivityAction =
  | 'stop'
  | 'leave'
  | 'clear_queue'
  | 'skip'
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
  createdAt: string | number;
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

export interface UserPlaylist {
  id: number;
  userId: string;
  name: string;
  trackCount: number;
  tracks: SavedTrackSnapshot[];
  createdAt: string | number;
  updatedAt: string | number;
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
