import { and, eq, inArray } from 'drizzle-orm';
import { db } from '../db/index.js';
import { reactions } from '../db/schema.js';

export type ReactionTargetType = 'playlist' | 'sound';
export type ReactionVote = 1 | -1 | 0;

export interface ReactionSummary {
  likes: number;
  dislikes: number;
  myVote: ReactionVote;
}

export class ReactionService {
  public static async getSummaries(
    targetType: ReactionTargetType,
    targetIds: number[],
    viewerUserId: string
  ): Promise<Map<number, ReactionSummary>> {
    const result = new Map<number, ReactionSummary>();
    for (const id of targetIds) {
      result.set(id, { likes: 0, dislikes: 0, myVote: 0 });
    }
    if (targetIds.length === 0) return result;

    const rows = await db
      .select()
      .from(reactions)
      .where(and(eq(reactions.targetType, targetType), inArray(reactions.targetId, targetIds)));

    for (const row of rows) {
      const entry = result.get(row.targetId);
      if (!entry) continue;
      if (row.value === 1) entry.likes += 1;
      else if (row.value === -1) entry.dislikes += 1;
      if (row.userId === viewerUserId) {
        entry.myVote = row.value === 1 ? 1 : row.value === -1 ? -1 : 0;
      }
    }

    return result;
  }

  public static async setVote(params: {
    targetType: ReactionTargetType;
    targetId: number;
    userId: string;
    value: ReactionVote;
  }): Promise<ReactionSummary> {
    const [existing] = await db
      .select()
      .from(reactions)
      .where(
        and(
          eq(reactions.targetType, params.targetType),
          eq(reactions.targetId, params.targetId),
          eq(reactions.userId, params.userId)
        )
      )
      .limit(1);

    if (params.value === 0 || (existing && existing.value === params.value)) {
      if (existing) {
        await db.delete(reactions).where(eq(reactions.id, existing.id));
      }
    } else if (existing) {
      await db
        .update(reactions)
        .set({ value: params.value, createdAt: Date.now() })
        .where(eq(reactions.id, existing.id));
    } else {
      await db.insert(reactions).values({
        targetType: params.targetType,
        targetId: params.targetId,
        userId: params.userId,
        value: params.value,
        createdAt: Date.now(),
      });
    }

    const map = await this.getSummaries(params.targetType, [params.targetId], params.userId);
    return map.get(params.targetId) ?? { likes: 0, dislikes: 0, myVote: 0 };
  }

  public static async deleteAllForTarget(
    targetType: ReactionTargetType,
    targetId: number
  ): Promise<void> {
    await db
      .delete(reactions)
      .where(and(eq(reactions.targetType, targetType), eq(reactions.targetId, targetId)));
  }
}
