// Shared by every page of the guide: platform icons, the phone chrome, layer notes and the switches.
// Icons are native per platform, as the app will render them through expo-symbols:
// iOS = SF Symbols (sf-symbols.js, rendered from the system on macOS),
// Android = Material Symbols Outlined (the font expo-symbols bundles; here loaded from Google Fonts).
// This map is the proposed src/lib/icons.ts: one semantic name, two platform names.
const ICONS = {
  "today": { ios: "sun.max", android: "today" },
  "groups": { ios: "person.3", android: "groups" },
  "actions": { ios: "checkmark.circle", android: "check_circle" },
  "back": { ios: "chevron.backward", android: "arrow_back" },
  "close": { ios: "xmark", android: "close" },
  "queued": { ios: "arrow.clockwise", android: "sync" },
  "cash": { ios: "banknote", android: "payments" },
  "notifications": { ios: "bell", android: "notifications" },
  "confirmed": { ios: "checkmark.circle.fill", android: "check_circle" },
  "chevron": { ios: "chevron.right", android: "chevron_right" },
  "pending": { ios: "clock", android: "schedule" },
  "mobile-money": { ios: "iphone", android: "smartphone" },
  "copy": { ios: "doc.on.doc", android: "content_copy" },
  "disputed": { ios: "exclamationmark.triangle", android: "warning" },
  "tap": { ios: "hand.tap", android: "touch_app" },
  "info": { ios: "info.circle", android: "info" },
  "language": { ios: "globe", android: "language" },
  "locked": { ios: "lock", android: "lock" },
  "claimed": { ios: "paperplane", android: "send" },
  "call": { ios: "phone", android: "call" },
  "add": { ios: "plus", android: "add" },
  "invite-code": { ios: "qrcode", android: "qr_code" },
  "custody": { ios: "checkmark.shield", android: "verified_user" },
  "offline": { ios: "wifi.slash", android: "wifi_off" },
  "cancelled": { ios: "xmark.circle", android: "cancel" },
  "calendar": { ios: "calendar", android: "calendar_month" },
  "person": { ios: "person", android: "person" },
  "more": { ios: "ellipsis", android: "more_horiz" },
  "listen": { ios: "speaker.wave.2", android: "volume_up" },
  "chat": { ios: "bubble.left", android: "chat_bubble" },
  "money-out": { ios: "arrow.up.right", android: "north_east" },
  "money-in": { ios: "arrow.down.left", android: "south_west" },
  "check": { ios: "checkmark", android: "check" },
  "camera": { ios: "camera", android: "photo_camera" },
  "search": { ios: "magnifyingglass", android: "search" },
  "settings": { ios: "gearshape", android: "settings" },
  "expand": { ios: "chevron.down", android: "expand_more" },
  "grid": { ios: "square.grid.2x2", android: "grid_view" },
  "list": { ios: "list.bullet", android: "list" },
  "timer": { ios: "hourglass", android: "hourglass_empty" },
  "history": { ios: "clock.arrow.circlepath", android: "history" },
  "share": { ios: "square.and.arrow.up", android: "share" },
  "crown": { ios: "crown", android: "workspace_premium" },
  "pot": { ios: "gift", android: "redeem" },
  "next": { ios: "arrow.right", android: "arrow_forward" },
  "mic": { ios: "mic", android: "mic" },
  "home": { ios: "house", android: "home" },
  "handshake": { ios: "hands.clap", android: "handshake" },
  "swipe": { ios: "hand.draw", android: "swipe" },
  "star": { ios: "star", android: "star" },
  "filter": { ios: "line.3.horizontal.decrease", android: "filter_list" },
};

function icon(name, cls = "") {
  const i = ICONS[name];
  if (!i) return "";
  return `<span class="ic sf ${cls}" style="--sf:url(${SF_SYMBOLS[name]})" aria-hidden="true"></span><span class="ic msym ${cls}" aria-hidden="true">${i.android}</span>`;
}

// The three tabs as they ship: app/(app)/(tabs)/_layout.tsx, labels from fr.json tabs.*
const TABS = [["today", "home", "Aujourd'hui"], ["groups", "group", "Groupes"], ["actions", "inbox", "Actions"]];
function tabbar(active, badge) {
  return `<nav class="tabbar">${TABS.map(([i, k, l]) =>
    `<div class="${k === active ? "on" : ""}">${icon(i)}<span>${l}${k === "inbox" && badge ? ` (${badge})` : ""}</span></div>`).join("")}</nav>`;
}
const statusbar = () => `<div class="statusbar"><span>9:41</span><span>4G ▮▮▮</span></div>`;

document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll("[data-tabbar]").forEach((el) => (el.outerHTML = tabbar(el.dataset.tabbar, el.dataset.badge)));
  document.querySelectorAll("[data-statusbar]").forEach((el) => (el.outerHTML = statusbar()));
  document.querySelectorAll("[data-sf]").forEach((el) => el.style.setProperty("--sf", `url(${SF_SYMBOLS[el.dataset.sf]})`));
  document.querySelectorAll("i[data-i]").forEach((el) => (el.outerHTML = icon(el.dataset.i, el.dataset.c ?? "")));

  const params = new URLSearchParams(location.search);
  const controls = document.createElement("div");
  controls.className = "doc-controls";
  const notesBtn = document.createElement("button");
  const themeBtn = document.createElement("button");
  const paletteBtn = document.createElement("button");
  const platformBtn = document.createElement("button");
  controls.append(notesBtn, platformBtn, paletteBtn, themeBtn);
  const setPlatform = (name) => {
    document.body.classList.toggle("platform-ios", name === "ios");
    document.body.classList.toggle("platform-android", name !== "ios");
    localStorage.setItem("njangi-guide-platform", name);
    platformBtn.textContent = name === "ios" ? "Platform: iOS (SF Symbols)" : "Platform: Android (Material)";
  };
  platformBtn.addEventListener("click", () => setPlatform(document.body.classList.contains("platform-ios") ? "android" : "ios"));
  setPlatform(params.get("platform") ?? localStorage.getItem("njangi-guide-platform") ?? "android");
  document.body.append(controls);

  const setNotes = (on) => {
    document.body.classList.toggle("notes-on", on);
    notesBtn.textContent = on ? "Layer outlines: on" : "Layer outlines: off";
  };
  const setTheme = (name) => {
    document.body.classList.toggle("theme-dark", name === "dark");
    localStorage.setItem("njangi-guide-theme", name);
    themeBtn.textContent = name === "dark" ? "Mode: dark" : "Mode: light";
  };
  const setPalette = (name) => {
    document.body.classList.toggle("theme-current", name === "current");
    localStorage.setItem("njangi-guide-palette", name);
    paletteBtn.textContent = name === "current" ? "Palette: today's code" : "Palette: neutral (proposed)";
  };
  paletteBtn.addEventListener("click", () => setPalette(document.body.classList.contains("theme-current") ? "neutral" : "current"));
  setPalette(params.get("palette") ?? localStorage.getItem("njangi-guide-palette") ?? "neutral");
  notesBtn.addEventListener("click", () => setNotes(!document.body.classList.contains("notes-on")));
  themeBtn.addEventListener("click", () => setTheme(document.body.classList.contains("theme-dark") ? "light" : "dark"));
  setNotes(params.get("notes") !== "0");
  setTheme(params.get("theme") ?? localStorage.getItem("njangi-guide-theme") ?? "light");

  const here = location.pathname.split("/").pop() || "index.html";
  document.querySelectorAll(".doc-nav a[href]").forEach((a) => {
    if (a.getAttribute("href") === here) a.classList.add("here");
  });
});
