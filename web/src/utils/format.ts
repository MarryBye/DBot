export function formatDuration(sec: number): string {
  if (!Number.isFinite(sec) || sec <= 0) return '0:00';
  const total = Math.floor(sec);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function safeHttpUrl(url: string | null | undefined, allowLocalApi = false): string | null {
  if (typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  if (allowLocalApi && trimmed.startsWith('/api/soundboard/file/')) {
    return trimmed;
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      return parsed.toString();
    }
  } catch {
    return null;
  }
  return null;
}

export function safeColor(color: string | null | undefined, fallback = '#0067b8'): string {
  return typeof color === 'string' && /^#[0-9a-fA-F]{6}$/.test(color.trim())
    ? color.trim()
    : fallback;
}

export function isDirectUrl(raw: string): boolean {
  const trimmed = raw.trim();
  if (!trimmed || /\s/.test(trimmed)) return false;
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const parsed = new URL(trimmed);
      return Boolean(parsed.hostname && parsed.hostname.includes('.'));
    } catch {
      return false;
    }
  }
  return /^(www\.)?(youtube\.com|youtu\.be|music\.youtube\.com|open\.spotify\.com|spotify\.com|soundcloud\.com|on\.soundcloud\.com)\//i.test(
    trimmed
  );
}

const YOUTUBE_ID_RE = /^[a-zA-Z0-9_-]{11}$/;

export function extractYouTubeVideoId(url: string | null | undefined, fallbackId?: string): string | null {
  if (typeof url === 'string' && url.trim()) {
    try {
      const parsed = new URL(url.trim());
      const host = parsed.hostname.toLowerCase();
      if (host === 'youtu.be') {
        const candidate = parsed.pathname.replace(/^\//, '').split('/')[0];
        if (YOUTUBE_ID_RE.test(candidate)) return candidate;
      }
      if (
        host === 'youtube.com' ||
        host === 'www.youtube.com' ||
        host === 'm.youtube.com' ||
        host === 'music.youtube.com'
      ) {
        const vParam = parsed.searchParams.get('v');
        if (vParam && YOUTUBE_ID_RE.test(vParam)) return vParam;
        const pathMatch = parsed.pathname.match(/^\/(?:embed|shorts|live)\/([a-zA-Z0-9_-]{11})/);
        if (pathMatch) return pathMatch[1];
      }
    } catch {
      // ignore malformed url
    }
  }

  if (fallbackId && YOUTUBE_ID_RE.test(fallbackId)) {
    return fallbackId;
  }
  return null;
}
