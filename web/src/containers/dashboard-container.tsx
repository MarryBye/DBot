import * as React from 'react';
import {
  createTranslator,
  getInitialLocale,
  saveLocale,
  type Locale,
  type TextCode,
} from '@/i18n';
import { apiClient, isStandaloneMode } from '@/services/client';
import { applyTheme, getInitialTheme, saveTheme, type ThemeMode } from '@/theme';
import type {
  AdminSectionId,
  AdminSettings,
  AppTab,
  AuthInfo,
  CookiesStatus,
  CustomSound,
  DashboardState,
  LoopMode,
  MemeRegion,
  MemeSound,
  PlatformOption,
  SearchResultItem,
  SoundboardTab,
  ToastMessage,
  ToastVariant,
  UserPlaylist,
} from '@/types/api';
import { safeHttpUrl } from '@/utils/format';
import { AccessDeniedView } from '@/components/blocks/access-denied-view';
import { AdminSection } from '@/components/blocks/admin-section';
import { AgentsSection } from '@/components/blocks/agents-section';
import { LoadingView } from '@/components/blocks/loading-view';
import { LoginView } from '@/components/blocks/login-view';
import { NowPlayingCard } from '@/components/blocks/now-playing-card';
import { PlaylistsSection } from '@/components/blocks/playlists-section';
import { QueueCard } from '@/components/blocks/queue-card';
import { SoundboardSection } from '@/components/blocks/soundboard-section';
import type { SoundUploadPayload } from '@/components/blocks/sound-upload-form';
import { TrackSearchBar } from '@/components/blocks/track-search-bar';
import { WatchTogetherSection } from '@/components/blocks/watch-together-section';
import { AuthShell } from '@/components/layout/auth-shell';
import { NavTabs } from '@/components/layout/nav-tabs';
import { TopBar } from '@/components/layout/top-bar';
import { Alert } from '@/components/ui/alert';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import { ToastViewport } from '@/components/ui/toast';

type ViewMode = 'loading' | 'login' | 'denied' | 'app';

interface ConfirmState {
  title: string;
  description: string;
  destructive?: boolean;
  onConfirm: () => Promise<void> | void;
}

interface SearchPageCacheEntry {
  items: SearchResultItem[];
  hasNextPage: boolean;
}

const AUTH_ERROR_MAP: Record<string, TextCode> = {
  expired: 'auth.error.expired',
  no_oauth: 'auth.error.no_oauth',
  invalid_state: 'auth.error.invalid_state',
  oauth_failed: 'auth.error.oauth_failed',
};

export function DashboardContainer() {
  const [theme, setTheme] = React.useState<ThemeMode>(() => {
    const initial = getInitialTheme();
    applyTheme(initial);
    return initial;
  });

  const [locale, setLocale] = React.useState<Locale>(() => {
    const initial = getInitialLocale();
    document.documentElement.lang = initial;
    return initial;
  });

  const t = React.useMemo(() => createTranslator(locale), [locale]);

  const [view, setView] = React.useState<ViewMode>('loading');
  const [authInfo, setAuthInfo] = React.useState<AuthInfo>({
    authenticated: false,
    oauthEnabled: false,
    prefix: '+',
  });
  const [authErrorCode, setAuthErrorCode] = React.useState<TextCode | null>(null);

  const [state, setState] = React.useState<DashboardState | null>(null);
  const [activeTab, setActiveTab] = React.useState<AppTab>('player');
  const [soundboardTab, setSoundboardTab] = React.useState<SoundboardTab>('custom');
  const [activeAdminSection, setActiveAdminSection] = React.useState<AdminSectionId>('access');

  // Player & search
  const [searchQuery, setSearchQuery] = React.useState('');
  const [platform, setPlatform] = React.useState<PlatformOption>('auto');
  const [isSubmittingDirect, setIsSubmittingDirect] = React.useState(false);

  // Dropdown search state (progressive loading + pagination)
  const [searchOpen, setSearchOpen] = React.useState(false);
  const [activeSearchQuery, setActiveSearchQuery] = React.useState('');
  const [searchPage, setSearchPage] = React.useState(1);
  const [searchResults, setSearchResults] = React.useState<SearchResultItem[]>([]);
  const [searchHasNextPage, setSearchHasNextPage] = React.useState(false);
  const [isSearchingPage, setIsSearchingPage] = React.useState(false);
  const [addingResultId, setAddingResultId] = React.useState<string | null>(null);
  const [addedResultIds, setAddedResultIds] = React.useState<Set<string>>(() => new Set());

  const [localVolume, setLocalVolume] = React.useState(80);
  const [progressSec, setProgressSec] = React.useState(0);
  const [emptyLeaveSec, setEmptyLeaveSec] = React.useState<number | null>(null);
  const [idleLeaveSec, setIdleLeaveSec] = React.useState<number | null>(null);

  // Data collections
  const [playlists, setPlaylists] = React.useState<UserPlaylist[]>([]);
  const [expandedPlaylists, setExpandedPlaylists] = React.useState<Set<number>>(() => new Set());
  const [isSavingPlaylist, setIsSavingPlaylist] = React.useState(false);
  const [loadingPlaylistId, setLoadingPlaylistId] = React.useState<number | null>(null);

  const [customSounds, setCustomSounds] = React.useState<CustomSound[]>([]);
  const [memes, setMemes] = React.useState<MemeSound[]>([]);
  const [memeRegion, setMemeRegion] = React.useState<MemeRegion>('ru');
  const [isLoadingMemes, setIsLoadingMemes] = React.useState(false);
  const [isUploadingSound, setIsUploadingSound] = React.useState(false);
  const [savingMemeUrl, setSavingMemeUrl] = React.useState<string | null>(null);

  // Admin
  const [adminSettings, setAdminSettings] = React.useState<AdminSettings | null>(null);
  const [cookiesStatus, setCookiesStatus] = React.useState<CookiesStatus | null>(null);
  const [isSavingRole, setIsSavingRole] = React.useState(false);
  const [isApplyingCookies, setIsApplyingCookies] = React.useState(false);
  const [isReloadingCookies, setIsReloadingCookies] = React.useState(false);

  // Feedback
  const [toasts, setToasts] = React.useState<ToastMessage[]>([]);
  const [confirmState, setConfirmState] = React.useState<ConfirmState | null>(null);

  // Refs for timers, SSE, search abort/cache, audio preview, and progress sync
  const audioRef = React.useRef<HTMLAudioElement | null>(null);
  const sseRef = React.useRef<{ close: () => void } | null>(null);
  const searchAbortRef = React.useRef<AbortController | null>(null);
  const searchCacheRef = React.useRef<Map<number, SearchPageCacheEntry>>(new Map());
  const volumeTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const isAdjustingVolumeRef = React.useRef(false);
  const progressSyncRef = React.useRef<{ baseSec: number; syncedAt: number }>({
    baseSec: 0,
    syncedAt: Date.now(),
  });
  const prevGuildIdRef = React.useRef<string | null>(null);

  const pushToast = React.useCallback((message: string, variant: ToastVariant = 'info') => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setToasts((prev) => [...prev.slice(-4), { id, message, variant }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((item) => item.id !== id));
    }, 4000);
  }, []);

  const dismissToast = React.useCallback((id: string) => {
    setToasts((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const handleThemeToggle = React.useCallback(() => {
    setTheme((prev) => {
      const next: ThemeMode = prev === 'light' ? 'dark' : 'light';
      saveTheme(next);
      return next;
    });
  }, []);

  const handleLocaleChange = React.useCallback((next: Locale) => {
    setLocale(next);
    saveLocale(next);
  }, []);

  const loadCustomSounds = React.useCallback(async () => {
    try {
      const list = await apiClient.listCustomSounds();
      setCustomSounds(list);
    } catch {
      // Ignore transient errors
    }
  }, []);

  const loadPlaylists = React.useCallback(async () => {
    try {
      const list = await apiClient.listPlaylists();
      setPlaylists(list);
    } catch {
      // Ignore transient errors
    }
  }, []);

  const loadMemes = React.useCallback(
    async (query: string, region: MemeRegion) => {
      setIsLoadingMemes(true);
      try {
        const list = await apiClient.listMemes({ query, region });
        setMemes(list);
      } catch (err) {
        setMemes([]);
        pushToast(err instanceof Error ? err.message : t('error.generic'), 'danger');
      } finally {
        setIsLoadingMemes(false);
      }
    },
    [pushToast, t]
  );

  const loadAdminData = React.useCallback(
    async (canManageCookies: boolean) => {
      try {
        const [settingsData, cookiesData] = await Promise.all([
          apiClient.getAdminSettings(),
          canManageCookies ? apiClient.getCookiesStatus().catch(() => null) : Promise.resolve(null),
        ]);
        setAdminSettings(settingsData);
        if (cookiesData) setCookiesStatus(cookiesData);
      } catch (err) {
        pushToast(err instanceof Error ? err.message : t('error.generic'), 'danger');
      }
    },
    [pushToast, t]
  );

  const applyDashboardState = React.useCallback(
    (next: DashboardState) => {
      const prevGuildId = prevGuildIdRef.current;
      prevGuildIdRef.current = next.guildId;
      setState(next);

      if (!next.user.inGuild || !next.user.hasAccess) {
        setView('denied');
        return;
      }

      setView('app');

      if (!next.user.isAdmin) {
        setActiveTab((tab) => (tab === 'admin' ? 'player' : tab));
      }

      if (next.myWorker) {
        progressSyncRef.current = {
          baseSec: next.myWorker.progressSec || 0,
          syncedAt: Date.now(),
        };
        setProgressSec(next.myWorker.progressSec || 0);

        if (!isAdjustingVolumeRef.current) {
          setLocalVolume(next.myWorker.volume ?? 80);
        }

        setEmptyLeaveSec(
          next.myWorker.emptyLeaveAt
            ? Math.max(0, Math.ceil((next.myWorker.emptyLeaveAt - Date.now()) / 1000))
            : null
        );
        setIdleLeaveSec(
          next.myWorker.idleLeaveAt
            ? Math.max(0, Math.ceil((next.myWorker.idleLeaveAt - Date.now()) / 1000))
            : null
        );
      } else {
        setProgressSec(0);
        setEmptyLeaveSec(null);
        setIdleLeaveSec(null);
      }

      if (prevGuildId && prevGuildId !== next.guildId) {
        loadCustomSounds();
        if (next.user.isAdmin) {
          loadAdminData(next.user.canManageCookies);
        }
      }
    },
    [loadAdminData, loadCustomSounds]
  );

  const connectSession = React.useCallback(async () => {
    const initialState = await apiClient.getState();
    applyDashboardState(initialState);

    sseRef.current?.close();
    sseRef.current = apiClient.subscribeEvents({
      onState: applyDashboardState,
      onSounds: loadCustomSounds,
      onPlaylists: loadPlaylists,
    });

    loadCustomSounds();
    loadPlaylists();
    loadMemes('', 'ru');
    if (initialState.user.isAdmin) {
      loadAdminData(initialState.user.canManageCookies);
    }
  }, [applyDashboardState, loadAdminData, loadCustomSounds, loadMemes, loadPlaylists]);

  // Initial bootstrap
  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const errParam = params.get('authError');
    if (errParam) {
      setAuthErrorCode(AUTH_ERROR_MAP[errParam] ?? 'auth.error.generic');
      window.history.replaceState({}, '', '/');
    }

    let cancelled = false;
    (async () => {
      try {
        const info = await apiClient.getAuthInfo();
        if (cancelled) return;
        setAuthInfo(info);

        if (!info.authenticated) {
          setView('login');
          return;
        }

        await connectSession();
      } catch {
        if (!cancelled) setView('login');
      }
    })();

    return () => {
      cancelled = true;
      sseRef.current?.close();
      sseRef.current = null;
      searchAbortRef.current?.abort();
    };
  }, [connectSession]);

  // Watch Together presence sync (reports active while on "watch" tab in a voice channel)
  const isWatchPresenceActive =
    view === 'app' && activeTab === 'watch' && Boolean(state?.voice.inVoice);

  React.useEffect(() => {
    if (!isWatchPresenceActive) {
      return;
    }

    void apiClient.setWatchPresence(true).catch(() => {});

    return () => {
      void apiClient.setWatchPresence(false).catch(() => {});
    };
  }, [isWatchPresenceActive, state?.voice.channelId, state?.guildId]);

  // Local 1-second tick for track progress and auto-leave countdowns
  React.useEffect(() => {
    const timer = setInterval(() => {
      const worker = state?.myWorker;
      if (!worker) return;

      if (worker.currentTrack) {
        const total = worker.currentTrack.durationSec || 0;
        let current = progressSyncRef.current.baseSec;
        if (!worker.isPaused && !worker.activeSfxName) {
          current += Math.floor((Date.now() - progressSyncRef.current.syncedAt) / 1000);
        }
        if (total > 0) current = Math.min(current, total);
        setProgressSec(current);
      }

      if (worker.emptyLeaveAt) {
        setEmptyLeaveSec(Math.max(0, Math.ceil((worker.emptyLeaveAt - Date.now()) / 1000)));
      } else {
        setEmptyLeaveSec(null);
      }

      if (worker.idleLeaveAt) {
        setIdleLeaveSec(Math.max(0, Math.ceil((worker.idleLeaveAt - Date.now()) / 1000)));
      } else {
        setIdleLeaveSec(null);
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [state?.myWorker]);

  // Progressive search page loader
  const loadSearchPage = React.useCallback(
    async (query: string, targetPlatform: PlatformOption, page: number) => {
      searchAbortRef.current?.abort();
      setSearchPage(page);

      const cached = searchCacheRef.current.get(page);
      if (cached) {
        setSearchResults(cached.items);
        setSearchHasNextPage(cached.hasNextPage);
        setIsSearchingPage(false);
        return;
      }

      const controller = new AbortController();
      searchAbortRef.current = controller;
      setSearchResults([]);
      setSearchHasNextPage(false);
      setIsSearchingPage(true);

      const collected: SearchResultItem[] = [];

      try {
        await apiClient.searchTracks(
          query,
          targetPlatform,
          page,
          {
            onItem: (item) => {
              if (controller.signal.aborted) return;
              collected.push(item);
              setSearchResults([...collected]);
            },
            onComplete: (hasNextPage) => {
              if (controller.signal.aborted) return;
              searchCacheRef.current.set(page, { items: [...collected], hasNextPage });
              setSearchHasNextPage(hasNextPage);
              setIsSearchingPage(false);
            },
          },
          controller.signal
        );
      } catch (err) {
        if (!controller.signal.aborted) {
          setIsSearchingPage(false);
          pushToast(err instanceof Error ? err.message : t('error.generic'), 'danger');
        }
      }
    },
    [pushToast, t]
  );

  const handleCloseSearch = React.useCallback(() => {
    searchAbortRef.current?.abort();
    setSearchOpen(false);
    setIsSearchingPage(false);
  }, []);

  const handleSearchSubmit = () => {
    const trimmed = searchQuery.trim();
    if (!trimmed) return;
    searchCacheRef.current.clear();
    setAddedResultIds(new Set());
    setActiveSearchQuery(trimmed);
    setSearchOpen(true);
    void loadSearchPage(trimmed, platform, 1);
  };

  const handlePlatformChange = (nextPlatform: PlatformOption) => {
    setPlatform(nextPlatform);
    if (searchOpen && activeSearchQuery) {
      searchCacheRef.current.clear();
      setAddedResultIds(new Set());
      void loadSearchPage(activeSearchQuery, nextPlatform, 1);
    }
  };

  const handlePrevSearchPage = () => {
    if (searchPage <= 1 || !activeSearchQuery) return;
    void loadSearchPage(activeSearchQuery, platform, searchPage - 1);
  };

  const handleNextSearchPage = () => {
    if (!searchHasNextPage || !activeSearchQuery) return;
    void loadSearchPage(activeSearchQuery, platform, searchPage + 1);
  };

  const handleAddSearchResult = async (result: SearchResultItem) => {
    setAddingResultId(result.id);
    try {
      const targetQuery = result.url ? result.url : `${result.author} - ${result.title}`;
      const res = await apiClient.playTrack(targetQuery, result.source);
      setAddedResultIds((prev) => {
        const next = new Set(prev);
        next.add(result.id);
        return next;
      });
      if (res.addedCount > 1) {
        pushToast(t('player.toastPlaylistAdded', { count: res.addedCount }), 'success');
      } else if (res.isPlayingNow) {
        pushToast(t('player.toastPlayingNow', { title: res.track.title }), 'success');
      } else {
        pushToast(t('player.toastQueued', { title: res.track.title }), 'success');
      }
    } catch (err) {
      pushToast(err instanceof Error ? err.message : t('error.generic'), 'danger');
    } finally {
      setAddingResultId(null);
    }
  };

  const handleDirectUrlSubmit = async () => {
    const trimmed = searchQuery.trim();
    if (!trimmed) return;
    handleCloseSearch();
    setIsSubmittingDirect(true);
    try {
      const res = await apiClient.playTrack(trimmed, platform);
      setSearchQuery('');
      if (res.addedCount > 1) {
        pushToast(t('player.toastPlaylistAdded', { count: res.addedCount }), 'success');
      } else if (res.isPlayingNow) {
        pushToast(t('player.toastPlayingNow', { title: res.track.title }), 'success');
      } else {
        pushToast(t('player.toastQueued', { title: res.track.title }), 'success');
      }
    } catch (err) {
      pushToast(err instanceof Error ? err.message : t('error.generic'), 'danger');
    } finally {
      setIsSubmittingDirect(false);
    }
  };

  // Auth & Voice handlers
  const handleDiscordLogin = async () => {
    await apiClient.signInWithDiscord();
    if (isStandaloneMode) {
      setView('loading');
      await connectSession();
    }
  };

  const handleLogout = async () => {
    await apiClient.logout().catch(() => {});
    sseRef.current?.close();
    sseRef.current = null;
    if (isStandaloneMode) {
      setState(null);
      setView('login');
    } else {
      window.location.reload();
    }
  };

  const handleSelectGuild = async (guildId: string) => {
    handleCloseSearch();
    try {
      const next = await apiClient.selectGuild(guildId);
      applyDashboardState(next);
    } catch (err) {
      pushToast(err instanceof Error ? err.message : t('error.generic'), 'danger');
    }
  };

  const handleSummonWorker = async () => {
    try {
      await apiClient.summonWorker();
      pushToast(t('voice.summonSuccess'), 'success');
    } catch (err) {
      pushToast(err instanceof Error ? err.message : t('error.generic'), 'danger');
    }
  };

  // Playback handlers
  const handleTogglePause = async () => {
    if (!state?.myWorker) return;
    try {
      if (state.myWorker.isPaused) {
        await apiClient.resume();
      } else {
        await apiClient.pause();
      }
    } catch (err) {
      pushToast(err instanceof Error ? err.message : t('error.generic'), 'danger');
    }
  };

  const handleSkip = async () => {
    try {
      await apiClient.skip(1);
    } catch (err) {
      pushToast(err instanceof Error ? err.message : t('error.generic'), 'danger');
    }
  };

  const handleShuffle = async () => {
    try {
      await apiClient.shuffle();
      pushToast(t('player.toastShuffled'), 'success');
    } catch (err) {
      pushToast(err instanceof Error ? err.message : t('error.generic'), 'danger');
    }
  };

  const handleCycleLoop = async () => {
    if (!state?.myWorker) return;
    const cycle: Record<LoopMode, LoopMode> = {
      off: 'track',
      track: 'queue',
      queue: 'off',
    };
    const nextMode = cycle[state.myWorker.loopMode] ?? 'off';
    try {
      await apiClient.setLoop(nextMode);
    } catch (err) {
      pushToast(err instanceof Error ? err.message : t('error.generic'), 'danger');
    }
  };

  const handleStop = async () => {
    try {
      await apiClient.stop();
      pushToast(t('player.toastStopped'), 'info');
    } catch (err) {
      pushToast(err instanceof Error ? err.message : t('error.generic'), 'danger');
    }
  };

  const handleVolumeChange = (nextVolume: number) => {
    setLocalVolume(nextVolume);
    isAdjustingVolumeRef.current = true;
    if (volumeTimerRef.current) clearTimeout(volumeTimerRef.current);
    volumeTimerRef.current = setTimeout(async () => {
      try {
        await apiClient.setVolume(nextVolume);
      } catch (err) {
        pushToast(err instanceof Error ? err.message : t('error.generic'), 'danger');
      } finally {
        isAdjustingVolumeRef.current = false;
      }
    }, 120);
  };

  const handleMoveTrack = async (fromIndex: number, toIndex: number) => {
    try {
      await apiClient.moveQueueItem(fromIndex, toIndex);
    } catch (err) {
      pushToast(err instanceof Error ? err.message : t('error.generic'), 'danger');
    }
  };

  const handleRemoveTrack = async (index: number) => {
    try {
      await apiClient.removeQueueItem(index);
    } catch (err) {
      pushToast(err instanceof Error ? err.message : t('error.generic'), 'danger');
    }
  };

  const handleClearQueue = async () => {
    try {
      await apiClient.clearQueue();
      pushToast(t('queue.toastCleared'), 'info');
    } catch (err) {
      pushToast(err instanceof Error ? err.message : t('error.generic'), 'danger');
    }
  };

  // Playlist handlers
  const handleSavePlaylist = async (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) {
      pushToast(t('playlists.toastEmptyName'), 'danger');
      return;
    }
    setIsSavingPlaylist(true);
    try {
      const res = await apiClient.savePlaylist(trimmed);
      pushToast(
        res.overwritten
          ? t('playlists.toastUpdated', {
              name: res.playlist.name,
              count: res.playlist.trackCount,
            })
          : t('playlists.toastSaved', {
              name: res.playlist.name,
              count: res.playlist.trackCount,
            }),
        'success'
      );
      await loadPlaylists();
    } catch (err) {
      pushToast(err instanceof Error ? err.message : t('error.generic'), 'danger');
    } finally {
      setIsSavingPlaylist(false);
    }
  };

  const executeLoadPlaylist = async (playlist: UserPlaylist) => {
    setLoadingPlaylistId(playlist.id);
    try {
      const res = await apiClient.loadPlaylist(playlist.id);
      pushToast(
        t('playlists.toastLoaded', {
          name: res.playlistName,
          count: res.loadedCount,
        }),
        'success'
      );
    } catch (err) {
      pushToast(err instanceof Error ? err.message : t('error.generic'), 'danger');
    } finally {
      setLoadingPlaylistId(null);
    }
  };

  const handleLoadPlaylist = (playlist: UserPlaylist) => {
    void executeLoadPlaylist(playlist);
  };

  const handleDeletePlaylist = (playlist: UserPlaylist) => {
    setConfirmState({
      title: t('playlists.confirmDeleteTitle'),
      description: t('playlists.confirmDeleteMessage', { name: playlist.name }),
      destructive: true,
      onConfirm: async () => {
        try {
          await apiClient.deletePlaylist(playlist.id);
          setExpandedPlaylists((prev) => {
            const copy = new Set(prev);
            copy.delete(playlist.id);
            return copy;
          });
          pushToast(t('playlists.toastDeleted', { name: playlist.name }), 'info');
          await loadPlaylists();
        } catch (err) {
          pushToast(err instanceof Error ? err.message : t('error.generic'), 'danger');
        }
      },
    });
  };

  const handleTogglePlaylistExpand = (id: number) => {
    setExpandedPlaylists((prev) => {
      const copy = new Set(prev);
      if (copy.has(id)) copy.delete(id);
      else copy.add(id);
      return copy;
    });
  };

  // Soundboard handlers
  const playPreviewUrl = (rawUrl: string) => {
    const safe = safeHttpUrl(rawUrl, true);
    if (!safe || !audioRef.current) return;
    audioRef.current.pause();
    audioRef.current.src = safe;
    audioRef.current.volume = 0.7;
    audioRef.current.play().catch(() => {});
  };

  const handleUploadSound = async ({ name, color, file }: SoundUploadPayload) => {
    if (file.size > 10 * 1024 * 1024) {
      pushToast(t('soundboard.toastTooLarge'), 'danger');
      return;
    }

    setIsUploadingSound(true);
    try {
      const dataBase64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      await apiClient.uploadCustomSound({
        name,
        color,
        filename: file.name,
        mimeType: file.type,
        dataBase64,
      });

      pushToast(t('soundboard.toastUploaded', { name }), 'success');
      await loadCustomSounds();
    } catch (err) {
      pushToast(err instanceof Error ? err.message : t('error.generic'), 'danger');
    } finally {
      setIsUploadingSound(false);
    }
  };

  const handlePlayCustomSound = async (sound: CustomSound) => {
    try {
      const res = await apiClient.playCustomSound(sound.id);
      pushToast(t('soundboard.toastPlayed', { name: res.played }), 'success');
    } catch (err) {
      pushToast(err instanceof Error ? err.message : t('error.generic'), 'danger');
    }
  };

  const handleDeleteCustomSound = (sound: CustomSound) => {
    setConfirmState({
      title: t('soundboard.confirmDeleteTitle'),
      description: t('soundboard.confirmDeleteMessage', { name: sound.name }),
      destructive: true,
      onConfirm: async () => {
        try {
          await apiClient.deleteCustomSound(sound.id);
          pushToast(t('soundboard.toastDeleted'), 'info');
          await loadCustomSounds();
        } catch (err) {
          pushToast(err instanceof Error ? err.message : t('error.generic'), 'danger');
        }
      },
    });
  };

  const handleSearchMemes = (query: string) => {
    void loadMemes(query, memeRegion);
  };

  const handleSelectMemeRegion = (region: MemeRegion) => {
    setMemeRegion(region);
    void loadMemes('', region);
  };

  const handlePlayMeme = async (meme: MemeSound) => {
    try {
      await apiClient.playMeme(meme.url, meme.name);
      pushToast(t('soundboard.toastPlayed', { name: meme.name }), 'success');
    } catch (err) {
      pushToast(err instanceof Error ? err.message : t('error.generic'), 'danger');
    }
  };

  const handleSaveMeme = async (meme: MemeSound) => {
    setSavingMemeUrl(meme.url);
    try {
      await apiClient.saveMeme(meme);
      pushToast(t('soundboard.toastMemeSaved', { name: meme.name }), 'success');
      await loadCustomSounds();
    } catch (err) {
      pushToast(err instanceof Error ? err.message : t('error.generic'), 'danger');
    } finally {
      setSavingMemeUrl(null);
    }
  };

  // Tab & Admin handlers
  const handleTabChange = (nextTab: string) => {
    const tab = nextTab as AppTab;
    if (tab === 'admin' && !state?.user.isAdmin) return;
    handleCloseSearch();
    setActiveTab(tab);
    if (tab === 'admin' && state?.user.isAdmin) {
      void loadAdminData(state.user.canManageCookies);
    }
    if (tab === 'playlists') {
      void loadPlaylists();
    }
  };

  const handleSaveAccessSettings = async (payload: {
    requiredRoleId: string | null;
    allowedChannelId: string | null;
  }) => {
    setIsSavingRole(true);
    try {
      await apiClient.saveAdminSettings(payload);
      setAdminSettings((prev) =>
        prev
          ? {
              ...prev,
              requiredRoleId: payload.requiredRoleId,
              allowedChannelId: payload.allowedChannelId,
            }
          : prev
      );
      pushToast(t('admin.toastSaved'), 'success');
    } catch (err) {
      pushToast(err instanceof Error ? err.message : t('error.generic'), 'danger');
    } finally {
      setIsSavingRole(false);
    }
  };

  const handleApplyCookies = async (content: string): Promise<boolean> => {
    if (!content) {
      pushToast(t('admin.cookiesToastEmpty'), 'danger');
      return false;
    }
    setIsApplyingCookies(true);
    try {
      const res = await apiClient.updateCookies(content);
      setCookiesStatus(res.status);
      pushToast(t('admin.cookiesToastApplied'), 'success');
      return true;
    } catch (err) {
      pushToast(err instanceof Error ? err.message : t('error.generic'), 'danger');
      return false;
    } finally {
      setIsApplyingCookies(false);
    }
  };

  const handleReloadCookies = async () => {
    setIsReloadingCookies(true);
    try {
      const res = await apiClient.reloadCookies();
      setCookiesStatus(res.status);
      pushToast(t('admin.cookiesToastReloaded'), 'success');
    } catch (err) {
      pushToast(err instanceof Error ? err.message : t('error.generic'), 'danger');
    } finally {
      setIsReloadingCookies(false);
    }
  };

  const handleClearCookies = () => {
    setConfirmState({
      title: t('admin.cookiesConfirmClearTitle'),
      description: t('admin.cookiesConfirmClearMessage'),
      destructive: true,
      onConfirm: async () => {
        try {
          const res = await apiClient.clearCookies();
          setCookiesStatus(res.status);
          pushToast(t('admin.cookiesToastCleared'), 'info');
        } catch (err) {
          pushToast(err instanceof Error ? err.message : t('error.generic'), 'danger');
        }
      },
    });
  };

  // Render auth / loading states
  if (view === 'loading') {
    return (
      <AuthShell
        theme={theme}
        locale={locale}
        t={t}
        onThemeToggle={handleThemeToggle}
        onLocaleChange={handleLocaleChange}
      >
        <LoadingView t={t} />
      </AuthShell>
    );
  }

  if (view === 'login') {
    return (
      <AuthShell
        theme={theme}
        locale={locale}
        t={t}
        onThemeToggle={handleThemeToggle}
        onLocaleChange={handleLocaleChange}
      >
        <LoginView
          oauthEnabled={authInfo.oauthEnabled}
          prefix={authInfo.prefix}
          errorMessage={authErrorCode ? t(authErrorCode) : null}
          t={t}
          onDiscordLogin={handleDiscordLogin}
        />
      </AuthShell>
    );
  }

  if (view === 'denied' && state) {
    const reason = !state.user.inGuild
      ? t('denied.notInGuild')
      : t('denied.missingRole', {
          guild: state.guildName,
          role: state.user.requiredRoleName || state.user.requiredRoleId || '',
        });

    return (
      <AuthShell
        theme={theme}
        locale={locale}
        t={t}
        onThemeToggle={handleThemeToggle}
        onLocaleChange={handleLocaleChange}
      >
        <AccessDeniedView reason={reason} t={t} onLogout={handleLogout} />
      </AuthShell>
    );
  }

  if (!state) return null;

  const inVoice = Boolean(state.voice.inVoice);
  const worker = state.myWorker;
  const queue = worker?.queue ?? [];
  const hasAnyTrack = Boolean(worker && (worker.currentTrack || queue.length > 0));
  const busyAgentsCount = Math.max(0, state.pool.totalCount - state.pool.availableCount);

  return (
    <div className="flex min-h-screen flex-col bg-canvas text-fg-primary">
      <TopBar
        guildId={state.guildId}
        guildName={state.guildName}
        guilds={state.guilds}
        user={state.user}
        voice={state.voice}
        worker={worker}
        availableWorkersCount={state.pool.availableCount}
        theme={theme}
        locale={locale}
        t={t}
        onSelectGuild={handleSelectGuild}
        onSummonWorker={handleSummonWorker}
        onThemeToggle={handleThemeToggle}
        onLocaleChange={handleLocaleChange}
        onLogout={handleLogout}
      />

      <Tabs value={activeTab} onValueChange={handleTabChange} className="flex flex-1 flex-col">
        <NavTabs
          playlistsCount={playlists.length}
          busyAgentsCount={busyAgentsCount}
          totalAgentsCount={state.pool.totalCount}
          watchViewersCount={state.watchViewers?.length ?? 0}
          isAdmin={state.user.isAdmin}
          t={t}
        />

        <main className="mx-auto w-full max-w-7xl flex-1 space-y-4 px-4 py-5 sm:px-6">
          {!inVoice && (
            <Alert variant="warning" icon="volume-x">
              {t('voice.lockBanner')}
            </Alert>
          )}

          <TabsContent value="player" className="space-y-4">
            <TrackSearchBar
              query={searchQuery}
              platform={platform}
              disabled={!inVoice}
              isSubmittingDirect={isSubmittingDirect}
              searchOpen={searchOpen}
              activeSearchQuery={activeSearchQuery}
              searchResults={searchResults}
              searchPage={searchPage}
              hasPrevPage={searchPage > 1}
              hasNextPage={searchHasNextPage}
              isSearching={isSearchingPage}
              addingResultId={addingResultId}
              addedResultIds={addedResultIds}
              t={t}
              onQueryChange={setSearchQuery}
              onPlatformChange={handlePlatformChange}
              onSearchSubmit={handleSearchSubmit}
              onDirectUrlSubmit={handleDirectUrlSubmit}
              onAddSearchResult={handleAddSearchResult}
              onPrevSearchPage={handlePrevSearchPage}
              onNextSearchPage={handleNextSearchPage}
              onCloseSearch={handleCloseSearch}
            />

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_1.15fr] lg:items-start">
              <NowPlayingCard
                inVoice={inVoice}
                worker={worker}
                currentProgressSec={progressSec}
                volume={localVolume}
                emptyLeaveRemainSec={emptyLeaveSec}
                idleLeaveRemainSec={idleLeaveSec}
                t={t}
                onTogglePause={handleTogglePause}
                onSkip={handleSkip}
                onShuffle={handleShuffle}
                onCycleLoop={handleCycleLoop}
                onStop={handleStop}
                onVolumeChange={handleVolumeChange}
              />

              <QueueCard
                tracks={queue}
                canControl={inVoice && worker !== null}
                canSavePlaylist={inVoice && hasAnyTrack}
                isSavingPlaylist={isSavingPlaylist}
                t={t}
                onMoveTrack={handleMoveTrack}
                onRemoveTrack={handleRemoveTrack}
                onClearQueue={handleClearQueue}
                onSavePlaylist={handleSavePlaylist}
              />
            </div>
          </TabsContent>

          <TabsContent value="watch">
            <WatchTogetherSection
              inVoice={inVoice}
              channelName={state.voice.channelName}
              worker={worker}
              currentProgressSec={progressSec}
              viewers={state.watchViewers ?? []}
              t={t}
            />
          </TabsContent>

          <TabsContent value="playlists">
            <PlaylistsSection
              playlists={playlists}
              inVoice={inVoice}
              canSaveQueue={inVoice && hasAnyTrack}
              isSaving={isSavingPlaylist}
              loadingPlaylistId={loadingPlaylistId}
              expandedIds={expandedPlaylists}
              locale={locale}
              t={t}
              onSaveQueue={handleSavePlaylist}
              onLoadPlaylist={handleLoadPlaylist}
              onDeletePlaylist={handleDeletePlaylist}
              onToggleExpand={handleTogglePlaylistExpand}
            />
          </TabsContent>

          <TabsContent value="soundboard">
            <SoundboardSection
              activeSubTab={soundboardTab}
              inVoice={inVoice}
              customSounds={customSounds}
              memes={memes}
              memeRegion={memeRegion}
              isLoadingMemes={isLoadingMemes}
              isUploading={isUploadingSound}
              savingMemeUrl={savingMemeUrl}
              t={t}
              onSubTabChange={setSoundboardTab}
              onUploadSound={handleUploadSound}
              onPlayCustomSound={handlePlayCustomSound}
              onPreviewCustomSound={(s) => playPreviewUrl(`/api/soundboard/file/${s.id}`)}
              onDeleteCustomSound={handleDeleteCustomSound}
              onSearchMemes={handleSearchMemes}
              onSelectMemeRegion={handleSelectMemeRegion}
              onPlayMeme={handlePlayMeme}
              onPreviewMeme={(m) => playPreviewUrl(m.url)}
              onSaveMeme={handleSaveMeme}
            />
          </TabsContent>

          <TabsContent value="agents">
            <AgentsSection pool={state.pool} activeGuildId={state.guildId} t={t} />
          </TabsContent>

          {state.user.isAdmin && (
            <TabsContent value="admin">
              <AdminSection
                activeSection={activeAdminSection}
                settings={adminSettings}
                canManageCookies={state.user.canManageCookies}
                cookiesStatus={cookiesStatus}
                isSavingAccess={isSavingRole}
                isApplyingCookies={isApplyingCookies}
                isReloadingCookies={isReloadingCookies}
                locale={locale}
                t={t}
                onSelectSection={setActiveAdminSection}
                onSaveAccessSettings={handleSaveAccessSettings}
                onApplyCookies={handleApplyCookies}
                onReloadCookies={handleReloadCookies}
                onClearCookies={handleClearCookies}
                onCookiesFileError={(code) => {
                  pushToast(
                    t(
                      code === 'too_large'
                        ? 'admin.cookiesToastTooLarge'
                        : 'admin.cookiesToastReadError'
                    ),
                    'danger'
                  );
                }}
                onCookiesFileLoaded={() => {
                  pushToast(t('admin.cookiesToastFileLoaded'), 'info');
                }}
              />
            </TabsContent>
          )}
        </main>
      </Tabs>

      <ToastViewport toasts={toasts} onDismiss={dismissToast} />

      <ConfirmDialog
        open={confirmState !== null}
        title={confirmState?.title ?? ''}
        description={confirmState?.description ?? ''}
        confirmLabel={t('dialog.confirm')}
        cancelLabel={t('dialog.cancel')}
        destructive={confirmState?.destructive}
        onCancel={() => setConfirmState(null)}
        onConfirm={() => {
          const action = confirmState?.onConfirm;
          setConfirmState(null);
          if (action) void action();
        }}
      />

      <audio ref={audioRef} preload="none" />
    </div>
  );
}
