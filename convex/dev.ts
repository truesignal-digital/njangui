import { v } from 'convex/values';
import { mutation } from './_generated/server';
import { generateUniqueInviteCode } from './groups';
import { logActivityEvent } from './utils/activity';
import { getCurrentUser } from './utils/auth';

// ============================================================================
// DEV-ONLY seed helpers — for driving VERIFY (running the app hands-free)
// without the simulator's text-input wall. GUARDED two ways: the frontend
// only mounts the trigger under __DEV__, AND every function here refuses
// unless DEV_SEED_ENABLED='true' is set on the deployment
// (`npx convex env set DEV_SEED_ENABLED true`). Never enable on production.
// ============================================================================

function assertDevSeedEnabled() {
  if (process.env.DEV_SEED_ENABLED !== 'true') {
    throw new Error(
      'devSeed is disabled — set DEV_SEED_ENABLED=true on this deployment to use it'
    );
  }
}

const SEED_NAMES = [
  'Awa Ndip',
  'Bisong Eyong',
  'Mballa Manga',
  'Ngu Tabi',
  'Fon Sone',
  'Etonde Ze',
  'Oben Arrey',
  'Sumelong Bih',
  'Achu Nformi',
  'Limbe Kima',
];

/**
 * Seed a setup-state group owned by the signed-in user (president), with a
 * treasurer + N feature-phone members — ready to drive « Démarrer le cycle ».
 * Also fills the user's name so onboarding is skipped. Returns the groupId.
 */
export const devSeed = mutation({
  args: {
    memberCount: v.optional(v.number()),
  },
  returns: v.object({ groupId: v.id('groups') }),
  handler: async (ctx, args) => {
    assertDevSeedEnabled();
    const { user } = await getCurrentUser(ctx);

    // Fill the name so the auth flow doesn't bounce to onboarding.
    if (user.name.trim().length === 0 || user.name === user.phone) {
      await ctx.db.patch(user._id, { name: 'Dev Président' });
    }
    const presidentName =
      user.name.trim().length > 0 && user.name !== user.phone
        ? user.name
        : 'Dev Président';

    const count = Math.min(Math.max(args.memberCount ?? 4, 2), 10);
    const inviteCode = await generateUniqueInviteCode(ctx);
    const now = Date.now();

    const groupId = await ctx.db.insert('groups', {
      name: 'Njangi Test',
      schedule: 'monthly',
      contributionAmount: 10000,
      graceDays: 2,
      finesEnabled: false,
      beneficiaryContributes: true,
      collectionMode: 'via_treasurer',
      inviteCode,
      status: 'setup',
      language: 'fr',
      createdByUserId: user._id,
    });

    const presidentMembershipId = await ctx.db.insert('memberships', {
      groupId,
      userId: user._id,
      phone: user.phone,
      displayName: presidentName,
      role: 'president',
      status: 'active',
      joinedAt: now,
    });

    // Feature-phone members; the first is the treasurer so startCycle's
    // treasurer guard passes.
    for (let i = 0; i < count; i++) {
      await ctx.db.insert('memberships', {
        groupId,
        phone: `+2376770${String(10000 + i).slice(-5)}`,
        displayName: SEED_NAMES[i % SEED_NAMES.length],
        role: i === 0 ? 'treasurer' : 'member',
        status: 'active',
        joinedAt: now + i + 1,
      });
    }

    await logActivityEvent(ctx, {
      groupId,
      kind: 'group_created',
      entityTable: 'groups',
      entityId: groupId,
      actorMembershipId: presidentMembershipId,
      note: 'dev seed',
    });

    return { groupId };
  },
});
