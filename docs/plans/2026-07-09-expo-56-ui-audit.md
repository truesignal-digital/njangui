# Expo SDK 56 UI audit

## Result

The project is already on the latest published stable Expo SDK: SDK 56 with
React Native 0.85, React 19.2, Expo Router 56, and react-native-screens 4.25.
`expo install --check` reports aligned packages and Expo Doctor passes all 21
checks. No SDK upgrade is required for the Attention UI.

The unversioned `latest` documentation has begun exposing 57.x package
references, but there is no published stable SDK 57 release in the Expo
changelog. This implementation stays on stable SDK 56 rather than adopting an
undocumented preview.

Primary references:

- https://expo.dev/changelog/sdk-56
- https://docs.expo.dev/versions/v56.0.0/sdk/ui/
- https://docs.expo.dev/versions/v56.0.0/sdk/ui/universal/
- https://docs.expo.dev/router/advanced/native-tabs/
- https://docs.expo.dev/versions/v56.0.0/sdk/ui/universal/collapsible/
- https://docs.expo.dev/versions/v56.0.0/sdk/ui/universal/bottomsheet/
- https://docs.expo.dev/versions/v56.0.0/sdk/ui/universal/list/

## Adopt now

### NativeTabs

Replace the JavaScript tab bar with the static native shell:

- Today
- Groups
- Actions, with the actionable Attention count as its native badge

Use SF Symbols on iOS and Material Symbols on Android. Keep the three triggers
static, disable transparent-on-scroll-edge because the app uses FlashList, and
do not minimize the tab bar: predictable navigation matters more than novelty.
iOS 26 receives the system Liquid Glass appearance automatically.

### Expo UI Universal

Install `@expo/ui` 56.0.21 and use the Universal Interface where native behavior
removes custom machinery:

- `Collapsible` for the controlled Waiting shelf;
- `BottomSheet` for the Groups create/join chooser;
- native `Button` inside that sheet.

Keep the branded primary Attention card in React Native. Expo UI `List` is not
used for the full Actions queue because SDK 56 creates all rows up front; the
existing FlashList remains the safe scalable Implementation.

### Native Stack behavior

Calendar and Profile are secondary Stack screens with native headers rather
than permanent tabs. Their ScrollViews use automatic content inset adjustment.
Critical pay and Meeting Mode flows retain their no-dismiss guarantees.

## Remove

The app had `@gorhom/bottom-sheet` and its root provider installed without any
actual sheet usage. Expo UI now owns the one sheet introduced by this slice, so
the unused provider and dependency are removed.

## Defer

- React Compiler: run its health check and adopt separately; it is a runtime
  optimization, not a prerequisite for the UI direction.
- Platform-specific SwiftUI or Jetpack Compose trees: use only when the
  Universal Interface cannot express a real product need.
- Decorative `GlassView`: native tabs already receive the system material and
  unsupported platforms need no imitation.
- Expo UI `List`: reconsider only after its documented lazy rendering support
  lands or measured queue sizes remain small enough to justify it.
