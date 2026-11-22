import type {
  AdminSettings,
  AuditLogAction,
  AuditLogActor,
  AuditLogDetails,
  AuditLogEntry,
  AuditLogSource,
  AuditTrackSnapshot,
  ChannelActivityAction,
  CookiesStatus,
  CustomSound,
  DashboardState,
  FavoriteTrackItem,
  LeaderboardEntry,
  LeaderboardSortBy,
  LoopMode,
  MemeSound,
  PlatformOption,
  ReactionVote,
  SearchResultItem,
  TrackItem,
  TrackSource,
  UserPlaylist,
} from '@/types/api';
import { buildTrackKey, formatDuration } from '@/utils/format';
import type { DashboardApiClient, SseHandlers } from './api';
import { streamPreviewSearchPage } from './search-preview';

const INITIAL_TRACKS: TrackItem[] = [
  {
    id: 'a5uQMwRMHcs',
    title: 'Daft Punk - Instant Crush (feat. Julian Casablancas)',
    author: 'Daft Punk',
    url: 'https://www.youtube.com/watch?v=a5uQMwRMHcs',
    originalUrl: 'https://www.youtube.com/watch?v=a5uQMwRMHcs',
    durationSec: 337,
    durationFormatted: '5:37',
    thumbnail: 'https://i.ytimg.com/vi/a5uQMwRMHcs/hqdefault.jpg',
    source: 'youtube',
    mediaKind: 'video',
    requestedBy: { id: '1', tag: 'Alex' },
  },
  {
    id: 'trk-2',
    title: 'Kavinsky - Nightcall',
    author: 'Kavinsky',
    url: 'https://open.spotify.com/track/0U0ldCRmgCqhVvD6ksG63j',
    originalUrl: 'https://open.spotify.com/track/0U0ldCRmgCqhVvD6ksG63j',
    durationSec: 258,
    durationFormatted: '4:18',
    thumbnail: null,
    source: 'spotify',
    mediaKind: 'music',
    requestedBy: { id: '2', tag: 'Dima' },
  },
  {
    id: 'trk-3',
    title: 'HOME - Resonance',
    author: 'HOME',
    url: 'https://soundcloud.com/home-2001/resonance',
    originalUrl: 'https://soundcloud.com/home-2001/resonance',
    durationSec: 212,
    durationFormatted: '3:32',
    thumbnail: null,
    source: 'soundcloud',
    mediaKind: 'music',
    requestedBy: { id: '1', tag: 'Alex' },
  },
  {
    id: 'dX3k_QDnzHE',
    title: 'M83 - Midnight City',
    author: 'M83',
    url: 'https://www.youtube.com/watch?v=dX3k_QDnzHE',
    originalUrl: 'https://www.youtube.com/watch?v=dX3k_QDnzHE',
    durationSec: 243,
    durationFormatted: '4:03',
    thumbnail: 'https://i.ytimg.com/vi/dX3k_QDnzHE/hqdefault.jpg',
    source: 'youtube',
    mediaKind: 'video',
    requestedBy: { id: '3', tag: 'Kate' },
  },
  {
    id: 'trk-5',
    title: 'The Midnight - Sunset',
    author: 'The Midnight',
    url: 'https://open.spotify.com/track/4PMmwowVLOajPdiKnrU1vK',
    originalUrl: 'https://open.spotify.com/track/4PMmwowVLOajPdiKnrU1vK',
    durationSec: 276,
    durationFormatted: '4:36',
    thumbnail: null,
    source: 'spotify',
    mediaKind: 'music',
    requestedBy: { id: '2', tag: 'Dima' },
  },
  {
    id: 'trk-6',
    title: 'Perturbator - Future Club',
    author: 'Perturbator',
    url: 'https://soundcloud.com/perturbator/future-club',
    originalUrl: 'https://soundcloud.com/perturbator/future-club',
    durationSec: 290,
    durationFormatted: '4:50',
    thumbnail: null,
    source: 'soundcloud',
    mediaKind: 'music',
    requestedBy: { id: '3', tag: 'Kate' },
  },
  {
    id: 'trk-7',
    title: 'Timecop1983 - On the Run',
    author: 'Timecop1983',
    url: 'https://open.spotify.com/track/6COsFwxCkIpXBYw4iiVWH4',
    originalUrl: 'https://open.spotify.com/track/6COsFwxCkIpXBYw4iiVWH4',
    durationSec: 241,
    durationFormatted: '4:01',
    thumbnail: null,
    source: 'spotify',
    mediaKind: 'music',
    requestedBy: { id: '1', tag: 'Alex' },
  },
  {
    id: 'trk-8',
    title: 'FM-84 - Running in the Night',
    author: 'FM-84',
    url: 'https://www.youtube.com/watch?v=Bv6sL5P1k0A',
    originalUrl: 'https://www.youtube.com/watch?v=Bv6sL5P1k0A',
    durationSec: 270,
    durationFormatted: '4:30',
    thumbnail: null,
    source: 'youtube',
    mediaKind: 'music',
    requestedBy: { id: '2', tag: 'Dima' },
  },
  {
    id: 'trk-9',
    title: 'Gunship - Tech Noir',
    author: 'Gunship',
    url: 'https://www.youtube.com/watch?v=-nC5TBv3sfU',
    originalUrl: 'https://www.youtube.com/watch?v=-nC5TBv3sfU',
    durationSec: 298,
    durationFormatted: '4:58',
    thumbnail: null,
    source: 'youtube',
    mediaKind: 'video',
    requestedBy: { id: '3', tag: 'Kate' },
  },
  {
    id: 'trk-10',
    title: 'Lazerhawk - Overdrive',
    author: 'Lazerhawk',
    url: 'https://soundcloud.com/lazerhawk/overdrive',
    originalUrl: 'https://soundcloud.com/lazerhawk/overdrive',
    durationSec: 264,
    durationFormatted: '4:24',
    thumbnail: null,
    source: 'soundcloud',
    mediaKind: 'music',
    requestedBy: { id: '1', tag: 'Alex' },
  },
];

const AGENT2_CURRENT_TRACK: TrackItem = {
  id: 'er416Ad3R1g',
  title: 'Carpenter Brut - Turbo Killer',
  author: 'Carpenter Brut',
  url: 'https://www.youtube.com/watch?v=er416Ad3R1g',
  originalUrl: 'https://www.youtube.com/watch?v=er416Ad3R1g',
  durationSec: 208,
  durationFormatted: '3:28',
  thumbnail: null,
  source: 'youtube',
  mediaKind: 'video',
  requestedBy: { id: '4', tag: 'Max' },
};

const AGENT2_QUEUE: TrackItem[] = INITIAL_TRACKS.slice(1, 9);

const MOCK_MEMES_RU: MemeSound[] = [
  { name: 'Vine Boom', url: 'https://www.myinstants.com/media/sounds/vine-boom.mp3', color: '#0067b8' },
  { name: 'Bruh', url: 'https://www.myinstants.com/media/sounds/movie_1.mp3', color: '#107c10' },
  { name: 'Sad Violin', url: 'https://www.myinstants.com/media/sounds/tf_nemesis.mp3', color: '#8764b8' },
  { name: 'Metal Pipe', url: 'https://www.myinstants.com/media/sounds/metal-pipe.mp3', color: '#c42b1c' },
  { name: 'Windows XP Error', url: 'https://www.myinstants.com/media/sounds/erro.mp3', color: '#ca5010' },
  { name: 'Ba Dum Tss', url: 'https://www.myinstants.com/media/sounds/badumtss.mp3', color: '#038387' },
];

const MOCK_MEMES_US: MemeSound[] = [
  { name: 'Airhorn', url: 'https://www.myinstants.com/media/sounds/mlg-airhorn.mp3', color: '#c42b1c' },
  { name: 'Tada', url: 'https://www.myinstants.com/media/sounds/tada.mp3', color: '#107c10' },
  { name: 'Applause', url: 'https://www.myinstants.com/media/sounds/applause.mp3', color: '#0067b8' },
  { name: 'Drumroll', url: 'https://www.myinstants.com/media/sounds/drumroll.mp3', color: '#b86e00' },
];

export function createMockApiClient(): DashboardApiClient {
  let authenticated = true;
  let activeGuildId = 'guild-1';
  let nextSoundId = 10;
  let nextPlaylistId = 10;
  let nextFavoriteId = 10;
  let nextLogId = 100;
  let sfxTimer: ReturnType<typeof setTimeout> | null = null;

  const listeners = new Set<SseHandlers>();
  const previewResultByUrl = new Map<string, SearchResultItem>();

  const toSnapshot = (t: TrackItem): AuditTrackSnapshot => ({
    id: t.id,
    title: t.title,
    author: t.author,
    originalUrl: t.originalUrl,
    durationFormatted: t.durationFormatted,
    source: t.source,
  });

  const nowTs = Date.now();
  let mockLogs: AuditLogEntry[] = [
    {
      id: 9,
      guildId: 'guild-1',
      channelId: 'vc-1',
      channelName: 'General Voice',
      workerId: 1,
      actorId: '100000000000000001',
      actorUsername: 'alex_real',
      actorDisplayName: 'Alex [DJ]',
      actorAvatarUrl: null,
      source: 'web',
      action: 'add_tracks',
      details: { playlistName: 'Late Night Synthwave' },
      tracks: INITIAL_TRACKS.map(toSnapshot),
      trackCount: INITIAL_TRACKS.length,
      createdAt: nowTs - 120_000,
      updatedAt: nowTs - 120_000,
    },
    {
      id: 8,
      guildId: 'guild-1',
      channelId: 'vc-1',
      channelName: 'General Voice',
      workerId: 1,
      actorId: '100000000000000002',
      actorUsername: 'dima_gg',
      actorDisplayName: 'Просто Дима',
      actorAvatarUrl: null,
      source: 'web',
      action: 'remove_tracks',
      details: null,
      tracks: INITIAL_TRACKS.slice(2, 6).map(toSnapshot),
      trackCount: 4,
      createdAt: nowTs - 360_000,
      updatedAt: nowTs - 340_000,
    },
    {
      id: 7,
      guildId: 'guild-1',
      channelId: 'vc-1',
      channelName: 'General Voice',
      workerId: 1,
      actorId: '100000000000000003',
      actorUsername: 'kate_music',
      actorDisplayName: 'Kate',
      actorAvatarUrl: null,
      source: 'discord',
      action: 'loop',
      details: { loopMode: 'queue' },
      tracks: [],
      trackCount: 0,
      createdAt: nowTs - 600_000,
      updatedAt: nowTs - 600_000,
    },
    {
      id: 6,
      guildId: 'guild-1',
      channelId: 'vc-1',
      channelName: 'General Voice',
      workerId: 1,
      actorId: '100000000000000002',
      actorUsername: 'dima_gg',
      actorDisplayName: 'Просто Дима',
      actorAvatarUrl: null,
      source: 'web',
      action: 'play_now',
      details: null,
      tracks: [toSnapshot(INITIAL_TRACKS[3])],
      trackCount: 1,
      createdAt: nowTs - 900_000,
      updatedAt: nowTs - 900_000,
    },
    {
      id: 5,
      guildId: 'guild-1',
      channelId: 'vc-1',
      channelName: 'General Voice',
      workerId: 1,
      actorId: '100000000000000001',
      actorUsername: 'alex_real',
      actorDisplayName: 'Alex [DJ]',
      actorAvatarUrl: null,
      source: 'web',
      action: 'settings_update',
      details: {
        requiredRoleId: 'role-dj',
        requiredRoleName: 'DJ',
        allowedChannelId: 'ch-music',
        allowedChannelName: 'music',
      },
      tracks: [],
      trackCount: 0,
      createdAt: nowTs - 1_500_000,
      updatedAt: nowTs - 1_500_000,
    },
    {
      id: 4,
      guildId: 'guild-1',
      channelId: null,
      channelName: null,
      workerId: null,
      actorId: '100000000000000001',
      actorUsername: 'alex_real',
      actorDisplayName: 'Alex [DJ]',
      actorAvatarUrl: null,
      source: 'web',
      action: 'cookies_update',
      details: { cookiesOp: 'uploaded', cookiesLineCount: 42 },
      tracks: [],
      trackCount: 0,
      createdAt: nowTs - 1_800_000,
      updatedAt: nowTs - 1_800_000,
    },
    {
      id: 3,
      guildId: 'guild-1',
      channelId: 'vc-1',
      channelName: 'General Voice',
      workerId: 1,
      actorId: '100000000000000003',
      actorUsername: 'kate_music',
      actorDisplayName: 'Kate',
      actorAvatarUrl: null,
      source: 'discord',
      action: 'skip',
      details: null,
      tracks: INITIAL_TRACKS.slice(0, 2).map(toSnapshot),
      trackCount: 2,
      createdAt: nowTs - 2_400_000,
      updatedAt: nowTs - 2_400_000,
    },
    {
      id: 2,
      guildId: 'guild-1',
      channelId: 'vc-1',
      channelName: 'General Voice',
      workerId: 1,
      actorId: '100000000000000001',
      actorUsername: 'alex_real',
      actorDisplayName: 'Alex [DJ]',
      actorAvatarUrl: null,
      source: 'discord',
      action: 'summon',
      details: null,
      tracks: [],
      trackCount: 0,
      createdAt: nowTs - 3_600_000,
      updatedAt: nowTs - 3_600_000,
    },
  ];

  let currentTrack: TrackItem | null = INITIAL_TRACKS[0];
  let queue: TrackItem[] = INITIAL_TRACKS.slice(1);
  let volume = 75;
  let loopMode: LoopMode = 'off';
  let isPaused = false;
  let progressSec = 94;
  let workerConnected = true;
  let activeSfxName: string | null = null;
  let selfWatching = false;

  let customSounds: CustomSound[] = [
    {
      id: 1,
      name: 'Victory Fanfare',
      filename: 'fanfare.mp3',
      mimeType: 'audio/mpeg',
      color: '#0067b8',
      emoji: '',
      uploadedById: '1',
      uploadedByTag: 'Alex',
      uploadedByUsername: 'alex_real',
      isPublic: true,
      isOwner: true,
      likes: 7,
      dislikes: 1,
      myVote: 1,
      createdAt: Date.now() - 86400_000,
    },
    {
      id: 2,
      name: 'Rimshot',
      filename: 'rimshot.mp3',
      mimeType: 'audio/mpeg',
      color: '#107c10',
      emoji: '',
      uploadedById: '2',
      uploadedByTag: 'Dima',
      uploadedByUsername: 'dima_gg',
      isPublic: true,
      isOwner: false,
      likes: 12,
      dislikes: 2,
      myVote: 0,
      createdAt: Date.now() - 43200_000,
    },
    {
      id: 3,
      name: 'Alert Horn (Private)',
      filename: 'horn.mp3',
      mimeType: 'audio/mpeg',
      color: '#c42b1c',
      emoji: '',
      uploadedById: '1',
      uploadedByTag: 'Alex',
      uploadedByUsername: 'alex_real',
      isPublic: false,
      isOwner: true,
      likes: 0,
      dislikes: 0,
      myVote: 0,
      createdAt: Date.now() - 12000_000,
    },
    {
      id: 4,
      name: 'Level Up',
      filename: 'levelup.mp3',
      mimeType: 'audio/mpeg',
      color: '#8764b8',
      emoji: '',
      uploadedById: '3',
      uploadedByTag: 'Kate',
      uploadedByUsername: 'kate_music',
      isPublic: true,
      isOwner: false,
      likes: 5,
      dislikes: 0,
      myVote: 0,
      createdAt: Date.now() - 3600_000,
    },
  ];

  let favorites: FavoriteTrackItem[] = [
    {
      id: 1,
      trackKey: buildTrackKey(INITIAL_TRACKS[0]),
      trackId: INITIAL_TRACKS[0].id,
      title: INITIAL_TRACKS[0].title,
      author: INITIAL_TRACKS[0].author,
      url: INITIAL_TRACKS[0].url,
      originalUrl: INITIAL_TRACKS[0].originalUrl,
      durationSec: INITIAL_TRACKS[0].durationSec,
      durationFormatted: INITIAL_TRACKS[0].durationFormatted,
      thumbnail: INITIAL_TRACKS[0].thumbnail,
      source: INITIAL_TRACKS[0].source,
      mediaKind: INITIAL_TRACKS[0].mediaKind,
      createdAt: Date.now() - 7200_000,
    },
    {
      id: 2,
      trackKey: buildTrackKey(INITIAL_TRACKS[3]),
      trackId: INITIAL_TRACKS[3].id,
      title: INITIAL_TRACKS[3].title,
      author: INITIAL_TRACKS[3].author,
      url: INITIAL_TRACKS[3].url,
      originalUrl: INITIAL_TRACKS[3].originalUrl,
      durationSec: INITIAL_TRACKS[3].durationSec,
      durationFormatted: INITIAL_TRACKS[3].durationFormatted,
      thumbnail: INITIAL_TRACKS[3].thumbnail,
      source: INITIAL_TRACKS[3].source,
      mediaKind: INITIAL_TRACKS[3].mediaKind,
      createdAt: Date.now() - 3600_000,
    },
  ];

  let playlists: UserPlaylist[] = [
    {
      id: 1,
      userId: '1',
      guildId: 'guild-1',
      authorName: 'Alex',
      authorUsername: 'alex_real',
      name: 'Late Night Synthwave',
      color: '#0067b8',
      isPublic: true,
      isOwner: true,
      likes: 9,
      dislikes: 1,
      myVote: 1,
      trackCount: 3,
      tracks: INITIAL_TRACKS.slice(0, 3),
      createdAt: Date.now() - 172800_000,
      updatedAt: Date.now() - 7200_000,
    },
    {
      id: 2,
      userId: '1',
      guildId: 'guild-1',
      authorName: 'Alex',
      authorUsername: 'alex_real',
      name: 'Focus Session',
      color: '#107c10',
      isPublic: false,
      isOwner: true,
      likes: 0,
      dislikes: 0,
      myVote: 0,
      trackCount: 5,
      tracks: INITIAL_TRACKS.slice(2, 7),
      createdAt: Date.now() - 86400_000,
      updatedAt: Date.now() - 3600_000,
    },
    {
      id: 3,
      userId: '2',
      guildId: 'guild-1',
      authorName: 'Dima',
      authorUsername: 'dima_gg',
      name: 'Raid Boss Energy',
      color: '#c42b1c',
      isPublic: true,
      isOwner: false,
      likes: 14,
      dislikes: 2,
      myVote: 0,
      trackCount: 4,
      tracks: INITIAL_TRACKS.slice(3, 7),
      createdAt: Date.now() - 250000_000,
      updatedAt: Date.now() - 1800_000,
    },
    {
      id: 4,
      userId: '3',
      guildId: 'guild-1',
      authorName: 'Kate',
      authorUsername: 'kate_music',
      name: 'Chill Roadtrip',
      color: '#8764b8',
      isPublic: true,
      isOwner: false,
      likes: 6,
      dislikes: 0,
      myVote: 0,
      trackCount: 3,
      tracks: INITIAL_TRACKS.slice(6, 9),
      createdAt: Date.now() - 400000_000,
      updatedAt: Date.now() - 900_000,
    },
  ];

  let adminSettings: AdminSettings = {
    requiredRoleId: null,
    allowedChannelId: 'ch-music',
    logsAdminOnly: false,
    roles: [
      { id: 'role-dj', name: 'DJ', color: '#0067b8' },
      { id: 'role-member', name: 'Member', color: '#107c10' },
      { id: 'role-mod', name: 'Moderator', color: '#ca5010' },
    ],
    channels: [
      { id: 'ch-music', name: 'music', parentName: 'Voice & Audio' },
      { id: 'ch-commands', name: 'bot-commands', parentName: 'General' },
      { id: 'ch-general', name: 'general', parentName: 'General' },
    ],
  };

  let cookiesStatus: CookiesStatus = {
    hasCookies: true,
    source: 'file',
    updatedAt: Date.now() - 1800_000,
    lineCount: 42,
  };

  function buildState(): DashboardState {
    const isMainGuild = activeGuildId === 'guild-1';
    const myWorker =
      isMainGuild && workerConnected
        ? {
            id: 1,
            name: 'GMRS #1',
            tag: 'GMRS Music #1',
            avatarUrl: null,
            channelId: 'vc-1',
            volume,
            loopMode,
            isPaused,
            progressSec,
            activeSfxName,
            idleLeaveAt: null,
            emptyLeaveAt: null,
            currentTrack,
            queue: [...queue],
          }
        : null;

    return {
      guildId: activeGuildId,
      guildName: isMainGuild ? 'GMRS' : 'GMRS Lounge',
      guilds: [
        {
          id: 'guild-1',
          name: 'GMRS',
          iconUrl: null,
          inVoice: true,
          channelId: 'vc-1',
          channelName: 'General Voice',
        },
        {
          id: 'guild-2',
          name: 'GMRS Lounge',
          iconUrl: null,
          inVoice: false,
          channelId: null,
          channelName: null,
        },
      ],
      user: {
        id: '1',
        username: 'Alex',
        displayName: 'Alex',
        avatarUrl: null,
        inGuild: true,
        isAdmin: true,
        canManageCookies: true,
        canViewLogs: true,
        hasAccess: true,
        requiredRoleId: adminSettings.requiredRoleId,
        requiredRoleName:
          adminSettings.roles.find((r) => r.id === adminSettings.requiredRoleId)?.name ?? null,
      },
      voice: isMainGuild
        ? {
            inVoice: true,
            channelId: 'vc-1',
            channelName: 'General Voice',
            membersCount: 4,
          }
        : {
            inVoice: false,
            channelId: null,
            channelName: null,
            membersCount: 0,
          },
      myWorker,
      watchViewers: isMainGuild
        ? [
            ...(selfWatching ? [{ id: '1', displayName: 'Alex', avatarUrl: null }] : []),
            { id: '2', displayName: 'Dima', avatarUrl: null },
            { id: '3', displayName: 'Kate', avatarUrl: null },
          ]
        : [],
      pool: {
        totalCount: 5,
        availableCount: workerConnected ? 3 : 4,
        workers: [
          {
            id: 1,
            name: 'GMRS #1',
            tag: 'GMRS Music #1',
            avatarUrl: null,
            isOnline: true,
            isInChannel: workerConnected,
            guildId: workerConnected ? 'guild-1' : null,
            guildName: workerConnected ? 'GMRS' : null,
            channelId: workerConnected ? 'vc-1' : null,
            channelName: workerConnected ? 'General Voice' : null,
            ping: 24,
            currentTrackTitle: workerConnected ? currentTrack?.title ?? null : null,
            queueLength: workerConnected ? queue.length : 0,
            isPaused,
            volume,
            isMine: isMainGuild && workerConnected,
            canInspect: workerConnected,
            listeners: workerConnected
              ? [
                  { id: '1', displayName: 'Alex', avatarUrl: null },
                  { id: '2', displayName: 'Dima', avatarUrl: null },
                  { id: '3', displayName: 'Kate', avatarUrl: null },
                ]
              : [],
            currentTrack: workerConnected ? currentTrack : null,
            queue: workerConnected ? [...queue] : [],
            progressSec: workerConnected ? progressSec : 0,
          },
          {
            id: 2,
            name: 'GMRS #2',
            tag: 'GMRS Music #2',
            avatarUrl: null,
            isOnline: true,
            isInChannel: true,
            guildId: 'guild-1',
            guildName: 'GMRS',
            channelId: 'vc-2',
            channelName: 'Gaming Room',
            ping: 29,
            currentTrackTitle: AGENT2_CURRENT_TRACK.title,
            queueLength: AGENT2_QUEUE.length,
            isPaused: false,
            volume: 80,
            isMine: false,
            canInspect: true,
            listeners: [
              { id: '4', displayName: 'Max', avatarUrl: null },
              { id: '5', displayName: 'Igor', avatarUrl: null },
              { id: '6', displayName: 'Lena', avatarUrl: null },
            ],
            currentTrack: AGENT2_CURRENT_TRACK,
            queue: AGENT2_QUEUE,
            progressSec: 65,
          },
          {
            id: 3,
            name: 'GMRS #3',
            tag: 'GMRS Music #3',
            avatarUrl: null,
            isOnline: true,
            isInChannel: false,
            guildId: null,
            guildName: null,
            channelId: null,
            channelName: null,
            ping: 21,
            currentTrackTitle: null,
            queueLength: 0,
            isPaused: false,
            volume: 80,
            isMine: false,
            canInspect: false,
            listeners: [],
            currentTrack: null,
            queue: [],
            progressSec: 0,
          },
          {
            id: 4,
            name: 'GMRS #4',
            tag: 'GMRS Music #4',
            avatarUrl: null,
            isOnline: true,
            isInChannel: false,
            guildId: null,
            guildName: null,
            channelId: null,
            channelName: null,
            ping: 33,
            currentTrackTitle: null,
            queueLength: 0,
            isPaused: false,
            volume: 80,
            isMine: false,
            canInspect: false,
            listeners: [],
            currentTrack: null,
            queue: [],
            progressSec: 0,
          },
          {
            id: 5,
            name: 'GMRS #5',
            tag: 'GMRS Music #5',
            avatarUrl: null,
            isOnline: false,
            isInChannel: false,
            guildId: null,
            guildName: null,
            channelId: null,
            channelName: null,
            ping: 0,
            currentTrackTitle: null,
            queueLength: 0,
            isPaused: false,
            volume: 80,
            isMine: false,
            canInspect: false,
            listeners: [],
            currentTrack: null,
            queue: [],
            progressSec: 0,
          },
        ],
      },
    };
  }

  function emitState(): void {
    const next = buildState();
    for (const h of listeners) h.onState(next);
  }

  function emitSounds(): void {
    for (const h of listeners) h.onSounds();
  }

  function emitPlaylists(): void {
    for (const h of listeners) h.onPlaylists();
  }

  function emitFavorites(): void {
    for (const h of listeners) h.onFavorites();
  }

  function applyVote(item: { likes: number; dislikes: number; myVote: ReactionVote }, next: ReactionVote) {
    if (item.myVote === 1) item.likes = Math.max(0, item.likes - 1);
    if (item.myVote === -1) item.dislikes = Math.max(0, item.dislikes - 1);
    if (next === 0 || item.myVote === next) {
      item.myVote = 0;
    } else {
      item.myVote = next;
      if (next === 1) item.likes += 1;
      if (next === -1) item.dislikes += 1;
    }
    return { likes: item.likes, dislikes: item.dislikes, myVote: item.myVote };
  }

  function emitLogs(): void {
    for (const h of listeners) h.onLogs(activeGuildId);
  }

  function recordMockLog(params: {
    action: AuditLogAction;
    source?: AuditLogSource;
    details?: AuditLogDetails | null;
    tracks?: AuditTrackSnapshot[];
    channelName?: string | null;
    workerId?: number | null;
    mergeable?: boolean;
  }): void {
    const now = Date.now();
    const tracks = params.tracks ?? [];
    const canMerge =
      (params.mergeable ?? true) &&
      (params.action === 'add_tracks' || params.action === 'remove_tracks') &&
      tracks.length > 0 &&
      !params.details?.playlistName;

    const latest = mockLogs.find((l) => l.guildId === activeGuildId);
    if (
      canMerge &&
      latest &&
      latest.action === params.action &&
      latest.actorId === '100000000000000001' &&
      !latest.details?.playlistName &&
      now - latest.updatedAt <= 90_000
    ) {
      latest.tracks = [...latest.tracks, ...tracks];
      latest.trackCount += tracks.length;
      latest.updatedAt = now;
      emitLogs();
      return;
    }

    mockLogs = [
      {
        id: nextLogId++,
        guildId: activeGuildId,
        channelId: params.channelName === null ? null : 'vc-1',
        channelName: params.channelName === undefined ? 'General Voice' : params.channelName,
        workerId: params.workerId === undefined ? 1 : params.workerId,
        actorId: '100000000000000001',
        actorUsername: 'alex_real',
        actorDisplayName: 'Alex [DJ]',
        actorAvatarUrl: null,
        source: params.source ?? 'web',
        action: params.action,
        details: params.details ?? null,
        tracks,
        trackCount: tracks.length,
        createdAt: now,
        updatedAt: now,
      },
      ...mockLogs,
    ];
    emitLogs();
  }

  function emitActivity(
    action: ChannelActivityAction,
    detail?: string,
    count?: number
  ): void {
    const payload = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      action,
      actorId: '1',
      actorName: 'Alex',
      detail,
      count,
      timestamp: Date.now(),
    };
    for (const h of listeners) h.onActivity(payload);
  }

  function resolveSource(platform: PlatformOption): TrackSource {
    if (platform === 'spotify' || platform === 'soundcloud' || platform === 'youtube') {
      return platform;
    }
    return 'youtube';
  }

  return {
    getAuthInfo: async () => ({
      authenticated,
      oauthEnabled: true,
      prefix: '+',
    }),

    signInWithDiscord: async () => {
      authenticated = true;
    },

    logout: async () => {
      authenticated = false;
    },

    getState: async () => buildState(),

    subscribeEvents: (handlers) => {
      listeners.add(handlers);
      return {
        close: () => {
          listeners.delete(handlers);
        },
      };
    },

    selectGuild: async (guildId) => {
      activeGuildId = guildId;
      const next = buildState();
      emitState();
      return next;
    },

    summonWorker: async () => {
      const wasConnected = workerConnected;
      workerConnected = true;
      emitState();
      if (!wasConnected) recordMockLog({ action: 'summon' });
      return { ok: true, workerId: 1 };
    },

    setWatchPresence: async (active) => {
      selfWatching = active;
      emitState();
    },

    searchTracks: (query, platform, page, callbacks, signal) =>
      streamPreviewSearchPage(
        query,
        platform,
        page,
        {
          onItem: (item) => {
            if (item.url) {
              previewResultByUrl.set(item.url, item);
            }
            callbacks.onItem(item);
          },
          onComplete: callbacks.onComplete,
        },
        signal
      ),

    playTrack: async (query, platform) => {
      workerConnected = true;
      const matched = previewResultByUrl.get(query);
      const matchedFav =
        !matched
          ? favorites.find(
              (f) => f.originalUrl === query || f.url === query || f.trackKey === buildTrackKey({ originalUrl: query })
            )
          : undefined;
      const matchedInitial =
        !matched && !matchedFav
          ? INITIAL_TRACKS.find(
              (t) => t.originalUrl === query || t.url === query || buildTrackKey(t) === buildTrackKey({ originalUrl: query })
            )
          : undefined;
      const known = matchedFav ?? matchedInitial;
      const source = matched?.source ?? known?.source ?? resolveSource(platform);
      const isPlaylistLink =
        matched?.kind === 'playlist' || /playlist|\/sets\/|list=/i.test(query);

      const tracksToAdd: TrackItem[] = isPlaylistLink
        ? [1, 2, 3].map((num) => ({
            id: `trk-${Date.now()}-${num}`,
            title: matched ? `${matched.title} #${num}` : `Playlist Track #${num}`,
            author: matched?.author || 'Artist',
            url: matched?.url || query,
            originalUrl: matched?.url || query,
            durationSec: 190 + num * 18,
            durationFormatted: formatDuration(190 + num * 18),
            thumbnail: matched?.thumbnail ?? null,
            source,
            requestedBy: { id: '1', tag: 'Alex' },
          }))
        : [
            {
              id: `trk-${Date.now()}`,
              title: matched?.title || known?.title || query,
              author: matched?.author || known?.author || 'Artist',
              url:
                matched?.url ||
                known?.url ||
                (/^https?:\/\//i.test(query) ? query : 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'),
              originalUrl:
                matched?.url ||
                known?.originalUrl ||
                (/^https?:\/\//i.test(query) ? query : 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'),
              durationSec: matched?.durationSec || known?.durationSec || 215,
              durationFormatted:
                matched?.durationFormatted ||
                known?.durationFormatted ||
                formatDuration(matched?.durationSec || known?.durationSec || 215),
              thumbnail: matched?.thumbnail ?? known?.thumbnail ?? null,
              source,
              requestedBy: { id: '1', tag: 'Alex' },
            },
          ];

      const isPlayingNow = currentTrack === null;
      if (isPlayingNow) {
        currentTrack = tracksToAdd[0];
        queue = [...queue, ...tracksToAdd.slice(1)];
        progressSec = 0;
        isPaused = false;
      } else {
        queue = [...queue, ...tracksToAdd];
      }
      emitState();
      recordMockLog({
        action: 'add_tracks',
        tracks: tracksToAdd.map(toSnapshot),
      });
      return { ok: true, addedCount: tracksToAdd.length, isPlayingNow, track: tracksToAdd[0] };
    },

    pause: async () => {
      isPaused = true;
      emitState();
      emitActivity('pause');
      recordMockLog({ action: 'pause', tracks: currentTrack ? [toSnapshot(currentTrack)] : [] });
    },

    resume: async () => {
      isPaused = false;
      emitState();
      emitActivity('resume');
      recordMockLog({ action: 'resume', tracks: currentTrack ? [toSnapshot(currentTrack)] : [] });
    },

    skip: async (count = 1) => {
      const skippedTitle = currentTrack?.title;
      const skippedList = currentTrack
        ? [toSnapshot(currentTrack), ...queue.slice(0, Math.max(0, count - 1)).map(toSnapshot)]
        : [];
      const idx = Math.max(0, count - 1);
      currentTrack = queue[idx] ?? null;
      queue = queue.slice(idx + 1);
      progressSec = 0;
      isPaused = false;
      emitState();
      emitActivity('skip', skippedTitle, count);
      if (skippedList.length > 0) recordMockLog({ action: 'skip', tracks: skippedList });
    },

    shuffle: async () => {
      const copy = [...queue];
      for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
      }
      queue = copy;
      emitState();
      emitActivity('shuffle');
      recordMockLog({ action: 'shuffle', details: { count: queue.length } });
    },

    setLoop: async (mode) => {
      loopMode = mode;
      emitState();
      emitActivity('loop', mode);
      recordMockLog({ action: 'loop', details: { loopMode: mode } });
    },

    stop: async () => {
      const dropped = [
        ...(currentTrack ? [toSnapshot(currentTrack)] : []),
        ...queue.map(toSnapshot),
      ];
      currentTrack = null;
      queue = [];
      progressSec = 0;
      isPaused = false;
      workerConnected = false;
      emitState();
      emitActivity('stop');
      recordMockLog({ action: 'stop', tracks: dropped });
    },

    setVolume: async (val) => {
      volume = Math.max(1, Math.min(100, val));
      emitState();
    },

    moveQueueItem: async (from, to) => {
      if (from < 0 || from >= queue.length || to < 0 || to >= queue.length) return;
      const copy = [...queue];
      const [item] = copy.splice(from, 1);
      copy.splice(to, 0, item);
      queue = copy;
      emitState();
    },

    playQueueItemNow: async (index) => {
      if (index < 0 || index >= queue.length) return;
      const copy = [...queue];
      const [chosen] = copy.splice(index, 1);
      if (!chosen) return;
      if (loopMode === 'queue' && currentTrack) {
        copy.push(currentTrack);
      }
      currentTrack = chosen;
      queue = copy;
      progressSec = 0;
      isPaused = false;
      emitState();
      emitActivity('play_now', chosen.title);
      recordMockLog({ action: 'play_now', tracks: [toSnapshot(chosen)] });
    },

    removeQueueItem: async (index) => {
      const removed = queue[index];
      queue = queue.filter((_, i) => i !== index);
      emitState();
      if (removed) {
        emitActivity('remove_track', removed.title);
        recordMockLog({ action: 'remove_tracks', tracks: [toSnapshot(removed)] });
      }
    },

    clearQueue: async () => {
      const clearedTracks = queue.map(toSnapshot);
      const count = queue.length;
      queue = [];
      emitState();
      if (count > 0) {
        emitActivity('clear_queue', undefined, count);
        recordMockLog({ action: 'clear_queue', tracks: clearedTracks });
      }
    },

    listFavorites: async () => [...favorites],

    toggleFavorite: async (input) => {
      const trackKey = buildTrackKey(input);
      const existing = favorites.find((f) => f.trackKey === trackKey);
      if (existing) {
        favorites = favorites.filter((f) => f.id !== existing.id);
        emitFavorites();
        return { favorited: false, item: null, trackKey };
      }
      const created: FavoriteTrackItem = {
        id: nextFavoriteId++,
        trackKey,
        trackId: input.id || trackKey,
        title: input.title,
        author: input.author || '',
        url: input.url || input.originalUrl || '',
        originalUrl: input.originalUrl || input.url || '',
        durationSec: input.durationSec || 0,
        durationFormatted: input.durationFormatted || formatDuration(input.durationSec || 0),
        thumbnail: input.thumbnail ?? null,
        source: input.source,
        mediaKind: input.mediaKind,
        createdAt: Date.now(),
      };
      favorites = [created, ...favorites];
      emitFavorites();
      return { favorited: true, item: created, trackKey };
    },

    removeFavorite: async (id) => {
      favorites = favorites.filter((f) => f.id !== id);
      emitFavorites();
    },

    playAllFavorites: async () => {
      if (favorites.length === 0) throw new Error('No favorite tracks');
      workerConnected = true;
      const incoming: TrackItem[] = favorites.map((f) => ({
        id: f.trackId,
        title: f.title,
        author: f.author,
        url: f.url,
        originalUrl: f.originalUrl,
        durationSec: f.durationSec,
        durationFormatted: f.durationFormatted,
        thumbnail: f.thumbnail,
        source: f.source,
        mediaKind: f.mediaKind,
        requestedBy: { id: '1', tag: 'Alex' },
      }));
      const isPlayingNow = currentTrack === null && queue.length === 0;
      if (isPlayingNow) {
        currentTrack = incoming[0];
        queue = incoming.slice(1);
        progressSec = 0;
        isPaused = false;
      } else {
        queue = [...queue, ...incoming];
      }
      emitState();
      recordMockLog({
        action: 'add_tracks',
        tracks: incoming.map(toSnapshot),
        mergeable: false,
      });
      return { addedCount: incoming.length, isPlayingNow };
    },

    listPlaylists: async () => ({
      myPlaylists: playlists.filter((p) => p.isOwner).map((p) => ({ ...p })),
      publicPlaylists: playlists
        .filter((p) => p.isPublic && p.guildId === activeGuildId)
        .map((p) => ({ ...p })),
    }),

    savePlaylist: async (payload) => {
      const tracks = [currentTrack, ...queue].filter((t): t is TrackItem => t !== null);
      const existing = playlists.find(
        (p) => p.isOwner && p.name.toLowerCase() === payload.name.toLowerCase()
      );
      const now = Date.now();
      if (existing) {
        existing.tracks = tracks;
        existing.trackCount = tracks.length;
        if (payload.color) existing.color = payload.color;
        if (payload.isPublic !== undefined) existing.isPublic = payload.isPublic;
        existing.guildId = activeGuildId;
        existing.updatedAt = now;
        emitPlaylists();
        return { ok: true, playlist: { ...existing }, overwritten: true };
      }
      const created: UserPlaylist = {
        id: nextPlaylistId++,
        userId: '1',
        guildId: activeGuildId,
        authorName: 'Alex',
        authorUsername: 'alex_real',
        name: payload.name,
        color: payload.color || '#0067b8',
        isPublic: Boolean(payload.isPublic),
        isOwner: true,
        likes: 0,
        dislikes: 0,
        myVote: 0,
        trackCount: tracks.length,
        tracks,
        createdAt: now,
        updatedAt: now,
      };
      playlists = [created, ...playlists];
      emitPlaylists();
      return { ok: true, playlist: created, overwritten: false };
    },

    updatePlaylist: async (id, patch) => {
      const pl = playlists.find((p) => p.id === id && p.isOwner);
      if (!pl) throw new Error('Playlist not found');
      if (patch.name !== undefined) pl.name = patch.name.trim();
      if (patch.color !== undefined) pl.color = patch.color;
      if (patch.isPublic !== undefined) {
        pl.isPublic = patch.isPublic;
        if (patch.isPublic) pl.guildId = activeGuildId;
      }
      pl.updatedAt = Date.now();
      emitPlaylists();
      return { ...pl };
    },

    copyPlaylist: async (id, copySuffix = 'копия') => {
      const src = playlists.find((p) => p.id === id);
      if (!src) throw new Error('Playlist not found');
      const now = Date.now();
      const created: UserPlaylist = {
        ...src,
        id: nextPlaylistId++,
        userId: '1',
        guildId: activeGuildId,
        authorName: 'Alex',
        authorUsername: 'alex_real',
        name: `${src.name} (${copySuffix})`.slice(0, 60),
        isPublic: false,
        isOwner: true,
        likes: 0,
        dislikes: 0,
        myVote: 0,
        createdAt: now,
        updatedAt: now,
      };
      playlists = [created, ...playlists];
      emitPlaylists();
      return created;
    },

    addTrackToPlaylist: async (playlistId, track) => {
      const pl = playlists.find((p) => p.id === playlistId && p.isOwner);
      if (!pl) throw new Error('Playlist not found');
      const key = buildTrackKey(track);
      if (pl.tracks.some((t) => buildTrackKey(t) === key)) {
        return { playlist: { ...pl }, alreadyExists: true };
      }
      pl.tracks = [
        ...pl.tracks,
        {
          id: track.id || key,
          title: track.title,
          author: track.author || '',
          url: track.url || track.originalUrl || '',
          originalUrl: track.originalUrl || track.url || '',
          durationSec: track.durationSec || 0,
          durationFormatted: track.durationFormatted || formatDuration(track.durationSec || 0),
          thumbnail: track.thumbnail ?? null,
          source: track.source,
        },
      ];
      pl.trackCount = pl.tracks.length;
      pl.updatedAt = Date.now();
      emitPlaylists();
      return { playlist: { ...pl }, alreadyExists: false };
    },

    removeTrackFromPlaylist: async (playlistId, params) => {
      const pl = playlists.find((p) => p.id === playlistId && p.isOwner);
      if (!pl) throw new Error('Playlist not found');
      const nextTracks = [...pl.tracks];
      let removed = false;
      if (typeof params.index === 'number' && Number.isInteger(params.index)) {
        if (params.index >= 0 && params.index < nextTracks.length) {
          nextTracks.splice(params.index, 1);
          removed = true;
        }
      } else if (params.trackKey) {
        const idx = nextTracks.findIndex((t) => buildTrackKey(t) === params.trackKey);
        if (idx !== -1) {
          nextTracks.splice(idx, 1);
          removed = true;
        }
      }
      if (removed) {
        pl.tracks = nextTracks;
        pl.trackCount = nextTracks.length;
        pl.updatedAt = Date.now();
        emitPlaylists();
      }
      return { playlist: { ...pl }, removed };
    },

    createPlaylistWithTrack: async (payload) => {
      const now = Date.now();
      const created: UserPlaylist = {
        id: nextPlaylistId++,
        userId: '1',
        guildId: activeGuildId,
        authorName: 'Alex',
        authorUsername: 'alex_real',
        name: payload.name.trim(),
        color: payload.color || '#0067b8',
        isPublic: Boolean(payload.isPublic),
        isOwner: true,
        likes: 0,
        dislikes: 0,
        myVote: 0,
        trackCount: 1,
        tracks: [
          {
            id: payload.track.id || buildTrackKey(payload.track),
            title: payload.track.title,
            author: payload.track.author || '',
            url: payload.track.url || payload.track.originalUrl || '',
            originalUrl: payload.track.originalUrl || payload.track.url || '',
            durationSec: payload.track.durationSec || 0,
            durationFormatted:
              payload.track.durationFormatted || formatDuration(payload.track.durationSec || 0),
            thumbnail: payload.track.thumbnail ?? null,
            source: payload.track.source,
          },
        ],
        createdAt: now,
        updatedAt: now,
      };
      playlists = [created, ...playlists];
      emitPlaylists();
      return created;
    },

    reactPlaylist: async (id, value) => {
      const pl = playlists.find((p) => p.id === id && p.isPublic);
      if (!pl) throw new Error('Playlist not found');
      const summary = applyVote(pl, value);
      emitPlaylists();
      return summary;
    },

    loadPlaylist: async (id) => {
      const pl = playlists.find((p) => p.id === id);
      if (!pl) throw new Error('Playlist not found');
      workerConnected = true;
      const incoming = pl.tracks.map((t) => ({ ...t, requestedBy: { id: '1', tag: 'Alex' } }));
      const isPlayingNow = currentTrack === null && queue.length === 0;
      if (isPlayingNow) {
        currentTrack = incoming[0] ?? null;
        queue = incoming.slice(1);
        progressSec = 0;
        isPaused = false;
      } else {
        queue = [...queue, ...incoming];
      }
      emitState();
      recordMockLog({
        action: 'add_tracks',
        details: { playlistName: pl.name },
        tracks: incoming.map(toSnapshot),
        mergeable: false,
      });
      return {
        ok: true,
        playlistName: pl.name,
        loadedCount: incoming.length,
        isPlayingNow,
        firstTrack: incoming[0],
      };
    },

    deletePlaylist: async (id) => {
      playlists = playlists.filter((p) => !(p.id === id && p.isOwner));
      emitPlaylists();
    },

    listCustomSounds: async () => ({
      mySounds: customSounds.filter((s) => s.isOwner).map((s) => ({ ...s })),
      publicSounds: customSounds.filter((s) => s.isPublic).map((s) => ({ ...s })),
    }),

    uploadCustomSound: async (payload) => {
      const created: CustomSound = {
        id: nextSoundId++,
        name: payload.name,
        filename: payload.filename,
        mimeType: payload.mimeType || 'audio/mpeg',
        color: payload.color,
        emoji: '',
        uploadedById: '1',
        uploadedByTag: 'Alex',
        uploadedByUsername: 'alex_real',
        isPublic: payload.isPublic,
        isOwner: true,
        likes: 0,
        dislikes: 0,
        myVote: 0,
        createdAt: Date.now(),
      };
      customSounds = [created, ...customSounds];
      emitSounds();
      return created;
    },

    updateCustomSound: async (id, patch) => {
      const sound = customSounds.find((s) => s.id === id && s.isOwner);
      if (!sound) throw new Error('Sound not found');
      if (patch.name !== undefined) sound.name = patch.name.trim();
      if (patch.color !== undefined) sound.color = patch.color;
      if (patch.isPublic !== undefined) sound.isPublic = patch.isPublic;
      emitSounds();
      return { ...sound };
    },

    reactSound: async (id, value) => {
      const sound = customSounds.find((s) => s.id === id && s.isPublic);
      if (!sound) throw new Error('Sound not found');
      const summary = applyVote(sound, value);
      emitSounds();
      return summary;
    },

    deleteCustomSound: async (id) => {
      customSounds = customSounds.filter((s) => !(s.id === id && s.isOwner));
      emitSounds();
    },

    playCustomSound: async (id) => {
      const sound = customSounds.find((s) => s.id === id);
      const name = sound?.name ?? 'Sound';
      workerConnected = true;
      activeSfxName = name;
      emitState();
      if (sfxTimer) clearTimeout(sfxTimer);
      sfxTimer = setTimeout(() => {
        activeSfxName = null;
        emitState();
      }, 2500);
      emitActivity('sfx', name);
      return { played: name };
    },

    listMemes: async ({ query, region }) => {
      const base = region === 'us' ? MOCK_MEMES_US : MOCK_MEMES_RU;
      if (!query) return base;
      const q = query.toLowerCase();
      return [...MOCK_MEMES_RU, ...MOCK_MEMES_US].filter((m) =>
        m.name.toLowerCase().includes(q)
      );
    },

    playMeme: async (_url, name) => {
      workerConnected = true;
      activeSfxName = name;
      emitState();
      if (sfxTimer) clearTimeout(sfxTimer);
      sfxTimer = setTimeout(() => {
        activeSfxName = null;
        emitState();
      }, 2500);
      emitActivity('sfx', name);
      return { played: name };
    },

    saveMeme: async (meme, isPublic = false) => {
      const created: CustomSound = {
        id: nextSoundId++,
        name: meme.name,
        filename: `${meme.name.toLowerCase().replace(/\s+/g, '-')}.mp3`,
        mimeType: 'audio/mpeg',
        color: meme.color,
        emoji: '',
        uploadedById: '1',
        uploadedByTag: 'Alex',
        uploadedByUsername: 'alex_real',
        isPublic,
        isOwner: true,
        likes: 0,
        dislikes: 0,
        myVote: 0,
        createdAt: Date.now(),
      };
      customSounds = [created, ...customSounds];
      emitSounds();
      return created;
    },

    getAdminSettings: async () => ({
      requiredRoleId: adminSettings.requiredRoleId,
      allowedChannelId: adminSettings.allowedChannelId,
      logsAdminOnly: adminSettings.logsAdminOnly,
      roles: [...adminSettings.roles],
      channels: [...adminSettings.channels],
    }),

    saveAdminSettings: async (payload) => {
      adminSettings = {
        ...adminSettings,
        requiredRoleId: payload.requiredRoleId,
        allowedChannelId: payload.allowedChannelId,
        logsAdminOnly: payload.logsAdminOnly,
      };
      emitState();
      recordMockLog({
        action: 'settings_update',
        channelName: null,
        workerId: null,
        details: {
          requiredRoleId: payload.requiredRoleId,
          requiredRoleName:
            adminSettings.roles.find((r) => r.id === payload.requiredRoleId)?.name ?? null,
          allowedChannelId: payload.allowedChannelId,
          allowedChannelName:
            adminSettings.channels.find((c) => c.id === payload.allowedChannelId)?.name ?? null,
          logsAdminOnly: payload.logsAdminOnly,
        },
      });
    },

    getCookiesStatus: async () => ({ ...cookiesStatus }),

    updateCookies: async (content) => {
      const lines = content.split('\n').filter((l) => l.trim().length > 0).length;
      cookiesStatus = {
        hasCookies: true,
        source: 'file',
        updatedAt: Date.now(),
        lineCount: Math.max(1, lines),
      };
      recordMockLog({
        action: 'cookies_update',
        channelName: null,
        workerId: null,
        details: { cookiesOp: 'uploaded', cookiesLineCount: cookiesStatus.lineCount },
      });
      return { ok: true, status: { ...cookiesStatus }, keptCount: lines, strippedCount: 0 };
    },

    reloadCookies: async () => {
      cookiesStatus = { ...cookiesStatus, updatedAt: Date.now() };
      recordMockLog({
        action: 'cookies_update',
        channelName: null,
        workerId: null,
        details: { cookiesOp: 'reloaded', cookiesLineCount: cookiesStatus.lineCount },
      });
      return { status: { ...cookiesStatus } };
    },

    clearCookies: async () => {
      cookiesStatus = { hasCookies: false, source: 'none', updatedAt: null, lineCount: 0 };
      recordMockLog({
        action: 'cookies_update',
        channelName: null,
        workerId: null,
        details: { cookiesOp: 'cleared' },
      });
      return { status: { ...cookiesStatus } };
    },

    getLogs: async (params) => {
      const pageSize = Math.max(5, Math.min(50, params.pageSize || 15));
      const guildLogs = mockLogs.filter((l) => l.guildId === activeGuildId);

      const actorMap = new Map<string, AuditLogActor>();
      for (const item of guildLogs) {
        if (!actorMap.has(item.actorId)) {
          actorMap.set(item.actorId, {
            id: item.actorId,
            username: item.actorUsername,
            displayName: item.actorDisplayName,
            avatarUrl: item.actorAvatarUrl,
          });
        }
      }

      const rawQ = (params.userQuery || '').trim().replace(/^@+/, '').toLowerCase();
      const filtered = guildLogs.filter((entry) => {
        if (params.action && params.action !== 'all') {
          if (params.action === 'playback') {
            if (!['pause', 'resume', 'shuffle'].includes(entry.action)) return false;
          } else if (entry.action !== params.action) {
            return false;
          }
        }
        if (params.actorId && params.actorId !== 'all' && entry.actorId !== params.actorId) {
          return false;
        }
        if (rawQ) {
          const matchUsername = entry.actorUsername.toLowerCase().includes(rawQ);
          const matchId = entry.actorId.includes(rawQ);
          if (!matchUsername && !matchId) return false;
        }
        return true;
      });

      const total = filtered.length;
      const totalPages = Math.max(1, Math.ceil(total / pageSize));
      const page = Math.max(1, Math.min(params.page || 1, totalPages));
      const start = (page - 1) * pageSize;

      return {
        entries: filtered.slice(start, start + pageSize),
        total,
        page,
        pageSize,
        totalPages,
        actors: [...actorMap.values()],
      };
    },

    getLeaderboard: async (params) => {
      const pageSize = Math.max(5, Math.min(50, params.pageSize || 15));
      const sortBy: LeaderboardSortBy = params.sortBy || 'score';
      const sortDir = params.sortDir === 'asc' ? 'asc' : 'desc';

      const baseMembers: Array<{
        guildId: string;
        userId: string;
        username: string;
        displayName: string;
        inVoiceNow: boolean;
        tracksAdded: number;
        voiceSeconds: number;
        sfxPlayed: number;
        skipsCount: number;
        playlistsLoaded: number;
        extraPlaylistLikes: number;
        extraSoundLikes: number;
        extraPlaylistsCount: number;
        extraSoundsCount: number;
        favoritesCount: number;
      }> = [
        {
          guildId: 'guild-1',
          userId: '1',
          username: 'alex_dev',
          displayName: 'Alex',
          inVoiceNow: workerConnected,
          tracksAdded: 148,
          voiceSeconds: 54_720, // 15h 12m
          sfxPlayed: 64,
          skipsCount: 29,
          playlistsLoaded: 14,
          extraPlaylistLikes: 0,
          extraSoundLikes: 0,
          extraPlaylistsCount: 0,
          extraSoundsCount: 0,
          favoritesCount: favorites.length,
        },
        {
          guildId: 'guild-1',
          userId: '2',
          username: 'dima_beats',
          displayName: 'Dima',
          inVoiceNow: workerConnected,
          tracksAdded: 215,
          voiceSeconds: 78_300, // 21h 45m
          sfxPlayed: 92,
          skipsCount: 54,
          playlistsLoaded: 21,
          extraPlaylistLikes: 6,
          extraSoundLikes: 4,
          extraPlaylistsCount: 2,
          extraSoundsCount: 3,
          favoritesCount: 34,
        },
        {
          guildId: 'guild-1',
          userId: '3',
          username: 'kate_wave',
          displayName: 'Kate',
          inVoiceNow: workerConnected,
          tracksAdded: 184,
          voiceSeconds: 66_480, // 18h 28m
          sfxPlayed: 41,
          skipsCount: 18,
          playlistsLoaded: 19,
          extraPlaylistLikes: 11,
          extraSoundLikes: 5,
          extraPlaylistsCount: 3,
          extraSoundsCount: 2,
          favoritesCount: 41,
        },
        {
          guildId: 'guild-1',
          userId: '4',
          username: 'max_gg',
          displayName: 'Max',
          inVoiceNow: true,
          tracksAdded: 132,
          voiceSeconds: 49_200,
          sfxPlayed: 118,
          skipsCount: 63,
          playlistsLoaded: 9,
          extraPlaylistLikes: 3,
          extraSoundLikes: 14,
          extraPlaylistsCount: 1,
          extraSoundsCount: 6,
          favoritesCount: 18,
        },
        {
          guildId: 'guild-1',
          userId: '5',
          username: 'igor_synth',
          displayName: 'Igor',
          inVoiceNow: true,
          tracksAdded: 97,
          voiceSeconds: 41_820,
          sfxPlayed: 27,
          skipsCount: 12,
          playlistsLoaded: 8,
          extraPlaylistLikes: 8,
          extraSoundLikes: 2,
          extraPlaylistsCount: 2,
          extraSoundsCount: 1,
          favoritesCount: 22,
        },
        {
          guildId: 'guild-1',
          userId: '6',
          username: 'lena_lofi',
          displayName: 'Lena',
          inVoiceNow: true,
          tracksAdded: 112,
          voiceSeconds: 58_140,
          sfxPlayed: 19,
          skipsCount: 7,
          playlistsLoaded: 15,
          extraPlaylistLikes: 15,
          extraSoundLikes: 3,
          extraPlaylistsCount: 4,
          extraSoundsCount: 1,
          favoritesCount: 52,
        },
        {
          guildId: 'guild-1',
          userId: '7',
          username: 'artem_dj',
          displayName: 'Artem',
          inVoiceNow: false,
          tracksAdded: 164,
          voiceSeconds: 33_600,
          sfxPlayed: 53,
          skipsCount: 41,
          playlistsLoaded: 11,
          extraPlaylistLikes: 5,
          extraSoundLikes: 7,
          extraPlaylistsCount: 2,
          extraSoundsCount: 4,
          favoritesCount: 19,
        },
        {
          guildId: 'guild-1',
          userId: '8',
          username: 'vlad_night',
          displayName: 'Vlad',
          inVoiceNow: false,
          tracksAdded: 86,
          voiceSeconds: 29_400,
          sfxPlayed: 38,
          skipsCount: 22,
          playlistsLoaded: 6,
          extraPlaylistLikes: 4,
          extraSoundLikes: 6,
          extraPlaylistsCount: 1,
          extraSoundsCount: 2,
          favoritesCount: 14,
        },
        {
          guildId: 'guild-1',
          userId: '9',
          username: 'sofa_chill',
          displayName: 'Sofa',
          inVoiceNow: false,
          tracksAdded: 74,
          voiceSeconds: 36_900,
          sfxPlayed: 15,
          skipsCount: 9,
          playlistsLoaded: 10,
          extraPlaylistLikes: 9,
          extraSoundLikes: 1,
          extraPlaylistsCount: 3,
          extraSoundsCount: 0,
          favoritesCount: 27,
        },
        {
          guildId: 'guild-1',
          userId: '10',
          username: 'denis_bass',
          displayName: 'Denis',
          inVoiceNow: false,
          tracksAdded: 68,
          voiceSeconds: 24_180,
          sfxPlayed: 84,
          skipsCount: 35,
          playlistsLoaded: 4,
          extraPlaylistLikes: 2,
          extraSoundLikes: 12,
          extraPlaylistsCount: 1,
          extraSoundsCount: 5,
          favoritesCount: 11,
        },
        {
          guildId: 'guild-1',
          userId: '11',
          username: 'masha_indie',
          displayName: 'Masha',
          inVoiceNow: false,
          tracksAdded: 59,
          voiceSeconds: 27_300,
          sfxPlayed: 12,
          skipsCount: 6,
          playlistsLoaded: 7,
          extraPlaylistLikes: 7,
          extraSoundLikes: 0,
          extraPlaylistsCount: 2,
          extraSoundsCount: 0,
          favoritesCount: 31,
        },
        {
          guildId: 'guild-1',
          userId: '12',
          username: 'nikita_rave',
          displayName: 'Nikita',
          inVoiceNow: false,
          tracksAdded: 53,
          voiceSeconds: 18_720,
          sfxPlayed: 46,
          skipsCount: 28,
          playlistsLoaded: 3,
          extraPlaylistLikes: 1,
          extraSoundLikes: 5,
          extraPlaylistsCount: 1,
          extraSoundsCount: 2,
          favoritesCount: 9,
        },
        {
          guildId: 'guild-1',
          userId: '13',
          username: 'oleg_retro',
          displayName: 'Oleg',
          inVoiceNow: false,
          tracksAdded: 41,
          voiceSeconds: 15_900,
          sfxPlayed: 21,
          skipsCount: 11,
          playlistsLoaded: 5,
          extraPlaylistLikes: 3,
          extraSoundLikes: 2,
          extraPlaylistsCount: 1,
          extraSoundsCount: 1,
          favoritesCount: 12,
        },
        {
          guildId: 'guild-1',
          userId: '14',
          username: 'polina_mix',
          displayName: 'Polina',
          inVoiceNow: false,
          tracksAdded: 35,
          voiceSeconds: 13_500,
          sfxPlayed: 9,
          skipsCount: 4,
          playlistsLoaded: 4,
          extraPlaylistLikes: 4,
          extraSoundLikes: 1,
          extraPlaylistsCount: 2,
          extraSoundsCount: 0,
          favoritesCount: 16,
        },
        {
          guildId: 'guild-1',
          userId: '15',
          username: 'sergey_rock',
          displayName: 'Sergey',
          inVoiceNow: false,
          tracksAdded: 29,
          voiceSeconds: 11_160,
          sfxPlayed: 33,
          skipsCount: 17,
          playlistsLoaded: 2,
          extraPlaylistLikes: 1,
          extraSoundLikes: 3,
          extraPlaylistsCount: 0,
          extraSoundsCount: 2,
          favoritesCount: 8,
        },
        {
          guildId: 'guild-1',
          userId: '16',
          username: 'timur_chill',
          displayName: 'Timur',
          inVoiceNow: false,
          tracksAdded: 22,
          voiceSeconds: 8_400,
          sfxPlayed: 14,
          skipsCount: 5,
          playlistsLoaded: 1,
          extraPlaylistLikes: 0,
          extraSoundLikes: 2,
          extraPlaylistsCount: 0,
          extraSoundsCount: 1,
          favoritesCount: 5,
        },
        {
          guildId: 'guild-1',
          userId: '17',
          username: 'kirill_aux',
          displayName: 'Kirill',
          inVoiceNow: false,
          tracksAdded: 17,
          voiceSeconds: 5_280,
          sfxPlayed: 11,
          skipsCount: 8,
          playlistsLoaded: 1,
          extraPlaylistLikes: 0,
          extraSoundLikes: 1,
          extraPlaylistsCount: 0,
          extraSoundsCount: 1,
          favoritesCount: 3,
        },
        // Guild 2 members
        {
          guildId: 'guild-2',
          userId: '1',
          username: 'alex_dev',
          displayName: 'Alex',
          inVoiceNow: false,
          tracksAdded: 24,
          voiceSeconds: 9_600,
          sfxPlayed: 12,
          skipsCount: 4,
          playlistsLoaded: 3,
          extraPlaylistLikes: 0,
          extraSoundLikes: 0,
          extraPlaylistsCount: 0,
          extraSoundsCount: 0,
          favoritesCount: favorites.length,
        },
        {
          guildId: 'guild-2',
          userId: '2',
          username: 'dima_beats',
          displayName: 'Dima',
          inVoiceNow: false,
          tracksAdded: 42,
          voiceSeconds: 14_400,
          sfxPlayed: 19,
          skipsCount: 11,
          playlistsLoaded: 5,
          extraPlaylistLikes: 4,
          extraSoundLikes: 2,
          extraPlaylistsCount: 1,
          extraSoundsCount: 1,
          favoritesCount: 34,
        },
      ];

      const guildMembers = baseMembers.filter((m) => m.guildId === activeGuildId);

      // Reflect live mock playlists, sounds, and logs for user '1' and others
      const allEntries: LeaderboardEntry[] = guildMembers.map((m) => {
        const userPlaylistsList = playlists.filter((p) => p.userId === m.userId);
        const userSoundsList = customSounds.filter((s) => s.uploadedById === m.userId);
        const playlistLikes =
          m.extraPlaylistLikes + userPlaylistsList.reduce((acc, p) => acc + p.likes, 0);
        const soundLikes =
          m.extraSoundLikes + userSoundsList.reduce((acc, s) => acc + s.likes, 0);
        const totalLikes = playlistLikes + soundLikes;
        const playlistsCount = m.extraPlaylistsCount + userPlaylistsList.length;
        const soundsCount = m.extraSoundsCount + userSoundsList.length;

        const voiceMinutes = Math.floor(m.voiceSeconds / 60);
        const score = Math.round(
          voiceMinutes * 1 +
            m.tracksAdded * 3 +
            m.sfxPlayed * 2 +
            totalLikes * 5 +
            playlistsCount * 4 +
            soundsCount * 3
        );

        return {
          rank: 0,
          userId: m.userId,
          username: m.username,
          displayName: m.displayName,
          avatarUrl: null,
          inVoiceNow: m.inVoiceNow,
          score,
          tracksAdded: m.tracksAdded,
          voiceSeconds: m.voiceSeconds,
          sfxPlayed: m.sfxPlayed,
          skipsCount: m.skipsCount,
          playlistsLoaded: m.playlistsLoaded,
          playlistLikes,
          soundLikes,
          totalLikes,
          playlistsCount,
          soundsCount,
          favoritesCount: m.favoritesCount,
          updatedAt: Date.now(),
        };
      });

      const summary = {
        totalParticipants: allEntries.length,
        totalTracksAdded: allEntries.reduce((sum, e) => sum + e.tracksAdded, 0),
        totalVoiceSeconds: allEntries.reduce((sum, e) => sum + e.voiceSeconds, 0),
        totalLikes: allEntries.reduce((sum, e) => sum + e.totalLikes, 0),
        totalSfxPlayed: allEntries.reduce((sum, e) => sum + e.sfxPlayed, 0),
        activeListenersNow: allEntries.filter((e) => e.inVoiceNow).length,
      };

      const getVal = (entry: LeaderboardEntry): number => {
        switch (sortBy) {
          case 'voiceSeconds':
            return entry.voiceSeconds;
          case 'tracksAdded':
            return entry.tracksAdded;
          case 'totalLikes':
            return entry.totalLikes;
          case 'sfxPlayed':
            return entry.sfxPlayed;
          case 'skipsCount':
            return entry.skipsCount;
          case 'score':
          default:
            return entry.score;
        }
      };

      const dirMul = sortDir === 'asc' ? 1 : -1;
      allEntries.sort((a, b) => {
        const diff = (getVal(a) - getVal(b)) * dirMul;
        if (diff !== 0) return diff;
        return b.score - a.score || a.userId.localeCompare(b.userId);
      });
      allEntries.forEach((e, idx) => {
        e.rank = idx + 1;
      });

      const myEntry = allEntries.find((e) => e.userId === '1') ?? null;

      const rawQ = (params.search || '').trim().replace(/^@+/, '').toLowerCase();
      const filtered = rawQ
        ? allEntries.filter(
            (e) =>
              e.displayName.toLowerCase().includes(rawQ) ||
              e.username.toLowerCase().includes(rawQ) ||
              e.userId.includes(rawQ)
          )
        : allEntries;

      const total = filtered.length;
      const totalPages = Math.max(1, Math.ceil(total / pageSize));
      const page = Math.max(1, Math.min(params.page || 1, totalPages));
      const start = (page - 1) * pageSize;

      return {
        entries: filtered.slice(start, start + pageSize),
        myEntry,
        summary,
        total,
        page,
        pageSize,
        totalPages,
        sortBy,
        sortDir,
      };
    },
  };
}
