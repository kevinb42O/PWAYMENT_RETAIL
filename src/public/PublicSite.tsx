import React, { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  BarChart3,
  Barcode,
  Box,
  Check,
  ChevronDown,
  CircleCheck,
  CloudOff,
  CreditCard,
  Database,
  FileText,
  Gift,
  Globe2,
  Layers3,
  LockKeyhole,
  Menu,
  ReceiptText,
  RefreshCw,
  ScanLine,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Store,
  TrendingUp,
  Users,
  Webhook,
  X,
  type LucideIcon,
} from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import './public-site.css';

// These captures come from the current local application in presentation mode.
// Keep public marketing visuals independent from the retired presentation export.
const posImage = '/website/pwayment-pos-current.jpg';
const catalogImage = '/website/pwayment-catalog-current.jpg';
const insightsImage = '/website/pwayment-insights-performance-current.jpg';
const insightsProductImage = '/website/pwayment-insights-products-current.jpg';
const insightsInventoryImage = '/website/pwayment-insights-inventory-current.jpg';
const insightsCustomerImage = '/website/pwayment-insights-customers-current.jpg';
const customerImage = '/website/pwayment-customers-current.jpg';
const webshopImage = '/website/pwayment-webshop-current.jpg';
const integrationsImage = '/website/pwayment-integrations-current.jpg';
const plansImage = '/website/pwayment-plans-current.jpg';
const posFlowVideo = '/website/pwayment-pos-flow.mp4?v=3';
const posFlowPoster = '/website/pwayment-pos-flow-poster.jpg?v=3';

type BillingCycle = 'monthly' | 'yearly';

interface FeaturePageData {
  eyebrow: string;
  title: string;
  intro: string;
  image: string;
  imageAlt: string;
  proof: string;
  chapters: Array<{ number: string; title: string; body: string; points: string[] }>;
}

const featurePages: Record<string, FeaturePageData> = {
  '/product': {
    eyebrow: 'Het volledige retailplatform',
    title: 'Eén systeem dat de hele winkel begrijpt.',
    intro: 'PWAYMENT verbindt verkoop, voorraad, klanten, webshop, boekhouding en inzichten. Daardoor blijft elke beslissing gebaseerd op hetzelfde levende winkelbeeld.',
    image: posImage,
    imageAlt: 'PWAYMENT kassascherm met productcatalogus en winkelwagen',
    proof: 'Van eerste scan tot laatste dagafsluiting: één consistente retailflow.',
    chapters: [
      { number: '01', title: 'Verkoop zonder frictie', body: 'Een scanner-first kassa die snel voelt op laptop, tablet en vaste terminal.', points: ['Barcode, SKU of directe productkeuze', 'Cash, PIN, cadeaubon en gesplitste betaling', 'Kortingen, klantenkoppeling en duidelijke tickets'] },
      { number: '02', title: 'Beheer wat je verkoopt', body: 'Producten, varianten, voorraad, barcodes en leveranciers blijven samen.', points: ['Onbeperkte varianten in Professional', 'Min/max voorraad en besteladvies', 'CSV-migratie en barcode-etiketten'] },
      { number: '03', title: 'Zie wat aandacht verdient', body: 'PWAYMENT vertaalt transacties naar concrete beslissingen voor je winkel.', points: ['Omzet, marge en productprestaties', 'Stilstaande voorraad en seizoensritme', 'Klantherhaling en aankoopgedrag'] },
    ],
  },
  '/pos': {
    eyebrow: 'POS & betalingen',
    title: 'Snel wanneer het druk is. Duidelijk wanneer iets afwijkt.',
    intro: 'PWAYMENT is ontworpen rond het echte tempo van een winkelvloer: scannen, controleren, betalen en door. Zonder verborgen stappen of onrustige schermen.',
    image: posImage,
    imageAlt: 'De PWAYMENT scanner-first POS interface',
    proof: 'Scan-first bediening, offline continuïteit en een korte betaalflow.',
    chapters: [
      { number: '01', title: 'Scanner-first checkout', body: 'De zoekbalk herkent barcode, SKU en productnaam. Exacte scans gaan direct naar de winkelwagen.', points: ['WebUSB barcodescanners', 'Sneltoetsen en touchbediening', 'Voorraadcontrole tijdens verkoop'] },
      { number: '02', title: 'Elke gangbare betaling', body: 'Werk met cash, betaalterminals, cadeaubonnen en gesplitste betalingen vanuit één overzicht.', points: ['Worldline, CCV, SumUp, Viva en Verifone', 'Automatische bon en kassaladeflow', 'Retouren, correcties en managergoedkeuring'] },
      { number: '03', title: 'Van shift naar dagafsluiting', body: 'Open en sluit registers met een sluitende betalingsuitsplitsing en een controleerbare historie.', points: ['Kassatelling en verschillen', 'X- en Z-rapporten', 'Onveranderlijk auditspoor'] },
    ],
  },
  '/inventory': {
    eyebrow: 'Producten & voorraad',
    title: 'Voorraad die niet alleen telt, maar ook vertelt.',
    intro: 'Ken elk artikel, elke maat, elke barcode en elke beweging. PWAYMENT laat zien waar voorraad verkoopt, stilvalt of opnieuw besteld moet worden.',
    image: catalogImage,
    imageAlt: 'Het actuele PWAYMENT product- en catalogusbeheer',
    proof: 'Van productimport tot besteladvies en multi-store transfer.',
    chapters: [
      { number: '01', title: 'Een catalogus die retail aankan', body: 'Varianten, merken, leveranciers, inkoopprijs, verkoopprijs, btw, SKU en barcode horen bij elkaar.', points: ['Maten en kleuren', 'Bulkimport en -export', 'Dymo- en Zebra-labels'] },
      { number: '02', title: 'Live voorraadbeeld', body: 'Elke verkoop, online order, ontvangst en transfer werkt hetzelfde voorraadbeeld bij.', points: ['Voorraad per locatie', 'Minimum- en maximumsignalen', 'Interne transfers voor ketens'] },
      { number: '03', title: 'Koop slimmer in', body: 'Verkooptempo, levertijd, seizoen en marge voeden concrete bestelvoorstellen.', points: ['Stilstaande voorraad', '60-dagen prognose', 'Inkooporders en ontvangst'] },
    ],
  },
  '/insights': {
    eyebrow: 'Retail intelligence',
    title: 'Niet meer dashboards. Betere beslissingen.',
    intro: 'PWAYMENT wijst aan waar marge weglekt, welke voorraad cash vasthoudt en welke klanten terugkomen. Elk inzicht leidt naar een volgende actie.',
    image: insightsImage,
    imageAlt: 'PWAYMENT retail intelligence dashboard',
    proof: 'Omzet, marge, voorraad, klanten en seizoenen in één beslisomgeving.',
    chapters: [
      { number: '01', title: 'Vandaag weten wat telt', body: 'Open met actuele signalen, niet met een muur grafieken.', points: ['Afwijkingen en kansen', 'Vergelijkbare perioden', 'Acties uitstellen of afhandelen'] },
      { number: '02', title: 'Marge achter de omzet', body: 'Combineer verkoop met geregistreerde kostprijs om te begrijpen wat werkelijk bijdraagt.', points: ['Brutowinst per product en categorie', 'Kostprijsdekking zichtbaar', 'Kortings- en betaalmix'] },
      { number: '03', title: 'Ritme en herhaling', body: 'Zie seizoenpatronen, verkoopsnelheid en klantterugkeer zonder spreadsheets samen te voegen.', points: ['Seizoensprofielen', 'Tijd tot tweede aankoop', 'Gatewayproducten voor loyaliteit'] },
    ],
  },
  '/customers': {
    eyebrow: 'Klanten & loyaliteit',
    title: 'Herken goede klanten. Geef ze een reden om terug te komen.',
    intro: 'Bouw klantrelaties vanuit echte aankopen. Met profielen, bezoekhistorie, spaarregels, VIP-niveaus en cadeaubonnen die overal hetzelfde saldo tonen.',
    image: customerImage,
    imageAlt: 'PWAYMENT klantprofiel met aankoophistorie',
    proof: 'Loyaliteit als onderdeel van de verkoop, niet als los systeem.',
    chapters: [
      { number: '01', title: 'Een bruikbaar klantbeeld', body: 'Contactgegevens, voorkeuren en aankopen blijven overzichtelijk en toestemming blijft controleerbaar.', points: ['Snel koppelen aan verkoop', 'Aankoop- en retourhistorie', 'Notities en klantsegmenten'] },
      { number: '02', title: 'Loyaliteit die past', body: 'Bepaal punten, beloningen en VIP-niveaus op basis van hoe je winkel werkt.', points: ['Spaarmultipliers', 'VIP-niveaus en voordelen', 'Automatische saldo-opbouw'] },
      { number: '03', title: 'Cadeaubonnen zonder twijfel', body: 'Uitgifte, opwaardering, blokkering en gebruik komen samen in één live grootboek.', points: ['Fysiek en digitaal', 'Anoniem of aan klant gekoppeld', 'Live saldo op alle locaties'] },
    ],
  },
  '/webshop': {
    eyebrow: 'PWAYMENT Webshop',
    title: 'Je winkel stopt niet bij de voordeur.',
    intro: 'Publiceer je assortiment online, ontvang bestellingen en houd voorraad automatisch gelijk. PWAYMENT verbindt de winkelvloer en je storefront in één retailoperatie.',
    image: webshopImage,
    imageAlt: 'Het actuele PWAYMENT webshopbeheer met catalogusstatus',
    proof: 'Native storefront en live voorraad inbegrepen in Professional.',
    chapters: [
      { number: '01', title: 'Van catalogus naar storefront', body: 'Kies producten, beelden, beschrijvingen en uitgelichte items zonder dubbele invoer.', points: ['Eigen subdomein of custom domain', 'Responsive storefront', 'SEO- en merkbeheer'] },
      { number: '02', title: 'Bestellen zoals klanten willen', body: 'Bancontact, iDEAL, kaarten, Apple Pay, levering en afhalen werken in dezelfde orderflow.', points: ['Coupons en drempelbedragen', 'Afhalen in de winkel', 'Ordernotities en bevestiging'] },
      { number: '03', title: 'Eén voorraad voor elk kanaal', body: 'Online en fysieke verkoop reserveren en verlagen dezelfde voorraad.', points: ['Realtime catalogussync', 'Multi-storefront in Enterprise', 'Shopify/WooCommerce add-on'] },
    ],
  },
  '/integrations': {
    eyebrow: 'Koppelingen & API',
    title: 'PWAYMENT past in je bedrijf. Niet andersom.',
    intro: 'Verbind verkoopkanalen, leveranciers, boekhouding, betalingen en eigen processen met beheerde koppelingen, webhooks en een gedocumenteerde REST API.',
    image: integrationsImage,
    imageAlt: 'De actuele PWAYMENT Integration Hub met leveranciers, verkoopkanalen en API',
    proof: 'Beheerde connectors én open bouwblokken voor maatwerk.',
    chapters: [
      { number: '01', title: 'Commerce en leveranciers', body: 'Synchroniseer producten, voorraad, orders, klanten en inkoopdata in de richting die jij kiest.', points: ['Shopify en WooCommerce', 'REST, GraphQL en SFTP feeds', 'Mapping en synchronisatieschema’s'] },
      { number: '02', title: 'Boekhouding en Peppol', body: 'Boek dagontvangsten door, volg facturen en wissel gestructureerde e-facturen uit.', points: ['Exact Online en Octopus', 'Peppol verzenden en ontvangen', 'Z-journaal en betaalmethodes'] },
      { number: '03', title: 'API en webhooks', body: 'Bouw eigen workflows met veilige sleutels, observeerbare events en duidelijke limieten.', points: ['5.000 verzoeken/dag in Professional', 'Onbeperkt in Enterprise', 'Retries, signing en delivery logs'] },
    ],
  },
  '/hardware': {
    eyebrow: 'Hardware',
    title: 'Open software. Betrouwbare winkelhardware.',
    intro: 'Stel je werkplek samen met geteste printers, scanners, kassalades, weegschalen en betaalterminals. PWAYMENT begeleidt installatie en controle vanuit de app.',
    image: posImage,
    imageAlt: 'PWAYMENT POS ontworpen voor retailhardware',
    proof: 'Configureren, testen en problemen oplossen vanuit één hardwarecentrum.',
    chapters: [
      { number: '01', title: 'Print en scan', body: 'Werk met gangbare thermische printers en scanner-first bediening.', points: ['USB en Bluetooth printers', 'WebUSB scanners', '58 en 80 mm bonnen'] },
      { number: '02', title: 'Betalen', body: 'Koppel ondersteunde terminals en volg de betaalstatus direct bij de verkoop.', points: ['Worldline, CCV, SumUp', 'Viva en Verifone', 'Referentie en reconciliatie'] },
      { number: '03', title: 'De volledige balie', body: 'Automatiseer kassalade, labelprinter, weegschaal en bonafwerking.', points: ['Automatische lade-uitworp', 'Dymo en Zebra', 'Installatiewizard en testlog'] },
    ],
  },
  '/offline': {
    eyebrow: 'Offline-first',
    title: 'Een slechte verbinding hoeft geen slechte winkeldag te worden.',
    intro: 'De kritieke kassaflow blijft lokaal beschikbaar. Wanneer de verbinding terugkomt, synchroniseert PWAYMENT gecontroleerd en zichtbaar verder.',
    image: posImage,
    imageAlt: 'PWAYMENT kassa die offline kan blijven werken',
    proof: 'Verkopen blijven doorlopen; synchronisatie blijft controleerbaar.',
    chapters: [
      { number: '01', title: 'De winkel blijft verkopen', body: 'Catalogus, winkelwagen, klanten en lokale transacties blijven bruikbaar op een ingeschreven register.', points: ['Lokale operationele cache', 'Duidelijke offline status', 'Geen verloren winkelwagen'] },
      { number: '02', title: 'Veilige inhaalbeweging', body: 'Elke mutatie heeft een unieke identiteit en wordt idempotent verwerkt.', points: ['Geen dubbele verkoop bij retry', 'Wachtrij met foutisolatie', 'Conflictregels per datatype'] },
      { number: '03', title: 'Transparant herstel', body: 'Medewerkers zien wat wacht, synchroniseert of aandacht nodig heeft.', points: ['Registerstatus', 'Herstel zonder technische stappen', 'Audit van offline oorsprong'] },
    ],
  },
  '/security': {
    eyebrow: 'Veiligheid & vertrouwen',
    title: 'Bescherming die met je winkel meegroeit.',
    intro: 'PWAYMENT beveiligt accounts, apparaten, locaties en gegevens met sterke identiteit, tenantisolatie, auditlogging en gecontroleerde toegang.',
    image: insightsImage,
    imageAlt: 'PWAYMENT beveiligde beheeromgeving',
    proof: 'Minimale toegang, zichtbare controle en herstelbare bedrijfscontinuïteit.',
    chapters: [
      { number: '01', title: 'Sterke accountbeveiliging', body: 'E-mailverificatie, MFA, sessiebeheer en step-up controle beschermen gevoelige acties.', points: ['MFA en herstelcodes', 'Sessies en apparaten intrekken', 'Rate limiting en verdachte-loginmeldingen'] },
      { number: '02', title: 'Rollen die echt afdwingen', body: 'Eigenaar, manager en kassamedewerker krijgen alleen wat bij hun werk hoort.', points: ['Fijnmazige permissies', 'Manager-PIN voor risicohandelingen', 'Server-side autorisatie'] },
      { number: '03', title: 'Operationeel vertrouwen', body: 'Back-ups, hersteltests, incidentcommunicatie en auditsporen maken betrouwbaarheid aantoonbaar.', points: ['Versleuteling in transit en rust', 'Status- en incidenthistorie', 'Data-export en retentiecontrole'] },
    ],
  },
};

const solutionPages: Record<string, { title: string; intro: string; label: string; bullets: string[] }> = {
  '/solutions/independent-retail': { label: 'Onafhankelijke retail', title: 'Professionele controle, zonder een IT-afdeling.', intro: 'Voor winkels die snel willen verkopen, voorraad willen beheersen en elke dag met een helder beeld willen afsluiten.', bullets: ['Eén locatie en een korte installatie', 'Productimport en hardwarebegeleiding', 'Kassa, voorraad, klanten en inzichten samen'] },
  '/solutions/specialist-retail': { label: 'Speciaalzaken', title: 'Gebouwd voor assortimenten met diepte.', intro: 'Maten, kleuren, merken, leveranciers en adviesproducten vragen meer dan een eenvoudige artikelnaam.', bullets: ['Varianten, barcodes en labels', 'Marge en verkoopsnelheid per product', 'Loyaliteit voor terugkerende klanten'] },
  '/solutions/multi-location': { label: 'Enterprise & ketens', title: 'Elke winkel lokaal sterk. De keten centraal bestuurbaar.', intro: 'Verbind onbeperkte locaties en registers zonder lokale snelheid of centrale controle in te leveren.', bullets: ['Transfers, prijslijsten en promoties', 'Consolidated intelligence en audit', '99,9% SLA en 24/7 ondersteuning'] },
  '/solutions/accountants': { label: 'Accountants & partners', title: 'Schone winkeldata. Minder herstelwerk.', intro: 'Laat dagelijkse ontvangsten, btw, betaalmethodes en facturen gestructureerd doorstromen naar de boekhouding.', bullets: ['Peppol verzenden en ontvangen', 'Exact Online en Octopus', 'Z-journaal, exports en API'] },
};

const integrations = ['Worldline', 'CCV', 'SumUp', 'Viva', 'Verifone', 'Mollie', 'Shopify', 'WooCommerce', 'Exact', 'Octopus', 'Moneybird', 'Peppol'];

const faqs = [
  ['Werkt PWAYMENT zonder internet?', 'Ja. De kritieke kassaflow blijft werken op een ingeschreven register. Zodra de verbinding terugkomt, synchroniseert PWAYMENT gecontroleerd verder.'],
  ['Welke hardware kan ik gebruiken?', 'PWAYMENT ondersteunt geteste thermische printers, WebUSB-scanners, kassalades, labelprinters, weegschalen en terminals van onder andere Worldline, CCV, SumUp, Viva en Verifone.'],
  ['Kan ik mijn bestaande producten meenemen?', 'Ja. Je importeert producten, varianten, prijzen, barcodes en voorraad via een gecontroleerde CSV-migratie. Bij begeleide onboarding helpen we met mapping en controle.'],
  ['Is er een contractduur?', 'Basis is gratis. Professional en Enterprise kunnen maandelijks of jaarlijks worden gefactureerd. De jaarlijkse keuze geeft de aangegeven eurobesparing.'],
  ['Wat gebeurt er na de proefperiode?', 'PWAYMENT Basis blijft gratis. Je kunt Retail Professional 30 dagen gratis proberen. Daarna kies je of je Professional activeert; anders blijf je Basis gebruiken.'],
];

const motionEase = [0.22, 1, 0.36, 1] as const;
const revealViewport = { once: true, amount: 0.18 } as const;
const fadeUp = {
  hidden: { opacity: 0, y: 28 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.72, ease: motionEase } },
};
const stagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.09, delayChildren: 0.04 } },
};

const AnimatedPageHero = ({ eyebrow, title, intro, actions, className = '' }: { eyebrow: string; title: React.ReactNode; intro: string; actions?: React.ReactNode; className?: string }) => (
  <motion.section
    className={`pw-page-hero pw-shell ${className}`}
    initial="hidden"
    animate="visible"
    variants={stagger}
  >
    <motion.span className="pw-eyebrow" variants={fadeUp}>{eyebrow}</motion.span>
    <motion.h1 variants={fadeUp}>{title}</motion.h1>
    <motion.p variants={fadeUp}>{intro}</motion.p>
    {actions && <motion.div className="pw-page-actions" variants={fadeUp}>{actions}</motion.div>}
  </motion.section>
);

const routeTitle = (pathname: string) => {
  if (pathname === '/') return 'PWAYMENT — Je winkel. Eén helder systeem.';
  if (pathname === '/pricing') return 'Prijzen — PWAYMENT';
  if (pathname === '/demo') return 'Plan een demo — PWAYMENT';
  const feature = featurePages[pathname];
  if (feature) return `${feature.eyebrow} — PWAYMENT`;
  const solution = solutionPages[pathname];
  if (solution) return `${solution.label} — PWAYMENT`;
  return 'PWAYMENT — Retail intelligence';
};

const PublicSite: React.FC = () => {
  const path = window.location.pathname.replace(/\/$/, '') || '/';
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    document.documentElement.dataset.theme = 'light';
    document.documentElement.classList.add('theme-light');
    document.documentElement.classList.remove('theme-dark');
    document.documentElement.style.colorScheme = 'light';
    document.title = routeTitle(path);
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [path]);

  let page: React.ReactNode;
  if (path === '/') page = <HomePage />;
  else if (path === '/pricing' || path === '/compare') page = <PricingPage />;
  else if (path === '/demo' || path === '/contact') page = <ContactPage demo={path === '/demo'} />;
  else if (featurePages[path]) page = <FeaturePage data={featurePages[path]} />;
  else if (solutionPages[path]) page = <SolutionPage data={solutionPages[path]} />;
  else if (path === '/migrate') page = <MigrationPage />;
  else if (path === '/about') page = <AboutPage />;
  else if (path === '/resources' || path === '/customer-stories') page = <ResourcesPage stories={path === '/customer-stories'} />;
  else if (path.startsWith('/legal/')) page = <LegalPage type={path.split('/').pop() || 'privacy'} />;
  else page = <NotFoundPage />;

  return (
    <div className="pw-site">
      <a className="pw-skip" href="#main">Ga naar inhoud</a>
      <SiteHeader mobileOpen={mobileOpen} setMobileOpen={setMobileOpen} />
      <main id="main">{page}</main>
      <SiteFooter />
    </div>
  );
};

export const SiteHeader = ({ mobileOpen, setMobileOpen }: { mobileOpen: boolean; setMobileOpen: (value: boolean) => void }) => (
  <>
    <motion.header className="pw-header" initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .55, ease: motionEase }}>
      <div className="pw-header-inner">
        <a href="/" className="pw-logo" aria-label="PWAYMENT home">
          <img src="/branding/pwayment-logo.svg" alt="PWAYMENT" />
        </a>
        <nav className="pw-nav" aria-label="Hoofdnavigatie">
          <NavGroup label="Product" links={[
            ['/product', 'Overzicht', 'Alles in één retailflow'], ['/pos', 'POS & betalingen', 'Snel en betrouwbaar verkopen'], ['/inventory', 'Producten & voorraad', 'Van barcode tot besteladvies'], ['/insights', 'Inzichten', 'Van data naar actie'], ['/customers', 'Klanten & loyaliteit', 'Bouw duurzame relaties'], ['/webshop', 'Webshop', 'Fysiek en online verbonden'], ['/integrations', 'Integraties & API', 'Koppel je retailstack'],
          ]} />
          <NavGroup label="Oplossingen" links={[
            ['/solutions/independent-retail', 'Onafhankelijke retail', 'Professioneel zonder complexiteit'], ['/solutions/specialist-retail', 'Speciaalzaken', 'Varianten, merken en advies'], ['/solutions/multi-location', 'Enterprise & ketens', 'Centraal sturen, lokaal verkopen'], ['/solutions/accountants', 'Accountants & partners', 'Schone data en minder handwerk'],
          ]} />
          <a href="/pricing">Prijzen</a>
          <a href="/resources">Resources</a>
        </nav>
        <div className="pw-header-actions">
          <a href="/login" className="pw-login">Log in</a>
          <a href="/register" className="pw-button pw-button-dark pw-button-small">Start gratis <ArrowRight size={15} /></a>
        </div>
        <button className="pw-mobile-toggle" onClick={() => setMobileOpen(!mobileOpen)} aria-expanded={mobileOpen} aria-label="Navigatie openen">
          {mobileOpen ? <X /> : <Menu />}
        </button>
      </div>
    </motion.header>
    {mobileOpen && (
      <nav className="pw-mobile-nav" aria-label="Mobiele navigatie">
        <a href="/product">Product</a><a href="/pos">POS & betalingen</a><a href="/inventory">Voorraad</a><a href="/insights">Inzichten</a><a href="/customers">Klanten</a><a href="/webshop">Webshop</a><a href="/integrations">Integraties</a><a href="/pricing">Prijzen</a><a href="/resources">Resources</a>
        <div className="pw-mobile-actions"><a href="/login">Log in</a><a href="/register" className="pw-button pw-button-dark">Start gratis</a></div>
      </nav>
    )}
  </>
);

const NavGroup = ({ label, links }: { label: string; links: string[][] }) => (
  <div className="pw-nav-group">
    <button>{label} <ChevronDown size={14} /></button>
    <div className="pw-mega">
      {links.map(([href, title, description]) => <a href={href} key={href}><strong>{title}</strong><span>{description}</span></a>)}
    </div>
  </div>
);

const HeroProductVideo = () => {
  const reducedMotion = useReducedMotion();

  return (
    <video
      className="pw-hero-video"
      autoPlay={!reducedMotion}
      loop={!reducedMotion}
      muted
      playsInline
      preload="auto"
      poster={posFlowPoster}
      aria-label="PWAYMENT kassaflow van categorie en productkeuze tot PIN-betaling en ticket"
      disablePictureInPicture
    >
      <source src={posFlowVideo} type="video/mp4" />
    </video>
  );
};

const HomePage = () => (
  <>
    <section className="pw-hero pw-shell">
      <motion.div className="pw-hero-copy" initial="hidden" animate="visible" variants={stagger}>
        <motion.div className="pw-kicker" variants={fadeUp}><span /> Retail intelligence voor Belgische winkels</motion.div>
        <motion.h1 variants={fadeUp}>Je winkel.<br /><em>Eén helder systeem.</em></motion.h1>
        <motion.p variants={fadeUp}>Verkoop sneller, hou je voorraad onder controle, leer je klanten kennen en zie waar je winkel kan groeien—ook wanneer je internet even wegvalt.</motion.p>
        <motion.div className="pw-hero-actions" variants={fadeUp}>
          <a href="/register?plan=professional" className="pw-button pw-button-dark">Probeer Professional 30 dagen gratis <ArrowRight size={17} /></a>
          <a href="/demo" className="pw-text-link">Plan een persoonlijke demo <ArrowRight size={15} /></a>
        </motion.div>
        <motion.div className="pw-hero-note" variants={fadeUp}><CircleCheck size={16} /> Basis blijft gratis · Professional 1 maand gratis proberen</motion.div>
      </motion.div>
      <motion.div className="pw-product-stage pw-product-video-stage" initial={{ opacity: 0, y: 48, scale: .975 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: .92, delay: .2, ease: motionEase }}>
        <HeroProductVideo />
      </motion.div>
    </section>

    <section className="pw-trust-line"><motion.div className="pw-shell" initial="hidden" whileInView="visible" viewport={revealViewport} variants={stagger}>{['Offline-first', 'Belgische retail', 'Multi-store', 'Peppol-ready', 'Open API'].map(item => <motion.span key={item} variants={fadeUp}>{item}</motion.span>)}</motion.div></section>

    <motion.section className="pw-statement pw-shell" initial="hidden" whileInView="visible" viewport={revealViewport} variants={stagger}>
      <motion.p variants={fadeUp}>Van eerste scan tot volgende beslissing.</motion.p>
      <motion.h2 variants={fadeUp}>PWAYMENT verbindt alles wat in je winkel gebeurt—zodat jij niet tussen losse systemen hoeft te kiezen.</motion.h2>
    </motion.section>

    <section className="pw-story pw-shell">
      <StoryRow eyebrow="01 / Verkoop" title="Een kassa die het tempo van je winkel volgt." body="Scan een barcode, vind een product, koppel een klant en rond af met cash, PIN of cadeaubon. De interface blijft rustig, ook wanneer de rij langer wordt." image={posImage} href="/pos" icon={ScanLine} />
      <StoryRow eyebrow="02 / Begrijp" title="Zie niet alleen wat verkocht. Zie wat het betekent." body="Omzet is het begin. PWAYMENT toont marge, verkoopsnelheid, voorraadwaarde, seizoensritme en klantterugkeer—met een duidelijke volgende actie." image={insightsImage} visual={<InsightsCarousel />} href="/insights" icon={TrendingUp} reverse />
      <StoryRow eyebrow="03 / Verbind" title="Fysiek, online en achter de schermen in sync." body="Publiceer je webshop, verbind boekhouding en leveranciers, beheer locaties en geef elke medewerker precies de juiste toegang." image={integrationsImage} href="/integrations" icon={RefreshCw} />
    </section>

    <motion.section className="pw-loop-section" initial="hidden" whileInView="visible" viewport={revealViewport} variants={stagger}>
      <div className="pw-shell">
        <motion.div className="pw-section-heading" variants={fadeUp}><div><span className="pw-eyebrow">De PWAYMENT retailflow</span><h2>Alles begint bij een verkoop.<br />Alles wordt beter door wat je leert.</h2></div><a href="/product" className="pw-text-link">Ontdek het platform <ArrowRight size={15} /></a></motion.div>
        <div className="pw-loop">
          {[
            [ScanLine, 'Verkoop', 'Snel, foutarm en overal herkenbaar.'], [Database, 'Registreer', 'Voorraad, klant en betaling bewegen mee.'], [BarChart3, 'Begrijp', 'Zie marge, ritme en afwijkingen.'], [Sparkles, 'Verbeter', 'Bestel, stuur bij en bouw loyaliteit.'],
          ].map(([Icon, title, body], index) => <motion.div className="pw-loop-step" key={String(title)} variants={fadeUp} whileHover={{ y: -8, transition: { duration: .25 } }}><span>0{index + 1}</span><Icon size={24} /><h3>{String(title)}</h3><p>{String(body)}</p></motion.div>)}
        </div>
      </div>
    </motion.section>

    <motion.section className="pw-integrations pw-shell" initial="hidden" whileInView="visible" viewport={revealViewport} variants={stagger}>
      <motion.div className="pw-section-heading" variants={fadeUp}><div><span className="pw-eyebrow">Werkt met je retailstack</span><h2>Open waar het hoort.<br />Geïntegreerd waar het telt.</h2></div><a href="/integrations" className="pw-text-link">Alle integraties <ArrowRight size={15} /></a></motion.div>
      <div className="pw-wordmarks">{integrations.map(name => <motion.span key={name} variants={fadeUp} whileHover={{ y: -4, backgroundColor: '#ffffff' }}>{name}</motion.span>)}</div>
    </motion.section>

    <PricingTeaser />

    <motion.section className="pw-faq pw-shell" initial="hidden" whileInView="visible" viewport={revealViewport} variants={stagger}>
      <motion.div variants={fadeUp}><span className="pw-eyebrow">Veelgestelde vragen</span><h2>Eerst helderheid.<br />Dan vooruit.</h2><p>Alles wat je vooraf wilt weten over internet, hardware, migratie en abonnementen.</p></motion.div>
      <motion.div className="pw-faq-list" variants={stagger}>{faqs.map(([question, answer]) => <motion.details key={question} variants={fadeUp}><summary>{question}<span>+</span></summary><p>{answer}</p></motion.details>)}</motion.div>
    </motion.section>

    <FinalCta />
  </>
);

const StoryRow = ({ eyebrow, title, body, image, visual, href, icon: Icon, reverse = false }: { eyebrow: string; title: string; body: string; image: string; visual?: React.ReactNode; href: string; icon: LucideIcon; reverse?: boolean }) => (
  <motion.article className={`pw-story-row ${reverse ? 'pw-story-row-reverse' : ''}`} initial="hidden" whileInView="visible" viewport={revealViewport} variants={stagger}>
    <motion.div className="pw-story-copy" variants={{ hidden: { opacity: 0, x: reverse ? 36 : -36 }, visible: { opacity: 1, x: 0, transition: { duration: .75, ease: motionEase } } }}><span className="pw-eyebrow">{eyebrow}</span><Icon className="pw-story-icon" size={22} /><h2>{title}</h2><p>{body}</p><a href={href} className="pw-text-link">Meer ontdekken <ArrowRight size={15} /></a></motion.div>
    <motion.div className="pw-story-visual" variants={{ hidden: { opacity: 0, y: 35, scale: .975 }, visible: { opacity: 1, y: 0, scale: 1, transition: { duration: .85, ease: motionEase } } }} whileHover={{ y: -5, transition: { duration: .28 } }}>{visual ?? <motion.img src={image} alt="PWAYMENT productinterface" loading="lazy" whileHover={{ scale: 1.012 }} transition={{ duration: .45, ease: motionEase }} />}</motion.div>
  </motion.article>
);

const insightSlides = [
  { image: insightsImage, title: 'Verkoopprestaties', alt: 'PWAYMENT verkoopprestaties met omzet, brutowinst en een gevulde omzetgrafiek' },
  { image: insightsProductImage, title: 'Productprestaties', alt: 'PWAYMENT productprestaties met bestverkopende producten en omzetgroei' },
  { image: insightsInventoryImage, title: 'Voorraadsturing', alt: 'PWAYMENT voorraadoverzicht met voorraadwaarde, stilstand en besteladviezen' },
  { image: insightsCustomerImage, title: 'Klantinzichten', alt: 'PWAYMENT klantinzichten met registratie, herhaalaankopen en klantwaarde' },
];

const InsightsCarousel = () => {
  const [activeSlide, setActiveSlide] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const syncPreference = () => setReducedMotion(preference.matches);
    syncPreference();
    preference.addEventListener('change', syncPreference);
    return () => preference.removeEventListener('change', syncPreference);
  }, []);

  useEffect(() => {
    if (paused || reducedMotion) return;
    const timer = window.setInterval(() => setActiveSlide((current) => (current + 1) % insightSlides.length), 5200);
    return () => window.clearInterval(timer);
  }, [paused, reducedMotion]);

  const selectSlide = (index: number) => setActiveSlide((index + insightSlides.length) % insightSlides.length);

  return (
    <div
      className="pw-insight-carousel"
      role="region"
      aria-roledescription="carousel"
      aria-label="Actuele PWAYMENT inzichten"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setPaused(false); }}
    >
      <div className="pw-insight-slides" aria-live="polite">
        {insightSlides.map((slide, index) => (
          <img
            key={slide.image}
            className={index === activeSlide ? 'active' : ''}
            src={slide.image}
            alt={index === activeSlide ? slide.alt : ''}
            aria-hidden={index !== activeSlide}
            loading={index === 0 ? 'eager' : 'lazy'}
          />
        ))}
      </div>
      <div className="pw-insight-controls">
        <div className="pw-insight-caption"><span>0{activeSlide + 1}</span><strong>{insightSlides[activeSlide].title}</strong></div>
        <div className="pw-insight-dots" role="group" aria-label="Kies een inzichtenscherm">
          {insightSlides.map((slide, index) => <button key={slide.title} className={index === activeSlide ? 'active' : ''} type="button" aria-label={`Toon ${slide.title}`} aria-pressed={index === activeSlide} onClick={() => selectSlide(index)} />)}
        </div>
        <div className="pw-insight-arrows">
          <button type="button" aria-label="Vorig scherm" onClick={() => selectSlide(activeSlide - 1)}>←</button>
          <button type="button" aria-label={paused ? 'Automatisch wisselen hervatten' : 'Automatisch wisselen pauzeren'} onClick={() => setPaused((value) => !value)}>{paused ? '▶' : 'Ⅱ'}</button>
          <button type="button" aria-label="Volgend scherm" onClick={() => selectSlide(activeSlide + 1)}>→</button>
        </div>
      </div>
    </div>
  );
};

const PricingTeaser = () => (
  <motion.section className="pw-pricing-teaser" initial="hidden" whileInView="visible" viewport={revealViewport} variants={stagger}>
    <div className="pw-shell">
      <motion.span className="pw-eyebrow" variants={fadeUp}>Eenvoudige prijzen</motion.span>
      <motion.div className="pw-section-heading" variants={fadeUp}><h2>Begin gratis.<br />Groei wanneer je winkel groeit.</h2><a href="/pricing" className="pw-text-link">Vergelijk alle functies <ArrowRight size={15} /></a></motion.div>
      <div className="pw-price-line">
        <motion.div variants={fadeUp} whileHover={{ y: -8 }}><span>Basis</span><strong>€ 0</strong><small>voor altijd</small></motion.div>
        <motion.div className="pw-price-featured" variants={fadeUp} whileHover={{ y: -8 }}><span>Retail Professional</span><strong>€ 55</strong><small>per maand, jaarlijks gefactureerd</small><b>Meest gekozen</b></motion.div>
        <motion.div variants={fadeUp} whileHover={{ y: -8 }}><span>Enterprise & ketens</span><strong>€ 119</strong><small>per maand, jaarlijks gefactureerd</small></motion.div>
      </div>
    </div>
  </motion.section>
);

const FeaturePage = ({ data }: { data: FeaturePageData }) => (
  <>
    <AnimatedPageHero eyebrow={data.eyebrow} title={data.title} intro={data.intro} actions={<><a className="pw-button pw-button-dark" href="/register">Start gratis <ArrowRight size={16} /></a><a className="pw-text-link" href="/demo">Plan een demo <ArrowRight size={15} /></a></>} />
    <motion.section className="pw-wide-product pw-shell" initial={{ opacity: 0, y: 42, scale: .98 }} whileInView={{ opacity: 1, y: 0, scale: 1 }} viewport={revealViewport} transition={{ duration: .9, ease: motionEase }}><div className="pw-window-bar"><i /><i /><i /><span>app.pwayment.be</span><b>Live</b></div><motion.img src={data.image} alt={data.imageAlt} whileHover={{ scale: 1.008 }} transition={{ duration: .45 }} /><motion.div className="pw-wide-proof" initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={revealViewport} transition={{ delay: .35, duration: .55 }}><CircleCheck size={18} />{data.proof}</motion.div></motion.section>
    <section className="pw-chapters pw-shell">{data.chapters.map((chapter, index) => <motion.article key={chapter.number} initial={{ opacity: 0, y: 34 }} whileInView={{ opacity: 1, y: 0 }} viewport={revealViewport} transition={{ duration: .72, delay: index * .04, ease: motionEase }}><span>{chapter.number}</span><div><h2>{chapter.title}</h2><p>{chapter.body}</p></div><ul>{chapter.points.map((point, pointIndex) => <motion.li key={point} initial={{ opacity: 0, x: 12 }} whileInView={{ opacity: 1, x: 0 }} viewport={revealViewport} transition={{ delay: .15 + pointIndex * .07 }}><Check size={15} />{point}</motion.li>)}</ul></motion.article>)}</section>
    <motion.section className="pw-feature-cross pw-shell" initial="hidden" whileInView="visible" viewport={revealViewport} variants={stagger}><motion.p variants={fadeUp}>Ontworpen als één systeem</motion.p><div>{[[ScanLine, '/pos', 'POS'], [Box, '/inventory', 'Voorraad'], [BarChart3, '/insights', 'Inzichten'], [Users, '/customers', 'Klanten'], [ShoppingBag, '/webshop', 'Webshop'], [Webhook, '/integrations', 'Integraties']].map(([Icon, href, label]) => <motion.a key={String(href)} href={String(href)} variants={fadeUp} whileHover={{ y: -7 }}><Icon />{String(label)}</motion.a>)}</div></motion.section>
    <FinalCta />
  </>
);

const SolutionPage = ({ data }: { data: { title: string; intro: string; label: string; bullets: string[] } }) => (
  <>
    <AnimatedPageHero eyebrow={data.label} title={data.title} intro={data.intro} actions={<><a className="pw-button pw-button-dark" href="/register">Start gratis <ArrowRight size={16} /></a><a className="pw-text-link" href="/demo">Bespreek je winkel <ArrowRight size={15} /></a></>} />
    <motion.section className="pw-solution-panel pw-shell" initial="hidden" whileInView="visible" viewport={revealViewport} variants={stagger}><motion.div variants={fadeUp}><span className="pw-eyebrow">Waarom PWAYMENT</span><h2>De eenvoud van één platform. De diepte van echte retailsoftware.</h2></motion.div><motion.ul variants={stagger}>{data.bullets.map(item => <motion.li key={item} variants={fadeUp}><CircleCheck />{item}</motion.li>)}</motion.ul></motion.section>
    <section className="pw-story pw-shell"><StoryRow eyebrow="01 / Winkelvloer" title="Een korte flow voor je team." body="Nieuwe medewerkers vinden snel hun weg. Managers houden controle over kortingen, retouren en gevoelige acties." image={posImage} href="/pos" icon={ScanLine} /><StoryRow eyebrow="02 / Eigenaarschap" title="Overzicht zonder handmatig samenvoegen." body="Volg verkoop, marge, voorraad en klanten vanuit dezelfde bron—per locatie en over je hele bedrijf." image={insightsImage} href="/insights" icon={BarChart3} reverse /></section>
    <FinalCta />
  </>
);

const PricingPage = () => {
  const [cycle, setCycle] = useState<BillingCycle>('yearly');
  const plans = useMemo(() => [
    { name: 'Basis', price: '€ 0', note: 'Voor altijd gratis', audience: 'Voor pop-ups, markten en een eerste winkel.', cta: 'Start met Basis', href: '/register?plan=basis', features: ['1 locatie en 1 kassascherm', '250 actieve producten', 'Printer en barcodescanner', 'Basis voorraadbeheer', 'Z-rapport en 30 dagen historie', 'E-mailondersteuning'] },
    { name: 'Retail Professional', price: cycle === 'yearly' ? '€ 55' : '€ 69', note: cycle === 'yearly' ? '€ 660 per jaar · bespaar € 168' : 'Maandelijks gefactureerd', audience: 'Voor actieve winkels met één tot drie kassa’s.', cta: 'Probeer 30 dagen gratis', href: '/register?plan=professional', featured: true, features: ['3 kassaschermen inbegrepen', 'Onbeperkte producten en varianten', 'Betaalterminals en geavanceerde hardware', 'Voorraad, labels en besteladvies', 'Loyaliteit en cadeaubonnen', 'PWAYMENT Webshop en live sync', 'API, webhooks, Peppol en Exact', 'Prioriteit e-mail en chat'] },
    { name: 'Enterprise & ketens', price: cycle === 'yearly' ? '€ 119' : '€ 149', note: cycle === 'yearly' ? '€ 1.428 per jaar · bespaar € 360' : 'Maandelijks gefactureerd', audience: 'Voor ketens, franchises en multichannel retail.', cta: 'Kies Enterprise', href: '/register?plan=enterprise', features: ['Onbeperkte locaties en kassa’s', 'Transfers en lokale prijslijsten', 'Fijnmazige rechten en audit', 'Multi-storefront ecommerce', 'Onbeperkte API en ERP-koppelingen', '99,9% SLA en 24/7 noodsupport', 'Dedicated accountmanager', 'Begeleiding op locatie'] },
  ], [cycle]);

  return <>
    <AnimatedPageHero className="pw-pricing-hero" eyebrow="Prijzen" title={<>Alles wat je nodig hebt.<br />Precies op het juiste moment.</>} intro="PWAYMENT Basis blijft gratis. Probeer Retail Professional 30 dagen gratis en groei zonder van systeem te veranderen. Alle softwareprijzen zijn exclusief btw." actions={<div className="pw-cycle" role="group" aria-label="Facturatieperiode"><button className={cycle === 'monthly' ? 'active' : ''} onClick={() => setCycle('monthly')}>Maandelijks</button><button className={cycle === 'yearly' ? 'active' : ''} onClick={() => setCycle('yearly')}>Jaarlijks <span>Bespaar</span></button></div>} />
    <motion.section className="pw-plans pw-shell" initial="hidden" animate="visible" variants={stagger}>{plans.map(plan => <motion.article className={plan.featured ? 'featured' : ''} key={plan.name} variants={fadeUp} whileHover={{ y: -9, transition: { duration: .25 } }}>{plan.featured && <b className="pw-popular">Meest gekozen</b>}<header><span>{plan.name}</span><AnimatePresence mode="popLayout"><motion.h2 key={plan.price} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: .22 }}>{plan.price}<small>/maand</small></motion.h2></AnimatePresence><p>{plan.note}</p></header><div className="pw-plan-audience">{plan.audience}</div><a href={plan.href} className={`pw-button ${plan.featured ? 'pw-button-dark' : 'pw-button-light'}`}>{plan.cta}<ArrowRight size={15} /></a><ul>{plan.features.map(feature => <li key={feature}><Check size={15} />{feature}</li>)}</ul></motion.article>)}</motion.section>
    <motion.section className="pw-current-source pw-shell" initial="hidden" whileInView="visible" viewport={revealViewport} variants={stagger}><motion.div variants={fadeUp}><span className="pw-eyebrow">Rechtstreeks uit PWAYMENT</span><h2>Dezelfde plannen. Dezelfde voorwaarden. Eén bron.</h2><p>De publieke vergelijking volgt de actuele licentie- en functiematrix in PWAYMENT zelf.</p></motion.div><motion.div className="pw-current-source-window" variants={fadeUp} whileHover={{ y: -5 }}><div className="pw-window-bar"><i /><i /><i /><span>Instellingen · Plan &amp; Upgrades</span><b>Actueel</b></div><img src={plansImage} alt="Actuele planvergelijking in de lokale PWAYMENT applicatie" loading="lazy" /></motion.div></motion.section>
    <motion.section className="pw-addons pw-shell" initial="hidden" whileInView="visible" viewport={revealViewport} variants={stagger}><motion.div variants={fadeUp}><span className="pw-eyebrow">Gerichte uitbreidingen</span><h2>Alleen extra betalen wanneer je extra verbindt.</h2></motion.div><motion.div variants={stagger}>{[['Extra kassascherm', '€ 29 / maand', 'Na de 3 inbegrepen schermen in Professional.'], ['External Webshop Sync', '€ 19 / maand', 'Shopify of WooCommerce in twee richtingen.'], ['Advanced Accounting', '€ 15 / maand', 'Automatische Z-journaalpost en Octopus.'], ['Advanced BI & Raw Export', '€ 25 / maand', 'Power BI en uitgebreide Excel-datasets.']].map(([name, price, body]) => <motion.article key={name} variants={fadeUp}><h3>{name}</h3><strong>{price}</strong><p>{body}</p></motion.article>)}</motion.div></motion.section>
    <ComparisonTable />
    <motion.section className="pw-faq pw-shell" initial="hidden" whileInView="visible" viewport={revealViewport} variants={stagger}><motion.div variants={fadeUp}><span className="pw-eyebrow">Prijsinformatie</span><h2>Geen verrassingen in de kleine letters.</h2></motion.div><motion.div className="pw-faq-list" variants={stagger}>{faqs.slice(3).map(([question, answer]) => <motion.details key={question} variants={fadeUp}><summary>{question}<span>+</span></summary><p>{answer}</p></motion.details>)}</motion.div></motion.section>
    <FinalCta />
  </>;
};

const ComparisonTable = () => {
  const rows = [
    ['Kassaschermen', '1', '3 inbegrepen', 'Onbeperkt'], ['Actieve producten', '250', 'Onbeperkt', 'Onbeperkt'], ['Betaalterminalkoppeling', '—', 'Inbegrepen', 'Inbegrepen'], ['Voorraad & besteladvies', 'Basis', 'Geavanceerd', 'Multi-location'], ['Klanten & loyaliteit', '—', 'Inbegrepen', 'Inbegrepen'], ['PWAYMENT Webshop', '—', 'Inbegrepen', 'Multi-storefront'], ['REST API & webhooks', '—', '5.000/dag', 'Onbeperkt'], ['Peppol & Exact', '—', 'Inbegrepen', 'Inbegrepen'], ['Auditgeschiedenis', '30 dagen', 'Uitgebreid', 'Onbeperkt'], ['Ondersteuning', 'E-mail', 'Prioriteit chat & e-mail', '24/7 + accountmanager'], ['Uptime', '—', '99,5%', '99,9% SLA'],
  ];
  return <motion.section className="pw-compare pw-shell" initial="hidden" whileInView="visible" viewport={revealViewport} variants={stagger}><motion.div className="pw-section-heading" variants={fadeUp}><div><span className="pw-eyebrow">Volledige vergelijking</span><h2>Zie exact wat inbegrepen is.</h2></div></motion.div><motion.div className="pw-table-wrap" variants={fadeUp}><table><thead><tr><th>Functie</th><th>Basis</th><th>Professional</th><th>Enterprise</th></tr></thead><tbody>{rows.map(row => <tr key={row[0]}>{row.map((cell, index) => <td key={cell} data-label={index === 0 ? undefined : ['Basis', 'Professional', 'Enterprise'][index - 1]}>{cell}</td>)}</tr>)}</tbody></table></motion.div></motion.section>;
};

const ContactPage = ({ demo }: { demo: boolean }) => {
  const [submitted, setSubmitted] = useState(false);
  const submit = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); setSubmitted(true); };
  return <motion.section className="pw-contact pw-shell" initial="hidden" animate="visible" variants={stagger}><motion.div className="pw-contact-copy" variants={{ hidden: { opacity: 0, x: -34 }, visible: { opacity: 1, x: 0, transition: { duration: .75, ease: motionEase } } }}><span className="pw-eyebrow">{demo ? 'Persoonlijke demo' : 'Contact'}</span><h1>{demo ? 'Laat ons je winkel zien. Wij tonen wat PWAYMENT ermee kan.' : 'Waar kunnen we bij helpen?'}</h1><p>{demo ? 'In dertig minuten lopen we door je verkoopflow, assortiment, hardware, webshop en rapportage. Je krijgt een eerlijk beeld van de juiste setup en het passende plan.' : 'Een vraag over het product, migratie, hardware of je account? Stuur ons de context; het juiste team pakt het op.'}</p><ul><li><Check />Afgestemd op jouw type winkel</li><li><Check />Ruimte voor technische en commerciële vragen</li><li><Check />Geen generieke verkooppresentatie</li></ul></motion.div><motion.div className="pw-form-card" variants={{ hidden: { opacity: 0, x: 34, scale: .985 }, visible: { opacity: 1, x: 0, scale: 1, transition: { duration: .82, ease: motionEase } } }}><AnimatePresence mode="wait">{submitted ? <motion.div key="success" className="pw-form-success" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}><CircleCheck size={34} /><h2>Bedankt. We nemen het vanaf hier over.</h2><p>Je aanvraag is ontvangen. Je krijgt een bevestiging en de volgende stap per e-mail.</p><a href="/product" className="pw-text-link">Ontdek intussen het platform <ArrowRight size={15} /></a></motion.div> : <motion.form key="form" onSubmit={submit} exit={{ opacity: 0, y: -12 }}><div className="pw-form-grid"><label>Voornaam<input name="firstName" autoComplete="given-name" required /></label><label>Achternaam<input name="lastName" autoComplete="family-name" required /></label></div><label>Zakelijk e-mailadres<input type="email" name="email" autoComplete="email" required /></label><label>Winkel of bedrijf<input name="company" autoComplete="organization" required /></label>{demo && <div className="pw-form-grid"><label>Aantal locaties<select name="locations"><option>1 locatie</option><option>2–3 locaties</option><option>4–10 locaties</option><option>Meer dan 10</option></select></label><label>Huidige situatie<select name="current"><option>Nog geen POS</option><option>Spreadsheet/eenvoudige kassa</option><option>Andere POS</option><option>Meerdere systemen</option></select></label></div>}<label>Waar wil je vooral duidelijkheid over?<textarea name="message" rows={4} required /></label><label className="pw-consent"><input type="checkbox" required />Ik ga akkoord dat PWAYMENT mijn gegevens gebruikt om op deze aanvraag te antwoorden.</label><button className="pw-button pw-button-dark" type="submit">{demo ? 'Vraag mijn demo aan' : 'Verstuur bericht'}<ArrowRight size={16} /></button><small>Geen spam. Je gegevens worden alleen gebruikt voor deze aanvraag.</small></motion.form>}</AnimatePresence></motion.div></motion.section>;
};

const MigrationPage = () => <><AnimatedPageHero eyebrow="Overstappen naar PWAYMENT" title={<>Neem je winkel mee.<br />Laat de rommel achter.</>} intro="Producten, varianten, barcodes, klanten en voorraad migreren gecontroleerd. Daarna configureren we hardware, team en rapportage rond je echte werkdag." actions={<a className="pw-button pw-button-dark" href="/demo">Plan je migratie <ArrowRight size={16} /></a>} /><motion.section className="pw-steps pw-shell" initial="hidden" whileInView="visible" viewport={revealViewport} variants={stagger}>{[['01', 'Inventariseren', 'We brengen data, hardware, betaalmethodes en integraties in kaart.'], ['02', 'Importeren', 'We valideren velden, duplicaten, prijzen, btw en voorraad voor ze live gaan.'], ['03', 'Inrichten', 'Locaties, registers, rollen, tickets, webshop en koppelingen worden getest.'], ['04', 'Live gaan', 'Je team oefent de volledige winkeldag en krijgt begeleiding bij de overstap.']].map(([n, title, body]) => <motion.article key={n} variants={fadeUp} whileHover={{ y: -7 }}><span>{n}</span><h2>{title}</h2><p>{body}</p></motion.article>)}</motion.section><FinalCta /></>;

const AboutPage = () => <><AnimatedPageHero eyebrow="Over PWAYMENT" title="Retailsoftware hoort de winkel beter te maken." intro="PWAYMENT is gebouwd vanuit één overtuiging: een kassa mag geen eindpunt zijn. Elke verkoop moet voorraad kloppend houden, klanten beter begrijpen en de volgende beslissing eenvoudiger maken." /><motion.section className="pw-manifesto pw-shell" initial="hidden" whileInView="visible" viewport={revealViewport} variants={stagger}><motion.p variants={fadeUp}>Wij bouwen voor de mensen die elke dag openen, verkopen, adviseren, tellen, bestellen en opnieuw beginnen.</motion.p><motion.div variants={stagger}>{[['Rust in de interface.', 'De winkel is al levendig genoeg. Software moet aandacht sturen, niet opeisen.'], ['Diepte achter eenvoud.', 'Een korte flow aan de voorkant mag geen oppervlakkige administratie aan de achterkant betekenen.'], ['Open, maar verantwoordelijk.', 'Integraties en API’s horen controleerbaar, veilig en ondersteunbaar te zijn.']].map(([title, body]) => <motion.div className="pw-manifesto-point" key={title} variants={fadeUp}><h2>{title}</h2><p>{body}</p></motion.div>)}</motion.div></motion.section><FinalCta /></>;

const ResourcesPage = ({ stories }: { stories: boolean }) => <><AnimatedPageHero eyebrow={stories ? 'Klantverhalen' : 'Resources'} title={stories ? 'Retailers die elke dag helderder sturen.' : 'Praktische kennis voor een sterkere winkel.'} intro={stories ? 'Echte verhalen over migratie, winkeltempo, voorraad en groei.' : 'Gidsen, productnieuws en uitleg over POS, voorraad, klanten, ecommerce en Belgische retail.'} /><motion.section className="pw-resource-grid pw-shell" initial="hidden" whileInView="visible" viewport={revealViewport} variants={stagger}>{(stories ? [['Van één kassa naar één winkelbeeld', 'Hoe een speciaalzaak verkoop en voorraad samenbracht.', 'Klantverhaal'], ['Drie locaties, één catalogus', 'Een keten over centrale controle en lokale snelheid.', 'Klantverhaal'], ['Minder stilstaande voorraad', 'Van buikgevoel naar zichtbaar verkooptempo.', 'Klantverhaal']] : [['De complete POS-migratiechecklist', 'Wat je vooraf verzamelt, controleert en test.', 'Gids'], ['Voorraadwaarde is geen voorraadgezondheid', 'Zo lees je stilstand, tempo en marge samen.', 'Inzicht'], ['Wat Belgische e-facturatie betekent voor retail', 'Peppol, kassabonnen en B2B-facturen helder uitgelegd.', 'Gids'], ['PWAYMENT changelog', 'Nieuwe functies, verbeteringen en fixes.', 'Product']]).map(([title, body, type]) => <motion.article key={title} variants={fadeUp} whileHover={{ y: -7 }}><span>{type}</span><h2>{title}</h2><p>{body}</p><a href="/contact" aria-label={`Lees meer over ${title}`}><ArrowRight /></a></motion.article>)}</motion.section><FinalCta /></>;

const LegalPage = ({ type }: { type: string }) => {
  const titles: Record<string, string> = { privacy: 'Privacyverklaring', cookies: 'Cookiebeleid', terms: 'Algemene voorwaarden', dpa: 'Verwerkersovereenkomst', subprocessors: 'Subverwerkers' };
  return <motion.section className="pw-legal pw-shell" initial="hidden" animate="visible" variants={stagger}><motion.span className="pw-eyebrow" variants={fadeUp}>Juridisch</motion.span><motion.h1 variants={fadeUp}>{titles[type] || 'Juridische informatie'}</motion.h1><motion.p className="pw-legal-updated" variants={fadeUp}>Laatst bijgewerkt op 11 augustus 2026</motion.p><motion.article variants={fadeUp}><h2>Heldere afspraken</h2><p>Deze pagina is voorbereid als definitieve juridische bestemming voor {titles[type]?.toLowerCase() || 'deze informatie'}. Voor publieke ingebruikname wordt de volledige, door juridisch adviseurs goedgekeurde tekst hier opgenomen, inclusief bedrijfsidentiteit, doeleinden, bewaartermijnen, rechten, contactkanalen en toepasselijke voorwaarden.</p><h2>Contact</h2><p>Vragen over privacy, voorwaarden of gegevensverwerking kunnen worden gericht aan privacy@pwayment.be.</p><h2>Versiebeheer</h2><p>Elke wijziging krijgt een ingangsdatum en versienummer. Eerdere versies blijven opvraagbaar wanneer contractuele of wettelijke transparantie dat vereist.</p></motion.article></motion.section>;
};

const NotFoundPage = () => <motion.section className="pw-not-found pw-shell" initial="hidden" animate="visible" variants={stagger}><motion.span variants={fadeUp}>404</motion.span><motion.h1 variants={fadeUp}>Deze pagina staat niet in de winkel.</motion.h1><motion.p variants={fadeUp}>De link is mogelijk verplaatst. Vanaf het overzicht vind je snel de juiste richting.</motion.p><motion.a variants={fadeUp} href="/" className="pw-button pw-button-dark">Terug naar home <ArrowRight size={16} /></motion.a></motion.section>;

const FinalCta = () => <motion.section className="pw-final" initial="hidden" whileInView="visible" viewport={revealViewport} variants={stagger}><div className="pw-shell"><motion.span className="pw-eyebrow" variants={fadeUp}>Klaar voor een helderdere winkel?</motion.span><motion.h2 variants={fadeUp}>Begin gratis.<br />Probeer Professional 1 maand.</motion.h2><motion.p variants={fadeUp}>Basis blijft gratis. Na de proefperiode activeer je Professional of blijf je Basis gebruiken.</motion.p><motion.div variants={fadeUp}><a href="/register?plan=professional" className="pw-button pw-button-dark">Probeer Professional gratis <ArrowRight size={17} /></a><a href="/demo" className="pw-text-link">Plan liever een demo <ArrowRight size={15} /></a></motion.div></div></motion.section>;

const SiteFooter = () => (
  <footer className="pw-footer"><div className="pw-shell"><div className="pw-footer-top"><div className="pw-footer-brand"><img src="/branding/pwayment-logo.svg" alt="PWAYMENT" /><p>Retail intelligence voor winkels die helder willen verkopen, beheren en groeien.</p></div><div className="pw-footer-links"><div><strong>Product</strong><a href="/pos">POS & betalingen</a><a href="/inventory">Voorraad</a><a href="/insights">Inzichten</a><a href="/customers">Klanten</a><a href="/webshop">Webshop</a></div><div><strong>Platform</strong><a href="/integrations">Integraties & API</a><a href="/hardware">Hardware</a><a href="/offline">Offline-first</a><a href="/security">Veiligheid</a><a href="/pricing">Prijzen</a></div><div><strong>Bedrijf</strong><a href="/about">Over PWAYMENT</a><a href="/customer-stories">Klantverhalen</a><a href="/resources">Resources</a><a href="/migrate">Migreren</a><a href="/contact">Contact</a></div><div><strong>Account</strong><a href="/login">Log in</a><a href="/register">Start gratis</a><a href="/demo">Plan een demo</a><a href="/contact">Support</a></div></div></div><div className="pw-footer-bottom"><span>© 2026 PWAYMENT. Alle rechten voorbehouden.</span><div><a href="/legal/privacy">Privacy</a><a href="/legal/cookies">Cookies</a><a href="/legal/terms">Voorwaarden</a><a href="/legal/subprocessors">Subverwerkers</a></div><span>NL <ChevronDown size={13} /></span></div></div></footer>
);

export default PublicSite;
