import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const origin = 'https://www.pwayment.be';
const routes = JSON.parse(await readFile(path.join(root, 'src/public/public-site-registry.json'), 'utf8'));
const shell = await readFile(path.join(root, 'dist/index.html'), 'utf8');

const escapeHtml = (value) => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;');

const labelFor = (route) => route.title
  .replace(/\s+[|—·-]\s+PWAYMENT$/i, '')
  .replace(/^PWAYMENT\s+/, '')
  .trim();

const relatedRoutes = (route) => routes
  .filter((candidate) => candidate.index !== false && candidate.path !== route.path)
  .sort((a, b) => Math.abs(a.priority - route.priority) - Math.abs(b.priority - route.priority))
  .slice(0, 6);

const structuredData = (route, canonical) => ({
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      '@id': `${origin}/#organization`,
      name: 'PWAYMENT',
      url: `${origin}/`,
      logo: `${origin}/branding/PWAYMENTLOGOFINAL.png`,
      image: `${origin}/og-website.png`,
      description: 'Belgisch retailplatform voor kassa, voorraad, klanten, webshop en retail intelligence.',
      areaServed: { '@type': 'Country', name: 'Belgium' },
    },
    {
      '@type': 'WebSite',
      '@id': `${origin}/#website`,
      name: 'PWAYMENT',
      url: `${origin}/`,
      inLanguage: 'nl-BE',
      publisher: { '@id': `${origin}/#organization` },
    },
    {
      '@type': route.path.startsWith('/guides/') ? 'Article' : 'WebPage',
      '@id': `${canonical}#webpage`,
      name: route.title,
      headline: labelFor(route),
      description: route.description,
      url: canonical,
      inLanguage: 'nl-BE',
      isPartOf: { '@id': `${origin}/#website` },
      publisher: { '@id': `${origin}/#organization` },
    },
    {
      '@type': 'BreadcrumbList',
      itemListElement: route.path === '/' ? [
        { '@type': 'ListItem', position: 1, name: 'Home', item: `${origin}/` },
      ] : [
        { '@type': 'ListItem', position: 1, name: 'Home', item: `${origin}/` },
        { '@type': 'ListItem', position: 2, name: labelFor(route), item: canonical },
      ],
    },
    ...(['/','/product','/pos'].includes(route.path) ? [{
      '@type': 'SoftwareApplication',
      '@id': `${origin}/#software`,
      name: 'PWAYMENT',
      applicationCategory: 'BusinessApplication',
      applicationSubCategory: 'Point of Sale and retail management software',
      operatingSystem: 'Web',
      description: route.description,
      url: canonical,
      provider: { '@id': `${origin}/#organization` },
      areaServed: { '@type': 'Country', name: 'Belgium' },
    }] : []),
  ],
});

const renderBody = (route) => {
  const links = relatedRoutes(route)
    .map((related) => `<li><a href="${escapeHtml(related.path)}">${escapeHtml(labelFor(related))}</a></li>`)
    .join('');
  return `<div id="root"><main><header><a href="/" aria-label="PWAYMENT home">PWAYMENT</a><nav aria-label="Hoofdnavigatie"><a href="/pos">Kassasysteem</a> <a href="/inventory">Voorraad</a> <a href="/insights">Retail intelligence</a> <a href="/pricing">Prijzen</a></nav></header><article><h1>${escapeHtml(labelFor(route))}</h1><p>${escapeHtml(route.description)}</p><h2>Alles voor moderne Belgische retail</h2><p>PWAYMENT brengt kassa, betalingen, producten, winkelvoorraad, klantbeheer, webshop en rapportage samen. Zo werkt je team vanuit één betrouwbare bron en hou je als retailer overzicht over de volledige winkeloperatie.</p><p><a href="/demo">Plan een persoonlijke demo</a> of <a href="/register?plan=professional">start gratis met PWAYMENT</a>.</p><h2>Ontdek meer over PWAYMENT</h2><ul>${links}</ul></article></main></div>`;
};

const render = (route) => {
  const canonical = `${origin}${route.path === '/' ? '/' : route.path}`;
  const robots = route.index === false
    ? 'noindex, nofollow'
    : 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1';
  let html = shell
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${escapeHtml(route.title)}</title>`)
    .replace(/<link rel="canonical"[^>]*>/, `<link rel="canonical" href="${escapeHtml(canonical)}" />`)
    .replace(/<meta name="description"[^>]*>/, `<meta name="description" content="${escapeHtml(route.description)}" />`)
    .replace(/<meta name="robots"[^>]*>/, `<meta name="robots" content="${robots}" />`)
    .replace(/<meta property="og:type"[^>]*>/, `<meta property="og:type" content="${route.path.startsWith('/guides/') ? 'article' : 'website'}" />`)
    .replace(/<meta property="og:title"[^>]*>/, `<meta property="og:title" content="${escapeHtml(route.title)}" />`)
    .replace(/<meta property="og:description"[^>]*>/, `<meta property="og:description" content="${escapeHtml(route.description)}" />`)
    .replace(/<meta property="og:url"[^>]*>/, `<meta property="og:url" content="${escapeHtml(canonical)}" />`)
    .replace(/<meta name="twitter:title"[^>]*>/, `<meta name="twitter:title" content="${escapeHtml(route.title)}" />`)
    .replace(/<meta name="twitter:description"[^>]*>/, `<meta name="twitter:description" content="${escapeHtml(route.description)}" />`)
    .replace(/<div id="root">[\s\S]*?<\/div>/, renderBody(route));
  html = html.replace('</head>', `    <script type="application/ld+json" data-pwayment-structured-data>${JSON.stringify(structuredData(route, canonical)).replaceAll('<', '\\u003c')}</script>\n  </head>`);
  return html;
};

for (const route of routes) {
  const target = route.path === '/'
    ? path.join(root, 'dist/index.html')
    : path.join(root, 'dist', `${route.path.slice(1)}.html`);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, render(route), 'utf8');
}

console.log(`Pre-rendered ${routes.length} publieke routes met unieke HTML en structured data.`);
