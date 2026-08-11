import registry from './public-site-registry.json';

export interface PublicRouteMetadata {
  path: string;
  title: string;
  description: string;
  changefreq: string;
  priority: number;
  index?: boolean;
}

export const PUBLIC_ROUTE_REGISTRY = registry as PublicRouteMetadata[];
const PRIMARY_SITE_ORIGIN = 'https://pwayment.be';

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

const routeLabel = (path: string) => {
  if (path === '/') return 'Home';
  const metadata = PUBLIC_ROUTE_REGISTRY.find((item) => item.path === path);
  return metadata?.title.replace(/\s+[—·-]\s+PWAYMENT$/i, '') ?? path.split('/').filter(Boolean).pop()?.replaceAll('-', ' ') ?? 'Pagina';
};

const structuredDataFor = (metadata: PublicRouteMetadata, canonical: string) => {
  const organization = {
    '@type': 'Organization',
    '@id': `${PRIMARY_SITE_ORIGIN}/#organization`,
    name: 'PWAYMENT',
    url: PRIMARY_SITE_ORIGIN,
    logo: `${PRIMARY_SITE_ORIGIN}/branding/pwayment-logo.svg`,
  };
  const breadcrumb = {
    '@type': 'BreadcrumbList',
    itemListElement: metadata.path === '/'
      ? [{ '@type': 'ListItem', position: 1, name: 'Home', item: PRIMARY_SITE_ORIGIN }]
      : [
          { '@type': 'ListItem', position: 1, name: 'Home', item: PRIMARY_SITE_ORIGIN },
          { '@type': 'ListItem', position: 2, name: routeLabel(metadata.path), item: canonical },
        ],
  };
  const page = metadata.path.startsWith('/guides/')
    ? {
        '@type': 'Article',
        headline: routeLabel(metadata.path),
        description: metadata.description,
        inLanguage: 'nl-BE',
        mainEntityOfPage: canonical,
        publisher: { '@id': `${PRIMARY_SITE_ORIGIN}/#organization` },
      }
    : {
        '@type': 'WebPage',
        name: metadata.title,
        description: metadata.description,
        url: canonical,
        inLanguage: 'nl-BE',
        isPartOf: { '@id': `${PRIMARY_SITE_ORIGIN}/#website` },
      };

  return {
    '@context': 'https://schema.org',
    '@graph': [
      organization,
      { '@type': 'WebSite', '@id': `${PRIMARY_SITE_ORIGIN}/#website`, name: 'PWAYMENT', url: PRIMARY_SITE_ORIGIN, inLanguage: 'nl-BE', publisher: { '@id': `${PRIMARY_SITE_ORIGIN}/#organization` } },
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
  };
};

export const applyRouteSeo = (pathname: string) => {
  const metadata = metadataForPath(pathname);
  const canonical = `${PRIMARY_SITE_ORIGIN}${metadata.path === '/' ? '' : metadata.path}`;
  const shareImage = `${PRIMARY_SITE_ORIGIN}/og-website.png`;

  document.title = metadata.title;
  setMeta('meta[name="description"]', 'name', 'description', metadata.description);
  setMeta('meta[property="og:type"]', 'property', 'og:type', metadata.path.startsWith('/guides/') ? 'article' : 'website');
  setMeta('meta[property="og:title"]', 'property', 'og:title', metadata.title);
  setMeta('meta[property="og:description"]', 'property', 'og:description', metadata.description);
  setMeta('meta[property="og:url"]', 'property', 'og:url', canonical);
  setMeta('meta[property="og:image"]', 'property', 'og:image', shareImage);
  setMeta('meta[name="twitter:card"]', 'name', 'twitter:card', 'summary_large_image');
  setMeta('meta[name="twitter:title"]', 'name', 'twitter:title', metadata.title);
  setMeta('meta[name="twitter:description"]', 'name', 'twitter:description', metadata.description);
  setMeta('meta[name="twitter:image"]', 'name', 'twitter:image', shareImage);
  setMeta('meta[name="robots"]', 'name', 'robots', metadata.index === false ? 'noindex, nofollow' : 'index, follow');
  setCanonical(canonical);

  let script = document.head.querySelector<HTMLScriptElement>('script[data-pwayment-structured-data]');
  if (!script) {
    script = document.createElement('script');
    script.type = 'application/ld+json';
    script.dataset.pwaymentStructuredData = 'true';
    document.head.appendChild(script);
  }
  script.textContent = JSON.stringify(structuredDataFor(metadata, canonical));
};
