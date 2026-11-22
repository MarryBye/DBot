import dns from 'node:dns/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import net from 'node:net';
import { config } from '../config.js';

// ========================================================
// 1. HTTP Security Headers & CSRF Protection
// ========================================================
export function applySecurityHeaders(
  res: ServerResponse,
  options: { isSandboxedMedia?: boolean } = {}
): void {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');

  if (options.isSandboxedMedia) {
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    return;
  }

  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' https: data:",
      "media-src 'self' https://www.myinstants.com https://myinstants.com https://*.myinstants.com",
      "connect-src 'self'",
      "font-src 'self'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
    ].join('; ')
  );
}

function getAllowedHosts(req: IncomingMessage): Set<string> {
  const allowed = new Set<string>();
  const reqHost = (req.headers.host || '').trim().toLowerCase();
  if (reqHost) allowed.add(reqHost);

  try {
    const pub = new URL(config.publicUrl);
    allowed.add(pub.host.toLowerCase());
  } catch {
    // ignore malformed PUBLIC_URL
  }

  return allowed;
}

/**
 * Защита от CSRF на всех изменяющих API-запросах (POST / PUT / PATCH / DELETE):
 * 1) Запрещаем cross-site по Sec-Fetch-Site.
 * 2) Проверяем совпадение хоста Origin / Referer с сервером.
 * 3) Требуем кастомный заголовок X-DBot-CSRF: 1 (невозможен в cross-site запросах без CORS preflight).
 */
export function verifyCsrfProtection(req: IncomingMessage): { ok: boolean; reason?: string } {
  const method = (req.method || 'GET').toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
    return { ok: true };
  }

  const secFetchSite = String(req.headers['sec-fetch-site'] || '').toLowerCase();
  if (secFetchSite && secFetchSite !== 'same-origin' && secFetchSite !== 'none') {
    return { ok: false, reason: 'Заблокирован межсайтовый запрос (CSRF).' };
  }

  const csrfHeader = String(req.headers['x-dbot-csrf'] || '');
  if (csrfHeader !== '1') {
    return { ok: false, reason: 'Отсутствует заголовок защиты от CSRF.' };
  }

  const allowedHosts = getAllowedHosts(req);
  const origin = req.headers.origin;
  if (origin) {
    try {
      const originHost = new URL(origin).host.toLowerCase();
      if (!allowedHosts.has(originHost)) {
        return { ok: false, reason: 'Недоверенный источник запроса (Origin).' };
      }
    } catch {
      return { ok: false, reason: 'Некорректный заголовок Origin.' };
    }
  } else if (req.headers.referer) {
    try {
      const refHost = new URL(req.headers.referer).host.toLowerCase();
      if (!allowedHosts.has(refHost)) {
        return { ok: false, reason: 'Недоверенный источник запроса (Referer).' };
      }
    } catch {
      return { ok: false, reason: 'Некорректный заголовок Referer.' };
    }
  }

  return { ok: true };
}

// ========================================================
// 2. Встроенный Rate Limiter (без сторонних зависимостей)
// ========================================================
export class RateLimiter {
  private buckets = new Map<string, number[]>();
  private lastCleanup = Date.now();

  public check(key: string, maxRequests: number, windowMs: number): boolean {
    const now = Date.now();

    if (now - this.lastCleanup > 60_000) {
      this.lastCleanup = now;
      for (const [k, timestamps] of this.buckets.entries()) {
        const fresh = timestamps.filter((t) => now - t < 120_000);
        if (fresh.length === 0) this.buckets.delete(k);
        else this.buckets.set(k, fresh);
      }
    }

    const list = (this.buckets.get(key) ?? []).filter((t) => now - t < windowMs);
    if (list.length >= maxRequests) {
      this.buckets.set(key, list);
      return false;
    }

    list.push(now);
    this.buckets.set(key, list);
    return true;
  }
}

export function getClientIp(req: IncomingMessage): string {
  return req.socket?.remoteAddress || 'unknown';
}

// ========================================================
// 3. Защита от SSRF и строгая валидация URL / IP
// ========================================================
function isPrivateIpv4(ip: string): boolean {
  const parts = ip.split('.').map((p) => Number(p));
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return true;
  }
  const [a, b] = parts;

  if (a === 0) return true; // 0.0.0.0/8
  if (a === 10) return true; // 10.0.0.0/8 (RFC1918)
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 (CGNAT)
  if (a === 127) return true; // 127.0.0.0/8 (loopback)
  if (a === 169 && b === 254) return true; // 169.254.0.0/16 (link-local & Cloud IMDS!)
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12 (RFC1918)
  if (a === 192 && b === 0 && parts[2] === 0) return true; // 192.0.0.0/24
  if (a === 192 && b === 0 && parts[2] === 2) return true; // TEST-NET-1
  if (a === 192 && b === 168) return true; // 192.168.0.0/16 (RFC1918)
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmark
  if (a >= 224) return true; // multicast & reserved (224.0.0.0+)

  return false;
}

export function isPrivateOrReservedIp(ip: string): boolean {
  const cleaned = ip.trim().toLowerCase().replace(/^\[|\]$/g, '');
  const ipVersion = net.isIP(cleaned);

  if (ipVersion === 4) {
    return isPrivateIpv4(cleaned);
  }

  if (ipVersion === 6) {
    if (cleaned === '::' || cleaned === '::1') return true;
    // IPv4-mapped IPv6: ::ffff:127.0.0.1 или ::ffff:a9fe:a9fe
    const mappedV4 = cleaned.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mappedV4) return isPrivateIpv4(mappedV4[1]);
    if (cleaned.startsWith('::ffff:')) return true; // консервативно блокируем hex-формы IPv4-mapped
    if (/^(fc|fd)/i.test(cleaned)) return true; // Unique local (fc00::/7)
    if (/^fe[89ab]/i.test(cleaned)) return true; // Link-local (fe80::/10)
    if (cleaned.startsWith('ff')) return true; // Multicast
    return false;
  }

  // Неизвестный формат — считаем небезопасным
  return true;
}

function matchesHostAllowlist(hostname: string, allowlist: string[]): boolean {
  const host = hostname.toLowerCase();
  return allowlist.some((pattern) => {
    const p = pattern.toLowerCase();
    if (p.startsWith('*.')) {
      const suffix = p.slice(1); // '.example.com'
      return host === p.slice(2) || host.endsWith(suffix);
    }
    return host === p;
  });
}

export interface SafeUrlOptions {
  httpsOnly?: boolean;
  allowedHosts?: string[];
  skipDnsLookup?: boolean;
}

/**
 * Проверяет, что URL указывает исключительно на публичный внешний HTTP(S)-ресурс
 * (блокирует file://, localhost, 127.0.0.1, 169.254.169.254 Oracle IMDS, приватные сети и DNS-rebind).
 */
export async function assertSafePublicHttpUrl(
  rawUrl: string,
  options: SafeUrlOptions = {}
): Promise<URL> {
  if (typeof rawUrl !== 'string') {
    throw new Error('Некорректная ссылка.');
  }

  const trimmed = rawUrl.trim();
  if (!trimmed || trimmed.length > 2048 || /[\0\r\n]/.test(trimmed) || trimmed.startsWith('-')) {
    throw new Error('Некорректный формат ссылки.');
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error('Некорректный URL.');
  }

  const allowedProtocols = options.httpsOnly ? ['https:'] : ['https:', 'http:'];
  if (!allowedProtocols.includes(parsed.protocol)) {
    throw new Error('Разрешены только безопасные HTTP/HTTPS ссылки.');
  }

  if (parsed.username || parsed.password) {
    throw new Error('Ссылки с учётными данными запрещены.');
  }

  const hostname = parsed.hostname.toLowerCase();
  if (
    !hostname ||
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal')
  ) {
    throw new Error('Доступ к локальным адресам запрещён.');
  }

  if (options.allowedHosts && !matchesHostAllowlist(hostname, options.allowedHosts)) {
    throw new Error('Домен ссылки не входит в список доверенных источников.');
  }

  const bareHost = hostname.replace(/^\[|\]$/g, '');
  if (net.isIP(bareHost)) {
    if (isPrivateOrReservedIp(bareHost)) {
      throw new Error('Доступ к внутренним IP-адресам запрещён.');
    }
    return parsed;
  }

  if (!options.skipDnsLookup) {
    let records: Array<{ address: string }>;
    try {
      records = await dns.lookup(bareHost, { all: true });
    } catch {
      throw new Error('Не удалось разрешить домен ссылки.');
    }
    if (!records || records.length === 0) {
      throw new Error('Домен ссылки не найден.');
    }
    for (const rec of records) {
      if (isPrivateOrReservedIp(rec.address)) {
        throw new Error('Домен указывает на внутренний или служебный IP-адрес.');
      }
    }
  }

  return parsed;
}

/**
 * Безопасный fetch с проверкой каждого редиректа (исключает 302-редирект на 169.254.169.254 / localhost).
 */
export async function safeFetch(
  rawUrl: string,
  options: SafeUrlOptions & {
    headers?: Record<string, string>;
    timeoutMs?: number;
    maxRedirects?: number;
  } = {}
): Promise<Response> {
  const maxRedirects = options.maxRedirects ?? 3;
  const timeoutMs = options.timeoutMs ?? 15_000;
  let currentUrl = rawUrl;

  for (let hop = 0; hop <= maxRedirects; hop++) {
    const validated = await assertSafePublicHttpUrl(currentUrl, options);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(validated.toString(), {
        headers: {
          'User-Agent': 'Mozilla/5.0',
          ...(options.headers || {}),
        },
        redirect: 'manual',
        signal: controller.signal,
      });

      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get('location');
        if (!location) return res;
        if (hop === maxRedirects) {
          throw new Error('Слишком много перенаправлений при загрузке ресурса.');
        }
        currentUrl = new URL(location, validated).toString();
        continue;
      }

      return res;
    } finally {
      clearTimeout(timer);
    }
  }

  throw new Error('Не удалось загрузить ресурс.');
}

export async function readResponseBufferWithLimit(
  res: Response,
  maxBytes: number
): Promise<Buffer> {
  const declaredLen = Number(res.headers.get('content-length') || '0');
  if (Number.isFinite(declaredLen) && declaredLen > maxBytes) {
    throw new Error(`Размер файла превышает допустимый лимит (${Math.round(maxBytes / 1024 / 1024)} МБ).`);
  }

  if (!res.body) {
    throw new Error('Пустой ответ сервера.');
  }

  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => {});
        throw new Error(`Размер файла превышает допустимый лимит (${Math.round(maxBytes / 1024 / 1024)} МБ).`);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  return Buffer.concat(chunks.map((c) => Buffer.from(c)));
}

export const MYINSTANTS_ALLOWED_HOSTS = ['myinstants.com', '*.myinstants.com'];
export const DISCORD_CDN_ALLOWED_HOSTS = ['cdn.discordapp.com', 'media.discordapp.net'];

/**
 * Проверяет, что ссылка саундборда — строго HTTPS-аудиофайл с MyInstants.
 */
export async function assertTrustedMyInstantsAudioUrl(rawUrl: string): Promise<URL> {
  const parsed = await assertSafePublicHttpUrl(rawUrl, {
    httpsOnly: true,
    allowedHosts: MYINSTANTS_ALLOWED_HOSTS,
  });

  if (!parsed.pathname.startsWith('/media/sounds/') || parsed.pathname.includes('..')) {
    throw new Error('Разрешены только прямые аудиоссылки MyInstants (/media/sounds/...).');
  }

  return parsed;
}

export async function assertTrustedDiscordCdnUrl(rawUrl: string): Promise<URL> {
  return assertSafePublicHttpUrl(rawUrl, {
    httpsOnly: true,
    allowedHosts: DISCORD_CDN_ALLOWED_HOSTS,
  });
}

// ========================================================
// 4. Строгая санитизация YouTube Cookies (защита от утечек и инъекций)
// ========================================================
const MAX_COOKIES_BYTES = 256 * 1024; // 256 KB
const MAX_COOKIES_LINES = 1000;

function isSafeAsciiCookieValue(str: string): boolean {
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    // Только печатный ASCII (0x20..0x7E) без управляющих символов и \r/\n/\0
    if (code < 0x20 || code > 0x7e) return false;
  }
  return true;
}

export interface SanitizedCookiesResult {
  sanitized: string;
  keptCount: number;
  strippedCount: number;
}

/**
 * Санитизирует загруженные YouTube cookies:
 * - Ограничивает размер (256 КБ) и количество строк (1000).
 * - Отклоняет нулевые байты и управляющие символы (CRLF-инъекции).
 * - Для формата Netscape cookies.txt АВТОМАТИЧЕСКИ ВЫРЕЗАЕТ все посторонние домены
 *   (оставляя ТОЛЬКО youtube.com и *.youtube.com), чтобы случайно не сохранить на диск
 *   чужие/банковские/Discord-куки администратора!
 */
export function sanitizeYouTubeCookies(rawContent: string): SanitizedCookiesResult {
  if (typeof rawContent !== 'string') {
    throw new Error('Содержимое cookies должно быть текстом.');
  }

  if (Buffer.byteLength(rawContent, 'utf-8') > MAX_COOKIES_BYTES) {
    throw new Error('Файл cookies слишком большой (максимум 256 КБ).');
  }

  if (rawContent.includes('\0')) {
    throw new Error('Файл cookies содержит недопустимые бинарные символы.');
  }

  const normalized = rawContent.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  if (normalized.length < 20) {
    throw new Error('Файл cookies пустой или слишком короткий.');
  }

  const lines = normalized.split('\n');
  if (lines.length > MAX_COOKIES_LINES) {
    throw new Error(`Слишком много строк в файле cookies (максимум ${MAX_COOKIES_LINES}).`);
  }

  // Режим 1: Netscape HTTP Cookie File (содержит табуляцию)
  if (normalized.includes('\t')) {
    const keptLines: string[] = ['# Netscape HTTP Cookie File'];
    let keptCount = 0;
    let strippedCount = 0;

    for (const rawLine of lines) {
      const trimmed = rawLine.trim();
      if (!trimmed) continue;

      const isHttpOnly = trimmed.startsWith('#HttpOnly_');
      if (trimmed.startsWith('#') && !isHttpOnly) {
        continue; // Пропускаем произвольные комментарии
      }

      const body = isHttpOnly ? trimmed.slice('#HttpOnly_'.length) : trimmed;
      const cols = body.split('\t');
      if (cols.length < 7) {
        continue;
      }

      const [domain, flag, cookiePath, secure, expiry, name, ...restVal] = cols;
      const value = restVal.join('\t');
      const cleanHost = domain.trim().toLowerCase().replace(/^\./, '');

      // Оставляем строго домены YouTube — @distube/ytdl-core использует только их!
      if (cleanHost !== 'youtube.com' && !cleanHost.endsWith('.youtube.com')) {
        strippedCount++;
        continue;
      }

      const cleanName = name.trim();
      const cleanVal = value.trim();
      if (
        !cleanName ||
        !/^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/.test(cleanName) ||
        !isSafeAsciiCookieValue(cleanVal)
      ) {
        continue;
      }

      const safeFlag = flag.trim().toUpperCase() === 'FALSE' ? 'FALSE' : 'TRUE';
      const safePath = cookiePath.trim().startsWith('/') ? cookiePath.trim() : '/';
      const safeSecure = secure.trim().toUpperCase() === 'FALSE' ? 'FALSE' : 'TRUE';
      const safeExpiry = /^\d+$/.test(expiry.trim()) ? expiry.trim() : '0';

      const prefix = isHttpOnly ? '#HttpOnly_' : '';
      keptLines.push(
        `${prefix}${domain.trim()}\t${safeFlag}\t${safePath}\t${safeSecure}\t${safeExpiry}\t${cleanName}\t${cleanVal}`
      );
      keptCount++;
    }

    if (keptCount === 0) {
      throw new Error(
        'В файле не найдено валидных cookies для youtube.com. Экспортируйте cookies со страницы youtube.com/robots.txt.'
      );
    }

    return {
      sanitized: keptLines.join('\n'),
      keptCount,
      strippedCount,
    };
  }

  // Режим 2: Строка заголовка Cookie (KEY=VAL; KEY2=VAL2)
  if (lines.length > 1) {
    throw new Error(
      'Нераспознанный формат cookies. Загрузите файл в формате Netscape cookies.txt (с табуляциями) или однострочный заголовок Cookie.'
    );
  }

  const pairs: string[] = [];
  for (const part of normalized.split(';')) {
    const eq = part.indexOf('=');
    if (eq <= 0) continue;
    const name = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (
      !name ||
      !/^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/.test(name) ||
      !isSafeAsciiCookieValue(value)
    ) {
      continue;
    }
    pairs.push(`${name}=${value}`);
  }

  if (pairs.length === 0) {
    throw new Error('В строке не найдено валидных пар cookie (NAME=VALUE).');
  }

  return {
    sanitized: pairs.join('; '),
    keptCount: pairs.length,
    strippedCount: 0,
  };
}

// ========================================================
// 5. Редакция секретов и путей в текстах ошибок
// ========================================================
export function redactSensitiveText(input: string): string {
  let out = String(input || '');
  const secrets = [
    config.discordToken,
    config.clientSecret,
    config.spotifyClientSecret,
    config.ytCookie,
    ...config.workerTokens,
  ].filter((s) => s && s.length >= 8);

  for (const secret of secrets) {
    if (out.includes(secret)) {
      out = out.split(secret).join('[REDACTED]');
    }
  }

  const cwd = process.cwd();
  if (cwd && out.includes(cwd)) {
    out = out.split(cwd).join('.');
  }

  return out;
}
