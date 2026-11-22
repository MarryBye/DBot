import * as React from 'react';
import type { TranslateFn } from '@/i18n';
import type { SavedTrackSnapshot } from '@/types/api';
import { Button } from '@/components/ui/button';
import { ColorPicker } from '@/components/ui/color-picker';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Icon } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { Pagination } from '@/components/ui/pagination';
import { PlatformBadge } from '@/components/ui/platform-badge';
import { Switch } from '@/components/ui/switch';
import { TruncatedText } from '@/components/ui/truncated-text';

const EDIT_TRACKS_PAGE_SIZE = 5;

export interface PlaylistEditorValues {
  name: string;
  color: string;
  isPublic: boolean;
}

export interface PlaylistEditorModalProps {
  open: boolean;
  mode: 'create' | 'edit';
  initialValues: PlaylistEditorValues;
  tracks?: SavedTrackSnapshot[];
  isSubmitting: boolean;
  t: TranslateFn;
  onSubmit: (values: PlaylistEditorValues) => void;
  onRemoveTrack?: (index: number) => void;
  onClose: () => void;
}

export function PlaylistEditorModal({
  open,
  mode,
  initialValues,
  tracks = [],
  isSubmitting,
  t,
  onSubmit,
  onRemoveTrack,
  onClose,
}: PlaylistEditorModalProps) {
  const [name, setName] = React.useState(initialValues.name);
  const [color, setColor] = React.useState(initialValues.color);
  const [isPublic, setIsPublic] = React.useState(initialValues.isPublic);
  const [tracksPage, setTracksPage] = React.useState(1);

  React.useEffect(() => {
    if (open) {
      setName(initialValues.name);
      setColor(initialValues.color);
      setIsPublic(initialValues.isPublic);
      setTracksPage(1);
    }
  }, [open, initialValues.name, initialValues.color, initialValues.isPublic]);

  const totalPages = Math.max(1, Math.ceil(tracks.length / EDIT_TRACKS_PAGE_SIZE));
  React.useEffect(() => {
    if (tracksPage > totalPages) setTracksPage(totalPages);
  }, [tracksPage, totalPages]);

  const pageStart = (tracksPage - 1) * EDIT_TRACKS_PAGE_SIZE;
  const visibleTracks = tracks.slice(pageStart, pageStart + EDIT_TRACKS_PAGE_SIZE);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    onSubmit({ name: trimmed, color, isPublic });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && !isSubmitting) onClose();
      }}
    >
      <DialogContent className={mode === 'edit' ? 'max-w-lg' : undefined}>
        <DialogHeader>
          <DialogTitle>
            {mode === 'create'
              ? t('playlists.saveQueueModalTitle')
              : t('playlists.editModalTitle')}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div className="space-y-1.5">
            <label
              htmlFor="playlist-editor-name"
              className="block text-xs font-semibold text-fg-secondary"
            >
              {t('playlists.nameLabel')}
            </label>
            <Input
              id="playlist-editor-name"
              value={name}
              maxLength={60}
              required
              autoFocus
              disabled={isSubmitting}
              placeholder={t('playlists.savePlaceholder')}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <span className="block text-xs font-semibold text-fg-secondary">
              {t('playlists.colorLabel')}
            </span>
            <ColorPicker
              value={color}
              disabled={isSubmitting}
              label={t('playlists.colorLabel')}
              onChange={setColor}
            />
          </div>

          <div className="flex items-start justify-between gap-4 rounded-[2px] border border-border bg-subtle/40 p-3">
            <div className="min-w-0 flex-1 space-y-0.5">
              <label
                htmlFor="playlist-editor-public"
                className="block cursor-pointer text-xs font-semibold text-fg-primary"
              >
                {t('playlists.visibilityLabel')}
              </label>
              <p className="text-xs leading-relaxed text-fg-muted">
                {t('playlists.visibilityDescription')}
              </p>
            </div>
            <Switch
              id="playlist-editor-public"
              checked={isPublic}
              disabled={isSubmitting}
              ariaLabel={t('playlists.visibilityLabel')}
              onCheckedChange={setIsPublic}
              className="mt-0.5"
            />
          </div>

          {mode === 'edit' && onRemoveTrack && (
            <div className="space-y-2 border-t border-border pt-3">
              <span className="block text-xs font-semibold text-fg-secondary">
                {t('playlists.editTracksLabel', { count: tracks.length })}
              </span>

              {tracks.length === 0 ? (
                <p className="rounded-[2px] border border-dashed border-border bg-subtle/30 py-4 text-center text-xs text-fg-muted">
                  {t('playlists.editTracksEmpty')}
                </p>
              ) : (
                <div className="space-y-2">
                  <div className="flex min-w-0 flex-col divide-y divide-border rounded-[2px] border border-border bg-subtle/30 px-2.5 py-1">
                    {visibleTracks.map((tr, localIdx) => {
                      const globalIdx = pageStart + localIdx;
                      const label = tr.author ? `${tr.title} — ${tr.author}` : tr.title;
                      return (
                        <div
                          key={`${tr.id}-${globalIdx}`}
                          className="flex min-w-0 items-center gap-2 overflow-hidden py-1.5 text-xs"
                        >
                          <span className="w-5 shrink-0 text-right tabular-nums text-fg-muted">
                            {globalIdx + 1}.
                          </span>
                          <PlatformBadge source={tr.source} compact />
                          <TruncatedText
                            text={label}
                            className="min-w-0 flex-1 font-medium text-fg-primary"
                          />
                          {tr.durationFormatted && (
                            <span className="shrink-0 tabular-nums text-fg-muted">
                              {tr.durationFormatted}
                            </span>
                          )}
                          <Button
                            variant="danger-ghost"
                            size="icon-sm"
                            disabled={isSubmitting}
                            onClick={() => onRemoveTrack(globalIdx)}
                            title={t('playlists.removeTrackAction')}
                            aria-label={t('playlists.removeTrackAction')}
                          >
                            <Icon name="x" size="xs" />
                          </Button>
                        </div>
                      );
                    })}
                  </div>

                  {totalPages > 1 && (
                    <Pagination
                      page={tracksPage}
                      totalPages={totalPages}
                      hasPrev={tracksPage > 1}
                      hasNext={tracksPage < totalPages}
                      disabled={isSubmitting}
                      t={t}
                      onPrev={() => setTracksPage((p) => Math.max(1, p - 1))}
                      onNext={() => setTracksPage((p) => Math.min(totalPages, p + 1))}
                    />
                  )}
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="secondary" disabled={isSubmitting} onClick={onClose}>
              {t('dialog.cancel')}
            </Button>
            <Button type="submit" variant="primary" disabled={isSubmitting || !name.trim()}>
              <Icon name="save" size="xs" />
              <span>
                {isSubmitting ? t('playlists.saving') : t('soundboard.saveChanges')}
              </span>
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
