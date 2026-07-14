# Mobbin-informed Njangi application directions

Date: 2026-07-11  
Status: Mockups ready for review; no production UI changes

## Scope and constraints

This study expands the approved Today concept into an application-wide visual system. Each direction covers Today, Actions, and a group surface while preserving:

- one dominant primary action on Today;
- two compact secondary actions;
- a quiet summary of actionable, waiting, and upcoming information;
- Waiting collapsed by default;
- the complete Actions queue one tap away; and
- explicit language that Njangi records member activity but does not hold users' money.

The Mobbin MCP was authenticated successfully with an iOS screen search. Every reference below was evaluated from the returned screen image, not from metadata alone.

## What the current app and approved mockup establish

The authenticated mock-pilot Simulator was available through serve-sim at `http://localhost:3200`. In the live Today screen, the primary dispute card is clear, but the next seven actions are represented only by a text link. When Waiting is expanded, two confirmation records take most of the remaining viewport and crowd the next meeting. The approved static proposal fixes those problems with two visible secondary rows and collapsed Waiting.

The existing proposal is directionally right. The open question is which system-level UI language should carry that hierarchy across Today, Actions, Groups, and group detail.

## Direction A — Priority stack (recommended)

### Mobbin evidence

- [Asana — action-led home](https://mobbin.com/screens/91a91624-c14c-4d13-a760-1dd2ac9e0f79): the image puts one due task in a distinct card with a full-width `View task` action, then demotes Recents and Projects into quieter sections.
- [Todoist — compact actionable inbox](https://mobbin.com/screens/951b39d3-c819-4dbf-a9bb-744f6b7be46d): the image uses thin rows, a clear completion control, and restrained secondary metadata so several tasks remain readable without becoming cards.
- [YNAB — priorities before summary](https://mobbin.com/screens/b0f0d4bd-7b80-4617-9a48-dd10a19a47bd): the useful pattern is the visible `Top Priorities` section followed by a compact summary. Njangi should not inherit the large `Ready to Assign` money treatment or any balance-like language.

### Application system

Today is a strict vertical stack: quiet three-part summary, one bordered action card with the only filled CTA, two compact rows, collapsed Waiting, then next meeting. Actions becomes the complete version of the same row language, grouped only by urgency. Group detail puts the current round and viewer's next step first; roster, rules, and activity follow as calm sections.

### Improvement

This direction improves scan speed, makes Today and Actions feel like one system, and preserves the most content above the fold. It also adapts well to English and French because hierarchy does not depend on a dense grid.

### Tradeoffs

It is the most utilitarian direction. Group identity and cooperative warmth are present, but secondary to the work queue. It also requires discipline: adding another hero, chart, or metric row would quickly weaken the hierarchy.

### Fit with Njangi simplicity

Strongest fit. It answers `What needs me now?` without presenting Njangi as a bank, and it reuses the existing compact Action and Group row families.

## Direction B — Circle record

### Mobbin evidence

- [Splitwise — group activity ledger](https://mobbin.com/screens/9f36de33-ee48-426a-b3df-65cba508f5b2): the image combines a strong group identity with a chronological record list. Njangi can borrow the group-first context and dated activity rhythm, but not `balances`, `settle up`, `borrowed`, or `lent` semantics.
- [Splitwise — global activity trail](https://mobbin.com/screens/fc2ae3b0-231d-4171-9d59-55375d138a5b): the image makes changes legible as a chronological audit trail with actor, action, group, and time.
- [Splitwise — record detail](https://mobbin.com/screens/cd2e482f-9ada-4a6f-bec0-f044672aaa25): the image shows how a record can retain provenance and discussion. Njangi should replace debt language with `declared`, `confirmed`, `recorded by`, and named custody where relevant.

### Application system

Today still has one dominant action, but group identity is stronger: the action card, secondary rows, and status rails all carry a circle color. Actions groups the queue by circle rather than only by urgency. Group detail becomes a calm record timeline with the current round pinned above it.

### Improvement

This direction makes the cooperative and trust model tangible. Users can tell which circle a task belongs to before reading all metadata, and the audit trail reinforces that Njangi records what members declare and confirm.

### Tradeoffs

Grouping Actions by circle weakens a perfectly global priority order. More importantly, a ledger aesthetic can accidentally suggest stored funds or debts if labels are not extremely precise. The design must ban bare aggregate money totals and settlement language.

### Fit with Njangi simplicity

Good, but riskier. It fits group detail particularly well; it is less effective than Direction A as the global application shell.

## Direction C — Meeting rhythm

### Mobbin evidence

- [Meetup — next event before groups](https://mobbin.com/screens/10303124-7038-45fb-86b1-9ca6ecdc1856): the image leads with one upcoming event, then presents the user's groups, creating a clear time-based entry point.
- [IRL — group with next event and people](https://mobbin.com/screens/0b7076d5-f0f9-41eb-a09c-acd825763fa8): the image uses a simple sequence of next event, people, and a single bottom action. It makes a group feel social without a dashboard.
- [Clover — compact date strip and daily list](https://mobbin.com/screens/55ec9d54-565c-492e-b614-d25eee409c50): the image uses a small horizontal date strip to orient the user, then a plain day-specific list.

### Application system

Today opens with a subtle date rail, then the dominant action. Secondary work is framed by when it must happen: now, before the next meeting, or waiting. Actions becomes a light agenda. Group detail leads with the next meeting, current round checklist, and people.

### Improvement

This direction explains the recurring njangi cadence better than the others. It gives meetings, rotation, and people more emotional weight and makes group detail especially approachable.

### Tradeoffs

Calendar structure can overstate timing when the true priority is a dispute or governance action. It also introduces an additional navigation concept users must learn. The date rail consumes vertical space without helping every state.

### Fit with Njangi simplicity

Moderate. It is a strong supporting pattern for group detail and Calendar, but too time-led for the global shell.

## Comparison

| Criterion | A. Priority stack | B. Circle record | C. Meeting rhythm |
| --- | --- | --- | --- |
| One dominant task | Excellent | Good | Good |
| Compact secondary work | Excellent | Good | Good |
| Cooperative identity | Good | Excellent | Excellent |
| Avoids dashboard feel | Excellent | Good | Good |
| Avoids custody confusion | Excellent | Needs strict copy rules | Excellent |
| Scales across the app | Excellent | Good | Moderate |
| First-viewport efficiency | Excellent | Good | Moderate |

## Recommendation

Choose **Direction A, Priority stack**, as the application shell. It is the clearest continuation of the approved concept and requires the least structural change to Njangi's existing components. Borrow two supporting ideas without changing the shell:

1. From Direction B, use circle color and a chronological, provenance-rich activity trail inside group detail.
2. From Direction C, lead the group screen with the next meeting/current round when that is the group's next meaningful event.

This hybrid keeps Today and Actions rigorously action-first while allowing Groups to feel cooperative and cyclical. It avoids the two major failure modes: a generic banking dashboard and a social/calendar home that hides urgent work.

## Approval gate

No production UI code should change until one mockup direction is approved. After approval, the implementation plan should name the exact existing components to reuse or adjust and should preserve every current uncommitted change.
