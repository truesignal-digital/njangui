import type { AppTheme } from './theme';

/**
 * ChoiceCard icon colour, picked for contrast against the chip behind it:
 * dominant sits on the light overlay chip, selected on accent-light,
 * default on success-bg.
 */
export function choiceCardIconColor(
  state: { dominant: boolean; selected: boolean },
  theme: Pick<AppTheme, 'text' | 'accent' | 'successDark'>
): string {
  if (state.dominant) return theme.text;
  if (state.selected) return theme.accent;
  return theme.successDark;
}
