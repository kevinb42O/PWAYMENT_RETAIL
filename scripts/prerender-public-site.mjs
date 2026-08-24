import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const origin = 'https://www.pwayment.be';
const routes = JSON.parse(await readFile(path.join(root, 'src/public/public-site-registry.json'), 'utf8'));
const shell = await readFile(path.join(root, 'dist/index.html'), 'utf8');
const dictionaries = {
  nl: {},
  fr: JSON.parse(await readFile(path.join(root, 'src/public/locales/fr.json'), 'utf8')),
  en: JSON.parse(await readFile(path.join(root, 'src/public/locales/en.json'), 'utf8')),
};
const editorialOverrides = JSON.parse(await readFile(path.join(root, 'src/public/locales/overrides.json'), 'utf8'));
const localeInfo = {
  nl: { htmlLang: 'nl-BE', hreflang: 'nl-BE', ogLocale: 'nl_BE' },
  fr: { htmlLang: 'fr-BE', hreflang: 'fr-BE', ogLocale: 'fr_BE' },
  en: { htmlLang: 'en', hreflang: 'en', ogLocale: 'en_US' },
};

const escapeHtml = (value) => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;');
const translate = (value, locale) => editorialOverrides[value]?.[locale] ?? dictionaries[locale][value] ?? value;
const localizedPath = (routePath, locale) => locale === 'nl' ? routePath : routePath === '/' ? `/${locale}` : `/${locale}${routePath}`;
const urlFor = (routePath, locale) => `${origin}${localizedPath(routePath, locale)}`;
const labelFor = (route, locale) => translate(route.title.replace(/\s+[|—·-]\s+PWAYMENT$/i, '').replace(/^PWAYMENT\s+/, '').trim(), locale);
const localizedRoute = (route, locale) => ({ ...route, title: translate(route.title, locale), description: translate(route.description, locale) });
const relatedRoutes = (route) => routes.filter((candidate) => candidate.index !== false && candidate.path !== route.path).sort((a, b) => Math.abs(a.priority - route.priority) - Math.abs(b.priority - route.priority)).slice(0, 6);

const organizationDescriptions = {
  nl: 'Belgisch retailplatform voor kassa, voorraad, klanten, webshop en retail intelligence.',
  fr: 'Plateforme belge de gestion retail pour la caisse, le stock, les clients, la boutique en ligne et l\u2019analyse commerciale.',
  en: 'Belgian retail platform for POS, inventory, customers, online sales and retail intelligence.',
};

const structuredData = (route, canonical, locale) => ({
  '@context': 'https://schema.org',
  '@graph': [
    { '@type': 'Organization', '@id': `${origin}/#organization`, name: 'PWAYMENT', url: `${origin}/`, logo: `${origin}/branding/PWAYMENTLOGOFINAL.png`, image: `${origin}/og-website.png`, description: organizationDescriptions[locale], areaServed: { '@type': 'Country', name: 'Belgium' } },
    { '@type': 'WebSite', '@id': `${origin}/#website`, name: 'PWAYMENT', url: urlFor('/', locale), inLanguage: localeInfo[locale].htmlLang, publisher: { '@id': `${origin}/#organization` } },
    { '@type': route.path.startsWith('/guides/') ? 'Article' : 'WebPage', '@id': `${canonical}#webpage`, name: route.title, headline: labelFor(route, locale), description: route.description, url: canonical, inLanguage: localeInfo[locale].htmlLang, isPartOf: { '@id': `${origin}/#website` }, publisher: { '@id': `${origin}/#organization` } },
    { '@type': 'BreadcrumbList', itemListElement: route.path === '/'
      ? [{ '@type': 'ListItem', position: 1, name: 'Home', item: urlFor('/', locale) }]
      : [{ '@type': 'ListItem', position: 1, name: 'Home', item: urlFor('/', locale) }, { '@type': 'ListItem', position: 2, name: labelFor(route, locale), item: canonical }] },
    ...(['/','/product','/pos'].includes(route.path) ? [{ '@type': 'SoftwareApplication', '@id': `${origin}/#software`, name: 'PWAYMENT', applicationCategory: 'BusinessApplication', applicationSubCategory: 'Point of Sale and retail management software', operatingSystem: 'Web', description: route.description, url: canonical, provider: { '@id': `${origin}/#organization` }, areaServed: { '@type': 'Country', name: 'Belgium' } }] : []),
  ],
});

const bodyCopy = {
  nl: { nav: 'Hoofdnavigatie', pos: 'Kassasysteem', inventory: 'Voorraad', pricing: 'Prijzen', heading: 'Alles voor moderne Belgische retail', body: 'PWAYMENT brengt kassa, betalingen, producten, winkelvoorraad, klantbeheer, webshop en rapportage samen. Zo werkt je team vanuit één betrouwbare bron en hou je als retailer overzicht over de volledige winkeloperatie.', demo: 'Plan een persoonlijke demo', start: 'start gratis met PWAYMENT', more: 'Ontdek meer over PWAYMENT', or: 'of' },
  fr: { nav: 'Navigation principale', pos: 'Système de caisse', inventory: 'Stock', pricing: 'Tarifs', heading: 'Tout pour le commerce belge moderne', body: 'PWAYMENT réunit la caisse, les paiements, les produits, le stock, les clients, la boutique en ligne et les rapports. Votre équipe travaille ainsi avec une source fiable et vous gardez une vue claire sur l\u2019ensemble de votre activité.', demo: 'Planifier une démo personnalisée', start: 'commencer gratuitement avec PWAYMENT', more: 'En savoir plus sur PWAYMENT', or: 'ou' },
  en: { nav: 'Main navigation', pos: 'POS system', inventory: 'Inventory', pricing: 'Pricing', heading: 'Everything modern Belgian retail needs', body: 'PWAYMENT brings together checkout, payments, products, inventory, customers, online sales and reporting. Your team works from one reliable source while you keep a clear view of the entire store operation.', demo: 'Book a personal demo', start: 'start free with PWAYMENT', more: 'Discover more about PWAYMENT', or: 'or' },
};

const renderBody = (route, locale) => {
  const copy = bodyCopy[locale];
  const links = relatedRoutes(route).map((related) => `<li><a href="${escapeHtml(localizedPath(related.path, locale))}">${escapeHtml(labelFor(related, locale))}</a></li>`).join('');
  return `<div id="root"><main><header><a href="${localizedPath('/', locale)}" aria-label="PWAYMENT home">PWAYMENT</a><nav aria-label="${copy.nav}"><a href="${localizedPath('/pos', locale)}">${copy.pos}</a> <a href="${localizedPath('/inventory', locale)}">${copy.inventory}</a> <a href="${localizedPath('/insights', locale)}">Retail intelligence</a> <a href="${localizedPath('/pricing', locale)}">${copy.pricing}</a></nav></header><article><h1>${escapeHtml(labelFor(route, locale))}</h1><p>${escapeHtml(route.description)}</p><h2>${copy.heading}</h2><p>${copy.body}</p><p><a href="${localizedPath('/demo', locale)}">${copy.demo}</a> ${copy.or} <a href="/register?plan=professional">${copy.start}</a>.</p><h2>${copy.more}</h2><ul>${links}</ul></article></main></div>`;
};

const alternateTags = (routePath) => [
  ...Object.entries(localeInfo).map(([locale, info]) => `<link rel="alternate" hreflang="${info.hreflang}" href="${urlFor(routePath, locale)}" />`),
  `<link rel="alternate" hreflang="x-default" href="${urlFor(routePath, 'nl')}" />`,
].join('\n    ');

const render = (sourceRoute, locale) => {
  const route = localizedRoute(sourceRoute, locale);
  const canonical = urlFor(route.path, locale);
  const robots = route.index === false ? 'noindex, nofollow' : 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1';
  let html = shell
    .replace(/<html lang="[^"]+">/, `<html lang="${localeInfo[locale].htmlLang}">`)
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${escapeHtml(route.title)}</title>`)
    .replace(/<link rel="canonical"[^>]*>/, `<link rel="canonical" href="${escapeHtml(canonical)}" />\n    ${alternateTags(route.path)}`)
    .replace(/<meta name="description"[^>]*>/, `<meta name="description" content="${escapeHtml(route.description)}" />`)
    .replace(/<meta name="robots"[^>]*>/, `<meta name="robots" content="${robots}" />`)
    .replace(/<meta property="og:type"[^>]*>/, `<meta property="og:type" content="${route.path.startsWith('/guides/') ? 'article' : 'website'}" />`)
    .replace(/<meta property="og:title"[^>]*>/, `<meta property="og:title" content="${escapeHtml(route.title)}" />`)
    .replace(/<meta property="og:description"[^>]*>/, `<meta property="og:description" content="${escapeHtml(route.description)}" />`)
    .replace(/<meta property="og:url"[^>]*>/, `<meta property="og:url" content="${escapeHtml(canonical)}" />`)
    .replace(/<meta property="og:locale"[^>]*>/, `<meta property="og:locale" content="${localeInfo[locale].ogLocale}" />`)
    .replace(/<meta name="twitter:title"[^>]*>/, `<meta name="twitter:title" content="${escapeHtml(route.title)}" />`)
    .replace(/<meta name="twitter:description"[^>]*>/, `<meta name="twitter:description" content="${escapeHtml(route.description)}" />`)
    .replace(/<div id="root">[\s\S]*?<\/div>/, renderBody(route, locale));
  html = html.replace('</head>', `    <script type="application/ld+json" data-pwayment-structured-data>${JSON.stringify(structuredData(route, canonical, locale)).replaceAll('<', '\\u003c')}</script>\n  </head>`);
  return html;
};

for (const locale of Object.keys(localeInfo)) {
  for (const route of routes) {
    const publicPath = localizedPath(route.path, locale);
    const target = publicPath === '/' ? path.join(root, 'dist/index.html') : path.join(root, 'dist', `${publicPath.slice(1)}.html`);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, render(route, locale), 'utf8');
  }
}

console.log(`Pre-rendered ${routes.length * Object.keys(localeInfo).length} publieke taalroutes met unieke HTML, hreflang en structured data.`);
