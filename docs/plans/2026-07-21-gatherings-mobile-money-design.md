# Unified Groups: Cameroon Mobile Money Design

**Date:** 2026-07-21  
**Status:** Approved product direction  
**Working brand:** OnCotise

## Decision

Expand the product from a recurring njangi ledger into the simplest way for a
Group in Cameroon to organize contributions in either mode:

1. a one-time **Contribution group**, such as a funeral, wedding, birthday, school
   event, trip, gift, church activity, or family need; or
2. a recurring **Njangi group**, with members, officer roles, a locked rotation,
   meetings, contributions, and pot handovers.

**Groups** is the only user-visible product container. Contribution and Njangi
are modes selected during creation, not separate apps, tabs, or brands.
“Gathering” remains reserved for a scheduled njangi meeting and must not name
the one-time mode in product copy or code.

Mobile Money remains the money layer. The product coordinates the purpose,
participants, payment instructions, acknowledgements, progress, reminders,
and shared history. It does not initially receive or hold member funds.

The initial positioning is:

> One link. Every contribution. Your Mobile Money stays yours.

The product promise is broader than payment tracking:

> Organize contributions for any purpose, or run the full rhythm of a
> recurring njangi.

## Why this direction

The current product has deep recurring-group machinery, but many Cameroonian
group-money moments are one-off and begin in WhatsApp. A lightweight Contribution group
creates a much faster first-use path than asking an organizer to configure a
full njangi cycle.

One-time collections also form a natural acquisition loop:

1. an organizer creates a Contribution group;
2. a WhatsApp link reaches many contributors;
3. contributors pay through the Mobile Money tools they already trust;
4. contributors see a clear shared record;
5. organizers can later create another Contribution group or graduate a stable
   group to a recurring Njangi group.

This direction preserves the strongest current product assets: two-sided
acknowledgement, durable history, role-aware actions, offline-tolerant capture,
and Mobile Money instructions.

## Product boundaries

### In scope

- Private, invite-link-based one-time Contribution groups.
- A named purpose, organizer, recipient, deadline, optional goal, and suggested
  or fixed contribution.
- MTN MoMo, Orange Money, and cash as contribution methods.
- Direct payment from a contributor to the named recipient wallet or person.
- Payer claim followed by recipient confirmation.
- Confirmed progress, pending acknowledgements, activity history, reminders,
  and WhatsApp sharing.
- A lightweight public contribution page that does not require an install or
  account before a person can understand the request and payment instructions.
- An optional post-contribution prompt to install the native app.
- A later path to licensed provider checkout and automatic payment status.

### Explicitly out of scope for the first release

- A platform-owned wallet, stored balance, escrow, or pooled account.
- Receiving one organizer's funds into another organizer's platform account.
- Automatic redistribution, refunds, disbursements, lending, or interest.
- Public discovery of fundraising campaigns.
- Charity fundraising or open-ended public crowdfunding.
- Anonymous organizers.
- Cross-border collections.
- Replacing the existing Njangi lifecycle with a generic collection model.

## Product model

### Unified Groups product contract

The Groups tab is the single place where a person finds both modes. The app
must not split Contribution groups and Njangi groups into separate tabs or
parallel home experiences.

Every item returned to the Groups tab is a discriminated summary:

```ts
type GroupSummary =
  | {
      mode: "contribution";
      id: ContributionGroupId;
      title: string;
      purpose: GroupPurpose;
      status: ContributionGroupStatus;
      confirmedAmount: number;
      goalAmount?: number;
      awaitingConfirmationCount: number;
      deadlineAt: number;
      viewerActionCount: number;
      href: string;
    }
  | {
      mode: "njangi";
      id: NjangiGroupId;
      title: string;
      purpose: GroupPurpose;
      status: NjangiGroupStatus;
      nextDueAt?: number;
      viewerDueAmount?: number;
      viewerReceivingAmount?: number;
      viewerActionCount: number;
      href: string;
    };
```

The union normalizes identity, purpose, urgency, and navigation only. It must
not invent a shared lifecycle state or force one mode's contribution records
into the other mode's tables.

Each card uses the same visual hierarchy:

1. one localized purpose tag beside or immediately above the Group name;
2. the Group name;
3. one mode-aware primary fact — confirmed progress for a Contribution group,
   or the current/next round fact for a Njangi group;
4. at most one viewer-owned attention action;
5. a quiet mode label only where the content does not already make the mode
   clear.

Groups needing an action from the viewer sort first. Open/current Groups sort
before draft, paused, closed, cancelled, or archived Groups. The final
tie-breaker is the next relevant date and then the Group name.

The existing Njangi detail route and lifecycle remain intact. Contribution
groups use their own detail route and lifecycle. Both detail screens begin with
the same Group identity header (purpose tag, name, mode-aware state, and share
action), then render mode-specific content. Route names and Convex table IDs
are implementation details and must not appear in user copy.

### One creation entry

The Groups tab has one create/join action. Its first screen offers three plain
language choices:

- **Collect for a purpose** — create a one-time Contribution group;
- **Start a njangi** — enter the existing recurring Njangi wizard;
- **Join with an invitation** — accept either supported private invitation.

Choosing a mode is not a persistent filter and does not create a separate
navigation branch. After creation or joining, the person returns to the same
Groups list.

### Contribution group

A Contribution group has:

- a title and optional cover image;
- a purpose category and plain-language description;
- an organizer identity;
- one named recipient;
- the recipient's contribution method details;
- an optional goal amount;
- a fixed, suggested, or open contribution amount;
- a deadline;
- a private share code and revocable link;
- a lifecycle state;
- contribution records and activity events.

### Purpose tag contract

Every Group has exactly one stored `purpose` value from this closed enum:

| Stored value | Français | English |
| --- | --- | --- |
| `funeral` | Deuil | Funeral |
| `wedding` | Mariage | Wedding |
| `birthday` | Anniversaire | Birthday |
| `family` | Famille | Family |
| `school` | École | School |
| `church` | Église | Church |
| `business` | Commerce | Business |
| `savings` | Épargne | Savings |
| `travel` | Voyage | Travel |
| `gift` | Cadeau | Gift |
| `association` | Association | Association |
| `other` | Autre | Other |

Store only the stable enum value. Resolve labels, icons, and presentation from
versioned app translations; never store a translated label in a Group row.
The tag is rendered as text beside or immediately above the Group name and may
have an icon or color, but meaning must never depend on color alone. There is
no multi-tag state and no user-created tag in the pilot. A Group named for an
unlisted purpose uses `other`; its title and description provide the detail.

New Contribution groups must choose a purpose before creation can continue.
The purpose remains editable in `draft` and becomes immutable when the group
opens so a shared request cannot silently change meaning.

New Njangi groups default to `savings`, visibly selected in the creation flow;
the creator may select another purpose. Existing Njangi groups are exposed as
`savings` during the compatibility deployment, then backfilled to `savings`.
Until the schema is narrowed, all reads must interpret a missing purpose as
`savings`. A president or treasurer may correct the purpose of a non-archived
Njangi group because it is descriptive metadata and does not affect ledger
state. The correction creates an attributed activity event. Archived groups
retain the migrated value.

Purpose supports recognition, filtering, localized copy, and analytics. It
never changes custody, contribution state transitions, authorization, fees, or
Mobile Money handling.

### Lifecycle

Use a deliberately small lifecycle:

```text
draft -> open -> closed
           \-> cancelled
```

- `draft`: visible only to the organizer; details can change.
- `open`: the share link accepts new contribution claims.
- `closed`: no new claims; history remains visible.
- `cancelled`: no new claims; the page explains that money already sent must be
  handled directly between the contributor and recipient.

Reaching a goal does not automatically close a Contribution group. The organizer closes
it explicitly because legitimate overfunding is common and funds do not sit in
the app.

### Contribution truth

Reuse the existing two-sided model:

```text
pending -> claimed -> confirmed
                   \-> disputed
claimed/disputed -> cancelled
```

For direct Mobile Money:

1. the contributor pays outside the app;
2. the contributor claims the contribution with amount, method, and optional
   transaction reference or image;
3. the recipient confirms receipt;
4. only confirmed amounts count toward confirmed progress.

The UI may separately show claimed contributions awaiting confirmation. It
must never present those as funds controlled by the platform.

For cash, the same acknowledgement model applies without a transaction
reference.

### Progress language

Allowed:

- “185,000 FCFA confirmed toward 250,000 FCFA”
- “12 contributions confirmed”
- “3 awaiting confirmation”

Avoid:

- “Your balance”
- “Funds held”
- “Available to withdraw”
- “Money in your OnCotise/Njangi account”

## Organizer experience

### Create

Keep creation to one short flow:

1. **What are you collecting for?** Title, category, and optional photo.
2. **How should people contribute?** Recipient, MTN/Orange/cash methods, and
   fixed/suggested/open amount.
3. **When does it end?** Optional goal and required deadline.
4. **Review and share.** Show the exact recipient and custody statement before
   opening the Contribution group.

Advanced settings do not belong in the initial flow.

### Manage

The organizer sees:

- confirmed progress;
- claims awaiting recipient confirmation;
- contributors and amounts;
- share action;
- close/cancel controls;
- activity history;
- reminders that can be shared through WhatsApp.

The organizer and recipient may be the same person. If they differ, money goes
to the recipient and confirmation responsibility belongs to the recipient.

## Contributor experience

### Public contribution page

The WhatsApp link opens a small responsive web page, not the full application.
It displays:

- purpose, organizer, and recipient;
- confirmed progress;
- deadline and contribution amount guidance;
- the exact wallet/person who receives the money;
- MTN MoMo, Orange Money, and cash choices;
- a custody statement;
- the action to record a contribution after payment.

The page must load on low-bandwidth connections and remain usable on low-end
Android browsers. It should not require registration merely to view the request
or payment instructions.

### Identity

An account is not required to view a Contribution group. Claiming a contribution
requires a minimal verified identity so the recipient can reconcile the money.
The first version should prefer phone verification or a signed, short-lived
claim link over full account onboarding. Exact identity-provider support will
be decided during implementation planning.

Anonymous display may be offered to the wider group later, but the organizer,
recipient, and platform must know the contributor identity.

### Install conversion

After a claim, offer—not require—the native app for:

- confirmation updates;
- future reminders;
- full activity history;
- creating another Contribution group;
- joining or running a Njangi group.

## Mobile Money strategy

### Phase 1: direct-to-recipient

The app provides the recipient number, safe copy actions, USSD/dialer guidance,
and a structured contribution claim. Money moves directly between existing
Mobile Money accounts.

This is the default launch model because it works with current user behavior
and does not require the platform to hold member funds.

### Phase 2: licensed checkout

Explore MTN MoMo and Orange Money checkout only through a structure that:

- onboards the correct merchant, organizer, or submerchant;
- performs required KYC/KYA and fraud controls;
- settles directly to the disclosed recipient;
- provides transaction webhooks and reconciliation identifiers;
- defines refunds, reversals, fees, limits, and support ownership;
- is reviewed by Cameroon counsel against the CEMAC payment-services rules.

Official product documentation shows that MTN collections settle into a
partner collection account and Orange Web Payment is offered to registered,
compliant merchants. Therefore, a normal merchant integration must not be
silently repurposed to hold money on behalf of arbitrary organizers.

References:

- [MTN Cameroon Collections Widget](https://momoapi.mtn.com/Cameroon_Widget_productDetails)
- [Orange Money Web Payment](https://developer.orange.com/apis/om-webpay/)
- [BEAC payment-service regulations](https://www.beac.int/systemes-paiement/instructions-circulaires-reglements/)

### Phase 3: no assumed platform pool

A platform pool is not on the roadmap unless a licensed provider owns the
regulated balance and customer relationship. Product design must not depend on
the platform eventually becoming a custodian.

## Architecture direction

### Preserve Njangi domain depth

Do not flatten cycles, rounds, rotation order, payouts, governance, fines, or
assistance into generic Contribution group concepts. A recurring Njangi group
remains its own domain model.

Share only the primitives that are truly common:

- people and verified identities;
- contribution methods;
- two-sided acknowledgement;
- proof artifacts;
- activity attribution;
- notifications;
- WhatsApp links;
- formatting and trust copy.

### New domain boundary

Add a dedicated Contribution group module rather than overloading the existing
`groups` table or making round IDs optional everywhere. The expected
server-side boundary is:

- `contributionGroups`
- `contributionGroupParticipants`
- `contributionGroupContributions`
- `contributionGroupActivityEvents`
- `groupHub` as a read-only composition boundary for the combined Groups tab

Shared pure logic may be extracted for acknowledgement transitions, but
Contribution group authorization and lifecycle rules remain independent.

This avoids destabilizing the implemented Njangi state machines while still
allowing a consistent user mental model.

### Public link surface

The current native-only decision changes narrowly: add a public web surface for
contribution links, support/privacy/terms, and universal-link fallback. Do not
build a parallel signed-in web application.

The public surface calls a narrow API that exposes only fields intended for
link viewers. Organizer controls and private participant details remain behind
authenticated native routes.

## Authorization and privacy

- Only the organizer can edit, open, close, or cancel a Contribution group.
- Only the named recipient can confirm receipt, except for an explicit,
  attributed correction path.
- A contributor can view and withdraw their own unconfirmed claim.
- Private links use high-entropy revocable tokens; sequential IDs are never
  public access credentials.
- Public responses never expose full phone numbers, transaction references, or
  proof images.
- Proof images are private dispute artifacts, not public evidence.
- Every privileged correction creates an immutable activity record.
- The organizer cannot rewrite confirmed history.

## Abuse and safety

The first release limits the risk surface:

- private-link distribution only;
- verified organizer before opening;
- one recipient per Contribution group;
- bounded duration and configurable amount limits;
- report and revoke-link actions;
- duplicate-reference and duplicate-claim detection;
- rate limits on public reads, claims, and reminders;
- no charity claims, investment promises, lending, raffles, or public campaign
  discovery;
- clear language that contributors are paying the disclosed recipient directly.

Cancellation does not imply an in-app refund. The product must explain that the
recipient handles any return directly because the platform never received the
money.

## Offline and error handling

- Organizer creation drafts persist locally until successfully opened.
- Contributor claims receive idempotency keys and survive retries.
- A failed payment instruction launch never creates a claimed contribution.
- A submitted claim can show “saved on this phone” while synchronization is
  pending, using the same durable-queue principles as Meeting Mode.
- Confirmation is idempotent.
- Provider webhooks added later are treated as external evidence and reconciled
  idempotently; they do not bypass authorization or overwrite history.
- When progress cannot be refreshed, show the last updated time instead of a
  misleading zero.

## Success criteria

The first pilot should measure:

- time from opening the app to sharing a Contribution group link;
- share-link open rate;
- percentage of viewers who start payment instructions;
- percentage who successfully submit a claim;
- recipient confirmation rate and median confirmation time;
- number of manual reconciliation problems per Contribution group;
- organizer repeat rate within 60 days;
- conversion from contributor to app install;
- conversion from one-time Contribution group to recurring Njangi group.

Initial qualitative success means an organizer can create and share a real
collection in under two minutes, a first-time contributor understands where the
money goes without assistance, and the recipient can reconcile contributions
without returning to a notebook.

## Naming implications

The broader product makes a contribution-oriented umbrella name more logical
than a name restricted to rotating savings. `OnCotise` communicates the new
scope well in French, but its similarity to the existing Cotiz product remains
a material brand and search risk. Naming should be finalized only after basic
trademark, domain, store, and customer-language screening.

The implementation should keep user-facing product naming centralized so the
working brand can change without rewriting domain copy.

## Rollout sequence

1. Validate the Contribution group flow with clickable copy and a small number of real
   Cameroon organizers before payment API work.
2. Ship direct-to-recipient MTN/Orange/cash instructions with claims and
   confirmations.
3. Add the public WhatsApp contribution page and install conversion.
4. Pilot one event category at a time, beginning with a trusted, private use
   case rather than public fundraising.
5. Evaluate licensed checkout only after direct-flow usage proves demand and a
   compliant settlement model is documented.

## Final product principle

The app should make contributing together feel effortless without pretending
that organizing money and possessing money are the same service.
