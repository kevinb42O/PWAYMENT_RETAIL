import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => readFile(path.join(root, relative), 'utf8');
const [registryText, publicSite, sitemap, robots, planCatalog, billingSettings, marketingMigration, englishText, frenchText, overridesText, localeSource, seoSource, prerenderSource, indexSource, legalContent, legalConfig, complianceMigration] = await Promise.all([
  read('src/public/public-site-registry.json'),
  read('src/public/PublicSite.tsx'),
  read('public/sitemap.xml'),
  read('public/robots.txt'),
  read('src/billing/planCatalog.ts'),
  read('src/components/BillingSettings.tsx'),
  read('supabase/migrations/20260812120000_public_marketing_leads.sql'),
  read('src/public/locales/en.json'),
  read('src/public/locales/fr.json'),
  read('src/public/locales/overrides.json'),
  read('src/public/publicLocale.ts'),
  read('src/public/siteSeo.ts'),
  read('scripts/prerender-public-site.mjs'),
  read('index.html'),
  read('src/public/legalContent.tsx'),
  read('src/config/legal.ts'),
  read('supabase/migrations/20260830193000_legal_acceptance_and_privacy_retention.sql'),
]);

const routes = JSON.parse(registryText);
const errors = [];
const paths = routes.map((route) => route.path);
const english = JSON.parse(englishText);
const french = JSON.parse(frenchText);
const overrides = JSON.parse(overridesText);
const localeVariants = [
  ['nl', 'nl-BE'],
  ['fr', 'fr-BE'],
  ['en', 'en'],
];
const localizedUrl = (routePath, locale) => `https://www.pwayment.be${locale === 'nl' ? routePath : routePath === '/' ? `/${locale}` : `/${locale}${routePath}`}`;

if (new Set(paths).size !== paths.length) errors.push('De publieke routeregistry bevat dubbele paden.');
for (const route of routes) {
  if (!route.title || !route.description || route.description.length < 50) errors.push(`${route.path}: metadata is onvolledig.`);
  for (const [locale, hreflang] of localeVariants) {
    const expectedUrl = localizedUrl(route.path, locale);
    if (route.index !== false && !sitemap.includes(`<loc>${expectedUrl}</loc>`)) errors.push(`${route.path} (${locale}): ontbreekt in sitemap.xml.`);
    if (route.index === false && sitemap.includes(`<loc>${expectedUrl}</loc>`)) errors.push(`${route.path} (${locale}): noindex-route staat toch in sitemap.xml.`);
    if (route.index !== false && !sitemap.includes(`hreflang="${hreflang}" href="${expectedUrl}"`)) errors.push(`${route.path} (${locale}): hreflang ontbreekt in sitemap.xml.`);
  }
  for (const source of [route.title, route.description]) {
    if (!english[source] || !french[source]) errors.push(`${route.path}: vertaalde metadata ontbreekt.`);
    if (!overrides[source]?.en || !overrides[source]?.fr) errors.push(`${route.path}: redactionele metadatareview ontbreekt.`);
  }
  if (route.path !== '/' && !publicSite.includes(`'${route.path}'`) && !publicSite.includes(`"${route.path}"`)) errors.push(`${route.path}: route komt niet voor in PublicSite.tsx.`);
}

if (!robots.includes('Sitemap: https://www.pwayment.be/sitemap.xml')) errors.push('robots.txt verwijst niet naar de canonieke sitemap.');
if (!sitemap.includes('xmlns:xhtml="http://www.w3.org/1999/xhtml"')) errors.push('De meertalige sitemap mist de xhtml-namespace.');
if (!localeSource.includes("type PublicLocale = 'nl' | 'fr' | 'en'")) errors.push('De publieke localelaag mist NL, FR of EN.');
if (!seoSource.includes("setAlternate('x-default'")) errors.push('Runtime-SEO mist x-default hreflang.');
if (!prerenderSource.includes('alternateTags(route.path)')) errors.push('Pre-rendering mist hreflang-tags.');
for (const requiredShareMeta of ['og:image:secure_url', 'og:image:type', 'og:image:width', 'og:image:height', 'og:image:alt', 'twitter:image:alt']) {
  if (!indexSource.includes(requiredShareMeta)) errors.push(`De HTML-shell mist social-previewmetadata: ${requiredShareMeta}.`);
  if (!seoSource.includes(requiredShareMeta)) errors.push(`Runtime-SEO mist social-previewmetadata: ${requiredShareMeta}.`);
}
for (const [locale, catalogText, catalog] of [['en', englishText, english], ['fr', frenchText, french]]) {
  if (Object.keys(catalog).length < 1100) errors.push(`${locale}: vertaalcatalogus is onverwacht onvolledig.`);
  for (const marker of ['ZZXPWTERM', 'reser TVA', 'PAYEMENT', 'PAYAGE', 'Gallus', 'Inlimité', 'Étendre', 'mammaires', 'AAI', 'Détail Professional']) {
    if (catalogText.includes(marker)) errors.push(`${locale}: ongeldige vertaalrest gevonden: ${marker}.`);
  }
}
if (!publicSite.includes("from '../billing/planCatalog'")) errors.push('De publieke prijzen gebruiken de centrale planCatalog niet.');
for (const amount of ['€ 55', '€ 69', '€ 119', '€ 149']) {
  if (publicSite.includes(amount)) errors.push(`PublicSite.tsx bevat opnieuw een los planbedrag: ${amount}.`);
  if (billingSettings.includes(amount)) errors.push(`BillingSettings.tsx bevat opnieuw een los planbedrag: ${amount}.`);
  if (!planCatalog.includes(amount.replace('€ ', '') + '00')) {
    // The catalog stores cents; this guards accidental deletion without parsing TypeScript.
    errors.push(`planCatalog.ts mist het verwachte bedrag ${amount}.`);
  }
}

const requiredDeepRoutes = ['/history-returns-invoices', '/daily-close-reporting', '/purchasing-suppliers', '/team-permissions'];
for (const route of requiredDeepRoutes) {
  if (!paths.includes(route)) errors.push(`${route}: ontbreekt in de publieke routeregistry.`);
}

const knownNonMarketingRoutes = new Set(['/login', '/register']);
const literalHrefs = [...publicSite.matchAll(/href="(\/[^"]+)"/g)].map((match) => match[1].split('?')[0]);
for (const href of literalHrefs) {
  if (!paths.includes(href) && !knownNonMarketingRoutes.has(href)) errors.push(`${href}: interne link heeft geen geregistreerde publieke route.`);
}

const requiredGuides = ['/guides/retouren', '/guides/z-rapport', '/guides/voorraadprognose', '/guides/cadeaubonnen', '/guides/webshopvoorraad', '/guides/belgische-retailflow'];
for (const route of requiredGuides) {
  if (!paths.includes(route)) errors.push(`${route}: ontbreekt in de inhoudelijke P3-dekking.`);
}

if ([...publicSite.matchAll(/status: '(Actief|Pilot|Validatie)'/g)].length < 8) errors.push('De integratiestatusmatrix is onvolledig.');
for (const unsupportedClaim of ['99,9% SLA en 24/7', 'Worldline, CCV, SumUp, Viva en Verifone']) {
  if (publicSite.includes(unsupportedClaim) || planCatalog.includes(unsupportedClaim)) errors.push(`Onbewezen claim opnieuw gevonden: ${unsupportedClaim}.`);
}
for (const requiredStoragePrimitive of ['create table public.marketing_leads', 'submit_public_lead', 'create table public.marketing_events', 'submit_public_event']) {
  if (!marketingMigration.includes(requiredStoragePrimitive)) errors.push(`Publieke conversieopslag mist ${requiredStoragePrimitive}.`);
}
for (const requiredLegalPrimitive of ['Privacyverklaring', 'Algemene SaaS-voorwaarden', 'Verwerkersovereenkomst', 'Subverwerkers', 'Bewaartermijnen', 'E-facturatie en boekhouding']) {
  if (!legalContent.includes(requiredLegalPrimitive)) errors.push(`Juridische inhoud mist ${requiredLegalPrimitive}.`);
}
for (const requiredIdentityField of ['VITE_LEGAL_NAME', 'VITE_LEGAL_ADDRESS', 'VITE_LEGAL_ENTERPRISE_NUMBER', 'VITE_LEGAL_VAT_NUMBER', 'VITE_LEGAL_PHONE']) {
  if (!legalConfig.includes(requiredIdentityField)) errors.push(`Juridische configuratie mist ${requiredIdentityField}.`);
}
for (const requiredEvidencePrimitive of ['consent_version', 'consent_text', 'legal_acceptances', 'business_use_confirmed']) {
  if (!complianceMigration.includes(requiredEvidencePrimitive)) errors.push(`Compliance-opslag mist ${requiredEvidencePrimitive}.`);
}
if (publicSite.includes('Deze pagina is voorbereid als definitieve juridische bestemming')) errors.push('De publieke juridische placeholder is opnieuw aanwezig.');

if (errors.length) {
  console.error(['Public-sitecontrole mislukt:', ...errors.map((error) => `- ${error}`)].join('\n'));
  process.exit(1);
}

console.log(`Public-sitecontrole geslaagd voor ${routes.length} routes en één centrale prijscatalogus.`);
