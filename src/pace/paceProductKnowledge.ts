export interface PaceKnowledgeChunk {
  id: string;
  title: string;
  keywords: string[];
  body: string;
}

// This corpus is intentionally product-authored and versioned with the app.
// It is the factual source Gemini may use for product explanations. Live store
// facts come from the tenant-scoped Supabase RPC and are never mixed into this
// global corpus.
export const PACE_PRODUCT_KNOWLEDGE: PaceKnowledgeChunk[] = [
  {
    id: "platform-boundaries",
    title: "Pace, veiligheid en bevoegdheden",
    keywords: ["pace", "ai", "privacy", "rechten", "rol", "pin", "bevestiging", "veiligheid"],
    body: `Pace is de contextuele assistent van PWAYMENT. Pace mag uitleggen, actuele toegestane winkelcontext samenvatten en naar bestaande werkruimtes leiden. Pace voert nooit zelfstandig een betaling, retour, korting, voorraadcorrectie, publicatie, personeelsbeslissing, importactivatie, abonnementswijziging of andere definitieve mutatie uit. De normale rolcontrole, entitlement, modulevoorkeur, expliciete bevestiging en eventuele persoonlijke manager- of eigenaar-PIN blijven altijd gelden. Pace vraagt nooit om wachtwoorden, PINs, API-sleutels of volledige betaalkaartgegevens. Een AI-antwoord is uitleg, geen bewijs dat een actie is uitgevoerd.`,
  },
  {
    id: "pos-cart-checkout",
    title: "Kassa, winkelmand en checkout",
    keywords: ["kassa", "product", "scan", "barcode", "sku", "mand", "korting", "cash", "pin", "split", "betaling", "ticket", "factuur"],
    body: `De POS zoekt op productnaam, SKU, barcode en ondersteunde identifiers. Een keyboard-wedge scanner typt snel in de globale scanbuffer; tijdens invoervelden en kritieke betaalvensters hoort scanning de mand niet te wijzigen. Verkoopregels ondersteunen aantallen, notities en modifiers. Een klant kan bewust aan de actieve mand worden gekoppeld, waarna een ingestelde prijsgroep kan gelden. Mandkortingen vereisen een reden en kunnen managergoedkeuring vragen. Documentkeuze gebeurt vóór betaling: ticket, B2C-factuur of B2B-factuur. Checkout ondersteunt cash, PIN als geregistreerde tender, cadeaubon en split tender. Cash gebruikt Belgische afronding op vijf eurocent en berekent wisselgeld. Checkout is lokaal atomair en gebruikt een client request-id om dubbelklikken en retries idempotent te maken. Mand parkeren, hervatten en gecontroleerd annuleren blijven expliciete acties.`,
  },
  {
    id: "payments-hardware-boundary",
    title: "Betaalterminal en kassahardware: echte grenzen",
    keywords: ["terminal", "mollie", "pin", "capture", "kassalade", "weegschaal", "scanner", "printer", "webusb", "epson", "dymo", "zebra"],
    body: `PWAYMENT kan PIN als betaalwijze registreren en bevat Mollie-terminalserverpaden waar die expliciet zijn geconfigureerd. Een tenderregistratie alleen bewijst geen provider-capture of settlement. Pace mag een terminalbetaling alleen als bevestigd beschrijven wanneer servercontext die status werkelijk levert. Thermische Epson-compatibele printers kunnen via WebUSB/ESC-POS werken in een veilige Chromium-context; browserprint is een alternatief. Scanners werken als keyboard-wedge. Instellingen voor kassalade, terminalhost en weegschaal zijn niet automatisch een bewezen fysiek protocol. Labelgeneratie is geen rechtstreekse Dymo- of Zebra-SDK. Het klantendisplay gebruikt een lokale browsercontext met handshake, heartbeat en BroadcastChannel-achtige communicatie, geen algemeen netwerkdisplayprotocol.`,
  },
  {
    id: "history-returns-invoices",
    title: "Historiek, retouren, facturen en audit",
    keywords: ["historiek", "ticket", "transactie", "retour", "refund", "credit", "factuur", "pdf", "audit", "export"],
    body: `Historiek is een kernwerkruimte voor verkopen, Z-rapporten en audit. Zoeken kan met ticket- of transactiegegevens en beschikbare periode-, betaal- en andere filters. Een ticketbarcode kan de retourzoekflow openen. Een retour vertrekt altijd van de oorspronkelijke verkoop. De gebruiker kiest retourneerbare regels en aantallen, verplichte reden, terugbetaalwijze en voorraadbestemming. Verkoopbaar verhoogt verkoopbare voorraad; quarantaine, defect en retour leverancier niet. De oorspronkelijke verkoop blijft behouden en de refund wordt als afzonderlijke negatieve correctie met koppeling en auditspoor opgeslagen. Facturen en creditdocumenten kunnen worden voorvertoond en als PDF gedownload. Serverbevestiging kan een canoniek documentnummer opleveren. Volledige auditviewer, export en retentie kunnen door plan of rol worden beperkt. Auditrecords worden niet door Pace gewijzigd of verwijderd.`,
  },
  {
    id: "daily-close-reporting",
    title: "Dagafsluiting, kascontrole en Z-rapport",
    keywords: ["dagafsluiting", "z-rapport", "x-rapport", "cash", "kasverschil", "btw", "betaalmix", "hash", "marge"],
    body: `Het dag- of X-overzicht is een controle vóór definitieve afsluiting. Het Z-rapport finaliseert de betrokken financiële periode. De gebruiker controleert transacties, betaalmix, btw, opening float, verwacht cash, geteld cash en verschil. Bij een cashverschil is een echte verklaring nodig; Pace verzint die niet. Rapportage ondersteunt cash, PIN, cadeaubon, split tender en cashafronding. Btw-snapshots ondersteunen de geactiveerde Belgische tarieven 0, 6, 12 en 21 procent. Kostprijs, brutowinst en marge zijn alleen volledig waar kostprijzen aanwezig zijn. De server-authoritatieve flow synchroniseert onderliggende financiële data vóór finalisatie. Rapporten hebben een hashrelatie/controlebasis en blijven in Historiek raadpleegbaar. Een definitief rapport wordt niet stil aangepast door Pace.`,
  },
  {
    id: "catalog-variants-inventory",
    title: "Catalogus, varianten, identifiers en voorraad",
    keywords: ["catalogus", "product", "categorie", "variant", "maat", "kleur", "sku", "ean", "barcode", "voorraad", "telling", "correctie"],
    body: `Productbeheer ondersteunt toevoegen, wijzigen, archiveren en herstellen. Productvelden omvatten naam, categorie/subcategorie, merk, leverancier, leverancierscode, variant, SKU, barcode, verkoopprijs, kostprijs, btw, kleur, voorraad, minimumvoorraad, producttype, prijstiers en beperkte custom fields. Een productfamilie bevat gedeelde informatie; verkoopbare varianten hebben unieke optiecombinaties en eigen SKU's. Meerdere identifiers kunnen intern, EAN, UPC, GTIN, leverancier of alternatief zijn; actieve scancodes mogen niet botsen. Categorieën kunnen hiërarchisch zijn en cycli zijn verboden. Minimumvoorraad is een bestelpunt en mag hoger zijn dan huidige voorraad. Voorraad verandert via POS-sale/refund, webshopreservatie, ontvangst of gecontroleerde telling/correctie met reden. De relationele foundations voor locaties, lots, serienummers, eenheden en verpakkingen betekenen niet automatisch dat iedere diepe operationele mutatieflow actief is.`,
  },
  {
    id: "catalog-import-labels",
    title: "Catalogusexport, import en labels",
    keywords: ["csv", "xlsx", "excel", "import", "export", "mapping", "label", "etiket", "barcode"],
    body: `Catalogusexport blijft beschikbaar. De compacte CSV-import in Productbeheer is platformflag-afhankelijk en valideert bedragen, btw, SKU en barcode vóór opslag. Voor grotere migraties gebruikt PWAYMENT de Integration Hub: CSV, TSV, Excel en JSON worden lokaal geparsed; kolommen krijgen voorgestelde mappings; preview en issues moeten gecontroleerd worden; activatie is expliciet. Barcode-etiketten worden via browsergeneratie/print gemaakt en kunnen een catalog.labels-entitlement vereisen. Een gegenereerd label is geen bewijs van een specifieke printerdriver.`,
  },
  {
    id: "insights-forecast-purchasing",
    title: "Inzichten, forecast en inkoop",
    keywords: ["inzicht", "omzet", "marge", "velocity", "stagnant", "forecast", "days of cover", "stockout", "besteladvies", "purchase order", "leverancier"],
    body: `Inzichten analyseren de gekozen periode en aanwezige verkoop-, product-, voorraad-, klant- en teamdata. Productprestatie kan op omzet, marge en aantallen worden bekeken. Verkoopmomenten, kortingen, voorraadstatus en velocitygroepen zoals stagnant, slow en healthy zijn verklarende signalen. Een actie kan worden opgeslagen, uitgesteld of afgerond; dat voert niet automatisch een externe of voorraadmutatie uit. Forecast schat days of cover, mogelijke stockoutdatum, trend en confidence; onregelmatige vraag, weinig historie en seizoen beïnvloeden betrouwbaarheid. Besteladvies blijft handmatig aanpasbaar. Purchase orders worden per leverancier gemaakt, kunnen gedeeltelijk worden ontvangen en verhogen voorraad alleen via de gecontroleerde ontvangstflow. Pace plaatst nooit autonoom een order bij een leverancier.`,
  },
  {
    id: "customers-loyalty-giftcards",
    title: "Klanten, loyalty en cadeaubonnen",
    keywords: ["klant", "crm", "aankoopgeschiedenis", "loyalty", "punten", "prijsgroep", "vip", "cadeaubon", "giftcard", "saldo"],
    body: `Klantendossiers bevatten toegestane contactinformatie, activiteit, omzet, bezoeken, laatste bezoek en aankoopgeschiedenis. Klanten kunnen worden gezocht, gefilterd, gearchiveerd en hersteld. Facturen blijven aan transacties gekoppeld. Een klantprijs- of VIP-groep kan deterministische productprijzen toepassen. Loyalty volgt de winkelinstellingen en het effectieve recht. Cadeaubonnen ondersteunen uitgifte, betaling, opwaardering, blokkeren, heractiveren, vervaldatum en een append-only saldoledger. Uitgifte/opwaardering kan een ander recht vereisen dan aannemen als POS-tender. Pace-klantinzichten worden pas na bewuste klantkoppeling getoond, zijn tenantgebonden en moeten controleerbaar blijven.`,
  },
  {
    id: "webshop-orders",
    title: "Webshop, storefront en orders",
    keywords: ["webshop", "storefront", "online", "coupon", "verzending", "afhalen", "order", "fulfilment", "reservatie"],
    body: `Webshopbeheer bevat branding, shopnaam, kleuren, beelden, productzichtbaarheid, uitgebreide productcopy, featured products, coupons, verzendkosten, gratis-verzenddrempel, afhalen en bestelnotities. De storefront gebruikt gedeelde catalogusdata maar toont alleen beschikbare en gepubliceerde producten. Checkout valideert contact, levering, betaalmethode, idempotencykey en bedragen. Voorraad wordt atomair gereserveerd bij een geldige order, vrijgegeven bij annulatie en gecommit bij verzending of afhaling. Orderstatus, payment status en fulfilment status zijn afzonderlijk. Externe PSP-capture, automatische transactionele e-mail en provider-refund mogen alleen als live worden beschreven wanneer concrete providerstatus aanwezig is; een opgeslagen betaalmethode of confirmation_email-object alleen is geen aflevering.`,
  },
  {
    id: "service-desk",
    title: "ServiceDesk en herstellingen",
    keywords: ["herstelling", "service", "intake", "toestel", "imei", "serienummer", "diagnose", "rma", "tracking", "sms", "technicus"],
    body: `Een hersteldossier registreert bestaande of losse klant, toesteltype, merk, model, serienummer/IMEI/MAC/frame/artikelnummer, accessoires, probleem en staat bij binnenkomst. Prijsopbouw kan diagnose, werkuren, onderdelen, overig en voorschot bevatten. Status, substatus, diagnose, oplossing en externe RMA/ticket/leveranciersreferentie worden in het dossier bijgehouden. Interne notities zijn niet zichtbaar op de publieke trackingpagina. Foto-intake is begrensd en entitlement-afhankelijk. Pro kan een actieve-dossierlimiet hebben. Een trackingtoken toont publiek slechts beperkte status. SMS en technicustoewijzing mogen niet als live provideractie worden geclaimd zonder concrete eindflow.`,
  },
  {
    id: "workforce",
    title: "Personeel, rooster, verlof en saldi",
    keywords: ["personeel", "rooster", "shift", "werkpatroon", "publiceren", "verlof", "saldo", "goedkeuren", "coverage", "contracturen"],
    body: `Workforce ondersteunt dag-, week-, maand- en jaarweergave, medewerkers, shifts, patronen, week kopiëren en rooster publiceren/heropenen. Bevoegdheden verschillen per rol. Medewerkers kunnen eigen verlof aanvragen of terugtrekken. Verlof gebruikt types, segmenten, saldi, coverage en status pending/approved/rejected/withdrawn/cancelled. Een beslisser mag nooit de eigen aanvraag behandelen. Gevoelige beslissingen gebruiken de persoonlijke goedkeurings-PIN en een afwijsreden is verplicht. Pace vraagt of verwerkt die PIN nooit. Contracturen, werkpatronen, availability, competenties en coverage bestaan in het datamodel; UI-dekking kan per onderdeel verschillen.`,
  },
  {
    id: "integration-migration",
    title: "Integration Hub, migratie en externe integraties",
    keywords: ["integration hub", "migratie", "mapping", "preview", "activatie", "undo", "receipt", "connector", "webhook", "api sleutel", "sync"],
    body: `De Integration Hub begeleidt catalogus- en klantenmigraties met bestandkeuze, mapping, normalisatie, preview, issues en expliciete activatie. Een migratiereceipt/safety ledger registreert gecreëerde wijzigingen. Volledige undo is alleen veilig vóór eerste betekenisvolle live activiteit; daarna wordt ze verzegeld om echte verkopen en vervolgmutaties te beschermen. Telemetrie bevat status, tellingen, foutfingerprint en events zonder ruwe payload. Algemene integratieconfiguratie bevat provider, endpoint, authvorm, richting en mapping, maar gemaskeerde geheimhint is geen secret vault. Een lokale verbindingstest of gesimuleerde handmatige sync is geen bewezen HTTP/SFTP/OAuth-overdracht. Webhook- en API-keyrecords zijn geen bewijs van een actieve deliveryservice of REST API.`,
  },
  {
    id: "offline-sync",
    title: "Offline-first, outbox en synchronisatie",
    keywords: ["offline", "online", "sync", "outbox", "pending", "retrying", "failed", "wachtrij", "conflict", "realtime", "pwa"],
    body: `PWAYMENT gebruikt per tenant lokale IndexedDB/Dexie-opslag en een duurzame outbox. Ondersteunde mutaties worden lokaal atomair bewaard en later FIFO naar Supabase geleverd. Pending betekent onderweg of wachtend op bevestiging; retrying betekent tijdelijke fout met backoff; failed betekent permanente afwijzing die gerichte correctie vraagt. De oorspronkelijke handeling mag niet blind opnieuw worden uitgevoerd. Financiële flows gebruiken request-id's voor idempotentie. Realtime-events herhydrateren relevante caches wanneer Supabase actief is. Er is geen universele bidirectionele conflictresolver: alleen de specifieke, gedocumenteerde flow mag als idempotent of conflictveilig worden omschreven. De PWA-serviceworker levert de production app-shell, maar serverafhankelijke functies blijven offline beperkt.`,
  },
  {
    id: "setup-subscriptions-modules",
    title: "Winkelsetup, modules, plannen en rollen",
    keywords: ["setup", "winkelprofiel", "module", "plan", "basis", "pro", "enterprise", "trial", "entitlement", "platformflag", "kassier", "manager", "eigenaar"],
    body: `Winkelsetup verzamelt retailprofiel, verkoopmodel, teamgrootte, databron, prijsmodel, standaard-btw, servicecontact en modules. Sectorpresets zijn aanbevelingen en schakelen geen diepe capability stil in. Effectieve beschikbaarheid volgt planrecht, trial/subscriptionstatus, winkelmodule, gebruikersrol en soms platformflag. Kassa, Dagafsluiting en beperkte Historiek zijn kernwerkruimtes. CRM, webshop, service, integrations, labels en geavanceerde inzichten zijn doorgaans Pro of hoger; workforce, forecast, purchase orders, volledige audit/API/webhooks en andere geavanceerde functies zijn doorgaans Enterprise volgens de actuele planmatrix. Een zichtbare of aangezette module verleent geen ontbrekend entitlement. Pace kan plan/facturatie openen maar nooit zelfstandig kopen of upgraden.`,
  },
  {
    id: "data-interpretation",
    title: "Hoe Pace live winkeldata interpreteert",
    keywords: ["vandaag", "omzet", "verkoop", "voorraad", "product", "klant", "order", "rapport", "actueel", "data"],
    body: `Live winkelcontext wordt server-side onder de ingelogde Supabase-sessie opgehaald. Store membership en RLS bepalen welke tenant zichtbaar is. Bedragen zijn integer eurocenten en moeten als EUR worden geformatteerd. Demo-bronnen horen niet als live omzet te worden voorgesteld. Een negatieve refund en een positieve sale mogen niet zonder uitleg worden samengevoegd. Productmatches, klantmatches en transactiematches zijn beperkte zoekresultaten, geen volledige database. Counts en aggregaten hebben een generatedAt-tijdstip; lokale nog niet gesynchroniseerde mutaties kunnen tijdelijk nieuwer zijn dan servercontext. Pace moet altijd zeggen wanneer live context ontbreekt, verouderd kan zijn of geen relevante match bevat.`,
  },
];

const normalize = (value: string) => value.toLocaleLowerCase("nl-BE").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const tokens = (value: string) => normalize(value).split(/[^a-z0-9%]+/).filter((token) => token.length >= 3);

export const retrievePaceKnowledge = (question: string, limit = 9): PaceKnowledgeChunk[] => {
  const queryTokens = new Set(tokens(question));
  const ranked = PACE_PRODUCT_KNOWLEDGE.map((chunk) => {
    const haystack = normalize(`${chunk.title} ${chunk.keywords.join(" ")} ${chunk.body}`);
    const score = [...queryTokens].reduce((total, token) => total + (haystack.includes(token) ? 1 : 0), 0)
      + chunk.keywords.reduce((total, keyword) => total + (normalize(question).includes(normalize(keyword)) ? 3 : 0), 0);
    return { chunk, score };
  }).sort((left, right) => right.score - left.score);

  const relevant = ranked.filter((item) => item.score > 0).slice(0, limit).map((item) => item.chunk);
  if (!relevant.some((chunk) => chunk.id === "platform-boundaries")) relevant.push(PACE_PRODUCT_KNOWLEDGE[0]);
  if (!relevant.some((chunk) => chunk.id === "data-interpretation")) relevant.push(PACE_PRODUCT_KNOWLEDGE.at(-1)!);
  return relevant.slice(0, limit + 2);
};

export const formatPaceKnowledgeForPrompt = (chunks: PaceKnowledgeChunk[]) => chunks
  .map((chunk) => `## ${chunk.title} [${chunk.id}]\n${chunk.body}`)
  .join("\n\n");
