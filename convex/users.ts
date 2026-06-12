import { v } from 'convex/values';
import type { Id } from './_generated/dataModel';
import {
  internalMutation,
  mutation,
  type MutationCtx,
  query,
} from './_generated/server';
import { appLanguageValidator } from './schema';
import { logActivityEvent } from './utils/activity';
import { getCurrentUserOrNull } from './utils/auth';
import { normalizePhone } from './utils/phone';

// ============================================================================
// Reusable return type validators
// ============================================================================

const currentUserValidator = v.object({
  _id: v.id('users'),
  _creationTime: v.number(),
  clerkId: v.string(),
  name: v.string(),
  phone: v.optional(v.string()),
  language: appLanguageValidator,
  avatarUrl: v.optional(v.string()),
});

// ============================================================================
// Helpers
// ============================================================================

/**
 * Link feature-phone memberships (no userId) to a freshly known user by
 * E.164 phone match (02 §a: "If that phone number later signs up via Clerk,
 * the account is linked to the existing Membership and its full history").
 */
async function linkMembershipsByPhone(ctx: MutationCtx, userId: Id<'users'>, phone: string) {
  const matches = await ctx.db
    .query('memberships')
    .withIndex('by_phone', (q) => q.eq('phone', phone))
    .collect();

  for (const membership of matches) {
    if (membership.userId !== undefined) {
      continue;
    }
    await ctx.db.patch(membership._id, { userId });
    await logActivityEvent(ctx, {
      groupId: membership.groupId,
      kind: 'member_linked',
      entityTable: 'memberships',
      entityId: membership._id,
      note: `${membership.displayName} a créé un compte — historique relié`,
    });
  }
}

/**
 * users.phone is unique (01 §3.1, mutation-enforced). Returns the phone if
 * it is free (or held by `selfId`), otherwise undefined — Clerk is the
 * identity authority, so a collision is logged and the phone dropped rather
 * than failing the sync.
 */
async function phoneIfAvailable(
  ctx: MutationCtx,
  phone: string | undefined,
  selfId?: Id<'users'>
): Promise<string | undefined> {
  if (!phone) {
    return undefined;
  }
  const normalized = normalizePhone(phone);
  const holder = await ctx.db
    .query('users')
    .withIndex('by_phone', (q) => q.eq('phone', normalized))
    .first();
  if (holder && holder._id !== selfId) {
    console.error(`Phone ${normalized} already held by user ${holder._id} — dropping from sync`);
    return undefined;
  }
  return normalized;
}

// ============================================================================
// Internal mutations — Clerk webhook sync (convex/http.ts)
// ============================================================================

export const createUserFromClerk = internalMutation({
  args: {
    clerkId: v.string(),
    name: v.string(),
    phone: v.optional(v.string()),
    avatarUrl: v.optional(v.string()),
  },
  returns: v.id('users'),
  handler: async (ctx, args) => {
    const existingUser = await ctx.db
      .query('users')
      .withIndex('by_clerk_id', (q) => q.eq('clerkId', args.clerkId))
      .unique();

    if (existingUser) {
      return existingUser._id;
    }

    const phone = await phoneIfAvailable(ctx, args.phone);

    const userId = await ctx.db.insert('users', {
      clerkId: args.clerkId,
      name: args.name || phone || '',
      phone,
      language: 'fr',
      avatarUrl: args.avatarUrl,
    });

    if (phone) {
      await linkMembershipsByPhone(ctx, userId, phone);
    }

    return userId;
  },
});

export const updateUserFromClerk = internalMutation({
  args: {
    clerkId: v.string(),
    name: v.optional(v.string()),
    phone: v.optional(v.string()),
    avatarUrl: v.optional(v.string()),
  },
  returns: v.union(v.null(), v.id('users')),
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query('users')
      .withIndex('by_clerk_id', (q) => q.eq('clerkId', args.clerkId))
      .unique();

    if (!user) {
      console.log(`User with clerkId ${args.clerkId} not found for update`);
      return null;
    }

    const phone = await phoneIfAvailable(ctx, args.phone, user._id);

    await ctx.db.patch(user._id, {
      ...(args.name !== undefined && { name: args.name }),
      ...(phone !== undefined && { phone }),
      ...(args.avatarUrl !== undefined && { avatarUrl: args.avatarUrl }),
    });

    if (phone && phone !== user.phone) {
      await linkMembershipsByPhone(ctx, user._id, phone);
    }

    return user._id;
  },
});

export const deleteUserByClerkId = internalMutation({
  args: {
    clerkId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query('users')
      .withIndex('by_clerk_id', (q) => q.eq('clerkId', args.clerkId))
      .unique();

    if (!user) {
      return null;
    }

    // Soft delete only — memberships and ledger rows reference this user
    // forever (decision 6: immutability is the product).
    await ctx.db.patch(user._id, { isDeactivated: true });
    return null;
  },
});

// ============================================================================
// Public queries
// ============================================================================

export const current = query({
  args: {},
  returns: v.union(v.null(), currentUserValidator),
  handler: async (ctx) => {
    const result = await getCurrentUserOrNull(ctx);
    if (!result) {
      return null;
    }
    const { user } = result;
    return {
      _id: user._id,
      _creationTime: user._creationTime,
      clerkId: user.clerkId,
      name: user.name,
      phone: user.phone,
      language: user.language,
      avatarUrl: user.avatarUrl,
    };
  },
});

// ============================================================================
// Public mutations
// ============================================================================

/**
 * Webhook-race fallback (src/hooks/use-ensure-user.ts calls this once after
 * sign-in): create the user from JWT claims if the Clerk webhook hasn't
 * landed yet. Idempotent.
 */
export const getOrCreateCurrentUser = mutation({
  args: {},
  returns: v.union(v.null(), currentUserValidator),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error('Not authenticated');
    }

    const clerkId = identity.subject;

    const existingUser = await ctx.db
      .query('users')
      .withIndex('by_clerk_id', (q) => q.eq('clerkId', clerkId))
      .unique();

    if (existingUser) {
      return {
        _id: existingUser._id,
        _creationTime: existingUser._creationTime,
        clerkId: existingUser.clerkId,
        name: existingUser.name,
        phone: existingUser.phone,
        language: existingUser.language,
        avatarUrl: existingUser.avatarUrl,
      };
    }

    // Identity is phone-first (Clerk SMS OTP, 05 Week 1).
    const phone = await phoneIfAvailable(
      ctx,
      typeof identity.phoneNumber === 'string' ? identity.phoneNumber : undefined
    );
    const name =
      (typeof identity.name === 'string' && identity.name) ||
      [identity.givenName, identity.familyName].filter(Boolean).join(' ') ||
      phone ||
      '';
    const avatarUrl = typeof identity.pictureUrl === 'string' ? identity.pictureUrl : undefined;

    const userId = await ctx.db.insert('users', {
      clerkId,
      name,
      phone,
      language: 'fr',
      avatarUrl,
    });

    if (phone) {
      await linkMembershipsByPhone(ctx, userId, phone);
    }

    const newUser = await ctx.db.get(userId);
    if (!newUser) {
      return null;
    }
    return {
      _id: newUser._id,
      _creationTime: newUser._creationTime,
      clerkId: newUser.clerkId,
      name: newUser.name,
      phone: newUser.phone,
      language: newUser.language,
      avatarUrl: newUser.avatarUrl,
    };
  },
});

/**
 * Onboarding (docs/03 B10 « Comment le groupe vous appelle-t-il ? »): set the
 * display name on the current user.
 */
export const updateMyName = mutation({
  args: {
    name: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error('Not authenticated');
    }

    const user = await ctx.db
      .query('users')
      .withIndex('by_clerk_id', (q) => q.eq('clerkId', identity.subject))
      .unique();

    if (!user) {
      throw new Error('User not found');
    }

    const name = args.name.trim();
    if (!name) {
      throw new Error('Name is required');
    }

    await ctx.db.patch(user._id, { name });
    return null;
  },
});

export const updateLanguage = mutation({
  args: {
    language: appLanguageValidator,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error('Not authenticated');
    }

    const user = await ctx.db
      .query('users')
      .withIndex('by_clerk_id', (q) => q.eq('clerkId', identity.subject))
      .unique();

    if (!user) {
      throw new Error('User not found');
    }

    await ctx.db.patch(user._id, { language: args.language });
    return null;
  },
});
