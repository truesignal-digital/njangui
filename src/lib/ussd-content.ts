import { useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useConvexAuth, useQuery } from 'convex/react';

import { api } from './convex-api';

/**
 * USSD instruction content — three-tier priority (docs/03 §C/§D, hard
 * requirement): 1) BUNDLED canonical steps below (what renders offline on
 * first run — a blank instruction screen in the réunion hall is the failure
 * this forbids), 2) AsyncStorage cache of the last-fetched Convex copy,
 * 3) the Convex `ussdContent` row as the remotely-updatable OTA override
 * (menu drift fixes ship without an app release; `version` drives cache
 * invalidation). Steps use {{name}} / {{number}} / {{amount}} /
 * {{reference}} placeholders interpolated at render.
 */

export type UssdMethod = 'momo_mtn' | 'orange_money';
export type UssdLanguage = 'fr' | 'en';

export interface UssdInstructionSet {
  title: string;
  code: string; // bare service code — *126# / #150# (04 commandment 5)
  steps: string[];
  version: number;
}

export const USSD_CODES: Record<UssdMethod, string> = {
  momo_mtn: '*126#',
  orange_money: '#150#',
};

// docs/03 §C exact copy (2026-06 verification; re-verify quarterly — menu
// option numbers WILL drift, which is what the Convex override is for).
export const BUNDLED_USSD_CONTENT: Record<
  UssdMethod,
  Record<UssdLanguage, UssdInstructionSet>
> = {
  momo_mtn: {
    fr: {
      title: 'Payer avec MTN MoMo',
      code: '*126#',
      version: 1,
      steps: [
        'Composez *126# sur votre SIM MTN (téléphone à deux SIM : choisissez celle de votre compte MoMo) et appelez.',
        "Le menu MTN MoMo s'affiche. Choisissez 1 — Transfert d'argent.",
        'Choisissez 1 — Vers un numéro MTN MoMo.',
        'Entrez le numéro de {{name}} : {{number}} (collez-le).',
        'Entrez le montant : {{amount}} (sans espaces ni points).',
        'Si MTN demande un motif ou une référence, entrez : {{reference}}.',
        "Vérifiez l'écran : le nom affiché doit être celui de {{name}} et le montant correct.",
        'Entrez votre code PIN MoMo pour confirmer.',
        "Vous recevez un SMS de MTN. Faites une capture d'écran — vous la joindrez comme preuve à l'étape suivante.",
      ],
    },
    en: {
      title: 'Pay with MTN MoMo',
      code: '*126#',
      version: 1,
      steps: [
        'Dial *126# on your MTN SIM (dual-SIM phones: pick the SIM with your MoMo account) and call.',
        'The MTN MoMo menu appears. Choose 1 — Transfer money.',
        'Choose 1 — To an MTN MoMo number.',
        "Enter {{name}}'s number: {{number}} (paste it).",
        'Enter the amount: {{amount}} (no spaces or dots).',
        'If MTN asks for a reason/reference, enter {{reference}}.',
        "Check the screen: the name shown must be {{name}}'s and the amount correct.",
        'Enter your MoMo PIN to confirm.',
        "You'll receive an SMS from MTN. Take a screenshot — you'll attach it as proof on the next screen.",
      ],
    },
  },
  orange_money: {
    fr: {
      title: 'Payer avec Orange Money',
      code: '#150#',
      version: 1,
      steps: [
        'Composez #150# sur votre SIM Orange et appelez.',
        "Le menu Orange Money s'affiche. Choisissez 1 — Transfert d'argent.",
        "Choisissez l'option vers un numéro Orange Money.",
        'Entrez le numéro de {{name}} : {{number}} (collez-le).',
        'Entrez le montant : {{amount}}.',
        "Vérifiez l'écran : nom de {{name}} + montant correct.",
        'Confirmez avec votre code secret Orange Money.',
        "Vous recevez un SMS d'Orange. Faites une capture d'écran pour la joindre à l'étape suivante.",
      ],
    },
    en: {
      title: 'Pay with Orange Money',
      code: '#150#',
      version: 1,
      steps: [
        'Dial #150# on your Orange SIM and call.',
        'The Orange Money menu appears. Choose 1 — Transfer money.',
        'Choose the option to an Orange Money number.',
        "Enter {{name}}'s number: {{number}} (paste it).",
        'Enter the amount: {{amount}}.',
        "Check the screen: {{name}}'s name + the correct amount.",
        'Confirm with your Orange Money secret code.',
        "You'll receive an SMS from Orange. Take a screenshot to attach on the next screen.",
      ],
    },
  },
};

const cacheKey = (method: UssdMethod, language: UssdLanguage) =>
  `njangi-ussd-${method}-${language}`;

export function interpolateUssdStep(
  step: string,
  vars: { name: string; number: string; amount: string; reference: string }
): string {
  return step
    .replaceAll('{{name}}', vars.name)
    .replaceAll('{{number}}', vars.number)
    .replaceAll('{{amount}}', vars.amount)
    .replaceAll('{{reference}}', vars.reference);
}

/**
 * Bundled-or-cached immediately, upgraded to the fetched copy when its
 * `version` is newer (which also refreshes the cache). Never returns
 * nothing — the bundled tier is the floor.
 */
export function useUssdContent(
  method: UssdMethod,
  language: UssdLanguage
): UssdInstructionSet {
  const bundled = BUNDLED_USSD_CONTENT[method][language];
  const [cached, setCached] = useState<UssdInstructionSet | null>(null);
  const { isAuthenticated } = useConvexAuth();
  const fetched = useQuery(
    api.ussdContent.getUssdContent,
    isAuthenticated ? { method, language } : ('skip' as const)
  );

  useEffect(() => {
    let live = true;
    void AsyncStorage.getItem(cacheKey(method, language)).then((raw) => {
      if (!live || !raw) return;
      try {
        setCached(JSON.parse(raw) as UssdInstructionSet);
      } catch {
        // corrupt cache — bundled tier covers it
      }
    });
    return () => {
      live = false;
    };
  }, [method, language]);

  useEffect(() => {
    if (fetched && fetched.version > (cached?.version ?? bundled.version)) {
      const next: UssdInstructionSet = {
        title: fetched.title,
        code: bundled.code, // service code is never remotely overridable (04 c5)
        steps: fetched.steps,
        version: fetched.version,
      };
      setCached(next);
      void AsyncStorage.setItem(cacheKey(method, language), JSON.stringify(next));
    }
  }, [fetched, cached, bundled, method, language]);

  return useMemo(() => {
    const candidates = [bundled, cached, fetched ? { ...fetched, code: bundled.code } : null];
    return candidates
      .filter((c): c is UssdInstructionSet => c !== null && c !== undefined)
      .reduce((best, c) => (c.version > best.version ? c : best));
  }, [bundled, cached, fetched]);
}
