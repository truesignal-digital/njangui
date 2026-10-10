# Personal finance UI direction: review, 2026-10-07

Reviews the 4 mockups in `docs/personal-finance-direction-2026-10-06.html` (`#screens`).
Fable 5.1 led; Opus 5.5 gave an independent second opinion. Opus 5.5 drew the mockups, so neither reviewer judged its own work.

## Verdict

**Not fit to build from as drawn.** Both reviewers keep the product model: pockets, internal moves, cash check, balance-chain gaps, fee lens and njangi position. Both reject the screens.

The mockups use the dark plum "money hero" style. That style was superseded on 2026-09-26, and the 2026-10-06 neutral black/white decision (like ROUTIQ) replaced its successor, Tour. Redraw everything in the neutral kit, and design the consent and SIM-setup screens first.

## P0: block before any build

| # | Where | Problem | Fix |
|---|---|---|---|
| 1 | All screens | Superseded dark plum system; dark mode was cut because it fails outdoors on LCD | Redraw in the neutral kit: white background, near-black ink, grey rules, colour only for states and the amber beneficiary, system font with tabular figures. The kit exists but is uncommitted, in the `docs/mobile-ui-guide` worktree (`.claude/worktrees/ui-guide/docs/design/ui-guide/`) |
| 2 | Home hero "Tout ce que j'ai · 187 450 F" | Reads like a wallet the app holds. Shows total wealth in public. Adds estimated cash and an illiquid njangi into an exact-looking number | Remove. Pocket rows only, each with **holder + source + time**: "Orange Money · selon SMS du 6 oct 14:02", "Njangi Bureau · chez Marie" |
| 3 | Onboarding | No SMS disclosure + consent screen. Google Play and Law 2024/017 require it before the runtime prompt | First screens of the next round, with "Continuer sans SMS" and deletion |
| 4 | All screens | Text at 9.5–12px in the frame, about 13–15dp on a real phone, under the 16dp floor. Faint text is about 4.5–5:1 contrast, under 7:1 | Kit sizes; no information-bearing text in faint |
| 5 | Feed scam card "SMS suspect bloqué" | False: an app that reads SMS cannot block one. Scanning ordinary-number SMS also contradicts the "we read only operator senders" promise. Spoofed operator IDs would pass the allowlist | Copy with evidence and no "blocked". Make the broken balance chain the main signal. Never treat an SMS credit as confirmed on its own |
| 6 | Feed rows | No dates on any row. 4 of 5 names truncated. "Confirmé par la trésorière" has no name | Date tile + person + amount on every line; names wrap to 2 lines |
| 7 | Budget bars, feed amounts | States shown by colour alone | Icon + word + colour ("Dépassé de 1 000 F"); money direction shown with an arrow, not green |

## P1: next mockup round

- **Word limits** (≤25 per member screen): Home ~38, Feed ~45, Cash check ~26, Budget ~19. Cut the greeting, hero line, subtitle slugs and quoted SMS text.
- **One verb+amount button per screen.** Home, Feed and Budget have none. Use "Compléter 8 200 F" and "Enregistrer 8 500 F dépensés".
- **Internal moves** ("Retrait → Liquide −20 000") shown as spending. Show them unsigned with a move mark; only the fee counts as a spend.
- **Njangi position**: no signed "+25 000 F". Before the pot: "Versé 40 000 F · pot prévu [date]". After: "Reste à verser 60 000 F". Amounts come from `expectedForMember`.
- **Number errors in the mockups**:
  - The rentrée goal says "26 000 F/mois". With 312,000 F left over ~10.5 months, it's ~29,700 F.
  - Home says "tour 3/10" but the feed says "tour 4".
  - Envelopes total 175,000 F but the Home bar says 180,000 F.
- **Cash check** needs a keypad, a "J'ai reçu du liquide" branch, "Pas ce soir", and a "Njangi" chip. "Crédit" should read "Crédit tél.". Drop voice from Phase 1 (the roadmap puts it later) and drop the 🎙 emoji.
- **Debt reminder** "rappel vendredi" implies the app messages Brice. Only the user, via WhatsApp share, may contact a third party.
- **Freshness**: "auto · hier" hides stale data. Use an absolute time, a SIM suffix, and a stale state ("Pas de SMS depuis 9 j").
- **Missing elements**: no listen button and no faces on any screen.

## P2

- Amounts must use `formatCurrencyXAF` with a non-breaking space.
- Operator orange and yellow only in small logos, never on amounts or bars, where they read as warning states.
- The fee total is a footnote. Decide whether fees also count inside envelopes.

## Repo facts that gate the build

- `src/lib/mobile-ui-config.json` still has a cream light background, Newsreader serif headings (line 130) and JetBrains Mono prices (line 136): three of the user's design no-gos. The neutral tokens must land before any personal-finance screen.
- `scripts/lint-design-system.ts:135` bans `expo-symbols`, which the neutral decision needs.
- Tabs today: Aujourd'hui · Groupes · Actions (`app/(app)/(tabs)/_layout.tsx:71-87`); profile is a stacked screen.

## Screens for the next mockup round (merged order)

1. SMS disclosure + consent, denied state, "Continuer sans SMS"
2. SIM and wallet setup: dual SIM, "cette SIM n'est pas à moi", backfill start date (second-hand phones carry old SMS)
3. Backfill progress + first result + quick review
4. Accueil in 5 states: Android auto, iOS manual, SMS refused, empty, stale
5. Mouvements feed row spec + movement detail (recategorise, split, internal move, "pas moi")
6. Gap fill
7. Cash check: keypad, split, cash received, skip
8. Scam warning card + detail + "Je connais la personne"
9. Moi → privacy: hide amounts, app lock, notification content, pause SMS, export, delete all
10. iOS capture: share, paste, screenshot import, manual
11. Njangi "Ma position" in group detail
12. Pocket detail with balance chain + "Corriger le solde"
13. Debts: create, share, counterparty confirm, SMS repayment match (needs the link-layer decision)
14. Fee lens
15. Phase 2: envelopes, seasonal goal

## Open decisions (reviewers split or the direction doc is silent)

1. **Tabs.** Fable: Accueil · Mouvements · Groupes · Moi. Opus: Accueil · Groupes · Moi, with the feed one tap from Accueil. Both fold Actions into an attention stack on Accueil and keep Budget off the tab bar until Phase 2.
2. **Scam detection scope.** Scan non-operator SMS (needs a separate opt-in, a rewritten privacy promise, and Play wording not yet verified), or stay operator-only and let users share a suspicious SMS into the app to check it.
3. **Hide amounts.** Hidden by default after first run, or a visible toggle.
4. **Counterparty confirm for debts.** Needs a link the other person opens. The public `/g/` link shell is frozen by the September pilot review.

## Decisions taken (2026-10-07)

- Tabs: **Accueil · Mouvements · Groupes · Moi**.
- Scam checks: **operator SMS only** (balance chain) plus a "Vérifier un SMS" share-in. Personal SMS are never scanned.
- Hide amounts: **asked at onboarding**, with an eye toggle afterwards.
- Look: the **neutral kit** (2026-10-06 decision), not Tour.

## Round 2 → round 3 (Fable)

Round 2 (screens 1–9) fixed every round 1 P0 except text size. Fable then found:
- **P0, 1a:** "Lu ici, jamais envoyé" was false; structured fields go to Convex. Now: "Montants, noms, dates gardés. Jamais le texte."
- **Size ruling:** secondary text may be 14 px, never 13. State words, direction words, instructions and button labels are 16 px.
- **P1 fixes:**
  - 8a no longer claims what the app can't know.
  - No "C'est un vrai" next to the warning; the question comes after #150# (8c).
  - The hero button is never marigold.
  - Words replace checkmarks on the consent screen.
  - Trader words: Normalement, Je m'étais trompé hier, D'une poche à l'autre, Crédit, full dates.
- **New in round 3:** 7d (first cash count), 8c, 10a–c (iOS paste, screenshot, not understood), 11a–b (empty states), 13a (Njangi et dettes).

Mockups: `docs/prototypes/personal-finance-2026-10/index.html`, generated by `build.py`.

**Kit conflict to raise with the kit owner:** the kit's own Today hero uses a marigold button (`screens.html`), which the neutral decision (amber only for states and the beneficiary) and Fable's ruling forbid.

## Round 3 verdict (Fable, 2026-10-07)

**Build Phase 1 from screens 1–11 and 13. No further mockup round.** Its three last fixes are applied:
- 13a counts tours 1–2 only (20,000 F versé), because tour 3 is still "envoyé" on 5a.
- `.dir.strong` is now 16 px.
- The Phase 1 13a has no debts and no "Nouvelle dette" button, and the Accueil row reads "Vos njangis". 13b keeps the debts version as a Phase 2 reference.

Gate checks before two frames ship (Phase 0):
- 4e: does dialling *126# make MTN send an SMS?
- 10b: real Max It and MoMo history screenshot layouts.

The kit's marigold hero button must be settled with the kit owner before `hero-btn` becomes a shared component.

## Round 4: "Simple" (2026-10-08)

**Why:** the user judged round 3 still too complex for the average Cameroonian and asked for a brave rethink. Opus 5.5 built a concept, Fable reviewed it, and the concept was revised.

Page: `docs/prototypes/personal-finance-2026-10/simple.html` (generated by `simple.py`, 28 frames).

**The concept:**
- **Two places:** Moi and Nous.
- **"Le point du soir":** a short evening ritual. The app files confident guesses silently and asks only about cash (counted with banknotes), unknown movements and gaps. It ends with "C'est juste ?" showing the whole day.
- **Visual language:** one-colour pictograms, 🔊 on every screen, and voice inside the ritual.
- **Budgets** are proposed on the 1st of the month from last month's spending.

**Fable's review of the first version, and the changes made:**
- **P0 "Ça tient jusqu'au 24"**: a forecast that outruns the evidence with irregular income. The headline is now today's spending, with "J'apprends encore" in the first week.
- **P0 privacy screen missing**: restored as Vos données and Tout supprimer.
- **Emoji**: replaced with one-colour pictograms. Material Symbols stand in for a custom set to be drawn.
- **Hold-to-reveal**: replaced by a visible eye. Tapping a pocket opens its movements, and a visible "Mouvements" row was added.
- **Streak**: removed.
- **Floating mic**: removed. Voice now lives inside the ritual, uses the phone's own recognizer, French and English only.
- **Restored from round 3**: the Android dialog, the refused and stale states, and the check-then-alarm path for suspicious credits.
- **Copy**: "Tout votre argent, ici" became "tout en vue" (the old wording implied custody). Counts now carry their unit.
- **Third SIM**: the question is now its own card.
- **Banknotes**: a visible minus button on each note.
- **The day's sums** now reconcile.

**Decisions open:**
- Adopt Simple as the Phase 1 direction.
- Amounts hidden by default (replaces the 7 October onboarding question).
- Account at first open, or later.
- A custom pictogram set.

**Phase 0 tests:**
- Today's-spend headline vs a "ça tient jusqu'au" date.
- Banknotes vs keypad.
- Which pictograms people name correctly.
- Whether Android's "envoyer" wording scares people.

The revised version was not re-reviewed by Fable.
