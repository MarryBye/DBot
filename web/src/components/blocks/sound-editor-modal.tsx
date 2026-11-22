import * as React from 'react';
import type { TranslateFn } from '@/i18n';
import { Button } from '@/components/ui/button';
import { ColorPicker } from '@/components/ui/color-picker';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { FilePicker } from '@/components/ui/file-picker';
import { Icon } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';

export interface SoundEditorUploadPayload {
  name: string;
  color: string;
  isPublic: boolean;
  file: File;
}

export interface SoundEditorEditPayload {
  name: string;
  color: string;
  isPublic: boolean;
}

export interface SoundEditorModalProps {
  open: boolean;
  mode: 'upload' | 'edit';
  initialValues: SoundEditorEditPayload;
  isSubmitting: boolean;
  t: TranslateFn;
  onUpload: (payload: SoundEditorUploadPayload) => void;
  onEdit: (payload: SoundEditorEditPayload) => void;
  onClose: () => void;
}

export function SoundEditorModal({
  open,
  mode,
  initialValues,
  isSubmitting,
  t,
  onUpload,
  onEdit,
  onClose,
}: SoundEditorModalProps) {
  const [name, setName] = React.useState(initialValues.name);
  const [color, setColor] = React.useState(initialValues.color);
  const [isPublic, setIsPublic] = React.useState(initialValues.isPublic);
  const [file, setFile] = React.useState<File | null>(null);
  const [pickerKey, setPickerKey] = React.useState(0);

  React.useEffect(() => {
    if (open) {
      setName(initialValues.name);
      setColor(initialValues.color);
      setIsPublic(initialValues.isPublic);
      setFile(null);
      setPickerKey((k) => k + 1);
    }
  }, [open, initialValues.name, initialValues.color, initialValues.isPublic]);

  const handleFileSelect = (selected: File | null) => {
    setFile(selected);
    if (selected && !name.trim()) {
      setName(selected.name.replace(/\.[^.]+$/, '').slice(0, 50));
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    if (mode === 'upload') {
      if (!file) return;
      onUpload({ name: trimmed, color, isPublic, file });
    } else {
      onEdit({ name: trimmed, color, isPublic });
    }
  };

  const canSubmit = !isSubmitting && name.trim().length > 0 && (mode === 'edit' || file !== null);

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && !isSubmitting) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {mode === 'upload'
              ? t('soundboard.uploadModalTitle')
              : t('soundboard.editModalTitle')}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          {mode === 'upload' && (
            <div className="space-y-1.5">
              <FilePicker
                key={pickerKey}
                accept=".mp3,.wav,.ogg,.m4a,.webm,.flac,audio/*"
                label={t('soundboard.pickFile')}
                fileName={file?.name ?? null}
                icon="file-audio"
                disabled={isSubmitting}
                required
                onFileSelect={handleFileSelect}
              />
            </div>
          )}

          <div className="space-y-1.5">
            <label
              htmlFor="sound-editor-name"
              className="block text-xs font-semibold text-fg-secondary"
            >
              {t('soundboard.namePlaceholder')}
            </label>
            <Input
              id="sound-editor-name"
              value={name}
              maxLength={50}
              required
              autoFocus={mode === 'edit'}
              disabled={isSubmitting}
              placeholder={t('soundboard.namePlaceholder')}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <span className="block text-xs font-semibold text-fg-secondary">
              {t('soundboard.colorLabel')}
            </span>
            <ColorPicker
              value={color}
              disabled={isSubmitting}
              label={t('soundboard.colorLabel')}
              onChange={setColor}
            />
          </div>

          <div className="flex items-start justify-between gap-4 rounded-[2px] border border-border bg-subtle/40 p-3">
            <div className="min-w-0 flex-1 space-y-0.5">
              <label
                htmlFor="sound-editor-public"
                className="block cursor-pointer text-xs font-semibold text-fg-primary"
              >
                {t('soundboard.visibilityLabel')}
              </label>
              <p className="text-xs leading-relaxed text-fg-muted">
                {t('soundboard.visibilityDescription')}
              </p>
            </div>
            <Switch
              id="sound-editor-public"
              checked={isPublic}
              disabled={isSubmitting}
              ariaLabel={t('soundboard.visibilityLabel')}
              onCheckedChange={setIsPublic}
              className="mt-0.5"
            />
          </div>

          <DialogFooter>
            <Button variant="secondary" disabled={isSubmitting} onClick={onClose}>
              {t('dialog.cancel')}
            </Button>
            <Button type="submit" variant="primary" disabled={!canSubmit}>
              <Icon name={mode === 'upload' ? 'upload' : 'save'} size="xs" />
              <span>
                {mode === 'upload'
                  ? isSubmitting
                    ? t('soundboard.uploading')
                    : t('soundboard.uploadButton')
                  : t('soundboard.saveChanges')}
              </span>
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
