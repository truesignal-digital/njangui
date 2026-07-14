/**
 * Mobile-money method availability for a recipient phone number.
 *
 * Pure and client-importable: the pay-flow UI gates which methods it offers
 * with the exact rules a mutation could enforce, so a method the screen
 * shows can never dead-end on a missing or wrong-operator number.
 *
 * Cameroon mobile numbering (9 digits, leading 6) — operator ranges by the
 * first three digits, verified 2026-07; ranges drift when ART assigns new
 * blocks, so re-verify alongside the quarterly USSD copy check:
 *   MTN     650–654, 670–679, 680–684
 *   Orange  655–659, 685–689, 690–699
 *   other   66x (Nexttel), 62x (Camtel) — no MTN MoMo / Orange Money
 */

export type MobileMoneyMethod = 'momo_mtn' | 'orange_money';

export type MobileOperator = 'mtn' | 'orange' | 'other';

export type MethodUnavailableReason =
  | 'missing_phone' // recipient has no number on file
  | 'invalid_phone' // not a Cameroon mobile number
  | 'operator_mismatch' // number belongs to the other mobile-money operator
  | 'operator_unsupported'; // valid number, but no mobile-money service

export interface MethodAvailability {
  available: boolean;
  reason?: MethodUnavailableReason;
}

const OPERATOR_BY_METHOD: Record<MobileMoneyMethod, MobileOperator> = {
  momo_mtn: 'mtn',
  orange_money: 'orange',
};

/** '+2376…' / '2376…' / '6…' (spaces allowed) → local '6XXXXXXXX', else null. */
export function normalizeCameroonMobile(
  phone: string | undefined | null
): string | null {
  if (!phone) return null;
  let digits = phone.replace(/[\s().-]/g, '');
  if (digits.startsWith('+237')) digits = digits.slice(4);
  else if (digits.startsWith('237') && digits.length === 12) digits = digits.slice(3);
  if (!/^6\d{8}$/.test(digits)) return null;
  return digits;
}

export function detectMobileOperator(
  phone: string | undefined | null
): MobileOperator | null {
  const local = normalizeCameroonMobile(phone);
  if (!local) return null;
  const prefix = Number(local.slice(0, 3));
  if (
    (prefix >= 650 && prefix <= 654) ||
    (prefix >= 670 && prefix <= 679) ||
    (prefix >= 680 && prefix <= 684)
  ) {
    return 'mtn';
  }
  if (
    (prefix >= 655 && prefix <= 659) ||
    (prefix >= 685 && prefix <= 689) ||
    (prefix >= 690 && prefix <= 699)
  ) {
    return 'orange';
  }
  return 'other';
}

export function mobileMoneyAvailability(
  method: MobileMoneyMethod,
  payeePhone: string | undefined | null
): MethodAvailability {
  if (!payeePhone) return { available: false, reason: 'missing_phone' };
  const operator = detectMobileOperator(payeePhone);
  if (operator === null) return { available: false, reason: 'invalid_phone' };
  if (operator === 'other') {
    return { available: false, reason: 'operator_unsupported' };
  }
  if (operator !== OPERATOR_BY_METHOD[method]) {
    return { available: false, reason: 'operator_mismatch' };
  }
  return { available: true };
}

/** The mobile-money method that CAN reach this number, if any. */
export function availableMobileMoneyMethod(
  payeePhone: string | undefined | null
): MobileMoneyMethod | null {
  const operator = detectMobileOperator(payeePhone);
  if (operator === 'mtn') return 'momo_mtn';
  if (operator === 'orange') return 'orange_money';
  return null;
}
