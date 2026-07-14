# Create and join experience — The Circle Forms

**Status:** approved design direction; mockup and implementation plan only.
Production UI remains unchanged until the visual mockup is approved.

## Intent

Starting a njangi should feel like forming a real collective, while joining one
should feel like recognizing the people who invited you. The experience should
be memorable because the group becomes visible as the user makes decisions—not
because of decorative spectacle.

## Experience principle

A small collective seal begins as one center mark and quietly gains structure
through the flow. Identity adds the monogram, rhythm adds an orbit marker,
contribution adds the shared rule, handover adds the relationship path, and the
creator's role completes the circle. Creation success settles these elements
into a finished seal once, with a success haptic.

This motif is supportive. Forms, copy, and accessibility remain primary.

## Entry: create or join

The Groups `+` action opens a branded native bottom sheet titled “Bring people
together.” It contains:

1. a dominant plum “Create a njangi” path with a short outcome description;
2. a quieter “Join your people” path explaining the six-character invitation;
3. no third choice, tutorial carousel, or financial illustration.

Selecting Create dismisses the native sheet before opening the full-screen
wizard. Selecting Join expands the second path into a single accessible input
inside the sheet. It accepts a bare code, full WhatsApp message, or deep link.

Deep-link invite entry bypasses this chooser and opens the public group preview
directly.

## Creation flow

The current business inputs and single final mutation remain unchanged. The
presentation becomes five short configuration moments, followed by an
unnumbered invitation success state.

### 1. Identity

Question: “What do your people call this njangi?”

- Group name is the only field.
- The collective seal displays a live monogram derived from the name.
- FCFA is disclosed quietly, not as a second decision.

### 2. Rhythm

Question: “When do you gather?”

- Weekly, every two weeks, or monthly.
- Weekly/biweekly reveals native day selection.
- Monthly reveals a native monthly date choice when supported.
- A natural-language confirmation summarizes the choice.

### 3. Contribution

Question: “What does each member record each round?”

- Numeric contribution field with formatted XAF feedback.
- Expected member count stays optional.
- If both values exist, show “Expected at each handover,” never a balance or
  app-held total.

### 4. Handover

Question: “How does your group hand it over?”

- Two relationship cards: through the treasurer, or directly to the
  beneficiary.
- A simple people-to-people line illustrates the selected path.
- Persistent trust note: money moves between members, never through Njangi.

### 5. Your place and review

Question: “What is your role?”

- Treasurer or president.
- A compact charter summarizes identity, rhythm, contribution, and handover.
- Every summary row is editable before the mutation runs.
- The primary action says “Create this njangi.”

### Success and invitation

Title: “Your circle is ready.”

- The seal completes once; no confetti.
- WhatsApp share is the dominant action.
- Copy invitation, add a member without a smartphone, and enter the group are
  secondary actions.
- Rotation order and cycle start remain in the group setup state. They do not
  extend first-run creation.

## Join flow

### Code entry

- One real input is visually rendered as six cells.
- Paste accepts a whole invitation message or deep link.
- Errors remain inline and do not shake the entire screen.

### Public preview before mutation

Show only safe invitation information: group name, member count, rhythm,
contribution rule, and inviter/officer name when permitted. No ledger or member
history is exposed.

The explicit CTA is “Ask to join.” This requires a read-only invite-preview
query before the existing join mutation.

### Outcomes

- Pre-added membership: “You're in,” then group detail.
- Approval required: “Your place is waiting,” with the approving role and
  notification expectation.
- Full group: explain the 40-member cap and permitted contact.
- Offline: preserve the input and offer retry.

## Motion and feedback

| Moment | Motion | Duration |
| --- | --- | --- |
| Press | scale to 0.98 | 90–100 ms |
| Selection | border/fill/check transition | 160–180 ms |
| Step forward/back | 12 px directional move + opacity | 220 ms |
| Join card expansion | native sheet/layout spring | about 280 ms |
| Seal progression | one new ring/path only | 240–320 ms |
| Creation/join success | one-time circle settle | 420–520 ms |

Selection uses a light haptic; successful server mutation uses the success
haptic. Loading never animates the seal indefinitely. Reduced Motion replaces
travel, scale, and path drawing with a 100 ms opacity change.

## Platform behavior

- iOS uses the existing SwiftUI-backed bottom sheet and native date controls.
- Android uses the Material 3 bottom sheet and Compose-backed date controls.
- Shared React Native content owns copy, seal, forms, summary, and accessibility.
- Heroicons outline remains the only app-owned functional icon family.
- Platform symbols remain confined to OS-owned controls.

## Accessibility

- Every interactive target is at least 44×44 points/dp.
- Progress is announced as text, not encoded only by the seal.
- The six code cells expose one labeled text input to assistive technology.
- All selections expose radio/selected state.
- Keyboard focus and validation remain stable across step transitions.
- Text supports dynamic type without hiding the primary action.
- Color is never the only status or selection signal.

## Implementation boundaries

The visual redesign can reuse the existing final `createGroup` mutation and
wizard state. The only proposed backend addition is a privacy-limited invite
preview query. No money movement, custody, payment initiation, rotation locking,
or member approval is added to this onboarding flow.

## Validation

- English and French, including long French role/handover copy.
- Light and dark appearance.
- 320–430 point phone widths and supported dynamic-type sizes.
- Keyboard open/closed on every input step.
- Bare code, pasted WhatsApp message, deep link, invalid, offline, pre-added,
  pending approval, and full-group join outcomes.
- Reduced Motion and VoiceOver/TalkBack navigation.
- Back preserves every answer and never repeats success feedback.
