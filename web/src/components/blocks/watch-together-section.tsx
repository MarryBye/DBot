import * as React from 'react';
import type { TranslateFn } from '@/i18n';
import type { ActiveWorkerState, VoiceMemberInfo } from '@/types/api';
import { extractAccentColor, getDeterministicAccentColor } from '@/utils/color';
import { extractYouTubeVideoId, formatDuration, safeHttpUrl } from '@/utils/format';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Icon } from '@/components/ui/icon';
import { PlatformBadge } from '@/components/ui/platform-badge';
import { Progress } from '@/components/ui/progress';
import { SectionHeader } from '@/components/ui/section-header';
import { UserChip } from '@/components/ui/user-chip';
import { VinylDisc } from '@/components/ui/vinyl-disc';

const YOUTUBE_EMBED_ORIGIN = 'https://www.youtube-nocookie.com';

export interface WatchTogetherSectionProps {
  inVoice: boolean;
  channelName: string | null;
  worker: ActiveWorkerState | null;
  currentProgressSec: number;
  viewers: VoiceMemberInfo[];
  t: TranslateFn;
}

export function WatchTogetherSection({
  inVoice,
  channelName,
  worker,
  currentProgressSec,
  viewers,
  t,
}: WatchTogetherSectionProps) {
  const track = worker?.currentTrack ?? null;
  const videoId = React.useMemo(() => {
    if (!track || track.source !== 'youtube' || track.mediaKind === 'music') {
      return null;
    }
    return extractYouTubeVideoId(track.originalUrl || track.url, track.id);
  }, [track]);

  const isVideoMode = videoId !== null;
  const [isWatchingVideo, setIsWatchingVideo] = React.useState(false);
  const [embedStartSec, setEmbedStartSec] = React.useState(0);
  const [embedRevision, setEmbedRevision] = React.useState(0);
  const [accentColor, setAccentColor] = React.useState<string>('#0067b8');

  const iframeRef = React.useRef<HTMLIFrameElement | null>(null);
  const lastVideoIdRef = React.useRef<string | null>(null);

  // При смене видео-трека обновляем стартовый таймкод, если человек уже смотрит
  React.useEffect(() => {
    if (videoId && videoId !== lastVideoIdRef.current) {
      lastVideoIdRef.current = videoId;
      if (isWatchingVideo) {
        setEmbedStartSec(Math.max(0, Math.floor(currentProgressSec)));
        setEmbedRevision((r) => r + 1);
      }
    }
    if (!videoId) {
      lastVideoIdRef.current = null;
      setIsWatchingVideo(false);
    }
  }, [videoId, isWatchingVideo, currentProgressSec]);

  // Синхронизация паузы / возобновления через YouTube postMessage API без сторонних скриптов
  React.useEffect(() => {
    if (!isWatchingVideo || !iframeRef.current?.contentWindow) return;
    const func = worker?.isPaused ? 'pauseVideo' : 'playVideo';
    iframeRef.current.contentWindow.postMessage(
      JSON.stringify({ event: 'command', func, args: [] }),
      YOUTUBE_EMBED_ORIGIN
    );
  }, [worker?.isPaused, isWatchingVideo]);

  // Извлечение основного цвета превью для режима музыки (диск)
  React.useEffect(() => {
    if (!track || isVideoMode) return;
    const seed = `${track.id}:${track.title}`;
    setAccentColor(getDeterministicAccentColor(seed));
    let cancelled = false;
    void extractAccentColor(track.thumbnail, seed).then((color) => {
      if (!cancelled) setAccentColor(color);
    });
    return () => {
      cancelled = true;
    };
  }, [track, isVideoMode]);

  const handleStartWatching = () => {
    setEmbedStartSec(Math.max(0, Math.floor(currentProgressSec)));
    setEmbedRevision((r) => r + 1);
    setIsWatchingVideo(true);
  };

  const handleSyncVideo = () => {
    const targetSec = Math.max(0, Math.floor(currentProgressSec));
    if (iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.postMessage(
        JSON.stringify({ event: 'command', func: 'seekTo', args: [targetSec, true] }),
        YOUTUBE_EMBED_ORIGIN
      );
      if (!worker?.isPaused) {
        iframeRef.current.contentWindow.postMessage(
          JSON.stringify({ event: 'command', func: 'playVideo', args: [] }),
          YOUTUBE_EMBED_ORIGIN
        );
      }
    } else {
      setEmbedStartSec(targetSec);
      setEmbedRevision((r) => r + 1);
    }
  };

  const totalSec = track?.durationSec || 0;
  const progressPct = totalSec > 0 ? Math.min(100, (currentProgressSec / totalSec) * 100) : 0;
  const safeThumb = safeHttpUrl(track?.thumbnail);
  const safeLink = safeHttpUrl(track?.originalUrl);

  const embedSrc =
    videoId && isWatchingVideo
      ? `${YOUTUBE_EMBED_ORIGIN}/embed/${videoId}?start=${embedStartSec}&autoplay=1&mute=1&rel=0&enablejsapi=1`
      : null;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_290px] lg:items-start">
      {/* Main Watch Stage */}
      <Card>
        <CardHeader className="border-b border-border pb-3">
          <SectionHeader
            title={t('watch.title')}
            actions={
              track ? (
                <Badge variant={isVideoMode ? 'accent' : 'default'}>
                  <Icon name={isVideoMode ? 'video' : 'disc'} size="xs" />
                  <span>
                    {isVideoMode ? t('watch.videoModeBadge') : t('watch.musicModeBadge')}
                  </span>
                </Badge>
              ) : undefined
            }
          />
        </CardHeader>

        <CardContent className="pt-4">
          {!inVoice ? (
            <EmptyState
              icon="volume-x"
              title={t('watch.emptyVoiceTitle')}
              description={t('watch.emptyVoiceDescription')}
            />
          ) : !track ? (
            <EmptyState
              icon="tv"
              title={t('watch.emptyTrackTitle')}
              description={t('watch.emptyTrackDescription')}
            />
          ) : isVideoMode ? (
            <div className="space-y-4">
              {/* Video Player Frame or Start Gate */}
              {embedSrc ? (
                <div className="aspect-video w-full overflow-hidden rounded-[2px] border border-border bg-black">
                  <iframe
                    key={`${videoId}-${embedRevision}`}
                    ref={iframeRef}
                    src={embedSrc}
                    title={track.title}
                    className="h-full w-full border-0"
                    sandbox="allow-scripts allow-same-origin allow-presentation"
                    referrerPolicy="strict-origin-when-cross-origin"
                    allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
                    allowFullScreen
                  />
                </div>
              ) : (
                <div className="relative flex aspect-video w-full flex-col items-center justify-center overflow-hidden rounded-[2px] border border-border bg-subtle p-6 text-center">
                  {safeThumb && (
                    <img
                      src={safeThumb}
                      alt=""
                      className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-20"
                    />
                  )}
                  <div className="relative z-10 flex max-w-md flex-col items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-[2px] bg-accent text-fg-on-accent">
                      <Icon name="play" size="lg" />
                    </div>
                    <div className="space-y-1">
                      <p className="line-clamp-2 text-base font-semibold text-fg-primary">
                        {track.title}
                      </p>
                      <p className="text-xs text-fg-secondary">{t('watch.audioHint')}</p>
                    </div>
                    <Button variant="primary" size="lg" onClick={handleStartWatching}>
                      <Icon name="eye" size="sm" />
                      <span>{t('watch.startButton')}</span>
                    </Button>
                  </div>
                </div>
              )}

              {/* Video Meta & Sync Controls (No bot playback control) */}
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <PlatformBadge source={track.source} />
                    {worker?.isPaused && (
                      <Badge variant="warning">{t('agents.pausedBadge')}</Badge>
                    )}
                  </div>
                  <div className="min-w-0 text-base font-semibold text-fg-primary">
                    {safeLink ? (
                      <a
                        href={safeLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={track.title || track.originalUrl}
                        className="flex w-full min-w-0 items-center gap-1.5 hover:text-accent hover:underline"
                      >
                        <span className="min-w-0 truncate">{track.title || track.originalUrl}</span>
                        <Icon name="external-link" size="xs" className="text-fg-muted" />
                      </a>
                    ) : (
                      <span className="block truncate">{track.title || track.originalUrl}</span>
                    )}
                  </div>
                  {track.author && (
                    <div className="truncate text-sm text-fg-secondary">{track.author}</div>
                  )}
                </div>

                {isWatchingVideo && (
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    <Button variant="secondary" size="sm" onClick={handleSyncVideo}>
                      <Icon name="refresh-cw" size="xs" />
                      <span>{t('watch.syncButton')}</span>
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setIsWatchingVideo(false)}
                    >
                      <Icon name="eye-off" size="xs" />
                      <span>{t('watch.hideButton')}</span>
                    </Button>
                  </div>
                )}
              </div>

              <div className="space-y-1.5">
                <Progress value={progressPct} />
                <div className="flex items-center justify-between text-xs tabular-nums text-fg-muted">
                  <span>{formatDuration(currentProgressSec)}</span>
                  <span>{track.durationFormatted || formatDuration(totalSec)}</span>
                </div>
              </div>
            </div>
          ) : (
            /* Music Visualizer Mode: Spinning Vinyl Disc + Track Info (Read-Only) */
            <div className="flex flex-col items-center gap-6 py-6 sm:flex-row sm:items-center sm:px-4">
              <VinylDisc
                thumbnailUrl={track.thumbnail}
                accentColor={accentColor}
                isPlaying={!worker?.isPaused}
                alt={track.title}
              />

              <div className="w-full min-w-0 flex-1 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <PlatformBadge source={track.source} />
                  {worker?.isPaused && (
                    <Badge variant="warning">{t('agents.pausedBadge')}</Badge>
                  )}
                </div>

                <div className="space-y-1">
                  <div className="min-w-0 text-lg font-semibold leading-snug text-fg-primary">
                    {safeLink ? (
                      <a
                        href={safeLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={track.title || track.originalUrl}
                        className="flex w-full min-w-0 items-center gap-1.5 hover:text-accent hover:underline"
                      >
                        <span className="min-w-0 truncate">{track.title || track.originalUrl}</span>
                        <Icon name="external-link" size="xs" className="text-fg-muted" />
                      </a>
                    ) : (
                      <span className="block truncate">{track.title || track.originalUrl}</span>
                    )}
                  </div>
                  {track.author && (
                    <div className="truncate text-sm text-fg-secondary">{track.author}</div>
                  )}
                  <div className="text-xs text-fg-muted">
                    {t('player.requestedBy', {
                      user: track.requestedBy?.tag || t('player.unknownUser'),
                    })}
                  </div>
                </div>

                <div className="space-y-1.5 pt-1">
                  <Progress value={progressPct} />
                  <div className="flex items-center justify-between text-xs tabular-nums text-fg-muted">
                    <span>{formatDuration(currentProgressSec)}</span>
                    <span>{track.durationFormatted || formatDuration(totalSec)}</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Side Panel: Watching With You */}
      <Card>
        <CardHeader className="border-b border-border pb-3">
          <SectionHeader
            title={t('watch.viewersTitle')}
            count={viewers.length}
            description={inVoice && channelName ? channelName : undefined}
          />
        </CardHeader>
        <CardContent className="pt-4">
          {viewers.length === 0 ? (
            <p className="py-4 text-center text-xs text-fg-muted">
              {t('watch.viewersEmpty')}
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {viewers.map((viewer) => (
                <UserChip
                  key={viewer.id}
                  displayName={viewer.displayName}
                  avatarUrl={viewer.avatarUrl}
                  className="w-full py-1.5"
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
