/**
 * Content pictograms for spending bags and money states. One file per name
 * in src/components/pictograms/; render them through `Pictogram`.
 */
export const PICTOGRAM_NAMES = [
  'ration',
  'transport',
  'famille',
  'credit',
  'eglise',
  'deuil',
  'plusieurs',
  'salaire',
  'vente',
  'njangi',
  'cadeau',
  'autre',
  'achat',
  'retrait',
  'envoi',
  'inconnu',
  'cash',
  'soir',
  'alerte',
] as const;

export type PictogramName = (typeof PICTOGRAM_NAMES)[number];
