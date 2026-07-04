import { v } from 'convex/values';
import { internalAction } from './_generated/server';

// ============================================================================
// Transactional email via Resend (REST — no SDK dependency). Env-gated:
// without RESEND_API_KEY the action logs and returns, so email stays an
// optional channel (push + the réunion remain the primary ones). Until a
// sending domain is verified, the resend.dev sandbox sender only delivers
// to the Resend account owner's inbox — fine for dev.
// ============================================================================

const FROM = 'Njangi <onboarding@resend.dev>';

async function sendEmail(args: {
  to: string;
  subject: string;
  html: string;
  idempotencyKey: string;
}): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.log('RESEND_API_KEY not set — email skipped');
    return;
  }
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': args.idempotencyKey,
    },
    body: JSON.stringify({
      from: FROM,
      to: [args.to],
      subject: args.subject,
      html: args.html,
    }),
  });
  if (!response.ok) {
    // 403 = sandbox sender to a non-owner inbox (expected pre-domain-verify).
    // Never fail the calling flow over a courtesy email.
    console.error(`Resend send failed: ${response.status}`);
  }
}

/** "You've been added to a group" courtesy notice (push is the primary channel). */
export const sendMemberAdded = internalAction({
  args: {
    email: v.string(),
    memberName: v.string(),
    groupName: v.string(),
    actorName: v.string(),
    language: v.union(v.literal('fr'), v.literal('en')),
    membershipId: v.id('memberships'), // idempotency anchor
  },
  returns: v.null(),
  handler: async (_ctx, args) => {
    const fr = args.language === 'fr';
    const subject = fr
      ? `Vous avez été ajouté(e) au njangi « ${args.groupName} »`
      : `You've been added to the njangi "${args.groupName}"`;
    const html = fr
      ? `<p>Bonjour ${args.memberName},</p>
<p><strong>${args.actorName}</strong> vous a ajouté(e) au njangi <strong>« ${args.groupName} »</strong> sur Njangi.</p>
<p>Ouvrez l'application pour voir le groupe, le calendrier des tours et votre carnet.</p>
<p>— Njangi · Pas de frais. Votre argent ne passe jamais par l'appli.</p>`
      : `<p>Hello ${args.memberName},</p>
<p><strong>${args.actorName}</strong> added you to the njangi <strong>"${args.groupName}"</strong> on Njangi.</p>
<p>Open the app to see the group, the round calendar and your ledger.</p>
<p>— Njangi · No fees. Your money never passes through the app.</p>`;
    await sendEmail({
      to: args.email,
      subject,
      html,
      idempotencyKey: `member-added/${args.membershipId}`,
    });
    return null;
  },
});
