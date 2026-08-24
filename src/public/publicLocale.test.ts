// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';
import {
  localizedHref,
  localizedPublicPath,
  localizePublicDom,
  parsePublicPath,
  translatePublicText,
} from './publicLocale';

describe('public locale routing', () => {
  it('parses Dutch, French and English public paths', () => {
    expect(parsePublicPath('/')).toEqual({ locale: 'nl', routePath: '/' });
    expect(parsePublicPath('/pricing/')).toEqual({ locale: 'nl', routePath: '/pricing' });
    expect(parsePublicPath('/fr')).toEqual({ locale: 'fr', routePath: '/' });
    expect(parsePublicPath('/fr/pricing/')).toEqual({ locale: 'fr', routePath: '/pricing' });
    expect(parsePublicPath('/en/guides/z-rapport')).toEqual({ locale: 'en', routePath: '/guides/z-rapport' });
  });

  it('builds stable locale paths without stacking prefixes', () => {
    expect(localizedPublicPath('/', 'nl')).toBe('/');
    expect(localizedPublicPath('/', 'fr')).toBe('/fr');
    expect(localizedPublicPath('/pricing', 'en')).toBe('/en/pricing');
    expect(localizedPublicPath('/fr/pricing', 'en')).toBe('/en/pricing');
    expect(localizedPublicPath('/en/pricing?cycle=yearly', 'nl')).toBe('/pricing');
  });

  it('localizes marketing links and leaves account or external links alone', () => {
    expect(localizedHref('', 'fr')).toBe('');
    expect(localizedHref('/pricing?cycle=yearly#plans', 'fr')).toBe('/fr/pricing?cycle=yearly#plans');
    expect(localizedHref('/pricing#plans', 'en')).toBe('/en/pricing#plans');
    expect(localizedHref('/pricing?cycle=yearly', 'en')).toBe('/en/pricing?cycle=yearly');
    expect(localizedHref('/en/pricing', 'fr')).toBe('/fr/pricing');
    expect(localizedHref('/login?return=/pricing', 'fr')).toBe('/login?return=/pricing');
    expect(localizedHref('/register', 'en')).toBe('/register');
    expect(localizedHref('/shop/example', 'fr')).toBe('/shop/example');
    expect(localizedHref('https://example.com', 'fr')).toBe('https://example.com');
    expect(localizedHref('//cdn.example.com/image.png', 'en')).toBe('//cdn.example.com/image.png');
  });
});

describe('public copy translation', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('prefers reviewed copy, falls back to the catalog and preserves Dutch', () => {
    expect(translatePublicText('Start gratis', 'nl')).toBe('Start gratis');
    expect(translatePublicText('Start gratis', 'en')).toBe('Start free');
    expect(translatePublicText('Start gratis', 'fr')).toBe('Commencez gratuitement');
    expect(translatePublicText('Pace', 'en')).toBe('Pace');
    expect(translatePublicText('/maand', 'en')).toBe('/month');
    expect(translatePublicText('Onbekende tekst', 'fr')).toBe('Onbekende tekst');
  });

  it('translates text, accessible attributes and marketing links in the DOM', () => {
    const root = document.createElement('div');
    root.innerHTML = '<a href="/pricing" aria-label="Prijzen"><img alt="PWAYMENT home" /></a><p>Start gratis</p><a data-public-locale="nl" href="/">NL</a>';
    document.body.appendChild(root);

    const stop = localizePublicDom(root, 'fr');
    expect(root.querySelector('p')?.textContent).toBe('Commencez gratuitement');
    expect(root.querySelector('a')?.getAttribute('href')).toBe('/fr/pricing');
    expect(root.querySelector('a')?.getAttribute('aria-label')).toBe('Tarifs');
    expect(root.querySelector('a[data-public-locale]')?.getAttribute('href')).toBe('/');
    stop();
  });

  it('translates content added after initial render and can be disabled for Dutch', async () => {
    const root = document.createElement('div');
    document.body.appendChild(root);
    const stop = localizePublicDom(root, 'en');
    const paragraph = document.createElement('p');
    paragraph.textContent = 'Start gratis';
    root.appendChild(paragraph);
    await new Promise((resolve) => window.setTimeout(resolve, 0));
    expect(paragraph.textContent).toBe('Start free');
    stop();

    const dutchRoot = document.createElement('div');
    dutchRoot.textContent = 'Start gratis';
    const stopDutch = localizePublicDom(dutchRoot, 'nl');
    expect(dutchRoot.textContent).toBe('Start gratis');
    expect(stopDutch()).toBeUndefined();
  });

  it('reacts to text and attribute mutations while ignoring empty text', async () => {
    const root = document.createElement('div');
    const link = document.createElement('a');
    const text = document.createTextNode('   ');
    link.href = '/pricing';
    link.appendChild(text);
    root.appendChild(link);
    document.body.appendChild(root);

    const stop = localizePublicDom(root, 'en');
    expect(text.data).toBe('   ');

    text.data = '  Start gratis  ';
    link.setAttribute('placeholder', 'Start gratis');
    link.setAttribute('title', 'Start gratis');
    link.setAttribute('alt', 'Start gratis');
    link.setAttribute('href', '/contact');
    await new Promise((resolve) => window.setTimeout(resolve, 0));

    expect(text.data).toBe('  Start free  ');
    expect(link.getAttribute('placeholder')).toBe('Start free');
    expect(link.getAttribute('title')).toBe('Start free');
    expect(link.getAttribute('alt')).toBe('Start free');
    expect(link.getAttribute('href')).toBe('/en/contact');
    stop();
  });
});
