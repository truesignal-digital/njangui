// Runs after kit.js, before DOMContentLoaded: extend the icon map and swap in the four decided tabs.
Object.assign(ICONS, {
  sms: { ios: "message", android: "sms" },
  sim: { ios: "simcard", android: "sim_card" },
  eye: { ios: "eye", android: "visibility" },
  "eye-off": { ios: "eye.slash", android: "visibility_off" },
  trash: { ios: "trash", android: "delete" },
  move: { ios: "arrow.left.arrow.right", android: "swap_horiz" },
  bank: { ios: "building.columns", android: "account_balance" },
  import: { ios: "square.and.arrow.down", android: "download" },
  doc: { ios: "doc.text", android: "description" },
  photo: { ios: "photo", android: "image" },
  pause: { ios: "pause.circle", android: "pause_circle" },
  shield: { ios: "checkmark.shield", android: "verified_user" },
  paste: { ios: "doc.on.clipboard", android: "content_paste" },
  gap: { ios: "questionmark.circle", android: "help" },
  edit: { ios: "pencil", android: "edit" },
  split: { ios: "square.split.2x1", android: "call_split" },
  tag: { ios: "tag", android: "sell" },
  keypad: { ios: "circle.grid.3x3", android: "dialpad" },
  "phone-lock": { ios: "lock.iphone", android: "phonelink_lock" },
  download: { ios: "arrow.down.circle", android: "download" },
  backspace: { ios: "delete.left", android: "backspace" },
  warning: { ios: "exclamationmark.triangle", android: "warning" },
});

TABS.splice(0, TABS.length,
  ["home", "home", "Accueil"],
  ["list", "feed", "Mouvements"],
  ["groups", "group", "Groupes"],
  ["person", "me", "Moi"],
);

// Word budget check: visible words per frame, excluding status bar, tab bar, system UI,
// and tokens without letters (amounts, times, codes) plus the currency "F".
function countWords(frameEl) {
  const clone = frameEl.cloneNode(true);
  clone.querySelectorAll(".statusbar, .tabbar, [data-nowc], .ic, .pict, .op, .avatar").forEach((el) => el.remove());
  const parts = [];
  const walker = document.createTreeWalker(clone, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) parts.push(walker.currentNode.nodeValue);
  return parts.join(" ").split(/[\s  ·,.:;!?«»()/]+/u)
    .filter((t) => /\p{L}/u.test(t) && t !== "F").length;
}

document.addEventListener("DOMContentLoaded", () => {
  // kit.js's own handler ran first, so icons are already replaced.
  document.querySelectorAll("figure.shot").forEach((fig) => {
    const frame = fig.querySelector(".frame");
    const out = fig.querySelector(".wc");
    const budget = Number(frame.dataset.budget);
    const n = countWords(frame);
    out.textContent = `${n} mots · limite ${budget}`;
    out.classList.add(n <= budget ? "ok" : "over");
  });
});
