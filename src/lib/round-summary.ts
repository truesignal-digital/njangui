import { Linking, Share } from 'react-native';
import type { FunctionReturnType } from 'convex/server';

import type { api } from './convex-api';
import { formatCurrencyXAF } from './format-currency';

type RoundDetail = NonNullable<FunctionReturnType<typeof api.rounds.getRound>>;
type PaymentRows = FunctionReturnType<typeof api.rounds.listRoundPayments>;

/**
 * Round summary text (05 M10, Slice 8) — the pilot's distribution loop and
 * the feature-phone members' receipt. Custody-framed amounts (00 red line),
 * pot and caisse never summed, `njangi://` deep link at the foot (no web
 * summary page — 2026-06-11 mobile-only decision).
 */
export function buildRoundSummary(
  language: 'fr' | 'en',
  groupName: string,
  round: RoundDetail,
  rows: PaymentRows
): string {
  const settled = rows.filter((r) => r.isSettled);
  const unsettled = rows.filter((r) => !r.isSettled);
  const lines: string[] = [];

  if (language === 'fr') {
    lines.push(`📒 ${groupName} — Tour ${round.index}`);
    lines.push(`Bénéficiaire : ${round.beneficiaryName}`);
    lines.push(
      `Pot : ${formatCurrencyXAF(round.confirmedTotal)} / ${formatCurrencyXAF(round.expectedTotal)} · reçu par ${round.custodianName}`
    );
    lines.push('');
    lines.push(`✓ Cotisations confirmées (${settled.length}/${rows.length}) :`);
    for (const row of settled) {
      lines.push(`  ✓ ${row.displayName} — ${formatCurrencyXAF(row.confirmedAmount)}`);
    }
    if (unsettled.length > 0) {
      lines.push('En attente :');
      for (const row of unsettled) {
        lines.push(
          `  ○ ${row.displayName} — ${formatCurrencyXAF(row.confirmedAmount)} / ${formatCurrencyXAF(row.expectedAmount)}`
        );
      }
    }
    if (round.payout) {
      lines.push('');
      lines.push(
        round.payout.state === 'confirmed'
          ? `🎉 Pot de ${formatCurrencyXAF(round.payout.amount)} remis à ${round.beneficiaryName} — confirmé`
          : `Remise du pot à ${round.beneficiaryName} : ${statusFr(round.payout.state)}`
      );
    }
    lines.push('');
    lines.push("— Suivi dans l'appli Njangi. L'argent ne passe jamais par l'appli.");
  } else {
    lines.push(`📒 ${groupName} — Round ${round.index}`);
    lines.push(`Beneficiary: ${round.beneficiaryName}`);
    lines.push(
      `Pot: ${formatCurrencyXAF(round.confirmedTotal)} / ${formatCurrencyXAF(round.expectedTotal)} · received by ${round.custodianName}`
    );
    lines.push('');
    lines.push(`✓ Confirmed contributions (${settled.length}/${rows.length}):`);
    for (const row of settled) {
      lines.push(`  ✓ ${row.displayName} — ${formatCurrencyXAF(row.confirmedAmount)}`);
    }
    if (unsettled.length > 0) {
      lines.push('Awaiting:');
      for (const row of unsettled) {
        lines.push(
          `  ○ ${row.displayName} — ${formatCurrencyXAF(row.confirmedAmount)} / ${formatCurrencyXAF(row.expectedAmount)}`
        );
      }
    }
    if (round.payout) {
      lines.push('');
      lines.push(
        round.payout.state === 'confirmed'
          ? `🎉 Pot of ${formatCurrencyXAF(round.payout.amount)} handed to ${round.beneficiaryName} — confirmed`
          : `Pot handover to ${round.beneficiaryName}: ${statusEn(round.payout.state)}`
      );
    }
    lines.push('');
    lines.push('— Tracked in the Njangi app. Money never passes through the app.');
  }

  lines.push(`njangi://groups/${round.groupId}/rounds/${round.roundId}`);
  return lines.join('\n');
}

function statusFr(state: string): string {
  return (
    { pending: 'à faire', claimed: 'déclarée', disputed: 'contestée' }[state] ??
    state
  );
}
function statusEn(state: string): string {
  return (
    { pending: 'to do', claimed: 'declared', disputed: 'disputed' }[state] ??
    state
  );
}

/**
 * Share to WhatsApp directly (`wa.me` — 05 M10's target surface), falling
 * back to the native share sheet when WhatsApp isn't installable/openable.
 */
export async function shareRoundSummary(text: string): Promise<void> {
  const waUrl = `whatsapp://send?text=${encodeURIComponent(text)}`;
  try {
    const canOpen = await Linking.canOpenURL(waUrl);
    if (canOpen) {
      await Linking.openURL(waUrl);
      return;
    }
  } catch {
    // fall through to the share sheet
  }
  await Share.share({ message: text });
}
