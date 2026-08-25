// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';
import { applyRouteSeo, metadataForPath } from './siteSeo';

const meta = (selector: string) => document.head.querySelector<HTMLMetaElement>(selector)?.content;

describe('public route metadata', () => {
  afterEach(() => {
    document.head.innerHTML = '';
    document.documentElement.lang = '';
  });

  it('normalizes routes, resolves aliases and returns safe fallback metadata', () => {
    expect(metadataForPath('/').path).toBe('/');
    expect(metadataForPath('/pricing/').path).toBe('/pricing');
    expect(metadataForPath('/compare').path).toBe('/pricing');
    expect(metadataForPath('/missing-page')).toMatchObject({
      path: '/missing-page',
      index: false,
      priority: 0.4,
    });
  });

  it('creates complete localized SEO tags and guide structured data', () => {
    applyRouteSeo('/guides/z-rapport', 'en');

    expect(document.documentElement.lang).toBe('en');
    expect(document.title).toContain('Z report');
    expect(meta('meta[name="description"]')).toBeTruthy();
    expect(meta('meta[property="og:type"]')).toBe('article');
    expect(meta('meta[property="og:locale"]')).toBe('en_US');
    expect(meta('meta[property="og:image"]')).toBe('https://www.pwayment.be/og-pwayment-social-2026.jpg');
    expect(meta('meta[property="og:image:secure_url"]')).toBe('https://www.pwayment.be/og-pwayment-social-2026.jpg');
    expect(meta('meta[property="og:image:type"]')).toBe('image/jpeg');
    expect(meta('meta[property="og:image:width"]')).toBe('1200');
    expect(meta('meta[property="og:image:height"]')).toBe('630');
    expect(meta('meta[property="og:image:alt"]')).toBe('PWAYMENT — your store, one clear system');
    expect(meta('meta[name="twitter:image:alt"]')).toBe('PWAYMENT — your store, one clear system');
    expect(meta('meta[name="robots"]')).toContain('index, follow');
    expect(document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href).toBe('https://www.pwayment.be/en/guides/z-rapport');
    expect(document.head.querySelectorAll('link[rel="alternate"]')).toHaveLength(4);

    const graph = JSON.parse(document.head.querySelector<HTMLScriptElement>('script[data-pwayment-structured-data]')?.textContent ?? '{}')['@graph'];
    expect(graph.some((item: { '@type': string }) => item['@type'] === 'Article')).toBe(true);
    expect(graph.some((item: { '@type': string }) => item['@type'] === 'SoftwareApplication')).toBe(false);
    expect(graph.find((item: { '@type': string }) => item['@type'] === 'BreadcrumbList').itemListElement).toHaveLength(2);
  });

  it('updates existing tags for the localized homepage and includes software data', () => {
    applyRouteSeo('/pricing', 'nl');
    const originalDescription = document.head.querySelector('meta[name="description"]');
    const originalCanonical = document.head.querySelector('link[rel="canonical"]');
    const originalScript = document.head.querySelector('script[data-pwayment-structured-data]');

    applyRouteSeo('/', 'fr');

    expect(document.head.querySelector('meta[name="description"]')).toBe(originalDescription);
    expect(document.head.querySelector('link[rel="canonical"]')).toBe(originalCanonical);
    expect(document.head.querySelector('script[data-pwayment-structured-data]')).toBe(originalScript);
    expect(document.documentElement.lang).toBe('fr-BE');
    expect(document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href).toBe('https://www.pwayment.be/fr');
    expect(meta('meta[property="og:type"]')).toBe('website');

    const graph = JSON.parse(originalScript?.textContent ?? '{}')['@graph'];
    expect(graph.some((item: { '@type': string }) => item['@type'] === 'WebPage')).toBe(true);
    expect(graph.some((item: { '@type': string }) => item['@type'] === 'SoftwareApplication')).toBe(true);
    expect(graph.find((item: { '@type': string }) => item['@type'] === 'BreadcrumbList').itemListElement).toHaveLength(1);
  });

  it('marks unknown routes as noindex and uses their readable path label', () => {
    applyRouteSeo('/missing-page', 'fr');
    expect(meta('meta[name="robots"]')).toBe('noindex, nofollow');

    const graph = JSON.parse(document.head.querySelector<HTMLScriptElement>('script[data-pwayment-structured-data]')?.textContent ?? '{}')['@graph'];
    const breadcrumb = graph.find((item: { '@type': string }) => item['@type'] === 'BreadcrumbList');
    expect(breadcrumb.itemListElement[1].name).toBe('missing page');
  });
});
