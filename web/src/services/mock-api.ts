import type {
  AdminSettings,
  ChannelActivityAction,
  CookiesStatus,
  CustomSound,
  DashboardState,
  LoopMode,
  MemeSound,
  PlatformOption,
  TrackItem,
  TrackSource,
  UserPlaylist,
} from '@/types/api';
import { formatDuration } from '@/utils/format';
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
  let sfxTimer: ReturnType<typeof setTimeout> | null = null;

  const listeners = new Set<SseHandlers>();

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
      createdAt: Date.now() - 43200_000,
    },
    {
      id: 3,
      name: 'Alert Horn',
      filename: 'horn.mp3',
      mimeType: 'audio/mpeg',
      color: '#c42b1c',
      emoji: '',
      uploadedById: '1',
      uploadedByTag: 'Alex',
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
      createdAt: Date.now() - 3600_000,
    },
  ];

  let playlists: UserPlaylist[] = [
    {
      id: 1,
      userId: '1',
      name: 'Late Night Synthwave',
      trackCount: 3,
      tracks: INITIAL_TRACKS.slice(0, 3),
      createdAt: Date.now() - 172800_000,
      updatedAt: Date.now() - 7200_000,
    },
    {
      id: 2,
      userId: '1',
      name: 'Focus Session',
      trackCount: 2,
      tracks: INITIAL_TRACKS.slice(2),
      createdAt: Date.now() - 86400_000,
      updatedAt: Date.now() - 3600_000,
    },
  ];

  let adminSettings: AdminSettings = {
    requiredRoleId: null,
    allowedChannelId: 'ch-music',
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
      workerConnected = true;
      emitState();
      return { ok: true, workerId: 1 };
    },

    setWatchPresence: async (active) => {
      selfWatching = active;
      emitState();
    },

    searchTracks: (query, platform, page, callbacks, signal) =>
      streamPreviewSearchPage(query, platform, page, callbacks, signal),

    playTrack: async (query, platform) => {
      workerConnected = true;
      const source = resolveSource(platform);
      const isPlaylistLink = /playlist|\/sets\/|list=/i.test(query);

      const tracksToAdd: TrackItem[] = isPlaylistLink
        ? [1, 2, 3].map((num) => ({
            id: `trk-${Date.now()}-${num}`,
            title: `Playlist Track #${num}`,
            author: 'Artist',
            url: query,
            originalUrl: query,
            durationSec: 190 + num * 18,
            durationFormatted: formatDuration(190 + num * 18),
            thumbnail: null,
            source,
            requestedBy: { id: '1', tag: 'Alex' },
          }))
        : [
            {
              id: `trk-${Date.now()}`,
              title: query,
              author: 'Artist',
              url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
              originalUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
              durationSec: 215,
              durationFormatted: formatDuration(215),
              thumbnail: null,
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
      return { ok: true, addedCount: tracksToAdd.length, isPlayingNow, track: tracksToAdd[0] };
    },

    pause: async () => {
      isPaused = true;
      emitState();
      emitActivity('pause');
    },

    resume: async () => {
      isPaused = false;
      emitState();
      emitActivity('resume');
    },

    skip: async (count = 1) => {
      const skippedTitle = currentTrack?.title;
      const idx = Math.max(0, count - 1);
      currentTrack = queue[idx] ?? null;
      queue = queue.slice(idx + 1);
      progressSec = 0;
      isPaused = false;
      emitState();
      emitActivity('skip', skippedTitle, count);
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
    },

    setLoop: async (mode) => {
      loopMode = mode;
      emitState();
      emitActivity('loop', mode);
    },

    stop: async () => {
      currentTrack = null;
      queue = [];
      progressSec = 0;
      isPaused = false;
      workerConnected = false;
      emitState();
      emitActivity('stop');
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

    removeQueueItem: async (index) => {
      const removed = queue[index];
      queue = queue.filter((_, i) => i !== index);
      emitState();
      if (removed) emitActivity('remove_track', removed.title);
    },

    clearQueue: async () => {
      const count = queue.length;
      queue = [];
      emitState();
      if (count > 0) emitActivity('clear_queue', undefined, count);
    },

    listPlaylists: async () => [...playlists],

    savePlaylist: async (name) => {
      const tracks = [currentTrack, ...queue].filter((t): t is TrackItem => t !== null);
      const existing = playlists.find((p) => p.name.toLowerCase() === name.toLowerCase());
      const now = Date.now();
      if (existing) {
        existing.tracks = tracks;
        existing.trackCount = tracks.length;
        existing.updatedAt = now;
        emitPlaylists();
        return { ok: true, playlist: { ...existing }, overwritten: true };
      }
      const created: UserPlaylist = {
        id: nextPlaylistId++,
        userId: '1',
        name,
        trackCount: tracks.length,
        tracks,
        createdAt: now,
        updatedAt: now,
      };
      playlists = [created, ...playlists];
      emitPlaylists();
      return { ok: true, playlist: created, overwritten: false };
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
      return {
        ok: true,
        playlistName: pl.name,
        loadedCount: incoming.length,
        isPlayingNow,
        firstTrack: incoming[0],
      };
    },

    deletePlaylist: async (id) => {
      playlists = playlists.filter((p) => p.id !== id);
      emitPlaylists();
    },

    listCustomSounds: async () => [...customSounds],

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
        createdAt: Date.now(),
      };
      customSounds = [created, ...customSounds];
      emitSounds();
      return created;
    },

    deleteCustomSound: async (id) => {
      customSounds = customSounds.filter((s) => s.id !== id);
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

    saveMeme: async (meme) => {
      const created: CustomSound = {
        id: nextSoundId++,
        name: meme.name,
        filename: `${meme.name.toLowerCase().replace(/\s+/g, '-')}.mp3`,
        mimeType: 'audio/mpeg',
        color: meme.color,
        emoji: '',
        uploadedById: '1',
        uploadedByTag: 'Alex',
        createdAt: Date.now(),
      };
      customSounds = [created, ...customSounds];
      emitSounds();
      return created;
    },

    getAdminSettings: async () => ({
      requiredRoleId: adminSettings.requiredRoleId,
      allowedChannelId: adminSettings.allowedChannelId,
      roles: [...adminSettings.roles],
      channels: [...adminSettings.channels],
    }),

    saveAdminSettings: async (payload) => {
      adminSettings = {
        ...adminSettings,
        requiredRoleId: payload.requiredRoleId,
        allowedChannelId: payload.allowedChannelId,
      };
      emitState();
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
      return { ok: true, status: { ...cookiesStatus }, keptCount: lines, strippedCount: 0 };
    },

    reloadCookies: async () => {
      cookiesStatus = { ...cookiesStatus, updatedAt: Date.now() };
      return { status: { ...cookiesStatus } };
    },

    clearCookies: async () => {
      cookiesStatus = { hasCookies: false, source: 'none', updatedAt: null, lineCount: 0 };
      return { status: { ...cookiesStatus } };
    },
  };
}
