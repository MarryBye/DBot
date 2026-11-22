import type {
  AdminSettings,
  AuditLogQueryParams,
  AuditLogQueryResult,
  AuthInfo,
  ChannelActivityEvent,
  CookiesStatus,
  CustomSound,
  DashboardState,
  FavoriteTrackInput,
  FavoriteTrackItem,
  LeaderboardQueryParams,
  LeaderboardQueryResult,
  LoadPlaylistResponse,
  LoopMode,
  MemeRegion,
  MemeSound,
  PlatformOption,
  PlaylistsLibrary,
  PlayTrackResponse,
  ReactionSummary,
  ReactionVote,
  SavePlaylistResponse,
  SearchResultItem,
  SoundboardLibrary,
  UpdateCookiesResponse,
  UserPlaylist,
} from '@/types/api';

export interface SseSubscription {
  close: () => void;
}

export interface SseHandlers {
  onState: (state: DashboardState) => void;
  onSounds: () => void;
  onPlaylists: () => void;
  onFavorites: () => void;
  onLogs: (guildId: string | null) => void;
  onActivity: (event: ChannelActivityEvent) => void;
}

export interface DashboardApiClient {
  getAuthInfo(): Promise<AuthInfo>;
  signInWithDiscord(): Promise<void> | void;
  logout(): Promise<void>;
  getState(): Promise<DashboardState>;
  subscribeEvents(handlers: SseHandlers): SseSubscription;
  selectGuild(guildId: string): Promise<DashboardState>;
  summonWorker(): Promise<{ ok: boolean; workerId: number; message?: string }>;
  setWatchPresence(active: boolean): Promise<void>;
  searchTracks(
    query: string,
    platform: PlatformOption,
    page: number,
    callbacks: {
      onItem: (item: SearchResultItem) => void;
      onComplete: (hasNextPage: boolean) => void;
    },
    signal?: AbortSignal
  ): Promise<void>;
  playTrack(query: string, platform: PlatformOption): Promise<PlayTrackResponse>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  skip(count?: number): Promise<void>;
  shuffle(): Promise<void>;
  setLoop(mode: LoopMode): Promise<void>;
  stop(): Promise<void>;
  setVolume(volume: number): Promise<void>;
  moveQueueItem(from: number, to: number): Promise<void>;
  playQueueItemNow(index: number): Promise<void>;
  removeQueueItem(index: number): Promise<void>;
  clearQueue(): Promise<void>;
  listFavorites(): Promise<FavoriteTrackItem[]>;
  toggleFavorite(track: FavoriteTrackInput): Promise<{
    favorited: boolean;
    item: FavoriteTrackItem | null;
    trackKey: string;
  }>;
  removeFavorite(id: number): Promise<void>;
  playAllFavorites(): Promise<{ addedCount: number; isPlayingNow: boolean }>;
  listPlaylists(): Promise<PlaylistsLibrary>;
  savePlaylist(payload: {
    name: string;
    color?: string;
    isPublic?: boolean;
  }): Promise<SavePlaylistResponse>;
  updatePlaylist(
    id: number,
    patch: { name?: string; color?: string; isPublic?: boolean }
  ): Promise<UserPlaylist>;
  copyPlaylist(id: number, copySuffix?: string): Promise<UserPlaylist>;
  addTrackToPlaylist(
    playlistId: number,
    track: FavoriteTrackInput
  ): Promise<{ playlist: UserPlaylist; alreadyExists: boolean }>;
  removeTrackFromPlaylist(
    playlistId: number,
    params: { trackKey?: string; index?: number }
  ): Promise<{ playlist: UserPlaylist; removed: boolean }>;
  createPlaylistWithTrack(payload: {
    name: string;
    color?: string;
    isPublic?: boolean;
    track: FavoriteTrackInput;
  }): Promise<UserPlaylist>;
  reactPlaylist(id: number, value: ReactionVote): Promise<ReactionSummary>;
  loadPlaylist(id: number): Promise<LoadPlaylistResponse>;
  deletePlaylist(id: number): Promise<void>;
  listCustomSounds(): Promise<SoundboardLibrary>;
  uploadCustomSound(payload: {
    name: string;
    color: string;
    isPublic: boolean;
    filename: string;
    mimeType: string;
    dataBase64: string;
  }): Promise<CustomSound>;
  updateCustomSound(
    id: number,
    patch: { name?: string; color?: string; isPublic?: boolean }
  ): Promise<CustomSound>;
  reactSound(id: number, value: ReactionVote): Promise<ReactionSummary>;
  deleteCustomSound(id: number): Promise<void>;
  playCustomSound(id: number): Promise<{ played: string }>;
  listMemes(params: { query?: string; region: MemeRegion }): Promise<MemeSound[]>;
  playMeme(url: string, name: string): Promise<{ played: string }>;
  saveMeme(meme: MemeSound, isPublic?: boolean): Promise<CustomSound>;
  getAdminSettings(): Promise<AdminSettings>;
  saveAdminSettings(payload: {
    requiredRoleId: string | null;
    allowedChannelId: string | null;
    logsAdminOnly: boolean;
  }): Promise<void>;
  getCookiesStatus(): Promise<CookiesStatus>;
  updateCookies(content: string): Promise<UpdateCookiesResponse>;
  reloadCookies(): Promise<{ status: CookiesStatus }>;
  clearCookies(): Promise<{ status: CookiesStatus }>;
  getLogs(params: AuditLogQueryParams): Promise<AuditLogQueryResult>;
  getLeaderboard(params: LeaderboardQueryParams): Promise<LeaderboardQueryResult>;
}

async function request<T>(url: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      'X-DBot-CSRF': '1',
      ...(options.headers || {}),
    },
    ...options,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message =
      typeof (data as { error?: unknown }).error === 'string'
        ? (data as { error: string }).error
        : `HTTP ${response.status}`;
    throw new Error(message);
  }
  return data as T;
}

export function createHttpApiClient(): DashboardApiClient {
  return {
    getAuthInfo: () => request<AuthInfo>('/api/auth/info'),

    signInWithDiscord: () => {
      window.location.href = '/api/auth/discord';
    },

    logout: async () => {
      await request('/api/auth/logout', { method: 'POST' });
    },

    getState: () => request<DashboardState>('/api/state'),

    subscribeEvents: (handlers) => {
      const es = new EventSource('/api/events');

      es.addEventListener('state', (event) => {
        try {
          handlers.onState(JSON.parse((event as MessageEvent).data) as DashboardState);
        } catch {
          // Ignore malformed event
        }
      });

      es.addEventListener('sounds', () => {
        handlers.onSounds();
      });

      es.addEventListener('playlists', () => {
        handlers.onPlaylists();
      });

      es.addEventListener('favorites', () => {
        handlers.onFavorites();
      });

      es.addEventListener('logs', (event) => {
        try {
          const parsed = JSON.parse((event as MessageEvent).data) as { guildId?: string | null };
          handlers.onLogs(parsed.guildId ?? null);
        } catch {
          handlers.onLogs(null);
        }
      });

      es.addEventListener('activity', (event) => {
        try {
          handlers.onActivity(JSON.parse((event as MessageEvent).data) as ChannelActivityEvent);
        } catch {
          // Ignore malformed event
        }
      });

      return {
        close: () => es.close(),
      };
    },

    selectGuild: (guildId) =>
      request<DashboardState>('/api/guild/select', {
        method: 'POST',
        body: JSON.stringify({ guildId }),
      }),

    summonWorker: () =>
      request<{ ok: boolean; workerId: number; message?: string }>('/api/worker/summon', {
        method: 'POST',
      }),

    setWatchPresence: async (active) => {
      await request('/api/watch/presence', {
        method: 'POST',
        body: JSON.stringify({ active }),
      });
    },

    searchTracks: async (query, platform, page, callbacks, signal) => {
      const params = new URLSearchParams({
        q: query,
        platform,
        page: String(page),
      });
      const response = await fetch(`/api/player/search?${params.toString()}`, {
        headers: { 'X-DBot-CSRF': '1' },
        signal,
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        const message =
          typeof (data as { error?: unknown }).error === 'string'
            ? (data as { error: string }).error
            : `HTTP ${response.status}`;
        throw new Error(message);
      }

      if (!response.body) {
        callbacks.onComplete(false);
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let completed = false;

      const processLine = (line: string) => {
        const trimmed = line.trim();
        if (!trimmed) return;
        let parsed: any;
        try {
          parsed = JSON.parse(trimmed);
        } catch {
          return;
        }
        if (parsed.type === 'item' && parsed.item) {
          callbacks.onItem(parsed.item as SearchResultItem);
        } else if (parsed.type === 'done') {
          completed = true;
          callbacks.onComplete(Boolean(parsed.hasNextPage));
        } else if (parsed.type === 'error') {
          throw new Error(String(parsed.error || 'Search error'));
        }
      };

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';
          for (const line of lines) {
            processLine(line);
          }
        }
        buffer += decoder.decode();
        if (buffer.trim()) {
          processLine(buffer);
        }
        if (!completed && !signal?.aborted) {
          callbacks.onComplete(false);
        }
      } finally {
        reader.releaseLock();
      }
    },

    playTrack: (query, platform) =>
      request<PlayTrackResponse>('/api/player/play', {
        method: 'POST',
        body: JSON.stringify({ query, platform }),
      }),

    pause: async () => {
      await request('/api/player/pause', { method: 'POST' });
    },

    resume: async () => {
      await request('/api/player/resume', { method: 'POST' });
    },

    skip: async (count = 1) => {
      await request('/api/player/skip', {
        method: 'POST',
        body: JSON.stringify({ count }),
      });
    },

    shuffle: async () => {
      await request('/api/player/shuffle', { method: 'POST' });
    },

    setLoop: async (mode) => {
      await request('/api/player/loop', {
        method: 'POST',
        body: JSON.stringify({ mode }),
      });
    },

    stop: async () => {
      await request('/api/player/stop', { method: 'POST' });
    },

    setVolume: async (volume) => {
      await request('/api/player/volume', {
        method: 'POST',
        body: JSON.stringify({ volume }),
      });
    },

    moveQueueItem: async (from, to) => {
      await request('/api/queue/move', {
        method: 'POST',
        body: JSON.stringify({ from, to }),
      });
    },

    playQueueItemNow: async (index) => {
      await request('/api/queue/play-now', {
        method: 'POST',
        body: JSON.stringify({ index }),
      });
    },

    removeQueueItem: async (index) => {
      await request('/api/queue/remove', {
        method: 'POST',
        body: JSON.stringify({ index }),
      });
    },

    clearQueue: async () => {
      await request('/api/queue/clear', { method: 'POST' });
    },

    listFavorites: async () => {
      const data = await request<{ favorites: FavoriteTrackItem[] }>('/api/favorites');
      return data.favorites ?? [];
    },

    toggleFavorite: (track) =>
      request<{ favorited: boolean; item: FavoriteTrackItem | null; trackKey: string }>(
        '/api/favorites/toggle',
        {
          method: 'POST',
          body: JSON.stringify(track),
        }
      ),

    removeFavorite: async (id) => {
      await request(`/api/favorites/${id}`, { method: 'DELETE' });
    },

    playAllFavorites: () =>
      request<{ addedCount: number; isPlayingNow: boolean }>('/api/favorites/play-all', {
        method: 'POST',
      }),

    listPlaylists: async () => {
      const data = await request<{
        myPlaylists?: UserPlaylist[];
        publicPlaylists?: UserPlaylist[];
        playlists?: UserPlaylist[];
      }>('/api/playlists');
      return {
        myPlaylists: data.myPlaylists ?? data.playlists ?? [],
        publicPlaylists: data.publicPlaylists ?? [],
      };
    },

    savePlaylist: (payload) =>
      request<SavePlaylistResponse>('/api/playlists/save', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),

    updatePlaylist: async (id, patch) => {
      const data = await request<{ playlist: UserPlaylist }>(`/api/playlists/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      });
      return data.playlist;
    },

    copyPlaylist: async (id, copySuffix) => {
      const data = await request<{ playlist: UserPlaylist }>(`/api/playlists/${id}/copy`, {
        method: 'POST',
        body: JSON.stringify({ copySuffix }),
      });
      return data.playlist;
    },

    addTrackToPlaylist: (playlistId, track) =>
      request<{ playlist: UserPlaylist; alreadyExists: boolean }>(
        `/api/playlists/${playlistId}/tracks`,
        {
          method: 'POST',
          body: JSON.stringify({ track }),
        }
      ),

    removeTrackFromPlaylist: (playlistId, params) =>
      request<{ playlist: UserPlaylist; removed: boolean }>(
        `/api/playlists/${playlistId}/tracks/remove`,
        {
          method: 'POST',
          body: JSON.stringify(params),
        }
      ),

    createPlaylistWithTrack: async (payload) => {
      const data = await request<{ playlist: UserPlaylist }>('/api/playlists/create-with-track', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      return data.playlist;
    },

    reactPlaylist: (id, value) =>
      request<ReactionSummary>(`/api/playlists/${id}/react`, {
        method: 'POST',
        body: JSON.stringify({ value }),
      }),

    loadPlaylist: (id) =>
      request<LoadPlaylistResponse>('/api/playlists/load', {
        method: 'POST',
        body: JSON.stringify({ id }),
      }),

    deletePlaylist: async (id) => {
      await request(`/api/playlists/${id}`, { method: 'DELETE' });
    },

    listCustomSounds: async () => {
      const data = await request<{
        mySounds?: CustomSound[];
        publicSounds?: CustomSound[];
        sounds?: CustomSound[];
      }>('/api/soundboard/custom');
      return {
        mySounds: data.mySounds ?? [],
        publicSounds: data.publicSounds ?? data.sounds ?? [],
      };
    },

    uploadCustomSound: async (payload) => {
      const data = await request<{ sound: CustomSound }>('/api/soundboard/upload', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      return data.sound;
    },

    updateCustomSound: async (id, patch) => {
      const data = await request<{ sound: CustomSound }>(`/api/soundboard/custom/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      });
      return data.sound;
    },

    reactSound: (id, value) =>
      request<ReactionSummary>(`/api/soundboard/custom/${id}/react`, {
        method: 'POST',
        body: JSON.stringify({ value }),
      }),

    deleteCustomSound: async (id) => {
      await request(`/api/soundboard/custom/${id}`, { method: 'DELETE' });
    },

    playCustomSound: (id) =>
      request<{ played: string }>('/api/soundboard/play', {
        method: 'POST',
        body: JSON.stringify({ type: 'custom', id }),
      }),

    listMemes: async ({ query, region }) => {
      const url = query
        ? `/api/soundboard/memes?q=${encodeURIComponent(query)}`
        : `/api/soundboard/memes?region=${region}`;
      const data = await request<{ memes: MemeSound[] }>(url);
      return data.memes ?? [];
    },

    playMeme: (url, name) =>
      request<{ played: string }>('/api/soundboard/play', {
        method: 'POST',
        body: JSON.stringify({ type: 'url', url, name }),
      }),

    saveMeme: async (meme, isPublic = false) => {
      const data = await request<{ sound: CustomSound }>('/api/soundboard/save-meme', {
        method: 'POST',
        body: JSON.stringify({ name: meme.name, url: meme.url, color: meme.color, isPublic }),
      });
      return data.sound;
    },

    getAdminSettings: () => request<AdminSettings>('/api/admin/settings'),

    saveAdminSettings: async (payload) => {
      await request('/api/admin/settings', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    },

    getCookiesStatus: () => request<CookiesStatus>('/api/admin/cookies'),

    updateCookies: (content) =>
      request<UpdateCookiesResponse>('/api/admin/cookies', {
        method: 'POST',
        body: JSON.stringify({ content }),
      }),

    reloadCookies: () =>
      request<{ status: CookiesStatus }>('/api/admin/cookies/reload', {
        method: 'POST',
      }),

    clearCookies: () =>
      request<{ status: CookiesStatus }>('/api/admin/cookies', {
        method: 'DELETE',
      }),

    getLogs: (params) => {
      const qs = new URLSearchParams();
      qs.set('page', String(params.page || 1));
      if (params.pageSize) qs.set('pageSize', String(params.pageSize));
      if (params.action && params.action !== 'all') qs.set('action', params.action);
      if (params.actorId && params.actorId !== 'all') qs.set('actorId', params.actorId);
      if (params.userQuery?.trim()) qs.set('userQuery', params.userQuery.trim());
      return request<AuditLogQueryResult>(`/api/logs?${qs.toString()}`);
    },

    getLeaderboard: (params) => {
      const qs = new URLSearchParams();
      qs.set('page', String(params.page || 1));
      if (params.pageSize) qs.set('pageSize', String(params.pageSize));
      if (params.sortBy) qs.set('sortBy', params.sortBy);
      if (params.sortDir) qs.set('sortDir', params.sortDir);
      if (params.search?.trim()) qs.set('q', params.search.trim());
      return request<LeaderboardQueryResult>(`/api/leaderboard?${qs.toString()}`);
    },
  };
}
