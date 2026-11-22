import * as React from 'react';
import type { TranslateFn } from '@/i18n';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { FilePicker } from '@/components/ui/file-picker';
import { Icon } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { SectionHeader } from '@/components/ui/section-header';

export interface SoundUploadPayload {
  name: string;
  color: string;
  file: File;
}

export interface SoundUploadFormProps {
  isUploading: boolean;
  t: TranslateFn;
  onUpload: (payload: SoundUploadPayload) => void;
}

const DEFAULT_COLOR = '#0067b8';

export function SoundUploadForm({ isUploading, t, onUpload }: SoundUploadFormProps) {
  const [name, setName] = React.useState('');
  const [color, setColor] = React.useState(DEFAULT_COLOR);
  const [file, setFile] = React.useState<File | null>(null);
  const [pickerKey, setPickerKey] = React.useState(0);

  const handleFileSelect = (selected: File | null) => {
    setFile(selected);
    if (selected && !name.trim()) {
      setName(selected.name.replace(/\.[^.]+$/, '').slice(0, 50));
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || !file) return;
    onUpload({ name: trimmed, color, file });
    setName('');
    setColor(DEFAULT_COLOR);
    setFile(null);
    setPickerKey((k) => k + 1);
  };

  return (
    <Card>
      <CardHeader className="border-b border-border pb-3">
        <SectionHeader title={t('soundboard.uploadTitle')} />
      </CardHeader>
      <CardContent className="pt-4">
        <form onSubmit={handleSubmit} className="flex flex-col gap-2.5 lg:flex-row lg:items-center">
          <Input
            value={name}
            maxLength={50}
            required
            disabled={isUploading}
            placeholder={t('soundboard.namePlaceholder')}
            onChange={(e) => setName(e.target.value)}
            className="flex-1"
          />

          <div className="flex flex-wrap items-center gap-2">
            <label
              title={t('soundboard.colorLabel')}
              className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-[2px] border border-border-strong bg-surface px-2.5"
            >
              <input
                type="color"
                value={color}
                disabled={isUploading}
                aria-label={t('soundboard.colorLabel')}
                onChange={(e) => setColor(e.target.value)}
                className="h-5 w-5 cursor-pointer border-0 bg-transparent p-0"
              />
              <span className="text-xs font-mono uppercase text-fg-secondary">{color}</span>
            </label>

            <FilePicker
              key={pickerKey}
              accept=".mp3,.wav,.ogg,.m4a,.webm,.flac,audio/*"
              label={t('soundboard.pickFile')}
              fileName={file?.name ?? null}
              icon="file-audio"
              disabled={isUploading}
              required
              onFileSelect={handleFileSelect}
            />

            <Button
              type="submit"
              variant="primary"
              disabled={isUploading || !name.trim() || !file}
              className="flex-1 sm:flex-none"
            >
              <Icon name="upload" size="sm" />
              <span>{isUploading ? t('soundboard.uploading') : t('soundboard.uploadButton')}</span>
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
