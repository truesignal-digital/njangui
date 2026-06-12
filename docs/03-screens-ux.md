# Screens & UX

UX bar: Cash App polish for the njangi institution. One-thumb, instant, zero jargon, French-first. Every screen below is a native mobile screen — **Expo (React Native), Android + iOS from day one via EAS**, portrait-only in MVP. There is no web frontend.

---

## A. MVP Screen Inventory — Screen Tree

Expo Router file routes under `app/` (native stack + modals; data via Convex `useQuery()` from the Convex React Native client; params via `useLocalSearchParams()`; no route loaders, no SEO heads — there is no web surface).

```
app/
├── _layout.tsx                                 # root Stack: ClerkProvider → ConvexClientProvider, theme init, fr/en init,
│                                               #   deep-link config (njangi:// scheme; https universal links later)
├── index.tsx                                   # signed-out welcome → sign-in entry (redirects to (app) when authed)
├── sign-in.tsx                                 # Clerk native flow, phone-number-first
├── j/[inviteCode].tsx                          # njangi://j/:inviteCode  deep-link entry: group preview → sign-in → join/approval
├── onboarding.tsx                              # post-auth: name, language confirm
└── (app)/                                      # authed section
    ├── _layout.tsx                             # Clerk auth gate (skeletons while !isLoaded) + Stack hosting tabs & modals
    ├── (tabs)/
    │   ├── _layout.tsx                         # bottom tab bar: Accueil / Groupe / À confirmer / Profil
    │   ├── index.tsx                           # HOME — activity feed / group pulse
    │   ├── group.tsx                           # Groupe tab → active group detail, or switcher when >1 membership
    │   ├── inbox.tsx                           # CONFIRM INBOX (treasurer confirms; members act on
    │   │                                       #   payee-side claims against them — see B5)
    │   └── profile.tsx                         # my profile, ReliabilityScore, settings, language
    ├── groups/
    │   ├── new.tsx                             # GROUP CREATION WIZARD (modal; 4 steps, in-screen state)
    │   └── [groupId]/
    │       ├── index.tsx                       # GROUP DETAIL — state-driven: setup / active / between_cycles
    │       ├── settings.tsx                    # president/treasurer only: fines, schedule,
    │       │                                   #   invite, premium, member management + approval queue, role reassignment
    │       │                                   #   (incl. treasurer handover statement), « Échanger deux tours » (OrderChange)
    │       ├── members/[membershipId].tsx      # MEMBER PROFILE in group
    │       └── rounds/[roundId]/
    │           ├── index.tsx                   # ROUND DETAIL — contribution grid
    │           ├── pay/
    │           │   ├── index.tsx               # PAY FLOW step 1: method picker (modal stack over the round).
    │           │   │                           #   Kind-aware via param ?record=<paymentRecordId> — serves
    │           │   │                           #   contributions, arrears, and fines; defaults to my open contribution.
    │           │   │                           #   Stays reachable on closed rounds for open arrears rows (02 §closing).
    │           │   ├── ussd.tsx                # PAY FLOW step 2: USSD instructions + « Composer » dialer button
    │           │   │                           #   param: ?method=momo_mtn|orange_money
    │           │   └── claim.tsx               # PAY FLOW step 3: claim (amount, txn ID / screenshot)
    │           └── meeting.tsx                 # MEETING MODE (treasurer) — presentation: 'fullScreenModal'
    └── payments/[paymentId].tsx                # PaymentRecord detail + DISPUTE screen (state-driven)
```

Navigation model: the `(tabs)` group is the resting state; everything under `groups/` and `payments/` pushes onto the native stack above the tabs. The pay flow is a modal stack (picker → USSD → claim); **Meeting Mode is a full-screen modal** (`presentation: 'fullScreenModal'`) — no tab bar, no accidental back-swipe out of the réunion.

DECISION: invite links use the short form **`/j/:inviteCode`** — deep link `njangi://j/K7PMQ4` today, `https://<domain>/j/K7PMQ4` as a universal/app link later (02's invite spec), short inside WhatsApp messages, the main funnel. There is no web preview page: the WhatsApp invite is **text + store link + the deep link** (`invite.whatsappMessage`); installed users land directly on the in-app preview (B10). One link format everywhere: screen tree, wizard step 4, and `invite.whatsappMessage`.

DECISION: Bottom tabs = 4: **Accueil** (`(tabs)/index`), **Groupe** (`(tabs)/group` → the *active group*), **À confirmer** (`(tabs)/inbox`, badge count), **Profil** (`(tabs)/profile`). Active group = last-viewed, persisted to `AsyncStorage("njangi-active-group")`. Whenever the user has **more than one active membership**, the Groupe tab opens the group switcher list — **free or premium**. The free-tier "1 group" limit applies to groups *created/owned* (the treasurer side, decision 8 — premium is per group, paid by the treasurer); belonging to several njangis is normal in Cameroon, and **joining via invite is never gated** by any group's tier. Meeting Mode and the Pay flow are native modals above the tabs (Meeting Mode full-screen) — no tab bar visible.

DECISION: Dispute is not a separate screen; it is the `disputed` state of `payments/[paymentId]`. One deep link per PaymentRecord (`njangi://payments/:pid`) keeps WhatsApp-shared links stable.

---

## B. Core Screens — Wireframes + Interaction Notes

Status chip language (used everywhere, exact): `○ en attente` (pending) · `⏳ déclaré` (claimed) · `✓ confirmé` (confirmed) · `⚠ contesté` (disputed) · `✕ annulé` (cancelled).

### B1. Home / Activity Feed — `(tabs)/index`

```
┌────────────────────────────────┐
│ Njangi                    🔔   │
│                                │
│ ┌────────────────────────────┐ │
│ │ NJANGI DES FEMMES DE BONABERI│
│ │ Tour 4/12 · samedi 14 juin │ │
│ │ ████████░░░░  8/12 confirmés │
│ │ Pot : 80 000 / 120 000 F   │ │
│ │ reçu par Marie (trésorière)│ │
│ │ Bénéficiaire : Mama Ngozi  │ │
│ │ ┌────────────────────────┐ │ │
│ │ │     Je cotise  →       │ │ │
│ │ └────────────────────────┘ │ │
│ └────────────────────────────┘ │
│                                │
│ Activité                       │
│ ✓ Paul a payé · 10 000 F       │
│   confirmé par Marie · 2 min   │
│ ⏳ Aïcha a déclaré · 10 000 F   │
│   en attente de Marie · 1 h    │
│ ⚠ Cotisation de Samuel         │
│   contestée · hier             │
│ 🎉 Tour 3 terminé · Jean a     │
│   reçu le pot (120 000 F)      │
│                                │
├────────────────────────────────┤
│ Accueil  Groupe  À conf.² Profil│
└────────────────────────────────┘
```

- **Group pulse card** is the hero: round progress, pot total, beneficiary, due date. CTA is role- and state-aware:
  - Member, my contribution `pending` → `Je cotise →` (goes to pay flow).
  - Member, my contribution `claimed` → `⏳ En attente de confirmation` (non-CTA, taps to PaymentRecord).
  - Treasurer with N claimed records → `Confirmer N paiements →` (goes to inbox).
  - Treasurer on meeting day → second button `Mode réunion`.
- With **more than one active membership**, stacked pulse cards render (active group first); the Groupe tab is the switcher (§A nav DECISION). The single-card layout above is the one-group case, not an assumption.
- The pot line always names the human custodian (§F rule): « Pot : 80 000 / 120 000 F · reçu par Marie (trésorière) ». The figure is a sum of confirmed records physically held by the treasurer — never a bare balance that screenshots as an app-held pool (00 red line).
- Feed = single Convex `useQuery` (live, realtime), reverse-chron, page size 20, "Voir plus" loads more. Each item taps to its PaymentRecord or Round.
- Every item names people, never IDs: "Paul a payé", "confirmé par Marie". Who-paid-who-when is visible to all group members (decision 6) — the feed *is* the trust feature.
- Meeting-mode / treasurer-logged entries appear in the feed as `⏳ déclaré` (« Marie a enregistré 10 000 F reçus de Samuel · espèces ») until they confirm; auto-confirms are marked « auto » (02 transition 5).
- Prewarm: press-in (`onPressIn`) on the pulse card subscribes to the group-detail + current-round queries before navigation commits, so the pushed screen lands warm.

### B2. Group Detail — `groups/[groupId]`

```
┌────────────────────────────────┐
│ ←  Njangi des Femmes…      ⚙  │
│                                │
│        ◔  Cycle 1              │
│      Tour 4 sur 12             │
│   3 membres ont reçu le pot    │
│                                │
│ Ordre de rotation       🔒 fixé │
│ ✓ 1  Jean         a reçu T1    │
│ ✓ 2  Marie        a reçu T2    │
│ ✓ 3  Paul         a reçu T3    │
│ ▶ 4  Mama Ngozi   CE TOUR      │
│ ○ 5  Aïcha        Tour 5       │
│ ○ 6  Vous         Tour 6  ★    │
│ ○ 7  Brenda       Tour 7       │
│    … afficher les 12           │
│                                │
│ Tour en cours                  │
│ ┌────────────────────────────┐ │
│ │ Tour 4 · 8/12 · 80 000 F   │ │
│ │ reçu par Marie (trésorière)│ │
│ │        Voir le tour →      │ │
│ └────────────────────────────┘ │
│ Impayés (2) · 12 500 F      ▸  │
│                                │
│ [ Mode réunion ]  (trésorier)  │
│ Cotisation : 10 000 F / membre │
│ Rythme : hebdomadaire · samedi │
└────────────────────────────────┘
```

- DECISION: Rotation order is a **vertical list with a progress rail**, not a circle diagram. 15–30 members don't fit a legible circle on a 360px screen; the list scales, the small ring at top gives the at-a-glance "circle" feeling (`◔ Cycle 1`). The `▶ CE TOUR` row is sticky-highlighted (primary tint), `★` marks the viewing user ("Vous").
- `🔒 fixé` badge: rotation order is locked and public (decision 6). Tapping it shows a sheet: "L'ordre a été fixé le 3 mars par Jean (président). Tout le monde voit le même ordre. Toute modification passe par un échange de tours, enregistré et visible par tous."
- **« Échanger deux tours »** (president-only, in ⚙ settings and on the rotation-list header menu): pick two *future* turns → mandatory note → confirmation. This is 02's **OrderChange** mechanism — the routine "begging the turn" practice (bereavements, emergencies) must not force the group back to the notebook. The swap creates an immutable OrderChange record, posts a feed entry, and leaves a marker on the rotation list (« ordre modifié le 12 juin par le président — voir la note »), preserving the locked-and-public trust property. Exit-driven removals of future turns (02 §e) use the same record, system-generated.
- Member rows carry the **« défaillant »** badge after 2 consecutive unpaid rounds (02 §e1) — shown here, on B3's grid, and on B8; the president simultaneously gets the keep/remove prompt (§E). Copy states facts, never insults (§F).
- **Impayés block**: open arrears + unpaid fines across the group (« Impayés (2) · 12 500 F »), tapping lists the rows; each row deep-links to its record, and the owing member sees `Je cotise` wired to the open arrears `pending` record — closed rounds keep their pay entry point for arrears rows (02: arrears are claimable weeks later).
- Tapping any member row → member profile. Tapping current-round card → round detail.
- `⚙` visible only to president/treasurer → group settings: fines amount, schedule, invite link, premium, **member management** (approve/reject `pending_approval` join requests — the approval queue; mark exited/deceased with mandatory note), **role reassignment** incl. treasurer handover — which shows both treasurers 02 §e5's **handover statement** (ledger cash-on-hand = confirmed contributions + fines − confirmed payouts) — and « Échanger deux tours ».

**Group-state variants.** The wireframe above is the `active` state. Two more variants, both required for the core loop to ever begin (02: lock is an explicit president action with guards — *not* an automatic side effect of the first round):

- **`setup`** (where wizard step 4 lands): member list with join status + the pending-approval queue, the *draft* rotation order (freely editable), banner « X membres ajoutés — démarrez le cycle quand tout le monde a rejoint », and the president-only primary CTA **« Démarrer le cycle »**. The CTA runs 02's guards (≥ 2 active members, every active member in the order exactly once, amount > 0, schedule set, treasurer assigned) and shows the one-time lock-confirm sheet (« L'ordre sera fixé et visible par tous. Il ne changera plus, sauf échange de tours par le président. »). On confirm, the system materializes all rounds (02) and the screen flips to the `active` layout.
- **`between_cycles`**: cycle summary card (totals, on-time rates, WhatsApp-shareable per 02) + the same « Démarrer le cycle » CTA over a fresh draft order (members carried over per 02), plus « Archiver le groupe ».

### B3. Round Detail — `groups/[groupId]/rounds/[roundId]`

```
┌────────────────────────────────┐
│ ←  Tour 4 · sam. 14 juin       │
│ Bénéficiaire : Mama Ngozi      │
│ ████████░░░░   8/12 confirmés  │
│ Pot : 80 000 / 120 000 F       │
│ reçu par Marie (trésorière)    │
│                                │
│ Cotisations · 10 000 F chacun  │
│ ┌────────────────────────────┐ │
│ │ Jean      ✓ confirmé  MoMo │ │
│ │ Marie     ✓ confirmé  cash │ │
│ │ Aïcha     ⏳ déclaré    OM  │ │
│ │           [✓ Reçu] (trés.) │ │
│ │ Paul      5 000/10 000 F   │ │
│ │           partiel·reste    │ │
│ │           5 000 F ○        │ │
│ │ Vous      ○ en attente     │ │
│ │           [ Je cotise → ]  │ │
│ │ Samuel    ⚠ contesté ·     │ │
│ │           défaillant       │ │
│ │ Brenda    ○ en attente     │ │
│ │      [Marquer reçu] (trés.)│ │
│ │ …                          │ │
│ └────────────────────────────┘ │
│                                │
│ Amendes (2) ─ 2 000 F      ▸   │
│ [+ Ajouter une amende] (trés.) │
│                                │
│ Remise du pot · Mama Ngozi     │
│ ○ pas encore remis             │
│ [ Marquer le pot remis ](trés.)│
│ [ J'ai reçu le pot ]  (bénéf.) │
└────────────────────────────────┘
```

- The pot header names the custodian (§F rule) and is a sum of confirmed records — labeled « Total confirmé » in the expanded view, never a bare pooled balance.
- **Contribution grid**: one row per Membership, sorted: disputed → pending → claimed → confirmed (problems float up). Chip + method label (`MoMo` / `OM` / `cash`). Mixed methods in one round are normal — never visually penalize cash. Meeting-mode entries render `⏳ déclaré (espèces, réunion)` until they confirm (B6 — the tick is a payee-side claim, not a confirmation).
- **Partial payments are first-class** (02 edge case 7): a row whose confirmed sum is below the obligation shows « 5 000 / 10 000 F · partiel » with the remainder pinned as an open `○ reste 5 000 F` line; at round close the system splits the shortfall into an open arrears `pending` record, payable later through the same flow. Multiple records per (member, round) are normal.
- Row tap → PaymentRecord detail. Treasurer sees inline `[✓ Reçu]` on claimed rows — single-tap confirm, optimistic, with the **deferred-dispatch undo** (B5 DECISION: the mutation fires after a 5s client grace window; undo cancels the dispatch — a fired confirm is ledger-final).
- **Treasurer `Marquer reçu` on `pending` rows**: the member who sent MoMo mid-week and never opens the app (decision 7: "treasurer logs for them" — and kill-signal #2 territory) must be recordable *outside* Meeting Mode, or the paper notebook survives. Tap → method picker (`MoMo` / `OM` / `espèces`) + amount (prefilled, editable) → **payee-side claim** (`pending → claimed`, `claimedBySide: 'payee'`, starts `T_AUTO_CONFIRM` 48h) — identical semantics to a Meeting Mode tick (B6). Same action on fine rows.
- My own row pinned with the `Je cotise →` CTA if pending (incl. my arrears rows on closed rounds).
- **Amendes** collapsed section (same chip system, kind badge `Amende`): ordinary fine PaymentRecords (02 §f, 05 M14 — "pilot promise *fines respected* depends on this"). Treasurer/president get **« Ajouter une amende »** here and on the member profile: member + amount (prefilled from group settings) + reason → `pending` fine record, member notified. **My own fine row taps into the kind-aware pay flow** (same method picker → USSD → claim, header « Payer l'amende · 500 F »). Treasurer gets `Marquer reçu` on pending fine rows. Fines are accounted to the group's **caisse**, never folded into the round's pot (B6).
- **Assistance**: no section here. AssistanceLevy flows are **L3 (LATER)** per 05, and levies are round-independent anyway (02 §f; 01 I-5 — assistance records carry `assistanceLevyId`, no `roundId`). When L3 ships, levies surface at *group* level (group detail / feed), not in round detail.
- **Remise du pot block** (term per §F — never "payout" on FR surfaces): the payout record is **pre-created `pending` at round open** (02 §b) and the treasurer may claim it **any time from `open`** — real njangis hand over the pot at the réunion, the app never forces a wait, and closing with a shortfall is allowed (05 M8: incomplete pots are routinely handed over). Chip is neutral: « ○ pas encore remis ». Two claim paths, same handshake:
  - Treasurer `Marquer le pot remis` → `pending → claimed` (payer-side), **amount entered by the treasurer** at claim time, prefilled with the Total confirmé (M8: the app records reality, never computes/asserts an owed amount). Beneficiary confirms.
  - Beneficiary `J'ai reçu le pot` → **payee-side claim** (02 transition 3): auto-confirms at `T_AUTO_CONFIRM` if the treasurer stays silent.
  - `hasAccount: false` beneficiary (feature-phone): the **president confirms on their behalf**, logged as such, feed-labeled « attesté par le président pour {name} » (05 M8) — reachable here and from the B6 meeting summary. Without this, every feature-phone beneficiary's round would end in an auto-disputed payout.
  - Self-party case (treasurer is the beneficiary): auto-confirms on claim, feed-labeled (B6).
- When the payout confirms, the round moves to **`completed`** (the round *closes* earlier, at `graceEndAt` — 02; confirmation does not "close" it) and a 🎉 feed item posts.

### B4. Pay Flow (3 screens)

**Step 1 — Method picker — `…/pay`**

```
┌────────────────────────────────┐
│ ←  Cotiser · Tour 4            │
│                                │
│   10 000 F                     │
│   à remettre à Marie (trésor.) │
│                                │
│ Comment payez-vous ?           │
│ ┌────────────────────────────┐ │
│ │ 📱  MTN Mobile Money     → │ │
│ └────────────────────────────┘ │
│ ┌────────────────────────────┐ │
│ │ 🟧  Orange Money         → │ │
│ └────────────────────────────┘ │
│ ┌────────────────────────────┐ │
│ │ 💵  Espèces, à la réunion → │ │
│ └────────────────────────────┘ │
│                                │
│ ℹ L'argent va directement de   │
│   votre compte à celui de      │
│   Marie. L'appli ne touche     │
│   jamais votre argent.         │
└────────────────────────────────┘
```

- The flow is **kind-aware** (`?record=` per §A): the same three screens serve contributions (« Cotiser · Tour 4 »), arrears (« Cotiser · reste du Tour 2 »), and fines (« Payer l'amende · 500 F »). Header title and amount come from the targeted `pending` record.
- DECISION: last-used method is remembered per member per group and pre-highlighted.
- **Espèces** path skips USSD: shows "Apportez 10 000 F à la réunion de samedi. Marie cochera votre nom au Mode réunion." with optional `J'ai déjà remis les espèces → Déclarer` (creates a cash claim the treasurer must confirm).
- The custody disclaimer (`ℹ`) appears on this screen and the USSD screen — it is a trust feature, not legal fine print.

**Step 2 — USSD instructions — `…/pay/ussd?method=…`** (full content in §C)

```
┌────────────────────────────────┐
│ ←  Payer avec MTN MoMo         │
│ ⚠ Vérifiez le menu : il peut   │
│   changer selon l'opérateur.   │
│                                │
│ Numéro de Marie                │
│ ┌──────────────────┬─────────┐ │
│ │ 6 77 12 34 56    │ Copier  │ │
│ └──────────────────┴─────────┘ │
│   vérifié le 12 juin           │
│ Montant                        │
│ ┌──────────────────┬─────────┐ │
│ │ 10000            │ Copier  │ │
│ └──────────────────┴─────────┘ │
│ Référence (motif)              │
│ ┌──────────────────┬─────────┐ │
│ │ NJG-T4           │ Copier  │ │
│ └──────────────────┴─────────┘ │
│                                │
│ 1. Composez *126# sur votre    │
│    SIM MTN                     │
│ 2. … (étapes numérotées, §C)   │
│                                │
│ ┌────────────────────────────┐ │
│ │   📞  Composer *126#       │ │
│ └────────────────────────────┘ │
│     Copier le code *126#       │
│ ┌────────────────────────────┐ │
│ │  J'ai envoyé → Déclarer    │ │
│ └────────────────────────────┘ │
└────────────────────────────────┘
```

- Copy-tap fields: single tap copies + haptic + field flashes `Copié ✓`. Number formatted with spaces for reading but copied without spaces.
- **« Composer \*126# »** opens the dialer via a native `tel:` deep link with the `#` URL-encoded — `Linking.openURL('tel:*126%23')` — code prefilled; the user presses call. The app never initiates or executes the payment. Native `tel:` intents are far more reliable than the old web-originated ones (no browser/WebView stripping layer), but some Android OEM dialers (Tecno/Itel) still drop `*`/`#` — so the numbered manual steps stay on screen and a visible **« Copier le code \*126# »** copy-tap fallback always sits under the button (§C RESEARCH FLAG; §G smoke test).
- **Dual-SIM**: nearly all Cameroonian users carry MTN + Orange; the code must run on the matching SIM. Step 1 of both §C flows names the SIM (« sur votre SIM MTN » / « sur votre SIM Orange »).
- The treasurer's number is **revalidated whenever online** and carries its own freshness pill directly on the field (« vérifié le {date} ») — not just the global offline pill. After a treasurer handover (02 §e5) a cached number may belong to the ex-treasurer, possibly someone removed for cause; the staleness signal must sit on the number itself.
- DECISION: reference format `NJG-T<round>` (e.g. `NJG-T4`), ≤8 chars to survive carrier "reason" field limits; helps the treasurer match SMS to member at confirm time.
- This screen's static content (steps, codes) ships in the app bundle with the last-fetched Convex copy cached locally, so it works fully offline (§D), with the number-freshness pill as above.

**Step 3 — Claim — `…/claim`**

```
┌────────────────────────────────┐
│ ←  Déclarer mon paiement       │
│ MTN MoMo · à Marie · Tour 4    │
│                                │
│ Montant envoyé                 │
│ ┌─────────────────────┬──────┐ │
│ │ 10 000              │  F   │ │
│ └─────────────────────┴──────┘ │
│ (prérempli : reste à cotiser)  │
│                                │
│ ID de transaction              │
│ (dans le SMS de MTN)           │
│ ┌─────────────────┬──────────┐ │
│ │ ex. 8512345678  │  Coller  │ │
│ └─────────────────┴──────────┘ │
│        ─── ou ───              │
│ [ 📷 Joindre une capture ]     │
│                                │
│ ℹ C'est la confirmation de     │
│   Marie qui rend le paiement   │
│   officiel — pas la capture.   │
│                                │
│ ┌────────────────────────────┐ │
│ │   Déclarer le paiement     │ │
│ └────────────────────────────┘ │
│   Déclarer sans preuve         │
└────────────────────────────────┘
```

- **Amount field: prefilled with the remaining obligation, editable, numeric keyboard** (02 edge case 7 — "people send what they have"; a trader who sent 5 000 of 10 000 F must be able to claim truthfully). Under/over triggers a **warning, never a block** (02's guards: « Il restera 5 000 F à cotiser » on partials; « Vous êtes déjà à jour pour ce tour » when claiming against a satisfied obligation, 02 edge case 6). After a partial confirm, the member's round row shows « 5 000 / 10 000 F · partiel · reste 5 000 F » (B3); at round close the remainder splits into an open arrears `pending` record.
- Txn ID is the **nudged** path: field first, `Coller` button reads clipboard, numeric keyboard. Screenshot is secondary (`ou` divider, ghost button). `Déclarer sans preuve` is a tertiary text link — allowed, never blocked (decision 3).
- Submitting moves the PaymentRecord `pending → claimed`, fires optimistic UI, returns to round detail where the user's row now shows `⏳ déclaré`, and notifies the treasurer.
- Screenshot: client-side resize to max 1280px / ~200KB JPEG before Convex storage upload; if offline, the claim sits in the in-memory mutation queue and the upload retries on reconnect within the session — the claim is never blocked by the image (§D).
- Microcopy makes decision 2 explicit: proof is a dispute artifact; confirmation is truth.

### B5. Confirm Flow — Inbox — `(tabs)/inbox`

```
┌────────────────────────────────┐
│ À confirmer (5)                │
│ Glissez à droite = reçu ✓      │
│                                │
│ ┌────────────────────────────┐ │
│ │ Aïcha · 10 000 F · OM      │ │
│ │ Réf NJG-T4 · ID OM784512   │ │
│ │ il y a 1 h                 │ │
│ │ [ ✓ Reçu ]   [ Pas reçu ]  │ │
│ └────────────────────────────┘ │
│ ┌────────────────────────────┐ │
│ │ Brenda · 10 000 F · MoMo   │ │
│ │ 📷 capture · il y a 3 h    │ │
│ │ [ ✓ Reçu ]   [ Pas reçu ]  │ │
│ └────────────────────────────┘ │
│ ┌────────────────────────────┐ │
│ │ ⚠ Samuel · contesté · 3 j  │ │
│ │        Voir le litige →    │ │
│ └────────────────────────────┘ │
└────────────────────────────────┘
```

- Swipe-right **or** tap `✓ Reçu` → `claimed → confirmed`, optimistic, card collapses with ✓ animation. Payer gets instant push "Marie a confirmé ✓".
- DECISION (undo mechanics — `confirmed` is ledger-final, 01 §3.2 / 02, so a fired confirm can never be un-confirmed): the confirm mutation is **dispatched after a 5s client-side grace window**. The card shows « ✓ confirmation… » with `Annuler`; undo within the window cancels the dispatch — nothing hits the ledger. Once dispatched, the only reversal is president override (02 row 12). Same mechanics for B3's inline `[✓ Reçu]`.
- Card shows exactly what the treasurer needs to cross-check against their own carrier SMS: payer, amount, method, reference, txn ID (tap to copy), screenshot thumbnail (tap to zoom).
- `Pas reçu` → confirmation sheet → marks the PaymentRecord `disputed` immediately and notifies payer + group. DECISION: explicit treasurer rejection short-circuits the 72h auto-dispute timer.
- DECISION: per-item confirmation only in MVP — no bulk confirm. Confirmation is the source of truth (decision 2); bulk-confirm would devalue it. Meeting Mode covers the legitimate bulk case (cash).
- **Member view — "Mes paiements en cours" — is actionable where the member is the objecting party** (05 M12: the in-app inbox is the guaranteed channel; push is best-effort — permission denials happen even with native expo-notifications):
  - My **payer-side** claims (« en attente de Marie ») → read-only.
  - **Payee-side `claimed` records logged against me** (Meeting Mode tick, treasurer `Marquer reçu`) → `C'est exact ✓` / `Contester` buttons + countdown « confirmation automatique dans 36 h ». This is the payer's objection window before `T_AUTO_CONFIRM`; it must exist in-app, not only as a push.
  - `payments/[paymentId]` in `claimed` state renders the same two buttons for the payer (deep-link target of the push notification).
- Beneficiaries see pending payout confirmations here too. Self-party records (B6) never appear in the inbox.

### B6. MEETING MODE — `…/rounds/[roundId]/meeting`, full-screen modal (treasurer/president only)

Full-screen native modal (`presentation: 'fullScreenModal'`). No tab bar. Screen kept awake via `expo-keep-awake`. Target: 20 entries in 2 minutes.

```
┌────────────────────────────────┐
│ ✕   MODE RÉUNION · Tour 4      │
│                                │
│ ESPÈCES CHEZ MARIE : 60 000 F  │
│                        6 / 12  │
│ ═══════════════════════════════│
│ ✓ Jean        10 000 F      ↩  │
│ ✓ Marie       10 000 F      ↩  │
│ ✓ Paul        10 000 F      ↩  │
│ ✓ Mama Ngozi  10 000 F      ↩  │
│ ✓ Brenda      10 000 F      ↩  │
│ ⏳ Aïcha    déclaré MoMo  [✓]  │
│ ┌────────────────────────────┐ │
│ │ Samuel              10 000 │ │ ← tap anywhere on row
│ └────────────────────────────┘ │
│ ┌────────────────────────────┐ │
│ │ Florence            10 000 │ │
│ └────────────────────────────┘ │
│ │ …                          │ │
│ ═══════════════════════════════│
│ ┌────────────────────────────┐ │
│ │   Terminer la réunion      │ │
│ └────────────────────────────┘ │
└────────────────────────────────┘
```

- The header total is captioned with the custodian — **« ESPÈCES CHEZ MARIE »** (or « reçu par la trésorière ») — never a bare « POT » ticking up like an app balance (00 red line, §F rule). The count-up animation stays; the label is what changes the regulatory reading.
- **The roll-call list *is* the round's pre-created PaymentRecords** (02/01: one `pending` contribution record per active member is created at round open — a tick never *creates* a record). **Row rendering is state-driven**:
  - `pending` → tappable card; **one tap = espèces reçues** (semantics below), amount prefilled from the group's fixed contribution. Row flips to ✓ with green flash + haptic; the cash total ticks up; counter increments. No confirm dialogs anywhere.
  - `claimed` payer-side (member self-claimed MoMo/OM before the réunion — the normal mixed case per decision 3) → shows `⏳ déclaré (MoMo)`; tap **confirms the existing record** (`claimed → confirmed`, transition 4) — it never creates or claims a second record, so the pot can't double-count.
  - `confirmed` → pre-ticked ✓, inert (long-press to view the record).
  - `disputed` → ⚠ row, deep-links to the dispute screen (B7).
- DECISION (semantics, per 02 transition 3 — this replaces the earlier "created directly `confirmed`" draft, which specced illegal transitions): a tick on a `pending` row performs a **payee-side claim**: `pending → claimed` with `claimedBySide: 'payee'`, `method: cash`, starting **`T_AUTO_CONFIRM` (48h)**. The ✓ and green flash are the treasurer's *local optimistic tick*; ledger-wise the entry is `⏳ déclaré` (B3's grid and the feed show it as such) until it confirms. The member gets a push + inbox entry with two buttons:
  - **`C'est exact ✓`** → the real `claimed → confirmed` (short-circuits the window).
  - **`Contester`** → `claimed → disputed`, mandatory reason (02 transition 6).
  - **Silence** → auto-confirm at `T_AUTO_CONFIRM`, feed entry marked « auto » (02 transition 5). This objection window is what makes 20-entries-in-2-minutes safe without 20 manual confirmations — deleting it would delete the payer's only protection on the killer feature.
- `↩` per row = the treasurer **withdraws their own claim** (`claimed → cancelled`; the system re-creates the `pending` record — 02 row 8, the only legal undo). Available until the record confirms. Confirms of pre-claimed rows use the 5s deferred-dispatch undo (B5) instead — a fired confirm is ledger-final.
- **Feature-phone members (MVP — no SMS, L6 per 05):** their entries are payee-side claims that auto-confirm at 48h, and they are **exempt from any payer-side auto-dispute** (their entries are payee-side by construction — 05 Week 4). Their receipt in MVP is the **public feed + the treasurer reading the meeting summary aloud + the WhatsApp-forwarded summary**; objections go through the treasurer or president. When SMS ships (L6), the SMS receipt layers on top — until then, never describe SMS as their protection.
- **Self-party records** (the treasurer's own contribution: payer = payee; the payout in the round where the treasurer is the beneficiary): the two-sided handshake collapses. DECISION: self-party records **confirm immediately on claim**, feed-labeled « auto-confirmé — trésorier » — the group-visible label is the control, per 02's president-is-a-party precedent — and are excluded from the inbox. The UI never shows the treasurer « en attente de confirmation » from themself.
- Long-press a row → sheet: edit amount (stepper — partials recorded with the actual amount, remainder split to arrears per 02 #7), add a Fine (prefilled fine amount from group settings), or switch method (member sent MoMo during the meeting). DECISION: long-press for the edge cases keeps the happy path single-tap.
- Unpaid rows stay at bottom; ticked rows float up. Search-as-you-type field appears if the group has >15 members.
- **Offline**: in-memory mutation queue + optimistic updates + the visible « N en attente de synchro » counter, plus the Meeting-Mode-only AsyncStorage tap queue — the single durable exception (§D). Cash total and counters compute client-side.
- `Terminer la réunion` → summary:

```
┌────────────────────────────────┐
│ ✓  Réunion terminée            │
│ Tour 4 · sam. 14 juin          │
│                                │
│ Reçu par Marie 110 000 F (11/12)│
│ Manquant     Samuel · 10 000 F │
│ Caisse (amendes)  2 000 F (2)  │
│                                │
│ Pot remis à Mama Ngozi         │
│ ┌──────────────────────────┐   │
│ │ 110 000               F  │   │
│ └──────────────────────────┘   │
│ [ Marquer le pot remis ]       │
│                                │
│ ┌────────────────────────────┐ │
│ │ 🟢 Partager sur WhatsApp   │ │
│ └────────────────────────────┘ │
│        Fermer                  │
└────────────────────────────────┘
```

- DECISION: **pot and caisse are separate lines, never summed.** In Cameroonian njangi practice, amendes go to the group's caisse (trouble fund), not the current tour's beneficiary — and 02's treasurer-handover statement accounts fines as group cash-on-hand separate from payouts. Where fines go is a group rule; the default is the caisse, and the app **never auto-adds fines to the payout amount**. Summary, WhatsApp share text, and `payout.confirmed` copy all keep them apart (every pilot treasurer's arithmetic must agree with the app's).
- The payout figure is the **prefill of a treasurer-entered, editable amount** (05 M8: the app records reality, never computes or asserts an owed amount). The « Reçu par Marie » line is a sum of declared/confirmed records, custodian-captioned (§F).
- `Marquer le pot remis` transitions the **pre-created** payout record (`pending` since round open, 02 §b) to `claimed` by the treasurer; the beneficiary confirms — cash payout handed over at the réunion is the common case. For a `hasAccount: false` beneficiary, the **president confirms on their behalf** from this summary (or B3's payout block), logged as such and feed-labeled « attesté par le président pour {name} » (05 M8). Treasurer-is-beneficiary → self-party auto-confirm (above).
- WhatsApp share = `https://wa.me/?text=…` with the plain-text summary (group name, round, « Reçu par Marie : 110 000 F », « Caisse (amendes) : 2 000 F », « Pot remis à Mama Ngozi : 110 000 F », who's missing, deep link `njangi://groups/:id/rounds/:rid` — https universal link later). Auto-posted to the in-app feed regardless — in MVP this read-aloud/forwarded summary is the feature-phone members' receipt.

### B7. Dispute Screen — `payments/[paymentId]` in `disputed` state

```
┌────────────────────────────────┐
│ ←  ⚠ Paiement contesté         │
│ Aïcha → Marie · 10 000 F       │
│ Tour 4 · Orange Money          │
│                                │
│ Chronologie                    │
│ • 12 juin 14:02 — Aïcha a      │
│   déclaré · ID OM784512        │
│ • 12 juin 14:03 — capture      │
│   jointe                       │
│ • 15 juin 09:00 — ⚠ contesté   │
│   (aucune confirmation en 72 h)│
│                                │
│ Preuves                        │
│ [ 🖼 capture ]  ID OM784512 ⧉  │
│                                │
│ 👥 Tout le groupe voit ce      │
│    litige.                     │
│                                │
│ Marie :  [ ✓ Finalement reçu ] │
│ Aïcha :  [ Annuler ma déclar. ]│
│ Président : [ Trancher ]       │
│ [ 💬 En discuter sur WhatsApp ]│
└────────────────────────────────┘
```

- A PaymentRecord becomes `disputed` two ways: timer or explicit `Pas reçu`. DECISION: timers come from **02's constants table — the single source**: `T_AUTO_DISPUTE` = 72h for contributions and fines, fixed app-wide in MVP (not per-group). Payout claims use the **7-day window** (05 Week-2 DECISION; 02's constants table should gain a named payout constant — reconcile there, then cite it here).
- Resolution paths map 1:1 to 02 §d / rows 9–12 and 05 M9:
  - Payee late-confirms (`✓ Finalement reçu`) → `confirmed`.
  - Payer withdraws (`Annuler ma déclaration`) → `cancelled` (fresh `pending` re-created if the obligation is unmet).
  - **President `Trancher`** (president-only — MVP, not LATER): sheet with two outcomes, « Finalement reçu » → `confirmed` or « Annuler la déclaration » → `cancelled`, **mandatory note ≥ 10 chars**, creating the immutable `presidentOverrides` record. Badge « résolu par le président », plus « (partie au litige) » when the president is a party (02 row 11). Without this, a standoff (payer insists sent, payee insists not received) is an absorbing state — `T_DISPUTE_STALE` pings the president weekly to « trancher », so the screen must give the president the action.
- Group visibility ("👥 Tout le groupe voit ce litige") remains the first-line enforcement mechanism, exactly as in offline njangi practice; the override exists so disputes can always terminate.
- DECISION: no in-app chat. `En discuter sur WhatsApp` deep-links to the payee's WhatsApp with a prefilled message containing the payment deep link. WhatsApp is the competitor's strength; borrow it.
- Buttons render conditionally by viewer role; other group members see the timeline read-only.

### B8. Member Profile — `groups/[groupId]/members/[membershipId]`

```
┌────────────────────────────────┐
│ ←  Mama Ngozi              ⋮   │
│                                │
│        ●  96 · Excellent       │
│   12 cotisations à temps sur   │
│   13 dans ce groupe · 1 retard │
│   Membre depuis mars 2025      │
│                                │
│ Dans ce groupe                 │
│ Rôle : membre                  │
│ Position : nº 4 — reçoit le    │
│ pot CE TOUR                    │
│ Amendes : 1 (payée ✓)          │
│ Doit : 0 F                     │
│                                │
│ Historique                     │
│ ✓ Tour 3 · 10 000 F · MoMo     │
│ ✓ Tour 2 · 10 000 F · espèces  │
│ ⏰ Tour 1 · 10 000 F · +3 jours │
│    Amende 500 F · ✓ payée      │
└────────────────────────────────┘
```

- ReliabilityScore block at top: **v1 = in-group on-time %** (05 M13, measured on `claimedAt`), number + plain-language label + the stats that compose it, in words. Never an unexplained number. DECISION: display buckets come from **01 §4 — the single source**: ≥ 90 « Excellent », 70–89 « Fiable », 50–69 « Moyen », < 50 « À risque » (four buckets; the example renders « 96 · Excellent »).
- **LATER (L4)**: cross-group portability — the « Le score suit Mama Ngozi dans tous ses njangis » header, Member-level cross-group stats, and the `profile.scoreExplainer` string ship with L4 and 04's `scoreShareConsents` opt-in flow (04's privacy rules: same-group members see only the in-group rate; cross-group aggregates require explicit consent). Until then, everything on this screen is Membership-level — this group only.
- **« Doit : X F »** = open arrears + unpaid fines (02 §e), warn-without-shaming copy (§F). On my own profile, a `Je cotise` button beside it deep-links the pay flow to the open arrears `pending` record — arrears stay claimable after their round closes (02), and the closed round keeps its pay entry point.
- **« défaillant » badge** after 2 consecutive unpaid rounds (02 §e1), consistent with B2/B3 rows; the president gets the keep/remove prompt (§E).
- **`⋮` president action sheet** (02 §e, 05 M3/M8): « Échanger deux tours » (OrderChange swap of *future* turns, B2), « Marquer sorti·e », « Marquer décédé·e », « Retirer du groupe » — each with **mandatory note**; mechanical consequences per 02 (future round removed via system OrderChange, open `pending` records cancelled, arrears stay open and payable, confirmed history immutable). **Treasurer** additionally gets « Marquer reçu » on the member's open `pending` rows (arrears, fines) — same payee-side claim as B3. « Ajouter une amende » is available to treasurer/president here too (05 M14).
- History = immutable PaymentRecord list, read-only for everyone, including the treasurer. Late confirmations show `⏰ +N jours`.

### B9. Group Creation Wizard — `groups/new` (modal)

Four steps, one screen each, progress dots on top, in-screen state (single Convex mutation at the end). Back never loses input.

```
 Étape 1/4              Étape 2/4
┌──────────────┐      ┌──────────────┐
│ Votre njangi │      │ Le rythme    │
│              │      │ ◉ Hebdo      │
│ Nom du groupe│      │ ○ Quinzaine  │
│ [Njangi des _]│     │ ○ Mensuel    │
│              │      │ Jour: [Sam ▾]│
│ Devise: FCFA │      │ Cotisation   │
│ (fixe)       │      │ [ 10 000 ] F │
│ [Continuer →]│      │ par membre   │
└──────────────┘      │ [Continuer →]│
                      └──────────────┘
 Étape 3/4              Étape 4/4
┌──────────────┐      ┌──────────────┐
│ Ordre de     │      │ Invitez le   │
│ rotation     │      │ groupe       │
│ ≡ 1 Vous     │      │              │
│ ≡ 2 Marie ✎  │      │ njangi.app/  │
│ ≡ 3 Paul  ✎  │      │ j/K7M2PQ     │
│ + Ajouter un │      │ [⧉ Copier]   │
│   membre     │      │ [🟢 WhatsApp] │
│ [🔀 Tirage au │      │              │
│    sort]     │      │ 3 membres    │
│ ⚠ L'ordre    │      │ ajoutés —    │
│ sera fixé au │      │ envoyez le   │
│ démarrage du │      │ lien aux     │
│ cycle.       │      │ autres.      │
│ [Enregistrer →]     │ [Terminer ✓] │
└──────────────┘      └──────────────┘
```

- **Step 1**: name only. Currency displayed but locked to XAF.
- **Step 2**: Schedule (`weekly | biweekly | monthly`) + meeting day + fixed Contribution amount (MVP: fixed per decision/glossary). Amount input shows formatted preview ("10 000 F × 12 membres = pot de 120 000 F" once members exist).
- **Step 3 — rotation order builder**: creator adds members by name + phone number (contact picker where supported; manual entry always available — members need not have the app yet, covering feature-phone members). Drag handles `≡` to reorder; `🔀 Tirage au sort` shuffles (njangis often draw lots). DECISION (replaces the earlier "locks at first round start" wording): the wizard's order is a **draft**. It locks only when the president taps **« Démarrer le cycle »** on the setup-state group detail (B2) — an explicit action that runs 02's guards and materializes all rounds. Until then the president reorders freely; **after** lock, changes go exclusively through the OrderChange flow (« Échanger deux tours », B2), never free editing.
- **Step 4 — invite**: short code link `…/j/<code>` (§A link DECISION); WhatsApp share is the primary button. Members added in step 3 who later join via link are matched by phone number and slot into their reserved position. `Terminer ✓` lands on the **setup-state group detail** (B2): « 3 membres ajoutés — démarrez le cycle quand tout le monde a rejoint », with the president-only « Démarrer le cycle » CTA.
- Creator becomes president + treasurer by default; roles reassignable in group settings (DECISION).

### B10. Onboarding — `index`, `sign-in`, `onboarding`, `j/[inviteCode]`

```
┌────────────────────────────────┐
│            ◯◯◯                 │
│           Njangi               │
│  Votre njangi, noir sur blanc. │
│                                │
│        [ FR ]  [ EN ]          │
│                                │
│  Numéro de téléphone           │
│  ┌──────┬───────────────────┐  │
│  │ +237 │ 6 7X XX XX XX     │  │
│  └──────┴───────────────────┘  │
│  ┌──────────────────────────┐  │
│  │       Continuer          │  │
│  └──────────────────────────┘  │
│  Un code vous arrive par SMS.  │
│                                │
│  Pas de frais. Votre argent ne │
│  passe jamais par l'appli.     │
└────────────────────────────────┘
```

- **Phone-number-first via Clerk** (phone + SMS OTP as primary factor; no email, no password). +237 prefilled. fr/en toggle persists to `AsyncStorage("njangi-language")` before auth even exists.
- After OTP: `onboarding` asks exactly one thing — name ("Comment le groupe vous appelle-t-il ?") — then routes to the Accueil tab (empty state) or into the invite flow below.
- **Invite path** `j/[inviteCode]` (pre-auth deep-link entry — `njangi://j/:code`; non-installed invitees reach it via the store link in the WhatsApp message, §A invite DECISION): shows group name, member count, contribution amount, schedule — *before* sign-up, so the invitee knows what they're joining → `Rejoindre` → Clerk → then the join **splits** (02's invites DECISION: an open link must not auto-admit — njangis are closed trust circles, and auto-join would expose the full ledger to an unapproved stranger):
  - Phone matches a membership **pre-added by the creator/treasurer** (wizard step 3, feature-phone adds) → **auto-attach** to the existing membership + its history → lands on group detail.
  - Otherwise → Membership created in **`pending_approval`** → waiting screen « **Demande envoyée à {presidentName} — vous serez notifié.** » showing only the public preview data (no ledger access). President/treasurer get an approval-queue entry (B2 settings) + push (§E); on approval, the joiner's push lands them on group detail. Mid-cycle approvals land in the « Prochain cycle » list per 02 §e4.
  - Group at the **40-member cap** (05 Week 6: joins rejected above cap) → friendly state: « **Ce groupe est complet (40 membres).** Contactez {presidentName}. » — never an unspecified error on the main acquisition funnel.
- ≤3 screens from WhatsApp tap to group detail (or to the waiting state) once the app is installed. This is the main acquisition funnel (champion brings 15–30 members, decision 5).
- Whole onboarding works on the member's *second* visit too: signing in with the same phone number reattaches all Memberships.

---

## C. USSD Instruction Screen Content (exact)

Both screens carry this banner pinned at top (non-dismissable):

> FR: **⚠ Les menus *126# / #150# peuvent changer. Vérifiez chaque étape sur l'écran de votre téléphone.**
> EN: **⚠ The *126# / #150# menus can change. Verify each step against what your phone shows.**

> **SPEC NOTE — verify against current carrier menus before launch and re-verify quarterly.** Menu option numbers below reflect commonly reported MTN Cameroon / Orange Cameroun flows and WILL drift. Store these steps as i18n-keyed, remotely-updatable content (Convex doc, not hardcoded), so menu changes don't require an app-store release. DECISION.

> **RESEARCH FLAG (week 1) — `tel:` USSD reliability.** Device-test the « Composer » dial buttons (`Linking.openURL('tel:*126%23')`, `#` URL-encoded) on the Transsion devices dominant in Douala (Tecno/Itel, §G reference profile). Native app-originated `tel:` intents are markedly more reliable than the old web-originated ones (no browser/WebView USSD-hardening layer in the path), but some OEM dialers still strip `*`/`#`, leaving `*126` in the dialer or failing silently. The dial button is **progressive enhancement**; the numbered manual steps and the visible « Copier le code \*126# » copy-tap fallback ship regardless, and if `#` is stripped on reference devices the button degrades to copy-only (« Composez \*126# vous-même sur votre téléphone »). 04 commandment 5 (bare service code only, never composed strings) is untouched by either variant.

### MTN Mobile Money — `?method=momo_mtn`

Copy-tap fields above the steps: **Numéro de Marie** `677123456` (avec pastille « vérifié le {date} », B4) · **Montant** `10000` · **Référence** `NJG-T4`.

FR (primary copy):

1. Composez **\*126#** **sur votre SIM MTN** (téléphone à deux SIM : choisissez celle de votre compte MoMo) et appelez. *(bouton : 📞 Composer \*126#, repli : Copier le code)*
2. Le menu MTN MoMo s'affiche. Choisissez **1 — Transfert d'argent**.
3. Choisissez **1 — Vers un numéro MTN MoMo**.
4. Entrez le numéro de Marie : **677123456** *(collez-le)*.
5. Entrez le montant : **10000** *(sans espaces ni points)*.
6. Si MTN demande un motif ou une référence, entrez : **NJG-T4**.
7. **Vérifiez l'écran : le nom affiché doit être celui de Marie et le montant 10 000 F.**
8. Entrez votre **code PIN MoMo** pour confirmer.
9. Vous recevez un **SMS de MTN** avec l'ID de transaction. **Gardez-le** — vous le collerez à l'étape suivante.

EN: 1. Dial **\*126#** **on your MTN SIM** (dual-SIM phones: pick the SIM with your MoMo account) and call. 2. The MTN MoMo menu appears. Choose **1 — Transfer money**. 3. Choose **1 — To an MTN MoMo number**. 4. Enter Marie's number: **677123456** *(paste it)*. 5. Enter the amount: **10000** *(no spaces or dots)*. 6. If MTN asks for a reason/reference, enter **NJG-T4**. 7. **Check the screen: the name shown must be Marie's and the amount 10,000 F.** 8. Enter your **MoMo PIN** to confirm. 9. You'll receive an **SMS from MTN** with the transaction ID. **Keep it** — you'll paste it on the next screen.

### Orange Money — `?method=orange_money`

Same copy-tap fields. FR:

1. Composez **#150#** **sur votre SIM Orange** et appelez. *(bouton : 📞 Composer #150#, repli : Copier le code)*
2. Le menu Orange Money s'affiche. Choisissez **1 — Transfert d'argent**.
3. Choisissez l'option **vers un numéro Orange Money**.
4. Entrez le numéro de Marie : **697123456** *(collez-le)*.
5. Entrez le montant : **10000**.
6. **Vérifiez l'écran : nom de Marie + montant 10 000 F.**
7. Confirmez avec votre **code secret Orange Money**.
8. Vous recevez un **SMS d'Orange** avec l'ID de transaction. **Gardez-le** pour l'étape suivante.

EN mirrors the MTN structure (Dial **#150#** **on your Orange SIM** → **1 — Transfer money** → to an Orange Money number → paste number → amount → verify name + amount → secret code → keep the Orange SMS transaction ID).

Shared footer on both: *FR: « L'argent va de votre compte directement à celui de Marie. Njangi ne touche jamais à votre argent. » / EN: "The money goes from your account straight to Marie's. Njangi never touches your money."*

Step 7/6 ("verify the name on screen") is deliberate anti-fraud copy: the carrier's name-display is the user's real safeguard, and it reinforces that the carrier — not the app — executes the payment.

---

## D. Empty / Loading / Offline States Policy

**Loading.** Screen shells render instantly with `<Skeleton>` blocks matching final geometry (no spinners on full screens; spinners only inside buttons). While Clerk `!isLoaded`, render the tab shell + skeletons. Convex `useQuery` returning `undefined` → skeleton; never flash empty-state during load. Prewarm-on-press-in (subscribe to the target screen's Convex queries on `onPressIn`, before the navigation commits) means most pushed screens land warm.

**Empty states** — every list has one, with one CTA, warm copy:

| Screen | Empty copy (FR) | CTA |
|---|---|---|
| Home, no group | « Pas encore de njangi ici. Créez le vôtre ou demandez le lien d'invitation à votre président. » | `Créer un njangi` / `J'ai un lien` |
| Activity feed, new group | « Tout est calme. La première cotisation lancera l'activité. » | `Voir le Tour 1` |
| Inbox, nothing claimed | « Rien à confirmer. ✓ » | — |
| Meeting mode, all paid | « 12/12 — tout le monde a cotisé ! 🎉 » | `Terminer la réunion` |

**Offline & optimistic — the policy (scope-guarded).** DECISION — aligned with 05 Week 4's scope guard, which is the contract (a persistent offline-first store alone busts the 4–6 week window): the MVP offline story is **the Convex React Native client's built-in in-memory mutation queue + optimistic updates + a connectivity banner** (« Hors ligne — vos saisies seront envoyées ») and a visible **« N en attente de synchro »** counter, with **exactly one durable exception** for Meeting Mode: an **AsyncStorage tap queue** (04 §D). Mutations queued in-memory are lost if the app is killed before sync — accepted for MVP, mitigated by the counter.

| Action | Offline behavior (MVP) |
|---|---|
| Read group / round / feed | ✅ Convex client cache (memory) within the session; on reconnect, subscriptions re-sync automatically. Stale data shows a quiet `Hors ligne — données de <heure>` pill. |
| Read USSD instructions | ✅ Static steps/codes ship in the app bundle, with the last-fetched Convex copy cached in AsyncStorage — fully readable offline even after app restart; the treasurer-number field carries its « vérifié le {date} » freshness pill (B4). |
| Claim a contribution / fine (txn ID or no-proof) | ✅ Queued in the in-memory queue (client-generated idempotency key per claim, per 05 Week 2 — replays/dupes are no-ops), flushed on reconnect. Row shows `⏳ déclaré · en attente de réseau` with a small ↻. Lost if the app is killed before sync (counter makes this visible). |
| Meeting Mode ticks / undo / fines | ✅ In-memory queue **plus the one durable exception**: a Meeting-Mode-only **AsyncStorage tap queue** written before each mutation and replayed idempotently on next open (04 §D — the réunion hall with no signal is the critical path). Cash total computes client-side. **Cross-doc note:** 05's Week-4 scope-guard DECISION must be amended to name this single exception so 03/04/05 say one thing. |
| Attach screenshot | ✅ The claim queues; the image upload retries on reconnect *within the session* and never blocks the claim. If the app is killed first, the user re-attaches from the PaymentRecord screen. |
| Confirm (treasurer) / resolve dispute | ⚠ Same in-memory queue, but UI warns: « Sera confirmé dès le retour du réseau. » |
| Create group, join via invite, send invite, sign in/OTP | ❌ Requires connection (Clerk + invite-code validation). Friendly blocker: « Connectez-vous à internet pour continuer. » |

**LATER (explicitly demoted — post-pilot hardening, not MVP):** a general persistent AsyncStorage outbound mutation queue; versioned AsyncStorage snapshot rehydration of query results; a persistent offline image-upload retry queue.

Failure handling: if a queued mutation is rejected on flush (e.g. round closed meanwhile), the optimistic row reverts and a persistent in-app notice explains what to redo. Never silently drop a queued claim.

---

## E. Notification Matrix

Channels: **In-app** (inbox + feed + badge, free) — **the guaranteed channel** (05 M12: push permission denials make push best-effort, even native) · **Push** (expo push / in-app — native via `expo-notifications`, Android + iOS, free; replaces the old web-push channel) · **SMS** — **L6, post-MVP** (DECISION: *all* SMS — reminders *and* feature-phone receipts — is deferred to L6 per 05; per-message cost, provider unverified per 04 §G cost model. The column is kept below for L6 planning only; nothing in the pilot depends on it).

**Feature-phone members, MVP fallback (explicit):** their entries are **payee-side claims** that auto-confirm at `T_AUTO_CONFIRM` — they are exempt from payer-side auto-dispute by construction (05 Week 4). Their receipt is the **group feed + the treasurer reading the meeting summary aloud + the WhatsApp-forwarded summary**; objections go through the treasurer/president. SMS sends, when they ship at L6, are app-originated notifications only — never payment instructions.

| Event | In-app | Push | SMS (L6 — post-MVP) | Recipients |
|---|---|---|---|---|
| Round opened / contribution due | ✓ | ✓ D-2 & D-0 | D-1 | All members with `pending` contribution |
| Still pending during grace (02 §b) | ✓ | ✓ daily until claimed | — | Members whose contribution is still `pending` |
| Claim logged (`pending→claimed`, payer-side) | ✓ inbox | ✓ instant | — | Payee (treasurer) |
| Confirm reminder — `T_CONFIRM_REMIND_1/2` (02 transition 14) | ✓ inbox nudge | ✓ **private** at T+24h & T+48h « Rappel : confirmez 10 000 F d'Aïcha » | — | The confirming party. Private ramp **before** the 72h public escalation — the group-visible dispute must never be a busy treasurer's first signal |
| Confirmation (`claimed→confirmed`) | ✓ feed | ✓ instant | receipt | Payer (+ feed: whole group) |
| Meeting-mode / treasurer cash logged (payee-side claim, auto-confirms 48h) | ✓ inbox: `C'est exact ✓` / `Contester` + countdown | ✓ « C'est exact ? » | receipt | The payer logged (B5/B6) |
| Auto-confirm at `T_AUTO_CONFIRM` (02 transition 5) | ✓ feed entry marked « auto » | ✓ « Confirmé automatiquement » | receipt | Payer (+ feed) |
| Auto-dispute (`T_AUTO_DISPUTE`) or explicit `Pas reçu` | ✓ feed (group-visible) | ✓ | ✓ | Payer + payee; feed: whole group |
| Dispute stale — `T_DISPUTE_STALE`, weekly (02 §d) | ✓ | ✓ « Litige non résolu depuis 7 jours — tranchez » | — | President (B7 `Trancher`) |
| Dispute resolved | ✓ feed | ✓ | — | Payer + payee |
| Member defaulting — 2 consecutive unpaid rounds (02 §e1) | ✓ | ✓ prompt: keep / remove | — | President |
| Join request (`pending_approval`) | ✓ approval queue | ✓ | — | President + treasurer (B10) |
| Pot complete (all confirmed) | ✓ | ✓ | — | Treasurer + beneficiary |
| Payout claimed (« pot remis ») | ✓ | ✓ | ✓ | Beneficiary (to confirm) |
| Payout confirmed → round `completed` 🎉 | ✓ feed | ✓ | — | Whole group |
| Meeting reminder | ✓ | ✓ D-1 | D-0 morning | Whole group |
| Meeting summary posted | ✓ feed | ✓ | — | Whole group (plus WhatsApp share by treasurer) |
| Fine assessed | ✓ | ✓ | ✓ | Fined member |
| Join approved / member joined | ✓ | ✓ (joiner: welcome) | invite SMS w/ link | Joiner / president |
| It's almost your payout turn | ✓ | ✓ at round open | — | Next beneficiary |

Quiet hours 21:00–07:00 Africa/Douala for push & SMS (instant confirmations exempt for push). All copy through i18next per recipient language.

---

## F. Copy Tone Guide

Rules: say **njangi** (FR primary) / **njangi (tontine)** on first EN use — never "ROSCA". People over records: "Marie a confirmé", never "Record updated". Verbs over nouns, ≤8 words for buttons/toasts. Money always formatted `10 000 F` via `formatCurrencyXAF`. Warn without shaming — lateness copy states facts the whole group can see, it never insults. **Aggregate amounts always name the human who holds them** (custody rule, per 00's red line — no balances implying the app holds value): « Pot : 80 000 F · reçu par Marie (trésorière) », « Espèces chez Marie : 60 000 F », « Reçu par Marie : 110 000 F » — never a bare pooled total; computed totals are labeled as confirmed-record sums (« Total confirmé »), per 04 rule 3.

UI term mapping (locked): Contribution → *cotisation*, **Payout → *remise du pot*** (DECISION: canonical FR term — verb « remettre le pot », button « Marquer le pot remis »; never the anglicism "payout" on FR surfaces. This supersedes 04's glossary entry « versement au bénéficiaire » — update 04 to match in the same pass, one term everywhere), Round → *Tour*, Cycle → *Cycle*, Fine → *amende*, AssistanceLevy → *assistance* (term **reserved for L3** — no MVP surface uses it, see B3), claimed → *déclaré*, confirmed → *confirmé*, disputed → *contesté*.

Eleven canonical strings (i18n keys, both files updated simultaneously, FR is the primary copy):

| Key | FR | EN |
|---|---|---|
| `home.cta.contribute` | Je cotise | Pay my contribution |
| `pay.custodyNote` | L'argent va directement de vous à Marie. Njangi ne touche jamais votre argent. | The money goes straight from you to Marie. Njangi never touches your money. |
| `claim.success` | C'est noté ! Marie confirmera la réception. | Got it! Marie will confirm she received it. |
| `confirm.toast` | Marie a confirmé vos 10 000 F ✓ | Marie confirmed your 10,000 F ✓ |
| `confirm.auto` | Confirmé automatiquement après 48 h sans objection ✓ | Auto-confirmed after 48 h with no objection ✓ |
| `pot.custody` | Pot : {{amount}} · reçu par {{name}} ({{role}}) | Pot: {{amount}} · received by {{name}} ({{role}}) |
| `round.progress` | 8 membres sur 12 ont cotisé pour le Tour 4. | 8 of 12 members have paid in for Round 4. |
| `reminder.due` | Le njangi, c'est samedi. Votre cotisation : 10 000 F pour Mama Ngozi. | Njangi day is Saturday. Your contribution: 10,000 F for Mama Ngozi. |
| `dispute.opened` | Marie n'a pas encore confirmé les 10 000 F d'Aïcha. Le groupe en est informé. | Marie hasn't yet confirmed Aïcha's 10,000 F. The group has been notified. |
| `payout.confirmed` | 🎉 Mama Ngozi a reçu le pot : 110 000 F. Tour 4 terminé. | 🎉 Mama Ngozi received the pot: 110,000 F. Round 4 complete. |
| `meeting.summaryShare` | Réunion du 14 juin — 11/12 ont cotisé. Pot remis à Mama Ngozi : 110 000 F. Caisse (amendes) : 2 000 F. Détails : {{link}} | June 14 meeting — 11/12 paid in. 110,000 F pot handed to Mama Ngozi. Group fund (fines): 2,000 F. Details: {{link}} |

LATER (L4): `profile.scoreExplainer` (« Le score suit chaque membre dans tous ses njangis. Il monte à chaque cotisation confirmée à temps. ») ships with cross-group score portability and 04's `scoreShareConsents` consent flow — not in MVP copy files (B8).

---

## G. Accessibility & Performance Budget

**Reference device (test gate, not aspiration):** Android 9–10, 1–2 GB RAM (Tecno Spark / Itel class), 360×740 screen, the EAS-built APK on Hermes, throttled "Slow 3G" network (400 Kbps, 400 ms RTT). Every release is manually smoke-tested against this profile (iOS is the secondary gate — low-end Android is the constraint). The smoke test additionally covers the **« Composer » USSD dial buttons** (§C RESEARCH FLAG): does the stock dialer retain `#` from `Linking.openURL('tel:*126%23')`, and does the « Copier le code » fallback copy correctly.

**Touch & readability**
- Tap targets ≥ 48×48 px everywhere; Meeting Mode rows ≥ 64 px (treasurer is standing, moving, possibly in sun); primary CTAs full-width, thumb-zone (bottom third).
- Base font 16 px minimum; amounts 20 px+ semibold; respects OS font scaling to 200% without clipping.
- Contrast WCAG AA (4.5:1) on all text — enforced by `scripts/lint-design-system.ts`; semantic tokens only, no hardcoded hex. State chips pair icon + word + color (never color alone — `✓ confirmé`, not a green dot).
- All interactive elements reachable by TalkBack/VoiceOver with `accessibilityRole` set; `accessibilityLabel` on icon-only buttons (`↩`, `⧉`, `🔔`); feed and grids as accessible lists; screen-reader language follows the active i18n locale.

**Payload & speed budgets (hard limits, CI-checked)**
- **Hermes** on both platforms. JS bundle (Hermes bytecode) ≤ **2 MB**; Android APK download ≤ **25 MB** (checked on EAS build artifacts); Meeting Mode and the wizard lazy-loaded (inline requires) so they never tax cold start.
- One subset font max (or system fonts); icons imported per-icon from `phosphor-react-native` — never the full icon pack.
- Convex query results ≤ 20 KB each: `returns:` validators pick explicit fields, no doc spreading; feed paginated ×20; member lists project name/phone/status only.
- Screenshots: client-resized ≤ 200 KB before upload; thumbnails served resized.
- Targets on reference device: **cold start → interactive Home ≤ 4 s** (warm start ≤ 2 s); first Convex data paint ≤ 5 s on Slow 3G; pushed navigation (prewarmed) ≤ 200 ms perceived; Meeting Mode tick→visual feedback ≤ 100 ms (pure optimistic, zero network on path); zero layout jumps (skeletons reserve exact geometry).
- Animations: Reanimated transform/opacity on the UI thread only, 150–200 ms, honor the OS Reduce Motion setting; no parallax/blur effects (GPU-poor devices).
- USSD content bundled + cached (§D) so the réunion-hall offline path holds; copy/menu corrections ship OTA via EAS Update — no store wait (native-module changes still require a store release).