import * as React from 'react';
import type { TranslateFn } from '@/i18n';
import type { CustomSound, MemeRegion, MemeSound, SoundboardTab } from '@/types/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Icon } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { Pagination } from '@/components/ui/pagination';
import { Spinner } from '@/components/ui/spinner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { SoundTile } from './sound-tile';
import { SoundUploadForm, type SoundUploadPayload } from './sound-upload-form';

const SOUNDS_PAGE_SIZE = 12;

export interface SoundboardSectionProps {
  activeSubTab: SoundboardTab;
  inVoice: boolean;
  customSounds: CustomSound[];
  memes: MemeSound[];
  memeRegion: MemeRegion;
  isLoadingMemes: boolean;
  isUploading: boolean;
  savingMemeUrl: string | null;
  t: TranslateFn;
  onSubTabChange: (tab: SoundboardTab) => void;
  onUploadSound: (payload: SoundUploadPayload) => void;
  onPlayCustomSound: (sound: CustomSound) => void;
  onPreviewCustomSound: (sound: CustomSound) => void;
  onDeleteCustomSound: (sound: CustomSound) => void;
  onSearchMemes: (query: string) => void;
  onSelectMemeRegion: (region: MemeRegion) => void;
  onPlayMeme: (meme: MemeSound) => void;
  onPreviewMeme: (meme: MemeSound) => void;
  onSaveMeme: (meme: MemeSound) => void;
}

export function SoundboardSection({
  activeSubTab,
  inVoice,
  customSounds,
  memes,
  memeRegion,
  isLoadingMemes,
  isUploading,
  savingMemeUrl,
  t,
  onSubTabChange,
  onUploadSound,
  onPlayCustomSound,
  onPreviewCustomSound,
  onDeleteCustomSound,
  onSearchMemes,
  onSelectMemeRegion,
  onPlayMeme,
  onPreviewMeme,
  onSaveMeme,
}: SoundboardSectionProps) {
  const [memeQuery, setMemeQuery] = React.useState('');
  const [customPage, setCustomPage] = React.useState(1);
  const [memesPage, setMemesPage] = React.useState(1);

  const totalCustomPages = Math.max(1, Math.ceil(customSounds.length / SOUNDS_PAGE_SIZE));
  const totalMemePages = Math.max(1, Math.ceil(memes.length / SOUNDS_PAGE_SIZE));

  React.useEffect(() => {
    if (customPage > totalCustomPages) setCustomPage(totalCustomPages);
  }, [customPage, totalCustomPages]);

  React.useEffect(() => {
    if (memesPage > totalMemePages) setMemesPage(totalMemePages);
  }, [memesPage, totalMemePages]);

  const visibleCustomSounds = customSounds.slice(
    (customPage - 1) * SOUNDS_PAGE_SIZE,
    customPage * SOUNDS_PAGE_SIZE
  );
  const visibleMemes = memes.slice(
    (memesPage - 1) * SOUNDS_PAGE_SIZE,
    memesPage * SOUNDS_PAGE_SIZE
  );

  return (
    <Tabs
      value={activeSubTab}
      onValueChange={(value) => onSubTabChange(value as SoundboardTab)}
      className="space-y-4"
    >
      <TabsList className="w-full justify-start">
        <TabsTrigger value="custom">
          <Icon name="volume-2" size="sm" />
          <span>{t('soundboard.tabCustom')}</span>
        </TabsTrigger>
        <TabsTrigger value="memes">
          <Icon name="sparkles" size="sm" />
          <span>{t('soundboard.tabMemes')}</span>
        </TabsTrigger>
      </TabsList>

      <TabsContent value="custom" className="space-y-4">
        <SoundUploadForm isUploading={isUploading} t={t} onUpload={onUploadSound} />

        {customSounds.length === 0 ? (
          <EmptyState
            icon="volume-2"
            title={t('soundboard.emptyCustomTitle')}
            description={t('soundboard.emptyCustomDescription')}
          />
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
              {visibleCustomSounds.map((sound) => (
                <SoundTile
                  key={sound.id}
                  name={sound.name}
                  meta={sound.uploadedByTag || ''}
                  color={sound.color}
                  icon="volume-2"
                  inVoice={inVoice}
                  secondaryActionIcon="trash"
                  secondaryActionLabel={t('soundboard.deleteSound')}
                  secondaryActionDestructive
                  t={t}
                  onPlay={() => onPlayCustomSound(sound)}
                  onPreview={() => onPreviewCustomSound(sound)}
                  onSecondaryAction={() => onDeleteCustomSound(sound)}
                />
              ))}
            </div>

            {totalCustomPages > 1 && (
              <Pagination
                page={customPage}
                totalPages={totalCustomPages}
                hasPrev={customPage > 1}
                hasNext={customPage < totalCustomPages}
                t={t}
                onPrev={() => setCustomPage((p) => Math.max(1, p - 1))}
                onNext={() => setCustomPage((p) => Math.min(totalCustomPages, p + 1))}
              />
            )}
          </div>
        )}
      </TabsContent>

      <TabsContent value="memes" className="space-y-4">
        <Card>
          <CardContent className="space-y-3 p-4">
            <form
              className="flex flex-col gap-2 sm:flex-row"
              onSubmit={(e) => {
                e.preventDefault();
                setMemesPage(1);
                onSearchMemes(memeQuery.trim());
              }}
            >
              <Input
                value={memeQuery}
                placeholder={t('soundboard.searchPlaceholder')}
                autoComplete="off"
                onChange={(e) => setMemeQuery(e.target.value)}
              />
              <Button type="submit" variant="primary" className="shrink-0">
                <Icon name="search" size="sm" />
                <span>{t('soundboard.searchButton')}</span>
              </Button>
            </form>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant={memeRegion === 'ru' && !memeQuery ? 'outline' : 'secondary'}
                size="sm"
                className={
                  memeRegion === 'ru' && !memeQuery ? 'border-accent text-accent-fg' : undefined
                }
                onClick={() => {
                  setMemeQuery('');
                  setMemesPage(1);
                  onSelectMemeRegion('ru');
                }}
              >
                <Icon name="globe" size="xs" />
                <span>{t('soundboard.regionRu')}</span>
              </Button>
              <Button
                variant={memeRegion === 'us' && !memeQuery ? 'outline' : 'secondary'}
                size="sm"
                className={
                  memeRegion === 'us' && !memeQuery ? 'border-accent text-accent-fg' : undefined
                }
                onClick={() => {
                  setMemeQuery('');
                  setMemesPage(1);
                  onSelectMemeRegion('us');
                }}
              >
                <Icon name="globe" size="xs" />
                <span>{t('soundboard.regionUs')}</span>
              </Button>
            </div>
          </CardContent>
        </Card>

        {isLoadingMemes ? (
          <div className="flex flex-col items-center justify-center gap-2.5 rounded-[2px] border border-border bg-surface py-12">
            <Spinner size="md" />
            <p className="text-xs text-fg-muted">{t('soundboard.loadingMemes')}</p>
          </div>
        ) : memes.length === 0 ? (
          <EmptyState
            icon="search"
            title={t('soundboard.emptyMemesTitle')}
            description={t('soundboard.emptyMemesDescription')}
          />
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
              {visibleMemes.map((meme, idx) => (
                <SoundTile
                  key={`${meme.url}-${idx}`}
                  name={meme.name}
                  meta="MyInstants"
                  color={meme.color}
                  icon="sparkles"
                  inVoice={inVoice}
                  secondaryActionIcon="bookmark"
                  secondaryActionLabel={t('soundboard.saveToCustom')}
                  secondaryActionDisabled={savingMemeUrl === meme.url}
                  t={t}
                  onPlay={() => onPlayMeme(meme)}
                  onPreview={() => onPreviewMeme(meme)}
                  onSecondaryAction={() => onSaveMeme(meme)}
                />
              ))}
            </div>

            {totalMemePages > 1 && (
              <Pagination
                page={memesPage}
                totalPages={totalMemePages}
                hasPrev={memesPage > 1}
                hasNext={memesPage < totalMemePages}
                t={t}
                onPrev={() => setMemesPage((p) => Math.max(1, p - 1))}
                onNext={() => setMemesPage((p) => Math.min(totalMemePages, p + 1))}
              />
            )}
          </div>
        )}
      </TabsContent>
    </Tabs>
  );
}
