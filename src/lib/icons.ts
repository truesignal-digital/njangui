import { mobileUiConfig } from './mobile-ui-config';

/**
 * App-owned icon sizes. `Icon` only accepts these three values.
 */
export const ICON_SIZE = {
  metadata: mobileUiConfig.dimensions.iconSm,
  control: mobileUiConfig.dimensions.iconMd,
  emphasis: mobileUiConfig.dimensions.iconLg,
} as const;

export type IconSize = (typeof ICON_SIZE)[keyof typeof ICON_SIZE];

/**
 * One semantic name per meaning, mapped to SF Symbols (iOS) and Material
 * Symbols (Android). Mirrors `ICONS` in docs/design/ui-guide/kit.js; the
 * entries after `filter` extend the kit for the pay flow. Names are
 * type-checked against expo-symbols in src/components/ui/icon.tsx, the only
 * file allowed to import it.
 */
export const ICONS = {
  today: { ios: 'sun.max', android: 'today' },
  groups: { ios: 'person.3', android: 'groups' },
  actions: { ios: 'checkmark.circle', android: 'check_circle' },
  back: { ios: 'chevron.backward', android: 'arrow_back' },
  close: { ios: 'xmark', android: 'close' },
  queued: { ios: 'arrow.clockwise', android: 'sync' },
  cash: { ios: 'banknote', android: 'payments' },
  notifications: { ios: 'bell', android: 'notifications' },
  confirmed: { ios: 'checkmark.circle.fill', android: 'check_circle' },
  chevron: { ios: 'chevron.right', android: 'chevron_right' },
  pending: { ios: 'clock', android: 'schedule' },
  'mobile-money': { ios: 'iphone', android: 'smartphone' },
  copy: { ios: 'doc.on.doc', android: 'content_copy' },
  disputed: { ios: 'exclamationmark.triangle', android: 'warning' },
  tap: { ios: 'hand.tap', android: 'touch_app' },
  info: { ios: 'info.circle', android: 'info' },
  language: { ios: 'globe', android: 'language' },
  locked: { ios: 'lock', android: 'lock' },
  claimed: { ios: 'paperplane', android: 'send' },
  call: { ios: 'phone', android: 'call' },
  add: { ios: 'plus', android: 'add' },
  'invite-code': { ios: 'qrcode', android: 'qr_code' },
  custody: { ios: 'checkmark.shield', android: 'verified_user' },
  offline: { ios: 'wifi.slash', android: 'wifi_off' },
  cancelled: { ios: 'xmark.circle', android: 'cancel' },
  calendar: { ios: 'calendar', android: 'calendar_month' },
  person: { ios: 'person', android: 'person' },
  more: { ios: 'ellipsis', android: 'more_horiz' },
  listen: { ios: 'speaker.wave.2', android: 'volume_up' },
  chat: { ios: 'bubble.left', android: 'chat_bubble' },
  'money-out': { ios: 'arrow.up.right', android: 'north_east' },
  'money-in': { ios: 'arrow.down.left', android: 'south_west' },
  check: { ios: 'checkmark', android: 'check' },
  camera: { ios: 'camera', android: 'photo_camera' },
  search: { ios: 'magnifyingglass', android: 'search' },
  settings: { ios: 'gearshape', android: 'settings' },
  expand: { ios: 'chevron.down', android: 'expand_more' },
  grid: { ios: 'square.grid.2x2', android: 'grid_view' },
  list: { ios: 'list.bullet', android: 'list' },
  timer: { ios: 'hourglass', android: 'hourglass_empty' },
  history: { ios: 'clock.arrow.circlepath', android: 'history' },
  share: { ios: 'square.and.arrow.up', android: 'share' },
  crown: { ios: 'crown', android: 'workspace_premium' },
  pot: { ios: 'gift', android: 'redeem' },
  next: { ios: 'arrow.right', android: 'arrow_forward' },
  mic: { ios: 'mic', android: 'mic' },
  home: { ios: 'house', android: 'home' },
  handshake: { ios: 'hands.clap', android: 'handshake' },
  swipe: { ios: 'hand.draw', android: 'swipe' },
  star: { ios: 'star', android: 'star' },
  filter: { ios: 'line.3.horizontal.decrease', android: 'filter_list' },
  warning: { ios: 'exclamationmark.triangle', android: 'warning' },
  collapse: { ios: 'chevron.up', android: 'expand_less' },
  photo: { ios: 'photo', android: 'image' },
} as const;

export type IconName = keyof typeof ICONS;
