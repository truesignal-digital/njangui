# Public Group Link Prototype

**Date:** 2026-07-21
**Decision ticket:** [Prove the public Group link can ship from the Expo project](https://github.com/truesignal-digital/njangui/issues/20)

## Result

The existing Expo project can serve a signed-out `/g/<shareCode>` route without
redirecting to authentication or breaking the native bundles.

Use the stable single-page export for the first implementation slice:

- keep the route at `app/g/[shareCode].tsx`, outside `(app)` and `(auth)`;
- configure `web.output` as `single` so EAS Hosting can fall back to the app
  shell for arbitrary high-entropy paths;
- keep Clerk, Convex, i18n, safe-area, and theme providers at the root because
  they already tolerate a signed-out session;
- validate only the URL-safe shape on the client and treat the code as an
  opaque capability token;
- fetch data only through a narrow public Convex query that returns a bounded,
  explicitly public response;
- use the same generic unavailable response for invalid, unknown, revoked,
  closed, and cancelled links;
- never log, tag, or send a raw share code to analytics or crash reporting;
- keep organizer controls and contributor claims behind verified auth.

The initial route intentionally renders only the generic unavailable state.
Connecting real fields before the public response contract exists would make
the prototype an accidental disclosure surface.

## Verification evidence

The prototype passed:

- `bun test src/lib/public-share-code.test.ts` — 2 tests;
- `bun run typecheck`;
- `bun run lint:design`;
- `npx expo export --platform web`;
- `npx expo export --platform ios`;
- `npx expo export --platform android`;
- direct request to `/g/abcDEF0123456789_-wxyz` — HTTP 200;
- repeat direct request simulating refresh — HTTP 200;
- malformed `/g/not-valid` request — HTTP 200 with the same app shell.

The valid and malformed states also rendered in a production browser build
without runtime errors. Web-specific auth and push-notification adapters keep
native-only Clerk legacy hooks and Expo Notifications out of this route. Clerk
was upgraded to `3.7.8`, whose declared Expo peer range includes SDK 57.

## Performance finding

The production web export contains one 5,400,331-byte JavaScript bundle,
1,234,944 bytes when gzipped, and a 10,328 KiB export including assets. The
web-only push adapter removed 62,551 raw bytes and the Expo Notifications web
warning, but the payload is still too large to assume low-bandwidth pilot
readiness.

`npx expo-doctor` passed 19 of 20 checks. Its only failure is the repository's
existing SDK 57 patch-version drift across 23 Expo packages; this prototype did
not broaden into a whole-SDK dependency upgrade because all three exports pass.

Do not switch the pilot to Expo server rendering or async routes merely to
reduce this payload: Expo currently labels both features alpha. Measure the
single-page route on representative low-end Cameroon Android devices and a
throttled network first. If it misses the agreed payload and interaction
budget, make a separate architecture decision with real device evidence.

Official references:

- [Expo server rendering](https://docs.expo.dev/router/web/server-rendering/)
- [Expo async routes](https://docs.expo.dev/router/web/async-routes/)
- [EAS Hosting](https://docs.expo.dev/eas/hosting/introduction/)
