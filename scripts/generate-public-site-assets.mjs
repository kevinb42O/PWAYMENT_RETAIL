import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const registryPath = path.join(root, 'src/public/public-site-registry.json');
const routes = JSON.parse(await readFile(registryPath, 'utf8'));
const origin = 'https://www.pwayment.be';
const today = new Date().toISOString().slice(0, 10);

const escapeXml = (value) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const sitemap = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  ...routes.filter((route) => route.index !== false).map((route) => [
    '  <url>',
    `    <loc>${escapeXml(`${origin}${route.path === '/' ? '/' : route.path}`)}</loc>`,
    `    <lastmod>${today}</lastmod>`,
    `    <changefreq>${route.changefreq}</changefreq>`,
    `    <priority>${Number(route.priority).toFixed(2)}</priority>`,
    '  </url>',
  ].join('\n')),
  '</urlset>',
  '',
].join('\n');

const robots = ['User-agent: *', 'Allow: /', 'Disallow: /api/', 'Disallow: /admin/', 'Disallow: /customer-display/', 'Disallow: /service/', '', `Sitemap: ${origin}/sitemap.xml`, ''].join('\n');

await writeFile(path.join(root, 'public/sitemap.xml'), sitemap, 'utf8');
await writeFile(path.join(root, 'public/robots.txt'), robots, 'utf8');

console.log(`Generated sitemap.xml and robots.txt for ${routes.filter((route) => route.index !== false).length} indexeerbare routes.`);
