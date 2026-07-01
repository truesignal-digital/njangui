import { v } from 'convex/values';
import type { Doc, Id } from './_generated/dataModel';
import { internal } from './_generated/api';
import {
  internalAction,
  internalQuery,
  type MutationCtx,
} from './_generated/server';

// ============================================================================
// Expo push pipeline (05 M12 / Week 3): the in-app inbox is the GUARANTEED
// channel; push is best-effort on top. Mutations never call the network —
// they schedule internal.push.sendToUsers via ctx.scheduler (fire-and-
// forget, same-transaction safety). Copy is bilingual; each recipient gets
// their own `users.language`.
// ============================================================================

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const PUSH_CHUNK = 90; // Expo caps batches at 100

export interface BilingualPushCopy {
  titleFr: string;
  titleEn: string;
  bodyFr: string;
  bodyEn: string;
  /** In-app deep link, e.g. `/payments/<id>` — the notification tap target. */
  url?: string;
}

/**
 * Resolve membership rows → linked userIds (feature-phone members have no
 * userId and simply receive nothing — their channel is the réunion + the
 * treasurer's voice, 05 Week 4), then schedule the send action. Call from
 * mutations only.
 */
export async function notifyMemberships(
  ctx: MutationCtx,
  membershipIds: Id<'memberships'>[],
  copy: BilingualPushCopy
): Promise<void> {
  const userIds: Id<'users'>[] = [];
  for (const membershipId of membershipIds) {
    const membership = await ctx.db.get(membershipId);
    if (membership?.userId !== undefined && membership.status === 'active') {
      userIds.push(membership.userId);
    }
  }
  if (userIds.length === 0) {
    return;
  }
  await ctx.scheduler.runAfter(0, internal.push.sendToUsers, {
    userIds,
    ...copy,
  });
}

export const getRecipients = internalQuery({
  args: {
    userIds: v.array(v.id('users')),
  },
  returns: v.array(
    v.object({
      token: v.string(),
      language: v.union(v.literal('fr'), v.literal('en')),
    })
  ),
  handler: async (ctx, args) => {
    const recipients: { token: string; language: 'fr' | 'en' }[] = [];
    for (const userId of args.userIds) {
      const user = (await ctx.db.get(userId)) as Doc<'users'> | null;
      if (!user || user.isDeactivated) {
        continue;
      }
      for (const pushToken of user.pushTokens ?? []) {
        recipients.push({ token: pushToken.token, language: user.language });
      }
    }
    return recipients;
  },
});

export const sendToUsers = internalAction({
  args: {
    userIds: v.array(v.id('users')),
    titleFr: v.string(),
    titleEn: v.string(),
    bodyFr: v.string(),
    bodyEn: v.string(),
    url: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const recipients: { token: string; language: 'fr' | 'en' }[] =
      await ctx.runQuery(internal.push.getRecipients, {
        userIds: args.userIds,
      });
    if (recipients.length === 0) {
      return null;
    }

    const messages = recipients.map((r) => ({
      to: r.token,
      title: r.language === 'en' ? args.titleEn : args.titleFr,
      body: r.language === 'en' ? args.bodyEn : args.bodyFr,
      ...(args.url !== undefined && { data: { url: args.url } }),
      sound: 'default' as const,
    }));

    for (let i = 0; i < messages.length; i += PUSH_CHUNK) {
      const chunk = messages.slice(i, i + PUSH_CHUNK);
      try {
        const response = await fetch(EXPO_PUSH_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(chunk),
        });
        if (!response.ok) {
          console.error(
            `Expo push send failed: ${response.status} ${await response.text()}`
          );
        }
      } catch (error) {
        // Push is best-effort — the in-app inbox already carries the signal.
        console.error('Expo push send error', error);
      }
    }
    return null;
  },
});
