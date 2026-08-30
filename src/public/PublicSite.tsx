import React, { FormEvent, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
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
  PLAN_COMPARISON_GROUPS,
  planPriceCents,
  PUBLIC_PLAN_ORDER,
  yearlySavingsCents,
  yearlyTotalCents,
  type BillingCycle,
} from '../billing/planCatalog';
import { publicLeadStorageAvailable, submitPublicLead } from '../services/publicLeads';
import { trackPublicEvent } from '../services/publicAnalytics';
import { legalIdentity } from '../config/legal';
import { PaceMark } from '../pace/PaceMark';
import { applyRouteSeo } from './siteSeo';
import { PaceHomeTeaser, PacePublicPage } from './PacePublicExperience';
import { localizePublicDom, localizedPublicPath, parsePublicPath, PUBLIC_LOCALE_INFO, PUBLIC_LOCALES, type PublicLocale } from './publicLocale';
import './public-site.css';

const LazyLegalPage = React.lazy(() => import('./LegalPage'));

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
const guidedStoreSetupImage = '/mail-assets/screenshot_0_guided_store_setup.png';
const guidedTicketSetupImage = '/mail-assets/screenshot_0_guided_ticket_setup.png';
const stockQuickEntryImage = '/mail-assets/screenshot_3_stock_builder_quick_entry.png';
const stockOpeningImage = '/mail-assets/screenshot_3_stock_builder_opening_stock.png';
const migrationStartImage = '/mail-assets/screenshot_6_migration_start.png';
const migrationMappingImage = '/mail-assets/screenshot_6_migration_mapping.png';
const migrationReceiptImage = '/mail-assets/screenshot_6_migration_receipt.png';

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
    proof: 'Van eerste scan tot dagafsluiting: één samenhangende winkeloperatie.',
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
      { number: '01', title: 'Snel afrekenen met scanner', body: 'De zoekbalk herkent barcode, SKU en productnaam. Exacte scans gaan direct naar de winkelwagen.', points: ['USB- en toetsenbordscanners', 'Sneltoetsen en touchbediening', 'Voorraadcontrole tijdens verkoop'] },
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
    proof: 'Van productimport tot besteladvies en voorraadoverdracht tussen locaties.',
    chapters: [
      { number: '01', title: 'Een catalogus die retail aankan', body: 'Varianten, merken, leveranciers, inkoopprijs, verkoopprijs, btw, SKU en barcode horen bij elkaar.', points: ['Maten, kleuren, merken en leveranciers', 'CSV-import en -export met validatie', 'Dymo- en Zebra-labels', 'Eigen EAN-13 barcode genereren', 'Producten archiveren en herstellen'] },
      { number: '02', title: 'Actuele voorraad', body: 'Elke verkoop, online bestelling, ontvangst en overdracht werkt hetzelfde voorraadbeeld bij.', points: ['Voorraad per locatie', 'Minimum- en maximumsignalen', 'Overdrachten tussen locaties'] },
      { number: '03', title: 'Koop gericht in', body: 'Verkooptempo, minimumvoorraad, trend en betrouwbaarheid leiden naar concrete bestelvoorstellen.', points: ['Voorraaddekking en risico op uitverkoop', 'Prognose voor 60 dagen met betrouwbaarheidsscore', 'Bestelvoorstellen per leverancier', 'Inkooporders vanuit de prognose', 'Volledige of gedeeltelijke ontvangst'] },
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
    proof: 'Een duidelijke weergave van cadeaubonsaldo, status en volledige mutatiehistoriek.',
    chapters: [
      { number: '01', title: 'Een bruikbaar klantbeeld', body: 'Contactgegevens, voorkeuren en aankopen blijven overzichtelijk en toestemming blijft controleerbaar.', points: ['Snel koppelen aan verkoop', 'Zoeken, filteren en sorteren op gedrag', 'Aankoop- en retourhistorie', 'Notities, bezoeken en klantwaarde', 'Facturen bekijken en downloaden als PDF'] },
      { number: '02', title: 'Loyaliteit die past', body: 'Bepaal punten, beloningen en VIP-niveaus op basis van hoe je winkel werkt.', points: ['Spaarmultipliers', 'VIP-niveaus en voordelen', 'Automatische saldo-opbouw'] },
      { number: '03', title: 'Cadeaubonnen met overzicht', body: 'Uitgifte, opwaardering, blokkering en gebruik blijven samen in één volledige saldohistoriek.', points: ['Uitgeven en opwaarderen met betaalregistratie', 'Anoniem of aan klant gekoppeld', 'Blokkeren en opnieuw activeren', 'Saldo vóór en na elke gebeurtenis', 'Volledige mutatiehistoriek'] },
    ],
  },
  '/webshop': {
    eyebrow: 'PWAYMENT Webshop',
    title: 'Je winkel stopt niet bij de voordeur.',
    intro: 'Publiceer je assortiment online, ontvang bestellingen en houd voorraad automatisch gelijk. PWAYMENT verbindt de winkelvloer en je webshop in één operatie.',
    image: webshopImage,
    imageAlt: 'PWAYMENT webshoporderbeheer met status en verwerkingsacties',
    proof: 'Webshoporders, verwerkingsstatus en voorraadbeweging in één overzicht.',
    chapters: [
      { number: '01', title: 'Van catalogus naar webshop', body: 'Kies producten, beelden, beschrijvingen en uitgelichte items zonder dubbele invoer.', points: ['Eigen subdomein of domeinnaam', 'Webshop voor elk scherm', 'Vindbaarheid en merkbeheer'] },
      { number: '02', title: 'Bestellen zoals klanten willen', body: 'Bestelling, betaalstatus, levering en afhalen werken in dezelfde orderflow. Payment capture blijft afhankelijk van de geactiveerde providerstatus.', points: ['Coupons en gratis-verzenddrempel', 'Verzendkosten of afhalen in de winkel', 'Betaalmethode en ordernotities bewaren', 'Bevestigen, verwerken en verzenden', 'Annuleren of klaarzetten voor afhaling'] },
      { number: '03', title: 'Eén voorraad voor elk kanaal', body: 'Online en fysieke verkoop reserveren en verlagen dezelfde voorraad.', points: ['Voorraadreservering tijdens bestelling', 'Annuleren geeft gereserveerde voorraad vrij', 'Verzenden of afhalen maakt de reservering definitief', 'Meerdere webshops in Enterprise', 'Uitbreiding voor Shopify en WooCommerce'] },
    ],
  },
  '/service-desk': {
    eyebrow: 'ServiceDesk & herstellingen',
    title: 'Herstellingen helder, van intake tot ophaling.',
    intro: 'Maak van elke herstelling een duidelijke werkwijze. Toestel, probleem, prijsopbouw, status en opvolging blijven samen met je klant- en verkoopgegevens.',
    image: customerImage,
    imageAlt: 'PWAYMENT klant- en servicebeheer',
    proof: 'Een herstelling blijft gekoppeld aan de klant, de afspraak en de volledige historiek.',
    chapters: [
      { number: '01', title: 'Neem correct in', body: 'Leg toestel, serienummer, accessoires, conditie en probleem vast terwijl de klant voor je staat.', points: ['Klant of losse contactgegevens', 'Toestel-, IMEI- en serienummergegevens', 'Probleem, conditie en accessoires', 'Diagnose, voorschot en prijsopbouw'] },
      { number: '02', title: 'Houd iedereen op de hoogte', body: 'Werk met heldere status, interne notities en een overzichtelijke vervolgactie voor je team.', points: ['Status en substatus per dossier', 'Interne notities en leveranciersreferenties', 'Onderdelen, werkuren en overige kosten', 'Publieke statusopvolging voor de klant'] },
      { number: '03', title: 'Sluit af met vertrouwen', body: 'Van intake tot aflevering blijft de volledige servicehistoriek verbonden met je klantbeeld.', points: ['Volledige dossierhistoriek', 'Klant- en verkoopcontext samen', 'Controle voor manager en eigenaar'] },
    ],
  },
  '/workforce': {
    eyebrow: 'Team & planning',
    title: 'Plan je team. Houd de winkelvloer in beweging.',
    intro: 'Plan je winkelvloer, beheer verlof en geef iedereen de juiste toegang. Zo houd je bezetting, rollen en verantwoordelijkheid helder—ook als je groeit.',
    image: insightsImage,
    imageAlt: 'PWAYMENT team- en prestatieoverzicht',
    proof: 'Planning, rechten en winkelactiviteit komen samen in dezelfde operatie.',
    chapters: [
      { number: '01', title: 'Plan de winkelvloer', body: 'Bouw een weekrooster rond je echte bezetting, beschikbare mensen en terugkerende patronen.', points: ['Weekrooster en shifts', 'Werkpatronen en week kopiëren', 'Bewerk, publiceer en heropen roosters'] },
      { number: '02', title: 'Beheer verlof zorgvuldig', body: 'Aanvragen, goedkeuringen en saldi blijven duidelijk voor medewerker en verantwoordelijke.', points: ['Verlof aanvragen en intrekken', 'Goedkeuring met persoonlijke PIN', 'Verloftypes, saldi en bezettingscontrole'] },
      { number: '03', title: 'Geef de juiste toegang', body: 'Kassier, manager en eigenaar zien alleen wat bij hun verantwoordelijkheid hoort.', points: ['Rollen per medewerker', 'Managergoedkeuringen voor gevoelige acties', 'Contracturen en beschikbaarheid'] },
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
      { number: '02', title: 'Boekhouding en Peppol', body: 'PDF-documenten en boekhoudconfiguratie zijn geen gestructureerde e-facturatie. Gebruik voor Belgische B2B-facturen een afzonderlijk geactiveerde Peppol/EN 16931-oplossing tot PWAYMENT de volledige documentflow als actief bevestigt.', points: ['Exact Online en Octopus: pilot', 'Peppol: niet live / validatie', 'Z-journaalconfiguratie aanwezig'] },
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

interface SolutionPageData {
  title: string;
  intro: string;
  label: string;
  proofTitle: string;
  proof: string;
  bullets: string[];
  workflows: Array<{ label: string; title: string; body: string; href: string }>;
}

const solutionPages: Record<string, SolutionPageData> = {
  '/solutions/independent-retail': { label: 'Onafhankelijke retail', title: 'Professionele controle, zonder een IT-afdeling.', intro: 'Voor winkels die vlot willen verkopen, voorraad willen beheersen en elke dag met een helder beeld willen afsluiten.', proofTitle: 'Alles wat je nodig hebt. Niets dat je ophoudt.', proof: 'Eén duidelijke werkwijze vervangt losse tools, manuele lijstjes en het dagelijkse zoekwerk naar de juiste cijfers.', bullets: ['Een snelle kassa voor een drukke winkelvloer', 'Voorraad, klanten en rapportage in dezelfde bron', 'Een rustige migratie en begeleiding op je eigen hardware'], workflows: [{ label: 'Winkelvloer', title: 'Vlot verkopen, ook als het druk is.', body: 'Scan, zoek, koppel een klant en rond af zonder je weg te zoeken in een complex systeem.', href: '/pos' }, { label: 'Eigenaarschap', title: 'Sluit af met overzicht.', body: 'Zie omzet, cash, btw, voorraad en volgende acties zonder gegevens samen te voegen.', href: '/daily-close-reporting' }] },
  '/solutions/specialist-retail': { label: 'Speciaalzaken', title: 'Gebouwd voor assortimenten met diepte.', intro: 'Maten, kleuren, merken, leveranciers en adviesproducten vragen meer dan een eenvoudige artikelnaam.', proofTitle: 'Geen plat productbestand, maar retailkennis.', proof: 'PWAYMENT houdt de eigenschappen, marge, beweging en klantcontext van elk artikel samen—zodat je niet moet kiezen tussen eenvoud en diepte.', bullets: ['Varianten, barcodes, labels en leveranciers per artikel', 'Marge, verkoopsnelheid en stilstand zichtbaar per product', 'Klanten, loyaliteit en cadeaubonnen voor terugkerende relaties'], workflows: [{ label: 'Assortiment', title: 'Ken elk artikel zoals je team dat kent.', body: 'Werk met de details die in een speciaalzaak tellen, van variant en merk tot kostprijs en barcode.', href: '/inventory' }, { label: 'Relatie', title: 'Maak goed advies herkenbaar.', body: 'Koppel aankopen, voorkeuren en voordelen aan een klantbeeld dat met je winkel meegroeit.', href: '/customers' }] },
  '/solutions/multi-location': { label: 'Enterprise & ketens', title: 'Elke winkel lokaal sterk. De keten centraal bestuurbaar.', intro: 'Verbind locaties en registers zonder lokale snelheid of centrale controle in te leveren.', proofTitle: 'Lokale rust. Centrale scherpte.', proof: 'Iedere locatie werkt door in haar eigen tempo, terwijl eigenaars zicht houden op voorraad, prestaties, rollen en de volgende groeibeslissing.', bullets: ['Multi-store voorraad, transfers en centrale sturing', 'Inzichten per locatie én over de volledige organisatie', 'Rollen, audit en support volgens je operationele schaal'], workflows: [{ label: 'Operatie', title: 'Houd voorraad in beweging tussen locaties.', body: 'Stuur assortiment en voorraadgericht bij zonder het lokale team te vertragen.', href: '/inventory' }, { label: 'Besturing', title: 'Zie waar je organisatie aandacht nodig heeft.', body: 'Vergelijk ritme, marge, voorraad en prestaties vanuit één centrale bron.', href: '/insights' }] },
  '/solutions/accountants': { label: 'Accountants & partners', title: 'Schone winkeldata. Minder herstelwerk.', intro: 'Laat dagelijkse ontvangsten, btw, betaalmethodes en facturen gestructureerd voorbereiden voor de boekhouding.', proofTitle: 'Controleerbare cijfers vóór ze je boekhouding bereiken.', proof: 'De dagafsluiting vertrekt vanuit de echte transacties: betaalmix, cash, btw, facturen en correcties blijven in samenhang leesbaar.', bullets: ['Controleerbare Z- en transactie-export', 'Btw, cash en betaalmethodes duidelijk uitgesplitst', 'Koppelingen alleen communiceren met een heldere, bewezen status'], workflows: [{ label: 'Afsluiting', title: 'Maak van een winkeldag een heldere boekingsbasis.', body: 'Controleer verschillen vóór ze in je historiek en rapportage terechtkomen.', href: '/daily-close-reporting' }, { label: 'Documenten', title: 'Vind elke factuur en correctie terug.', body: 'Verkoopdocumenten, retouren en exports blijven verbonden met de oorspronkelijke transactie.', href: '/history-returns-invoices' }] },
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
    proof: 'Transacties, factuuracties en retouren in één overzicht.',
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
    imageAlt: 'PWAYMENT besteladvies met voorraaddekking, verwachte uitverkoop en leveranciersorders',
    proof: 'Besteladvies met betrouwbaarheid, trend en inkoopwaarde.',
    flow: [
      { number: '01', title: 'Zie wat aandacht vraagt', body: 'Sorteer op onder minimum, risico op uitverkoop binnen 30 of 60 dagen en betrouwbaarheid van het advies.' },
      { number: '02', title: 'Stel aantallen bij', body: 'Controleer huidige voorraad, recente verkoop, voorraaddekking, trend en aankoopwaarde per product.' },
      { number: '03', title: 'Ontvang per leverancier', body: 'Maak gegroepeerde conceptorders en verwerk een volledige of gedeeltelijke ontvangst als voorraadbeweging.' },
    ],
    capabilities: [
      { title: 'Betrouwbaarheid zichtbaar', body: 'Het advies vermeldt of de voorspelling hoog, redelijk of beperkt betrouwbaar is en waarom.', evidence: 'Werkend in voorraadprognose' },
      { title: 'Geen onverklaarbaar advies', body: 'Verwachte uitverkoop, verkooptempo en voorgesteld aantal blijven per artikel uitlegbaar.', evidence: 'Werkend in besteladvies' },
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
      { title: 'Managergoedkeuring', body: 'Kortingen en annuleringen bewaren de goedkeurende medewerker en reden in de transactie- of auditgegevens.', evidence: 'Werkend in betaling en audit' },
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
  '/guides/voorraadprognose': { eyebrow: 'Retailgids', title: 'Een besteladvies moet uitlegbaar blijven.', intro: 'Verkooptempo alleen is onvoldoende. Minimumvoorraad, resterende dekking, seizoen, trend en datakwaliteit bepalen samen hoeveel vertrouwen een voorstel verdient.', readTime: '7 minuten', sections: [{ title: 'Voorraaddekking', body: 'Maak zichtbaar hoeveel verkoopdagen de huidige voorraad vermoedelijk nog dekt.', points: ['Huidige voorraad', 'Recente vraag', 'Verwachte datum van uitverkoop'] }, { title: 'Betrouwbaarheid', body: 'Sporadische vraag en korte historie vragen meer menselijke controle dan stabiele hardlopers.', points: ['Korte en lange trend', 'Onregelmatige vraag herkennen', 'Seizoenscorrectie uitleggen'] }, { title: 'Van advies naar order', body: 'De inkoper blijft eigenaar van aantallen, leverancier en moment van bestellen.', points: ['Voorstel handmatig aanpassen', 'Groeperen per leverancier', 'Deelontvangsten verwerken'] }], cta: { href: '/purchasing-suppliers', label: 'Bekijk inkoop & leveranciers' } },
  '/guides/cadeaubonnen': { eyebrow: 'Retailgids', title: 'Een cadeaubon is een saldo met geschiedenis.', intro: 'Uitgifte, opwaardering, gebruik en blokkering moeten als afzonderlijke gebeurtenissen met saldo vóór en na bewaard blijven.', readTime: '5 minuten', sections: [{ title: 'Uitgifte', body: 'Leg startbedrag, betaling, geldigheid en eventuele klantkoppeling vast.', points: ['Anoniem of gekoppeld', 'Unieke code', 'Startsaldo en vervaldatum'] }, { title: 'Gebruik en opwaardering', body: 'Iedere mutatie hoort één keer verwerkt te worden en het actuele saldo te valideren.', points: ['Saldo vóór en na', 'Koppeling aan verkoop', 'Idempotente verwerking'] }, { title: 'Blokkering en controle', body: 'Een geblokkeerde bon blijft historisch zichtbaar zonder nog als betaalmiddel te werken.', points: ['Blokkeren en heractiveren', 'Volledige eventhistoriek', 'Filteren op status en saldo'] }], cta: { href: '/customers', label: 'Bekijk klanten & cadeaubonnen' } },
  '/guides/webshopvoorraad': { eyebrow: 'Retailgids', title: 'Online voorraad vraagt een reservatie.', intro: 'Een bestelling mag voorraad niet te vroeg definitief afboeken, maar mag dezelfde voorraad ook niet opnieuw aan een andere klant beloven.', readTime: '6 minuten', sections: [{ title: 'Reserveer bij bestelling', body: 'Controleer beschikbare voorraad opnieuw wanneer de bestelling definitief wordt aangemaakt.', points: ['Één aanvraag-ID per bestelling', 'Bestelling en reservatie samen verwerken', 'Geen negatieve voorraad'] }, { title: 'Volg de bestelling', body: 'Bevestigen en verwerken houden de reservatie vast; annuleren geeft ze vrij.', points: ['Open en betaald onderscheiden', 'Annulering herstelt beschikbaarheid', 'Statusgeschiedenis behouden'] }, { title: 'Maak definitief bij levering', body: 'Verzenden of afhalen zet de reservatie om naar een definitieve voorraadbeweging.', points: ['Afhalen en levering', 'Voorraadbeweging registreren', 'Fysiek en online gelijk houden'] }], cta: { href: '/webshop', label: 'Bekijk de PWAYMENT Webshop' } },
  '/guides/belgische-retailflow': { eyebrow: 'Belgische retailgids', title: 'Van verkoop tot afsluiting: één controleerbare keten.', intro: 'Een Belgische winkeldag raakt verkoop, betaling, voorraad, btw, documenten en rapportage. De kwaliteit zit in hoe die stappen op elkaar aansluiten.', readTime: '8 minuten', sections: [{ title: 'Leg de verkoop één keer vast', body: 'Product, prijs, korting, btw, klant, medewerker en betaalwijze horen bij dezelfde transactiebron.', points: ['Prijs en btw per verkoopregel', 'Betaalwijze aan de verkoop koppelen', 'Kassier en register bewaren'] }, { title: 'Laat elke vervolgactie verwijzen', body: 'Retour, factuur, voorraadbeweging en cadeaubongebruik moeten naar de oorspronkelijke gebeurtenis terug te leiden zijn.', points: ['Retour naast het origineel', 'Voorraadmutatie automatisch koppelen', 'Documenten reproduceerbaar houden'] }, { title: 'Sluit controleerbaar af', body: 'De dagafsluiting verklaart omzet, betaalmix, cashverschillen en btw zonder losse spreadsheets.', points: ['Verwacht en geteld cash', 'Btw per tarief', 'Z-rapport en auditexport'] }], cta: { href: '/product', label: 'Bekijk het volledige retailplatform' } },
};

const integrationStatuses = [
  { name: 'PWAYMENT Webshop', status: 'Actief', tone: 'live', detail: 'Native storefront, orderflow en voorraadreservering in dezelfde productomgeving.' },
  { name: 'CSV catalogus', status: 'Actief', tone: 'live', detail: 'Export werkt; import is beschikbaar achter een gecontroleerde releaseflag.' },
  { name: 'Supabase realtime', status: 'Actief', tone: 'live', detail: 'Tenantdata en entitlementwijzigingen synchroniseren via de centrale backend.' },
  { name: 'Shopify & WooCommerce', status: 'Pilot', tone: 'pilot', detail: 'Configuratie en mapping zijn voorzien; end-to-end connectorvalidatie blijft vereist.' },
  { name: 'Peppol / EN 16931', status: 'Validatie', tone: 'validate', detail: 'Niet live: een PDF uit PWAYMENT voldoet niet als Belgische gestructureerde B2B-factuur. Gebruik een actieve externe Peppoloplossing.' },
  { name: 'Exact & Octopus', status: 'Pilot', tone: 'pilot', detail: 'Boekhoudconfiguratie is voorzien; publieke live-status volgt pas na end-to-end verificatie.' },
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
  const { locale, routePath: path } = parsePublicPath(window.location.pathname);
  const [mobileOpen, setMobileOpen] = useState(false);
  const siteRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!siteRef.current) return;
    return localizePublicDom(siteRef.current, locale);
  }, [locale, path]);

  useEffect(() => {
    document.documentElement.dataset.theme = 'light';
    document.documentElement.classList.add('theme-light');
    document.documentElement.classList.remove('theme-dark');
    document.documentElement.style.colorScheme = 'light';
    applyRouteSeo(path, locale);
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [path, locale]);

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
  else if (path === '/pace') page = <PacePublicPage />;
  else if (path === '/start') page = <StartPage />;
  else if (path === '/pricing' || path === '/compare') page = <PricingPage />;
  else if (path === '/demo' || path === '/contact') page = <ContactPage demo={path === '/demo'} />;
  else if (featurePages[path]) page = <FeaturePage data={featurePages[path]} route={path} />;
  else if (operationalPages[path]) page = <OperationalPage data={operationalPages[path]} route={path} />;
  else if (guidePages[path]) page = <GuidePage data={guidePages[path]} />;
  else if (solutionPages[path]) page = <SolutionPage data={solutionPages[path]} />;
  else if (path === '/migrate') page = <MigrationPage />;
  else if (path === '/about') page = <AboutPage />;
  else if (path === '/resources' || path === '/customer-stories') page = <ResourcesPage stories={path === '/customer-stories'} />;
  else if (path.startsWith('/legal/')) page = <React.Suspense fallback={<div className="pw-legal pw-shell" role="status">Juridische informatie laden…</div>}><LazyLegalPage type={path.split('/').pop() || 'privacy'} /></React.Suspense>;
  else page = <NotFoundPage />;

  return (
    <div ref={siteRef} className={`pw-site${path === '/' ? ' pw-site-home' : ''}`}>
      <a className="pw-skip" href="#main">Ga naar inhoud</a>
      <SiteHeader mobileOpen={mobileOpen} setMobileOpen={setMobileOpen} locale={locale} routePath={path} />
      <main id="main">{page}</main>
      <SiteFooter locale={locale} routePath={path} />
    </div>
  );
};

export const SiteHeader = ({ mobileOpen, setMobileOpen, locale = 'nl', routePath = '/' }: { mobileOpen: boolean; setMobileOpen: (value: boolean) => void; locale?: PublicLocale; routePath?: string }) => {
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const navigationRef = useRef<HTMLDivElement>(null);
  const closeMenuTimer = useRef<number | null>(null);
  const clearPendingMenuClose = () => {
    if (closeMenuTimer.current) {
      window.clearTimeout(closeMenuTimer.current);
      closeMenuTimer.current = null;
    }
  };
  const closeNavigation = () => {
    clearPendingMenuClose();
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
      clearPendingMenuClose();
      document.removeEventListener('pointerdown', closeOnPointerDown);
      document.removeEventListener('keydown', closeOnEscape);
      window.removeEventListener('scroll', closeNavigation);
      window.removeEventListener('resize', closeNavigation);
    };
  }, []);

  const toggleMenu = (label: string) => {
    clearPendingMenuClose();
    setMobileOpen(false);
    setActiveMenu((current) => (current === label ? null : label));
  };

  const openMenuOnHover = (label: string) => {
    clearPendingMenuClose();
    setMobileOpen(false);
    setActiveMenu(label);
  };

  const closeMenuOnHoverExit = () => {
    clearPendingMenuClose();
    // A tiny exit delay makes the diagonal move from trigger to panel feel solid,
    // without making the menu feel sticky once the pointer has truly left it.
    closeMenuTimer.current = window.setTimeout(() => {
      setActiveMenu(null);
      closeMenuTimer.current = null;
    }, 110);
  };

  return (
    <div ref={navigationRef} className="pw-navigation-layer">
      <motion.header className="pw-header" initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .55, ease: motionEase }}>
      <div className="pw-header-inner">
        <a href="/" className="pw-logo" aria-label="PWAYMENT home" onClick={closeNavigation}>
          <PaceMark size={38} active emotion="attentive" motionMode="subtle" />
          <span className="pw-logo-lockup"><strong>PWAYMENT</strong><small>powered by Pace</small></span>
        </a>
        <nav className="pw-nav" aria-label="Hoofdnavigatie">
          <a href="/pace" className="pw-nav-pace" onClick={closeNavigation}>Pace</a>
          <NavGroup label="Product" columns={[
            { title: 'Verkopen & bedienen', links: [['/pos', 'Kassa & betalingen', 'Scan-first, offline en gecontroleerd afrekenen'], ['/customers', 'Klanten & loyaliteit', 'Van klantbeeld tot cadeaubon'], ['/service-desk', 'ServiceDesk & herstellingen', 'Intake, status en aflevering samen'], ['/webshop', 'Webshop & orders', 'Eén voorraad voor winkel en online']] },
            { title: 'Voorraad & beslissingen', links: [['/inventory', 'Producten & voorraad', 'Van barcode tot besteladvies'], ['/purchasing-suppliers', 'Inkoop & leveranciers', 'Forecast, order en ontvangst'], ['/insights', 'Retail intelligence', 'Van data naar concrete actie'], ['/daily-close-reporting', 'Dagafsluiting & rapportage', 'Btw, cash en controle per dag']] },
            { title: 'Groei & controle', links: [['/workforce', 'Team & planning', 'Roosters, verlof en rechten'], ['/offline', 'Offline-first', 'Blijf verkopen als verbinding wegvalt'], ['/integrations', 'Hardware & koppelingen', 'Open waar nodig, helder per status'], ['/security', 'Veiligheid & controle', 'Rollen, audit en veilige acties']] },
          ]} active={activeMenu === 'Product'} onToggle={() => toggleMenu('Product')} onHoverStart={() => openMenuOnHover('Product')} onHoverEnd={closeMenuOnHoverExit} onNavigate={closeNavigation} />
          <NavGroup label="Voor jouw winkel" columns={[
            { title: 'Type winkel', links: [['/solutions/independent-retail', 'Onafhankelijke retail', 'Professionele controle zonder complexiteit'], ['/solutions/specialist-retail', 'Speciaalzaken', 'Varianten, merken en advies'], ['/service-desk', 'Herstelgedreven retail', 'Service naast verkoop op één plek']] },
            { title: 'Groeipad', links: [['/start', 'Start met PWAYMENT', 'Nieuw, importeren of gecontroleerd overstappen'], ['/solutions/multi-location', 'Keten & multi-location', 'Centraal sturen, lokaal verkopen'], ['/solutions/accountants', 'Accountants & partners', 'Schone data, minder herstelwerk'], ['/migrate', 'Overstappen naar PWAYMENT', 'Gecontroleerd live zonder onrust']] },
          ]} active={activeMenu === 'Voor jouw winkel'} onToggle={() => toggleMenu('Voor jouw winkel')} onHoverStart={() => openMenuOnHover('Voor jouw winkel')} onHoverEnd={closeMenuOnHoverExit} onNavigate={closeNavigation} />
          <a href="/pricing" onClick={closeNavigation}>Prijzen</a>
          <a href="/resources" onClick={closeNavigation}>Resources</a>
        </nav>
        <div className="pw-header-actions">
          <LanguageSwitcher locale={locale} routePath={routePath} compact />
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
          <a className="pw-mobile-pace" href="/pace" onClick={closeNavigation}>Pace <span>De intelligente laag van PWAYMENT</span></a>
          <div className="pw-mobile-nav-group"><strong>Product</strong><a href="/pos" onClick={closeNavigation}>Kassa & betalingen</a><a href="/inventory" onClick={closeNavigation}>Voorraad & inkoop</a><a href="/customers" onClick={closeNavigation}>Klanten & loyalty</a><a href="/service-desk" onClick={closeNavigation}>ServiceDesk & herstellingen</a><a href="/webshop" onClick={closeNavigation}>Webshop & orders</a><a href="/insights" onClick={closeNavigation}>Retail intelligence</a><a href="/workforce" onClick={closeNavigation}>Team & planning</a><a href="/offline" onClick={closeNavigation}>Offline-first</a></div>
          <div className="pw-mobile-nav-group"><strong>Voor jouw winkel</strong><a href="/start" onClick={closeNavigation}>Start met PWAYMENT</a><a href="/solutions/independent-retail" onClick={closeNavigation}>Onafhankelijke retail</a><a href="/solutions/specialist-retail" onClick={closeNavigation}>Speciaalzaken</a><a href="/solutions/multi-location" onClick={closeNavigation}>Keten & multi-location</a><a href="/migrate" onClick={closeNavigation}>Overstappen naar PWAYMENT</a></div>
          <a href="/pricing" onClick={closeNavigation}>Prijzen</a><a href="/resources" onClick={closeNavigation}>Resources</a>
          <LanguageSwitcher locale={locale} routePath={routePath} />
          <div className="pw-mobile-actions"><a href="/login" onClick={closeNavigation}>Log in</a><a href="/register" className="pw-button pw-button-dark" onClick={closeNavigation}>Start gratis</a></div>
        </nav>
      )}
    </div>
  );
};

const LanguageSwitcher = ({ locale, routePath, compact = false }: { locale: PublicLocale; routePath: string; compact?: boolean }) => (
  <nav className={`pw-language-switcher${compact ? ' is-compact' : ''}`} aria-label="Taal kiezen">
    <div className="pw-language-switcher-heading" aria-hidden="true">
      <span>Taal</span>
    </div>
    <div className="pw-language-options">
      {PUBLIC_LOCALES.map((candidate) => {
        const active = candidate === locale;
        return (
          <a
            key={candidate}
            href={localizedPublicPath(routePath, candidate)}
            hrefLang={PUBLIC_LOCALE_INFO[candidate].hreflang}
            lang={PUBLIC_LOCALE_INFO[candidate].htmlLang}
            aria-current={active ? 'page' : undefined}
            aria-label={PUBLIC_LOCALE_INFO[candidate].label}
            title={PUBLIC_LOCALE_INFO[candidate].label}
            data-public-locale={candidate}
          >
            <span className="pw-language-short">{PUBLIC_LOCALE_INFO[candidate].shortLabel}</span>
            <span className="pw-language-name">{PUBLIC_LOCALE_INFO[candidate].label}</span>
            {active && <Check className="pw-language-check" size={14} strokeWidth={2.5} aria-hidden="true" />}
          </a>
        );
      })}
    </div>
  </nav>
);

const NavGroup = ({ label, columns, active, onToggle, onHoverStart, onHoverEnd, onNavigate }: { label: string; columns: Array<{ title: string; links: string[][] }>; active: boolean; onToggle: () => void; onHoverStart: () => void; onHoverEnd: () => void; onNavigate: () => void }) => (
  <div className="pw-nav-group" onMouseEnter={onHoverStart} onMouseLeave={onHoverEnd} onFocus={onHoverStart} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) onHoverEnd(); }}>
    <button type="button" aria-expanded={active} aria-controls={`pw-menu-${label.toLowerCase().replaceAll(' ', '-')}`} onClick={onToggle}>{label} <ChevronDown size={14} /></button>
    <div id={`pw-menu-${label.toLowerCase().replaceAll(' ', '-')}`} className={`pw-mega pw-mega-${columns.length}${active ? ' is-open' : ''}`}>
      {columns.map(column => <section key={column.title}><strong className="pw-mega-title">{column.title}</strong>{column.links.map(([href, title, description]) => <a href={href} key={href} onClick={onNavigate}><strong>{title}</strong><span>{description}</span></a>)}</section>)}
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
        <motion.div className="pw-kicker" variants={fadeUp}><span /> PWAYMENT, powered by Pace</motion.div>
        <motion.h1 variants={fadeUp}>Minder losse systemen.<br /><em>Meer grip op je winkel.</em></motion.h1>
        <motion.p variants={fadeUp}>PWAYMENT verbindt kassa, voorraad, klanten, webshop en rapportage in één rustige werkplek. Pace begrijpt waar je bezig bent, legt uit wat aandacht vraagt en opent de veilige volgende stap. Jij blijft beslissen.</motion.p>
        <motion.div className="pw-hero-actions" variants={fadeUp}>
          <a href="#pace-in-action" className="pw-button pw-button-dark">Bekijk Pace in actie <ArrowRight size={17} /></a>
          <a href="/product" className="pw-text-link">Ontdek het platform <ArrowRight size={15} /></a>
        </motion.div>
        <motion.div className="pw-hero-proof" variants={fadeUp}><span>Offline-first kassa</span><span>Controleerbare acties</span><span>Eén operationele waarheid</span></motion.div>
      </motion.div>
      <a className="pw-scroll-badge" href="#home-story" aria-label="Scroll naar beneden">
        <ChevronDown size={20} strokeWidth={1.8} />
      </a>
    </section>

    <section className="pw-home-proof" id="home-story" aria-label="PWAYMENT in het kort">
      <div className="pw-shell">{[
        ['Start begeleid', 'Pace leidt een eigenaar door winkeldata, ticket, catalogus en eerste voorraad.'],
        ['Verkoop met rust', 'De kritieke kassaflow blijft werken en Pace weet wanneer stilte belangrijker is.'],
        ['Begrijp je winkel', 'Voorraad, marge en klanten vertellen vanuit dezelfde bron hetzelfde verhaal.'],
        ['Groei zonder herbeginnen', 'Van één kassa tot webshop, team, service en meerdere locaties.'],
      ].map(([title, body]) => <div key={title}><span>{title}</span><p>{body}</p></div>)}</div>
    </section>

    <motion.section className="pw-home-intro pw-shell" initial="hidden" whileInView="visible" viewport={revealViewport} variants={stagger}>
      <motion.div variants={fadeUp}><span className="pw-eyebrow">Het platform dat met je meewerkt</span><h2>Software die niet alleen registreert.<br />Software die begrijpt.</h2></motion.div>
      <motion.p variants={fadeUp}>PWAYMENT bewaart de operationele waarheid. Pace maakt die begrijpelijk op de plek waar je werkt. Geen extra dashboard en geen autonome beslisser, maar contextuele begeleiding die je bestaande werkwijze sterker maakt.</motion.p>
    </motion.section>

    <div className="pw-shell pw-pace-home-wrap"><PaceHomeTeaser /></div>

    <motion.section className="pw-home-product pw-shell" initial="hidden" whileInView="visible" viewport={revealViewport} variants={stagger}>
      <motion.div className="pw-home-product-copy" variants={fadeUp}><span className="pw-eyebrow">De winkelvloer, opnieuw ontworpen</span><h2>Rust voor je team.<br />Grip voor jou.</h2><p>Een snelle kassaflow aan de voorkant. Een volledig, betrouwbaar winkelbeeld achter de schermen.</p><a href="/pos" className="pw-text-link">Ontdek de kassa <ArrowRight size={15} /></a></motion.div>
      <motion.div className="pw-home-product-screen" variants={fadeUp}><div className="pw-window-bar"><i /><i /><i /><span>app.pwayment.be · Kassa</span><b>Live</b></div><img src={posImage} alt="PWAYMENT kassascherm met catalogus en winkelwagen" loading="lazy" /></motion.div>
    </motion.section>

    <motion.section className="pw-home-outcomes" initial="hidden" whileInView="visible" viewport={revealViewport} variants={stagger}>
      <div className="pw-shell"><motion.div className="pw-home-section-title" variants={fadeUp}><span className="pw-eyebrow">Eén doorlopende retailreis</span><h2>Van eerste setup tot<br />slimmere groei.</h2></motion.div><div className="pw-home-outcome-grid is-journey">
        {[
          [Store, 'Start', 'Richt je winkel begeleid in of neem bestaande data gecontroleerd mee.', '/start'],
          [ScanLine, 'Verkoop', 'Scan, zoek, koppel een klant en rond af zonder de winkel uit haar ritme te halen.', '/pos'],
          [Box, 'Beheer', 'Houd producten, voorraad, leveranciers en ontvangsten in dezelfde waarheid.', '/inventory'],
          [TrendingUp, 'Begrijp', 'Zie marge, winkelritme, voorraadtempo en klantgedrag in hun echte context.', '/insights'],
          [Layers3, 'Groei', 'Voeg webshop, team, service en locaties toe zonder opnieuw te beginnen.', '/product'],
        ].map(([Icon, title, body, href], index) => <motion.a href={String(href)} key={String(title)} variants={fadeUp} whileHover={{ y: -6 }}><span>0{index + 1}</span><Icon size={25} /><h3>{String(title)}</h3><p>{String(body)}</p><ArrowRight size={17} /></motion.a>)}
      </div></div>
    </motion.section>

    <motion.section className="pw-home-platform pw-shell" initial="hidden" whileInView="visible" viewport={revealViewport} variants={stagger}>
      <motion.div className="pw-home-platform-heading" variants={fadeUp}><span className="pw-eyebrow">Gebouwd voor echte retail</span><h2>Alles wat moet kloppen,<br />werkt samen.</h2><p>Geen verzameling losse modules. Wel één retailoperatie die verder gaat dan de kassa.</p></motion.div>
      <motion.div className="pw-home-platform-grid is-six" variants={stagger}>{[
        [ScanLine, 'Kassa & betalingen', 'Een snelle scanner-first flow met gecontroleerde betalingen en retouren.', '/pos'],
        [Box, 'Producten & voorraad', 'Van productimport en barcode tot ontvangst, prognose en inkoop.', '/inventory'],
        [Users, 'Klanten & loyaliteit', 'Herken waardevolle klanten, spaarpunten en cadeaubonnen op één plek.', '/customers'],
        [ShoppingBag, 'Winkel + webshop', 'Eén assortiment en voorraadbeeld voor winkelvloer en online orders.', '/webshop'],
        [ReceiptText, 'Retouren & rapportage', 'Van originele verkoop tot btw, betaalmix en controleerbare dagafsluiting.', '/daily-close-reporting'],
        [Webhook, 'Hardware & integraties', 'Bekijk per scanner, printer, terminal of connector wat echt actief is.', '/integrations'],
      ].map(([Icon, title, body, href]) => <motion.a href={String(href)} key={String(title)} variants={fadeUp} whileHover={{ y: -5 }}><Icon size={21} /><h3>{String(title)}</h3><p>{String(body)}</p><ArrowRight size={15} /></motion.a>)}</motion.div>
      <motion.a href="/product" className="pw-button pw-button-light" variants={fadeUp}>Bekijk het volledige platform <ArrowRight size={16} /></motion.a>
    </motion.section>

    <motion.section className="pw-home-assurance" initial="hidden" whileInView="visible" viewport={revealViewport} variants={stagger}><div className="pw-shell"><motion.div variants={fadeUp}><span className="pw-eyebrow">Begin waar je winkel nu staat</span><h2>Nieuw starten of slim overstappen.</h2><p>Pace begeleidt je door de basis. De migratiemodule helpt bestaande producten, barcodes en voorraad gecontroleerd over te nemen.</p></motion.div><motion.div className="pw-home-assurance-actions" variants={fadeUp}><a href="/start" className="pw-button pw-button-dark">Kies je startroute <ArrowRight size={16} /></a><a href="/migrate" className="pw-text-link">Bekijk de migratieaanpak <ArrowRight size={15} /></a></motion.div></div></motion.section>
  </>
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

const featureRelated: Record<string, Array<[LucideIcon, string, string, string]>> = {
  '/product': [[ScanLine, '/pos', 'Kassa & betalingen', 'Een korte, gecontroleerde flow op de winkelvloer.'], [Box, '/inventory', 'Voorraad & inkoop', 'Van productdetail tot bestelbeslissing.'], [TrendingUp, '/insights', 'Retail intelligence', 'Zie wat vandaag aandacht verdient.']],
  '/pos': [[ReceiptText, '/history-returns-invoices', 'Retouren & facturen', 'Corrigeer vanuit de oorspronkelijke verkoop.'], [ClipboardCheck, '/daily-close-reporting', 'Dagafsluiting', 'Sluit cash, btw en betaalmix helder af.'], [CloudOff, '/offline', 'Offline-first', 'Blijf verkopen als je verbinding wegvalt.']],
  '/inventory': [[Box, '/purchasing-suppliers', 'Inkoop & leveranciers', 'Vertaal voorraadtempo naar een bestelbeslissing.'], [TrendingUp, '/insights', 'Retail intelligence', 'Bekijk marge, stilstand en seizoensritme.'], [ShoppingBag, '/webshop', 'Webshop & orders', 'Gebruik hetzelfde voorraadbeeld in elk kanaal.']],
  '/insights': [[Box, '/inventory', 'Voorraad & inkoop', 'Ga van inzicht naar een gerichte voorraadactie.'], [Users, '/customers', 'Klanten & loyalty', 'Begrijp herhaalaankoop en klantwaarde.'], [UserCog, '/workforce', 'Team & planning', 'Verbind bezetting en winkelactiviteit.']],
  '/customers': [[Gift, '/service-desk', 'ServiceDesk', 'Houd klant en servicecontext samen.'], [ShoppingBag, '/webshop', 'Webshop & orders', 'Geef klanten dezelfde ervaring online en in de winkel.'], [ScanLine, '/pos', 'Kassa & betalingen', 'Koppel klantinformatie direct aan een verkoop.']],
  '/webshop': [[Box, '/inventory', 'Voorraad & inkoop', 'Laat voorraad nooit twee verhalen vertellen.'], [Users, '/customers', 'Klanten & loyalty', 'Verbind online bestellingen met klantcontext.'], [Webhook, '/integrations', 'Hardware & koppelingen', 'Beheer hardware en koppelingen met een duidelijke status.']],
  '/service-desk': [[Users, '/customers', 'Klanten & loyalty', 'Maak van service een blijvende klantrelatie.'], [ReceiptText, '/history-returns-invoices', 'Historiek & facturen', 'Houd documenten en correcties terugvindbaar.'], [ScanLine, '/pos', 'Kassa & betalingen', 'Verbind voorschot, verkoop en aflevering.']],
  '/workforce': [[UserCog, '/team-permissions', 'Rollen & goedkeuringen', 'Zet verantwoordelijkheid om in heldere toegang.'], [TrendingUp, '/insights', 'Teaminzichten', 'Zie activiteit in de context van je winkel.'], [ScanLine, '/pos', 'Kassa & betalingen', 'Houd de winkelvloer vlot voor elk teamlid.']],
  '/integrations': [[ShoppingBag, '/webshop', 'Webshop & orders', 'Webshop en winkel in één operatie.'], [CloudOff, '/offline', 'Offline-first', 'Lokale continuïteit bij verbindingsverlies.'], [Store, '/migrate', 'Migreren', 'Neem bestaande data gecontroleerd mee.']],
  '/hardware': [[ScanLine, '/pos', 'Kassa & betalingen', 'Zie hoe hardware de winkelvloer ondersteunt.'], [CloudOff, '/offline', 'Offline-first', 'Begrijp de lokale continuïteit van je kassa.'], [Store, '/migrate', 'Migreren', 'Richt je hardware rond je echte winkelproces in.']],
  '/offline': [[ScanLine, '/pos', 'Kassa & betalingen', 'De kritieke flow blijft kort en lokaal bruikbaar.'], [ClipboardCheck, '/daily-close-reporting', 'Dagafsluiting', 'Behoud controle wanneer je weer synchroniseert.'], [ShieldCheck, '/security', 'Veiligheid', 'Koppel continuïteit aan gecontroleerde toegang.']],
  '/security': [[UserCog, '/team-permissions', 'Rollen & goedkeuringen', 'Geef toegang die past bij verantwoordelijkheid.'], [ReceiptText, '/history-returns-invoices', 'Historiek & audit', 'Houd gevoelige handelingen traceerbaar.'], [CloudOff, '/offline', 'Offline-first', 'Blijf operationeel zonder controle te verliezen.']],
};

const FeatureRelated = ({ route }: { route: string }) => {
  const items = featureRelated[route] ?? featureRelated['/product'];
  return <motion.section className="pw-feature-related pw-shell" initial="hidden" whileInView="visible" viewport={revealViewport} variants={stagger}>
    <motion.div variants={fadeUp}><span className="pw-eyebrow">Hierna relevant</span><h2>Ontdek wat hier logisch op volgt.</h2></motion.div>
    <motion.div variants={stagger}>{items.map(([Icon, href, title, body]) => <motion.a href={href} key={href} variants={fadeUp} whileHover={{ y: -5 }}><Icon size={20} /><h3>{title}</h3><p>{body}</p><ArrowRight size={15} /></motion.a>)}</motion.div>
  </motion.section>;
};

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
    <motion.div className="pw-section-heading" variants={fadeUp}><div><span className="pw-eyebrow">Status van koppelingen</span><h2>Geen logo zonder duidelijkheid.</h2><p>“Actief” betekent dat de koppeling in PWAYMENT werkt. “Pilot” en “Validatie” tonen waar verdere controle nodig is.</p></div></motion.div>
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

const paceContextByRoute: Record<string, { context: string; explains: string; opens: string; boundary: string }> = {
  '/product': { context: 'Actieve module, rol, winkelstatus en openstaande taken.', explains: 'Welke stap nu het meeste effect heeft over de hele operatie.', opens: 'De bestaande PWAYMENT-workflow waarin je die stap veilig uitvoert.', boundary: 'Pace verandert niets definitief zonder jouw bevestiging.' },
  '/pos': { context: 'Verkoop in opbouw, gekoppelde klant en verbindingsstatus.', explains: 'Alleen relevante afwijkingen zonder het betaalmoment te verstoren.', opens: 'De juiste verkoop-, klant- of correctieflow.', boundary: 'Pace trekt zich terug tijdens betalen en PIN.' },
  '/inventory': { context: 'Voorraad, verkooptempo, minimumgrens en leverancier.', explains: 'Waarom een product dreigt uit te verkopen of juist blijft liggen.', opens: 'Product, quick entry, telling of bestelvoorstel.', boundary: 'Pace plaatst nooit zelfstandig een bestelling.' },
  '/insights': { context: 'Omzet, marge, voorraadtempo, klanten en datadekking.', explains: 'Waarom een signaal betrouwbaar genoeg is om aandacht te verdienen.', opens: 'De onderliggende producten, perioden of actiekaart.', boundary: 'Pace toont bron en redenering; jij bepaalt de actie.' },
  '/customers': { context: 'Bewust gekoppelde klant, aankopen en winkelbeleid.', explains: 'Eén bruikbaar servicefeit voor het huidige gesprek.', opens: 'Het klantprofiel, de verkoop of relevante opvolging.', boundary: 'Geen verborgen profilering en geen autonome klantactie.' },
  '/webshop': { context: 'Orderstatus, reservering, betaalstatus en beschikbare voorraad.', explains: 'Waar een order wacht en wat de volgende geldige status is.', opens: 'De bestaande order- of voorraadhandeling.', boundary: 'Verzenden, annuleren en terugbetalen blijven bevestigde acties.' },
  '/service-desk': { context: 'Dossierstatus, toestel, onderdelen, planning en klant.', explains: 'Wat ontbreekt of welk dossier aandacht nodig heeft.', opens: 'De juiste intake-, status- of afleverstap.', boundary: 'Pace communiceert of factureert nooit zonder bevestiging.' },
  '/workforce': { context: 'Rol, planning, verlof en bezetting per locatie.', explains: 'Waar capaciteit of toegang niet aansluit op de werkdag.', opens: 'De planning, aanvraag of rechteninstelling.', boundary: 'Publiceren en rechten wijzigen blijven bevoegde acties.' },
  '/integrations': { context: 'Werkelijke connectorstatus, configuratie en laatste controle.', explains: 'Of iets actief, in pilot, in validatie of niet ingericht is.', opens: 'De gekoppelde configuratie of technische controle.', boundary: 'Geen logo wordt als werkend voorgesteld zonder bewijs.' },
  '/hardware': { context: 'Browser, apparaattoestemming, model en workflow.', explains: 'Welke combinatie aantoonbaar werkt en wat nog getest moet worden.', opens: 'De juiste hardware- of registerinstelling.', boundary: 'Pace belooft geen compatibiliteit buiten de gevalideerde matrix.' },
  '/offline': { context: 'Verbinding, lokale wachtrij en actieve kassaflow.', explains: 'Wat lokaal doorloopt en wat synchronisatie afwacht.', opens: 'De relevante status of herstelcontrole.', boundary: 'Onzekere synchronisatie wordt nooit als afgerond getoond.' },
  '/security': { context: 'Rol, toestemming, gevoeligheid en auditcontext.', explains: 'Waarom een handeling geblokkeerd is of goedkeuring vereist.', opens: 'De juiste rechten- of goedkeuringsflow.', boundary: 'Pace omzeilt nooit rollen, toestemmingen of audit.' },
};

const PaceFeatureContext = ({ route }: { route: string }) => {
  const item = paceContextByRoute[route] ?? paceContextByRoute['/product'];
  return <motion.section className="pw-pace-context pw-shell" initial="hidden" whileInView="visible" viewport={revealViewport} variants={stagger}>
    <motion.div className="pw-pace-context-heading" variants={fadeUp}><span className="pw-eyebrow">Powered by Pace</span><h2>Context erin.<br />Een veilige stap eruit.</h2><p>Pace staat niet naast deze module. Het begrijpt de module waarin je werkt en verbindt die context met de bestaande PWAYMENT-acties.</p></motion.div>
    <motion.div className="pw-pace-context-grid" variants={stagger}>{[
      ['Wat Pace ziet', item.context], ['Wat Pace uitlegt', item.explains], ['Wat Pace opent', item.opens], ['Wat jij beslist', item.boundary],
    ].map(([title, body], index) => <motion.article key={title} variants={fadeUp}><span>0{index + 1}</span><h3>{title}</h3><p>{body}</p></motion.article>)}</motion.div>
    <motion.a variants={fadeUp} href="/pace" className="pw-text-link">Ontdek hoe Pace werkt <ArrowRight size={15} /></motion.a>
  </motion.section>;
};

const OperationalPage = ({ data, route }: { data: OperationalPageData; route: string }) => (
  <>
    <AnimatedPageHero eyebrow={data.eyebrow} title={data.title} intro={data.intro} actions={<><a className="pw-button pw-button-dark" href="/demo">Bespreek je werkwijze <ArrowRight size={16} /></a><a className="pw-text-link" href="/pricing">Bekijk de plannen <ArrowRight size={15} /></a></>} />
    <motion.section className="pw-wide-product pw-shell" initial={{ opacity: 0, y: 42, scale: .98 }} whileInView={{ opacity: 1, y: 0, scale: 1 }} viewport={revealViewport} transition={{ duration: .9, ease: motionEase }}><div className="pw-window-bar"><i /><i /><i /><span>In de PWAYMENT-app</span><b>In beeld</b></div><img src={data.image} alt={data.imageAlt} loading="eager" /><div className="pw-wide-proof"><CircleCheck size={18} />{data.proof}</div></motion.section>
    <motion.section className="pw-operational-flow pw-shell" initial="hidden" whileInView="visible" viewport={revealViewport} variants={stagger}>{data.flow.map(step => <motion.article key={step.number} variants={fadeUp}><span>{step.number}</span><h2>{step.title}</h2><p>{step.body}</p></motion.article>)}</motion.section>
    <motion.section className="pw-evidence-grid pw-shell" initial="hidden" whileInView="visible" viewport={revealViewport} variants={stagger}><motion.div variants={fadeUp}><span className="pw-eyebrow">Aantoonbare productdiepte</span><h2>Wat deze workflow concreet kan.</h2></motion.div><motion.div variants={stagger}>{data.capabilities.map(item => <motion.article key={item.title} variants={fadeUp}><BadgeCheck size={21} /><h3>{item.title}</h3><p>{item.body}</p><span>{item.evidence}</span></motion.article>)}</motion.div></motion.section>
    <PaceFeatureContext route={route} />
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
    <motion.section className="pw-wide-product pw-shell" initial={{ opacity: 0, y: 42, scale: .98 }} whileInView={{ opacity: 1, y: 0, scale: 1 }} viewport={revealViewport} transition={{ duration: .9, ease: motionEase }}><div className="pw-window-bar"><i /><i /><i /><span>In de PWAYMENT-app</span><b>In beeld</b></div><motion.img src={data.image} alt={data.imageAlt} whileHover={{ scale: 1.008 }} transition={{ duration: .45 }} /><motion.div className="pw-wide-proof" initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={revealViewport} transition={{ delay: .35, duration: .55 }}><CircleCheck size={18} />{data.proof}</motion.div></motion.section>
    <section className="pw-chapters pw-shell">{data.chapters.map((chapter, index) => <motion.article key={chapter.number} initial={{ opacity: 0, y: 34 }} whileInView={{ opacity: 1, y: 0 }} viewport={revealViewport} transition={{ duration: .72, delay: index * .04, ease: motionEase }}><span>{chapter.number}</span><div><h2>{chapter.title}</h2><p>{chapter.body}</p></div><ul>{chapter.points.map((point, pointIndex) => <motion.li key={point} initial={{ opacity: 0, x: 12 }} whileInView={{ opacity: 1, x: 0 }} viewport={revealViewport} transition={{ delay: .15 + pointIndex * .07 }}><Check size={15} />{point}</motion.li>)}</ul></motion.article>)}</section>
    {route === '/pos' && <PosPaymentVideoSection />}
    {route === '/integrations' && <IntegrationStatusSection />}
    {route === '/hardware' && <HardwareCompatibilitySection />}
    <PaceFeatureContext route={route} />
    <FeatureRelated route={route} />
    <FinalCta eyebrow="Klaar om dit in je winkel te zien?" title={<>Begin met één winkel.<br />Groei op je tempo.</>} />
  </>
);

const SolutionPage = ({ data }: { data: SolutionPageData }) => (
  <>
    <AnimatedPageHero eyebrow={data.label} title={data.title} intro={data.intro} actions={<><a className="pw-button pw-button-dark" href="/register">Start gratis <ArrowRight size={16} /></a><a className="pw-text-link" href="/demo">Bespreek je winkel <ArrowRight size={15} /></a></>} />
    <motion.section className="pw-solution-panel pw-shell" initial="hidden" whileInView="visible" viewport={revealViewport} variants={stagger}><motion.div variants={fadeUp}><span className="pw-eyebrow">Waarom dit past</span><h2>{data.proofTitle}</h2><p>{data.proof}</p></motion.div><motion.ul variants={stagger}>{data.bullets.map(item => <motion.li key={item} variants={fadeUp}><CircleCheck />{item}</motion.li>)}</motion.ul></motion.section>
    <motion.section className="pw-solution-focus pw-shell" initial="hidden" whileInView="visible" viewport={revealViewport} variants={stagger}><motion.div variants={fadeUp}><span className="pw-eyebrow">Waar je begint</span><h2>Twee workflows die voor deze winkel het verschil maken.</h2></motion.div><motion.div variants={stagger}>{data.workflows.map((workflow, index) => <motion.a href={workflow.href} key={workflow.href} variants={fadeUp} whileHover={{ y: -5 }}><span>0{index + 1} / {workflow.label}</span><h3>{workflow.title}</h3><p>{workflow.body}</p><ArrowRight size={16} /></motion.a>)}</motion.div></motion.section>
    <FinalCta eyebrow={`Klaar voor ${data.label.toLowerCase()}?`} title={<>Ontdek wat rust<br />in je winkel oplevert.</>} />
  </>
);

const PricingPage = () => {
  const [cycle, setCycle] = useState<BillingCycle>('yearly');
  const [configPlan, setConfigPlan] = useState<'pro' | 'enterprise'>('pro');
  const [extraTerminals, setExtraTerminals] = useState(0);
  const [extraLocations, setExtraLocations] = useState(0);
  const [smsBundles, setSmsBundles] = useState(0);
  const configuredMonthlyCents = planPriceCents(configPlan, cycle)
    + extraTerminals * 2900
    + (configPlan === 'enterprise' ? extraLocations * 7900 : 0)
    + smsBundles * 1500;

  return <>
    <AnimatedPageHero className="pw-pricing-hero" eyebrow="Prijzen" title={<>Eén platform.<br />Pace groeit met je mee.</>} intro="PWAYMENT Basis blijft gratis. De contextuele Pace-begeleiding zit in het platform; het aantal generatieve AI-vragen groeit per plan. Alle softwareprijzen zijn exclusief btw." actions={<BillingCycleControl cycle={cycle} onChange={setCycle} />} />
    <section className="pw-shell"><PlanCards cycle={cycle} context="pricing" /></section>
    <motion.section className="pw-pricing-pace pw-shell" initial="hidden" whileInView="visible" viewport={revealViewport} variants={stagger}><motion.div variants={fadeUp}><span className="pw-eyebrow">Pace in elk groeipad</span><h2>Begeleiding is de basis.<br />AI-capaciteit volgt je plan.</h2><p>Pace blijft een onderdeel van PWAYMENT, geen los product. Lokale context, navigatie en setupbegeleiding blijven beschikbaar; generatieve antwoorden volgen heldere gebruikslimieten.</p><a href="/pace" className="pw-text-link">Hoe Pace veilig werkt <ArrowRight size={15} /></a></motion.div><motion.div className="pw-pricing-pace-grid" variants={stagger}>{[['Basis', '5 AI-vragen per dag', 'Voor setup, navigatie en een eerste winkelcontext.'], ['Professional', '250 AI-vragen per maand', 'Voor dagelijkse begeleiding over verkoop, voorraad en klanten.'], ['Enterprise', '2.500 AI-vragen per maand', 'Met Pace-beleid en proactiviteit afgestemd per rol.']].map(([plan, quota, body]) => <motion.article key={plan} variants={fadeUp}><span>{plan}</span><strong>{quota}</strong><p>{body}</p></motion.article>)}</motion.div></motion.section>
    <motion.section className="pw-feature-matrix pw-shell" initial="hidden" whileInView="visible" viewport={revealViewport} variants={stagger}>
      <motion.div variants={fadeUp} className="pw-section-heading">
        <div><span className="pw-eyebrow">Volledige vergelijking</span><h2>Bekijk precies waar elke groeistap begint.</h2></div>
      </motion.div>
      <motion.div className="pw-feature-matrix-table-wrap" variants={fadeUp}>
        <table>
          <thead><tr><th>Functie</th><th>Basis</th><th>Professional</th><th>Enterprise</th></tr></thead>
          <tbody>
            {PLAN_COMPARISON_GROUPS.map(group => <React.Fragment key={group.category}>
              <tr className="pw-feature-matrix-group"><th colSpan={4}>{group.category}</th></tr>
              {group.rows.map(row => <tr key={row.label}><th>{row.label}</th><td>{row.basic}</td><td>{row.pro}</td><td>{row.enterprise}</td></tr>)}
            </React.Fragment>)}
          </tbody>
        </table>
      </motion.div>
      <motion.p className="pw-compatibility-note" variants={fadeUp}><strong>Hardware is niet inbegrepen.</strong> Je abonnement omvat PWAYMENT-software en de vermelde softwarekoppelingen. Schermen, printers, scanners, betaalterminals, weegschalen en kassalades koop je zelf aan; we controleren per toestel of de koppeling compatibel is.</motion.p>
    </motion.section>
    <motion.section className="pw-current-source pw-shell" initial="hidden" whileInView="visible" viewport={revealViewport} variants={stagger}><motion.div variants={fadeUp}><span className="pw-eyebrow">Ook in je PWAYMENT-omgeving</span><h2>Dezelfde plannen. Dezelfde bedragen. Overal herkenbaar.</h2><p>De planvergelijking in PWAYMENT sluit aan op dezelfde publieke pakketten en prijsstructuur.</p></motion.div><motion.div className="pw-current-source-window" variants={fadeUp} whileHover={{ y: -5 }}><div className="pw-window-bar"><i /><i /><i /><span>Instellingen · Plan &amp; Upgrades</span><b>Overzicht</b></div><img src={plansImage} alt="Planvergelijking in de PWAYMENT-app" loading="lazy" /></motion.div></motion.section>
    <motion.section className="pw-addons pw-shell" initial="hidden" whileInView="visible" viewport={revealViewport} variants={stagger}><motion.div variants={fadeUp}><span className="pw-eyebrow">Gerichte uitbreidingen</span><h2>Breid uit wanneer je winkel dat vraagt.</h2></motion.div><motion.div variants={stagger}>{[['Extra kassascherm', '€ 29 / maand', 'Een extra PWAYMENT-kassascherm op je eigen toestel; een klantendisplay telt niet mee.'], ['Extra Enterprise-filiaal', '€ 79 / maand', 'Voor centrale sturing en lokale voorraad.'], ['ServiceDesk SMS-bundel', '€ 15 / 200', 'Beschikbaar zodra een provider voor je winkel is ingericht.'], ['Installatiebegeleiding', 'Op offerte', 'Optionele hulp om PWAYMENT op je eigen hardware in te richten en te testen.']].map(([name, price, body]) => <motion.article key={name} variants={fadeUp}><h3>{name}</h3><strong>{price}</strong><p>{body}</p></motion.article>)}</motion.div></motion.section>
    <motion.section className="pw-configurator pw-shell" initial="hidden" whileInView="visible" viewport={revealViewport} variants={stagger}>
      <motion.div variants={fadeUp}><span className="pw-eyebrow">Prijsconfigurator</span><h2>Stel je testopstelling samen.</h2><p>Dit is een prijsindicatie. Er wordt nog geen betaling uitgevoerd.</p></motion.div>
      <motion.div className="pw-configurator-panel" variants={fadeUp}>
        <label>Plan<select value={configPlan} onChange={event => setConfigPlan(event.target.value as 'pro' | 'enterprise')}><option value="pro">Retail Professional</option><option value="enterprise">Enterprise & Ketens</option></select></label>
        <label>Extra kassaschermen<input type="number" min="0" max="50" value={extraTerminals} onChange={event => setExtraTerminals(Math.max(0, Number(event.target.value) || 0))} /></label>
        <label>Extra filialen<input type="number" min="0" max="50" disabled={configPlan !== 'enterprise'} value={configPlan === 'enterprise' ? extraLocations : 0} onChange={event => setExtraLocations(Math.max(0, Number(event.target.value) || 0))} /></label>
        <label>SMS-bundels van 200<input type="number" min="0" max="100" value={smsBundles} onChange={event => setSmsBundles(Math.max(0, Number(event.target.value) || 0))} /></label>
        <div className="pw-configurator-total"><span>Indicatie per maand, excl. btw</span><strong>{formatEuroCents(configuredMonthlyCents)}</strong><small>{cycle === 'yearly' ? 'met jaarlijkse softwareprijs' : 'maandelijks opzegbare softwareprijs'}</small></div>
        <a className="pw-button pw-button-dark" href={`/demo?plan=${configPlan}&terminals=${extraTerminals + 1}&locations=${configPlan === 'enterprise' ? extraLocations + 1 : 1}&sms=${smsBundles}`}>Vraag een proefperiode aan <ArrowRight size={16} /></a>
      </motion.div>
    </motion.section>
    <motion.section className="pw-faq pw-shell" initial="hidden" whileInView="visible" viewport={revealViewport} variants={stagger}><motion.div variants={fadeUp}><span className="pw-eyebrow">Prijsinformatie</span><h2>Geen verrassingen in de kleine letters.</h2></motion.div><motion.div className="pw-faq-list" variants={stagger}>{faqs.slice(3).map(([question, answer]) => <motion.details key={question} variants={fadeUp}><summary>{question}<span>+</span></summary><p>{answer}</p></motion.details>)}</motion.div></motion.section>
    <FinalCta />
  </>;
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
        message: [values.get('interest') ? `Gewenste startroute: ${String(values.get('interest'))}` : '', String(values.get('message') ?? '')].filter(Boolean).join('\n\n'),
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
        <h1>{demo ? 'Laat ons je winkel zien. Ervaar hoe PWAYMENT en Pace ermee meewerken.' : 'Waar kunnen we bij helpen?'}</h1>
        <p>{demo ? 'In dertig minuten vertrekken we van je echte winkelcontext: opstart of migratie, verkoopflow, assortiment, hardware en groei. Je ziet niet alleen de modules, maar ook hoe Pace je er veilig doorheen begeleidt.' : 'Een vraag over het product, migratie, hardware of je account? Stuur ons de context; het juiste team pakt het op.'}</p>
        <ul><li><Check />Afgestemd op jouw type winkel en startroute</li><li><Check />Pace in je echte operationele context</li><li><Check />Een helder voorstel zonder generieke verkooppresentatie</li></ul>
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
              {demo && <><div className="pw-form-grid"><label>Aantal locaties<select name="locations"><option>1 locatie</option><option>2–3 locaties</option><option>4–10 locaties</option><option>Meer dan 10</option></select></label><label>Huidige situatie<select name="current"><option>Nog geen POS</option><option>Spreadsheet/eenvoudige kassa</option><option>Andere POS</option><option>Meerdere systemen</option></select></label></div><label>Waar wil je mee starten?<select name="interest" defaultValue={new URLSearchParams(window.location.search).get('interest') === 'pace' ? 'Pace in mijn winkelcontext' : 'Nieuwe winkel opstarten'}><option>Nieuwe winkel opstarten</option><option>Bestaande bestanden importeren</option><option>Overstappen van een andere POS</option><option>Kassa en betalingen</option><option>Voorraad en inkoop</option><option>Winkel en webshop verbinden</option><option>Pace in mijn winkelcontext</option><option>Meerdere locaties</option></select></label></>}
              <label>Waar wil je vooral duidelijkheid over?<textarea name="message" rows={4} minLength={10} maxLength={4000} required /></label>
              <label className="pw-form-honeypot" aria-hidden="true">Website<input name="website" tabIndex={-1} autoComplete="off" /></label>
              <label className="pw-consent"><input name="consent" type="checkbox" required />Ik ga akkoord dat PWAYMENT mijn gegevens gebruikt om op deze aanvraag te antwoorden zoals uitgelegd in de <a href="/legal/privacy" target="_blank" rel="noreferrer">privacyverklaring</a>.</label>
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

const StartPage = () => <>
  <AnimatedPageHero eyebrow="Start met PWAYMENT" title={<>Begin waar je winkel staat.<br />Pace wijst de weg.</>} intro="Een nieuwe winkel, bestaande bestanden of een volledig kassasysteem: PWAYMENT heeft voor elke beginsituatie een gecontroleerde route. Pace houdt bij wat al klaar is en brengt je naar de volgende veilige stap." actions={<><a className="pw-button pw-button-dark" href="/register">Start begeleid <ArrowRight size={16} /></a><a className="pw-text-link" href="/demo?interest=pace">Bekijk het in een demo <ArrowRight size={15} /></a></>} />
  <motion.section className="pw-start-routes pw-shell" initial="hidden" whileInView="visible" viewport={revealViewport} variants={stagger}>{[
    ['01', 'Ik start een nieuwe winkel', 'Bouw winkelgegevens, ticket, categorieën, catalogus en eerste voorraad stap voor stap op.', '/register', 'Start gratis'],
    ['02', 'Ik heb bestanden met productdata', 'Importeer producten, varianten, barcodes, prijzen en voorraad met mapping en validatie.', '/migrate', 'Bekijk de importflow'],
    ['03', 'Ik stap over van een andere POS', 'Breng data, hardware, betaalwijzen, team en dagrapportage samen in een gecontroleerd liveplan.', '/demo?interest=Overstappen', 'Plan de overstap'],
  ].map(([number, title, body, href, label]) => <motion.article key={number} variants={fadeUp}><span>{number}</span><h2>{title}</h2><p>{body}</p><a href={href} className="pw-text-link">{label} <ArrowRight size={15} /></a></motion.article>)}</motion.section>
  <motion.section className="pw-start-proof pw-shell" initial="hidden" whileInView="visible" viewport={revealViewport} variants={stagger}>
    <motion.div className="pw-start-proof-copy" variants={fadeUp}><span className="pw-eyebrow">Accountbegeleiding in de app</span><h2>Geen los hulpfilmpje.<br />Een rondleiding die je winkel begrijpt.</h2><p>Pace leest de echte status van je account. Het weet welke basisstappen klaar zijn, opent het juiste bestaande scherm en blijft beschikbaar zonder de flow over te nemen.</p><ul><li><Check />Voortgang uit je werkelijke winkelconfiguratie</li><li><Check />Context per eigenaar, scherm en volgende stap</li><li><Check />Instellingen blijven door jou bevestigd</li></ul></motion.div>
    <motion.div className="pw-start-shot-stack" variants={fadeUp}><figure><img src={guidedStoreSetupImage} alt="Pace begeleidt de inrichting van winkelgegevens" loading="eager" /><figcaption>Winkelgegevens en basisconfiguratie</figcaption></figure><figure><img src={guidedTicketSetupImage} alt="Pace begeleidt de inrichting van het verkoopticket" loading="lazy" /><figcaption>Van winkelstatus naar de volgende echte instelling</figcaption></figure></motion.div>
  </motion.section>
  <motion.section className="pw-start-stock pw-shell" initial="hidden" whileInView="visible" viewport={revealViewport} variants={stagger}><motion.div variants={fadeUp}><span className="pw-eyebrow">Voorraad opbouwen zonder monnikenwerk</span><h2>Snel invoeren.<br />Daarna gecontroleerd boeken.</h2><p>De quick-entrymodule laat je bestaande producten zoeken of scannen, aantallen en kostprijzen vastleggen en een volledige beginsessie controleren voordat voorraad wordt geboekt.</p><a className="pw-text-link" href="/inventory">Ontdek producten &amp; voorraad <ArrowRight size={15} /></a></motion.div><motion.div className="pw-start-stock-shots" variants={stagger}><motion.figure variants={fadeUp}><img src={stockQuickEntryImage} alt="Snelle voorraadinvoer met zoeken en scannen" loading="lazy" /><figcaption>Zoeken, scannen en regels opbouwen</figcaption></motion.figure><motion.figure variants={fadeUp}><img src={stockOpeningImage} alt="Beginsessie voor voorraadopbouw met controle voor boeking" loading="lazy" /><figcaption>Eerst controleren, dan voorraad boeken</figcaption></motion.figure></motion.div></motion.section>
  <FinalCta eyebrow="Klaar om goed te beginnen?" title={<>Pace kent de route.<br />Jij bepaalt het tempo.</>} />
</>;

const MigrationPage = () => <>
  <AnimatedPageHero eyebrow="Overstappen naar PWAYMENT" title={<>Je data hoeft niet opnieuw.<br />Ze moet juist landen.</>} intro="Importeer producten, varianten, barcodes, prijzen en voorraad met een gecontroleerde mapping. Daarna configureren we hardware, team en rapportage rond je echte werkdag." actions={<><a className="pw-button pw-button-dark" href="/demo?interest=Overstappen">Plan je migratie <ArrowRight size={16} /></a><a className="pw-text-link" href="/start">Vergelijk de startroutes <ArrowRight size={15} /></a></>} />
  <motion.section className="pw-migration-story pw-shell" initial="hidden" whileInView="visible" viewport={revealViewport} variants={stagger}>
    <motion.div className="pw-migration-heading" variants={fadeUp}><span className="pw-eyebrow">Van bestand naar database</span><h2>Niet alles opnieuw manueel invoeren.</h2><p>De migratiemodule leest je bestand, helpt kolommen koppelen aan het PWAYMENT-datamodel, valideert de inhoud en toont achteraf exact wat is verwerkt.</p></motion.div>
    <motion.div className="pw-migration-screens" variants={stagger}>{[[migrationStartImage, '01', 'Upload je bestaande productbestand', 'Start met CSV- of spreadsheetdata uit je huidige systeem.'], [migrationMappingImage, '02', 'Koppel je eigen kolommen', 'Map namen, varianten, barcodes, prijzen, btw en voorraad naar de juiste velden.'], [migrationReceiptImage, '03', 'Controleer het importbewijs', 'Zie hoeveel regels geslaagd, overgeslagen of geblokkeerd zijn voordat je verdergaat.']].map(([image, number, title, body]) => <motion.figure key={number} variants={fadeUp}><img src={image} alt={title} loading="lazy" /><figcaption><span>{number}</span><h3>{title}</h3><p>{body}</p></figcaption></motion.figure>)}</motion.div>
  </motion.section>
  <motion.section className="pw-steps pw-shell" initial="hidden" whileInView="visible" viewport={revealViewport} variants={stagger}>{[['01', 'Inventariseren', 'We brengen data, hardware, betaalmethodes en integraties in kaart.'], ['02', 'Importeren', 'We valideren mapping, duplicaten, prijzen, btw en voorraad voor ze live gaan.'], ['03', 'Inrichten', 'Locaties, registers, rollen, tickets, webshop en koppelingen worden getest.'], ['04', 'Live gaan', 'Je team oefent de volledige winkeldag en Pace ondersteunt de eerste stappen in de app.']].map(([n, title, body]) => <motion.article key={n} variants={fadeUp} whileHover={{ y: -7 }}><span>{n}</span><h2>{title}</h2><p>{body}</p></motion.article>)}</motion.section>
  <FinalCta eyebrow="Je gegevens zijn het begin, niet het obstakel." title={<>Stap gecontroleerd over.<br />Zonder je winkel stil te zetten.</>} />
</>;

const AboutPage = () => <><AnimatedPageHero eyebrow="PWAYMENT, powered by Pace" title="Retailsoftware hoort niet alleen vast te leggen. Ze hoort mee te werken." intro="PWAYMENT is het operationele platform. Pace is de intelligente laag die context begrijpt, betekenis zichtbaar maakt en de veilige volgende stap opent. Samen maken ze elke verkoop bruikbaar voor wat daarna komt." /><motion.section className="pw-manifesto pw-shell" initial="hidden" whileInView="visible" viewport={revealViewport} variants={stagger}><motion.p variants={fadeUp}>Wij bouwen voor de mensen die elke dag openen, verkopen, adviseren, tellen, bestellen en opnieuw beginnen.</motion.p><motion.div variants={stagger}>{[['Rust in de interface.', 'De winkel is al levendig genoeg. PWAYMENT houdt de flow kort en Pace weet wanneer het moet verdwijnen.'], ['Diepte achter eenvoud.', 'Verkoop, voorraad, klanten, webshop en controle delen dezelfde operationele waarheid.'], ['Intelligentie met grenzen.', 'Pace verklaart en begeleidt, maar financiële en definitieve beslissingen blijven bij de bevoegde gebruiker.']].map(([title, body]) => <motion.div className="pw-manifesto-point" key={title} variants={fadeUp}><h2>{title}</h2><p>{body}</p></motion.div>)}</motion.div></motion.section><FinalCta /></>;

const resourceItems = [
  ['Gedeeltelijke retouren in retail', 'Waarom een retour aan de oorspronkelijke verkoop, voorraad en audit gekoppeld hoort te blijven.', 'Gids', '/guides/retouren'],
  ['Wat staat er in een Z-rapport?', 'Omzet, betaalmethodes, btw, cash en shifts in één controleerbare afsluiting.', 'Gids', '/guides/z-rapport'],
  ['Voorraadprognose voor winkels', 'Voorraaddekking, risico op uitverkoop en betrouwbaarheid vertalen naar betere inkoopbeslissingen.', 'Gids', '/guides/voorraadprognose'],
  ['Cadeaubonnen controleerbaar beheren', 'Van uitgifte en opwaardering tot blokkering en volledige saldohistoriek.', 'Gids', '/guides/cadeaubonnen'],
  ['Eén voorraad voor winkel en webshop', 'Zo werken reserveren, annuleren, afhalen en verzenden op dezelfde voorraad.', 'Gids', '/guides/webshopvoorraad'],
  ['De Belgische winkelketen van A tot Z', 'Verbind verkoop, btw, retouren, voorraad en dagafsluiting in één controleerbare keten.', 'Gids', '/guides/belgische-retailflow'],
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

const NotFoundPage = () => <motion.section className="pw-not-found pw-shell" initial="hidden" animate="visible" variants={stagger}><motion.span variants={fadeUp}>404</motion.span><motion.h1 variants={fadeUp}>Deze pagina staat niet in de winkel.</motion.h1><motion.p variants={fadeUp}>De link is mogelijk verplaatst. Vanaf het overzicht vind je snel de juiste richting.</motion.p><motion.a variants={fadeUp} href="/" className="pw-button pw-button-dark">Terug naar home <ArrowRight size={16} /></motion.a></motion.section>;

const FinalCta = ({ eyebrow = 'PWAYMENT, powered by Pace', title = <>Begin waar je winkel staat.<br />Groei zonder opnieuw te beginnen.</> }: { eyebrow?: string; title?: React.ReactNode }) => <motion.section className="pw-final" initial="hidden" whileInView="visible" viewport={revealViewport} variants={stagger}><div className="pw-shell"><motion.span className="pw-eyebrow" variants={fadeUp}>{eyebrow}</motion.span><motion.h2 variants={fadeUp}>{title}</motion.h2><motion.p variants={fadeUp}>Start gratis, laat Pace je account begeleiden of plan een demo rond je bestaande winkelcontext.</motion.p><motion.div variants={fadeUp}><a href="/start" className="pw-button pw-button-dark">Kies je startroute <ArrowRight size={17} /></a><a href="/demo" className="pw-text-link">Plan een persoonlijke demo <ArrowRight size={15} /></a></motion.div></div></motion.section>;

const SiteFooter = ({ locale, routePath }: { locale: PublicLocale; routePath: string }) => (
  <footer className="pw-footer"><div className="pw-shell"><div className="pw-footer-top"><div className="pw-footer-brand"><a href="/" aria-label="PWAYMENT home"><PaceMark size={74} active emotion="idle" motionMode="subtle" /></a><strong>PWAYMENT, powered by Pace.</strong><p>Het retailplatform dat met je meewerkt.</p><address><span>{legalIdentity.legalName} · {legalIdentity.legalForm}</span><span>{legalIdentity.registeredAddress}</span><span>Ondernemingsnr. {legalIdentity.enterpriseNumber} · BTW {legalIdentity.vatNumber}</span><span>{legalIdentity.rpr}</span><a href={`mailto:${legalIdentity.email}`}>{legalIdentity.email}</a><a href={`tel:${legalIdentity.phone.replace(/[^+\d]/g, '')}`}>{legalIdentity.phone}</a></address></div><div className="pw-footer-links"><div><strong>Product</strong><a href="/pace">Pace</a><a href="/pos">POS & betalingen</a><a href="/history-returns-invoices">Retouren & facturen</a><a href="/daily-close-reporting">Dagafsluiting</a><a href="/purchasing-suppliers">Inkoop</a><a href="/team-permissions">Team & rechten</a></div><div><strong>Platform</strong><a href="/inventory">Voorraad</a><a href="/insights">Inzichten</a><a href="/customers">Klanten</a><a href="/webshop">Webshop</a><a href="/integrations">Integraties & status</a><a href="/hardware">Hardwarematrix</a></div><div><strong>Bedrijf</strong><a href="/about">Over PWAYMENT</a><a href="/start">Start met PWAYMENT</a><a href="/resources">Resources</a><a href="/migrate">Migreren</a><a href="/contact">Contact</a></div><div><strong>Account</strong><a href="/pricing">Prijzen</a><a href="/login">Log in</a><a href="/register">Start gratis</a><a href="/demo">Plan een demo</a><a href="/contact">Support</a></div></div></div><div className="pw-footer-bottom"><span>© 2026 PWAYMENT. Alle rechten voorbehouden.</span><div><a href="/legal/privacy">Privacy</a><a href="/legal/cookies">Cookies</a><a href="/legal/terms">Voorwaarden</a><a href="/legal/dpa">Verwerkersovereenkomst</a><a href="/legal/subprocessors">Subverwerkers</a></div><LanguageSwitcher locale={locale} routePath={routePath} compact /></div></div></footer>
);

export default PublicSite;
