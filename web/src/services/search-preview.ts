import type { PlatformOption, SearchResultItem, SearchResultKind, TrackSource } from '@/types/api';
import { formatDuration } from '@/utils/format';

interface PreviewTemplate {
  suffix: string;
  authorSuffix: string;
  source: TrackSource;
  kind: SearchResultKind;
  durationSec: number;
  isLive?: boolean;
}

const TEMPLATES_BY_SOURCE: Record<TrackSource, PreviewTemplate[]> = {
  youtube: [
    { suffix: '(Official Audio)', authorSuffix: 'Topic', source: 'youtube', kind: 'music', durationSec: 214 },
    { suffix: '(Official Video)', authorSuffix: 'VEVO', source: 'youtube', kind: 'video', durationSec: 248 },
    { suffix: 'Live Radio 24/7', authorSuffix: 'FM Stream', source: 'youtube', kind: 'stream', durationSec: 0, isLive: true },
    { suffix: 'Acoustic Session', authorSuffix: 'Live Sessions', source: 'youtube', kind: 'video', durationSec: 196 },
    { suffix: 'Extended Mix', authorSuffix: 'Audio Archive', source: 'youtube', kind: 'music', durationSec: 342 },
    { suffix: 'Full Album', authorSuffix: 'Records', source: 'youtube', kind: 'playlist', durationSec: 2410 },
  ],
  soundcloud: [
    { suffix: '(Original Mix)', authorSuffix: 'SoundCloud', source: 'soundcloud', kind: 'track', durationSec: 229 },
    { suffix: '(Club Edit)', authorSuffix: 'DJ Set', source: 'soundcloud', kind: 'track', durationSec: 286 },
    { suffix: 'Demo Tape', authorSuffix: 'Underground', source: 'soundcloud', kind: 'track', durationSec: 178 },
    { suffix: 'Night Selection', authorSuffix: 'Curated', source: 'soundcloud', kind: 'playlist', durationSec: 1840 },
    { suffix: '(Slowed + Reverb)', authorSuffix: 'Edits', source: 'soundcloud', kind: 'track', durationSec: 263 },
  ],
  spotify: [
    { suffix: '', authorSuffix: 'Official', source: 'spotify', kind: 'track', durationSec: 205 },
    { suffix: '(Remastered)', authorSuffix: 'Studio', source: 'spotify', kind: 'track', durationSec: 231 },
    { suffix: 'Radio Mix', authorSuffix: 'Essentials', source: 'spotify', kind: 'playlist', durationSec: 1920 },
    { suffix: '(Instrumental)', authorSuffix: 'Sessions', source: 'spotify', kind: 'track', durationSec: 198 },
    { suffix: '(Deluxe Version)', authorSuffix: 'Label', source: 'spotify', kind: 'track', durationSec: 254 },
  ],
};

const PAGE_SIZE = 5;
const MAX_PAGES = 4;

function buildPageItems(query: string, platform: PlatformOption, page: number): SearchResultItem[] {
  const sources: TrackSource[] =
    platform === 'auto' ? ['youtube', 'spotify', 'soundcloud'] : [platform];

  const items: SearchResultItem[] = [];
  const offset = (page - 1) * PAGE_SIZE;

  for (let i = 0; i < PAGE_SIZE; i++) {
    const globalIdx = offset + i;
    const source = sources[globalIdx % sources.length];
    const pool = TEMPLATES_BY_SOURCE[source];
    const tpl = pool[(globalIdx + page) % pool.length];
    const durationSec = tpl.isLive ? 0 : tpl.durationSec + ((globalIdx * 17) % 55);
    const title = tpl.suffix ? `${query} ${tpl.suffix}` : query;

    items.push({
      id: `sr-${source}-${page}-${i}-${query.toLowerCase().slice(0, 12)}`,
      title,
      author: `${query.split(/\s+/)[0] || 'Artist'} ${tpl.authorSuffix}`,
      url:
        tpl.kind === 'playlist'
          ? source === 'spotify'
            ? `https://open.spotify.com/playlist/demo${page}${i}`
            : source === 'soundcloud'
              ? `https://soundcloud.com/demo/sets/${encodeURIComponent(title)}`
              : `https://www.youtube.com/playlist?list=PLdemo${page}${i}`
          : source === 'spotify'
            ? `https://open.spotify.com/track/demo${page}${i}`
            : source === 'soundcloud'
              ? `https://soundcloud.com/demo/${encodeURIComponent(title)}`
              : `https://www.youtube.com/watch?v=demo${page}${i}`,
      durationSec,
      durationFormatted: tpl.isLive || tpl.kind === 'playlist' ? '' : formatDuration(durationSec),
      thumbnail: null,
      source,
      kind: tpl.kind,
      isLive: tpl.isLive,
      trackCount: tpl.kind === 'playlist' ? 12 + ((globalIdx * 3) % 18) : undefined,
    });
  }

  return items;
}

export async function streamPreviewSearchPage(
  query: string,
  platform: PlatformOption,
  page: number,
  callbacks: {
    onItem: (item: SearchResultItem) => void;
    onComplete: (hasNextPage: boolean) => void;
  },
  signal?: AbortSignal
): Promise<void> {
  const items = buildPageItems(query, platform, page);

  for (let i = 0; i < items.length; i++) {
    const delay = i === 0 ? 180 : 210 + (i % 2) * 90;
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, delay);
      signal?.addEventListener(
        'abort',
        () => {
          clearTimeout(timer);
          resolve();
        },
        { once: true }
      );
    });

    if (signal?.aborted) return;
    callbacks.onItem(items[i]);
  }

  if (signal?.aborted) return;
  callbacks.onComplete(page < MAX_PAGES);
}
