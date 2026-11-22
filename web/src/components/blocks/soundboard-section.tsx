import * as React from 'react';
import type { TranslateFn } from '@/i18n';
import type {
  CustomSound,
  LibrarySortOption,
  MemeRegion,
  MemeSound,
  SoundboardTab,
} from '@/types/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Icon } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { Pagination } from '@/components/ui/pagination';
import { SectionHeader } from '@/components/ui/section-header';
import { Spinner } from '@/components/ui/spinner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { LibraryFilterBar, type LibraryAuthorOption } from './library-filter-bar';
import { SoundTile } from './sound-tile';

const SOUNDS_PAGE_SIZE = 12;

function sortSounds(list: CustomSound[], sortBy: LibrarySortOption): CustomSound[] {
  const copy = [...list];
  const getTime = (s: CustomSound) => new Date(s.createdAt || 0).getTime();

  copy.sort((a, b) => {
    switch (sortBy) {
      case 'oldest':
        return getTime(a) - getTime(b);
      case 'likes':
        return b.likes - a.likes || a.dislikes - b.dislikes || getTime(b) - getTime(a);
      case 'dislikes':
        return b.dislikes - a.dislikes || getTime(b) - getTime(a);
      case 'author':
        return (
          (a.uploadedByTag || '').localeCompare(b.uploadedByTag || '') ||
          a.name.localeCompare(b.name)
        );
      case 'name':
        return a.name.localeCompare(b.name);
      case 'newest':
      default:
        return getTime(b) - getTime(a);
    }
  });
  return copy;
}

export interface SoundboardSectionProps {
  activeSubTab: SoundboardTab;
  inVoice: boolean;
  mySounds: CustomSound[];
  publicSounds: CustomSound[];
  memes: MemeSound[];
  memeRegion: MemeRegion;
  isLoadingMemes: boolean;
  playingSoundKey: string | null;
  savingMemeUrl: string | null;
  t: TranslateFn;
  onSubTabChange: (tab: SoundboardTab) => void;
  onRequestUploadSound: () => void;
  onEditCustomSound: (sound: CustomSound) => void;
  onToggleSoundPublic: (sound: CustomSound) => void;
  onReactCustomSound: (sound: CustomSound, value: 1 | -1) => void;
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
  mySounds,
  publicSounds,
  memes,
  memeRegion,
  isLoadingMemes,
  playingSoundKey,
  savingMemeUrl,
  t,
  onSubTabChange,
  onRequestUploadSound,
  onEditCustomSound,
  onToggleSoundPublic,
  onReactCustomSound,
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
  const [myPage, setMyPage] = React.useState(1);
  const [publicPage, setPublicPage] = React.useState(1);
  const [memesPage, setMemesPage] = React.useState(1);

  const [publicSearch, setPublicSearch] = React.useState('');
  const [publicAuthor, setPublicAuthor] = React.useState('all');
  const [publicSort, setPublicSort] = React.useState<LibrarySortOption>('newest');

  // My sounds pagination
  const totalMyPages = Math.max(1, Math.ceil(mySounds.length / SOUNDS_PAGE_SIZE));
  React.useEffect(() => {
    if (myPage > totalMyPages) setMyPage(totalMyPages);
  }, [myPage, totalMyPages]);
  const visibleMySounds = mySounds.slice(
    (myPage - 1) * SOUNDS_PAGE_SIZE,
    myPage * SOUNDS_PAGE_SIZE
  );

  // Public sounds authors, filter & sort
  const publicAuthors = React.useMemo<LibraryAuthorOption[]>(() => {
    const map = new Map<string, string>();
    for (const s of publicSounds) {
      if (!map.has(s.uploadedById)) {
        map.set(
          s.uploadedById,
          s.uploadedByUsername
            ? `${s.uploadedByTag} (@${s.uploadedByUsername})`
            : s.uploadedByTag
        );
      }
    }
    return [...map.entries()].map(([id, label]) => ({ id, label }));
  }, [publicSounds]);

  const filteredPublicSounds = React.useMemo(() => {
    const q = publicSearch.trim().toLowerCase();
    const filtered = publicSounds.filter((s) => {
      if (publicAuthor !== 'all' && s.uploadedById !== publicAuthor) return false;
      if (q) {
        const hit =
          s.name.toLowerCase().includes(q) ||
          (s.uploadedByTag || '').toLowerCase().includes(q) ||
          (s.uploadedByUsername?.toLowerCase().includes(q) ?? false);
        if (!hit) return false;
      }
      return true;
    });
    return sortSounds(filtered, publicSort);
  }, [publicSounds, publicSearch, publicAuthor, publicSort]);

  const totalPublicPages = Math.max(
    1,
    Math.ceil(filteredPublicSounds.length / SOUNDS_PAGE_SIZE)
  );
  React.useEffect(() => {
    if (publicPage > totalPublicPages) setPublicPage(totalPublicPages);
  }, [publicPage, totalPublicPages]);
  const visiblePublicSounds = filteredPublicSounds.slice(
    (publicPage - 1) * SOUNDS_PAGE_SIZE,
    publicPage * SOUNDS_PAGE_SIZE
  );

  // Memes pagination
  const totalMemePages = Math.max(1, Math.ceil(memes.length / SOUNDS_PAGE_SIZE));
  React.useEffect(() => {
    if (memesPage > totalMemePages) setMemesPage(totalMemePages);
  }, [memesPage, totalMemePages]);
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
        <TabsTrigger value="my">
          <Icon name="user" size="sm" />
          <span>{t('soundboard.tabMy')}</span>
          <Badge variant="default" className="ml-0.5 tabular-nums">
            {mySounds.length}
          </Badge>
        </TabsTrigger>
        <TabsTrigger value="public">
          <Icon name="globe" size="sm" />
          <span>{t('soundboard.tabPublic')}</span>
          <Badge variant="default" className="ml-0.5 tabular-nums">
            {publicSounds.length}
          </Badge>
        </TabsTrigger>
        <TabsTrigger value="memes">
          <Icon name="search" size="sm" />
          <span>{t('soundboard.tabFind')}</span>
        </TabsTrigger>
      </TabsList>

      {/* Sub-tab 1: My Sounds */}
      <TabsContent value="my" className="space-y-4">
        <Card>
          <CardHeader className="pb-3">
            <SectionHeader
              title={t('soundboard.myTitle')}
              count={mySounds.length}
              description={t('soundboard.myDescription')}
              actions={
                <Button variant="primary" size="sm" onClick={onRequestUploadSound}>
                  <Icon name="upload" size="xs" />
                  <span>{t('soundboard.openUpload')}</span>
                </Button>
              }
            />
          </CardHeader>
        </Card>

        {mySounds.length === 0 ? (
          <EmptyState
            icon="volume-2"
            title={t('soundboard.emptyMyTitle')}
            description={t('soundboard.emptyMyDescription')}
          />
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
              {visibleMySounds.map((sound) => (
                <SoundTile
                  key={sound.id}
                  name={sound.name}
                  meta={sound.uploadedByTag || ''}
                  color={sound.color}
                  icon="volume-2"
                  inVoice={inVoice}
                  isBusy={playingSoundKey === `custom:${sound.id}`}
                  visibility={sound.isPublic ? 'public' : 'private'}
                  reactions={
                    sound.isPublic
                      ? {
                          likes: sound.likes,
                          dislikes: sound.dislikes,
                          myVote: sound.myVote,
                          onVote: (val) => onReactCustomSound(sound, val),
                        }
                      : undefined
                  }
                  onTogglePublic={() => onToggleSoundPublic(sound)}
                  onEdit={() => onEditCustomSound(sound)}
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

            {totalMyPages > 1 && (
              <Pagination
                page={myPage}
                totalPages={totalMyPages}
                hasPrev={myPage > 1}
                hasNext={myPage < totalMyPages}
                t={t}
                onPrev={() => setMyPage((p) => Math.max(1, p - 1))}
                onNext={() => setMyPage((p) => Math.min(totalMyPages, p + 1))}
              />
            )}
          </div>
        )}
      </TabsContent>

      {/* Sub-tab 2: Public Server Sounds */}
      <TabsContent value="public" className="space-y-4">
        <Card>
          <CardHeader className="border-b border-border pb-3">
            <SectionHeader
              title={t('soundboard.publicTitle')}
              count={filteredPublicSounds.length}
              description={t('soundboard.publicDescription')}
              actions={
                <Button variant="primary" size="sm" onClick={onRequestUploadSound}>
                  <Icon name="upload" size="xs" />
                  <span>{t('soundboard.openUpload')}</span>
                </Button>
              }
            />
          </CardHeader>
          {publicSounds.length > 0 && (
            <CardContent className="pt-4">
              <LibraryFilterBar
                searchQuery={publicSearch}
                authorFilter={publicAuthor}
                sortBy={publicSort}
                authors={publicAuthors}
                searchPlaceholder={t('soundboard.searchPublicPlaceholder')}
                t={t}
                onSearchChange={(val) => {
                  setPublicSearch(val);
                  setPublicPage(1);
                }}
                onAuthorChange={(val) => {
                  setPublicAuthor(val);
                  setPublicPage(1);
                }}
                onSortChange={(val) => {
                  setPublicSort(val);
                  setPublicPage(1);
                }}
                onReset={() => {
                  setPublicSearch('');
                  setPublicAuthor('all');
                  setPublicSort('newest');
                  setPublicPage(1);
                }}
              />
            </CardContent>
          )}
        </Card>

        {publicSounds.length === 0 ? (
          <EmptyState
            icon="globe"
            title={t('soundboard.emptyPublicTitle')}
            description={t('soundboard.emptyPublicDescription')}
          />
        ) : filteredPublicSounds.length === 0 ? (
          <EmptyState
            icon="search"
            title={t('library.emptyFilteredTitle')}
            description={t('library.emptyFilteredDescription')}
          />
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
              {visiblePublicSounds.map((sound) => (
                <SoundTile
                  key={sound.id}
                  name={sound.name}
                  meta={sound.uploadedByTag || ''}
                  color={sound.color}
                  icon="volume-2"
                  inVoice={inVoice}
                  isBusy={playingSoundKey === `custom:${sound.id}`}
                  visibility={sound.isOwner ? 'public' : undefined}
                  reactions={{
                    likes: sound.likes,
                    dislikes: sound.dislikes,
                    myVote: sound.myVote,
                    onVote: (val) => onReactCustomSound(sound, val),
                  }}
                  onTogglePublic={sound.isOwner ? () => onToggleSoundPublic(sound) : undefined}
                  onEdit={sound.isOwner ? () => onEditCustomSound(sound) : undefined}
                  secondaryActionIcon={sound.isOwner ? 'trash' : undefined}
                  secondaryActionLabel={sound.isOwner ? t('soundboard.deleteSound') : undefined}
                  secondaryActionDestructive={sound.isOwner}
                  t={t}
                  onPlay={() => onPlayCustomSound(sound)}
                  onPreview={() => onPreviewCustomSound(sound)}
                  onSecondaryAction={sound.isOwner ? () => onDeleteCustomSound(sound) : undefined}
                />
              ))}
            </div>

            {totalPublicPages > 1 && (
              <Pagination
                page={publicPage}
                totalPages={totalPublicPages}
                hasPrev={publicPage > 1}
                hasNext={publicPage < totalPublicPages}
                t={t}
                onPrev={() => setPublicPage((p) => Math.max(1, p - 1))}
                onNext={() => setPublicPage((p) => Math.min(totalPublicPages, p + 1))}
              />
            )}
          </div>
        )}
      </TabsContent>

      {/* Sub-tab 3: Find Sounds (MyInstants) */}
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
                  isBusy={playingSoundKey === `meme:${meme.url}`}
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
