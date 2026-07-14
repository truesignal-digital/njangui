# Today summary and secondary actions

Date: 2026-07-11  
Status: Direction approved; visual mockup pending approval

## Goal

Let a user understand their overall situation and move more than one item forward from Today without turning the screen into a dashboard or duplicating the complete Actions queue.

## Information order

1. Header and profile.
2. A quiet three-cell summary: actions needing the viewer, work waiting on others, and the next meeting date.
3. One dominant primary action with full context and CTA.
4. Two compact secondary actions under `Also needs you`.
5. A `See all` link for the remaining queue.
6. Waiting, collapsed by default.
7. The full next-meeting card.

The primary action remains the only filled CTA. Secondary actions are compact rows, not smaller copies of the hero card.

## Data

The first version uses only the existing `attention.readV1` result:

- `actions.length` for the needs-you count.
- `waitingFactCount(waiting)` for the waiting count.
- `nextEvent` for the summary date and meeting card.
- `actions[0]` for the primary action.
- `actions.slice(1, 3)` for the two secondary actions.

No aggregate money balance is shown. Njangi records declarations but does not hold money, so an unlabeled total could be mistaken for a wallet balance.

## Behavior

- Tapping a summary cell scrolls or routes to the corresponding section/destination:
  - Needs you → Actions tab.
  - Waiting → expands the Waiting shelf.
  - Next meeting → opens the next round.
- Secondary action rows open the same semantic destinations as their Actions-queue equivalents.
- `See all N` counts actions remaining after the primary and two visible secondary actions.
- Waiting starts collapsed on every fresh mount.
- When there are fewer than three actions, the layout closes naturally without empty placeholders.
- When all work is clear, the existing all-clear state remains dominant and the summary reflects zero actions.

## Accessibility

- Summary cells have complete labels such as `8 actions need you` rather than announcing isolated numbers.
- The three summary cells remain at least 44 points tall.
- Secondary rows expose title, group, amount, and urgency in one accessibility label.
- Dynamic Type may wrap secondary titles to two lines; group identity and amount must remain visible.

## Acceptance criteria

- The first viewport contains the summary, primary action, and at least one secondary action on an iPhone 16 Pro.
- The primary action remains visually stronger than every other element.
- No queue sentence truncates into an unusable fragment.
- Waiting no longer pushes the next meeting below the fold unless the user expands it.
- English and French layouts work at supported text sizes.
- Today, Actions, and the native badge use the same action count.

