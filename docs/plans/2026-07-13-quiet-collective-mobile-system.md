# Quiet Collective mobile application system

Date: 2026-07-13  
Status: Approved and adopted in the mobile application

## Decision

Quiet Collective is the selected Njangi application direction. It is not a home-screen skin. It is the shared visual and interaction language for Today, Actions, Groups, group detail, Calendar, gatherings, contribution records, forms, sheets, and empty/loading/error states.

The recommended implementation is **shared React Native content with thin platform-native control adapters**:

- React Native owns the product hierarchy, cards, lists, copy, data presentation, accessibility semantics, and Heroicons.
- SwiftUI owns iOS controls whose native interaction materially improves the experience, starting with date selection and sheets.
- Jetpack Compose owns the Android equivalents.
- Expo Router's native stack and native tabs own navigation transitions and platform tab behavior.

This keeps iOS and Android native without creating two products or duplicating whole screens.

## Updated visual artifact

- [Quiet Collective application system mockup](../ui-proposals-quiet-collective-app-system-2026-07-13.html)
- [Quiet Collective application system PNG](../ui-proposals-quiet-collective-app-system-2026-07-13.png)

The artifact expands the approved direction to eight representative surfaces:

1. Today
2. Actions
3. Circles
4. Circle home
5. Calendar on iOS
6. Calendar on Android
7. Gathering workflow
8. Contribution record workflow

## Research carried forward

The authenticated Mobbin review and clickable screen references remain documented in [Mobbin-informed Njangi application directions](./2026-07-11-mobbin-informed-ui-directions.md). Quiet Collective combines the strongest transferable parts of those references:

- the action priority and compact task language from [Asana](https://mobbin.com/screens/91a91624-c14c-4d13-a760-1dd2ac9e0f79) and [Todoist](https://mobbin.com/screens/951b39d3-c819-4dbf-a9bb-744f6b7be46d);
- the people and provenance rhythm from [Splitwise group activity](https://mobbin.com/screens/9f36de33-ee48-426a-b3df-65cba508f5b2) without balances, debts, or settlement language;
- the next-gathering hierarchy from [Meetup](https://mobbin.com/screens/10303124-7038-45fb-86b1-9ca6ecdc1856) and [IRL](https://mobbin.com/screens/0b7076d5-f0f9-41eb-a09c-acd825763fa8); and
- the compact date orientation from [Clover](https://mobbin.com/screens/55ec9d54-565c-492e-b614-d25eee409c50).

## What to adopt from `social-app`

The reference repository is on Expo SDK 54 and does not use Expo UI, so its implementation should not be copied directly into Njangi's SDK 56 codebase. Its transferable value is the set of boundaries and interaction patterns.

### 1. One contract, platform-specific implementations

The DateField pattern uses shared public types and a shared trigger while iOS and Android choose different picker presentations:

- `social-app/src/components/forms/DateField/types.ts`
- `social-app/src/components/forms/DateField/index.shared.tsx`
- `social-app/src/components/forms/DateField/index.tsx`
- `social-app/src/components/forms/DateField/index.android.tsx`

Njangi should apply the same shape to native controls, with explicit iOS and Android filenames:

```text
src/components/native/date-selector/
  types.ts
  shared.tsx
  index.ios.tsx
  index.android.tsx
```

The selected date and agenda query remain shared. Only the native selection surface differs.

### 2. Small, reduced-motion-safe press feedback

`social-app/src/lib/custom-animations/PressableScale.tsx` uses a 0.98 scale over 100 ms and disables the transform when Reduced Motion is enabled. This is a strong fit for Quiet Collective's cards and dominant CTA.

Njangi should not scale every row. Apply it to the dominant action, circle cards, and high-confidence action buttons. Standard list rows can use native pressed color/opacity so the screen does not feel animated everywhere.

### 3. Short disclosure transitions

`social-app/src/lib/custom-animations/AccordionAnimation.tsx` enters mobile disclosure content in 200 ms and exits in half that time. Quiet Collective will use a slightly calmer 180 ms enter and 90 ms exit for Waiting and secondary details, with opacity-only behavior under Reduced Motion.

### 4. Centralized screen structure

`social-app/src/components/Layout/README.md` and `Layout/index.tsx` centralize safe areas, fixed headers, and scroll content. Njangi currently repeats these concerns in individual routes. A later implementation should introduce a small `AppScreen`/`ScreenContent` family, but only after the visible Quiet Collective surfaces are validated. This is an architectural follow-up, not a prerequisite for the first visual slice.

### 5. Icon sizing discipline, not Bluesky's glyph library

`social-app/src/components/icons/common.tsx` proves the value of named icon sizes and normalized color behavior. Njangi already depends on `react-native-heroicons`, so it should keep Heroicons and add a tiny shared size contract instead of copying the reference repository's generated SVG set.

## Expo SDK 56 capability check

Njangi is on Expo SDK 56 with `@expo/ui ~56.0.21`. The local installed types and the official SDK 56 documentation confirm the needed native pieces:

- SwiftUI `Host`, `DatePicker`, `BottomSheet`, lists, forms, and other controls are available in [`@expo/ui/swift-ui`](https://docs.expo.dev/versions/v56.0.0/sdk/ui/swift-ui/).
- Jetpack Compose `Host`, `DateTimePicker`, `ModalBottomSheet`, Material 3 cards, text fields, and other controls are available in [`@expo/ui/jetpack-compose`](https://docs.expo.dev/versions/v56.0.0/sdk/ui/jetpack-compose/).
- Expo Router SDK 56 supports platform-specific routes and native navigation components through [Expo Router](https://docs.expo.dev/versions/v56.0.0/sdk/router/).

The named Expo UI skill contains SDK 55 examples, so no API signature from it should be pasted into this project. SDK 56's installed TypeScript definitions are the implementation source of truth.

## Three implementation approaches

### A. Shared React Native only

All screens and controls use React Native, Reanimated, Heroicons, and the current universal `@expo/ui` imports.

**Improves:** speed, reuse, test simplicity, and visual parity.  
**Tradeoff:** date selection, sheets, and a few form controls feel less specifically iOS or Android.  
**Fit:** safe but does not fully meet the native-feel goal.

### B. Shared content with thin native adapters — recommended

The product UI stays shared. Platform forks are limited to date selection, sheets/dialogs, menus, and other controls whose expected interaction differs materially.

**Improves:** native feel, maintainability, accessibility, and visual consistency at once.  
**Tradeoff:** requires a clear platform boundary and testing both implementations.  
**Fit:** best match for Quiet Collective and the existing Expo architecture.

### C. Fully forked native screens

Today, Calendar, Groups, and workflows are rebuilt as full SwiftUI and Compose view trees under shared data contracts.

**Improves:** maximum platform fidelity.  
**Tradeoff:** duplicates layout, copy wiring, accessibility work, feature changes, and QA; the two apps will drift. It also makes React Native children inside native trees more complex.  
**Fit:** too complex for Njangi's simplicity and current product maturity.

## Application-wide design rules

### Product hierarchy

- Today has one filled CTA, two compact follow-ons, collapsed Waiting, and the next gathering.
- Actions is the complete executable queue, grouped by Group with urgency still explicit in text.
- Groups leads with people, status, and what needs the viewer—not totals.
- Group home leads with the next gathering/current round, then the viewer's role, people, and provenance-rich activity.
- Calendar orients by date and then shows sparse agenda rows. It does not become a monthly money dashboard.
- Gathering screens show a short ordered process with one current step.
- Contribution and handover flows say what members did or declared. They never suggest that Njangi receives, holds, settles, or transfers funds.

### Color and type

- Paper: warm cream, not pure white.
- Primary text: deep green-black.
- Cooperative/context surfaces: pale sage and moss.
- Urgency: terracotta paired with explicit words such as `Late`, `Now`, or `Needs you`.
- Dominant action: plum with a butter CTA.
- Monetary figures use the existing mono type only when precision helps; they never appear as an unlabeled balance.
- Production body text remains at least 16 pt where the layout permits, with Dynamic Type and 4.5:1 normal-text contrast.

The generic UI skill suggested a purple/green exaggerated-minimalist fintech palette. That recommendation was rejected because it would look like a generic financial product and conflicts with the already approved paper/sage/terracotta cooperative language. Its accessibility and motion guidance was retained.

### Icon policy

- Heroicons Outline is the only app-owned icon family.
- Use 16 pt for compact metadata, 20 pt for normal controls, and 24 pt for emphasis.
- Solid Heroicons are reserved for selected/success states where fill materially clarifies state.
- No emoji icons and no copied Bluesky glyphs.
- OS-owned native controls are the only exception: Native Tabs, native picker arrows, and system dialogs may use SF Symbols or Material Symbols because those symbols are rendered and owned by the native control.
- Every icon-only control keeps a minimum 44×44 pt hit target and an accessibility label.

### Motion policy

| Interaction | Motion | Reduced Motion |
| --- | --- | --- |
| Dominant card/button press | scale 1 → 0.98, 100 ms | pressed color only |
| Waiting/disclosure open | fade + 4–6 pt rise, 180 ms ease-out | 100 ms fade |
| Waiting/disclosure close | fade + 4–6 pt rise, 90 ms ease-in | immediate or 80 ms fade |
| In-place success | check/status crossfade, 180–220 ms | no movement |
| Route push/pop | native stack default | operating-system behavior |
| Sheet open/close | native SwiftUI/Compose transition | operating-system behavior |

Animate at most one or two elements per state change. Do not add custom screen slides on top of Expo Router's native stack transition.

## Adopted implementation

The production adoption now includes:

1. Introduce Quiet Collective color/type/radius tokens while preserving existing semantic token names.
2. Add a reduced-motion-safe `PressableScale` primitive and icon-size contract.
3. Update Today, Actions, and Groups using existing data hooks and components.
4. Build the shared date-selector contract with SwiftUI and Compose implementations from SDK 56 types.
5. Update the Calendar surface to combine the native selector with the existing sparse agenda model.
6. Extend the same system to group detail, gathering, contribution, authentication, onboarding, profile, and form surfaces.

No Convex schema or backend change is required for the visual system work.

## Validation

The authenticated development build was verified on an iPhone 16 Pro Simulator with serve-sim available at `http://localhost:3200`. Today, Groups, Actions, the SwiftUI Calendar, and dark appearance were inspected visually and through runtime accessibility snapshots. The native Calendar exposed individual date cells, month navigation, and the correct selected-date state.

Android's platform-specific Compose date selector was verified against the installed SDK 56 type definitions and by producing a complete Android Expo bundle. TypeScript, the design-system lint, 114 unit tests, and 24 Convex integration tests all pass.

## Implementation boundary

The adoption changes mobile presentation and interaction only. It does not change Convex schema, mutations, queries, custody semantics, or payment behavior. Existing uncommitted work remains unstaged and uncommitted.
