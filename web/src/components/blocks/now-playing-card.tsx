import type { TranslateFn } from '@/i18n';
import type { ActiveWorkerState } from '@/types/api';
import { formatDuration, safeHttpUrl } from '@/utils/format';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Icon } from '@/components/ui/icon';
import { PlatformBadge } from '@/components/ui/platform-badge';
import { Progress } from '@/components/ui/progress';
import { SectionHeader } from '@/components/ui/section-header';
import { Separator } from '@/components/ui/separator';
import { Slider } from '@/components/ui/slider';
import { TrackThumbnail } from '@/components/ui/track-thumbnail';

export interface NowPlayingCardProps {
  inVoice: boolean;
  worker: ActiveWorkerState | null;
  currentProgressSec: number;
  volume: number;
  emptyLeaveRemainSec: number | null;
  idleLeaveRemainSec: number | null;
  t: TranslateFn;
  onTogglePause: () => void;
  onSkip: () => void;
  onShuffle: () => void;
  onCycleLoop: () => void;
  onStop: () => void;
  onVolumeChange: (value: number) => void;
}

export function NowPlayingCard({
  inVoice,
  worker,
  currentProgressSec,
  volume,
  emptyLeaveRemainSec,
  idleLeaveRemainSec,
  t,
  onTogglePause,
  onSkip,
  onShuffle,
  onCycleLoop,
  onStop,
  onVolumeChange,
}: NowPlayingCardProps) {
  const track = worker?.currentTrack ?? null;
  const canControl = inVoice && worker !== null;
  const hasTrack = track !== null;
  const safeLink = safeHttpUrl(track?.originalUrl);
  const totalSec = track?.durationSec || 0;
  const progressPct = totalSec > 0 ? Math.min(100, (currentProgressSec / totalSec) * 100) : 0;

  const loopMode = worker?.loopMode ?? 'off';
  const loopLabel =
    loopMode === 'track'
      ? t('player.loopTrack')
      : loopMode === 'queue'
        ? t('player.loopQueue')
        : t('player.loopOff');

  return (
    <Card className="flex flex-col">
      <CardHeader className="border-b border-border pb-3">
        <SectionHeader
          title={t('player.nowPlaying')}
          actions={
            worker ? (
              <Badge variant="accent">
                <Icon name="mic" size="xs" />
                <span>{t('agents.agentLabel', { id: worker.id })}</span>
              </Badge>
            ) : undefined
          }
        />
      </CardHeader>

      <CardContent className="flex flex-1 flex-col gap-4 pt-4">
        {worker?.activeSfxName && (
          <Alert variant="info" icon="volume-2">
            {t('player.sfxPlaying', { name: worker.activeSfxName })}
          </Alert>
        )}

        {emptyLeaveRemainSec !== null && (
          <Alert variant="warning" icon="clock">
            {t('player.emptyChannelLeave', { time: formatDuration(emptyLeaveRemainSec) })}
          </Alert>
        )}

        {emptyLeaveRemainSec === null && idleLeaveRemainSec !== null && (
          <Alert variant="warning" icon="clock">
            {t('player.idleLeave', { time: formatDuration(idleLeaveRemainSec) })}
          </Alert>
        )}

        {!hasTrack ? (
          <EmptyState
            icon="disc"
            title={t('player.emptyTitle')}
            description={t('player.emptyDescription')}
          />
        ) : (
          <div className="space-y-4">
            <div className="flex flex-col gap-3.5 sm:flex-row sm:items-start">
              <TrackThumbnail src={track.thumbnail} alt={track.title} size="lg" />

              <div className="min-w-0 flex-1 space-y-1.5">
                <PlatformBadge source={track.source} />
                <div className="min-w-0">
                  {safeLink ? (
                    <a
                      href={safeLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={track.title || track.originalUrl}
                      className="flex w-full min-w-0 items-center gap-1.5 text-base font-semibold leading-snug text-fg-primary hover:text-accent hover:underline"
                    >
                      <span className="min-w-0 truncate">{track.title || track.originalUrl}</span>
                      <Icon name="external-link" size="xs" className="text-fg-muted" />
                    </a>
                  ) : (
                    <div className="truncate text-base font-semibold leading-snug text-fg-primary">
                      {track.title || track.originalUrl}
                    </div>
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
            </div>

            <div className="space-y-1.5">
              <Progress value={progressPct} />
              <div className="flex items-center justify-between text-xs tabular-nums text-fg-muted">
                <span>{formatDuration(currentProgressSec)}</span>
                <span>{track.durationFormatted || formatDuration(totalSec)}</span>
              </div>
            </div>
          </div>
        )}

        <Separator />

        {/* Playback Controls */}
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          <Button
            variant="primary"
            disabled={!canControl || !hasTrack}
            onClick={onTogglePause}
            className="col-span-2 sm:flex-1"
          >
            <Icon name={worker?.isPaused ? 'play' : 'pause'} size="sm" />
            <span>{worker?.isPaused ? t('player.resume') : t('player.pause')}</span>
          </Button>

          <Button
            variant="secondary"
            disabled={!canControl || !hasTrack}
            onClick={onSkip}
            title={t('player.skip')}
          >
            <Icon name="skip-forward" size="sm" />
            <span>{t('player.skip')}</span>
          </Button>

          <Button
            variant="secondary"
            disabled={!canControl || (worker?.queue.length ?? 0) < 2}
            onClick={onShuffle}
            title={t('player.shuffle')}
          >
            <Icon name="shuffle" size="sm" />
            <span>{t('player.shuffle')}</span>
          </Button>

          <Button
            variant={loopMode === 'off' ? 'secondary' : 'outline'}
            disabled={!canControl}
            onClick={onCycleLoop}
            title={loopLabel}
            className={loopMode !== 'off' ? 'border-accent text-accent-fg' : undefined}
          >
            <Icon name={loopMode === 'track' ? 'repeat-1' : 'repeat'} size="sm" />
            <span>{loopLabel}</span>
          </Button>

          <Button
            variant="danger"
            disabled={!canControl}
            onClick={onStop}
            title={t('player.stop')}
          >
            <Icon name="square" size="xs" />
            <span>{t('player.stop')}</span>
          </Button>
        </div>

        {/* Volume */}
        <div className="flex items-center gap-3 rounded-[2px] border border-border bg-subtle px-3 py-2.5">
          <Icon
            name={volume <= 1 ? 'volume-x' : 'volume-2'}
            size="sm"
            className="text-fg-secondary"
          />
          <Slider
            aria-label={t('player.volume')}
            min={1}
            max={100}
            step={1}
            value={[volume]}
            disabled={!canControl}
            onValueChange={(values) => {
              if (values[0] !== undefined) {
                onVolumeChange(values[0]);
              }
            }}
            className="flex-1"
          />
          <span className="w-10 text-right text-xs font-semibold tabular-nums text-fg-primary">
            {volume}%
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
