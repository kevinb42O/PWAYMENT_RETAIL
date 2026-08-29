import registry from './public-site-registry.json';
import { localizedPublicPath, PUBLIC_LOCALE_INFO, PUBLIC_LOCALES, translatePublicText, type PublicLocale } from './publicLocale';

export interface PublicRouteMetadata {
  path: string;
  title: string;
  description: string;
  changefreq: string;
  priority: number;
  index?: boolean;
}

export const PUBLIC_ROUTE_REGISTRY = registry as PublicRouteMetadata[];
const PRIMARY_SITE_ORIGIN = 'https://www.pwayment.be';
const SHARE_IMAGE_URL = `${PRIMARY_SITE_ORIGIN}/og-pwayment-social-2026.jpg`;

const shareImageAlt: Record<PublicLocale, string> = {
  nl: 'PWAYMENT, powered by Pace — het retailplatform dat met je meewerkt',
  fr: 'PWAYMENT, propulsé par Pace — la plateforme retail qui travaille avec vous',
  en: 'PWAYMENT, powered by Pace — the retail platform that works with you',
};

const aliases: Record<string, string> = {
  '/compare': '/pricing',
};

const setMeta = (selector: string, attribute: 'name' | 'property', key: string, content: string) => {
  let element = document.head.querySelector<HTMLMetaElement>(selector);
  if (!element) {
    element = document.createElement('meta');
    element.setAttribute(attribute, key);
    document.head.appendChild(element);
  }
  element.content = content;
};

const setCanonical = (url: string) => {
  let link = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!link) {
    link = document.createElement('link');
    link.rel = 'canonical';
    document.head.appendChild(link);
  }
  link.href = url;
};

const setAlternate = (hreflang: string, url: string) => {
  let link = document.head.querySelector<HTMLLinkElement>(`link[rel="alternate"][hreflang="${hreflang}"]`);
  if (!link) {
    link = document.createElement('link');
    link.rel = 'alternate';
    link.hreflang = hreflang;
    document.head.appendChild(link);
  }
  link.href = url;
};

const routeLabel = (path: string, locale: PublicLocale = 'nl') => {
  if (path === '/') return 'Home';
  const metadata = PUBLIC_ROUTE_REGISTRY.find((item) => item.path === path);
  const label = metadata?.title.replace(/\s+[—·-]\s+PWAYMENT$/i, '') ?? path.split('/').filter(Boolean).pop()?.replaceAll('-', ' ') ?? 'Pagina';
  return translatePublicText(label, locale);
};

const organizationDescriptions: Record<PublicLocale, string> = {
  nl: 'Belgisch retailplatform voor kassa, voorraad, klanten en webshop, powered by contextuele begeleiding van Pace.',
  fr: 'Plateforme retail belge pour la caisse, le stock, les clients et la boutique en ligne, propulsée par l\u2019accompagnement contextuel de Pace.',
  en: 'Belgian retail platform for POS, inventory, customers and online sales, powered by Pace contextual guidance.',
};

const structuredDataFor = (metadata: PublicRouteMetadata, canonical: string, locale: PublicLocale) => {
  const language = PUBLIC_LOCALE_INFO[locale].htmlLang;
  const localizedHome = `${PRIMARY_SITE_ORIGIN}${localizedPublicPath('/', locale)}`;
  const organization = {
    '@type': 'Organization',
    '@id': `${PRIMARY_SITE_ORIGIN}/#organization`,
    name: 'PWAYMENT',
    url: `${PRIMARY_SITE_ORIGIN}/`,
    logo: `${PRIMARY_SITE_ORIGIN}/branding/PWAYMENTLOGOFINAL.png`,
    image: SHARE_IMAGE_URL,
    description: organizationDescriptions[locale],
    areaServed: { '@type': 'Country', name: 'Belgium' },
  };
  const breadcrumb = {
    '@type': 'BreadcrumbList',
    itemListElement: metadata.path === '/'
      ? [{ '@type': 'ListItem', position: 1, name: 'Home', item: localizedHome }]
      : [
          { '@type': 'ListItem', position: 1, name: 'Home', item: localizedHome },
          { '@type': 'ListItem', position: 2, name: routeLabel(metadata.path, locale), item: canonical },
        ],
  };
  const page = metadata.path.startsWith('/guides/')
    ? {
        '@type': 'Article',
        headline: routeLabel(metadata.path, locale),
        description: metadata.description,
        inLanguage: language,
        mainEntityOfPage: canonical,
        publisher: { '@id': `${PRIMARY_SITE_ORIGIN}/#organization` },
      }
    : {
        '@type': 'WebPage',
        name: metadata.title,
        description: metadata.description,
        url: canonical,
        inLanguage: language,
        isPartOf: { '@id': `${PRIMARY_SITE_ORIGIN}/#website` },
      };

  return {
    '@context': 'https://schema.org',
    '@graph': [
      organization,
      { '@type': 'WebSite', '@id': `${PRIMARY_SITE_ORIGIN}/#website`, name: 'PWAYMENT, powered by Pace', alternateName: 'PWAYMENT', url: localizedHome, inLanguage: language, publisher: { '@id': `${PRIMARY_SITE_ORIGIN}/#organization` } },
      ...(metadata.path === '/' || metadata.path === '/product' || metadata.path === '/pos' || metadata.path === '/pace' ? [{
        '@type': 'SoftwareApplication',
        '@id': `${PRIMARY_SITE_ORIGIN}/#software`,
        name: 'PWAYMENT, powered by Pace',
        applicationCategory: 'BusinessApplication',
        applicationSubCategory: 'Point of Sale and retail management software',
        operatingSystem: 'Web',
        description: metadata.description,
        url: canonical,
        provider: { '@id': `${PRIMARY_SITE_ORIGIN}/#organization` },
        areaServed: { '@type': 'Country', name: 'Belgium' },
      }] : []),
      page,
      breadcrumb,
    ],
  };
};

export const metadataForPath = (pathname: string): PublicRouteMetadata => {
  const normalized = pathname.replace(/\/$/, '') || '/';
  const resolved = aliases[normalized] ?? normalized;
  return PUBLIC_ROUTE_REGISTRY.find((item) => item.path === resolved) ?? {
    path: resolved,
    title: 'PWAYMENT — Retail intelligence',
    description: 'PWAYMENT verbindt kassa, voorraad, klanten, webshop en retail intelligence voor Belgische winkels.',
    changefreq: 'monthly',
    priority: 0.4,
    index: false,
  };
};

export const applyRouteSeo = (pathname: string, locale: PublicLocale = 'nl') => {
  const sourceMetadata = metadataForPath(pathname);
  const metadata = {
    ...sourceMetadata,
    title: translatePublicText(sourceMetadata.title, locale),
    description: translatePublicText(sourceMetadata.description, locale),
  };
  const canonicalPath = localizedPublicPath(metadata.path, locale);
  const canonical = `${PRIMARY_SITE_ORIGIN}${canonicalPath === '/' ? '/' : canonicalPath}`;
  const shareImage = SHARE_IMAGE_URL;

  document.documentElement.lang = PUBLIC_LOCALE_INFO[locale].htmlLang;
  document.title = metadata.title;
  setMeta('meta[name="description"]', 'name', 'description', metadata.description);
  setMeta('meta[property="og:type"]', 'property', 'og:type', metadata.path.startsWith('/guides/') ? 'article' : 'website');
  setMeta('meta[property="og:title"]', 'property', 'og:title', metadata.title);
  setMeta('meta[property="og:description"]', 'property', 'og:description', metadata.description);
  setMeta('meta[property="og:url"]', 'property', 'og:url', canonical);
  setMeta('meta[property="og:image"]', 'property', 'og:image', shareImage);
  setMeta('meta[property="og:image:secure_url"]', 'property', 'og:image:secure_url', shareImage);
  setMeta('meta[property="og:image:type"]', 'property', 'og:image:type', 'image/jpeg');
  setMeta('meta[property="og:image:width"]', 'property', 'og:image:width', '1200');
  setMeta('meta[property="og:image:height"]', 'property', 'og:image:height', '630');
  setMeta('meta[property="og:image:alt"]', 'property', 'og:image:alt', shareImageAlt[locale]);
  setMeta('meta[property="og:locale"]', 'property', 'og:locale', PUBLIC_LOCALE_INFO[locale].ogLocale);
  setMeta('meta[name="twitter:card"]', 'name', 'twitter:card', 'summary_large_image');
  setMeta('meta[name="twitter:title"]', 'name', 'twitter:title', metadata.title);
  setMeta('meta[name="twitter:description"]', 'name', 'twitter:description', metadata.description);
  setMeta('meta[name="twitter:image"]', 'name', 'twitter:image', shareImage);
  setMeta('meta[name="twitter:image:alt"]', 'name', 'twitter:image:alt', shareImageAlt[locale]);
  setMeta('meta[name="robots"]', 'name', 'robots', metadata.index === false ? 'noindex, nofollow' : 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1');
  setCanonical(canonical);
  for (const candidate of PUBLIC_LOCALES) {
    setAlternate(PUBLIC_LOCALE_INFO[candidate].hreflang, `${PRIMARY_SITE_ORIGIN}${localizedPublicPath(metadata.path, candidate)}`);
  }
  setAlternate('x-default', `${PRIMARY_SITE_ORIGIN}${localizedPublicPath(metadata.path, 'nl')}`);

  let script = document.head.querySelector<HTMLScriptElement>('script[data-pwayment-structured-data]');
  if (!script) {
    script = document.createElement('script');
    script.type = 'application/ld+json';
    script.dataset.pwaymentStructuredData = 'true';
    document.head.appendChild(script);
  }
  script.textContent = JSON.stringify(structuredDataFor(metadata, canonical, locale));
};
