import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const registryPath = path.join(root, 'src/public/public-site-registry.json');
const routes = JSON.parse(await readFile(registryPath, 'utf8'));
const origin = 'https://www.pwayment.be';
const today = new Date().toISOString().slice(0, 10);
const locales = {
  nl: { hreflang: 'nl-BE' },
  fr: { hreflang: 'fr-BE' },
  en: { hreflang: 'en' },
};
const localizedPath = (routePath, locale) => locale === 'nl' ? routePath : routePath === '/' ? `/${locale}` : `/${locale}${routePath}`;
const localizedUrl = (routePath, locale) => `${origin}${localizedPath(routePath, locale)}`;

const escapeXml = (value) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const sitemap = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
  ...routes.filter((route) => route.index !== false).flatMap((route) => Object.keys(locales).map((locale) => [
    '  <url>',
    `    <loc>${escapeXml(localizedUrl(route.path, locale))}</loc>`,
    ...Object.entries(locales).map(([candidate, info]) => `    <xhtml:link rel="alternate" hreflang="${info.hreflang}" href="${escapeXml(localizedUrl(route.path, candidate))}" />`),
    `    <xhtml:link rel="alternate" hreflang="x-default" href="${escapeXml(localizedUrl(route.path, 'nl'))}" />`,
    `    <lastmod>${today}</lastmod>`,
    `    <changefreq>${route.changefreq}</changefreq>`,
    `    <priority>${Number(route.priority).toFixed(2)}</priority>`,
    '  </url>',
  ].join('\n'))),
  '</urlset>',
  '',
].join('\n');

const robots = ['User-agent: *', 'Allow: /', 'Disallow: /api/', 'Disallow: /admin/', 'Disallow: /customer-display/', 'Disallow: /service/', '', `Sitemap: ${origin}/sitemap.xml`, ''].join('\n');

await writeFile(path.join(root, 'public/sitemap.xml'), sitemap, 'utf8');
await writeFile(path.join(root, 'public/robots.txt'), robots, 'utf8');

console.log(`Generated sitemap.xml and robots.txt for ${routes.filter((route) => route.index !== false).length * Object.keys(locales).length} indexeerbare taalroutes.`);
