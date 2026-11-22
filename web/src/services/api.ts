import type {
  AdminSettings,
  AuthInfo,
  ChannelActivityEvent,
  CookiesStatus,
  CustomSound,
  DashboardState,
  LoadPlaylistResponse,
  LoopMode,
  MemeRegion,
  MemeSound,
  PlatformOption,
  PlayTrackResponse,
  SavePlaylistResponse,
  SearchResultItem,
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
  listPlaylists(): Promise<UserPlaylist[]>;
  savePlaylist(name: string): Promise<SavePlaylistResponse>;
  loadPlaylist(id: number): Promise<LoadPlaylistResponse>;
  deletePlaylist(id: number): Promise<void>;
  listCustomSounds(): Promise<CustomSound[]>;
  uploadCustomSound(payload: {
    name: string;
    color: string;
    filename: string;
    mimeType: string;
    dataBase64: string;
  }): Promise<CustomSound>;
  deleteCustomSound(id: number): Promise<void>;
  playCustomSound(id: number): Promise<{ played: string }>;
  listMemes(params: { query?: string; region: MemeRegion }): Promise<MemeSound[]>;
  playMeme(url: string, name: string): Promise<{ played: string }>;
  saveMeme(meme: MemeSound): Promise<CustomSound>;
  getAdminSettings(): Promise<AdminSettings>;
  saveAdminSettings(payload: {
    requiredRoleId: string | null;
    allowedChannelId: string | null;
  }): Promise<void>;
  getCookiesStatus(): Promise<CookiesStatus>;
  updateCookies(content: string): Promise<UpdateCookiesResponse>;
  reloadCookies(): Promise<{ status: CookiesStatus }>;
  clearCookies(): Promise<{ status: CookiesStatus }>;
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

    listPlaylists: async () => {
      const data = await request<{ playlists: UserPlaylist[] }>('/api/playlists');
      return data.playlists ?? [];
    },

    savePlaylist: (name) =>
      request<SavePlaylistResponse>('/api/playlists/save', {
        method: 'POST',
        body: JSON.stringify({ name }),
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
      const data = await request<{ sounds: CustomSound[] }>('/api/soundboard/custom');
      return data.sounds ?? [];
    },

    uploadCustomSound: async (payload) => {
      const data = await request<{ sound: CustomSound }>('/api/soundboard/upload', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      return data.sound;
    },

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

    saveMeme: async (meme) => {
      const data = await request<{ sound: CustomSound }>('/api/soundboard/save-meme', {
        method: 'POST',
        body: JSON.stringify({ name: meme.name, url: meme.url, color: meme.color }),
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
  };
}
