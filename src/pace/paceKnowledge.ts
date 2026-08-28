import type { MainView } from "../store/useStore";
import type { PaceAction, PaceContext, PaceQueryAnswer } from "./paceSignals";

interface PaceKnowledgeEntry {
  id: string;
  views?: MainView[];
  patterns: RegExp[];
  title: string;
  answer: string | ((context: PaceContext) => string);
  steps?: string[];
  action?: PaceAction;
  actionLabel?: string;
  followUps?: string[];
  limitation?: string;
  priority?: number;
}

const entry = (value: PaceKnowledgeEntry) => value;

const KNOWLEDGE: PaceKnowledgeEntry[] = [
  entry({
    id: "conversation.greeting",
    patterns: [/^(hi|hey|hallo|hallo pace|hoi|goedemorgen|goedemiddag|goedenavond|hello|bonjour|salut)[!.? ]*$/i],
    title: "Hallo, ik ben Pace",
    answer: (context) => `Hallo! Natuurlijk mag je gewoon hallo zeggen. Ik kan vrij met je meedenken én ik ken de PWAYMENT-werkruimte. Je zit nu in ${context.view}; vraag gerust wat je wilt weten of doen.`,
    followUps: ["Wat kan ik hier vragen?", "Welke gegevens gebruikt Pace?", "Wat is mijn synchronisatiestatus?"],
    priority: 30,
  }),
  entry({
    id: "customers.best",
    views: ["customers"],
    patterns: [/(beste|top|meeste).*(klant|besteed|uitgaven|omzet)/i, /(welke|wie).*(beste klant|meest besteed)/i],
    title: "Je beste klant",
    answer: "Ik haal hiervoor de actuele klantenrangschikking van je winkel op. Als die tijdelijk niet beschikbaar is, verzin ik geen naam of bedrag.",
    action: { kind: "navigate", view: "customers" },
    actionLabel: "Open Klanten",
    followUps: ["Hoeveel klanten heb ik?", "Waar zie ik de aankopen van deze klant?"],
  }),
  entry({
    id: "sync.status",
    patterns: [/\b(sync|synchronis|offline|online|verbinding|wachtrij|aflever)\w*/i, /waarom.+(mislukt|fout|vast)/i],
    title: "Synchronisatiestatus",
    answer: (context) => {
      if (context.failedSync > 0) return `${context.failedSync} synchronisatie${context.failedSync === 1 ? " is" : "s zijn"} afgewezen. ${context.syncIssueSummary ?? "De server heeft de wijziging niet aanvaard."} ${context.syncIssueResolution ?? "Open de herstelwachtrij en corrigeer eerst de getoonde oorzaak."}`;
      if (context.retryingSync > 0) return `${context.retryingSync} wijziging${context.retryingSync === 1 ? " wordt" : "en worden"} automatisch opnieuw aangeboden. ${context.syncIssueSummary ?? "De vorige afleverpoging werd niet bevestigd."} ${context.syncIssueResolution ?? "Voer de oorspronkelijke handeling niet opnieuw uit."}`;
      if (context.pendingSync > 0) return `${context.pendingSync} lokale wijziging${context.pendingSync === 1 ? " wacht" : "en wachten"} op serverbevestiging. Voer die niet opnieuw uit; de lokale kopie is al bewaard.`;
      return context.online
        ? "Dit toestel is online en de lokale afleverwachtrij is leeg."
        : "Dit toestel is offline. Ondersteunde handelingen worden lokaal bewaard en later afgeleverd; serverafhankelijke functies kunnen tijdelijk niet werken.";
    },
    action: { kind: "profile", tab: "integrations" },
    actionLabel: "Open herstelwachtrij",
    followUps: ["Kan ik offline blijven verkopen?", "Moet ik de handeling opnieuw uitvoeren?"],
    priority: 20,
  }),
  entry({
    id: "pos.product-search",
    views: ["pos"],
    patterns: [/(zoek|vind|scan).*(product|artikel|sku|barcode)/i, /(barcode|sku).*(niet|onbekend|herkend|zoeken)/i],
    title: "Product vinden aan de kassa",
    answer: "Gebruik de zoekbalk voor productnaam, SKU of barcode. Een keyboard-wedge scanner mag rechtstreeks scannen zolang geen invoerveld of betaalvenster actief is. Een onbekende code wijzigt de mand niet.",
    steps: ["Open Kassa.", "Klik in de zoekbalk of scan de code.", "Kies het juiste product uit de resultaten."],
    action: { kind: "navigate", view: "pos" },
    actionLabel: "Open Kassa",
    followUps: ["Waarom wordt deze barcode niet herkend?", "Waarom kan ik een uitverkocht product niet toevoegen?"],
  }),
  entry({
    id: "pos.cart",
    views: ["pos"],
    patterns: [/(winkelmand|mand|winkelwagen).*(parkeer|hervat|terug|annuleer|leeg|verwijder)/i, /(parkeer|hervat|bewaar).*(mand|verkoop)/i],
    title: "Winkelmand beheren",
    answer: "Via de mandacties kun je de actieve mand parkeren, hervatten of gecontroleerd annuleren. Een geparkeerde mand blijft bij deze winkel bewaard. Bij vervangen kan de huidige gevulde mand eerst veilig worden geparkeerd.",
    steps: ["Open de winkelmand.", "Open Mandacties.", "Kies parkeren, hervatten of annuleren en bevestig in de bestaande dialoog."],
    action: { kind: "navigate", view: "pos" },
    actionLabel: "Open winkelmand",
    followUps: ["Wat gebeurt er met de actieve mand?", "Waar vind ik geparkeerde manden?"],
  }),
  entry({
    id: "pos.customer",
    views: ["pos", "customers"],
    patterns: [/(koppel|ontkoppel|selecteer).*(klant)/i, /(klant).*(verkoop|mand|prijs|groep)/i],
    title: "Klant aan de verkoop koppelen",
    answer: "Koppel een bestaande klant vanuit de winkelmand. PWAYMENT kan daarna de ingestelde prijsgroep en toegestane klantcontext gebruiken. Ontkoppelen verwijdert de klant alleen uit deze actieve verkoop.",
    action: { kind: "navigate", view: "pos" },
    actionLabel: "Open Kassa",
    followUps: ["Waarom krijgt deze klant een andere prijs?", "Welke klantgegevens gebruikt Pace?"],
  }),
  entry({
    id: "pos.discount",
    views: ["pos"],
    patterns: [/(korting|discount).*(geven|mand|reden|manager|pin|goedkeur)/i, /manager.*(korting|discount)/i],
    title: "Korting met controle",
    answer: "Voeg de korting toe in de winkelmand en noteer de reden. Wanneer de ingestelde grens of rol dit vereist, moet een bevoegde manager of eigenaar de korting in de bestaande flow goedkeuren. Pace vraagt of verwerkt de PIN nooit zelf.",
    action: { kind: "navigate", view: "pos" },
    actionLabel: "Open winkelmand",
    followUps: ["Waarom is managergoedkeuring nodig?", "Wat als de PIN geblokkeerd is?"],
  }),
  entry({
    id: "pos.payment",
    views: ["pos"],
    patterns: [/(betaal|afreken|cash|wisselgeld|pin|kaart|split tender|deelbetaling|afrond)/i],
    title: "Betalen aan de kassa",
    answer: "PWAYMENT ondersteunt cash, geregistreerde PIN, cadeaubon en split tender. Cash toont ontvangen bedrag, Belgische afronding en wisselgeld. Controleer bedragen vóór je in de betaalflow bevestigt.",
    steps: ["Controleer artikelen, klant, korting en documentkeuze.", "Kies de betaalwijze.", "Controleer het resterende bedrag en bevestig in de betaalflow."],
    action: { kind: "navigate", view: "pos" },
    actionLabel: "Open Kassa",
    followUps: ["Hoe splits ik cash en PIN?", "Kan Pace zien of de terminalbetaling gelukt is?"],
    limitation: "Pace start geen betaling. PIN is een geregistreerde tender; zonder gekoppelde provider kan Pace geen terminal-capturestatus uitlezen.",
  }),
  entry({
    id: "pos.document",
    views: ["pos", "audit-log"],
    patterns: [/(ticket|bon|b2c|b2b|factuur|btw.nummer|po.referentie).*(kies|maak|nodig|invul|print|herdruk)/i],
    title: "Verkoopdocument kiezen",
    answer: "Kies vóór betaling tussen ticket, B2C-factuur en B2B-factuur. Voor een factuur leg je de ontvanger vast; voor B2B kunnen btw- en PO-gegevens nodig zijn. Na verkoop vind je het document terug in Historiek.",
    action: { kind: "navigate", view: "audit-log" },
    actionLabel: "Open Historiek",
    followUps: ["Welke klantgegevens zijn verplicht?", "Hoe download ik de factuur als PDF?"],
  }),
  entry({
    id: "history.search",
    views: ["audit-log"],
    patterns: [/(historiek|verkoop|transactie|ticket).*(zoek|vind|filter|datum|kassier|bedrag|betaal)/i, /(zoek|vind).*(ticket|transactie|verkoop)/i],
    title: "Verkoop terugvinden",
    answer: "Open Historiek en zoek op ticket- of transactiegegevens. Gebruik periode, betaalwijze en andere beschikbare filters om de resultaten te beperken. Een ticketbarcode kan rechtstreeks naar de retourzoekflow leiden.",
    action: { kind: "navigate", view: "audit-log" },
    actionLabel: "Open Historiek",
    followUps: ["Hoe start ik een retour?", "Waarom zie ik maar een beperkte periode?"],
  }),
  entry({
    id: "history.return",
    views: ["audit-log"],
    patterns: [/(retour|refund|terugbet|terugname|credit).*(start|artikel|aantal|reden|waarom|lukt|betaal)/i, /(product|artikel).*(retour|terugbrengen)/i],
    title: "Retour uitvoeren",
    answer: "Open de oorspronkelijke verkoop in Historiek, kies alleen de retourneerbare regels en aantallen, geef een reden en kies bewust de terugbetaalwijze en voorraadbestemming. De oorspronkelijke verkoop blijft behouden; de retour wordt als aparte negatieve correctie gelogd.",
    steps: ["Zoek en open de oorspronkelijke verkoop.", "Start Retour en kies regels en aantallen.", "Kies reden, voorraadbestemming en terugbetaalwijze.", "Controleer en bevestig met de vereiste bevoegdheid."],
    action: { kind: "navigate", view: "audit-log" },
    actionLabel: "Retour zoeken",
    followUps: ["Welke voorraadbestemming kies ik?", "Waarom kan ik niet meer stuks retourneren?"],
  }),
  entry({
    id: "history.disposition",
    views: ["audit-log"],
    patterns: [/(verkoopbaar|sellable|quarantaine|defect|retour leverancier|voorraadbestemming)/i],
    title: "Voorraadbestemming bij retour",
    answer: "Kies verkoopbaar alleen wanneer het artikel opnieuw verkocht mag worden. Quarantaine, defect en retour leverancier blijven buiten verkoopbare voorraad. De keuze wordt bij de retour gelogd en bepaalt de voorraadmutatie.",
    followUps: ["Wanneer stijgt verkoopbare voorraad?", "Waar zie ik de voorraadbeweging?"],
  }),
  entry({
    id: "history.audit-export",
    views: ["audit-log"],
    patterns: [/(audit|export|csv|json).*(historiek|verkoop|rapport|bekijk|download|waarom)/i],
    title: "Historiek en audit exporteren",
    answer: "Historiek kan verkopen en rapportgegevens exporteren. Volledige auditweergave en auditexport kunnen door rol, plan en retentie worden beperkt. Pace kan de pagina openen, maar geen auditrecord wijzigen of verwijderen.",
    action: { kind: "navigate", view: "audit-log" },
    actionLabel: "Open Historiek",
  }),
  entry({
    id: "close.explain",
    views: ["z-report"],
    patterns: [/(dagafsluit|z.rapport|x.rapport|afsluiten|opening float|dagoverzicht)/i],
    title: "Dagafsluiting controleren",
    answer: "Het dagoverzicht is een controle vóór afsluiten; het Z-rapport finaliseert de periode. Controleer transacties, betaalmix, btw, verwacht en geteld cash en eventuele verschillen. Een definitief rapport blijft controleerbaar in Historiek.",
    action: { kind: "navigate", view: "z-report" },
    actionLabel: "Open Dagafsluiting",
    followUps: ["Waarom kan ik nog niet afsluiten?", "Waar vind ik eerdere Z-rapporten?"],
  }),
  entry({
    id: "close.cash-difference",
    views: ["z-report"],
    patterns: [/(kasverschil|geteld cash|verwacht cash|verschilreden|cash tell)/i],
    title: "Cash reconciliëren",
    answer: "Vul het werkelijk getelde cashbedrag in en vergelijk het met verwacht cash. Bij een verschil vraagt PWAYMENT een concrete reden. Pace kan het verschil tonen of uitleggen, maar verzint geen reden en finaliseert het rapport niet.",
    action: { kind: "navigate", view: "z-report" },
    actionLabel: "Open cashcontrole",
  }),
  entry({
    id: "close.vat-margin",
    views: ["z-report", "insights"],
    patterns: [/(btw|0%|6%|12%|21%|marge|brutowinst|kostprijs|betaalmix).*(rapport|bereken|zie)/i],
    title: "Financiële uitsplitsing",
    answer: "Dagafsluiting toont betaalmix en btw-snapshots per ondersteund tarief. Marge en brutowinst zijn alleen betrouwbaar waar kostprijzen aanwezig zijn. Cashafrondingen worden afzonderlijk in de rapportbasis verwerkt.",
    action: { kind: "navigate", view: "z-report" },
    actionLabel: "Open rapport",
  }),
  entry({
    id: "catalog.product",
    views: ["profile", "pos"],
    patterns: [/(product|artikel|catalogus).*(toevoeg|maak|beheer|wijzig|archiveer|herstel|velden|kostprijs|leverancier)/i, /waar.*(producten|catalogus)/i],
    title: "Productbeheer",
    answer: "Open Instellingen → Catalogus → Producten. Daar kun je een product toevoegen, wijzigen, archiveren of herstellen. Naam, type, btw en verkoopprijs vormen de basis; SKU, barcode, kostprijs, merk en leverancier maken beheer en rapportering preciezer.",
    action: { kind: "profile", tab: "catalog-products" },
    actionLabel: "Open producten",
    followUps: ["Hoe voeg ik varianten toe?", "Waarom wordt deze barcode geweigerd?"],
  }),
  entry({
    id: "catalog.variants-identifiers",
    views: ["profile"],
    patterns: [/(variant|maat|maten|kleur|kleuren|productfamilie|sku|ean|upc|gtin|identifier|scancode).*(toevoeg|dubbel|verschil|meerdere|geweigerd)/i, /(voeg|maak).*(maat|maten|kleur|kleuren|variant)/i],
    title: "Varianten en identifiers",
    answer: "Een productfamilie bevat gedeelde gegevens; iedere verkoopbare variant heeft haar eigen SKU en optiecombinatie, bijvoorbeeld maat en kleur. PWAYMENT kan meerdere identifiers bewaren, maar actieve scancodes en SKU's moeten uniek blijven.",
    action: { kind: "profile", tab: "catalog-products" },
    actionLabel: "Open varianten",
  }),
  entry({
    id: "catalog.categories",
    views: ["profile"],
    patterns: [/(categorie|subcategorie|bovenliggende|parent).*(maak|beheer|archiveer|btw|volgorde|waarom)/i],
    title: "Categorieën beheren",
    answer: "Categorieën bepalen onder meer structuur, sortering en standaard-btw. Subcategorieën krijgen één geldige bovenliggende categorie; cyclische relaties worden geblokkeerd. Archiveren bewaart bestaande verwijzingen maar verbergt de categorie voor nieuw gebruik.",
    action: { kind: "profile", tab: "catalog-categories" },
    actionLabel: "Open categorieën",
  }),
  entry({
    id: "catalog.inventory",
    views: ["profile", "insights"],
    patterns: [/(voorraad|minimumvoorraad|opening balance|telling|correctie|schade|verlies|gevonden|beweging).*(wijzig|beheer|waar|hoe|waarom)/i],
    title: "Voorraad gecontroleerd aanpassen",
    answer: "Voorraad verandert via verkoop, retour, webshopreservatie, ontvangst of een gecontroleerde telling/correctie. Gebruik voor een handmatige correctie de juiste reden, zodat de beweging controleerbaar blijft. Minimumvoorraad is een bestelpunt en mag hoger zijn dan de huidige voorraad.",
    action: { kind: "profile", tab: "catalog-products" },
    actionLabel: "Open voorraad",
  }),
  entry({
    id: "catalog.labels-import",
    views: ["profile", "integration-hub"],
    patterns: [/(label|etiket|dymo|zebra|csv.import|catalogusimport|export).*(print|maak|waarom|werkt|verschil)/i],
    title: "Labels en catalogusimport",
    answer: "Productbeheer kan catalogusdata exporteren en, wanneer de platformflag actief is, CSV importeren. Voor grotere CSV/XLSX-migraties gebruik je de Integration Hub met mapping, preview en validatie. Labelprint maakt browserlabels; een rechtstreekse Dymo- of Zebra-driver is niet aangetoond.",
    action: { kind: "profile", tab: "labels" },
    actionLabel: "Open labels",
    followUps: ["Wanneer gebruik ik de Integration Hub?", "Waarom is CSV-import uitgeschakeld?"],
  }),
  entry({
    id: "insights.explain",
    views: ["insights"],
    patterns: [/(inzicht|actiekaart|omzet|productprestatie|verkoopmoment|kortinganalyse|stagnant|slow|healthy).*(beteken|basis|waarom|hoe|zie)/i],
    title: "Van inzicht naar controleerbare actie",
    answer: "Inzichten combineren de gekozen periode, filters en aanwezige verkoop- of voorraaddata. Open een kaart om de onderliggende producten of periode te controleren. Opslaan, uitstellen of afronden verandert niet automatisch voorraad of externe systemen.",
    action: { kind: "navigate", view: "insights" },
    actionLabel: "Open Inzichten",
  }),
  entry({
    id: "insights.best-sales-weekday",
    views: ["insights", "audit-log", "z-report"],
    patterns: [/(beste|sterkste|hoogste).*(verkoop|omzet).*(dag|weekdag)/i, /(welke|wat).*(dag|weekdag).*(beste|meeste|hoogste).*(verkoop|omzet)/i],
    title: "Historisch beste verkoopsdag",
    answer: "Pace vergelijkt hiervoor alle afgeronde verkopen per lokale weekdag en gebruikt de gemiddelde omzet per actieve verkoopdag, met totaalomzet en transactieaantal als controle.",
    action: { kind: "navigate", view: "insights" },
    actionLabel: "Open Inzichten",
  }),
  entry({
    id: "insights.best-sales-date",
    views: ["insights", "audit-log", "z-report"],
    patterns: [
      /(welke|wat|op welke).*(datum|dag).*(best|meest|hoogst).*(verkocht|omzet)/i,
      /(best|meest|hoogst).*(verkocht|omzet).*(datum|dag)/i,
    ],
    title: "Historisch beste verkoopdatum",
    answer: "Pace haalt hiervoor alle afgeronde verkopen en retouren uit de toegestane winkelhistoriek op en rangschikt kalenderdatums op netto-omzet. Als live winkelgegevens tijdelijk niet beschikbaar zijn, verzin ik geen datum of bedrag.",
    action: { kind: "navigate", view: "insights" },
    actionLabel: "Open Inzichten",
  }),
  entry({
    id: "insights.forecast-po",
    views: ["insights"],
    patterns: [/(forecast|prognose|days of cover|stockout|confidence|seizoen|besteladvies|purchase order|bestelling|leverancier).*(bereken|maak|ontvang|waarom|beteken)/i, /days of cover|stockoutdatum|besteladvies/i],
    title: "Forecast en inkoop",
    answer: "Forecast gebruikt verkoopsnelheid, voorraad, trend en waar mogelijk seizoen om days of cover en een mogelijke stockoutdatum te schatten. Ontbrekende of onregelmatige data verlaagt de confidence. Een besteladvies blijft aanpasbaar en wordt nooit autonoom bij een leverancier geplaatst.",
    action: { kind: "navigate", view: "insights" },
    actionLabel: "Open voorraadinzichten",
  }),
  entry({
    id: "customers.manage",
    views: ["customers"],
    patterns: [/(klant|klantdossier|crm).*(maak|zoek|filter|archiveer|herstel|aankoop|omzet|bezoek|factuur)/i],
    title: "Klanten beheren",
    answer: "In Klanten kun je dossiers zoeken, aanmaken, archiveren en herstellen. Een dossier bundelt toegestane contactgegevens, bezoeken, omzet en aankoopgeschiedenis. Facturen blijven gekoppeld aan de onderliggende verkoop.",
    action: { kind: "navigate", view: "customers" },
    actionLabel: "Open Klanten",
  }),
  entry({
    id: "customers.loyalty",
    views: ["customers", "profile"],
    patterns: [/(loyalty|loyaliteit|punten|vip|prijsgroep|prijssegment)/i],
    title: "Loyalty en klantgroepen",
    answer: "Loyalty en prijsgroepen zijn afzonderlijke instellingen. Een prijsgroep kan een deterministische productprijs toepassen; loyaltypunten volgen de ingestelde regeling. Beschikbaarheid hangt af van module, plan en effectieve rechten.",
    action: { kind: "navigate", view: "customers" },
    actionLabel: "Open Klanten",
  }),
  entry({
    id: "customers.giftcards",
    views: ["customers", "pos"],
    patterns: [/(cadeaubon|gift.?card|kaart).*(uitgeven|opwaardeer|waardeer|saldo|blokkeer|verval|gebruik|deelbetaling|gebeurtenis)/i, /(uitgeven|opwaardeer|waardeer|blokkeer).*(cadeaubon|gift.?card)/i],
    title: "Cadeaubonnen",
    answer: "Cadeaubonbeheer ondersteunt uitgifte, opwaardering, blokkeren/heractiveren en een controleerbare saldohistoriek. Betalen met een cadeaubon is een aparte POS-mogelijkheid; het recht om kaarten uit te geven kan verschillen van het recht om ze als tender te gebruiken.",
    action: { kind: "navigate", view: "customers" },
    actionLabel: "Open cadeaubonnen",
  }),
  entry({
    id: "webshop.settings",
    views: ["profile"],
    patterns: [/(webshop|storefront|online shop).*(beheer|publiceer|branding|kleur|logo|hero|zichtbaar|assortiment|coupon|verzend|afhaal|notitie)/i],
    title: "Webshop beheren",
    answer: "In Webshop beheer je branding, online assortiment, productcopy, coupons, levering en afhalen. Alleen beschikbare en bewust zichtbare producten verschijnen publiek. Publiceren of voorwaarden wijzigen blijft een expliciete gebruikersactie.",
    action: { kind: "profile", tab: "webshop-general" },
    actionLabel: "Open webshop",
  }),
  entry({
    id: "webshop.orders",
    views: ["profile"],
    patterns: [/(webshoporder|webshopvoorraad|online order|bestelling).*(status|betaling|fulfil|verwerk|verzend|afhaal|annuleer|voorraad|reserv|gereserveerd)/i, /(reserv|gereserveerd).*(webshop|online order|bestelling|voorraad)/i],
    title: "Webshoporders opvolgen",
    answer: "Orderstatus, betaalstatus en fulfilmentstatus worden apart bijgehouden. Voorraad wordt bij een geldige order gereserveerd, bij annulatie vrijgegeven en bij verzending of afhaling definitief verwerkt. Open de order en kies de volgende expliciete statusactie.",
    action: { kind: "profile", tab: "webshop-general" },
    actionLabel: "Open webshoporders",
  }),
  entry({
    id: "webshop.external-limit",
    patterns: [/(webshop|online).*(mail|email|kaartbetaling|psp|refund|terugbetaling)/i],
    title: "Externe webshopdiensten",
    answer: "PWAYMENT kan de gekozen betaalmethode en orderstatus registreren, maar in deze versie is geen bewezen externe PSP-capture, automatische bevestigingsmail of provider-refund aanwezig. Controleer de betaalprovider voordat je een betaling opnieuw probeert.",
  }),
  entry({
    id: "service.intake",
    views: ["service"],
    patterns: [/(herstel|service|dossier|intake|toestel|imei|serienummer|mac.adres|framenummer|accessoire|intakefoto).*(maak|registreer|toevoeg|waar)/i],
    title: "Hersteldossier starten",
    answer: "Een intake bevat klant, toestelidentificatie, accessoires, klacht en staat bij binnenkomst. Foto's zijn begrensd en kunnen een afzonderlijk recht vereisen. Interne notities blijven buiten de publieke klantopvolging.",
    action: { kind: "navigate", view: "service" },
    actionLabel: "Open Herstellingen",
  }),
  entry({
    id: "service.workflow",
    views: ["service"],
    patterns: [/(herstel|herstelling|dossier|service).*(diagnose|oplossing|status|substatus|rma|leverancier|voorschot|werkuren|onderdelen|tracking|klant ziet)/i, /(diagnose|oplossing|status|rma).*(herstel|herstelling|dossier|service)/i],
    title: "Herstelling opvolgen",
    answer: "Werk status, diagnose, oplossing, prijsopbouw en eventuele externe referentie bij in het dossier. De publieke trackingpagina toont alleen beperkte klantinformatie; interne notities blijven verborgen.",
    action: { kind: "navigate", view: "service" },
    actionLabel: "Open dossiers",
  }),
  entry({
    id: "service.external-limit",
    patterns: [/(sms|technicus|technieker).*(herstel|service|toewijs|stuur|automatisch)/i],
    title: "Service-integraties",
    answer: "PWAYMENT bevat rechten en velden voor aanvullende servicefuncties, maar Pace claimt geen afgeleverde SMS of volledige technicustoewijzing zolang de externe provider- en eindflow niet actief bewezen zijn.",
  }),
  entry({
    id: "workforce.roster",
    views: ["workforce"],
    patterns: [/\b(rooster|shift|werkpatroon|week kopie|publiceer|heropen|dag|week|maand|jaar)\b.*\b(maak|wijzig|verwijder|zie|wissel|hoe)\b/i],
    title: "Rooster beheren",
    answer: "Gebruik dag, week, maand of jaar en filter indien nodig op medewerker. Bevoegde gebruikers kunnen shifts en patronen beheren. Publiceren maakt het rooster zichtbaar volgens de bestaande workforce-regels; heropenen is een expliciete beheeractie.",
    action: { kind: "navigate", view: "workforce" },
    actionLabel: "Open Rooster",
  }),
  entry({
    id: "workforce.leave",
    views: ["workforce"],
    patterns: [/(verlof|vakantie|saldo|aanvraag).*(aanvraag|intrek|goedkeur|afkeur|beslis|pin|motivatie|eigen)/i],
    title: "Verlof aanvragen en beslissen",
    answer: "Een medewerker kan een eigen verlofaanvraag indienen of terugtrekken. Een bevoegde beoordelaar beslist volgens saldi en bezetting, kan nooit de eigen aanvraag beslissen en bevestigt gevoelige beslissingen met de persoonlijke PIN in de bestaande workflow.",
    action: { kind: "navigate", view: "workforce" },
    actionLabel: "Open Verlof",
    limitation: "Pace vraagt geen persoonlijke PIN en keurt nooit zelfstandig verlof goed of af.",
  }),
  entry({
    id: "integration.import",
    views: ["integration-hub"],
    patterns: [/(integration hub|import|migratie|csv|tsv|excel|xlsx|json|mapping|kolom|validatie|preview|activatie).*(hoe|waarom|bestand|fout|rij|lokaal)/i],
    title: "Gegevens veilig importeren",
    answer: "Voeg het bestand toe, controleer de voorgestelde veldmapping en los blokkerende issues op vóór activatie. CSV, TSV, Excel en JSON worden in de importflow lokaal gelezen. De review toont welke records nieuw, bijgewerkt of overgeslagen worden.",
    steps: ["Voeg één bronbestand toe.", "Controleer kolommapping en normalisatie.", "Los alle blokkerende issues op.", "Controleer de review en activeer bewust."],
    action: { kind: "navigate", view: "integration-hub" },
    actionLabel: "Open Integration Hub",
  }),
  entry({
    id: "integration.undo",
    views: ["integration-hub"],
    patterns: [/(undo|ongedaan|migratiereceipt|safety ledger|verzegeld|eerste activiteit).*(import|migratie|waarom|wanneer|geblokkeerd)/i, /(import|migratie).*(undo|ongedaan|geblokkeerd|verzegeld)/i],
    title: "Migratie ongedaan maken",
    answer: "De migratiereceipt bewaart welke records door de activatie zijn gemaakt. Volledige undo kan alleen vóór de eerste betekenisvolle winkelactiviteit; daarna wordt ze veilig geblokkeerd zodat live verkopen of andere mutaties niet worden teruggedraaid.",
    action: { kind: "navigate", view: "integration-hub" },
    actionLabel: "Open migratiereceipt",
  }),
  entry({
    id: "integration.external-limit",
    views: ["integration-hub", "profile"],
    patterns: [/(verbinding testen|handmatige sync|webhook|api.sleutel|exact|shopify|sftp|oauth|connector).*(echt|werkt|stuur|sync|waar)/i],
    title: "Integratiegrens",
    answer: "De algemene integratieconfiguratie, verbindingstest, handmatige sync, webhook- en API-records bewijzen niet automatisch externe gegevensoverdracht. Waar geen concrete connector of deliveryworker actief is, zijn test en sync simulatie/configuratie en geen provider-call.",
    action: { kind: "profile", tab: "integrations" },
    actionLabel: "Open integraties",
  }),
  entry({
    id: "hardware.scanner-printer",
    views: ["profile", "pos"],
    patterns: [/(scanner|barcodescanner|thermische printer|bonprinter|webusb|epson|ticket).*(instel|verbind|toestemming|werkt niet|print)/i],
    title: "Scanner en bonprinter",
    answer: "Een keyboard-wedge scanner werkt als snel toetsenbord en heeft meestal geen aparte driver nodig. Een compatibele Epson-thermische printer kan via WebUSB verbinden in een veilige Chromium-context; de browser vraagt daarvoor expliciete apparaattoestemming. Browserprint blijft een alternatief.",
    action: { kind: "profile", tab: "integrations" },
    actionLabel: "Open hardware-instellingen",
  }),
  entry({
    id: "hardware.limit",
    patterns: [/(kassalade|betaalterminal|terminalhost|weegschaal|dymo|zebra).*(open|status|echt|gekoppeld|werkt)/i],
    title: "Hardwarestatus eerlijk uitgelegd",
    answer: "Instellingen in PWAYMENT betekenen niet automatisch dat een fysiek protocol actief is. Pace kan geen kassalade, terminal of weegschaal aansturen en geen terminal-capturestatus bevestigen wanneer daarvoor geen concrete gekoppelde driver/provider beschikbaar is.",
  }),
  entry({
    id: "hardware.customer-display",
    patterns: [/(klantendisplay|customer display|tweede scherm).*(open|koppel|verbonden|verouderd|ziet|netwerk)/i],
    title: "Klantendisplay",
    answer: "Het klantendisplay opent in een aparte browsercontext en ontvangt lokaal winkelmand- en betaalstatus via het PWAYMENT-displayprotocol. Heartbeatstatus maakt zichtbaar of het scherm verbonden, verouderd of weggevallen is; het is geen algemeen netwerkdisplayprotocol.",
  }),
  entry({
    id: "account.setup",
    views: ["profile"],
    patterns: [/(setup|verkoopklaar|winkelprofiel|winkelnaam|adres|btw.nummer|ticketfooter|retourbeleid|sector|verkoopmodel|standaard.btw).*(wijzig|ontbreek|waarom|hoe|100)/i],
    title: "Winkelsetup",
    answer: (context) => context.firstRunCompleted
      ? "De verkoopbasis is afgerond. Je kunt profiel, catalogus, labels en modules afzonderlijk blijven aanpassen; wijzigingen werken alleen door waar de betreffende workflow ze gebruikt."
      : "De winkelsetup is nog niet volledig afgerond. Pace toont de eerstvolgende controleerbare stap voor profiel, categorieën, producten en labels zonder voorbeelddata stilzwijgend aan te maken.",
    action: { kind: "setup" },
    actionLabel: "Open setup",
  }),
  entry({
    id: "account.modules-rights",
    views: ["profile"],
    patterns: [/(module|recht|rol|kassier|manager|eigenaar|plan|trial|basis|pro|enterprise|platformflag|zichtbaar|geblokkeerd).*(waarom|verschil|aan|uit|mag|functie)/i],
    title: "Modules, rechten en rollen",
    answer: "Zichtbaarheid volgt vier aparte controles: het planrecht, de winkelmodule, de gebruikersrol en soms een platformflag. Een aangezette module verleent geen planrecht. Gevoelige acties houden hun bevestiging of PIN-controle op de doelpagina.",
    action: { kind: "profile", tab: "modules" },
    actionLabel: "Open modules",
    followUps: ["Welk plan heb ik?", "Waarom is deze functie zichtbaar maar geblokkeerd?"],
  }),
  entry({
    id: "account.billing",
    views: ["profile"],
    patterns: [/(abonnement|facturatie|billing|plan|trial|upgrade|limiet).*(bekijk|wijzig|wanneer|welk|product|categorie)?/i],
    title: "Plan en facturatie",
    answer: "Open Plan en facturatie voor de actuele subscription, trial en functielimieten. Pace kan dit overzicht openen, maar voert nooit zelfstandig een aankoop, upgrade of abonnementswijziging uit.",
    action: { kind: "profile", tab: "billing" },
    actionLabel: "Bekijk plan",
  }),
  entry({
    id: "pace.preferences-privacy",
    patterns: [/(pace).*(aan|uit|stil|coach|gebalanceerd|beweging|morph|antwoord|klantcontext|signaal|privacy|gegevens|ai|gemini|opslaan|bron)/i],
    title: "Pace-instellingen en privacy",
    answer: "In Pace-instellingen beheer je proactiviteit, beweging, antwoordstijl en soorten signalen. De lokale helpkern blijft werken zonder AI. Alleen een kleine allow-list met operationele context mag naar de server; klantinzichten, notities, PINs en volledige records blijven buiten de AI-vraag.",
    followUps: ["Is dit antwoord lokaal of met AI gemaakt?", "Hoe zet ik klantcontext uit?"],
  }),
  entry({
    id: "help.discovery",
    patterns: [/wat kan ik hier vragen|waarmee kan pace helpen/i],
    title: "Wat je hier aan Pace kunt vragen",
    answer: (context) => `Vraag naar een concrete handeling, actuele synchronisatiestatus, een blokkade of waar je iets vindt. Op deze werkruimte zijn dit goede starters: ${getPaceQueryHints(context).slice(0, 3).map((hint) => `“${hint}”`).join(", ")}.`,
    followUps: ["Welke gegevens gebruikt Pace?", "Wat is mijn synchronisatiestatus?"],
  }),
];

const VIEW_HINTS: Record<MainView, string[]> = {
  pos: ["Hoe scan ik een product?", "Hoe parkeer ik deze mand?", "Hoe koppel ik een klant?", "Hoe werkt splitbetaling?", "Kan Pace terminalstatus zien?"],
  inventory: ["Hoe boek ik een levering?", "Hoe leg ik een telling vast?", "Welke correctiereden kies ik?", "Waarom veranderde de voorraad?", "Hoe ontvang ik een inkooporder?"],
  "audit-log": ["Hoe zoek ik een ticket?", "Hoe start ik een retour?", "Welke voorraadbestemming kies ik?", "Hoe download ik een factuur?", "Waarom zie ik beperkte historiek?"],
  "z-report": ["Wat controleer ik vóór afsluiten?", "Hoe vul ik geteld cash in?", "Waarom is er een kasverschil?", "Waar zie ik de betaalmix?", "Kan ik een Z-rapport wijzigen?"],
  customers: ["Hoe maak ik een klant?", "Waar zie ik aankopen?", "Hoe werkt een prijsgroep?", "Hoe geef ik een cadeaubon uit?", "Waarom zie ik geen klantinzicht?"],
  insights: ["Wat betekent deze actiekaart?", "Hoe wordt verkoopsnelheid berekend?", "Wat is days of cover?", "Hoe maak ik een besteladvies?", "Voert afronden automatisch iets uit?"],
  service: ["Hoe maak ik een hersteldossier?", "Welke toestelgegevens bewaar ik?", "Wat ziet de klant?", "Hoe wijzig ik de status?", "Wordt automatisch een SMS gestuurd?"],
  workforce: ["Hoe voeg ik een shift toe?", "Hoe publiceer ik het rooster?", "Hoe vraag ik verlof aan?", "Waarom is een PIN nodig?", "Waar zie ik verlofsaldi?"],
  "integration-hub": ["Welke bestanden kan ik importeren?", "Hoe controleer ik de mapping?", "Waarom blokkeert deze rij?", "Wanneer kan ik undo gebruiken?", "Test verbinding echt de provider?"],
  profile: ["Waar beheer ik producten?", "Hoe voeg ik varianten toe?", "Waarom zie ik een module niet?", "Waar beheer ik de webshop?", "Welke gegevens gebruikt Pace?"],
  admin: ["Waarom is deze functie geblokkeerd?", "Wat is mijn synchronisatiestatus?", "Welke gegevens gebruikt Pace?", "Hoe werkt mijn rol?", "Wat kan ik hier vragen?"],
};

const normalize = (query: string) => query
  .toLocaleLowerCase("nl-BE")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .replace(/[^a-z0-9%]+/g, " ")
  .trim();

const HINT_INTENT_IDS: Record<string, string> = {
  "hoe werkt splitbetaling": "pos.payment",
  "kan pace terminalstatus zien": "hardware.limit",
  "hoe start ik een retour": "history.return",
  "hoe download ik een factuur": "pos.document",
  "waarom zie ik beperkte historiek": "history.audit-export",
  "hoe maak ik een klant": "customers.manage",
  "waar zie ik aankopen": "customers.manage",
  "hoe geef ik een cadeaubon uit": "customers.giftcards",
  "waarom zie ik geen klantinzicht": "pace.preferences-privacy",
  "hoe wordt verkoopsnelheid berekend": "insights.explain",
  "hoe maak ik een hersteldossier": "service.intake",
  "wat ziet de klant": "service.workflow",
  "hoe wijzig ik de status": "service.workflow",
  "hoe voeg ik een shift toe": "workforce.roster",
  "hoe publiceer ik het rooster": "workforce.roster",
  "hoe vraag ik verlof aan": "workforce.leave",
  "waar zie ik verlofsaldi": "workforce.leave",
  "welke bestanden kan ik importeren": "integration.import",
  "waarom blokkeert deze rij": "integration.import",
  "wanneer kan ik undo gebruiken": "integration.undo",
  "waarom zie ik een module niet": "account.modules-rights",
  "waar beheer ik de webshop": "webshop.settings",
  "welke gegevens gebruikt pace": "pace.preferences-privacy",
  "waarom is deze functie geblokkeerd": "account.modules-rights",
  "hoe werkt mijn rol": "account.modules-rights",
  "wat kan ik hier vragen": "help.discovery",
};

const makeAnswer = (match: PaceKnowledgeEntry, context: PaceContext, confidence: number): PaceQueryAnswer => ({
  intentId: match.id,
  title: match.id === "sync.status" && context.failedSync > 0 ? "Herstel nodig" : match.title,
  answer: typeof match.answer === "function" ? match.answer(context) : match.answer,
  steps: match.steps,
  limitation: match.limitation,
  followUps: match.followUps,
  action: match.action ?? { kind: "none" },
  actionLabel: match.actionLabel,
  confidence,
  matched: true,
});

export const answerFromPaceKnowledge = (query: string, context: PaceContext): PaceQueryAnswer => {
  const normalized = normalize(query);
  const hintedIntent = HINT_INTENT_IDS[normalized];
  if (hintedIntent) {
    const hintedEntry = KNOWLEDGE.find((candidate) => candidate.id === hintedIntent);
    if (hintedEntry) return makeAnswer(hintedEntry, context, 0.99);
  }
  const ranked = KNOWLEDGE.flatMap((candidate) => {
    const matchedPatterns = candidate.patterns.filter((pattern) => pattern.test(normalized)).length;
    if (!matchedPatterns) return [];
    const viewFit = candidate.views?.includes(context.view) ? 0.12 : candidate.views ? 0 : 0.04;
    const score = Math.min(0.99, 0.7 + matchedPatterns * 0.1 + viewFit + (candidate.priority ?? 0) / 100);
    return [{ candidate, score }];
  }).sort((a, b) => b.score - a.score);

  if (ranked[0]) return makeAnswer(ranked[0].candidate, context, ranked[0].score);

  const suggestions = getPaceQueryHints(context).slice(0, 3);
  return {
    intentId: `help.${context.view}`,
    title: "Ik mis nog één concreet aanknopingspunt",
    answer: `Ik kan je hier helpen met uitleg, actuele synchronisatiestatus en veilige navigatie. Probeer bijvoorbeeld: ${suggestions.map((hint) => `“${hint}”`).join(", ")}.`,
    action: { kind: "none" },
    followUps: suggestions,
    confidence: 0.2,
    matched: false,
  };
};

export const getPaceQueryHints = (context: PaceContext): string[] => {
  const base = [...VIEW_HINTS[context.view]];
  if (!context.online || context.pendingSync > 0 || context.retryingSync > 0 || context.failedSync > 0) {
    base.unshift(context.failedSync > 0 ? "Waarom is deze synchronisatie mislukt?" : "Wat is mijn synchronisatiestatus?");
  }
  if (context.view === "pos" && context.cartCount > 0) base.unshift("Wat controleer ik vóór betalen?");
  if ((context.role === "owner" || context.role === "manager") && context.productCount === 0) base.unshift("Hoe voeg ik mijn eerste product toe?");
  return [...new Set(base)].slice(0, 6);
};

export const PACE_KNOWLEDGE_INTENT_IDS = KNOWLEDGE.map((item) => item.id);
