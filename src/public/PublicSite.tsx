import React, { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  BadgeCheck,
  BarChart3,
  Barcode,
  Box,
  Check,
  ChevronDown,
  CircleCheck,
  ClipboardCheck,
  CloudOff,
  CreditCard,
  Database,
  FileText,
  Gift,
  Globe2,
  Layers3,
  LockKeyhole,
  Menu,
  Pause,
  Play,
  ReceiptText,
  RefreshCw,
  ScanLine,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Store,
  TrendingUp,
  UserCog,
  Users,
  Webhook,
  X,
  type LucideIcon,
} from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import {
  formatEuroCents,
  formatPlanMonthlyPrice,
  PLAN_CATALOG,
  PUBLIC_PLAN_ORDER,
  yearlySavingsCents,
  yearlyTotalCents,
  type BillingCycle,
} from '../billing/planCatalog';
import { publicLeadStorageAvailable, submitPublicLead } from '../services/publicLeads';
import { trackPublicEvent } from '../services/publicAnalytics';
import { applyRouteSeo } from './siteSeo';
import './public-site.css';

// These captures come from the current local application in presentation mode.
// Keep public marketing visuals independent from the retired presentation export.
const posImage = '/website/pwayment-pos-current.jpg';
const catalogImage = '/website/pwayment-catalog-current.jpg';
const insightsImage = '/website/pwayment-insights-performance-current.jpg';
const insightsProductImage = '/website/pwayment-insights-products-current.jpg';
const insightsInventoryImage = '/website/pwayment-insights-inventory-current.jpg';
const insightsCustomerImage = '/website/pwayment-insights-customers-current.jpg';
const customerImage = '/website/pwayment-giftcards-current.png';
const webshopImage = '/website/pwayment-webshop-orders-current.png';
const integrationsImage = '/website/pwayment-integrations-current.jpg';
const plansImage = '/website/pwayment-plans-current.jpg';
const heroVideo = '/website/hero_video1.mp4';
const paymentVideo = '/website/hero_video.mp4';

const keepVideoSilent = (video: HTMLVideoElement) => {
  video.defaultMuted = true;
  video.muted = true;
  video.volume = 0;
};

interface PricingPlan {
  name: string;
  price: string;
  note: string;
  audience: string;
  cta: string;
  href: string;
  featured?: boolean;
  features: string[];
}

const getPricingPlans = (cycle: BillingCycle): PricingPlan[] => [
  ...PUBLIC_PLAN_ORDER.map((code) => {
    const plan = PLAN_CATALOG[code];
    const yearly = cycle === 'yearly';
    const yearlyTotal = yearlyTotalCents(code);
    const yearlySavings = yearlySavingsCents(code);
    return {
      name: plan.publicName,
      price: formatPlanMonthlyPrice(code, cycle),
      note: code === 'basic'
        ? 'Voor altijd gratis'
        : yearly
          ? `${formatEuroCents(yearlyTotal)} per jaar · bespaar ${formatEuroCents(yearlySavings)}`
          : 'Maandelijks gefactureerd',
      audience: plan.audience,
      cta: plan.cta,
      href: plan.href,
      featured: plan.featured,
      features: plan.features,
    };
  }),
];

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
      { number: '01', title: 'Verkoop zonder frictie', body: 'Een scanner-first kassa die snel voelt op laptop, tablet en vaste terminal.', points: ['Barcode, SKU of directe productkeuze', 'Cash, PIN, cadeaubon en gesplitste betaling', 'Kortingen, klantenkoppeling en lijnnotities', 'Gedeeltelijke retouren met voorraadherstel', 'Bon, factuurpreview en PDF vanuit de historiek'] },
      { number: '02', title: 'Beheer wat je verkoopt', body: 'Producten, varianten, voorraad, barcodes en leveranciers blijven samen.', points: ['Onbeperkte varianten in Professional', 'Min/max voorraad en 60-dagen besteladvies', 'CSV-migratie en barcode-etiketten', 'Inkooporders per leverancier', 'Deelontvangsten met voorraadbeweging'] },
      { number: '03', title: 'Zie wat aandacht verdient', body: 'PWAYMENT vertaalt transacties naar concrete beslissingen voor je winkel.', points: ['Omzet, marge en productprestaties', 'Kortingen, betaalmix en verkoopmomenten', 'Stilstaande voorraad en seizoensritme', 'Klantherhaling en aankoopgedrag', 'Teamactiviteit en datadekking'] },
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
      { number: '01', title: 'Scanner-first checkout', body: 'De zoekbalk herkent barcode, SKU en productnaam. Exacte scans gaan direct naar de winkelwagen.', points: ['USB- en keyboard-wedge barcodescanners', 'Sneltoetsen en touchbediening', 'Voorraadcontrole tijdens verkoop'] },
      { number: '02', title: 'Betaling helder registreren', body: 'Werk met cash, PIN, cadeaubonnen en gesplitste betalingen vanuit één overzicht. Terminalproviders krijgen afzonderlijk een gevalideerde status.', points: ['Cash, PIN en cadeaubon registreren', 'Ontvangen cash en wisselgeld op het ticket', 'Cadeaubon combineren met cash of PIN', 'Bon- en kassaladeflow volgens hardwarematrix', 'Kortingen en correcties met managergoedkeuring'] },
      { number: '03', title: 'Van retour tot dagafsluiting', body: 'Corrigeer verkopen gecontroleerd en sluit de dag af met een volledige, exporteerbare historie.', points: ['Gedeeltelijke retour per verkoopregel', 'Verplichte reden en automatisch voorraadherstel', 'Kasreconciliatie, betaalmix en Belgische btw', 'Z-rapport met controleerbare hashketen', 'Verkopen, rapporten en audit als CSV of JSON'] },
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
      { number: '01', title: 'Een catalogus die retail aankan', body: 'Varianten, merken, leveranciers, inkoopprijs, verkoopprijs, btw, SKU en barcode horen bij elkaar.', points: ['Maten, kleuren, merken en leveranciers', 'CSV-import en -export met validatie', 'Dymo- en Zebra-labels', 'Eigen EAN-13 barcode genereren', 'Producten archiveren en herstellen'] },
      { number: '02', title: 'Live voorraadbeeld', body: 'Elke verkoop, online order, ontvangst en transfer werkt hetzelfde voorraadbeeld bij.', points: ['Voorraad per locatie', 'Minimum- en maximumsignalen', 'Interne transfers voor ketens'] },
      { number: '03', title: 'Koop slimmer in', body: 'Verkooptempo, minimumvoorraad, trend en betrouwbaarheid voeden concrete bestelvoorstellen.', points: ['Days-of-cover en stockout-risico', '60-dagen prognose met confidence', 'Bestelvoorstellen per leverancier', 'Purchase-orderconcepten vanuit de prognose', 'Volledige of gedeeltelijke ontvangst'] },
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
      { number: '01', title: 'Vandaag weten wat telt', body: 'Open met actuele signalen, niet met een muur grafieken.', points: ['Afwijkingen en kansen uit vier databronnen', 'Vergelijkbare perioden', 'Acties bewaren, uitstellen of afronden', 'Besteladvies zonder automatisch te bestellen', 'Datadekking voor betrouwbaardere conclusies'] },
      { number: '02', title: 'Marge achter de omzet', body: 'Combineer verkoop met geregistreerde kostprijs om te begrijpen wat werkelijk bijdraagt.', points: ['Brutowinst per product en categorie', 'Kostprijsdekking zichtbaar', 'Kortingsanalyse per categorie en product', 'Betaalmix en netto-omzet', 'Verkoopmomenten per weekdag en uur'] },
      { number: '03', title: 'Ritme, klanten en team', body: 'Zie seizoenpatronen, verkoopsnelheid, klantterugkeer en teamactiviteit zonder spreadsheets samen te voegen.', points: ['Seizoensvooruitblik en categorieprofielen', 'Tijd tot tweede aankoop en klantwaarde', 'Gatewayproducten voor loyaliteit', 'Omzet en verkopen per medewerker', 'Voorraadtempo en 90-dagen stilstand'] },
    ],
  },
  '/customers': {
    eyebrow: 'Klanten & loyaliteit',
    title: 'Herken goede klanten. Geef ze een reden om terug te komen.',
    intro: 'Bouw klantrelaties vanuit echte aankopen. Met profielen, bezoekhistorie, spaarregels, VIP-niveaus en cadeaubonnen die overal hetzelfde saldo tonen.',
    image: customerImage,
    imageAlt: 'Actueel PWAYMENT cadeaubonbeheer met status, saldo en historiek',
    proof: 'Actuele productweergave van cadeaubonsaldo, status en volledige mutatiehistoriek.',
    chapters: [
      { number: '01', title: 'Een bruikbaar klantbeeld', body: 'Contactgegevens, voorkeuren en aankopen blijven overzichtelijk en toestemming blijft controleerbaar.', points: ['Snel koppelen aan verkoop', 'Zoeken, filteren en sorteren op gedrag', 'Aankoop- en retourhistorie', 'Notities, bezoeken en klantwaarde', 'Facturen bekijken en downloaden als PDF'] },
      { number: '02', title: 'Loyaliteit die past', body: 'Bepaal punten, beloningen en VIP-niveaus op basis van hoe je winkel werkt.', points: ['Spaarmultipliers', 'VIP-niveaus en voordelen', 'Automatische saldo-opbouw'] },
      { number: '03', title: 'Cadeaubonnen zonder twijfel', body: 'Uitgifte, opwaardering, blokkering en gebruik komen samen in één live grootboek.', points: ['Uitgeven en opwaarderen met betaalregistratie', 'Anoniem of aan klant gekoppeld', 'Blokkeren en opnieuw activeren', 'Saldo vóór en na elke gebeurtenis', 'Volledige append-only historiek'] },
    ],
  },
  '/webshop': {
    eyebrow: 'PWAYMENT Webshop',
    title: 'Je winkel stopt niet bij de voordeur.',
    intro: 'Publiceer je assortiment online, ontvang bestellingen en houd voorraad automatisch gelijk. PWAYMENT verbindt de winkelvloer en je storefront in één retailoperatie.',
    image: webshopImage,
    imageAlt: 'Actueel PWAYMENT webshoporderbeheer met status en fulfilmentacties',
    proof: 'Actuele productweergave van webshoporders, fulfilmentstatus en voorraadflow.',
    chapters: [
      { number: '01', title: 'Van catalogus naar storefront', body: 'Kies producten, beelden, beschrijvingen en uitgelichte items zonder dubbele invoer.', points: ['Eigen subdomein of custom domain', 'Responsive storefront', 'SEO- en merkbeheer'] },
      { number: '02', title: 'Bestellen zoals klanten willen', body: 'Bestelling, betaalstatus, levering en afhalen werken in dezelfde orderflow. Payment capture blijft afhankelijk van de geactiveerde providerstatus.', points: ['Coupons en gratis-verzenddrempel', 'Verzendkosten of afhalen in de winkel', 'Betaalmethode en ordernotities bewaren', 'Bevestigen, verwerken en verzenden', 'Annuleren of klaarzetten voor afhaling'] },
      { number: '03', title: 'Eén voorraad voor elk kanaal', body: 'Online en fysieke verkoop reserveren en verlagen dezelfde voorraad.', points: ['Atomaire voorraadreservering bij checkout', 'Annuleren geeft gereserveerde voorraad vrij', 'Verzenden of afhalen committeert de reservering', 'Multi-storefront in Enterprise', 'Shopify/WooCommerce add-on'] },
    ],
  },
  '/integrations': {
    eyebrow: 'Koppelingen & API',
    title: 'PWAYMENT past in je bedrijf. Niet andersom.',
    intro: 'Bekijk per verkoopkanaal, leverancier, boekhouding, betaling en ontwikkelkoppeling wat actief, in pilot of nog in validatie is.',
    image: integrationsImage,
    imageAlt: 'De actuele PWAYMENT Integration Hub met leveranciers, verkoopkanalen en API',
    proof: 'Beheerde connectors én open bouwblokken voor maatwerk.',
    chapters: [
      { number: '01', title: 'Commerce en leveranciers', body: 'Configuratie en mapping bestaan; live synchronisatie wordt per connector end-to-end gevalideerd.', points: ['Shopify en WooCommerce: pilot', 'REST, GraphQL en SFTP feeds: validatie', 'PWAYMENT Webshop: actief'] },
      { number: '02', title: 'Boekhouding en Peppol', body: 'Boekhoudconfiguratie is voorzien, maar een publieke live-status volgt pas na een bewezen volledige documentflow.', points: ['Exact Online en Octopus: pilot', 'Peppol: pilot', 'Z-journaalconfiguratie aanwezig'] },
      { number: '03', title: 'API en webhooks', body: 'Sleutel-, webhook- en logbeheer zijn zichtbaar; endpoints, delivery en documentatie bepalen de live-status.', points: ['Beheerinterface aanwezig', 'Deliveryservice nog in pilot', 'Geen actief-label zonder end-to-end bewijs'] },
    ],
  },
  '/hardware': {
    eyebrow: 'Hardware',
    title: 'Open software. Betrouwbare winkelhardware.',
    intro: 'Controleer per scanner, printer, kassalade, labelprinter, weegschaal en betaalterminal welke combinatie aantoonbaar werkt en welke nog validatie vraagt.',
    image: posImage,
    imageAlt: 'PWAYMENT POS ontworpen voor retailhardware',
    proof: 'Configureren, testen en problemen oplossen vanuit één hardwarecentrum.',
    chapters: [
      { number: '01', title: 'Print en scan', body: 'Keyboard-wedge scanning en USB ESC/POS zijn de aantoonbaar actieve paden.', points: ['Keyboard-wedge barcodescanner actief', 'USB ESC/POS via Chromium en HTTPS', '58 en 80 mm afhankelijk van printermodel'] },
      { number: '02', title: 'Betalen', body: 'PIN kan worden geregistreerd; provider- en modelintegratie blijft pilot tot device- en reconciliatietests slagen.', points: ['Worldline, CCV en SumUp: pilot', 'Viva en Verifone: pilot', 'Geen providerclaim zonder testbewijs'] },
      { number: '03', title: 'De volledige balie', body: 'Lade, labels, Bluetooth en weegschaal hebben elk een eigen bewijsniveau in de matrix.', points: ['Kassalade afhankelijk van ESC/POS-printer', 'Labelprintlayout actief', 'Bluetooth en weegschaal in validatie'] },
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
  '/solutions/multi-location': { label: 'Enterprise & ketens', title: 'Elke winkel lokaal sterk. De keten centraal bestuurbaar.', intro: 'Verbind onbeperkte locaties en registers zonder lokale snelheid of centrale controle in te leveren.', bullets: ['Transfers, prijslijsten en promoties', 'Consolidated intelligence en audit', 'SLA en ondersteuning volgens overeenkomst'] },
  '/solutions/accountants': { label: 'Accountants & partners', title: 'Schone winkeldata. Minder herstelwerk.', intro: 'Laat dagelijkse ontvangsten, btw, betaalmethodes en facturen gestructureerd voorbereiden voor de boekhouding.', bullets: ['Peppol, Exact en Octopus volgens pilotstatus', 'Controleerbare Z- en transactie-export', 'Connectorvalidatie vóór live-status'] },
};

interface OperationalPageData {
  eyebrow: string;
  title: string;
  intro: string;
  image: string;
  imageAlt: string;
  proof: string;
  flow: Array<{ number: string; title: string; body: string }>;
  capabilities: Array<{ title: string; body: string; evidence: string }>;
  related: Array<{ href: string; label: string }>;
}

const operationalPages: Record<string, OperationalPageData> = {
  '/history-returns-invoices': {
    eyebrow: 'Historiek, retouren & facturen',
    title: 'Elke correctie begint bij de oorspronkelijke verkoop.',
    intro: 'Zoek een verkoop, controleer betaalwijze en kassier, boek alleen de regels die terugkomen en houd voorraad, klantbeeld en documenten samen correct.',
    image: '/website/pwayment-history-returns-current.png',
    imageAlt: 'PWAYMENT verkoopgeschiedenis met transacties, facturen, retouren en exports',
    proof: 'Actuele productweergave met transacties, factuuracties en retouringang.',
    flow: [
      { number: '01', title: 'Vind de verkoop', body: 'Zoek op factuurnummer, kassier, bedrag, periode of betaalmethode en open het onveranderlijke verkoopdocument.' },
      { number: '02', title: 'Kies de retourregels', body: 'Selecteer aantallen per oorspronkelijke verkoopregel, leg de reden vast en kies de passende terugbetaalmethode.' },
      { number: '03', title: 'Herstel alles samen', body: 'PWAYMENT maakt een negatieve correctietransactie, herstelt voorraad en klanttotalen en schrijft de handeling naar het auditspoor.' },
    ],
    capabilities: [
      { title: 'Gedeeltelijk retourneren', body: 'Niet de hele bon hoeft terug. De resterende retourneerbare aantallen blijven per regel zichtbaar.', evidence: 'Werkend in historiek' },
      { title: 'Factuur en PDF', body: 'Bekijk het historische document in de app of download dezelfde snapshot als PDF.', evidence: 'Werkend in historiek en klantprofiel' },
      { title: 'Controleerbare export', body: 'Verkopen, Z-rapporten en auditregels zijn afzonderlijk als CSV of JSON beschikbaar.', evidence: 'Werkend in historiek' },
    ],
    related: [{ href: '/pos', label: 'POS & betalingen' }, { href: '/daily-close-reporting', label: 'Dagafsluiting' }, { href: '/guides/retouren', label: 'Gids: retouren' }],
  },
  '/daily-close-reporting': {
    eyebrow: 'Dagafsluiting & rapportage',
    title: 'Sluit de dag af met cijfers die elkaar verklaren.',
    intro: 'Controleer transacties, betaalmethodes, btw, brutowinst en shifts vóór je definitief afsluit. Verschillen worden zichtbaar voordat ze in je historiek belanden.',
    image: '/website/pwayment-daily-close-current.png',
    imageAlt: 'PWAYMENT dagafsluiting met omzet, betaalmethodes, btw en afsluitcontrole',
    proof: 'Actuele X-rapportweergave met automatische afsluitcontrole.',
    flow: [
      { number: '01', title: 'Controleer de werkdag', body: 'Bekijk omzet, transacties, gemiddelde bon, brutowinst, betaalmix en recente verkopen in één overzicht.' },
      { number: '02', title: 'Reconcilieer cash', body: 'Vergelijk verwacht en geteld cash. Leg een reden vast wanneer er een kasverschil is.' },
      { number: '03', title: 'Maak de afsluiting definitief', body: 'Het Z-rapport bewaart betaalmethodes, btw, shiftinformatie en een hashverwijzing naar de vorige afsluiting.' },
    ],
    capabilities: [
      { title: 'X vóór Z', body: 'Een voorlopig rapport geeft controle zonder de dag al definitief te sluiten.', evidence: 'Werkend in dagafsluiting' },
      { title: 'Belgische btw-uitsplitsing', body: 'Omzet inclusief en exclusief btw en de geregistreerde btw-buckets blijven afzonderlijk zichtbaar.', evidence: 'Werkend in dagafsluiting' },
      { title: 'Hashketen', body: 'Opeenvolgende rapporten verwijzen cryptografisch naar elkaar en kunnen opnieuw worden geverifieerd.', evidence: 'Werkend in rapportservice' },
    ],
    related: [{ href: '/history-returns-invoices', label: 'Historiek & retouren' }, { href: '/insights', label: 'Retail intelligence' }, { href: '/guides/z-rapport', label: 'Gids: Z-rapport' }],
  },
  '/purchasing-suppliers': {
    eyebrow: 'Inkoop & leveranciers',
    title: 'Van verkoopsnelheid naar een bestelbeslissing.',
    intro: 'PWAYMENT combineert voorraad, minimumgrenzen, recente verkoop, langere historie en seizoenseffecten tot concrete voorstellen—zonder ooit automatisch te bestellen.',
    image: '/website/pwayment-purchasing-current.png',
    imageAlt: 'PWAYMENT besteladvies met voorraaddekking, verwachte stockout en leveranciersorders',
    proof: 'Actuele besteladviesweergave met confidence, trend en inkoopwaarde.',
    flow: [
      { number: '01', title: 'Zie wat aandacht vraagt', body: 'Sorteer op onder minimum, stockout binnen 30 of 60 dagen en betrouwbaarheid van het advies.' },
      { number: '02', title: 'Stel aantallen bij', body: 'Controleer huidig stockniveau, recente verkoop, days-of-cover, trend en aankoopwaarde per product.' },
      { number: '03', title: 'Ontvang per leverancier', body: 'Maak gegroepeerde conceptorders en verwerk een volledige of gedeeltelijke ontvangst als voorraadbeweging.' },
    ],
    capabilities: [
      { title: 'Confidence zichtbaar', body: 'Het advies vermeldt of de voorspelling hoog, redelijk of beperkt betrouwbaar is en waarom.', evidence: 'Werkend in voorraadprognose' },
      { title: 'Geen black box', body: 'Verwachte stockout, verkooptempo en voorgesteld aantal blijven per artikel uitlegbaar.', evidence: 'Werkend in besteladvies' },
      { title: 'Deelontvangst', body: 'Ontvangen aantallen kunnen afwijken van besteld zonder de volledige order onterecht af te sluiten.', evidence: 'Werkend in inkooporders' },
    ],
    related: [{ href: '/inventory', label: 'Producten & voorraad' }, { href: '/insights', label: 'Retail intelligence' }, { href: '/guides/voorraadprognose', label: 'Gids: voorraadprognose' }],
  },
  '/team-permissions': {
    eyebrow: 'Team, rollen & goedkeuringen',
    title: 'Een korte kassaflow met controle waar het telt.',
    intro: 'Eigenaars, managers en kassamedewerkers krijgen een herkenbare werkplek. Gevoelige handelingen blijven gekoppeld aan rol, medewerker en auditgebeurtenis.',
    image: '/website/pwayment-team-current.png',
    imageAlt: 'PWAYMENT team- en permissiematrix met eigenaar, manager en kassamedewerkers',
    proof: 'Actuele teamweergave met rollen en actieve medewerkers.',
    flow: [
      { number: '01', title: 'Wijs een rol toe', body: 'Maak het onderscheid tussen eigenaar, manager en kassamedewerker expliciet bij het medewerkerprofiel.' },
      { number: '02', title: 'Bevestig gevoelige acties', body: 'Kortingen, correcties en andere risicohandelingen kunnen managergoedkeuring en een reden vereisen.' },
      { number: '03', title: 'Volg activiteit', body: 'Historiek en inzichten tonen wie afrekende en welke medewerkeractiviteit aan de transacties gekoppeld is.' },
    ],
    capabilities: [
      { title: 'Medewerker-PIN', body: 'Lokale snelle toegang ondersteunt de winkelvloer zonder gedeelde identiteit als ontwerpdoel.', evidence: 'Werkend in lokale POS-flow' },
      { title: 'Managergoedkeuring', body: 'Korting en voids bewaren de goedkeurende medewerker en reden in de transactie- of auditdata.', evidence: 'Werkend in checkout en audit' },
      { title: 'Teamanalyse', body: 'Omzet en afgehandelde verkopen zijn per medewerker en weekdag te analyseren.', evidence: 'Werkend in inzichten' },
    ],
    related: [{ href: '/pos', label: 'POS & betalingen' }, { href: '/insights', label: 'Teaminzichten' }, { href: '/security', label: 'Veiligheid' }],
  },
};

interface GuidePageData {
  eyebrow: string;
  title: string;
  intro: string;
  readTime: string;
  sections: Array<{ title: string; body: string; points: string[] }>;
  cta: { href: string; label: string };
}

const guidePages: Record<string, GuidePageData> = {
  '/guides/retouren': { eyebrow: 'Retailgids', title: 'Een retour is geen losse minverkoop.', intro: 'Een correcte retour bewaart de relatie met de oorspronkelijke verkoop, begrenst aantallen en herstelt alle betrokken administraties samen.', readTime: '5 minuten', sections: [{ title: 'Begin bij de originele bon', body: 'Zo blijven prijs, btw, korting, medewerker en betaalwijze controleerbaar.', points: ['Zoek op factuur, datum of klant', 'Toon alleen nog retourneerbare aantallen', 'Bewaar de reden per retour'] }, { title: 'Herstel meer dan omzet', body: 'Een retour raakt voorraad, klanttotalen, rapportage en soms een cadeaubonsaldo.', points: ['Voorraad automatisch terugboeken', 'Negatieve correctietransactie bewaren', 'Auditgebeurtenis koppelen'] }, { title: 'Houd documenten samen', body: 'De originele verkoop blijft onveranderd; de retour verwijst ernaar als afzonderlijk document.', points: ['Origineel document behouden', 'Retour-PDF kunnen reconstrueren', 'Exports laten aansluiten'] }], cta: { href: '/history-returns-invoices', label: 'Bekijk retouren in PWAYMENT' } },
  '/guides/z-rapport': { eyebrow: 'Retailgids', title: 'Wat hoort een dagafsluiting te verklaren?', intro: 'Een goed Z-rapport toont niet alleen omzet, maar ook hoe die omzet werd betaald, belast en door het team werd afgehandeld.', readTime: '6 minuten', sections: [{ title: 'Transacties en betaalmix', body: 'Het totaal van cash, kaart en cadeaubon moet verklaarbaar aansluiten op de geregistreerde verkopen.', points: ['Aantal transacties', 'Bruto- en netto-omzet', 'Betaalmethodes afzonderlijk'] }, { title: 'Cash en verschillen', body: 'Geteld cash is een controle, geen vervanging van het verwachte kassasaldo.', points: ['Verwacht versus geteld', 'Verschil en verplichte reden', 'Medewerker en register'] }, { title: 'Btw en historie', body: 'Bewaar de gebruikte btw-buckets en de relatie met eerdere afsluitingen.', points: ['Omzet incl. en excl. btw', 'Btw per tarief', 'Controleerbare rapportketen'] }], cta: { href: '/daily-close-reporting', label: 'Bekijk de PWAYMENT dagafsluiting' } },
  '/guides/voorraadprognose': { eyebrow: 'Retailgids', title: 'Een besteladvies moet uitlegbaar blijven.', intro: 'Verkooptempo alleen is onvoldoende. Minimumvoorraad, resterende dekking, seizoen, trend en datakwaliteit bepalen samen hoeveel vertrouwen een voorstel verdient.', readTime: '7 minuten', sections: [{ title: 'Days-of-cover', body: 'Maak zichtbaar hoeveel verkoopdagen de huidige voorraad vermoedelijk nog dekt.', points: ['Huidige voorraad', 'Recente vraag', 'Verwachte stockoutdatum'] }, { title: 'Confidence', body: 'Sporadische vraag en korte historie vragen meer menselijke controle dan stabiele hardlopers.', points: ['Korte en lange trend', 'Intermitterende vraag herkennen', 'Seizoenscorrectie uitleggen'] }, { title: 'Van advies naar order', body: 'De inkoper blijft eigenaar van aantallen, leverancier en moment van bestellen.', points: ['Voorstel handmatig aanpassen', 'Groeperen per leverancier', 'Deelontvangsten verwerken'] }], cta: { href: '/purchasing-suppliers', label: 'Bekijk inkoop & leveranciers' } },
  '/guides/cadeaubonnen': { eyebrow: 'Retailgids', title: 'Een cadeaubon is een saldo met geschiedenis.', intro: 'Uitgifte, opwaardering, gebruik en blokkering moeten als afzonderlijke gebeurtenissen met saldo vóór en na bewaard blijven.', readTime: '5 minuten', sections: [{ title: 'Uitgifte', body: 'Leg startbedrag, betaling, geldigheid en eventuele klantkoppeling vast.', points: ['Anoniem of gekoppeld', 'Unieke code', 'Startsaldo en vervaldatum'] }, { title: 'Gebruik en opwaardering', body: 'Iedere mutatie hoort één keer verwerkt te worden en het actuele saldo te valideren.', points: ['Saldo vóór en na', 'Koppeling aan verkoop', 'Idempotente verwerking'] }, { title: 'Blokkering en controle', body: 'Een geblokkeerde bon blijft historisch zichtbaar zonder nog als betaalmiddel te werken.', points: ['Blokkeren en heractiveren', 'Volledige eventhistoriek', 'Filteren op status en saldo'] }], cta: { href: '/customers', label: 'Bekijk klanten & cadeaubonnen' } },
  '/guides/webshopvoorraad': { eyebrow: 'Retailgids', title: 'Online voorraad is een reserveringsvraagstuk.', intro: 'Een bestelling mag voorraad niet te vroeg definitief afboeken, maar mag dezelfde voorraad ook niet opnieuw aan een andere klant beloven.', readTime: '6 minuten', sections: [{ title: 'Reserveer bij checkout', body: 'Valideer beschikbare voorraad opnieuw wanneer de order definitief wordt aangemaakt.', points: ['Één request-ID per checkout', 'Atomaire order en reservatie', 'Geen negatieve voorraad'] }, { title: 'Volg de orderstatus', body: 'Bevestigen en verwerken houden de reservering vast; annuleren geeft haar vrij.', points: ['Open en betaald onderscheiden', 'Annulering herstelt beschikbaarheid', 'Statushistoriek behouden'] }, { title: 'Commit bij fulfilment', body: 'Verzenden of afhalen zet de reservering om naar een definitieve voorraadbeweging.', points: ['Afhalen en levering', 'Voorraadbeweging registreren', 'Fysiek en online gelijk houden'] }], cta: { href: '/webshop', label: 'Bekijk de PWAYMENT Webshop' } },
  '/guides/belgische-retailflow': { eyebrow: 'Belgische retailgids', title: 'Van verkoop tot afsluiting: één controleerbare retailflow.', intro: 'Een Belgische winkeldag raakt verkoop, betaling, voorraad, btw, documenten en rapportage. De kwaliteit zit in hoe die stappen op elkaar aansluiten.', readTime: '8 minuten', sections: [{ title: 'Leg de verkoop één keer vast', body: 'Product, prijs, korting, btw, klant, medewerker en betaalwijze horen bij dezelfde transactiebron.', points: ['Prijs en btw per verkoopregel', 'Betaalwijze aan de verkoop koppelen', 'Kassier en register bewaren'] }, { title: 'Laat elke vervolgactie verwijzen', body: 'Retour, factuur, voorraadbeweging en cadeaubongebruik moeten naar de oorspronkelijke gebeurtenis terug te leiden zijn.', points: ['Retour naast het origineel', 'Voorraadmutatie automatisch koppelen', 'Documenten reproduceerbaar houden'] }, { title: 'Sluit controleerbaar af', body: 'De dagafsluiting verklaart omzet, betaalmix, cashverschillen en btw zonder losse spreadsheets.', points: ['Verwacht en geteld cash', 'Btw per tarief', 'Z-rapport en auditexport'] }], cta: { href: '/product', label: 'Bekijk het volledige retailplatform' } },
};

const integrationStatuses = [
  { name: 'PWAYMENT Webshop', status: 'Actief', tone: 'live', detail: 'Native storefront, orderflow en voorraadreservering in dezelfde productomgeving.' },
  { name: 'CSV catalogus', status: 'Actief', tone: 'live', detail: 'Export werkt; import is beschikbaar achter een gecontroleerde releaseflag.' },
  { name: 'Supabase realtime', status: 'Actief', tone: 'live', detail: 'Tenantdata en entitlementwijzigingen synchroniseren via de centrale backend.' },
  { name: 'Shopify & WooCommerce', status: 'Pilot', tone: 'pilot', detail: 'Configuratie en mapping zijn voorzien; end-to-end connectorvalidatie blijft vereist.' },
  { name: 'Exact, Octopus & Peppol', status: 'Pilot', tone: 'pilot', detail: 'Boekhoudconfiguratie is voorzien; publieke live-status volgt na end-to-end verificatie.' },
  { name: 'REST API & webhooks', status: 'Pilot', tone: 'pilot', detail: 'Sleutel-, webhook- en logbeheer zijn zichtbaar; deliveryservice en documentatie bepalen live-status.' },
  { name: 'Betaalterminals', status: 'Validatie', tone: 'validate', detail: 'Providerkeuze bestaat; elk merk en model krijgt pas live-status na device- en reconciliatietest.' },
  { name: 'Leveranciersfeeds', status: 'Validatie', tone: 'validate', detail: 'REST, GraphQL en SFTP blijven als maatwerkpad gelabeld tot een feed aantoonbaar draait.' },
];

const hardwareCompatibility = [
  ['Keyboard-wedge barcodescanner', 'Actief', 'Alle moderne browsers', 'Exacte barcode- en SKU-scans gaan direct naar de winkelwagen.'],
  ['USB ESC/POS bonprinter', 'Actief', 'Chromium · HTTPS/localhost', 'WebUSB met modelkeuze, endpointdetectie en testprint.'],
  ['Epson TM en compatibele printers', 'Actief', 'Chromium', 'Raw ESC/POS voor 58 en 80 mm, afhankelijk van model en USB-interface.'],
  ['Kassalade via printer', 'Afhankelijk van printer', 'Chromium', 'Ladepuls loopt via een compatibele ESC/POS-printer.'],
  ['Barcode-etiketten', 'Printlayout actief', 'Browserprint', 'Productlabels en EAN-13 output; printerdriver blijft apparaatafhankelijk.'],
  ['Bluetooth bonprinter', 'Validatie', 'Apparaatafhankelijk', 'Pas als ondersteund publiceren na model- en browsertest.'],
  ['Worldline / CCV / SumUp / Viva / Verifone', 'Pilot', 'Providerafhankelijk', 'Provider- en terminalreconciliatie vereist vóór live-status.'],
  ['Weegschaal', 'Validatie', 'Apparaatafhankelijk', 'Configuratie is voorzien; gecertificeerde deviceflow moet nog per model worden bewezen.'],
];

const faqs = [
  ['Werkt PWAYMENT zonder internet?', 'Ja. De kritieke kassaflow blijft werken op een ingeschreven register. Zodra de verbinding terugkomt, synchroniseert PWAYMENT gecontroleerd verder.'],
  ['Welke hardware kan ik gebruiken?', 'De hardwarematrix toont per workflow wat actief, pilot of nog in validatie is. Keyboard-wedge scanning en USB ESC/POS zijn aantoonbaar actief; terminal-, Bluetooth- en weegschaalondersteuning hangt af van provider, browser en modeltest.'],
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

const PublicSite: React.FC = () => {
  const path = window.location.pathname.replace(/\/$/, '') || '/';
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    document.documentElement.dataset.theme = 'light';
    document.documentElement.classList.add('theme-light');
    document.documentElement.classList.remove('theme-dark');
    document.documentElement.style.colorScheme = 'light';
    applyRouteSeo(path);
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [path]);

  useEffect(() => {
    const trackClick = (event: MouseEvent) => {
      const link = (event.target as Element | null)?.closest<HTMLAnchorElement>('a[href]');
      if (!link) return;
      const href = link.getAttribute('href') ?? '';
      if (/^\/(register|demo|pricing)(\?|$)/.test(href)) void trackPublicEvent('cta_clicked', href);
    };
    document.addEventListener('click', trackClick);
    return () => document.removeEventListener('click', trackClick);
  }, []);

  let page: React.ReactNode;
  if (path === '/') page = <HomePage />;
  else if (path === '/pricing' || path === '/compare') page = <PricingPage />;
  else if (path === '/demo' || path === '/contact') page = <ContactPage demo={path === '/demo'} />;
  else if (featurePages[path]) page = <FeaturePage data={featurePages[path]} route={path} />;
  else if (operationalPages[path]) page = <OperationalPage data={operationalPages[path]} />;
  else if (guidePages[path]) page = <GuidePage data={guidePages[path]} />;
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

export const SiteHeader = ({ mobileOpen, setMobileOpen }: { mobileOpen: boolean; setMobileOpen: (value: boolean) => void }) => {
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const navigationRef = useRef<HTMLDivElement>(null);
  const closeNavigation = () => {
    setActiveMenu(null);
    setMobileOpen(false);
  };

  useEffect(() => {
    const closeOnPointerDown = (event: PointerEvent) => {
      if (!navigationRef.current?.contains(event.target as Node)) closeNavigation();
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeNavigation();
    };
    document.addEventListener('pointerdown', closeOnPointerDown);
    document.addEventListener('keydown', closeOnEscape);
    window.addEventListener('scroll', closeNavigation, { passive: true });
    window.addEventListener('resize', closeNavigation);
    return () => {
      document.removeEventListener('pointerdown', closeOnPointerDown);
      document.removeEventListener('keydown', closeOnEscape);
      window.removeEventListener('scroll', closeNavigation);
      window.removeEventListener('resize', closeNavigation);
    };
  }, []);

  const toggleMenu = (label: string) => {
    setMobileOpen(false);
    setActiveMenu((current) => (current === label ? null : label));
  };

  return (
    <div ref={navigationRef} className="pw-navigation-layer">
      <motion.header className="pw-header" initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .55, ease: motionEase }}>
      <div className="pw-header-inner">
        <a href="/" className="pw-logo" aria-label="PWAYMENT home" onClick={closeNavigation}>
          <img src="/branding/pwayment-logo.svg" alt="PWAYMENT" />
        </a>
        <nav className="pw-nav" aria-label="Hoofdnavigatie">
          <NavGroup label="Product" links={[
            ['/product', 'Overzicht', 'Alles in één retailflow'], ['/pos', 'POS & betalingen', 'Snel en betrouwbaar verkopen'], ['/inventory', 'Producten & voorraad', 'Van barcode tot besteladvies'], ['/insights', 'Inzichten', 'Van data naar actie'], ['/customers', 'Klanten & loyaliteit', 'Bouw duurzame relaties'], ['/webshop', 'Webshop', 'Fysiek en online verbonden'], ['/integrations', 'Integraties & API', 'Koppel je retailstack'],
          ]} active={activeMenu === 'Product'} onToggle={() => toggleMenu('Product')} onNavigate={closeNavigation} />
          <NavGroup label="Oplossingen" links={[
            ['/solutions/independent-retail', 'Onafhankelijke retail', 'Professioneel zonder complexiteit'], ['/solutions/specialist-retail', 'Speciaalzaken', 'Varianten, merken en advies'], ['/solutions/multi-location', 'Enterprise & ketens', 'Centraal sturen, lokaal verkopen'], ['/solutions/accountants', 'Accountants & partners', 'Schone data en minder handwerk'],
          ]} active={activeMenu === 'Oplossingen'} onToggle={() => toggleMenu('Oplossingen')} onNavigate={closeNavigation} />
          <a href="/pricing" onClick={closeNavigation}>Prijzen</a>
          <a href="/resources" onClick={closeNavigation}>Resources</a>
        </nav>
        <div className="pw-header-actions">
          <a href="/login" className="pw-login" onClick={closeNavigation}>Log in</a>
          <a href="/register" className="pw-button pw-button-dark pw-button-small" onClick={closeNavigation}>Start gratis <ArrowRight size={15} /></a>
        </div>
        <button className="pw-mobile-toggle" onClick={() => { setActiveMenu(null); setMobileOpen(!mobileOpen); }} aria-expanded={mobileOpen} aria-label={mobileOpen ? 'Navigatie sluiten' : 'Navigatie openen'}>
          {mobileOpen ? <X /> : <Menu />}
        </button>
      </div>
      </motion.header>
      {mobileOpen && (
        <nav className="pw-mobile-nav" aria-label="Mobiele navigatie">
          <a href="/product" onClick={closeNavigation}>Product</a><a href="/pos" onClick={closeNavigation}>POS & betalingen</a><a href="/inventory" onClick={closeNavigation}>Voorraad</a><a href="/insights" onClick={closeNavigation}>Inzichten</a><a href="/customers" onClick={closeNavigation}>Klanten</a><a href="/webshop" onClick={closeNavigation}>Webshop</a><a href="/integrations" onClick={closeNavigation}>Integraties</a><a href="/pricing" onClick={closeNavigation}>Prijzen</a><a href="/resources" onClick={closeNavigation}>Resources</a>
          <div className="pw-mobile-actions"><a href="/login" onClick={closeNavigation}>Log in</a><a href="/register" className="pw-button pw-button-dark" onClick={closeNavigation}>Start gratis</a></div>
        </nav>
      )}
    </div>
  );
};

const NavGroup = ({ label, links, active, onToggle, onNavigate }: { label: string; links: string[][]; active: boolean; onToggle: () => void; onNavigate: () => void }) => (
  <div className="pw-nav-group">
    <button type="button" aria-expanded={active} aria-controls={`pw-menu-${label.toLowerCase()}`} onClick={onToggle}>{label} <ChevronDown size={14} /></button>
    <div id={`pw-menu-${label.toLowerCase()}`} className={`pw-mega${active ? ' is-open' : ''}`}>
      {links.map(([href, title, description]) => <a href={href} key={href} onClick={onNavigate}><strong>{title}</strong><span>{description}</span></a>)}
    </div>
  </div>
);

const HeroProductVideo = () => {
  return (
    <video
      className="pw-hero-video"
      autoPlay
      loop
      muted
      controls={false}
      playsInline
      preload="auto"
      aria-hidden="true"
      tabIndex={-1}
      disablePictureInPicture
      disableRemotePlayback
      controlsList="nodownload nofullscreen noremoteplayback"
      onLoadedMetadata={(event) => keepVideoSilent(event.currentTarget)}
      onPlay={(event) => keepVideoSilent(event.currentTarget)}
      onVolumeChange={(event) => keepVideoSilent(event.currentTarget)}
    >
      <source src={heroVideo} type="video/mp4" />
    </video>
  );
};

const HomePage = () => (
  <>
    <section className="pw-hero pw-shell">
      <HeroProductVideo />
      <div className="pw-hero-shade" aria-hidden="true" />
      <motion.div className="pw-hero-copy" initial="hidden" animate="visible" variants={stagger}>
        <motion.div className="pw-kicker" variants={fadeUp}><span /> Retailplatform voor Belgische winkels</motion.div>
        <motion.h1 variants={fadeUp}>Minder losse systemen.<br /><em>Meer grip op je winkel.</em></motion.h1>
        <motion.p variants={fadeUp}>PWAYMENT verbindt kassa, voorraad, klanten, webshop en rapportage in één rustige werkplek. Zo verkoop je vlotter en neem je betere beslissingen met dezelfde gegevens.</motion.p>
        <motion.div className="pw-hero-actions" variants={fadeUp}>
          <a href="/register?plan=professional" className="pw-button pw-button-dark">Start gratis met PWAYMENT <ArrowRight size={17} /></a>
          <a href="/demo" className="pw-text-link">Plan een persoonlijke demo <ArrowRight size={15} /></a>
        </motion.div>
        <motion.div className="pw-hero-proof" variants={fadeUp}><span>Basis blijft gratis</span><span>30 dagen Professional</span><span>Offline-first kassa</span></motion.div>
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

    <motion.section className="pw-capability-proof pw-shell" initial="hidden" whileInView="visible" viewport={revealViewport} variants={stagger}>
      <motion.div className="pw-section-heading" variants={fadeUp}>
        <div><span className="pw-eyebrow">Meer dan een snelle kassa</span><h2>De operationele diepte<br />zit al in het systeem.</h2></div>
        <a href="/product" className="pw-text-link">Bekijk het volledige platform <ArrowRight size={15} /></a>
      </motion.div>
      <div className="pw-capability-grid">
        {[
          [ReceiptText, 'Retouren & documenten', 'Boek een gedeeltelijke retour op de originele verkoop, herstel voorraad en open of download de factuur.','/history-returns-invoices'],
          [FileText, 'Dagafsluiting & audit', 'Reconcilieer cash, betaalmix en btw en exporteer verkopen, Z-rapporten of auditregels als CSV en JSON.', '/daily-close-reporting'],
          [Box, 'Inkoop & ontvangst', 'Zet 60-dagen prognoses om in leveranciersorders en verwerk ook gedeeltelijke ontvangsten.', '/purchasing-suppliers'],
          [Gift, 'Klanten & cadeaubonnen', 'Filter op koopgedrag, volg klantwaarde en beheer elk cadeaubonsaldo met een volledige historiek.', '/customers'],
          [BarChart3, 'Beslissingen, niet alleen grafieken', 'Analyseer korting, verkoopmomenten, medewerkers, seizoenen, voorraadtempo en datadekking.', '/insights'],
          [ShoppingBag, 'Webshoporderflow', 'Reserveer voorraad bij checkout en geef die correct vrij of definitief uit bij annuleren, afhalen of verzenden.', '/webshop'],
        ].map(([Icon, title, body, href]) => (
          <motion.a className="pw-capability-card" href={String(href)} key={String(title)} variants={fadeUp} whileHover={{ y: -7 }}>
            <Icon size={23} />
            <span>{String(title)}</span>
            <p>{String(body)}</p>
            <ArrowRight className="pw-capability-arrow" size={16} />
          </motion.a>
        ))}
      </div>
    </motion.section>

    <motion.section className="pw-integrations pw-shell" initial="hidden" whileInView="visible" viewport={revealViewport} variants={stagger}>
      <motion.div className="pw-section-heading" variants={fadeUp}><div><span className="pw-eyebrow">Integraties zonder giswerk</span><h2>Zie wat actief is.<br />En wat nog in pilot zit.</h2></div><a href="/integrations" className="pw-text-link">Bekijk alle statussen <ArrowRight size={15} /></a></motion.div>
      <div className="pw-status-preview">{integrationStatuses.slice(0, 6).map(item => <motion.a href="/integrations" key={item.name} className="pw-status-preview-item" variants={fadeUp} whileHover={{ y: -5 }}><span className={`pw-status-pill ${item.tone}`}>{item.status}</span><strong>{item.name}</strong><p>{item.detail}</p></motion.a>)}</div>
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

const BillingCycleControl = ({ cycle, onChange }: { cycle: BillingCycle; onChange: (cycle: BillingCycle) => void }) => (
  <div className="pw-cycle" role="group" aria-label="Facturatieperiode">
    <button type="button" className={cycle === 'monthly' ? 'active' : ''} aria-pressed={cycle === 'monthly'} onClick={() => { onChange('monthly'); void trackPublicEvent('pricing_cycle_changed', 'monthly'); }}>Maandelijks</button>
    <button type="button" className={cycle === 'yearly' ? 'active' : ''} aria-pressed={cycle === 'yearly'} onClick={() => { onChange('yearly'); void trackPublicEvent('pricing_cycle_changed', 'yearly'); }}>Jaarlijks <span>Bespaar</span></button>
  </div>
);

const PlanCards = ({ cycle, context }: { cycle: BillingCycle; context: 'home' | 'pricing' }) => {
  const plans = useMemo(() => getPricingPlans(cycle), [cycle]);
  return (
    <motion.div className={`pw-plans pw-plans-${context}`} initial="hidden" animate="visible" variants={stagger}>
      {plans.map(plan => (
        <motion.article className={plan.featured ? 'featured' : ''} key={plan.name} variants={fadeUp} whileHover={{ y: -9, transition: { duration: .25 } }}>
          {plan.featured && <b className="pw-popular">Meest gekozen</b>}
          <header>
            <span>{plan.name}</span>
            <AnimatePresence mode="popLayout"><motion.h2 key={plan.price} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: .22 }}>{plan.price}<small>/maand</small></motion.h2></AnimatePresence>
            <p>{plan.note}</p>
          </header>
          <div className="pw-plan-audience">{plan.audience}</div>
          <a href={plan.href} className={`pw-button ${plan.featured ? 'pw-button-dark' : 'pw-button-light'}`}>{plan.cta}<ArrowRight size={15} /></a>
          <ul>{plan.features.map(feature => <li key={feature}><Check size={15} />{feature}</li>)}</ul>
        </motion.article>
      ))}
    </motion.div>
  );
};

const PricingTeaser = () => {
  const [cycle, setCycle] = useState<BillingCycle>('yearly');
  return (
    <motion.section className="pw-pricing-teaser" initial="hidden" whileInView="visible" viewport={revealViewport} variants={stagger}>
      <div className="pw-shell">
        <motion.span className="pw-eyebrow" variants={fadeUp}>Eenvoudige prijzen</motion.span>
        <motion.div className="pw-section-heading" variants={fadeUp}><h2>Begin gratis.<br />Groei wanneer je winkel groeit.</h2><a href="/pricing" className="pw-text-link">Bekijk add-ons en vergelijk alles <ArrowRight size={15} /></a></motion.div>
        <motion.div variants={fadeUp}><BillingCycleControl cycle={cycle} onChange={setCycle} /></motion.div>
        <PlanCards cycle={cycle} context="home" />
      </div>
    </motion.section>
  );
};

const OperationalLinks = () => (
  <motion.section className="pw-operational-links pw-shell" initial="hidden" whileInView="visible" viewport={revealViewport} variants={stagger}>
    <motion.div className="pw-section-heading" variants={fadeUp}><div><span className="pw-eyebrow">Verdiep de retailflow</span><h2>Vier workflows die<br />achter de kassa tellen.</h2></div></motion.div>
    <div>
      {[
        [ReceiptText, '/history-returns-invoices', 'Historiek, retouren & facturen', 'Van oorspronkelijke verkoop tot PDF en voorraadherstel.'],
        [ClipboardCheck, '/daily-close-reporting', 'Dagafsluiting & rapportage', 'Cash, betaalmix, btw, shift en Z-controle.'],
        [Box, '/purchasing-suppliers', 'Inkoop & leveranciers', 'Van forecast naar conceptorder en deelontvangst.'],
        [UserCog, '/team-permissions', 'Team, rollen & goedkeuringen', 'De juiste toegang en controle per medewerker.'],
      ].map(([Icon, href, title, body]) => <motion.a key={String(href)} href={String(href)} variants={fadeUp} whileHover={{ y: -7 }}><Icon size={22} /><span>{String(title)}</span><p>{String(body)}</p><ArrowRight size={15} /></motion.a>)}
    </div>
  </motion.section>
);

const PosPaymentVideoSection = () => {
  const reducedMotion = useReducedMotion();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [paused, setPaused] = useState(Boolean(reducedMotion));

  const togglePlayback = () => {
    const video = videoRef.current;
    if (!video) return;
    keepVideoSilent(video);
    if (video.paused) {
      void video.play();
      setPaused(false);
      return;
    }
    video.pause();
    setPaused(true);
  };

  return (
    <motion.section className="pw-payment-story pw-shell" initial="hidden" whileInView="visible" viewport={revealViewport} variants={stagger}>
      <motion.div className="pw-payment-story-copy" variants={fadeUp}>
        <span className="pw-eyebrow">POS &amp; betalingen</span>
        <h2>De laatste stap hoort de rustigste te zijn.</h2>
        <p>PWAYMENT houdt de betaalkeuze kort en duidelijk voor kassier en klant. Cash, PIN, cadeaubon en gesplitste betaling blijven in één flow; terminalproviders krijgen pas een actief-label na device- en reconciliatietests.</p>
        <a href="/hardware" className="pw-text-link">Bekijk terminal- en hardwarestatus <ArrowRight size={15} /></a>
      </motion.div>
      <motion.div className="pw-payment-video-wrap" variants={fadeUp}>
        <video
          ref={videoRef}
          autoPlay={!reducedMotion}
          loop={!reducedMotion}
          muted
          controls={false}
          playsInline
          preload="metadata"
          aria-label="Contactloze betaling aan een winkelterminal"
          disablePictureInPicture
          onLoadedMetadata={(event) => keepVideoSilent(event.currentTarget)}
          onPlay={(event) => { keepVideoSilent(event.currentTarget); setPaused(false); }}
          onPause={() => setPaused(true)}
        >
          <source src={paymentVideo} type="video/mp4" />
        </video>
        <button type="button" className="pw-video-toggle" onClick={togglePlayback} aria-label={paused ? 'Video afspelen' : 'Video pauzeren'}>
          {paused ? <Play size={14} fill="currentColor" /> : <Pause size={14} fill="currentColor" />}
          <span>{paused ? 'Afspelen' : 'Pauzeren'}</span>
        </button>
      </motion.div>
    </motion.section>
  );
};

const IntegrationStatusSection = () => (
  <motion.section className="pw-status-section pw-shell" initial="hidden" whileInView="visible" viewport={revealViewport} variants={stagger}>
    <motion.div className="pw-section-heading" variants={fadeUp}><div><span className="pw-eyebrow">Capabilitystatus</span><h2>Geen logo zonder status.</h2><p>“Actief” betekent dat de flow in PWAYMENT aantoonbaar werkt. “Pilot” en “Validatie” maken duidelijk waar nog end-to-end bewijs nodig is.</p></div></motion.div>
    <motion.div className="pw-status-grid" variants={stagger}>{integrationStatuses.map(item => <motion.article key={item.name} variants={fadeUp}><span className={`pw-status-pill ${item.tone}`}>{item.status}</span><h3>{item.name}</h3><p>{item.detail}</p></motion.article>)}</motion.div>
  </motion.section>
);

const HardwareCompatibilitySection = () => (
  <motion.section className="pw-compatibility pw-shell" initial="hidden" whileInView="visible" viewport={revealViewport} variants={stagger}>
    <motion.div className="pw-section-heading" variants={fadeUp}><div><span className="pw-eyebrow">Compatibiliteitsmatrix</span><h2>Ondersteuning per workflow,<br />browser en bewijsniveau.</h2></div></motion.div>
    <motion.div className="pw-table-wrap" variants={fadeUp}><table><thead><tr><th>Hardware</th><th>Status</th><th>Omgeving</th><th>Wat aantoonbaar is</th></tr></thead><tbody>{hardwareCompatibility.map(row => <tr key={row[0]}><td>{row[0]}</td><td><span className={`pw-status-pill ${row[1] === 'Actief' || row[1] === 'Printlayout actief' ? 'live' : row[1] === 'Pilot' ? 'pilot' : 'validate'}`}>{row[1]}</span></td><td>{row[2]}</td><td>{row[3]}</td></tr>)}</tbody></table></motion.div>
    <motion.p className="pw-compatibility-note" variants={fadeUp}>WebUSB vereist HTTPS of localhost, een expliciete toesteltoestemming en een compatibele Chromium-browser. Model- en drivergedrag blijven altijd onderdeel van de hardwaretest.</motion.p>
  </motion.section>
);

const OperationalPage = ({ data }: { data: OperationalPageData }) => (
  <>
    <AnimatedPageHero eyebrow={data.eyebrow} title={data.title} intro={data.intro} actions={<><a className="pw-button pw-button-dark" href="/demo">Bespreek je retailflow <ArrowRight size={16} /></a><a className="pw-text-link" href="/pricing">Bekijk de plannen <ArrowRight size={15} /></a></>} />
    <motion.section className="pw-wide-product pw-shell" initial={{ opacity: 0, y: 42, scale: .98 }} whileInView={{ opacity: 1, y: 0, scale: 1 }} viewport={revealViewport} transition={{ duration: .9, ease: motionEase }}><div className="pw-window-bar"><i /><i /><i /><span>Actuele PWAYMENT productweergave</span><b>Productbewijs</b></div><img src={data.image} alt={data.imageAlt} loading="eager" /><div className="pw-wide-proof"><CircleCheck size={18} />{data.proof}</div></motion.section>
    <motion.section className="pw-operational-flow pw-shell" initial="hidden" whileInView="visible" viewport={revealViewport} variants={stagger}>{data.flow.map(step => <motion.article key={step.number} variants={fadeUp}><span>{step.number}</span><h2>{step.title}</h2><p>{step.body}</p></motion.article>)}</motion.section>
    <motion.section className="pw-evidence-grid pw-shell" initial="hidden" whileInView="visible" viewport={revealViewport} variants={stagger}><motion.div variants={fadeUp}><span className="pw-eyebrow">Aantoonbare productdiepte</span><h2>Wat deze workflow concreet kan.</h2></motion.div><motion.div variants={stagger}>{data.capabilities.map(item => <motion.article key={item.title} variants={fadeUp}><BadgeCheck size={21} /><h3>{item.title}</h3><p>{item.body}</p><span>{item.evidence}</span></motion.article>)}</motion.div></motion.section>
    <motion.nav className="pw-related-links pw-shell" aria-label="Gerelateerde productpagina’s" initial="hidden" whileInView="visible" viewport={revealViewport} variants={stagger}>{data.related.map(item => <motion.a key={item.href} href={item.href} variants={fadeUp}>{item.label}<ArrowRight size={15} /></motion.a>)}</motion.nav>
    <FinalCta />
  </>
);

const GuidePage = ({ data }: { data: GuidePageData }) => (
  <>
    <AnimatedPageHero className="pw-guide-hero" eyebrow={data.eyebrow} title={data.title} intro={data.intro} actions={<span className="pw-guide-time">{data.readTime} leestijd</span>} />
    <article className="pw-guide pw-shell">
      {data.sections.map((section, index) => <motion.section key={section.title} initial={{ opacity: 0, y: 26 }} whileInView={{ opacity: 1, y: 0 }} viewport={revealViewport} transition={{ duration: .65, delay: index * .04, ease: motionEase }}><span>0{index + 1}</span><div><h2>{section.title}</h2><p>{section.body}</p></div><ul>{section.points.map(point => <li key={point}><Check size={15} />{point}</li>)}</ul></motion.section>)}
      <a className="pw-button pw-button-dark" href={data.cta.href}>{data.cta.label}<ArrowRight size={16} /></a>
    </article>
    <nav className="pw-guide-links pw-shell" aria-label="Meer praktische gidsen">
      <a href="/resources">Alle gidsen <ArrowRight size={15} /></a>
      <a href="/guides/retouren">Retouren <ArrowRight size={15} /></a>
      <a href="/guides/z-rapport">Z-rapport <ArrowRight size={15} /></a>
      <a href="/guides/voorraadprognose">Voorraadprognose <ArrowRight size={15} /></a>
    </nav>
    <FinalCta />
  </>
);

const FeaturePage = ({ data, route }: { data: FeaturePageData; route: string }) => (
  <>
    <AnimatedPageHero eyebrow={data.eyebrow} title={data.title} intro={data.intro} actions={<><a className="pw-button pw-button-dark" href="/register">Start gratis <ArrowRight size={16} /></a><a className="pw-text-link" href="/demo">Plan een demo <ArrowRight size={15} /></a></>} />
    <motion.section className="pw-wide-product pw-shell" initial={{ opacity: 0, y: 42, scale: .98 }} whileInView={{ opacity: 1, y: 0, scale: 1 }} viewport={revealViewport} transition={{ duration: .9, ease: motionEase }}><div className="pw-window-bar"><i /><i /><i /><span>app.pwayment.be</span><b>Live</b></div><motion.img src={data.image} alt={data.imageAlt} whileHover={{ scale: 1.008 }} transition={{ duration: .45 }} /><motion.div className="pw-wide-proof" initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={revealViewport} transition={{ delay: .35, duration: .55 }}><CircleCheck size={18} />{data.proof}</motion.div></motion.section>
    <section className="pw-chapters pw-shell">{data.chapters.map((chapter, index) => <motion.article key={chapter.number} initial={{ opacity: 0, y: 34 }} whileInView={{ opacity: 1, y: 0 }} viewport={revealViewport} transition={{ duration: .72, delay: index * .04, ease: motionEase }}><span>{chapter.number}</span><div><h2>{chapter.title}</h2><p>{chapter.body}</p></div><ul>{chapter.points.map((point, pointIndex) => <motion.li key={point} initial={{ opacity: 0, x: 12 }} whileInView={{ opacity: 1, x: 0 }} viewport={revealViewport} transition={{ delay: .15 + pointIndex * .07 }}><Check size={15} />{point}</motion.li>)}</ul></motion.article>)}</section>
    {route === '/pos' && <PosPaymentVideoSection />}
    {route === '/integrations' && <IntegrationStatusSection />}
    {route === '/hardware' && <HardwareCompatibilitySection />}
    <OperationalLinks />
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

  return <>
    <AnimatedPageHero className="pw-pricing-hero" eyebrow="Prijzen" title={<>Alles wat je nodig hebt.<br />Precies op het juiste moment.</>} intro="PWAYMENT Basis blijft gratis. Probeer Retail Professional 30 dagen gratis en groei zonder van systeem te veranderen. Alle softwareprijzen zijn exclusief btw." actions={<BillingCycleControl cycle={cycle} onChange={setCycle} />} />
    <section className="pw-shell"><PlanCards cycle={cycle} context="pricing" /></section>
    <motion.section className="pw-current-source pw-shell" initial="hidden" whileInView="visible" viewport={revealViewport} variants={stagger}><motion.div variants={fadeUp}><span className="pw-eyebrow">Ook duidelijk in PWAYMENT</span><h2>Dezelfde plannen. Dezelfde bedragen. Overal herkenbaar.</h2><p>De planvergelijking in PWAYMENT sluit aan op dezelfde publieke pakketten en prijsstructuur.</p></motion.div><motion.div className="pw-current-source-window" variants={fadeUp} whileHover={{ y: -5 }}><div className="pw-window-bar"><i /><i /><i /><span>Instellingen · Plan &amp; Upgrades</span><b>Actueel</b></div><img src={plansImage} alt="Actuele planvergelijking in de lokale PWAYMENT applicatie" loading="lazy" /></motion.div></motion.section>
    <motion.section className="pw-addons pw-shell" initial="hidden" whileInView="visible" viewport={revealViewport} variants={stagger}><motion.div variants={fadeUp}><span className="pw-eyebrow">Gerichte uitbreidingen</span><h2>Alleen extra betalen wanneer je extra verbindt.</h2></motion.div><motion.div variants={stagger}>{[['Extra kassascherm', '€ 29 / maand', 'Na de 3 inbegrepen schermen in Professional.'], ['External Webshop Sync', '€ 19 / maand', 'Shopify of WooCommerce in twee richtingen.'], ['Advanced Accounting', '€ 15 / maand', 'Automatische Z-journaalpost en Octopus.'], ['Advanced BI & Raw Export', '€ 25 / maand', 'Power BI en uitgebreide Excel-datasets.']].map(([name, price, body]) => <motion.article key={name} variants={fadeUp}><h3>{name}</h3><strong>{price}</strong><p>{body}</p></motion.article>)}</motion.div></motion.section>
    <ComparisonTable />
    <motion.section className="pw-faq pw-shell" initial="hidden" whileInView="visible" viewport={revealViewport} variants={stagger}><motion.div variants={fadeUp}><span className="pw-eyebrow">Prijsinformatie</span><h2>Geen verrassingen in de kleine letters.</h2></motion.div><motion.div className="pw-faq-list" variants={stagger}>{faqs.slice(3).map(([question, answer]) => <motion.details key={question} variants={fadeUp}><summary>{question}<span>+</span></summary><p>{answer}</p></motion.details>)}</motion.div></motion.section>
    <FinalCta />
  </>;
};

const ComparisonTable = () => {
  const rows = [
    ['Kassaschermen', '1', '3 inbegrepen', 'Onbeperkt'], ['Actieve producten', '250', 'Onbeperkt', 'Onbeperkt'], ['Betaalterminalkoppeling', '—', 'Volgens statusmatrix', 'Volgens statusmatrix'], ['Voorraad & besteladvies', 'Basis', 'Geavanceerd', 'Multi-location'], ['Klanten & loyaliteit', '—', 'Inbegrepen', 'Inbegrepen'], ['PWAYMENT Webshop', '—', 'Inbegrepen', 'Multi-storefront'], ['REST API & webhooks', '—', 'Pilot', 'Pilot / maatwerk'], ['Peppol & Exact', '—', 'Pilot', 'Pilot / maatwerk'], ['Auditgeschiedenis', '30 dagen', 'Uitgebreid', 'Onbeperkt'], ['Ondersteuning', 'E-mail', 'Prioriteit chat & e-mail', 'Volgens overeenkomst'], ['SLA', '—', 'Geen publieke SLA', 'Volgens overeenkomst'],
  ];
  return <motion.section className="pw-compare pw-shell" initial="hidden" whileInView="visible" viewport={revealViewport} variants={stagger}><motion.div className="pw-section-heading" variants={fadeUp}><div><span className="pw-eyebrow">Volledige vergelijking</span><h2>Zie exact wat inbegrepen is.</h2></div></motion.div><motion.div className="pw-table-wrap" variants={fadeUp}><table><thead><tr><th>Functie</th><th>Basis</th><th>Professional</th><th>Enterprise</th></tr></thead><tbody>{rows.map(row => <tr key={row[0]}>{row.map((cell, index) => <td key={cell} data-label={index === 0 ? undefined : ['Basis', 'Professional', 'Enterprise'][index - 1]}>{cell}</td>)}</tr>)}</tbody></table></motion.div></motion.section>;
};

const ContactPage = ({ demo }: { demo: boolean }) => {
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitError(null);
    const form = event.currentTarget;
    const values = new FormData(form);
    if (String(values.get('website') ?? '').trim()) return;
    if (!publicLeadStorageAvailable()) {
      setSubmitError('De beveiligde aanvraagopslag is nog niet gekoppeld. Mail voorlopig naar hello@pwayment.be.');
      return;
    }
    setSubmitting(true);
    void trackPublicEvent('lead_form_started', demo ? 'demo' : 'contact');
    try {
      await submitPublicLead({
        requestType: demo ? 'demo' : 'contact',
        firstName: String(values.get('firstName') ?? ''),
        lastName: String(values.get('lastName') ?? ''),
        email: String(values.get('email') ?? ''),
        company: String(values.get('company') ?? ''),
        locations: String(values.get('locations') ?? ''),
        currentSystem: String(values.get('current') ?? ''),
        message: String(values.get('message') ?? ''),
        sourcePath: window.location.pathname,
        consentedAt: new Date().toISOString(),
      });
      setSubmitted(true);
      void trackPublicEvent('lead_form_succeeded', demo ? 'demo' : 'contact');
      form.reset();
    } catch (error) {
      console.error('Publieke aanvraag opslaan mislukt:', error);
      setSubmitError('Je aanvraag kon niet worden opgeslagen. Probeer opnieuw of mail naar hello@pwayment.be.');
      void trackPublicEvent('lead_form_failed', demo ? 'demo' : 'contact');
    } finally {
      setSubmitting(false);
    }
  };
  return (
    <motion.section className="pw-contact pw-shell" initial="hidden" animate="visible" variants={stagger}>
      <motion.div className="pw-contact-copy" variants={{ hidden: { opacity: 0, x: -34 }, visible: { opacity: 1, x: 0, transition: { duration: .75, ease: motionEase } } }}>
        <span className="pw-eyebrow">{demo ? 'Persoonlijke demo' : 'Contact'}</span>
        <h1>{demo ? 'Laat ons je winkel zien. Wij tonen wat PWAYMENT ermee kan.' : 'Waar kunnen we bij helpen?'}</h1>
        <p>{demo ? 'In dertig minuten lopen we door je verkoopflow, assortiment, hardware, webshop en rapportage. Je krijgt een eerlijk beeld van de juiste setup en het passende plan.' : 'Een vraag over het product, migratie, hardware of je account? Stuur ons de context; het juiste team pakt het op.'}</p>
        <ul><li><Check />Afgestemd op jouw type winkel</li><li><Check />Ruimte voor technische en commerciële vragen</li><li><Check />Geen generieke verkooppresentatie</li></ul>
      </motion.div>
      <motion.div className="pw-form-card" variants={{ hidden: { opacity: 0, x: 34, scale: .985 }, visible: { opacity: 1, x: 0, scale: 1, transition: { duration: .82, ease: motionEase } } }}>
        <AnimatePresence mode="wait">
          {submitted ? (
            <motion.div key="success" className="pw-form-success" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}><CircleCheck size={34} /><h2>Bedankt. We nemen het vanaf hier over.</h2><p>Je aanvraag is veilig ontvangen. We antwoorden via het opgegeven zakelijke e-mailadres.</p><a href="/product" className="pw-text-link">Ontdek intussen het platform <ArrowRight size={15} /></a></motion.div>
          ) : (
            <motion.form key="form" onSubmit={submit} exit={{ opacity: 0, y: -12 }}>
              <div className="pw-form-grid"><label>Voornaam<input name="firstName" autoComplete="given-name" maxLength={80} required /></label><label>Achternaam<input name="lastName" autoComplete="family-name" maxLength={80} required /></label></div>
              <label>Zakelijk e-mailadres<input type="email" name="email" autoComplete="email" maxLength={254} required /></label>
              <label>Winkel of bedrijf<input name="company" autoComplete="organization" maxLength={160} required /></label>
              {demo && <div className="pw-form-grid"><label>Aantal locaties<select name="locations"><option>1 locatie</option><option>2–3 locaties</option><option>4–10 locaties</option><option>Meer dan 10</option></select></label><label>Huidige situatie<select name="current"><option>Nog geen POS</option><option>Spreadsheet/eenvoudige kassa</option><option>Andere POS</option><option>Meerdere systemen</option></select></label></div>}
              <label>Waar wil je vooral duidelijkheid over?<textarea name="message" rows={4} minLength={10} maxLength={4000} required /></label>
              <label className="pw-form-honeypot" aria-hidden="true">Website<input name="website" tabIndex={-1} autoComplete="off" /></label>
              <label className="pw-consent"><input name="consent" type="checkbox" required />Ik ga akkoord dat PWAYMENT mijn gegevens gebruikt om op deze aanvraag te antwoorden.</label>
              {submitError && <p className="pw-form-error" role="alert">{submitError}</p>}
              <button className="pw-button pw-button-dark" type="submit" disabled={submitting}>{submitting ? 'Veilig verzenden…' : demo ? 'Vraag mijn demo aan' : 'Verstuur bericht'}{!submitting && <ArrowRight size={16} />}</button>
              <small>Geen spam. Je gegevens worden alleen gebruikt voor deze aanvraag en zijn niet publiek leesbaar.</small>
            </motion.form>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.section>
  );
};

const MigrationPage = () => <><AnimatedPageHero eyebrow="Overstappen naar PWAYMENT" title={<>Neem je winkel mee.<br />Laat de rommel achter.</>} intro="Producten, varianten, barcodes, klanten en voorraad migreren gecontroleerd. Daarna configureren we hardware, team en rapportage rond je echte werkdag." actions={<a className="pw-button pw-button-dark" href="/demo">Plan je migratie <ArrowRight size={16} /></a>} /><motion.section className="pw-steps pw-shell" initial="hidden" whileInView="visible" viewport={revealViewport} variants={stagger}>{[['01', 'Inventariseren', 'We brengen data, hardware, betaalmethodes en integraties in kaart.'], ['02', 'Importeren', 'We valideren velden, duplicaten, prijzen, btw en voorraad voor ze live gaan.'], ['03', 'Inrichten', 'Locaties, registers, rollen, tickets, webshop en koppelingen worden getest.'], ['04', 'Live gaan', 'Je team oefent de volledige winkeldag en krijgt begeleiding bij de overstap.']].map(([n, title, body]) => <motion.article key={n} variants={fadeUp} whileHover={{ y: -7 }}><span>{n}</span><h2>{title}</h2><p>{body}</p></motion.article>)}</motion.section><FinalCta /></>;

const AboutPage = () => <><AnimatedPageHero eyebrow="Over PWAYMENT" title="Retailsoftware hoort de winkel beter te maken." intro="PWAYMENT is gebouwd vanuit één overtuiging: een kassa mag geen eindpunt zijn. Elke verkoop moet voorraad kloppend houden, klanten beter begrijpen en de volgende beslissing eenvoudiger maken." /><motion.section className="pw-manifesto pw-shell" initial="hidden" whileInView="visible" viewport={revealViewport} variants={stagger}><motion.p variants={fadeUp}>Wij bouwen voor de mensen die elke dag openen, verkopen, adviseren, tellen, bestellen en opnieuw beginnen.</motion.p><motion.div variants={stagger}>{[['Rust in de interface.', 'De winkel is al levendig genoeg. Software moet aandacht sturen, niet opeisen.'], ['Diepte achter eenvoud.', 'Een korte flow aan de voorkant mag geen oppervlakkige administratie aan de achterkant betekenen.'], ['Open, maar verantwoordelijk.', 'Integraties en API’s horen controleerbaar, veilig en ondersteunbaar te zijn.']].map(([title, body]) => <motion.div className="pw-manifesto-point" key={title} variants={fadeUp}><h2>{title}</h2><p>{body}</p></motion.div>)}</motion.div></motion.section><FinalCta /></>;

const resourceItems = [
  ['Gedeeltelijke retouren in retail', 'Waarom een retour aan de oorspronkelijke verkoop, voorraad en audit gekoppeld hoort te blijven.', 'Gids', '/guides/retouren'],
  ['Wat staat er in een Z-rapport?', 'Omzet, betaalmethodes, btw, cash en shifts in één controleerbare afsluiting.', 'Gids', '/guides/z-rapport'],
  ['Voorraadprognose voor winkels', 'Days-of-cover, stockout-risico en confidence vertalen naar betere inkoopbeslissingen.', 'Gids', '/guides/voorraadprognose'],
  ['Cadeaubonnen controleerbaar beheren', 'Van uitgifte en opwaardering tot blokkering en volledige saldohistoriek.', 'Gids', '/guides/cadeaubonnen'],
  ['Eén voorraad voor winkel en webshop', 'Zo werken reserveren, annuleren, afhalen en verzenden op dezelfde voorraad.', 'Gids', '/guides/webshopvoorraad'],
  ['De Belgische retailflow van A tot Z', 'Verbind verkoop, btw, retouren, voorraad en dagafsluiting in één controleerbare keten.', 'Gids', '/guides/belgische-retailflow'],
  ['De complete POS-migratiechecklist', 'Wat je vooraf verzamelt, controleert en test voor een rustige overstap.', 'Checklist', '/migrate'],
];

const storyItems = [
  ['Geen anonieme succesclaims', 'We publiceren alleen een klantverhaal wanneer de retailer herkenbaar toestemming geeft.', 'Bewijsbeleid', '/contact'],
  ['Meetbaar resultaat vereist', 'Een resultaat krijgt context, meetperiode en een controleerbare nulmeting voordat het online komt.', 'Bewijsbeleid', '/contact'],
  ['Ervaringen blijven van de klant', 'Geen samengestelde quotes of fictieve retailers: de klant keurt tekst en gebruik expliciet goed.', 'Bewijsbeleid', '/contact'],
];

const ResourcesPage = ({ stories, compact = false }: { stories: boolean; compact?: boolean }) => {
  const items = (stories ? storyItems : resourceItems).slice(0, compact ? 3 : undefined);
  return <>
    {!compact && <AnimatedPageHero eyebrow={stories ? 'Klantverhalen' : 'Resources'} title={stories ? 'Retailers die elke dag helderder sturen.' : 'Praktische kennis voor een sterkere winkel.'} intro={stories ? 'Echte verhalen over migratie, winkeltempo, voorraad en groei.' : 'Gidsen en uitleg over retouren, rapportage, voorraad, klanten, ecommerce en Belgische retail.'} />}
    <motion.section className={`pw-resource-grid pw-shell${compact ? ' compact' : ''}`} initial="hidden" whileInView="visible" viewport={revealViewport} variants={stagger}>
      {items.map(([title, body, type, href]) => <motion.article key={title} variants={fadeUp} whileHover={{ y: -7 }}><span>{type}</span><h2>{title}</h2><p>{body}</p><a href={href} aria-label={`Lees meer over ${title}`}><ArrowRight /></a></motion.article>)}
    </motion.section>
    {!compact && <FinalCta />}
  </>;
};

const LegalPage = ({ type }: { type: string }) => {
  const titles: Record<string, string> = { privacy: 'Privacyverklaring', cookies: 'Cookiebeleid', terms: 'Algemene voorwaarden', dpa: 'Verwerkersovereenkomst', subprocessors: 'Subverwerkers' };
  return <motion.section className="pw-legal pw-shell" initial="hidden" animate="visible" variants={stagger}><motion.span className="pw-eyebrow" variants={fadeUp}>Juridisch</motion.span><motion.h1 variants={fadeUp}>{titles[type] || 'Juridische informatie'}</motion.h1><motion.p className="pw-legal-updated" variants={fadeUp}>Laatst bijgewerkt op 11 augustus 2026</motion.p><motion.article variants={fadeUp}><h2>Heldere afspraken</h2><p>Deze pagina is voorbereid als definitieve juridische bestemming voor {titles[type]?.toLowerCase() || 'deze informatie'}. Voor publieke ingebruikname wordt de volledige, door juridisch adviseurs goedgekeurde tekst hier opgenomen, inclusief bedrijfsidentiteit, doeleinden, bewaartermijnen, rechten, contactkanalen en toepasselijke voorwaarden.</p><h2>Contact</h2><p>Vragen over privacy, voorwaarden of gegevensverwerking kunnen worden gericht aan privacy@pwayment.be.</p><h2>Versiebeheer</h2><p>Elke wijziging krijgt een ingangsdatum en versienummer. Eerdere versies blijven opvraagbaar wanneer contractuele of wettelijke transparantie dat vereist.</p></motion.article></motion.section>;
};

const NotFoundPage = () => <motion.section className="pw-not-found pw-shell" initial="hidden" animate="visible" variants={stagger}><motion.span variants={fadeUp}>404</motion.span><motion.h1 variants={fadeUp}>Deze pagina staat niet in de winkel.</motion.h1><motion.p variants={fadeUp}>De link is mogelijk verplaatst. Vanaf het overzicht vind je snel de juiste richting.</motion.p><motion.a variants={fadeUp} href="/" className="pw-button pw-button-dark">Terug naar home <ArrowRight size={16} /></motion.a></motion.section>;

const FinalCta = () => <motion.section className="pw-final" initial="hidden" whileInView="visible" viewport={revealViewport} variants={stagger}><div className="pw-shell"><motion.span className="pw-eyebrow" variants={fadeUp}>Klaar voor een helderdere winkel?</motion.span><motion.h2 variants={fadeUp}>Begin gratis.<br />Probeer Professional 1 maand.</motion.h2><motion.p variants={fadeUp}>Basis blijft gratis. Na de proefperiode activeer je Professional of blijf je Basis gebruiken.</motion.p><motion.div variants={fadeUp}><a href="/register?plan=professional" className="pw-button pw-button-dark">Probeer Professional gratis <ArrowRight size={17} /></a><a href="/demo" className="pw-text-link">Plan liever een demo <ArrowRight size={15} /></a></motion.div></div></motion.section>;

const SiteFooter = () => (
  <footer className="pw-footer"><div className="pw-shell"><div className="pw-footer-top"><div className="pw-footer-brand"><img src="/branding/pwayment-logo.svg" alt="PWAYMENT" /><p>Retail intelligence voor winkels die helder willen verkopen, beheren en groeien.</p></div><div className="pw-footer-links"><div><strong>Product</strong><a href="/pos">POS & betalingen</a><a href="/history-returns-invoices">Retouren & facturen</a><a href="/daily-close-reporting">Dagafsluiting</a><a href="/purchasing-suppliers">Inkoop</a><a href="/team-permissions">Team & rechten</a></div><div><strong>Platform</strong><a href="/inventory">Voorraad</a><a href="/insights">Inzichten</a><a href="/customers">Klanten</a><a href="/webshop">Webshop</a><a href="/integrations">Integraties & status</a><a href="/hardware">Hardwarematrix</a></div><div><strong>Bedrijf</strong><a href="/about">Over PWAYMENT</a><a href="/customer-stories">Klantverhalen</a><a href="/resources">Resources</a><a href="/migrate">Migreren</a><a href="/contact">Contact</a></div><div><strong>Account</strong><a href="/pricing">Prijzen</a><a href="/login">Log in</a><a href="/register">Start gratis</a><a href="/demo">Plan een demo</a><a href="/contact">Support</a></div></div></div><div className="pw-footer-bottom"><span>© 2026 PWAYMENT. Alle rechten voorbehouden.</span><div><a href="/legal/privacy">Privacy</a><a href="/legal/cookies">Cookies</a><a href="/legal/terms">Voorwaarden</a><a href="/legal/dpa">Verwerkersovereenkomst</a><a href="/legal/subprocessors">Subverwerkers</a></div><span>NL <ChevronDown size={13} /></span></div></div></footer>
);

export default PublicSite;
