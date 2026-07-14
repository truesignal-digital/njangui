# SDK 57 native UI architecture

Date: 2026-07-14  
Status: Implemented foundation

## Platform contract

Njangi uses one product hierarchy and two native shells:

- Shared React Native components own Njangi-specific content, layout, brand,
  accessibility, business states, and English/French behavior.
- Expo Router native stacks and native tabs own navigation, back behavior,
  platform transitions, tab semantics, and form-sheet presentation.
- `src/components/native/**` contains small platform adapters only when the
  operating systems have meaningfully different controls. The appearance
  selector is SwiftUI on iOS and Jetpack Compose on Android.
- Heroicons remain the functional icon family. The Njangi mark is brand
  artwork and never substitutes for an action/status icon.

## Theme contract

- `ThemePreferenceProvider` is the only owner of System/Light/Dark.
- The device-local choice is loaded before the splash screen disappears.
- `useAppTheme()` is the only palette entry point for shared UI.
- Native Router chrome, status bar, system background, SwiftUI, and Compose
  receive the same resolved light/dark mode.
- Components must not call `useColorScheme()` directly unless they implement
  the provider itself.

## Collective Table primitives

- `NjangiMark`: the exact current monochrome asset with theme-aware tint.
- `GroupSeal`: mark plus group initials; an identity, not a progress ring.
- `CollectiveTableCard`: members around the mark, current gathering in the
  center, and one dominant action.
- Group cards: people and next responsibility first; no colored left rail and
  no aggregate money balance.

Use one prominent brand expression per screen. The mark communicates
continuity and participation, never balance, custody, or percent complete.

## Motion contract

- Native stack, tab, and sheet transitions are the default.
- Shared content uses 90–220 ms opacity/position transitions.
- Meaningful presses use a short scale and platform haptic.
- Success may resolve once; nothing loops or spins.
- Reanimated transitions use the system Reduce Motion setting.

## SDK 57 decisions

The implementation follows the official [Expo SDK 57 changelog](https://expo.dev/changelog/sdk-57):

- React Native 0.86 and the SDK 57 Expo package set.
- Reanimated 4.5, Worklets 0.10, and Gesture Handler 2.32.
- Android edge-to-edge behavior is treated as the default.
- Native tabs use Material indicator/ripple behavior on Android and a
  theme-aware material blur on iOS.
- Form sheets use native detents, grabbers, gestures, and corner radii.
- Prebuild is run with `--no-clean` because local native folders already
  exist and must be preserved.

Hermes V1 is not enabled as part of this UI change because SDK 57 documents a
known Reanimated/Worklets memory regression in that configuration.
