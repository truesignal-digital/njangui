import { v } from 'convex/values';
import { query } from './_generated/server';
import { appLanguageValidator, paymentMethodValidator } from './schema';

const ussdContentValidator = v.object({
  title: v.string(),
  steps: v.array(v.string()),
  version: v.number(),
});

/**
 * OTA override for the USSD instruction screens (docs/03 §C SPEC NOTE /
 * R3): carrier menus drift, so corrected steps ship as data — no app-store
 * release. The app renders bundled-or-cached content immediately and
 * upgrades to this row when its `version` is newer (src/lib/ussd-content.ts
 * owns the three-tier priority). Content is not group-scoped — no auth
 * gate beyond a session (public knowledge, zero member data).
 */
export const getUssdContent = query({
  args: {
    method: paymentMethodValidator,
    language: appLanguageValidator,
  },
  returns: v.union(v.null(), ussdContentValidator),
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query('ussdContent')
      .withIndex('by_method_and_language', (q) =>
        q.eq('method', args.method).eq('language', args.language)
      )
      .first();
    if (!row) {
      return null;
    }
    return { title: row.title, steps: row.steps, version: row.version };
  },
});
