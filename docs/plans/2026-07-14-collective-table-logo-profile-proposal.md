# Collective Table — logo and profile refinement proposal

Date: 2026-07-14  
Status: Approved and implemented in the mobile UI

## Selection

The selected direction is **Option B: Collective Table**. Its organizing idea is that a njangi is a circle of people with visible roles, responsibilities, and a shared gathering rhythm.

This refinement uses the latest application artwork directly from:

- `assets/icon.png`
- `assets/adaptive-icon.png`
- `assets/adaptive-icon-monochrome.png`

The monochrome asset is especially useful because the exact logo silhouette can be recolored with approved theme and group colors without redrawing or approximating the brand mark.

## Three possible logo treatments

### 1. Brand stamp only

Use the app icon in profile, onboarding, and small navigation identity positions. Group screens continue to use normal initials and avatars.

**Advantage:** lowest risk and clearest brand ownership.  
**Tradeoff:** does not make Collective Table more distinctive.  
**Decision:** too conservative for the selected direction.

### 2. Circle grammar — recommended

Use the exact logo silhouette as a quiet recurring grammar:

- a small Njangi brand mark in top-level screens;
- a group seal with initials inside the circular opening;
- a large watermark behind the Collective Table on group home;
- the gathering date nested inside the open center of the exact logo mark rather than a generic circular tile;
- a static live-state mark in Meeting Mode;
- a resolving seal for the completed handover;
- appearance previews on Profile.

The mark changes color with the current theme or a group’s deterministic color seed. Its segments represent participation and continuity, not percentages or money.

**Advantage:** distinctively Njangi while remaining quiet and reusable.  
**Tradeoff:** repetition must be controlled; one meaningful logo expression per screen is enough.  
**Decision:** recommended and used in the mockups.

### 3. Segmented status indicator

Animate or fill each logo arc as members confirm records or arrive at a gathering.

**Advantage:** memorable and potentially useful in Meeting Mode.  
**Tradeoff:** the three arcs do not map cleanly to arbitrary member counts, and filling the symbol can look like financial progress or account completeness.  
**Decision:** rejected for general use. A single restrained seal-resolution animation may be used after a confirmed handover.

## Refined screen system

The mockup includes:

1. Groups list
2. Group home / Collective Table
3. Gathering detail
4. Meeting Mode in dark appearance
5. Members and approvals
6. Rotation and calendar
7. Shared activity
8. Handover completion
9. Profile in light appearance
10. Appearance selection with a dark preview

## Profile design

Profile should feel like a personal corner of the same application, not an administrative form.

### Header

- Current app icon as the brand anchor
- User monogram, name, username, and verified contact summary
- Optional edit action using a native navigation control

### Preferences

- **Appearance:** System, Light, Dark
- **Language:** English, Français
- **Calendar:** opens the existing calendar surface
- Future notification controls can be added later, but are not included in this proposal

### Theme behavior assumption

- `System` is the default and follows the operating-system appearance.
- The selection is device-local unless product requirements later justify account sync.
- Choosing Light or Dark updates the app immediately with a short color crossfade. It does not animate route geometry.
- iOS uses a native-feeling segmented choice or selection sheet; Android uses Material radio selection. The product options and persistence contract stay shared.

### Account and trust

- Sign out is separated from normal preferences.
- The non-custodial statement remains visible but secondary: Njangi records what members declare and confirm; it does not receive or hold contributions.

## Logo motion

- The mark never spins continuously.
- Group-card press may tint the mark and scale the whole card to `0.985` for 100 ms.
- Entering group home may crossfade the small group seal into the larger table watermark over 220 ms when platform-safe.
- Starting Meeting Mode reveals the static mark behind the live header over 180 ms.
- Completing a handover may resolve the logo arcs once over 320–420 ms, followed by a static success state.
- Reduce Motion replaces all logo movement with a 100 ms opacity/color transition.

## Constraints

- The logo is a collective symbol, never a wallet, balance ring, payment processor, or money-progress indicator.
- Heroicons remain the only app-owned functional icon family. The Njangi mark is brand artwork, not a replacement for functional icons.
- Use one prominent brand-mark expression per screen.
- Urgency on a group card is communicated through status copy and a quiet surface/border change, never a colored rail on the card edge.
- All touch targets remain at least 44×44 pt.
- English and French copy must fit without shrinking action text below accessible sizes.
- Dark appearance uses the existing warm forest tokens rather than pure black.

## Visual artifact

- [Interactive Collective Table mockup](../ui-proposals-collective-table-logo-profile-2026-07-14.html)
- [Static Collective Table review board](../ui-proposals-collective-table-logo-profile-2026-07-14.png)

Implementation uses shared React Native surfaces for product structure, a
SwiftUI segmented appearance control on iOS, and a Jetpack Compose segmented
appearance control on Android. System/Light/Dark is persisted locally and
applied before the splash screen is dismissed to avoid a theme flash.
