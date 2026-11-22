import {
  Client,
  GuildMember,
  PermissionFlagsBits,
  VoiceBasedChannel,
} from 'discord.js';
import { eq, lt } from 'drizzle-orm';
import crypto from 'node:crypto';
import { config } from '../config.js';
import { db } from '../db/index.js';
import { dashboardSettings, webSessions, type WebSession } from '../db/schema.js';

interface MagicLoginEntry {
  userId: string;
  username: string;
  avatar: string | null;
  guildId?: string;
  expiresAt: number;
}

const magicTokens = new Map<string, MagicLoginEntry>();
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 дней
const MAGIC_TTL_MS = 10 * 60 * 1000; // 10 минут

export interface SharedGuildInfo {
  id: string;
  name: string;
  iconUrl: string | null;
  inVoice: boolean;
  channelId: string | null;
  channelName: string | null;
}

export interface MemberVoiceContext {
  inVoice: boolean;
  channelId: string | null;
  channelName: string | null;
  membersCount: number;
}

export interface ResolvedMemberContext {
  guildId: string | null;
  guildName: string;
  member: GuildMember | null;
  inGuild: boolean;
  isAdmin: boolean;
  canManageCookies: boolean;
  hasAccess: boolean;
  requiredRoleId: string | null;
  requiredRoleName: string | null;
  displayName: string;
  avatarUrl: string | null;
  voice: MemberVoiceContext;
  sharedGuilds: SharedGuildInfo[];
}

export function createMagicLoginLink(user: {
  id: string;
  tag: string;
  avatarUrl: string | null;
  guildId?: string;
}): string {
  const now = Date.now();
  for (const [k, v] of magicTokens.entries()) {
    if (v.expiresAt < now) magicTokens.delete(k);
  }
  while (magicTokens.size >= 500) {
    const oldestKey = magicTokens.keys().next().value;
    if (!oldestKey) break;
    magicTokens.delete(oldestKey);
  }

  const token = crypto.randomBytes(24).toString('hex');
  magicTokens.set(token, {
    userId: user.id,
    username: user.tag,
    avatar: user.avatarUrl,
    guildId: user.guildId,
    expiresAt: now + MAGIC_TTL_MS,
  });

  return `${config.publicUrl}/api/auth/magic?token=${token}`;
}

export function consumeMagicToken(token: string): MagicLoginEntry | null {
  const entry = magicTokens.get(token);
  if (!entry) return null;
  magicTokens.delete(token);
  if (entry.expiresAt < Date.now()) return null;
  return entry;
}

export async function createWebSession(user: {
  userId: string;
  username: string;
  avatar: string | null;
  activeGuildId?: string | null;
}): Promise<WebSession> {
  await db.delete(webSessions).where(lt(webSessions.expiresAt, new Date())).catch(() => {});

  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  const [session] = await db
    .insert(webSessions)
    .values({
      token,
      userId: user.userId,
      username: user.username,
      avatar: user.avatar,
      activeGuildId: user.activeGuildId ?? null,
      expiresAt,
    })
    .returning();

  return session;
}

export async function updateSessionActiveGuild(
  token: string,
  guildId: string
): Promise<void> {
  await db
    .update(webSessions)
    .set({ activeGuildId: guildId })
    .where(eq(webSessions.token, token));
}

export async function getWebSession(token: string | null | undefined): Promise<WebSession | null> {
  if (!token) return null;
  const [session] = await db
    .select()
    .from(webSessions)
    .where(eq(webSessions.token, token))
    .limit(1);

  if (!session) return null;
  if (session.expiresAt.getTime() < Date.now()) {
    await db.delete(webSessions).where(eq(webSessions.token, token)).catch(() => {});
    return null;
  }

  return session;
}

export async function deleteWebSession(token: string): Promise<void> {
  await db.delete(webSessions).where(eq(webSessions.token, token));
}

export async function getRequiredRoleId(guildId: string): Promise<string | null> {
  const [row] = await db
    .select()
    .from(dashboardSettings)
    .where(eq(dashboardSettings.guildId, guildId))
    .limit(1);
  return row?.requiredRoleId ?? null;
}

export async function setRequiredRoleId(
  guildId: string,
  requiredRoleId: string | null
): Promise<void> {
  const existing = await db
    .select()
    .from(dashboardSettings)
    .where(eq(dashboardSettings.guildId, guildId))
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(dashboardSettings)
      .set({ requiredRoleId, updatedAt: new Date() })
      .where(eq(dashboardSettings.guildId, guildId));
  } else {
    await db.insert(dashboardSettings).values({
      guildId,
      requiredRoleId,
      updatedAt: new Date(),
    });
  }
}

export async function getUserSharedGuilds(
  client: Client,
  userId: string
): Promise<Array<{ guildId: string; member: GuildMember; info: SharedGuildInfo }>> {
  const shared: Array<{ guildId: string; member: GuildMember; info: SharedGuildInfo }> = [];

  for (const guild of client.guilds.cache.values()) {
    let member: GuildMember | null = guild.members.cache.get(userId) ?? null;
    if (!member) {
      try {
        member = await guild.members.fetch(userId);
      } catch {
        member = null;
      }
    }
    if (!member) continue;

    const voiceState = guild.voiceStates.cache.get(userId);
    const voiceChannel = (voiceState?.channel ?? null) as VoiceBasedChannel | null;

    shared.push({
      guildId: guild.id,
      member,
      info: {
        id: guild.id,
        name: guild.name,
        iconUrl: guild.iconURL({ size: 64 }),
        inVoice: voiceChannel !== null,
        channelId: voiceChannel?.id ?? null,
        channelName: voiceChannel?.name ?? null,
      },
    });
  }

  return shared;
}

export async function resolveMemberContext(
  client: Client,
  userId: string,
  preferredGuildId?: string | null
): Promise<ResolvedMemberContext> {
  const shared = await getUserSharedGuilds(client, userId);
  const sharedGuilds = shared.map((s) => s.info);

  if (shared.length === 0) {
    return {
      guildId: null,
      guildName: 'Нет общих серверов',
      member: null,
      inGuild: false,
      isAdmin: false,
      canManageCookies: false,
      hasAccess: false,
      requiredRoleId: null,
      requiredRoleName: null,
      displayName: 'Не на сервере',
      avatarUrl: null,
      voice: { inVoice: false, channelId: null, channelName: null, membersCount: 0 },
      sharedGuilds: [],
    };
  }

  // Приоритет выбора активного сервера:
  // 1) Предпочтительный сервер, если пользователь сейчас в его голосовом канале
  // 2) Любой общий сервер, в голосовом канале которого пользователь сейчас сидит
  // 3) Предпочтительный сервер (выбранный вручную или откуда вызвали /web)
  // 4) Первый общий сервер
  const preferredEntry = preferredGuildId
    ? shared.find((s) => s.guildId === preferredGuildId)
    : undefined;
  const voiceEntry = shared.find((s) => s.info.inVoice);

  const active =
    (preferredEntry?.info.inVoice ? preferredEntry : null) ??
    voiceEntry ??
    preferredEntry ??
    shared[0];

  const guild = client.guilds.cache.get(active.guildId)!;
  const member = active.member;
  const requiredRoleId = await getRequiredRoleId(guild.id);
  const requiredRoleName = requiredRoleId
    ? guild.roles.cache.get(requiredRoleId)?.name ?? null
    : null;

  const isAdmin = member.permissions.has(PermissionFlagsBits.Administrator);
  const canManageCookies =
    isAdmin && (config.botOwnerIds.length === 0 || config.botOwnerIds.includes(userId));
  const hasAccess = isAdmin || !requiredRoleId || member.roles.cache.has(requiredRoleId);

  const voiceState = guild.voiceStates.cache.get(userId);
  const voiceChannel = (voiceState?.channel ?? null) as VoiceBasedChannel | null;
  const membersCount = voiceChannel
    ? voiceChannel.members.filter((m) => !m.user.bot).size
    : 0;

  return {
    guildId: guild.id,
    guildName: guild.name,
    member,
    inGuild: true,
    isAdmin,
    canManageCookies,
    hasAccess,
    requiredRoleId,
    requiredRoleName,
    displayName: member.displayName,
    avatarUrl: member.displayAvatarURL({ size: 128 }),
    voice: {
      inVoice: voiceChannel !== null,
      channelId: voiceChannel?.id ?? null,
      channelName: voiceChannel?.name ?? null,
      membersCount,
    },
    sharedGuilds,
  };
}

/**
 * Живая проверка прав Администратора напрямую через Discord API (force: true),
 * минуя локальный кэш discord.js — снятие админской роли на сервере блокирует доступ МГНОВЕННО!
 */
export async function verifyLiveGuildAdmin(
  client: Client,
  guildId: string,
  userId: string
): Promise<boolean> {
  const guild = client.guilds.cache.get(guildId);
  if (!guild) return false;
  try {
    const freshMember = await guild.members.fetch({ user: userId, force: true });
    return freshMember.permissions.has(PermissionFlagsBits.Administrator);
  } catch {
    return false;
  }
}

/**
 * Проверка права на управление глобальными YouTube cookies:
 * 1) Пользователь обязан прямо сейчас иметь роль/право Administrator на сервере (живой запрос к Discord API).
 * 2) Если в .env задан BOT_OWNER_IDS — дополнительно требуется вхождение userId в этот список.
 */
export async function canManageGlobalCookies(
  client: Client,
  guildId: string,
  userId: string
): Promise<boolean> {
  if (config.botOwnerIds.length > 0 && !config.botOwnerIds.includes(userId)) {
    return false;
  }
  return verifyLiveGuildAdmin(client, guildId, userId);
}
