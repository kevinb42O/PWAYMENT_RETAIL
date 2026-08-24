import englishMessages from './locales/en.json';
import frenchMessages from './locales/fr.json';
import editorialOverrides from './locales/overrides.json';

export type PublicLocale = 'nl' | 'fr' | 'en';

export const PUBLIC_LOCALES: PublicLocale[] = ['nl', 'fr', 'en'];

export const PUBLIC_LOCALE_INFO: Record<PublicLocale, { label: string; shortLabel: string; htmlLang: string; hreflang: string; ogLocale: string }> = {
  nl: { label: 'Nederlands', shortLabel: 'NL', htmlLang: 'nl-BE', hreflang: 'nl-BE', ogLocale: 'nl_BE' },
  fr: { label: 'Français', shortLabel: 'FR', htmlLang: 'fr-BE', hreflang: 'fr-BE', ogLocale: 'fr_BE' },
  en: { label: 'English', shortLabel: 'EN', htmlLang: 'en', hreflang: 'en', ogLocale: 'en_US' },
};

type MessageDictionary = Record<string, string>;

const dictionaries: Record<Exclude<PublicLocale, 'nl'>, MessageDictionary> = {
  fr: frenchMessages,
  en: englishMessages,
};

const NON_MARKETING_PREFIXES = ['/app', '/login', '/register', '/auth', '/admin', '/customer-display', '/service', '/shop', '/api'];

export const parsePublicPath = (pathname: string): { locale: PublicLocale; routePath: string } => {
  const normalized = pathname.replace(/\/+$/, '') || '/';
  const match = normalized.match(/^\/(fr|en)(?=\/|$)(.*)$/);
  if (!match) return { locale: 'nl', routePath: normalized };
  return { locale: match[1] as PublicLocale, routePath: match[2] || '/' };
};

export const localizedPublicPath = (routePath: string, locale: PublicLocale): string => {
  const { routePath: unprefixed } = parsePublicPath(routePath.split(/[?#]/, 1)[0] || '/');
  if (locale === 'nl') return unprefixed;
  return unprefixed === '/' ? `/${locale}` : `/${locale}${unprefixed}`;
};

export const localizedHref = (href: string, locale: PublicLocale): string => {
  if (!href.startsWith('/') || href.startsWith('//')) return href;
  const [pathAndQuery, hash = ''] = href.split('#', 2);
  const [path, query = ''] = pathAndQuery.split('?', 2);
  const { routePath } = parsePublicPath(path || '/');
  if (NON_MARKETING_PREFIXES.some((prefix) => routePath === prefix || routePath.startsWith(`${prefix}/`))) return href;
  const localized = localizedPublicPath(routePath, locale);
  return `${localized}${query ? `?${query}` : ''}${hash ? `#${hash}` : ''}`;
};

export const translatePublicText = (value: string, locale: PublicLocale): string => {
  if (locale === 'nl') return value;
  const override = (editorialOverrides as Record<string, Partial<Record<Exclude<PublicLocale, 'nl'>, string>>>)[value]?.[locale];
  if (override) return override;
  return dictionaries[locale][value] ?? value;
};

const preserveWhitespace = (source: string, translated: string) => {
  const leading = source.match(/^\s*/)?.[0] ?? '';
  const trailing = source.match(/\s*$/)?.[0] ?? '';
  return `${leading}${translated}${trailing}`;
};

const translateTextNode = (node: Text, locale: PublicLocale) => {
  const source = node.data;
  const key = source.trim();
  if (!key) return;
  const translated = translatePublicText(key, locale);
  if (translated !== key) node.data = preserveWhitespace(source, translated);
};

const translateElement = (element: Element, locale: PublicLocale) => {
  if (element instanceof HTMLAnchorElement) {
    const href = element.getAttribute('href');
    if (href && !element.hasAttribute('data-public-locale')) {
      const localized = localizedHref(href, locale);
      if (localized !== href) element.setAttribute('href', localized);
    }
  }
  for (const attribute of ['aria-label', 'placeholder', 'title', 'alt'] as const) {
    const source = element.getAttribute(attribute);
    if (!source) continue;
    const translated = translatePublicText(source, locale);
    if (translated !== source) element.setAttribute(attribute, translated);
  }
};

const translateSubtree = (root: Node, locale: PublicLocale) => {
  if (root.nodeType === Node.TEXT_NODE) translateTextNode(root as Text, locale);
  if (root.nodeType === Node.ELEMENT_NODE) translateElement(root as Element, locale);
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
  let node: Node | null;
  while ((node = walker.nextNode())) {
    if (node.nodeType === Node.TEXT_NODE) translateTextNode(node as Text, locale);
    else translateElement(node as Element, locale);
  }
};

export const localizePublicDom = (root: HTMLElement, locale: PublicLocale): (() => void) => {
  translateSubtree(root, locale);
  if (locale === 'nl') return () => undefined;

  const observer = new MutationObserver((mutations) => {
    observer.disconnect();
    for (const mutation of mutations) {
      if (mutation.type === 'characterData') translateTextNode(mutation.target as Text, locale);
      if (mutation.type === 'attributes') translateElement(mutation.target as Element, locale);
      for (const node of mutation.addedNodes) translateSubtree(node, locale);
    }
    observer.observe(root, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['href', 'aria-label', 'placeholder', 'title', 'alt'] });
  });
  observer.observe(root, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['href', 'aria-label', 'placeholder', 'title', 'alt'] });
  return () => observer.disconnect();
};
