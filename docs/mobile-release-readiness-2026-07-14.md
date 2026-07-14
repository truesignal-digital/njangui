# Njangi mobile release readiness — 2026-07-14

This is the handoff for phone testing, TestFlight, Google Play internal testing,
and the first public-store review. The first release remains a pilot: binaries
may be distributed to testers, but public release stays a deliberate manual
promotion.

## Release lanes

| Lane | Build profile | Backend/auth | Distribution |
| --- | --- | --- | --- |
| Android phone test | `preview` | Preview Convex + Clerk test | Installable APK link |
| iPhone beta | `testflight` | Preview Convex + Clerk test | TestFlight |
| Public stores | `production` | Production Convex + Clerk live | App Store / Play internal, then manual promotion |

Never submit a `preview` or `testflight` build for public release. Their staging
data is intentionally isolated from production.

## Verified locally

- Expo account: `dev-5304`; EAS project `@dev-5304/njangi`
- iOS bundle ID and Android package: `com.truesignal.njangi`
- Development, preview, and production EAS environments contain their required
  Convex and Clerk public variables; preview and production also contain the
  Sentry upload token.
- Expo Doctor: 21/21 checks pass.
- TypeScript, design-system lint, 114 unit tests, and 24 Convex integration
  tests pass.
- Release bundles export successfully for iOS and Android.
- App icon and adaptive-icon sources are 1024×1024.
- The generated Android manifest explicitly removes `RECORD_AUDIO`; Njangi has
  no microphone feature.
- Camera and photo-library access are optional and used only when a member
  chooses to attach an image to a record.

## Commands

```bash
# Direct Android install for a tester
bun run eas:build:preview:android

# TestFlight candidate using the preview backend
bun run eas:build:testflight
bun run eas:submit:testflight

# Store binaries using the production backend
bun run eas:build:production

# Submit the latest Android production AAB to Play internal testing
bun run eas:submit:play-internal
```

The first iOS `testflight` build must run interactively so EAS can create or
select the Apple distribution certificate and App Store provisioning profile.
Later builds can run non-interactively.

## Account-side prerequisites

### Apple

- [ ] Apple Developer Program membership is active.
- [ ] Create the App Store Connect app for bundle ID
  `com.truesignal.njangi`, primary language French, SKU such as
  `njangi-ios-001`.
- [ ] Complete one interactive `bun run eas:build:testflight` login and 2FA
  session to establish signing credentials.
- [ ] Submit the finished build to TestFlight.
- [ ] Add the owner as an internal tester before inviting external pilot users.
- [ ] Provide a stable reviewer account and notes describing the preview group
  fixture without asking reviewers to move real money.

### Google Play

- [ ] Create the Play Console app for package `com.truesignal.njangi`, with
  French as the default language.
- [ ] Complete the Play app-content, privacy, data-safety, content-rating,
  target-audience, and country/region forms.
- [ ] Upload the first production AAB manually if Play requires the initial
  upload before API submissions.
- [ ] Create/link a Google Cloud service account with permission to publish to
  the internal track, then configure it in EAS Submit.
- [ ] Add tester email addresses or a Google Group to internal testing.

## Required public pages

The following canonical URLs are intended for store metadata but returned 404
on 2026-07-14. They must be published over HTTPS before store submission:

- `https://njangi.app/privacy`
- `https://njangi.app/support`
- `https://njangi.app/terms`

The privacy policy should identify the legal entity and contact address, explain
account and group-record processing, optional payment-record images, push
tokens, and Sentry diagnostics, list processors (Clerk, Convex, Expo, and
Sentry), state retention/deletion rules, and provide an account/data deletion
request path. The policy must say plainly that Njangi records group activity and
does not hold, transfer, or process users' money.

Before publishing, have the final policy and terms reviewed for the actual
operating entity and launch countries.

## Store listing copy

### French — primary

**Name:** Njangi

**Subtitle / Play short description:** Votre groupe, bien rythmé.

**Description:**

Njangi aide votre groupe d'épargne à rester organisé, sans changer la manière
dont ses membres se remettent l'argent.

Voyez ce qui demande votre attention, suivez les prochaines réunions et gardez
un historique clair des cotisations déclarées, des confirmations, des remises
du pot et des décisions du groupe.

Avec Njangi, vous pouvez :

- retrouver votre prochaine action dès l'ouverture ;
- organiser les membres, les rôles, les tours et le calendrier ;
- déclarer et confirmer les cotisations enregistrées par le groupe ;
- utiliser le mode Réunion pour noter rapidement ce qui s'est passé ;
- consulter un historique partagé et résoudre les désaccords avec contexte ;
- utiliser l'application en français ou en anglais, en thème clair ou sombre.

Njangi est un carnet collectif. L'application ne détient pas les fonds du
groupe et ne réalise aucun transfert d'argent. Les remises et paiements ont lieu
entre les membres, selon les règles du groupe ; Njangi en conserve la trace.

### English

**Name:** Njangi

**Subtitle / Play short description:** Keep your group in rhythm.

**Description:**

Njangi helps savings groups stay organized without changing how members hand
money to one another.

See what needs your attention, keep track of upcoming meetings, and maintain a
clear shared history of declared contributions, confirmations, pot handovers,
and group decisions.

With Njangi, you can:

- find your next action as soon as the app opens;
- organize members, roles, rounds, and the meeting calendar;
- declare and confirm contribution records;
- use Meeting Mode to record what happened quickly;
- review a shared activity trail and resolve disagreements with context;
- use the app in French or English, in light or dark mode.

Njangi is a shared record book. The app does not hold group funds or transfer
money. Payments and handovers happen between members under the group's own
rules; Njangi records what the group says happened.

## Store privacy/data-safety inventory

Use this as the basis for the store forms; verify it again against the release
binary before submission.

| Data or capability | Purpose | Notes |
| --- | --- | --- |
| Account identifiers and profile details | Authentication and membership | Processed through Clerk |
| Group membership, roles, schedule, and activity | Core app functionality | Stored in Convex |
| Contribution and handover records | Shared group record keeping | Financial information is recorded; Njangi does not process the transaction |
| Optional uploaded image | User-selected context for a record/dispute | Camera or photo library only after user action |
| Push token | Notifications about group work | Expo notifications |
| Crash and diagnostic information | Reliability and support | Sentry; no advertising tracking |
| Biometrics | Local device authentication only | The app does not receive or store Face ID/biometric data |

Declare no advertising, no cross-app tracking, and no data sale unless the
release implementation or business practice changes.

## Review notes draft

Njangi is a cooperative-group record book, not a bank or wallet. It does not
hold funds, initiate transfers, or connect to financial accounts. Contribution
and pot-handover screens record actions that happen directly between group
members. USSD instructions may open the device dialer, but the user reviews and
initiates any carrier action outside Njangi.

Provide the reviewer with a dedicated account and an already-created sample
group. Include exact steps for Today, Groups, Calendar, a contribution record,
Meeting Mode, and a dispute review. Do not seed real personal information or ask
the reviewer to use real funds.

## Screenshot set

Capture the same narrative in French and English, without the development pilot
overlay or personal data:

1. Today — one clear next action and two compact secondary actions.
2. Groups — collective cards and the next gathering.
3. Group detail — people, roles, and current round context.
4. Calendar — native monthly selector and upcoming gatherings.
5. Meeting Mode — fast cooperative record entry.
6. Activity/history — named provenance and confirmation state.

Use real-device-size captures. At minimum prepare iPhone 6.9-inch and Android
phone portrait assets; create additional sizes from store tooling only after
checking that text remains legible and no UI is stretched.

## Phone acceptance checklist

- [ ] Fresh install, first launch, sign-up, sign-in, sign-out, and relaunch.
- [ ] French and English; light and dark appearance.
- [ ] Today, Groups, Calendar, Actions, Profile, and deep-link navigation.
- [ ] Camera/photo permission denied and allowed paths.
- [ ] Push permission denied and allowed paths; notification opens the intended
  record.
- [ ] Airplane mode and weak-network recovery; no duplicate money record.
- [ ] Kill/reopen during Meeting Mode; queued entries recover exactly once.
- [ ] Large text, small Android device, and screen-reader labels on critical
  actions.
- [ ] No development overlay, seed controls, console noise, or staging labels in
  a production build.
- [ ] Sentry receives a controlled non-sensitive test event with the correct
  release and environment.
