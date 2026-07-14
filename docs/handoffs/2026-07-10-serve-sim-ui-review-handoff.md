# Simulator UI review handoff

Date: 2026-07-10  
Reviewer: Codex  
Target: Expo SDK 56 development build on iPhone 16 Pro, iOS 18.6  
Stream: `serve-sim` preview at `http://localhost:3200`, MJPEG/WS helper on port 3100  
Pilot identity: Paul Nfor, authenticated mock-pilot data

## Purpose

This is a visual and interaction handoff for the next implementation agent. It records where the current mobile UI still makes the user decode internal system state, where navigation or layout visibly breaks, and what completion should look like.

This pass did not submit a contribution, confirm money, change membership, sign out, or create/join a group. It only navigated, scrolled, opened sheets, and exercised non-mutating payment instructions.

## Executive summary

The new Today → Groups → Actions information architecture is materially simpler than the old five-tab shell. Today is the strongest screen: it gives the user one dominant action, a route to the remaining queue, and the next meeting.

The remaining work is concentrated in four areas:

1. Payment options are offered without verifying that they can work. MTN MoMo was offered when the recipient phone was missing, leading to a nine-step screen whose phone value was `—`.
2. Long lists scroll directly under the status bar and Dynamic Island without an opaque or blurred top boundary.
3. Group and action lists remain dense and repetitive; actionable groups are not brought to the top and important sentences are truncated.
4. Deeper group, calendar, dispute, and profile screens expose internal vocabulary or raw records instead of answering “what happens next?”

## Priority order

### P0 — Gate unusable payment methods before showing them

Evidence: [payment instructions](./assets/2026-07-10-ui-review/13-payment-instructions.png)

Observed:

- `MTN MoMo` was selectable while `Awa Ndip's number` rendered as `—`.
- The screen still offered copy actions and `Dial *126#`.
- The interpolated instructions explicitly told the user to enter `—` as the recipient number.
- The same selection screen presents MTN, Orange, and cash without explaining which methods are actually available for this recipient.

Impact:

- The core money flow sends the user into a dead end at the moment trust matters most.
- A user can reasonably believe the app validated the payment path when it did not.

Likely ownership:

- `app/(app)/groups/[groupId]/rounds/[roundId]/pay/index.tsx`
- `app/(app)/groups/[groupId]/rounds/[roundId]/pay/ussd.tsx`
- `src/hooks/use-pay-flow.ts`
- `src/lib/ussd-content.ts`
- shared payment capability helpers in `convex/lib/paymentCapabilities.ts`

Required change:

- Derive payment-method availability from the same capability model used by the backend.
- Do not navigate to a USSD route when the recipient number is absent or invalid.
- Either hide an unavailable method or render it disabled with a plain explanation and the available alternative.
- Never make `—` copyable or interpolatable into a payment instruction.
- Reduce the default flow to the recipient, amount, reference, one primary “Dial” action, and one “I sent it” action. Put menu-by-menu instructions behind “Need help?” rather than leading with nine steps.

Acceptance criteria:

- Missing recipient phone: MTN/Orange cannot open, and cash/meeting guidance remains available.
- Valid recipient phone: number, amount, reference, and dial code are non-empty and internally consistent.
- No placeholder value is copyable.
- A user can understand the next step without reading the long instruction list.
- Add tests for missing phone, unsupported operator, and valid MTN/Orange recipients.

### P1 — Stop scroll content from colliding with the status bar

Evidence: [Actions after scrolling](./assets/2026-07-10-ui-review/03-actions-bottom.png), [group activity after scrolling](./assets/2026-07-10-ui-review/07-group-detail-activity.png)

Observed:

- Action cards, activity rows, and text scroll visibly behind the clock, Dynamic Island, Wi-Fi, and battery indicators.
- The initial Actions/Today layout also has excessive top air. `contentInsetAdjustmentBehavior="automatic"` is combined with explicit safe-area top padding on some screens, which is a likely contributor.

Impact:

- Text becomes unreadable and the screen looks broken during normal scrolling.
- The large initial gap makes the queue feel lower-density without improving comprehension.

Likely ownership:

- `app/(app)/(tabs)/index.tsx`
- `app/(app)/(tabs)/inbox.tsx`
- `app/(app)/(tabs)/group.tsx`
- `app/(app)/groups/[groupId]/index.tsx`
- shared screen/header primitive, if introduced

Required change:

- Choose one inset strategy per screen; do not combine automatic adjustment with an already-inset content container.
- Give scrolling tab screens an opaque/blurred safe-area boundary or a native/sticky header so content cannot compete with system chrome.
- Verify initial and scrolled states on Dynamic Island and non-Dynamic-Island devices.

Acceptance criteria:

- No body text or card content is readable behind the status bar at any scroll offset.
- Today, Groups, and Actions use the same top rhythm.
- Pull-to-refresh and scroll-to-top continue to work.

### P1 — Investigate native tab items disappearing after a tab switch

Evidence: [Actions transition with Groups missing](./assets/2026-07-10-ui-review/02-actions-top.png), [Groups transition with Today missing](./assets/2026-07-10-ui-review/04-groups.png)

Observed:

- After switching tabs, one unselected tab icon/label disappeared while the accessibility tree still contained all three tabs.
- The missing item returned after roughly two additional seconds.
- This reproduced when switching into Actions and into Groups on iOS 18.6.

Impact:

- The permanent navigation shell appears unstable and a destination temporarily becomes invisible.

Likely ownership:

- `app/(app)/(tabs)/_layout.tsx`
- Expo Router Native Tabs / `react-native-screens` compatibility on iOS 18

Required change:

- Reproduce on a release build and physical iOS device to distinguish a development-build issue from a production issue.
- Test whether custom `labelStyle`, `iconColor`, badge updates, or selected/unselected icon definitions trigger the delayed redraw.
- Keep exactly three static triggers and avoid remounting the tab container when attention data changes.

Acceptance criteria:

- All three tab items remain visible throughout repeated Today ↔ Groups ↔ Actions switching.
- Badge changes do not flash, shift, or hide another tab.
- Verify iOS 18.6 and iOS 26.x.

### P1 — Make Actions scannable instead of repetitive

Evidence: [Actions top](./assets/2026-07-10-ui-review/02-actions-top.png), [Actions lower queue](./assets/2026-07-10-ui-review/03-actions-bottom.png)

Observed:

- Group/role and explanatory sentences truncate to `Mem...`, `en...`, and `th...`.
- Contribution and handover actions reuse the same wallet-like icon.
- Multiple nearly identical contribution cards require rereading group, amount, and status to distinguish them.
- `Overdue` repeats on most rows without conveying how overdue or what changes if the user waits.
- Returning to Actions preserved a deep scroll position, so the user did not land back at the top priority.

Impact:

- The ordered queue exists, but users still have to parse every card instead of recognizing the job at a glance.

Likely ownership:

- `app/(app)/(tabs)/inbox.tsx`
- `src/components/attention/attention-card.tsx`
- `src/lib/attention-presentation.ts`

Required change:

- Give contribution, handover, dispute, confirmation, and governance actions distinct icons/tints.
- Keep the group name visible; move or shorten role/status metadata before truncating the group identity.
- Prefer one compact human detail line. Do not include the full custody sentence in every queue row.
- Consider small semantic sections such as `Urgent`, `Due soon`, and `Later` only if ordering alone is not enough.
- Decide explicitly whether selecting the Actions tab should restore the top priority or preserve scroll; current behavior conflicts with “priority first.”

Acceptance criteria:

- Group name, amount, action title, and urgency remain visible at the supported text sizes.
- A contribution and a handover are visually distinguishable without reading the title.
- No sentence ends in an unusable fragment such as `the app never moves th...`.

### P1 — Sort Groups by what needs the viewer, and keep rows visibly tappable

Evidence: [Groups](./assets/2026-07-10-ui-review/04-groups.png)

Observed:

- The header said `4 actions waiting`, but the first groups shown did not carry those actions; `10 000 F due` rows began lower in the list.
- Due chips replace the chevron, so some tappable rows do not look tappable.
- Several mock groups share the same name and initials; arbitrary colors are doing too much identity work.
- `0/5 rounds` is an implementation-style progress expression and does not say whether the group is in setup, waiting for a meeting, or ready to start.
- `actions waiting` is semantically ambiguous because the product now distinguishes executable Actions from work waiting on someone else.

Impact:

- A user sees that work exists but must hunt for the responsible group.

Likely ownership:

- `app/(app)/(tabs)/group.tsx`
- `src/components/groups/group-card.tsx`
- `convex/groups.ts` list projection, if a stable attention rank should come from the backend

Required change:

- Rank groups requiring the viewer above neutral groups, then sort by urgency.
- Preserve a chevron/tap affordance even when a chip is present.
- Replace raw `done/total rounds` with a current-state sentence: for example `Setting up`, `Round 1 of 5 · due Friday`, or `Your contribution is due`.
- Rename the header count to a term that matches the Attention model, such as `4 need you`, only if it counts executable actions.
- For duplicate names, include a stable secondary identity such as location, organizer, schedule, or short invite label; do not rely on color alone.

Acceptance criteria:

- Every actionable group appears before non-actionable groups.
- Every navigable row has a consistent affordance.
- The header count equals the visible actionable-group semantics.

### P1 — Make the dispute destination explain the next owner and next step

Evidence: [dispute detail](./assets/2026-07-10-ui-review/11-dispute-detail.png)

Observed:

- Today says `Review the dispute`, but the destination is a mostly static ledger record.
- It does not explain whether Paul can act, whether Marie must respond, or what resolution means.
- `NJG-T1` exposes an internal-looking reference without explaining why it matters.
- The timestamp `09/07/2026 16:46:25` is overly precise and locale-ambiguous.
- `cash` is lower case and the two-column metadata becomes fragile with long names.

Impact:

- The highest-priority action leads to a screen that does not answer “what should I do now?”

Likely ownership:

- `app/(app)/groups/[groupId]/rounds/[roundId]/index.tsx`
- attention destination/presentation in `src/lib/attention-navigation.ts` and `src/lib/attention-presentation.ts`

Required change:

- Add a top status block stating the owner and next transition, for example `Waiting for Marie to respond` or `You can accept or challenge this report`.
- Only label the destination an executable action when the viewer has an executable control.
- Move raw ledger metadata under `Details` and format timestamps as human relative/local time.

Acceptance criteria:

- The CTA on Today/Actions and the first sentence on the destination describe the same job.
- If the viewer cannot act, the screen explicitly says who owns the next step.
- Internal identifiers are hidden or labeled as references.

### P2 — Recompose group detail around the current situation

Evidence: [group detail top](./assets/2026-07-10-ui-review/06-group-detail-top.png), [activity and members](./assets/2026-07-10-ui-review/07-group-detail-activity.png), [rules](./assets/2026-07-10-ui-review/08-group-detail-rules.png)

Observed:

- `Rotation order and rounds`, `Cycle 1`, and `fixed` lead the screen.
- The current card says `Round 1 · Linus`, `received by Awa Ndip`, and highlights Linus as `THIS ROUND`; those phrases require domain knowledge and can appear contradictory.
- A full five-person rotation consumes most of the first viewport.
- Activity exposes duplicate system wording such as `Confirmed automatically (window elapsed) ✓`.
- `no app` is terse and reads as a deficiency rather than a neutral offline-member state.
- Activity, members, and rules create a very long single scroll.

Required change:

- Lead with a human summary: current receiver, amount collected, next meeting, and viewer-owned action.
- Collapse rotation, full activity, members, and rules behind separate rows or disclosure groups.
- Translate system events into human events and deduplicate adjacent identical entries.
- Replace `no app` with `Offline member` or `Not using the app`.
- Explain `fixed` as `Order locked` only where that fact affects the viewer.

Acceptance criteria:

- The first viewport answers who receives, how much is collected, what happens next, and whether the viewer needs to act.
- The full rotation remains available but no longer dominates the default view.

### P2 — Tighten Calendar copy and layout

Evidence: [Calendar](./assets/2026-07-10-ui-review/09-calendar.png)

Observed:

- The header loses group context when opened from group detail.
- Month summaries repeat `you contribute 10 000 F` and one long receive line wraps `50 000 F` awkwardly.
- The list does not lead with the next event or a clear today/past boundary.
- Calendar copy is sentence-cased inconsistently and should be checked for `you/your receive` regressions.

Likely ownership:

- `app/(app)/calendar.tsx`
- `app/(app)/groups/[groupId]/calendar.tsx`
- `src/components/calendar-agenda.tsx`
- `src/i18n/locales/en.json` and `fr.json`

Required change:

- Preserve group context in group mode.
- Add `Next` emphasis and visually collapse or de-emphasize past rounds.
- Keep amounts non-breaking and avoid repeating the same contribution sentence at both month and row level.
- Add localization tests for month summaries.

### P2 — Finish Profile and fix its accessibility surface

Evidence: [Profile](./assets/2026-07-10-ui-review/10-profile.png)

Observed:

- The screen is intentionally marked as a minimal roadmap stub in `app/(app)/profile.tsx` and visually feels unfinished.
- The language control has no visible `Language` label.
- Although the component declares radio roles, the Simulator accessibility snapshot exposed neither FR nor EN as interaction targets during this pass.
- The back button accessibility label surfaced as `(tabs)`, not `Back` or `Today`.
- The phone number is presented as an unlabeled large secondary line.
- `Sign out` has more visual weight than account editing or preferences.

Likely ownership:

- `app/(app)/profile.tsx`
- `src/components/language-toggle.tsx`
- `app/(app)/_layout.tsx`

Required change:

- Add a visible Language label and make both options independently reachable and announced as selected/unselected.
- Fix the native back label.
- Label email/phone fields and provide a clear edit/manage-account route if supported.
- Style sign-out as a destructive, low-frequency action at the bottom.

Acceptance criteria:

- VoiceOver can focus and switch FR and EN.
- Back announces a human destination.
- Personal fields have labels, not position-only meaning.

### P2 — Make native bottom sheets fit their content

Evidence: [Create or join sheet](./assets/2026-07-10-ui-review/05-create-join-sheet.png), [payment method sheet](./assets/2026-07-10-ui-review/12-record-contribution.png)

Observed:

- Create/join buttons use intrinsic widths and are left aligned, leaving a large blank sheet.
- The payment method sheet expands nearly full height despite only three options.
- The payment custody sentence says money goes `from your account to Awa Ndip's`, which is grammatically incomplete and incorrect for the cash option.

Required change:

- Use content-fitting detents where supported and make choice buttons full-width.
- Name choices in user language: `Start a new group` and `Enter an invitation code`.
- Make custody text method-neutral before selection and method-specific afterward.

## Development overlay caveat

The `DEV · PILOT` badge and Expo development-menu gear are not production UI defects, but they obscured status chips, chevrons, names, and payment controls in several screenshots. Keep them out of release builds and add a screenshot/E2E mode that hides or repositions them. Do not “fix” production layouts around the gear overlay.

## Test coverage and constraints

Exercised:

- Today primary action, more-actions path, and next-event presentation
- Actions top and deep scroll states
- Groups list and create/join Expo UI bottom sheet
- Group detail, activity, members, rules, and group calendar
- Profile
- Dispute detail
- Contribution method picker and MTN USSD instructions
- Native tab switching
- `serve-sim` preview, MJPEG stream, and gesture channel

Not exercised:

- A waiting shelf with non-empty waiting data
- Signed-out and registration flows in this authenticated simulator
- Authenticated iOS 26 appearance; the separate iOS 26 simulator has no Clerk session
- Final contribution claim/confirmation, cash claim, payout confirmation, membership approval, or group creation
- French layout: the language radio options were not exposed as tappable accessibility targets, and coordinate fallback was intentionally not relied on for a state-changing preference

Runtime observations:

- Metro reported only the expected Clerk development-key warning.
- No application crash or React render error occurred during this pass.
- The `serve-sim` browser preview returned HTTP 200 at port 3200; the MJPEG stream returned `multipart/x-mixed-replace` from port 3100.

## Recommended implementation sequence

1. Fix payment capability gating and the missing-recipient-number path.
2. Fix safe-area/status-bar scrolling and verify the transient native-tab redraw.
3. Tighten Actions and Groups rows, including attention-first group sorting.
4. Align dispute destination copy/controls with the attention CTA.
5. Recompose group detail, then calendar.
6. Finish Profile accessibility and sheet sizing/copy.

After each step, rerun this exact mock pilot with `serve-sim` and compare against the evidence images rather than relying only on snapshots or type checks.
