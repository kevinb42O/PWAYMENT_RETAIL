import { Modifier } from '../types';

/** Catalog of common modifiers. Free-form modifiers can still be created in the UI. */
export const MODIFIER_CATALOG: Modifier[] = [
  { id: 'mod-assembly', label: 'Montage service', deltaCents: 1000 },
  { id: 'mod-grip-apply', label: 'Grip aanbrengen', deltaCents: 500 },
  { id: 'mod-bearing-install', label: 'Lagers plaatsen', deltaCents: 500 },
  { id: 'mod-truck-adjust', label: 'Trucks afstellen', deltaCents: 0 },
  { id: 'mod-gift-wrap', label: 'Cadeauverpakking', deltaCents: 200 },
  { id: 'mod-price-match', label: 'Prijsafspraak manager', deltaCents: 0 },
];

/** Common preset reasons for voids — Belgian fiscal best practice. */
export const VOID_REASONS = [
  'Verkeerd ingegeven',
  'Klant teruggetrokken',
  'Defect artikel',
  'Klacht / refund',
  'Stockcorrectie',
  'Andere',
] as const;

/** Preset reasons for cart-level discounts. */
export const DISCOUNT_REASONS = [
  'Manager goedkeuring',
  'Personeelskorting',
  'Team Korting',
  'Loyalty actie',
  'Klacht / goodwill',
  'Promotie',
  'Andere',
] as const;
