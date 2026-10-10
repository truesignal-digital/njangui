"""Generates index.html: personal-finance mockups, round 2, in the neutral kit.

Run: python3 docs/prototypes/personal-finance-2026-10/build.py
Kit files in kit/ are copied from the docs/mobile-ui-guide worktree (uncommitted there on 2026-10-07).
"""
from pathlib import Path

NB = " "  # narrow no-break space, as formatCurrencyXAF renders thousands


def f(amount: int, hidden: bool = False) -> str:
    if hidden:
        return "••••&nbsp;F"
    return f"{amount:,}".replace(",", NB) + "&nbsp;F"


def i(name: str, cls: str = "") -> str:
    return f'<i data-i="{name}" data-c="{cls}"></i>'


def op(kind: str) -> str:
    label = {"om": "OM", "mtn": "MTN"}[kind]
    return f'<span class="op {kind}" aria-hidden="true">{label}</span>'


def mark(icon: str) -> str:
    return f'<span class="op neutral">{i(icon)}</span>'


def avatar(initials: str, cls: str = "") -> str:
    return f'<span class="avatar {cls}">{initials}</span>'


def row(lead: str, title: str, sub: str = "", end: str = "", cls: str = "") -> str:
    sub_html = f"<span>{sub}</span>" if sub else ""
    return f'<div class="row {cls}">{lead}<div class="main"><b>{title}</b>{sub_html}</div>{end}</div>'


def amt(value: str, word: str = "", icon: str = "") -> str:
    w = f'<span class="dir">{i(icon, "sm") if icon else ""}{word}</span>' if word else ""
    return f'<div class="end"><span class="money-md">{value}</span>{w}</div>'


def switch(on: bool) -> str:
    return f'<span class="sw{" on" if on else ""}" role="switch" aria-checked="{str(on).lower()}"></span>'


def select(title: str, sub: str = "", on: bool = False, lead: str = "") -> str:
    sub_html = f'<div class="t-small muted">{sub}</div>' if sub else ""
    return (f'<div class="select{" on" if on else ""}">{lead}<div style="flex:1;min-width:0">'
            f'<div class="t-title" style="font-size:16px">{title}</div>{sub_html}</div><span class="radio"></span></div>')


def frame(fid: str, label: str, body: str, budget: int, tab: str | None = None, footer: str = "",
          overlay: str = "", notes: list[str] | None = None, cls: str = "") -> str:
    tabbar = f'<div data-tabbar="{tab}"></div>' if tab else ""
    foot = f'<div class="footer">{footer}</div>' if footer else ""
    note_html = "".join(f"<li>{n}</li>" for n in (notes or []))
    return f"""
    <figure class="shot" id="f{fid}">
      <div class="frame-label">{fid} · {label}</div>
      <div class="frame {cls}" data-budget="{budget}">
        <div data-statusbar></div>
        {body}
        {foot}
        {tabbar}
        {overlay}
      </div>
      <div class="wc" data-wc-for="f{fid}"></div>
      {f'<ul class="notes">{note_html}</ul>' if note_html else ''}
    </figure>"""


def scroll(inner: str, style: str = "") -> str:
    return f'<div class="scroll" style="{style}">{inner}</div>'


def nav(title: str = "", left: str = "back", right: str = "") -> str:
    l = f'<span class="icon-btn" aria-label="Retour">{i(left)}</span>' if left else '<span style="width:24px"></span>'
    r = f'<span class="icon-btn">{i(right)}</span>' if right else '<span style="width:24px"></span>'
    return f'<div class="nav-h">{l}<div class="t">{title}</div>{r}</div>'


def section(title: str, rows: list[str], right: str = "") -> str:
    return (f'<div class="section-h">{title}{right}</div>'
            f'<div class="card" style="overflow:hidden">{"".join(rows)}</div>')


# ---------------------------------------------------------------- 1 · Consent
f1a = frame("1a", "SMS disclosure (before the system prompt)", scroll(f"""
  <div class="steps"><div class="done"></div><div class="done"></div><div></div><div></div></div>
  <div class="h-headline">Remplir vos poches avec vos SMS&nbsp;?</div>
  <div class="card" style="overflow:hidden">
    {row(op('om'), 'Orange Money', end='<span class="dir strong">lu</span>')}
    {row(op('mtn'), 'MTN MoMo', end='<span class="dir strong">lu</span>')}
    {row(mark('chat'), 'Autres SMS', end='<span class="dir strong">jamais</span>')}
  </div>
  <div class="banner info">{i('shield')}<div><b>Montants, noms, dates gardés. Jamais le texte.</b></div></div>
""", "padding-top:18px;gap:16px"), 25,
    footer='<div class="btn primary">Autoriser</div><div class="btn ghost">Plus tard</div>',
    notes=["Google Play prominent disclosure and Law 2024/017 consent: purpose (title), what is read (Orange, MTN), what is never read, what is kept (amount, name, date) and what is not (the SMS text).",
           "Round 2 said \"jamais envoyé\", which was false: structured fields go to Convex. Accuracy beats reassurance here.",
           "Banks dropped from Phase 1: list only senders the parser actually handles. Full field list (fee, reference, balance after; numbers hashed) is on 9a."])

f1b = frame("1b", "Android system prompt", scroll(f"""
  <div class="steps"><div class="done"></div><div class="done"></div><div></div><div></div></div>
  <div class="h-headline">Remplir vos poches avec vos SMS&nbsp;?</div>
""", "padding-top:18px"), 25, overlay=f"""
  <div class="scrim"></div>
  <div class="sysdlg" data-nowc>
    <div style="text-align:center">{i('sms', 'lg')}</div>
    <div class="t">Autoriser OnCotise à envoyer et afficher des SMS&nbsp;?</div>
    <div class="b"><span>Autoriser</span><span>Ne pas autoriser</span></div>
  </div>""",
    notes=["System text, not ours, so it is left out of the word count. Wording approximate; check on a real Android 14/15 device.",
           "If refused: Accueil in the \"SMS coupés\" state (4c). Never ask again on the same session.", "Android says the app could <em>send</em> SMS. Round 2 pre-empted that with \"jamais envoyé\", which was inaccurate; 1a no longer has room for it. Test in Phase 0 interviews whether the system wording scares people off."])

f1c = frame("1c", "Hide amounts? (decided: ask at onboarding)", scroll(f"""
  <div class="steps"><div class="done"></div><div class="done"></div><div class="done"></div><div></div></div>
  <div class="h-headline">Cacher les montants&nbsp;?</div>
  <div class="t-body muted">Utile dans le taxi ou au marché.</div>
  {select('Cacher à l\'ouverture', f'Vous voyez {f(0, True)}', True, f'<span class="op neutral">{i("eye-off")}</span>')}
  {select('Toujours montrer', f'Vous voyez {f(98200)}', False, f'<span class="op neutral">{i("eye")}</span>')}
  <div class="t-small muted" style="display:flex;gap:6px;align-items:center">{i('eye', 'sm')}L'œil en haut les montre.</div>
""", "padding-top:18px;gap:14px"), 25, footer='<div class="btn primary">Continuer</div>',
    notes=["Choice persists (one storage key in src/lib/storage-keys.ts). The eye toggle on Accueil and Mouvements flips it for the session.",
           "Notifications never contain amounts, whatever is chosen here."])

# ---------------------------------------------------------------- 2 · Numbers + start date
f2a = frame("2a", "Your numbers (dual SIM)", scroll(f"""
  <div class="steps"><div class="done"></div><div class="done"></div><div class="done"></div><div class="done"></div></div>
  <div class="h-headline">Vos numéros</div>
  <div class="t-body muted">Trouvés dans vos SMS.</div>
  <div class="card" style="overflow:hidden">
    {row(op('om'), 'Orange Money ··41', '214 SMS', switch(True))}
    {row(op('mtn'), 'MTN MoMo ··07', '96 SMS', switch(True))}
    {row(op('om'), 'Orange Money ··88', '12 SMS · coupé', switch(False), cls='off')}
  </div>
  <div class="banner warn">{i('sim')}<div>Un numéro de la famille&nbsp;? Coupez-le.</div></div>
""", "padding-top:18px;gap:14px"), 25, footer='<div class="btn primary">Continuer</div>',
    notes=["Dual-SIM phones receive SMS for both slots; Tecno/Infinix/itel ROMs report the slot unreliably, so the user confirms each number.",
           "A number switched off is never stored, not even as counts.", "\"Coupé\" is the state; \"pas à moi\" is the reason the user picks when switching it off (small sheet, not drawn)."])

f2b = frame("2b", "Since when? (second-hand phones)", scroll(f"""
  <div class="h-headline" style="margin-top:12px">Depuis quand&nbsp;?</div>
  {select('Depuis le premier SMS', '3 juillet', False)}
  {select('Depuis le 1er octobre', '', True)}
  {select('À partir d\'aujourd\'hui', '', False)}
  <div class="banner warn">{i('phone-lock')}<div>Téléphone d'occasion&nbsp;? Choisissez aujourd'hui.</div></div>
""", "padding-top:8px;gap:12px"), 25, footer='<div class="btn primary">Continuer</div>',
    notes=["Old SMS on a second-hand phone belong to the previous owner. The default is the 1st of the current month, not the oldest SMS."])

# ---------------------------------------------------------------- 3 · Backfill
f3a = frame("3a", "Reading SMS", scroll(f"""
  <div style="flex:1"></div>
  <div class="h-headline" style="text-align:center">Lecture de vos SMS</div>
  <div class="money-hero" style="text-align:center">31 / 52</div>
  <div class="progress"><i style="width:60%;background:var(--accent)"></i></div>
  <div class="t-body muted" style="text-align:center">Le texte reste sur ce téléphone.</div>
  <div style="flex:1"></div>
""", "gap:16px"), 25, footer='<div class="btn ghost">Continuer pendant la lecture</div>',
    notes=["52 = SMS since the chosen start date (2b) on the two numbers kept in 2a; older SMS are skipped.", "Parsing runs on the device. Only structured fields (amount, fee, party, reference, time, balance after) are sent to Convex."])

f3b = frame("3b", "First result", scroll(f"""
  <div class="h-headline" style="margin-top:12px">52 mouvements depuis le 1er&nbsp;octobre</div>
  <div class="card" style="overflow:hidden">
    {row(op('om'), 'Orange Money ··41', '31 mouvements', amt(f(98200)))}
    {row(op('mtn'), 'MTN MoMo ··07', '21 mouvements', amt(f(41250)))}
  </div>
  <div class="banner info">{i('tag')}<div><b>6 mouvements à classer</b>Le reste est déjà classé.</div></div>
""", "padding-top:8px;gap:14px"), 25,
    footer='<div class="btn primary">Voir mes poches</div><div class="btn secondary">Classer 6 mouvements</div>',
    notes=["Two buttons only here: onboarding exit is the primary, review is optional.",
           "Cash is not shown yet: the first cash check comes in the evening (7a)."])

# ---------------------------------------------------------------- 4 · Accueil states
def hero_cotiser() -> str:
    return f"""
  <div class="hero">
    <div class="t-label muted">Njangi Bureau · tour 4</div>
    <div class="money-lg" style="margin:6px 0 2px">{f(10000)}</div>
    <div class="t-small muted" style="margin-bottom:14px;display:flex;align-items:center;gap:6px">avant jeudi · <span class="benef"></span>Alice reçoit</div>
    <div class="btn hero-btn">Cotiser {f(10000)}</div>
  </div>"""


def pockets(hidden: bool = False, stale: bool = False, manual: bool = False) -> str:
    eye = f'<span class="icon-btn" aria-label="Montrer les montants">{i("eye-off" if hidden else "eye")}</span>'
    sms = '<span class="when">' + i('sms', 'sm') + '</span>'
    mtn_sub = '<span class="badge b-disputed">' + i('warning') + '9 j</span>' if stale else ('ajouté hier' if manual else sms + 'hier')
    om_sub = 'ajouté 14:02' if manual else sms + '14:02'
    return section("Chez Orange, MTN et vous", [
        row(op('om'), 'Orange Money', om_sub, amt(f(98200, hidden))),
        row(op('mtn'), 'MTN MoMo', mtn_sub, amt(f(41250, hidden))),
        row(mark('cash'), 'Liquide', 'à vérifier', amt(f(23000, hidden))),
    ], right=eye)


def engagements(hidden: bool = False) -> str:
    return f"""<div class="card" style="overflow:hidden">{row(
        '<span class="stack">' + avatar('NB', 'sq') + avatar('NF', 'sq') + '</span>',
        'Vos njangis', '', amt('', '') + '<span class="chev">' + i('chevron') + '</span>')}</div>"""


f4a = frame("4a", "Accueil · Android, SMS on", scroll(
    hero_cotiser() + pockets() + engagements(), "padding-top:14px;gap:12px"), 25, tab="home",
    notes=["No total. Each pocket says where the money is (\"Chez Orange, MTN et vous\") and when we last saw it.",
           "Hero = first attention action from convex/attention.ts (new kinds: cash_check, fill_gap, confirm_debt, check_sms). Only the hero has a filled button.",
           "\"Vos njangis\" opens 13a. It becomes \"Njangi et dettes\" (13b) when debts ship in Phase 2.",
           "Badge on Accueil replaces the Actions tab badge."])

f4b = frame("4b", "Accueil · iPhone (no SMS access)", scroll(f"""
  <div class="banner info">{i('paste')}<div><b>iPhone : collez vos SMS.</b></div></div>
  {pockets(manual=True)}
  {engagements()}
""", "padding-top:14px;gap:12px"), 25, tab="home", footer=f'<div class="btn primary">{i("paste")}Coller un SMS</div>',
    notes=["iOS has no SMS API. The share sheet (\"Partager\" on a message → OnCotise) and paste use the same parser as Android.",
           "Screenshot import of the Max It / MoMo history list comes in screen 10 (next round)."])

f4c = frame("4c", "Accueil · Android, SMS refused or paused", scroll(f"""
  <div class="banner warn">{i('pause')}<div><b>Lecture des SMS coupée.</b></div></div>
  {pockets()}
  {engagements()}
""", "padding-top:14px;gap:12px"), 25, tab="home", footer='<div class="btn primary">Activer la lecture</div>',
    notes=["Times stay visible so the user sees the data aging. Re-enabling reopens 1a, then the system prompt."])

f4d = frame("4d", "Accueil · first run, nothing yet", scroll(f"""
  <div class="empty" style="flex:1;justify-content:center">
    {i('cash')}
    <b>Rien pour l'instant</b>
    <div class="t-body">Commencez par le liquide dans votre poche.</div>
  </div>
""", "padding-top:14px"), 25, tab="home", footer='<div class="btn primary">Compter mon liquide</div>',
    notes=["Shown when SMS is refused and nothing was entered. The one action is the first cash count (7d), which works on every phone."])

f4e = frame("4e", "Accueil · stale pocket", scroll(
    f"""<div class="hero">
    <div class="t-label muted">MTN MoMo ··07</div>
    <div class="t-title" style="font-size:19px;line-height:24px;margin:6px 0 14px">Aucun SMS depuis 9 jours</div>
    <div class="btn hero-btn">Composer *126#</div>
  </div>""" + pockets(stale=True) + engagements(), "padding-top:14px;gap:12px"), 25, tab="home",
    notes=["Silence is a state, not a zero. 9 days is a placeholder threshold; tune it on real usage.",
           "*126# should make MTN send a fresh SMS, which restarts the chain. UNVERIFIED: check in Phase 0; if it only shows a USSD screen, the button becomes \"Ajouter le dernier SMS\".", "Hero button is inverted (white on black), never marigold: amber is reserved for states and the beneficiary."])

f4f = frame("4f", "Accueil · amounts hidden", scroll(
    hero_cotiser().replace(f(10000), f(0, True)) + pockets(hidden=True) + engagements(), "padding-top:14px;gap:12px"),
    25, tab="home", notes=["The eye toggles for this session. The hero hides its amount too, including the button label."])

# ---------------------------------------------------------------- 5 · Mouvements
f5a = frame("5a", "Mouvements · feed", scroll(f"""
  <div style="display:flex;align-items:center"><div class="h-headline" style="flex:1">Mouvements</div><span class="icon-btn">{i('filter')}</span></div>
  <div class="banner warn">{i('gap')}<div><b>{f(8200)} sans SMS</b>Orange, lundi soir</div></div>
  <div class="day">Aujourd'hui</div>
  <div class="card" style="overflow:hidden">
    {row(op('om'), 'Boulangerie Saker', 'Ration · 14:02', amt(f(1500), 'payé', 'money-out'))}
    {row(avatar('MA'), 'Maman', 'MoMo · 11:20', amt(f(15000), 'reçu', 'money-in'))}
    {row(mark('move'), 'Retrait', 'frais 204&nbsp;F', amt(f(20000), 'déplacé'))}
  </div>
  <div class="day">Hier</div>
  <div class="card" style="overflow:hidden">
    {row(avatar('MN'), 'Marie Ngo', 'Njangi Bureau · tour 3', '<div class="end"><span class="money-md">' + f(10000) + '</span><span class="badge b-claimed">' + i('claimed') + 'envoyé</span></div>')}
  </div>
""", "padding-top:14px;gap:10px"), 25, tab="feed", footer=f'<div class="btn primary">Compléter {f(8200)}</div>',
    notes=["Money line on every row: who, how much, when (day header + time), direction as a word with an arrow. No minus signs, no green for income.",
           "Withdrawals are moves between pockets, not spending; only the 204 F fee counts as spent.",
           "Njangi rows keep the handshake badge: \"envoyé\" (blue) until Marie confirms. Never green before the payee confirms.",
           "Names wrap to two lines instead of truncating. FlashList + paginated query, as the house rules require for unbounded tables."])

f5b = frame("5b", "Movement detail", nav("") + scroll(f"""
  <div style="display:flex;gap:12px;align-items:center">{op('om')}<div class="h-title-lg">Boulangerie Saker</div></div>
  <div style="display:flex;align-items:center;gap:10px"><span class="money-hero">{f(1500)}</span><span class="dir strong">{i('money-out', 'sm')}payé</span></div>
  <dl class="kv card pad">
    <dt>Poche</dt><dd>Orange Money ··41</dd>
    <dt>Date</dt><dd>mardi 7 octobre, 14:02</dd>
    <dt>Source</dt><dd>SMS Orange</dd>
    <dt>Catégorie</dt><dd>Ration</dd>
  </dl>
  <div class="card" style="overflow:hidden">
    {row(mark('split'), 'Diviser', end='<span class="chev">' + i('chevron') + '</span>')}
    {row(mark('move'), 'D\'une poche à l\'autre', end='<span class="chev">' + i('chevron') + '</span>')}
    {row(mark('cancelled'), 'Pas à moi', end='<span class="chev">' + i('chevron') + '</span>')}
  </div>
""", "gap:14px"), 25, footer='<div class="btn primary">Changer la catégorie</div>',
    notes=["\"Pas à moi\" (same words as 2a) covers a shared phone or a wrong number. It removes the movement and teaches the parser.",
           "Changing the category also updates the merchant directory for this merchant code (user corrections win)."])

# ---------------------------------------------------------------- 6 · Gap fill
f6a = frame("6a", "Fill a gap (sheet over the feed)", scroll(f"""
  <div class="h-headline">Mouvements</div>
""", "padding-top:14px"), 20, tab="feed", overlay=f"""
  <div class="scrim"></div>
  <div class="sheet">
    <div class="grab"></div>
    <div class="h-title-lg">{f(8200)} sans SMS</div>
    <div class="t-small muted" style="margin-top:-6px">Orange Money, lundi soir</div>
    {select('Un paiement', '', True, mark('money-out'))}
    {select('Un retrait', '', False, mark('cash'))}
    {select('Un envoi', '', False, mark('claimed'))}
    {select('Je ne sais pas', '', False, mark('gap'))}
    <div class="btn primary">Continuer</div>
  </div>""",
    notes=["The gap comes from the balance chain: the SMS before plus this movement doesn't match the next SMS.",
           "\"Je ne sais pas\" files it as unknown spending, so totals stay true; it never invents a payee."])

# ---------------------------------------------------------------- 7 · Cash check
keypad = '<div class="keypad">' + "".join(f"<span>{k}</span>" for k in "123456789") + \
    f'<span>000</span><span>0</span><span>{i("backspace")}</span></div>'

f7a = frame("7a", "Cash check · count", nav("Point liquide", "close") + scroll(f"""
  <dl class="kv card pad">
    <dt>Hier soir</dt><dd>{f(23000)}</dd>
    <dt>Retrait Orange</dt><dd>{f(20000)}</dd>
    <dt style="color:var(--text);font-weight:600">Normalement</dt><dd>{f(43000)}</dd>
  </dl>
  <div class="t-title">Combien avez-vous&nbsp;?</div>
  <div class="input filled focus" style="justify-content:center;font:700 26px/32px var(--font-body);font-variant-numeric:tabular-nums;min-height:60px">{f(34500)}</div>
  {keypad}
""", "gap:12px"), 25, footer='<div class="btn primary">Continuer</div><div class="btn ghost">Pas ce soir</div>',
    notes=["Opened from the evening attention card or the 20:30 notification \"Point liquide\" (no amount in the notification).",
           "Normalement = last count + cash-outs from SMS + cash received from njangi pots − cash already logged."])

f7b = frame("7b", "Cash check · what was it for", nav("Point liquide", "back") + scroll(f"""
  <div class="h-headline">{f(8500)} dépensés</div>
  <div class="card" style="overflow:hidden">
    {row(mark('next'), 'Transport', end=amt(f(3000)))}
    {row(mark('cash'), 'Ration', end=amt(f(5500)))}
    {row(mark('person'), 'Famille', end=amt('—'))}
    {row(mark('groups'), 'Njangi', end=amt('—'))}
    {row(mark('call'), 'Crédit', end=amt('—'))}
    {row(mark('more'), 'Autre', end=amt('—'))}
  </div>
  <div class="t-small muted" style="text-align:right">Reste {f(0)}</div>
""", "gap:12px"), 25, footer=f'<div class="btn primary">Enregistrer {f(8500)}</div>',
    notes=["Tap a line to type its amount. \"Reste\" must reach 0 F, or the remainder goes to \"Autre\" on save.",
           "Voice entry is Phase 2. No mic here."])

f7c = frame("7c", "Cash check · more cash than expected", nav("Point liquide", "back") + scroll(f"""
  <div class="h-headline">{f(5000)} de plus</div>
  <div class="t-body muted">Normalement {f(43000)}, compté {f(48000)}.</div>
  {select('J\'ai reçu du liquide', '', True, mark('money-in'))}
  {select('Je m\'étais trompé hier', '', False, mark('edit'))}
  <div class="field"><label>De qui&nbsp;?</label><div class="input filled">Papa</div></div>
""", "gap:12px"), 25, footer='<div class="btn primary">Continuer</div>',
    notes=["Cash income breaks \"spent = difference\", so it gets its own branch instead of a negative spend."])

# ---------------------------------------------------------------- 8 · Suspicious SMS
f8a = frame("8a", "Suspicious credit (operator sender, chain broken)", nav("") + scroll(f"""
  <div style="display:flex;gap:12px;align-items:center">{avatar('PM')}<div class="h-title-lg">Reçu de Paul Mbi&nbsp;?</div></div>
  <div style="display:flex;align-items:center;gap:10px"><span class="money-hero">{f(50000)}</span><span class="badge b-disputed">{i('warning')}à vérifier</span></div>
  <dl class="kv card pad">
    <dt>SMS</dt><dd>Orange Money, 15:10</dd>
    <dt>Avec le SMS de 14:02</dt><dd>ne colle pas</dd>
  </dl>
  <div class="t-body">Ne donnez rien avant de vérifier.</div>
""", "gap:14px"), 25,
    footer='<div class="btn primary">Composer #150#</div>',
    notes=["Decided scope: operator senders only. A spoofed \"OrangeMoney\" SMS is caught because the next real SMS doesn't include the 50 000 F.",
           "The SMS claims a new total; it doesn't equal the 14:02 total + 50 000 F, so it is flagged at once. The credit is never counted until the chain agrees.", "No \"C'est un vrai\" next to the warning: the victim believes the credit. The question comes after #150# (8c).",
           "#150# opens the dialer (Android); iOS shows the code to copy, same as the pay flow."])

f8b = frame("8b", "Check an SMS the user shared in", nav("Vérifier un SMS", "close") + scroll(f"""
  <div class="card pad t-small" style="background:var(--surface-muted)">«&nbsp;Vous avez reçu {f(50000)}…&nbsp;» <span class="muted" style="display:block;white-space:nowrap;margin-top:4px">+237&nbsp;6••&nbsp;••&nbsp;41&nbsp;21</span></div>
  <div class="banner bad">{i('warning')}<div><b>Faux SMS. Ne renvoyez rien.</b>Pas envoyé par Orange Money.</div></div>
  <dl class="kv card pad">
    <dt>Orange Money</dt><dd>rien depuis 14:02</dd>
  </dl>
""", "gap:14px"), 25,
    footer='<div class="btn primary">Prévenir la famille</div><div class="btn ghost">Fermer</div>',
    notes=["We never scan personal SMS. The user shares a suspicious message in (Android share sheet or paste); it is checked and discarded.",
           "\"Prévenir la famille\" opens the WhatsApp share sheet with a ready warning text. Nothing is sent by the app."])

# ---------------------------------------------------------------- 9 · Privacy
f9a = frame("9a", "Moi › Vos données", nav("Vos données") + scroll(f"""
  <div class="card" style="overflow:hidden">
    {row(mark('sms'), 'Lire les SMS d\'argent', 'dernier : 14:02', switch(True))}
    {row(mark('list'), 'SMS lus de', 'Orange, MTN', '<span class="chev">' + i('chevron') + '</span>')}
  </div>
  <div class="card" style="overflow:hidden">
    {row(mark('eye-off'), 'Cacher à l\'ouverture', '', switch(True))}
    {row(mark('locked'), 'Verrou de l\'app', '', switch(False))}
    {row(mark('notifications'), 'Notifications sans montant', '', '<span class="dir strong">toujours</span>')}
  </div>
  <div class="card" style="overflow:hidden">
    {row(mark('download'), 'Exporter', '', '<span class="chev">' + i('chevron') + '</span>')}
    {row('<span class="op neutral" style="color:var(--destructive-dark)">' + i('trash') + '</span>', '<span style="color:var(--destructive-dark)">Tout supprimer</span>')}
  </div>
""", "gap:14px"), 25, tab="me",
    notes=["Law 2024/017: consent can be withdrawn (switch), data exported, everything deleted. All three are one tap from here.",
           "\"Notifications sans montant\" is fixed, not a setting; shown so users know."])

f9b = frame("9b", "Delete everything (confirm sheet)", nav("Vos données") + scroll("", ""), 20, tab="me", overlay=f"""
  <div class="scrim"></div>
  <div class="sheet">
    <div class="grab"></div>
    <div class="h-title-lg">Tout supprimer&nbsp;?</div>
    <div class="t-body muted">Vos mouvements et poches. Njangis et dettes partagées restent.</div>
    <div class="btn danger">Tout supprimer</div>
    <div class="btn ghost">Annuler</div>
  </div>""",
    notes=["Njangi PaymentRecords and two-sided debts have a counterparty: deleting removes this user's copy and personal data, the other side keeps theirs."])

# ---------------------------------------------------------------- Round 3 additions
f7d = frame("7d", "Cash check · first time (nothing expected yet)", nav("Point liquide", "close") + scroll(f"""
  <div class="h-headline">Combien de liquide avez-vous&nbsp;?</div>
  <div class="t-body muted">Comptez ce qui est dans votre poche.</div>
  <div class="input filled focus" style="justify-content:center;font:700 26px/32px var(--font-body);font-variant-numeric:tabular-nums;min-height:60px">{f(12500)}</div>
  {keypad}
""", "gap:12px"), 25, footer=f'<div class="btn primary">Enregistrer {f(12500)}</div>',
    notes=["Opened from 4d. No \"Normalement\" line: there is no earlier count to compare with.",
           "This count starts the cash chain; tomorrow's check uses it as \"Hier soir\"."])

f8c = frame("8c", "After #150#: the user decides", nav("", "close") + scroll(f"""
  <div class="h-headline" style="margin-top:8px">L'argent est là&nbsp;?</div>
  <div class="t-body muted">Regardez ce que #150# affiche.</div>
  {select(f'Oui, {f(50000)} est arrivé', '', False, mark('money-in'))}
  {select('Non, rien', '', True, mark('cancelled'))}
""", "gap:14px"), 20, footer='<div class="btn primary">Continuer</div>',
    notes=["Shown when the user comes back from the dialer. \"Oui\" counts the credit as confirmed by the user (not by SMS).",
           "\"Non\" marks the SMS as fake and opens the warning-share of 8b."])

f10a = frame("10a", "iPhone · paste an SMS", nav("Ajouter un SMS", "close") + scroll(f"""
  <div class="card pad t-small muted" style="background:var(--surface-muted)">«&nbsp;Paiement réussi. Boulangerie Saker. Montant&nbsp;: 1500 FCFA…&nbsp;»</div>
  <div class="card" style="overflow:hidden">
    {row(op('om'), 'Boulangerie Saker', 'mardi 7 octobre, 14:02', amt(f(1500), 'payé', 'money-out'))}
  </div>
  <dl class="kv card pad">
    <dt>Poche</dt><dd>Orange Money ··41</dd>
    <dt>Catégorie</dt><dd>Ration</dd>
  </dl>
""", "gap:14px"), 25, footer=f'<div class="btn primary">Ajouter {f(1500)}</div>',
    notes=["Same parser as Android. Reached from the share sheet (Messages → Partager → OnCotise) or the \"Coller un SMS\" button on 4b.",
           "The pasted text is shown for checking, then discarded; only the fields below are kept."])

def check(on: bool) -> str:
    return f'<span class="cb{" on" if on else ""}" role="checkbox" aria-checked="{str(on).lower()}">{i("check", "sm") if on else ""}</span>'

f10b = frame("10b", "iPhone · screenshot of the Max It history", nav("Capture d'écran", "close") + scroll(f"""
  <div class="t-body">4 mouvements trouvés.</div>
  <div class="card" style="overflow:hidden">
    {row(check(True), 'Boulangerie Saker', 'lundi 6 octobre', amt(f(1500), 'payé', 'money-out'))}
    {row(check(True), 'Maman', 'lundi 6 octobre', amt(f(15000), 'reçu', 'money-in'))}
    {row(check(True), 'Retrait', 'dimanche 5 octobre', amt(f(20000), 'déplacé'))}
    {row(check(False), 'Eneo', 'samedi 4 octobre · déjà là', amt(f(8400), 'payé', 'money-out'), cls='off')}
  </div>
""", "gap:12px"), 25, footer='<div class="btn primary">Ajouter 3 mouvements</div>',
    notes=["Text recognition runs on the phone (Apple Vision). The screenshot is never uploaded.",
           "Rows already in the ledger (same operator reference or same amount, party and minute) come unticked as \"déjà là\".",
           "UNVERIFIED: the Max It and MoMo history layouts; collect real screenshots in Phase 0."])

f10c = frame("10c", "iPhone · SMS not understood", nav("Ajouter un SMS", "close") + scroll(f"""
  <div class="banner warn">{i('gap')}<div><b>Ce SMS n'est pas compris.</b></div></div>
  <div class="card pad t-small muted" style="background:var(--surface-muted)">«&nbsp;Cher client, profitez du bonus 200% sur…&nbsp;»</div>
""", "gap:14px"), 20,
    footer='<div class="btn primary">Ajouter à la main</div><div class="btn ghost">Annuler</div>',
    notes=["Promotions and new operator wordings land here. \"Ajouter à la main\" opens the manual form; the text is discarded either way.",
           "Each miss is counted (not stored) so parser templates can be updated over the air."])

f11a = frame("11a", "Mouvements · nothing yet", scroll(f"""
  <div class="h-headline">Mouvements</div>
  <div class="empty" style="flex:1;justify-content:center">
    {i('sms')}
    <b>Pas encore de mouvement</b>
    <div class="t-body">Ils arrivent avec vos SMS Orange et MTN.</div>
  </div>
""", "padding-top:14px"), 25, tab="feed", footer='<div class="btn secondary">Compter mon liquide</div>',
    notes=["Android with SMS on, but no money SMS since the start date. Nothing to fix, so the button is secondary."])

f11b = frame("11b", "Accueil · iPhone first run", scroll(f"""
  <div class="empty" style="flex:1;justify-content:center">
    {i('paste')}
    <b>Ajoutez un SMS d'argent</b>
    <div class="t-body">Copiez un SMS Orange ou MTN, puis collez-le ici.</div>
  </div>
""", "padding-top:14px"), 25, tab="home",
    footer=f'<div class="btn primary">{i("paste")}Coller un SMS</div><div class="btn secondary">Compter mon liquide</div>',
    notes=["iOS cannot read SMS, so the first run teaches the paste. A screenshot import (10b) is offered after the first paste."])

f13a = frame("13a", "Vos njangis (Phase 1, from Accueil)", nav("Vos njangis") + scroll(f"""
  <div class="card" style="overflow:hidden">
    {row(avatar('NB', 'sq'), 'Njangi Bureau', 'pot : 12 mars', amt(f(20000), 'versé'))}
    {row(avatar('NF', 'sq'), 'Njangi Famille', 'pot reçu', amt(f(60000), 'à verser'))}
  </div>
""", "gap:10px"), 25, tab="home",
    notes=["Before your pot: what you have paid in (\"versé\", confirmed records only). After it: what you still owe the group (\"à verser\"). Never a signed balance.",
           "Bureau: tours 1–2 confirmed = 20 000 F. Tour 3 is \"envoyé\" on 5a (Marie hasn't confirmed), so it isn't counted yet; tour 4 is due on 4a.",
           "Amounts come from expectedForMember (deux mains) and server sums, never computed on the phone.",
           "No button: nothing to add here in Phase 1. Tapping a row opens the group's \"Ma position\"."])

f13b = frame("13b", "Njangi et dettes (Phase 2 reference)", nav("Njangi et dettes") + scroll(f"""
  <div class="card" style="overflow:hidden">
    {row(avatar('NB', 'sq'), 'Njangi Bureau', 'pot : 12 mars', amt(f(20000), 'versé'))}
    {row(avatar('NF', 'sq'), 'Njangi Famille', 'pot reçu', amt(f(60000), 'à verser'))}
  </div>
  <div class="section-h">Dettes</div>
  <div class="card" style="overflow:hidden">
    {row(avatar('BT'), 'Brice', '2 octobre', amt(f(10000), 'à recevoir'))}
    {row(avatar('TR'), 'Rose', '28 septembre', amt(f(5000), 'à rendre'))}
  </div>
""", "gap:10px"), 25, tab="home", footer='<div class="btn secondary">Nouvelle dette</div>',
    notes=["Phase 2 only. Do not build the button before debt create and counterparty confirm exist (a dead-end CTA was a pilot blocker in September).",
           "Debts are two-sided like PaymentRecords: the other person confirms; deleting (9b) keeps their copy."])


SECTIONS = [
    ("consent", "1 · SMS consent and onboarding", "Play's prominent disclosure, then the system prompt, then the hide-amounts choice.", [f1a, f1b, f1c]),
    ("numbers", "2 · Numbers and start date", "Dual SIM and second-hand phones decide what we read.", [f2a, f2b]),
    ("backfill", "3 · First read", "Parsing on the phone; first result with the review count.", [f3a, f3b]),
    ("accueil", "4 · Accueil in six states", "Hero = first action. Pockets name where the money is and when we last saw it. No total.", [f4a, f4b, f4c, f4d, f4e, f4f]),
    ("feed", "5 · Mouvements", "Who, how much, when, direction in words. Moves are not spending.", [f5a, f5b]),
    ("gap", "6 · Gap fill", "From the balance chain, never guessed.", [f6a]),
    ("cash", "7 · Cash check", "Count, split, the branch for cash received, and the first count.", [f7a, f7b, f7c, f7d]),
    ("scam", "8 · Suspicious SMS (operator-only scope)", "Chain-based check for operator senders; shared-in check for anything else.", [f8a, f8c, f8b]),
    ("privacy", "9 · Privacy and deletion", "Stop reading, export, delete everything.", [f9a, f9b]),
    ("ios", "10 · iPhone: paste and screenshot", "No SMS access on iOS: the same parser, fed by paste, share and screenshots.", [f10a, f10b, f10c]),
    ("empty", "11 · Empty states", "First runs with nothing to show yet.", [f11a, f11b]),
    ("commit", "13 · Vos njangis", "The destination of the Accueil row: njangi positions in Phase 1, plus debts in Phase 2.", [f13a, f13b]),
]

nav_links = "".join(f'<a href="#{sid}">{title}</a>' for sid, title, _, _ in SECTIONS)
body = "".join(f"""
  <section class="section" id="{sid}">
    <h3>{title}</h3>
    <p class="rule">{rule}</p>
    <div class="shots">{''.join(frames)}</div>
  </section>""" for sid, title, rule, frames in SECTIONS)

HTML = f"""<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Personal finance mockups, round 3 (neutral kit)</title>
<link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,400,0,0&display=block" rel="stylesheet">
<link rel="stylesheet" href="kit/kit.css">
<link rel="stylesheet" href="extra.css">
<script src="kit/sf-symbols.js"></script>
<script src="kit/sf-extra.js"></script>
<script src="kit/kit.js"></script>
<script src="extra.js"></script>
</head>
<body>
<div class="doc">
  <nav class="doc-nav">
    <h1>Personal finance · round 3</h1>
    <div class="sub">Neutral kit · 360 dp · 2026-10-07</div>
    <a href="../../personal-finance-direction-2026-10-06.html">Direction doc</a>
    <a href="../../personal-finance-ui-review-2026-10-07.md">Round 1 review</a>
    <div class="group">Screens</div>
    {nav_links}
  </nav>
  <main class="doc-main">
    <header>
      <h2>Personal finance mockups, round 3</h2>
      <p class="lede">Round 3: Fable's round 2 fixes applied to screens 1–9, plus 7d, 8c, 10, 11 and 13. Drawn in the neutral kit (copied from the <code>docs/mobile-ui-guide</code> worktree). Decisions applied: tabs Accueil · Mouvements · Groupes · Moi; scam checks on operator SMS only; hide-amounts asked at onboarding. Android first. Word counts under each frame are computed live from the visible text (numbers, times and system UI excluded).</p>
    </header>
    {body}
  </main>
</div>
</body>
</html>
"""

out = Path(__file__).with_name("index.html")
out.write_text(HTML, encoding="utf-8")
print(f"wrote {out} ({len(HTML):,} bytes)")
