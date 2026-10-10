"""Generates simple.html: the "Simple" direction (round 4, revised after Fable's review).

Run: python3 docs/prototypes/personal-finance-2026-10/simple.py
Reuses the neutral kit (kit/), extra.css/extra.js from round 3, plus simple.css/simple.js.
"""
from pathlib import Path
import time

V = int(time.time())

NB = " "


def f(amount: int) -> str:
    return f"{amount:,}".replace(",", NB) + "&nbsp;F"


def i(name: str, cls: str = "") -> str:
    return f'<i data-i="{name}" data-c="{cls}"></i>'


# One-colour pictograms. Material Symbols stand in for a custom set to be drawn once (Fable: no platform emoji).
PICT = {
    "ration": "restaurant", "transport": "two_wheeler", "famille": "family_restroom", "credit": "smartphone",
    "eglise": "church", "plusieurs": "category", "salaire": "work", "vente": "storefront", "njangi": "handshake",
    "cadeau": "redeem", "autre": "more_horiz", "achat": "shopping_cart", "retrait": "payments", "envoi": "send",
    "inconnu": "help", "cash": "payments", "soir": "bedtime", "alerte": "warning", "deuil": "local_florist",
    "mic": "mic", "eye": "visibility", "eye-off": "visibility_off", "check": "check", "minus": "remove",
    "auto": "auto_awesome", "sms": "sms", "lock": "lock",
}


def p(name: str, cls: str = "") -> str:
    return f'<span class="pict {cls}" aria-hidden="true">{PICT[name]}</span>'


def op(kind: str) -> str:
    label = {"om": "OM", "mtn": "MTN"}[kind]
    return f'<span class="op {kind}" aria-hidden="true">{label}</span>'


def mark(name: str) -> str:
    return f'<span class="op neutral">{p(name)}</span>'


def frame(fid: str, label: str, body: str, budget: int, tab: str | None = None, footer: str = "",
          overlay: str = "", notes: list[str] | None = None, cls: str = "") -> str:
    tabbar = f'<div data-tabbar="{tab}"></div>' if tab else ""
    foot = f'<div class="footer">{footer}</div>' if footer else ""
    note_html = "".join(f"<li>{n}</li>" for n in (notes or []))
    return f"""
    <figure class="shot" id="s{fid}">
      <div class="frame-label">{fid} · {label}</div>
      <div class="frame {cls}" data-budget="{budget}">
        <div data-statusbar></div>
        {body}
        {foot}
        {tabbar}
        {overlay}
      </div>
      <div class="wc"></div>
      {f'<ul class="notes">{note_html}</ul>' if note_html else ''}
    </figure>"""


def scroll(inner: str, style: str = "") -> str:
    return f'<div class="scroll" style="{style}">{inner}</div>'


def listen() -> str:
    return f'<span class="listen" aria-label="Écouter">{i("listen")}</span>'


def eye(hidden: bool = True) -> str:
    return f'<span class="listen" aria-label="Montrer les montants">{p("eye-off" if hidden else "eye")}</span>'


def story_top(step: int, total: int = 4) -> str:
    bars = "".join(f'<div class="{"done" if k < step else ("on" if k == step else "")}"></div>' for k in range(total))
    return f'<div class="story-top"><div class="story-bars">{bars}</div><div class="story-tools">{listen()}<span class="icon-btn">{i("close")}</span></div></div>'


def tile(name: str, label: str, on: bool = False) -> str:
    return f'<div class="tile{" on" if on else ""}">{p(name, "lg")}<span>{label}</span></div>'


def bill(value: int, count: int) -> str:
    v = f"{value:,}".replace(",", NB)
    extra = f'<span class="cnt">×{count}</span><span class="minus" aria-label="Retirer un billet">{p("minus")}</span>' if count else ""
    return f'<div class="bill{" on" if count else ""}"><span class="v">{v}</span>{extra}</div>'


def coin(value: int, count: int) -> str:
    extra = f'<span class="cnt">×{count}</span>' if count else ""
    return f'<div class="coin{" on" if count else ""}">{value}{extra}</div>'


def counter(total: int, notes: list[tuple[int, int]], coins: list[tuple[int, int]]) -> str:
    return (f'<div class="bills">{"".join(bill(v, c) for v, c in notes)}</div>'
            f'<div class="coins">{"".join(coin(v, c) for v, c in coins)}</div>'
            f'<div class="count-total">{f(total)}</div>')


def chips(hidden: bool = True, stale: bool = False) -> str:
    def chip(lead: str, amount: str, badge: str = "") -> str:
        return f'<div class="pchip">{lead}<b>{amount}</b>{badge}</div>'
    h = "••••"
    mtn_badge = f'<span class="badge b-disputed mini">{i("disputed")}9 j</span>' if stale else ""
    return (f'<div class="section-h">Chez Orange, MTN et vous{eye(hidden)}</div>'
            f'<div class="pchips">{chip(op("om"), h if hidden else "98 200")}{chip(op("mtn"), h if hidden else "41 250", mtn_badge)}'
            f'{chip(mark("cash"), h if hidden else "23 000")}</div>'
            f'<div class="card" style="overflow:hidden"><div class="row"><span class="op neutral">{i("list")}</span><div class="main"><b>Mouvements</b></div><span class="chev">{i("chevron")}</span></div></div>')


def home_head(amount: str = "9 700", word: str = "sortis") -> str:
    return f"""
  <div class="home-top"><div style="flex:1"><div class="t-label muted">Aujourd'hui</div>
    <div class="today"><span class="money-hero">{amount}&nbsp;F</span><span class="dir strong">{word}</span></div></div>
    {listen()}<span class="avatar">LB</span></div>"""


def soir_card(count: int = 4) -> str:
    return f"""
  <div class="card pad moon">
    <div style="display:flex;align-items:center;gap:12px">{p("soir", "xl")}<div style="flex:1"><div class="t-title">Le point du soir</div><div class="t-small muted">{count} questions</div></div></div>
    <div class="btn primary" style="margin-top:12px">Commencer</div>
  </div>"""


# ================================================================ First open
s1 = frame("1", "Bienvenue", scroll(f"""
  <div style="display:flex;justify-content:flex-end">{listen()}</div>
  <div class="pockets-art"><div class="art om">OM</div><div class="art mtn">MTN</div><div class="art cash">{p("cash", "xxl")}</div></div>
  <div class="h-display" style="text-align:center">Orange, MTN, liquide&nbsp;: tout en vue.</div>
  <div class="lang"><div class="select on"><div class="t-title">Français</div><span class="radio"></span></div>
  <div class="select"><div class="t-title">English</div><span class="radio"></span></div></div>
""", "gap:20px;padding-top:10px"), 12, footer='<div class="btn primary">Commencer</div>',
    notes=["Round 4 said \"Tout votre argent, ici\": \"ici\" claimed the money is in the app. Fixed: the app <em>sees</em> the money, it never holds it.",
           "🔊 sits in the same place on every screen and reads it aloud (Medhi: consistent help).",
           "<b>Decision needed</b>: account first (today's Clerk username + password) or later, silently, when a njangi needs an identity."])

s2 = frame("2", "Consent, shown not told", scroll(f"""
  <div style="display:flex;justify-content:flex-end">{listen()}</div>
  <div class="h-headline">Je lis vos SMS d'argent. Seulement eux.</div>
  <div class="phone-sms" data-nowc>
    <div class="bub yes">{op('om')}<div><b>OrangeMoney</b><span>Paiement 1 500 F…</span></div>{p("check", "ok")}</div>
    <div class="bub yes">{op('mtn')}<div><b>MobileMoney</b><span>Reçu 15 000 F…</span></div>{p("check", "ok")}</div>
    <div class="bub no"><span class="avatar">MA</span><div><b>Maman</b><span class="blur">Tu as mangé ?</span></div>{p("lock")}</div>
  </div>
  <div class="t-body muted">Je garde montants, noms et dates. Jamais le texte.</div>
""", "gap:16px;padding-top:10px"), 25,
    footer='<div class="btn primary">Oui, lire mes SMS</div><div class="btn ghost">Pas maintenant</div>',
    notes=["The picture explains; the sample SMS inside it is not counted as reading. The sentence below is the accurate Play / Law 2024/017 disclosure.",
           "Copy rule: the app says \"Je\" only for reading, keeping, understanding. Never for money verbs (\"J'ai reçu\" would be a custody claim)."])

s2b = frame("2b", "Android's own question", scroll(f"""
  <div class="h-headline" style="margin-top:56px">Je lis vos SMS d'argent. Seulement eux.</div>
""", "padding-top:10px"), 25, overlay=f"""
  <div class="scrim"></div>
  <div class="sysdlg" data-nowc>
    <div style="text-align:center">{p("sms", "lg")}</div>
    <div class="t">Autoriser OnCotise à envoyer et afficher des SMS&nbsp;?</div>
    <div class="b"><span>Autoriser</span><span>Ne pas autoriser</span></div>
  </div>""",
    notes=["Restored from round 3: Android says the app could <em>send</em> SMS. Test in Phase 0 whether this wording scares people; refused leads to 5d.",
           "First open is 4 of our screens + this system dialog."])

s3 = frame("3", "Found it", scroll(f"""
  <div class="big-check">{p("check", "xl")}</div>
  <div class="h-headline" style="text-align:center">C'est prêt&nbsp;!</div>
  <div class="card" style="overflow:hidden">
    <div class="row">{op('om')}<div class="main"><b>Orange ··41</b><span>31 mouvements</span></div></div>
    <div class="row">{op('mtn')}<div class="main"><b>MTN ··07</b><span>21 mouvements</span></div></div>
  </div>
""", "gap:16px;padding-top:30px"), 12, footer='<div class="btn primary">Continuer</div>',
    notes=["Counts carry their unit (\"31 mouvements\"): a bare number is a puzzle, not a number.",
           "Start date not asked: the 1st of this month, changeable in Vos données."])

s3b = frame("3b", "Only if a third number appears", scroll(f"""
  <div style="display:flex;justify-content:flex-end">{listen()}</div>
  <div style="text-align:center">{op('om').replace('class="op om"', 'class="op om xl"')}</div>
  <div class="h-headline" style="text-align:center">Orange ··88, c'est à vous&nbsp;?</div>
  <div class="t-body muted" style="text-align:center">12 mouvements trouvés.</div>
""", "gap:16px;padding-top:40px"), 12,
    footer='<div class="btn primary">Oui, c\'est à moi</div><div class="btn secondary">Non</div>',
    notes=["Its own card, two answers, no third button. \"Non\" switches the number off and nothing from it is stored."])

s4 = frame("4", "Count your cash with banknotes", scroll(f"""
  <div style="display:flex;align-items:center;gap:8px"><div class="h-headline" style="flex:1">Votre liquide&nbsp;?</div>{listen()}</div>
  <div class="t-body muted">Touchez vos billets.</div>
  {counter(12500, [(10000, 1), (5000, 0), (2000, 1), (1000, 0)], [(500, 1), (100, 0), (50, 0), (25, 0)])}
""", "gap:12px;padding-top:12px"), 12,
    footer=f'<div class="btn primary">Valider {f(12500)}</div><div class="btn ghost">Plus tard</div>',
    notes=["Tap a note = +1. The visible − on a note removes one (round 4 relied on long-press, which nobody discovers).",
           "Many notes of one kind: hold to repeat, or tap the ×count to type it (43 notes of 1 000 F shouldn't take 43 taps).",
           "Neutral notes with big numbers and true relative sizes, not copies of BEAC artwork. UNVERIFIED: current notes vs coins."])

# ================================================================ Moi (home)
s5 = frame("5", "Moi · evening", scroll(
    home_head() + chips() + soir_card(), "gap:14px;padding-top:12px"), 20, tab="home",
    notes=["Headline = what left your pockets today (9 700 F: the 1 500 F bakery + 8 200 F that left Orange without SMS). True every day, from day one. Cash joins it after tonight's count.",
           "Round 4's \"Ça tient jusqu'au 24\" is gone: a forecast with irregular income outruns the evidence. Offer it later, opt-in, only when a regular income SMS is detected.",
           "Pocket amounts hidden by default; the eye shows them. Tapping a pocket opens its movements. <b>Replaces the onboarding question (1c): confirm.</b>",
           "\"Mouvements\" is a visible row: the ledger is one tap away, never behind a gesture."])

s5b = frame("5b", "Moi · daytime, njangi due", scroll(
    home_head() + f"""
  <div class="card pad">
    <div style="display:flex;align-items:center;gap:12px"><span class="avatar sq lg">NB</span><div style="flex:1"><div class="t-title">Njangi Bureau</div><div class="t-small muted" style="display:flex;align-items:center;gap:6px">jeudi · <span class="benef"></span> Alice reçoit</div></div></div>
    <div class="btn primary" style="margin-top:12px">Cotiser {f(10000)}</div>
  </div>""" + chips(), "gap:14px;padding-top:12px"), 20, tab="home",
    notes=["The next commitment leads by day. \"Cotiser\" opens the existing pay flow (handshake: \"envoyé\" until Marie confirms).",
           "One filled button per screen, always."])

s5c = frame("5c", "Moi · first week", scroll(f"""
  <div class="home-top"><div style="flex:1"><div class="t-label muted">J'apprends encore</div>
    <div class="learn"><i class="d"></i><i class="d"></i><i></i><i></i><i></i><i></i><i></i></div>
    <div class="t-small muted">Encore 5 jours</div></div>{listen()}<span class="avatar">LB</span></div>
""" + chips() + soir_card(2), "gap:14px;padding-top:12px"), 20, tab="home",
    notes=["The default for new users: no estimate, no claim. Seven dots fill with seven evenings.",
           "Two questions on a typical first night: the cash count and one unknown."])

s5d = frame("5d", "Moi · SMS refused or paused", scroll(
    home_head("0") + f"""
  <div class="banner warn">{p("sms")}<div><b>Lecture des SMS coupée.</b></div></div>""" + chips(),
    "gap:14px;padding-top:12px"), 20, tab="home", footer='<div class="btn primary">Activer la lecture</div>',
    notes=["Restored from round 3 (4c). Cash still works; the evening ritual becomes the cash card only."])

s5e = frame("5e", "Moi · a pocket gone quiet", scroll(
    home_head() + f"""
  <div class="card pad">
    <div style="display:flex;align-items:center;gap:12px">{op('mtn')}<div class="t-title" style="flex:1">MTN ··07 : aucun SMS depuis 9 jours</div></div>
    <div class="btn primary" style="margin-top:12px">Composer *126#</div>
  </div>""" + chips(stale=True), "gap:14px;padding-top:12px"), 20, tab="home",
    notes=["Restored from round 3 (4e). UNVERIFIED: whether *126# makes MTN send a fresh SMS. Phase 0 gate; fallback \"Coller le dernier SMS\"."])

# ================================================================ Le point du soir
s6 = frame("6", "Soir · 1 · count the cash", f"""
  {story_top(0)}
  <div class="story" style="gap:10px">
    <div class="h-headline" style="text-align:center">Votre liquide ce soir&nbsp;?</div>
    <div class="t-small muted" style="text-align:center">Normalement {f(43000)}</div>
    {counter(34500, [(10000, 3), (5000, 0), (2000, 2), (1000, 0)], [(500, 1), (100, 0), (50, 0), (25, 0)])}
  </div>
""", 12, footer=f'<div class="btn primary">Valider {f(34500)}</div><div class="btn ghost">Pas ce soir</div>',
    notes=["Normalement = last count (23 000 F) + cash-outs from SMS (20 000 F) − cash njangi payments already in the ledger.",
           "Each card is saved the moment it is answered; ✕ or \"Pas ce soir\" loses nothing already given."])

s7 = frame("7", "Soir · 2 · where the cash went", f"""
  {story_top(1)}
  <div class="story">
    <div class="story-money">{mark("cash")}<span>{f(8500)}</span></div>
    <div class="h-headline" style="text-align:center">Surtout pour&nbsp;?</div>
    <div class="tiles">
      {tile('transport', 'Transport')}{tile('ration', 'Ration')}{tile('credit', 'Crédit')}
      {tile('famille', 'Famille')}{tile('eglise', 'Église')}{tile('plusieurs', 'Plusieurs')}
    </div>
  </div>
""", 12, footer=f'<div class="btn ghost">{p("mic")}Le dire</div>',
    notes=["One main bag for the whole cash amount; \"Plusieurs\" or \"Le dire\" to split. No Njangi tile: cash njangi payments are already in the ledger.",
           "Nothing pre-selected: a tap answers and moves on."])

s8 = frame("8", "Soir · 3 · something it couldn't guess", f"""
  {story_top(2)}
  <div class="story">
    <div class="story-money">{op('mtn')}<span>{f(15000)}</span></div>
    <div class="t-body muted" style="text-align:center">reçu de Maman · 11:20</div>
    <div class="tiles">
      {tile('famille', 'Famille')}{tile('salaire', 'Salaire')}{tile('vente', 'Vente')}
      {tile('njangi', 'Njangi')}{tile('cadeau', 'Cadeau')}{tile('autre', 'Autre')}
    </div>
  </div>
""", 12, footer=f'<div class="btn ghost">{p("mic")}Le dire</div>',
    notes=["Cards appear only for what the app can't guess. Tonight the bakery was guessed (Ration) and filed silently; it shows up in the summary (10)."])

s9 = frame("9", "Soir · 4 · money left without an SMS", f"""
  {story_top(3)}
  <div class="story">
    <div class="story-money">{op('om')}<span>{f(8200)}</span></div>
    <div class="h-headline" style="text-align:center">Parti sans SMS. C'était&nbsp;?</div>
    <div class="tiles">
      {tile('achat', 'Achat')}{tile('retrait', 'Retrait')}{tile('envoi', 'Envoi')}
      {tile('inconnu', 'Je sais pas')}
    </div>
  </div>
""", 12, notes=["The balance-chain gap. \"Je sais pas\" is a full answer: the money is filed as unknown so totals stay true."])

s10 = frame("10", "Soir · end · \"C'est juste ?\"", scroll(f"""
  <div style="display:flex;align-items:center"><div class="h-headline" style="flex:1">C'est juste&nbsp;?</div>{listen()}</div>
  <div class="card" style="overflow:hidden">
    <div class="row">{mark('ration')}<div class="main"><b>Boulangerie Saker</b><span>{p("auto", "sm")} Ration</span></div><div class="end"><span class="money-md">{f(1500)}</span></div></div>
    <div class="row">{mark('transport')}<div class="main"><b>Liquide</b><span>Transport</span></div><div class="end"><span class="money-md">{f(8500)}</span></div></div>
    <div class="row">{mark('inconnu')}<div class="main"><b>Orange sans SMS</b><span>inconnu</span></div><div class="end"><span class="money-md">{f(8200)}</span></div></div>
  </div>
  <div class="sum"><span>Sorti aujourd'hui</span><b>{f(18200)}</b></div>
  <div class="card" style="overflow:hidden">
    <div class="row">{mark('famille')}<div class="main"><b>Maman</b><span>Famille</span></div><div class="end"><span class="money-md">{f(15000)}</span><span class="dir">{i("money-in", "sm")}reçu</span></div></div>
  </div>
""", "gap:12px;padding-top:12px"), 20, footer="<div class=\"btn primary\">Oui, c'est juste</div>",
    notes=["Fable's braver idea: the app shows what it filed and the person corrects. ✨ marks a guess; tap any row to fix it.",
           "The arithmetic reconciles: 1 500 + 8 500 + 8 200 = 18 200 F out; 15 000 F in. Home said 9 700 F before the cash count.",
           "No streak, no confetti: a missed evening must never read as failure. The reward is seeing the day."])

# ================================================================ Voice (inside the ritual)
s11 = frame("11", "Le dire: hold to speak", f"""
  {story_top(1)}
  <div class="story" data-nowc>
    <div class="story-money">{mark("cash")}<span>{f(8500)}</span></div>
    <div class="h-headline" style="text-align:center">Surtout pour&nbsp;?</div>
  </div>
""", 12, overlay=f"""<div class="scrim"></div><div class="sheet voice">
      <div class="grab"></div>
      <div class="pulse">{p("mic", "xl")}</div>
      <div class="h-title-lg" style="text-align:center">« Moto trois mille, marché cinq mille cinq cents »</div>
      <div class="t-small muted" style="text-align:center">Relâchez pour finir</div>
    </div>""",
    notes=["Voice lives inside the ritual and \"Corriger\", not as a floating button that competes with the one primary action.",
           "Phase 1: the phone's own speech recognizer, French and English. No audio leaves the phone. Pidgin later, if a model handles it."])

s12 = frame("12", "Le dire: confirm what was heard", f"""
  {story_top(1)}
  <div class="story">
    <div class="h-headline" style="text-align:center">J'ai compris&nbsp;:</div>
    <div class="card" style="overflow:hidden">
      <div class="row">{mark('transport')}<div class="main"><b>Moto</b></div><span class="money-md">{f(3000)}</span></div>
      <div class="row">{mark('ration')}<div class="main"><b>Marché</b></div><span class="money-md">{f(5500)}</span></div>
    </div>
    <div class="sum"><span>Total</span><b>{f(8500)} {p("check", "ok")}</b></div>
  </div>
""", 12, footer=f'<div class="btn primary">C\'est bon</div><div class="btn secondary">Corriger</div>',
    notes=["The split must add up to the counted cash (8 500 F); if it doesn't, the difference goes to a line \"reste\" the person can see."])

# ================================================================ Ledger
s13 = frame("13", "A pocket's movements", f'<div class="nav-h"><span class="icon-btn">{i("back")}</span><div class="t">Orange ··41</div>{listen()}</div>' + scroll(f"""
  <div class="pocket-head">{op('om')}<div><div class="money-lg">{f(98200)}</div><div class="t-small muted">chez Orange · SMS 14:02</div></div></div>
  <div class="day">Aujourd'hui</div>
  <div class="card" style="overflow:hidden">
    <div class="row">{mark('ration')}<div class="main"><b>Boulangerie Saker</b><span>14:02</span></div><div class="end"><span class="money-md">{f(1500)}</span><span class="dir">{i("money-out", "sm")}payé</span></div></div>
    <div class="row">{mark('inconnu')}<div class="main"><b>Sans SMS</b><span>avant 14:02</span></div><div class="end"><span class="money-md">{f(8200)}</span><span class="dir">inconnu</span></div></div>
    <div class="row">{mark('retrait')}<div class="main"><b>Retrait</b><span>09:05</span></div><div class="end"><span class="money-md">{f(20000)}</span><span class="dir">déplacé</span></div></div>
  </div>
""", "gap:10px;padding-top:4px"), 20,
    notes=["Opened by tapping a pocket on Moi (and the \"Mouvements\" row for all pockets). Who, how much, when, direction as a word on every line.",
           "Tap a line to fix it (category, \"Pas à moi\", \"D'une poche à l'autre\"): round 3's detail screen 5b survives unchanged."])

# ================================================================ Learned budget (a ritual card on the 1st)
s14 = frame("14", "1st of the month · a budget proposed", f"""
  {story_top(0, 2)}
  <div class="story">
    <div style="text-align:center">{p("ration", "huge")}</div>
    <div class="h-headline" style="text-align:center">Ration&nbsp;: {f(52000)} en septembre.</div>
    <div class="h-title-lg" style="text-align:center">Garder {f(50000)} pour octobre&nbsp;?</div>
  </div>
""", 12, footer='<div class="btn primary">Oui</div><div class="btn secondary">Autre montant</div>',
    notes=["Budgets are never set up from zero. On the 1st, the evening ritual proposes one or two, from last month. One yes each.",
           "No bags row on Moi in Phase 1: unlabelled pictures in rings were ambiguous. A bag shows in the summary once it has a limit."])

# ================================================================ Safety
s15 = frame("15", "A credit that doesn't add up", f'<div class="nav-h"><span class="icon-btn">{i("back")}</span><div class="t"></div>{listen()}</div>' + scroll(f"""
  <div style="display:flex;gap:12px;align-items:center"><span class="avatar">PM</span><div class="h-title-lg">Reçu de Paul Mbi&nbsp;?</div></div>
  <div style="display:flex;align-items:center;gap:10px"><span class="money-hero">{f(50000)}</span><span class="badge b-disputed">{i('disputed')}à vérifier</span></div>
  <div class="t-body">Ne donnez rien pour l'instant.</div>
""", "gap:14px"), 12, footer='<div class="btn primary">Composer #150#</div>',
    notes=["An SMS that looks like Orange but doesn't fit the previous one. Never counted until checked. No \"c'est un vrai\" next to the warning."])

s15b = frame("15b", "Back from #150#", scroll(f"""
  <div style="display:flex;justify-content:flex-end">{listen()}</div>
  <div class="h-display" style="text-align:center;margin-top:40px">L'argent est là&nbsp;?</div>
  <div class="t-body muted" style="text-align:center">{f(50000)} de Paul Mbi</div>
""", "gap:14px;padding-top:10px"), 12,
    footer='<div class="btn primary">Oui, il est là</div><div class="btn secondary">Non, rien</div>',
    notes=["Restored from round 3 (8c): the way back for a cousin's real transfer. \"Non\" opens the alarm (15c)."])

s15c = frame("15c", "Fake SMS", scroll(f"""
  <div style="display:flex;justify-content:flex-end">{listen()}</div>
  <div class="alarm">{p("alerte", "huge")}<div class="h-display">Faux SMS&nbsp;!</div><div class="h-title-lg">Ne renvoyez rien.</div></div>
  <div class="card pad t-small" style="background:var(--surface)" data-nowc>«&nbsp;Vous avez reçu {f(50000)}…&nbsp;»<br><span class="muted">+237&nbsp;6••&nbsp;••&nbsp;41&nbsp;21</span></div>
""", "gap:18px;padding-top:10px"), 12, cls="danger-frame",
    footer='<div class="btn primary">Prévenir la famille</div><div class="btn ghost">Fermer</div>',
    notes=["Reached from \"Non, rien\" or from an SMS the person shares in to check. Speaks itself when opened. Red is a state."])

# ================================================================ Privacy (Moi › avatar)
def sw(on: bool) -> str:
    return f'<span class="sw{" on" if on else ""}" role="switch" aria-checked="{str(on).lower()}"></span>'


s16 = frame("16", "Vos données (avatar on Moi)", f'<div class="nav-h"><span class="icon-btn">{i("back")}</span><div class="t">Vos données</div>{listen()}</div>' + scroll(f"""
  <div class="card" style="overflow:hidden">
    <div class="row">{mark('sms')}<div class="main"><b>Lire les SMS d'argent</b><span>dernier : 14:02</span></div>{sw(True)}</div>
    <div class="row">{mark('check')}<div class="main"><b>SMS lus de</b><span>Orange, MTN</span></div><span class="chev">{i("chevron")}</span></div>
  </div>
  <div class="card" style="overflow:hidden">
    <div class="row">{mark('eye-off')}<div class="main"><b>Montants cachés</b></div>{sw(True)}</div>
    <div class="row">{mark('lock')}<div class="main"><b>Verrou de l'app</b></div>{sw(False)}</div>
  </div>
  <div class="card" style="overflow:hidden">
    <div class="row"><span class="op neutral">{i("download")}</span><div class="main"><b>Exporter</b></div><span class="chev">{i("chevron")}</span></div>
    <div class="row"><span class="op neutral" style="color:var(--destructive-dark)">{i("trash")}</span><div class="main"><b style="color:var(--destructive-dark)">Tout supprimer</b></div></div>
  </div>
""", "gap:14px"), 25,
    notes=["Restored from round 3 (9a): stop reading, see senders, export, delete. Law 2024/017 rights one tap from the avatar on Moi.",
           "Notifications never contain amounts (fixed, not a setting)."])

s17 = frame("17", "Delete everything", f'<div class="nav-h"><span class="icon-btn">{i("back")}</span><div class="t">Vos données</div><span style="width:24px"></span></div>' + scroll("", ""), 20,
    overlay=f"""<div class="scrim"></div><div class="sheet"><div class="grab"></div>
      <div class="h-title-lg">Tout supprimer&nbsp;?</div>
      <div class="t-body muted">Vos mouvements et poches. Njangis et dettes partagées restent.</div>
      <div class="btn danger">Tout supprimer</div><div class="btn ghost">Annuler</div></div>""",
    notes=["Restored from round 3 (9b). Shared records keep the other side's copy."])

# ================================================================ Nous
s18 = frame("18", "Nous · groups", scroll(f"""
  <div style="display:flex;align-items:center"><div class="h-headline" style="flex:1">Nous</div>{listen()}</div>
  <div class="card" style="overflow:hidden">
    <div class="row big"><span class="avatar sq lg">NB</span><div class="main"><b>Njangi Bureau</b><span>jeudi · <span class="benef"></span> Alice reçoit</span></div><span class="money-md">{f(10000)}</span></div>
    <div class="row big"><span class="avatar sq lg">NF</span><div class="main"><b>Njangi Famille</b><span>samedi</span></div><span class="badge b-confirmed">{i('confirmed')}reçu</span></div>
  </div>
""", "gap:14px;padding-top:12px"), 20, tab="group", footer='<div class="btn secondary">Créer ou rejoindre</div>',
    notes=["The njangi ledger and handshake, unchanged underneath. \"Moi\" and \"Nous\": my money, our money.",
           "Contribution groups stay frozen per the September pilot review, so none are shown."])

# ================================================================ Later
s19 = frame("19", "Papier · a debt (Phase 2)", scroll(f"""
  <div style="display:flex;align-items:center"><div class="h-headline" style="flex:1">Papier</div>{listen()}</div>
  <div class="paper">
    <div class="t-small muted">8 octobre</div>
    <div class="h-title-lg">Brice doit {f(10000)} à Linus.</div>
    <div class="sign"><span>Linus {p("check")}</span><span class="wait">Brice …</span></div>
  </div>
""", "gap:16px;padding-top:12px"), 12, footer=f'<div class="btn primary">{i("share")}Envoyer à Brice</div>',
    notes=["Phase 2. Brice signs by link without the app, which reopens the frozen web-link decision."])

s20 = frame("20", "iPhone · the ritual starts with a paste", f"""
  {story_top(0)}
  <div class="story">
    <div class="paste-art">{op('om')}{op('mtn')}</div>
    <div class="h-headline" style="text-align:center">Copiez vos SMS d'argent du jour.</div>
  </div>
""", 12, footer=f'<div class="btn primary big">{i("paste")}Coller</div><div class="btn ghost">Pas de SMS aujourd\'hui</div>',
    notes=["iOS can't read SMS. UNVERIFIED: whether Messages copies several SMS at once; if not, \"Coller encore\" repeats until \"C'est tout\"."])

FRAMES = [
    ("open", "First open: 4 screens + Android's dialog", "Language, consent shown with a picture, what it found, your cash. A question only if a third number appears.", [s1, s2, s2b, s3, s3b, s4]),
    ("home", "Moi: today, then one thing to do", "What left your pockets today, then the one next thing. Amounts hidden until the eye. The ledger one tap away.", [s5, s5b, s5c, s5d, s5e]),
    ("soir", "Le point du soir: ask little, show the day", "Cash count, then only what the app couldn't guess, then the whole day to confirm.", [s6, s7, s8, s9, s10]),
    ("voice", "Le dire", "Voice inside the ritual, on the phone, French and English.", [s11, s12]),
    ("ledger", "Mouvements, one tap away", "The trust artifact stays visible.", [s13]),
    ("bags", "Budgets proposed on the 1st", "Learned from last month, one yes.", [s14]),
    ("safety", "When something is wrong", "Check, ask, then alarm.", [s15, s15b, s15c]),
    ("privacy", "Vos données", "Law 2024/017 rights, one tap from Moi.", [s16, s17]),
    ("nous", "Nous: groups", "The njangi ledger, unchanged underneath.", [s18]),
    ("later", "Later and iPhone", "Debts as a signed paper; the iPhone ritual.", [s19, s20]),
]

COMPARE = """
<table class="spec-table cmp">
  <tr><th></th><th>Round 3 (approved)</th><th>Simple</th></tr>
  <tr><td>Tabs</td><td>4 · Accueil, Mouvements, Groupes, Moi</td><td><b>2 · Moi, Nous</b></td></tr>
  <tr><td>First open</td><td>7 screens, 6 decisions</td><td><b>4 screens, 2 decisions</b> (+ Android's dialog)</td></tr>
  <tr><td>Classify a spend</td><td>4–5 taps: feed → detail → change → pick → save</td><td><b>0 taps</b> when guessed (shown in the summary), 1 otherwise</td></tr>
  <tr><td>Count cash</td><td>Keypad, then amounts per category (~15 taps)</td><td><b>Tap banknotes</b>, one main bag (~7 taps)</td></tr>
  <tr><td>Evening</td><td>Browse the feed, fix gaps from a banner</td><td><b>2–4 cards + "C'est juste ?"</b></td></tr>
  <tr><td>Budgets</td><td>Phase 2 envelopes to set up</td><td><b>Proposed on the 1st</b>, one yes</td></tr>
  <tr><td>Main number</td><td>Pocket amounts</td><td><b>Today's spending</b>; pockets hidden until the eye</td></tr>
  <tr><td>Words per screen</td><td>≤ 25</td><td><b>≤ 12</b> on cards (≤ 20 home and lists, ≤ 25 consent and settings)</td></tr>
  <tr><td>Help</td><td>none on screen</td><td><b>🔊 on every screen</b>, same place</td></tr>
  <tr><td>Kept as is</td><td colspan="2">Consent accuracy, Android dialog, refused and stale states, privacy screen, handshake colours, balance-chain gaps, scam check-then-alarm, "Pas à moi", no total, 16 px floor</td></tr>
</table>"""

PRINCIPLES = """
<ol class="principles">
  <li><b>Ask little, show the day.</b> The app files what it can guess and asks only the rest. Each evening ends with "C'est juste ?".</li>
  <li><b>Numbers and pictures, words last.</b> One-colour pictograms (a custom set to draw), banknotes, counts with their unit.</li>
  <li><b>Every screen can speak.</b> The same 🔊 in the same place; voice answers inside the ritual.</li>
  <li><b>Flat beats deep.</b> Two places, Moi and Nous, and one evening ritual.</li>
  <li><b>Say only what is true today.</b> Today's spending, not a forecast. "J'apprends encore" until there's evidence.</li>
  <li><b>Private by default, never hidden by gesture.</b> Amounts behind a visible eye; the ledger behind a visible row.</li>
  <li><b>Approximate and daily beats exact and abandoned.</b> One bag for tonight's cash is enough.</li>
</ol>"""

FLOW_SVG = """
<svg viewBox="0 0 1000 170" class="flow" role="img" aria-label="Evening loop: notification, cash card, unknown cards, summary, home">
  <defs><marker id="fa" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="#555"/></marker></defs>
  <g font-family="system-ui" font-size="14">
    <rect x="10" y="50" width="150" height="64" rx="12" fill="#fff" stroke="#ccc"/><text x="85" y="78" text-anchor="middle" font-weight="650">20:30</text><text x="85" y="98" text-anchor="middle" fill="#555">"Le point du soir"</text>
    <rect x="210" y="30" width="520" height="104" rx="14" fill="#F5F5F5" stroke="#ccc"/>
    <text x="470" y="52" text-anchor="middle" fill="#555">2–4 cards, then the day</text>
    <rect x="228" y="64" width="110" height="56" rx="10" fill="#fff" stroke="#bbb"/><text x="283" y="90" text-anchor="middle">billets</text><text x="283" y="108" text-anchor="middle" fill="#555" font-size="12">cash, always</text>
    <rect x="352" y="64" width="110" height="56" rx="10" fill="#fff" stroke="#bbb"/><text x="407" y="90" text-anchor="middle">pour quoi ?</text><text x="407" y="108" text-anchor="middle" fill="#555" font-size="12">unguessed only</text>
    <rect x="476" y="64" width="110" height="56" rx="10" fill="#fff" stroke="#bbb"/><text x="531" y="90" text-anchor="middle">sans SMS ?</text><text x="531" y="108" text-anchor="middle" fill="#555" font-size="12">gaps</text>
    <rect x="600" y="64" width="110" height="56" rx="10" fill="#fff" stroke="#bbb"/><text x="655" y="90" text-anchor="middle">C'est juste ?</text><text x="655" y="108" text-anchor="middle" fill="#555" font-size="12">tap to fix</text>
    <rect x="780" y="50" width="210" height="64" rx="12" fill="#171717"/><text x="885" y="78" text-anchor="middle" fill="#fff" font-weight="650">Moi</text><text x="885" y="98" text-anchor="middle" fill="#ccc">"Aujourd'hui · 18 200 F sortis"</text>
    <path d="M160 82 L208 82" stroke="#555" stroke-width="1.5" marker-end="url(#fa)"/>
    <path d="M730 82 L778 82" stroke="#555" stroke-width="1.5" marker-end="url(#fa)"/>
  </g>
</svg>"""

DECISIONS = """
<div class="spec-card" style="margin-top:20px"><h4>Decisions this direction needs from you</h4><ol>
  <li><b>Adopt Simple as the Phase 1 direction</b> (Fable recommends it), with round 3 kept as the source of the trust screens.</li>
  <li><b>Pocket amounts hidden by default</b>, shown with the eye. This replaces the onboarding question you chose on 7 October.</li>
  <li><b>Account timing</b>: Clerk username + password at first open (today), or created later, silently, when a njangi needs an identity.</li>
  <li><b>Pictograms</b>: commission one 20-icon, one-colour set (Material Symbols stand in here). Emoji only in Phase 0 paper tests.</li>
</ol>
<p style="margin:10px 0 0">Test in Phase 0 interviews, not by opinion: the "today's spending" headline vs a "ça tient jusqu'au" date; banknotes vs keypad; which pictures people name correctly; whether Android's "envoyer" wording scares people.</p></div>"""

nav_links = "".join(f'<a href="#{sid}">{title}</a>' for sid, title, _, _ in FRAMES)
sections = "".join(f"""
  <section class="section" id="{sid}"><h3>{title}</h3><p class="rule">{rule}</p><div class="shots">{''.join(fr)}</div></section>"""
    for sid, title, rule, fr in FRAMES)

HTML = f"""<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Personal finance: Simple (round 4, revised)</title>
<link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,400,0,0&display=block" rel="stylesheet">
<link rel="stylesheet" href="kit/kit.css?v={V}">
<link rel="stylesheet" href="extra.css?v={V}">
<link rel="stylesheet" href="simple.css?v={V}">
<script src="kit/sf-symbols.js?v={V}"></script>
<script src="kit/sf-extra.js?v={V}"></script>
<script src="kit/kit.js?v={V}"></script>
<script src="extra.js?v={V}"></script>
<script src="simple.js?v={V}"></script>
</head>
<body>
<div class="doc">
  <nav class="doc-nav">
    <h1>Simple · round 4</h1>
    <div class="sub">Revised after Fable · 360 dp · 2026-10-08</div>
    <a href="index.html">Round 3 (trust screens)</a>
    <a href="../../personal-finance-ui-review-2026-10-07.md">Review log</a>
    <div class="group">This page</div>
    <a href="#why">Why and what changed</a>
    {nav_links}
  </nav>
  <main class="doc-main">
    <header id="why">
      <h2>Simple: the app asks little and shows the day</h2>
      <p class="lede">Round 3 was correct but it was a banking app: tabs, a feed, forms, settings. Simple keeps every trust rule and replaces the interface with what people already handle: banknotes, pictures, voice, and one short evening ritual where the app does the filing and the person says "c'est juste".</p>
      <p class="lede" style="font-size:14px">Grounding: in Microsoft Research studies with low-literacy users in India, Kenya, the Philippines and South Africa, text interfaces were unusable for first-time users, graphical interfaces had the best completion for mobile banking, and spoken dialog was fastest for those comfortable with it (<a href="https://www.microsoft.com/en-us/research/wp-content/uploads/2016/02/ToCHI2711_Medhi.pdf">Medhi et al., ToCHI</a>). Voice feedback and a consistent help feature mattered (<a href="https://www.microsoft.com/en-us/research/?p=160568">Medhi 2007</a>), and menu hierarchies stayed hard even without text (<a href="https://www.microsoft.com/en-us/research/?p=287">CHI 2013</a>).</p>
      <div class="cols" style="margin-top:20px"><div>{PRINCIPLES}{DECISIONS}</div><div>{COMPARE}</div></div>
      <div style="margin-top:24px">{FLOW_SVG}</div>
    </header>
    {sections}
  </main>
</div>
</body>
</html>
"""

out = Path(__file__).with_name("simple.html")
out.write_text(HTML, encoding="utf-8")
print(f"wrote {out} ({len(HTML):,} bytes)")
