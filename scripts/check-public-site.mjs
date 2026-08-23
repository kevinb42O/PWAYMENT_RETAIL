import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => readFile(path.join(root, relative), 'utf8');
const [registryText, publicSite, sitemap, robots, planCatalog, billingSettings, marketingMigration] = await Promise.all([
  read('src/public/public-site-registry.json'),
  read('src/public/PublicSite.tsx'),
  read('public/sitemap.xml'),
  read('public/robots.txt'),
  read('src/billing/planCatalog.ts'),
  read('src/components/BillingSettings.tsx'),
  read('supabase/migrations/20260812120000_public_marketing_leads.sql'),
]);

const routes = JSON.parse(registryText);
const errors = [];
const paths = routes.map((route) => route.path);

if (new Set(paths).size !== paths.length) errors.push('De publieke routeregistry bevat dubbele paden.');
for (const route of routes) {
  if (!route.title || !route.description || route.description.length < 50) errors.push(`${route.path}: metadata is onvolledig.`);
  const expectedUrl = `https://www.pwayment.be${route.path === '/' ? '' : route.path}`;
  if (route.index !== false && !sitemap.includes(`<loc>${expectedUrl}</loc>`)) errors.push(`${route.path}: ontbreekt in sitemap.xml.`);
  if (route.index === false && sitemap.includes(`<loc>${expectedUrl}</loc>`)) errors.push(`${route.path}: noindex-route staat toch in sitemap.xml.`);
  if (route.path !== '/' && !publicSite.includes(`'${route.path}'`) && !publicSite.includes(`"${route.path}"`)) errors.push(`${route.path}: route komt niet voor in PublicSite.tsx.`);
}

if (!robots.includes('Sitemap: https://www.pwayment.be/sitemap.xml')) errors.push('robots.txt verwijst niet naar de canonieke sitemap.');
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

if (errors.length) {
  console.error(['Public-sitecontrole mislukt:', ...errors.map((error) => `- ${error}`)].join('\n'));
  process.exit(1);
}

console.log(`Public-sitecontrole geslaagd voor ${routes.length} routes en één centrale prijscatalogus.`);
