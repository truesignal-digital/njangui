# Njangi group experience — research and UI directions

Date: 2026-07-14  
Status: Proposal for review; no production UI change is authorized by this document

## Scope

This pass treats the group experience as one connected mobile system:

1. Groups list
2. Group home
3. Gathering / round detail
4. Meeting Mode
5. Members and approvals
6. Rotation and calendar
7. Activity record
8. Contribution, confirmation, handover, and dispute branches

The existing Quiet Collective visual language remains the base: warm paper, forest ink, sage context, plum emphasis, terracotta urgency, editorial headings, compact sans-serif body copy, and mono figures only where precision is useful. The product must describe records and member-to-member coordination without implying that Njangi receives, holds, or transfers money.

## Research integrity note

The Mobbin connector was retried first with an iOS screen search and returned `OAuth authorization required`. No new Mobbin result has been invented or described from metadata. Previously inspected, still-relevant Mobbin references are retained below with their canonical links. This pass adds first-party product and App Store imagery that was visually inspected while Mobbin authentication is unavailable.

## Visual references and transferable patterns

### 1. Event identity and calm hierarchy

- [Apple Invites — official product announcement](https://www.apple.com/mz/newsroom/2025/02/introducing-apple-invites-a-new-app-that-brings-people-together/) presents one event as a coherent object: expressive identity first, then date/place, guests, shared material, and host actions. The useful lesson is not the photographic cover; it is that a gathering can orient the whole screen without becoming a dashboard.
- [Apple Invites — App Store](https://apps.apple.com/us/app/apple-invites/id6472498645) uses a sparse event list and human guest surfaces. Njangi can adopt the breathing room and strong date hierarchy while keeping its own paper-and-ink identity.
- [Luma — App Store](https://apps.apple.com/us/app/luma-events-invites/id1546150895) shows event pages where time, place, host, and attendance form one readable narrative. It is a good reference for the Gathering detail page, but ticketing and promotional event language do not fit Njangi.
- [Partiful — official product](https://partiful.com/) makes a gathering feel memorable and singular, with one clear response action. Its energy is useful for moments of celebration, but its loud graphic treatment would overpower Njangi’s cooperative, trustworthy tone if copied directly.
- [Meetup group event — Mobbin](https://mobbin.com/screens/10303124-7038-45fb-86b1-9ca6ecdc1856) and [IRL group event — Mobbin](https://mobbin.com/screens/0b7076d5-f0f9-41eb-a09c-acd825763fa8) were previously inspected for their next-event hierarchy. Both support making the next gathering the strongest orientation cue on an active group home.

**Njangi lesson:** make the next real-world gathering the group’s temporal anchor, but allow a high-priority member action to supersede it.

### 2. Shared rhythm and calendars

- [Howbout groups — official product](https://howbout.app/groups) places shared plans, availability, and conversation beside one another instead of treating the calendar as a detached utility. Njangi should connect a selected date to a gathering, recipient, and member responsibility rather than showing a calendar full of financial markers.
- [Howbout — App Store](https://apps.apple.com/gb/app/howbout-shared-calendar/id1477248221) uses people and color to make a dense shared calendar scannable. Njangi should borrow the people/date relationship, but use much less color and no social-media feed density.
- [Spond events — official product](https://www.spond.com/events/) embeds attendance and organizer operations directly into the event. That is valuable for Meeting Mode: presence, record status, and the next procedural action should coexist on one live surface.
- [Spond attendance tracking — official guide](https://www.spond.com/en-us/news-and-blog/attendance-tracking-on-spond/) reinforces that attendance is an in-event operation, not a separate administrative destination.
- [Clover calendar — Mobbin](https://mobbin.com/screens/55ec9d54-565c-492e-b614-d25eee409c50) was previously inspected for compact date orientation and supports a sparse month-to-agenda structure.

**Njangi lesson:** calendar and rotation are one rhythm system. A date should reveal people, recipient, and what becomes actionable—not totals.

### 3. People as the collective identity

- [Apple Invites guest management](https://support.apple.com/en-euro/guide/apple-invites/dev48e9e39e0/ios) keeps guest states legible without turning the page into a member database. The member list can feel human and operational at the same time.
- [Geneva — official product](https://www.geneva.com/) foregrounds the idea of an ongoing “home” for a group and connects online organization to meeting offline. Njangi should borrow the sense of place, not Geneva’s room/chat complexity.
- [Geneva — about](https://www.geneva.com/about) shows how people, group identity, and upcoming meetups can carry the emotional center of a community app.

**Njangi lesson:** member faces or monograms should show who is moving a record and who the next gathering is for; they should not be decoration repeated on every row.

### 4. Trust records without a banking dashboard

- [Splitwise group activity — Mobbin](https://mobbin.com/screens/9f36de33-ee48-426a-b3df-65cba508f5b2) was previously inspected for its readable chronology, provenance, and grouped activity. Njangi can use those record-keeping qualities while rejecting debt, net balance, and settlement framing.
- [Splitwise — official product](https://www.splitwise.com/) demonstrates how persistent group history builds confidence, but its balance-first home is an explicit anti-pattern for Njangi.

**Njangi lesson:** activity is the trust product. Use verbs such as `declared`, `confirmed`, `recorded`, `disputed`, and `handed over`, always attached to a person and time. Never display an unlabeled aggregate that could be read as money held in the app.

## Three UI directions

## A. Living Gathering — recommended

The next gathering is the group’s main organizing object.

### Screen behavior

- **Groups:** each group card leads with the next date or the one action needed now. The date block, group name, role, and a single state are readable in one glance.
- **Group home:** an editorial gathering card contains date, time, place, next recipient, and one dominant action. Two compact secondary rows sit below it. Members and recent records remain visible but quiet.
- **Gathering detail:** the page becomes a concise brief—who gathers, who receives, readiness, and a three-step procedure.
- **Meeting Mode:** switches to a focused live surface with large touch targets, attendance/progress, and one current procedural action.
- **Calendar and rotation:** a compact “season” strip connects each date to its recipient; the full calendar remains one tap away.
- **Activity and disputes:** retain a calm chronological record under the gathering context.

### What it improves

- Gives every active group a strong sense of “where we are now.”
- Makes the group and round pages feel related rather than two layers of generic cards.
- Supports memorable gathering transitions without adding decorative dashboard modules.
- Fits the current Quiet Collective home screen and create/join work.

### Tradeoffs

- A next gathering could visually compete with an urgent dispute or approval. The rule must be: a blocking member action temporarily replaces the normal gathering CTA.
- Requires strong empty and between-cycle states when no date is scheduled.

### Fit with Njangi simplicity

**High.** One time anchor, one action, and two compact follow-ons preserve the simplicity goal.

## B. Collective Table

People and roles are the group’s main organizing object.

### Screen behavior

- **Groups:** cards show a restrained member cluster and a human status such as “Alice receives next” or “Paul needs your confirmation.”
- **Group home:** a circle/table composition places the next recipient, treasurer, and viewer around the group identity. Actions are phrased as relationships between people.
- **Gathering detail:** the visual story is “the circle prepares together, then hands over to one member.”
- **Members and approvals:** roster, roles, and pending requests become the strongest subpage.
- **Rotation:** a people-led horizontal sequence replaces an abstract schedule.
- **Handover:** confirmation feels like a collective moment, with restrained face/monogram transitions.

### What it improves

- Makes the product emotionally specific to a cooperative rather than a generic finance utility.
- Helps members understand roles and who is affected by an action.
- Creates a distinctive, memorable group identity.

### Tradeoffs

- Custom people layouts are harder to localize and scale from five to fifty members.
- Operational states take slightly longer to scan than the gathering-led direction.
- Motion must remain restrained or the product can feel playful instead of trustworthy.

### Fit with Njangi simplicity

**Medium–high.** Strong emotional fit, but it needs strict limits: no ornamental avatar clouds and no hidden operational detail.

## C. Living Ledger

Verified history and current record state are the group’s main organizing object.

### Screen behavior

- **Groups:** compact rows show one current state and one next event.
- **Group home:** the current action is pinned above a provenance-rich timeline.
- **Gathering detail:** each contribution and confirmation is represented as a clear, receipt-like record.
- **Activity:** becomes the strongest subpage, with actor, verb, time, method, and confirmation state.
- **Dispute:** two declarations are compared in a calm, symmetric review surface.
- **Meeting Mode:** favors rapid list scanning and completion over event atmosphere.

### What it improves

- Maximum clarity about what happened, who said it happened, and what still needs confirmation.
- Excellent fit for treasurers, disputes, auditability, and low-connectivity recovery.
- Lowest ambiguity around Njangi’s non-custodial role when copy is disciplined.

### Tradeoffs

- Can feel administrative and emotionally cold.
- Risks looking like expense software if figures become more prominent than people and verbs.
- Less memorable as the main identity of the application.

### Fit with Njangi simplicity

**Medium.** Very clear, but too record-heavy to define every surface.

## Recommendation

Adopt **Living Gathering** as the group-system direction, then borrow two bounded ideas:

- from **Collective Table:** people-led copy, recipient/member monograms, and the handover moment;
- from **Living Ledger:** the activity, confirmation, and dispute subpages.

This is not a vague blend. The hierarchy remains fixed:

1. **Now:** next gathering or blocking action
2. **People:** recipient, viewer role, attendance, approvals
3. **Proof:** recent records and complete activity history

## Motion language

Motion should be softly expressed and functional:

| Moment | Motion | Duration | Reduced Motion |
| --- | --- | ---: | --- |
| Group card press | scale to 0.985 + surface tint | 100 ms | tint only |
| Group to gathering | shared date/monogram continuity where platform-safe; native route transition owns the screen | 220–300 ms | native dissolve/default |
| Meeting Mode starts | header compacts, live state fades in, current step rises 6 pt | 240 ms | 120 ms fade |
| Member marked present | ring fills and check crossfades | 180 ms | immediate check |
| Contribution confirmed | row changes from paper to sage; status crossfades | 180–220 ms | color/status only |
| Handover completed | receiver seal resolves once; no confetti | 420 ms maximum | static success state |
| Waiting details | opacity + 4 pt reveal | 180 ms open / 90 ms close | opacity only |

Only one focal element and one supporting element animate during a state change. Route transitions remain platform-native. All animation must respect Reduce Motion.

## System constraints for every direction

- iOS and Android share product hierarchy and components; native stack, tabs, pickers, sheets, and dialogs follow each platform.
- Every touch target is at least 44×44 pt; body text targets 16 pt and Dynamic Type.
- Heroicons Outline is the app-owned icon family. No emoji icons and no copied glyph library.
- Light and dark modes preserve semantic contrast; dark mode uses warm charcoal/forest surfaces, not inverted pure black/white.
- English and French layouts must tolerate 30–40% copy expansion without clipping primary actions.
- Group figures are always labeled as a contribution, declared amount, expected handover, or record. No balance, wallet, deposit, or aggregate custody language.

## Visual artifact

- [Interactive three-direction mockup board](../ui-proposals-group-experience-directions-2026-07-14.html)
- `docs/ui-proposals-group-experience-directions-2026-07-14.png` is the static review board.

The artifact is a proposal only. Production UI remains unchanged until one direction is approved.
