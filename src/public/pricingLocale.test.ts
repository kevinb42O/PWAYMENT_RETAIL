import { describe, expect, it } from 'vitest';
import { PLAN_CATALOG, PLAN_COMPARISON_GROUPS } from '../billing/planCatalog';
import { translatePublicText } from './publicLocale';

const tr = (value: string, locale: 'fr' | 'en') => translatePublicText(value, locale);

describe('public pricing translations', () => {
  it('renders the complete French comparison matrix with reviewed terminology', () => {
    const matrix = PLAN_COMPARISON_GROUPS.flatMap((group) => [
      tr(group.category, 'fr'),
      ...group.rows.flatMap((row) => [tr(row.label, 'fr'), tr(row.basic, 'fr'), tr(row.pro, 'fr'), tr(row.enterprise, 'fr')]),
    ]);

    expect(matrix).toEqual([
      'Logiciel de caisse et compatibilité',
      'Écrans de caisse inclus dans le logiciel', '1', '1', 'Selon le contrat',
      'Connexion d’une imprimante et d’un lecteur de codes-barres', 'Basic', 'Étendue', 'Étendue',
      'Connexion d’un terminal de paiement, d’une balance et d’un tiroir-caisse', '—', 'Selon la compatibilité du matériel', 'Selon le contrat',
      'Connexion d’un écran client', '—', '1 par écran de caisse', 'Selon le contrat',
      'Produits et stock',
      'Produits actifs', '250', 'Illimité', 'Illimité',
      'Catégories principales', '5', 'Illimité', 'Illimité',
      'Étiquettes code-barres Dymo/Zebra', '—', 'Inclus', 'Inclus',
      'Prévisions de stock par IA', '—', '—', 'Inclus',
      'Commandes fournisseurs et réceptions', '—', '—', 'Inclus',
      'Clients et ServiceDesk',
      'CRM, fidélité et VIP', '—', 'Inclus', 'Inclus',
      'Émission et rechargement de cartes-cadeaux', '—', 'Inclus', 'Inclus',
      'Dossiers de réparation actifs', '—', 'Max. 50', 'Illimité',
      'Prise en charge des photos, SMS et attribution au technicien', '—', '—', 'Inclus',
      'Boutique en ligne et intégrations',
      'Boutique en ligne PWAYMENT', '—', '1 boutique en ligne', 'Plusieurs boutiques en ligne',
      'Comptabilité et Peppol', '—', 'Selon disponibilité du connecteur', 'Inclus / sur mesure',
      'REST API & webhooks', '—', '—', 'Inclus',
      'Équipe, analyses et contrôle',
      'Historique complet des transactions', '30 jours', 'Inclus', 'Inclus',
      'Analyses des ventes, des marges et des clients', '—', 'Inclus', 'Inclus',
      'Planning du personnel, heures et congés', '—', '—', 'Inclus',
      'Consultation et export complets du journal d’audit', '—', '—', 'Inclus',
      'Multi-établissements et transferts', '—', '—', 'Inclus',
    ]);
  });

  it('keeps all French plan-card copy free of known machine-translation failures', () => {
    const planCopy = Object.values(PLAN_CATALOG).flatMap((plan) => [
      plan.publicName,
      plan.audience,
      plan.cta,
      ...plan.features,
    ]).map((value) => tr(value, 'fr')).join('\n');

    expect(planCopy).not.toMatch(/Gallus|Détail Professional|AAI|mammaires|Inlimité|Fililial|Cople|loyauté/i);
    expect(tr('—', 'fr')).toBe('—');
    expect(tr('—', 'en')).toBe('—');
  });

  it('uses reviewed French copy throughout the configurator and pricing details', () => {
    expect([
      tr('Breid uit wanneer je winkel dat vraagt.', 'fr'),
      tr('Extra Enterprise-filiaal', 'fr'),
      tr('ServiceDesk SMS-bundel', 'fr'),
      tr('Stel je testopstelling samen.', 'fr'),
      tr('Extra filialen', 'fr'),
      tr('SMS-bundels van 200', 'fr'),
      tr('maandelijks opzegbare softwareprijs', 'fr'),
      tr('Geen verrassingen in de kleine letters.', 'fr'),
    ]).toEqual([
      'Ajoutez des capacités lorsque votre commerce en a besoin.',
      'Établissement Enterprise supplémentaire',
      'Pack SMS ServiceDesk',
      'Configurez votre installation d’essai.',
      'Établissements supplémentaires',
      'Packs de 200 SMS',
      'avec facturation mensuelle du logiciel',
      'Aucune surprise dans les petites lignes.',
    ]);
  });
});
