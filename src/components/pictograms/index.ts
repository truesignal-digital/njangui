/**
 * Placeholder art until a custom pictogram set is commissioned. Each path is
 * copied unchanged from the 24 px Material Symbols Outlined SVG (weight 400,
 * fill 0, grade 0) published by Google:
 *   https://github.com/google/material-design-icons (symbols/web/<glyph>)
 *   https://fonts.gstatic.com/s/i/short-term/release/materialsymbolsoutlined/<glyph>/default/24px.svg
 * Copyright Google LLC, licensed under the Apache License, Version 2.0:
 *   https://www.apache.org/licenses/LICENSE-2.0
 * Each file names its source glyph. To swap in the drawn set, replace the
 * files' paths and viewBox; call sites only use `Pictogram`.
 */
import type { ComponentType } from 'react';

import type { PictogramName } from '@/lib/pictograms';

import { AchatPictogram } from './achat';
import { AlertePictogram } from './alerte';
import { AutrePictogram } from './autre';
import { CadeauPictogram } from './cadeau';
import { CashPictogram } from './cash';
import { CreditPictogram } from './credit';
import { DeuilPictogram } from './deuil';
import { EglisePictogram } from './eglise';
import { EnvoiPictogram } from './envoi';
import { FamillePictogram } from './famille';
import { InconnuPictogram } from './inconnu';
import { NjangiPictogram } from './njangi';
import { PlusieursPictogram } from './plusieurs';
import { RationPictogram } from './ration';
import { RetraitPictogram } from './retrait';
import { SalairePictogram } from './salaire';
import { SoirPictogram } from './soir';
import { TransportPictogram } from './transport';
import { VentePictogram } from './vente';
import type { PictogramArtProps } from './types';

export type { PictogramArtProps } from './types';

export const PICTOGRAM_ART = {
  ration: RationPictogram,
  transport: TransportPictogram,
  famille: FamillePictogram,
  credit: CreditPictogram,
  eglise: EglisePictogram,
  deuil: DeuilPictogram,
  plusieurs: PlusieursPictogram,
  salaire: SalairePictogram,
  vente: VentePictogram,
  njangi: NjangiPictogram,
  cadeau: CadeauPictogram,
  autre: AutrePictogram,
  achat: AchatPictogram,
  retrait: RetraitPictogram,
  envoi: EnvoiPictogram,
  inconnu: InconnuPictogram,
  cash: CashPictogram,
  soir: SoirPictogram,
  alerte: AlertePictogram,
} satisfies Record<PictogramName, ComponentType<PictogramArtProps>>;
