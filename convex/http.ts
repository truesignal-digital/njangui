import { httpRouter } from 'convex/server';
import { Webhook } from 'svix';
import { internal } from './_generated/api';
import { httpAction } from './_generated/server';

// ─────────────────────────────────────────────────────────────────────────────
// CUSTODY-FREE RED LINE (docs/00-overview.md, locked decision 1):
// This router must NEVER contain payment-provider webhooks for member money
// (no MTN MoMo, no Orange Money, no PSP callbacks). Money moves wallet-to-
// wallet outside the app; the app is only a ledger. The single future
// exception is collecting the app's OWN premium subscription fee.
// ─────────────────────────────────────────────────────────────────────────────

const http = httpRouter();

function normalizeWebhookEventType(value: unknown) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[\s\u200b-\u200d\u2060\ufeff]+/g, "")
    .trim();
}

// Clerk webhook endpoint with signature verification
http.route({
  path: '/clerk-webhook',
  method: 'POST',
  handler: httpAction(async (ctx, request) => {
    const webhookSecret = process.env.CLERK_WEBHOOK_SECRET;
    if (!webhookSecret) {
      console.error('CLERK_WEBHOOK_SECRET is not configured');
      return new Response(JSON.stringify({ error: 'Webhook secret not configured' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Get Svix headers for verification
    const svixId = request.headers.get('svix-id');
    const svixTimestamp = request.headers.get('svix-timestamp');
    const svixSignature = request.headers.get('svix-signature');

    if (!svixId || !svixTimestamp || !svixSignature) {
      return new Response(JSON.stringify({ error: 'Missing Svix verification headers' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const payload = await request.text();
    let eventData: any;

    try {
      const wh = new Webhook(webhookSecret);
      eventData = wh.verify(payload, {
        'svix-id': svixId,
        'svix-timestamp': svixTimestamp,
        'svix-signature': svixSignature,
      });
    } catch (err) {
      console.error('Clerk webhook verification failed:', err);
      return new Response(JSON.stringify({ error: 'Invalid signature' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const rawEventType = String(eventData.type ?? '');
    const eventType = normalizeWebhookEventType(eventData.type);
    const userData = eventData.data;

    // 🔒 linkGuard: the webhook forwards name/avatar ONLY. The Clerk phone
    // is NOT possession-verified by anything Clerk did once OTP delivery
    // moved to WhatsApp — users.phone is set exclusively by
    // internal.users.setVerifiedPhone after a fresh OTP proof.
    const name =
      [userData?.first_name, userData?.last_name].filter(Boolean).join(' ') || undefined;
    const avatarUrl = userData?.image_url || undefined;
    // Clerk-owned identifiers mirrored for member search / email notify —
    // NOT the phone (linkGuard): username/email carry no membership grant.
    const username = userData?.username || undefined;
    const email =
      userData?.email_addresses?.find(
        (e: { id: string }) => e.id === userData?.primary_email_address_id
      )?.email_address ??
      userData?.email_addresses?.[0]?.email_address ??
      undefined;

    console.log(
      `Received Clerk webhook: raw=${JSON.stringify(rawEventType)} normalized=${JSON.stringify(eventType)}`
    );

    try {
      switch (eventType) {
        case 'user.created':
          await ctx.runMutation(internal.users.createUserFromClerk, {
            clerkId: userData.id,
            name: name ?? '',
            avatarUrl,
            username,
            email,
          });
          break;

        case 'user.updated':
          await ctx.runMutation(internal.users.updateUserFromClerk, {
            clerkId: userData.id,
            name,
            avatarUrl,
            username,
            email,
          });
          break;

        case 'user.deleted':
          await ctx.runMutation(internal.users.deleteUserByClerkId, {
            clerkId: userData.id,
          });
          break;

        default:
          console.log(`Unhandled webhook event: ${rawEventType}`);
      }

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (error) {
      console.error('Webhook processing error:', error);
      return new Response(JSON.stringify({ error: 'Webhook processing failed' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }),
});

// Health check endpoint
http.route({
  path: '/health',
  method: 'GET',
  handler: httpAction(async () => {
    return new Response(
      JSON.stringify({
        status: 'ok',
        timestamp: Date.now(),
        version: '1.0.0',
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }),
});

export default http;
