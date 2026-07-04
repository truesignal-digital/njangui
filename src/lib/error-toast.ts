import { ConvexError } from 'convex/values';
import { toast } from 'sonner-native';
import type { TFunction } from 'i18next';

import { haptics } from './haptics';
import { isNetworkError, logger } from './logger';

/*
 * The one way to surface a caught server/client error to the user.
 * ConvexError({ code }) maps to the errors.<code> i18n key (en + fr);
 * anything else collapses to the generic message so raw error text —
 * which Convex redacts to "Server Error" in prod anyway — never reaches
 * a toast. Branch UI logic on err.data.code, never on message text.
 */
export function showErrorToast(err: unknown, t: TFunction) {
  haptics.error();

  if (err instanceof ConvexError) {
    const data: unknown = err.data;
    const code =
      typeof data === 'object' && data !== null && 'code' in data
        ? String((data as { code: unknown }).code)
        : null;
    if (code) {
      toast.error(t(`errors.${code}`, { defaultValue: t('common.error') }));
      return;
    }
  }

  if (isNetworkError(err)) {
    toast.error(t('errors.network'));
    return;
  }

  logger.error('Unhandled error shown as toast', { error: err });
  toast.error(t('common.error'));
}
