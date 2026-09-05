# PWAYMENT billing, entitlements en pricing — masterplan

> **Statusverduidelijking, 31 augustus 2026:** de commerciële catalogus,
> trial-/entitlementlogica en plansimulator zijn geïmplementeerd; een echte
> SaaS-billinglifecycle is dat niet. Er is nog geen bewezen providercheckout,
> abonnementswebhook, automatische facturatie, betaalreconciliatie of
> opzeg-/mislukte-betalingflow. Statische factuurvoorbeelden en testmodus mogen
> niet als echte billing worden voorgesteld. Zie
> [`../PROJECT-CONTEXT.md`](../PROJECT-CONTEXT.md).

Status: geïmplementeerd
Datum: 14 augustus 2026
Scope: publieke prijzen, interne billing-UI, trials, feature- en limietcontrole,
add-ons, offline gedrag, Supabase/RLS/RPC en regressietests
Niet in scope: echte betaalcapture, automatische facturatie, providerwebhooks en
proratering

## 1. Besluit in één minuut

PWAYMENT moet één versieerbare commerciële catalogus krijgen waaruit de
publieke website, de billingpagina, upgradeboodschappen, modulekaarten en tests
worden opgebouwd. De Supabase-entitlements blijven tijdens runtime de
autoritatieve waarheid voor een winkel.

Toegang wordt op vijf grenzen gecontroleerd:

1. navigatie en modulekeuze;
2. rechtstreekse view/deeplink;
3. knop of concrete actie;
4. lokale store/service-methode;
5. Supabase RPC/RLS/databasegrens.

Zonder betaalprovider werkt de lifecycle als volgt:

- iedere nieuwe winkel krijgt eenmalig 30 verstreken dagen Retail Professional;
- na het exacte eindtijdstip valt de effectieve toegang onmiddellijk terug op
  Basis;
- een upgrade-CTA maakt een aanvraag/offerte, maar activeert geen betaald plan;
- tijdens de voorlopige publieke testfase mag iedere owner bewust en zonder
  betaling tussen Basic, Pro en Enterprise wisselen;
- deze tijdelijke plansimulator wordt zichtbaar als testmodus gelabeld en kan
  later centraal worden uitgezet wanneer echte billing wordt gekoppeld.

De trialteller wordt één gedeelde, tikkende bron. Hij toont dagen én uren (en in
de laatste dag minuten), ververst minimaal elke minuut en vergrendelt premium
acties lokaal exact op het eindtijdstip, ook als de serverrefresh vertraagd is.

## 2. Vastgestelde problemen in de huidige code

### 2.1 De planwaarheid is verspreid

- `src/billing/planCatalog.ts` bevat publieke namen, bedragen en korte bullets.
- `src/components/BillingSettings.tsx` bevat opnieuw handgeschreven kaarten,
  uitsluitingen, add-ons en een aparte vergelijkingsmatrix.
- `src/billing/entitlements.ts` bevat een derde, beperkte lijst met 17 keys.
- `billing_features` en `billing_plan_features` in Supabase vormen een vierde
  matrix.
- Website- en appteksten kunnen daardoor dezelfde functie anders prijzen of in
  een ander plan plaatsen.

### 2.2 Bestaande gates dekken slechts een klein deel

Er zijn viewgates voor Workforce en Insights en instellingengates voor onder
meer webshop publiceren, labels, integraties, loyalty en geavanceerde hardware.
Niet of niet volledig afgeschermd zijn onder andere:

- ServiceDesk en het aanmaken/wijzigen van herstelorders;
- Customer Display-instellingen én de altijd gemounte publisher;
- AI-voorraadprognose binnen Insights;
- purchase-orderconcepten, ontvangst en leveranciersacties;
- auditlogboek en volledige transactiehistoriek;
- teamrollen, manageroverrides en personeelsinstellingen;
- lokale integratie-, webhook- en API-keyacties;
- modulekeuze en directe queryparameter/deeplinknavigatie;
- een aantal onderliggende Zustand/Dexie/servicefuncties die buiten de UI om
  aangeroepen kunnen worden.

### 2.3 De database bevat aantoonbare entitlementlekken

- Migratie `20260813233000_workforce_leave_and_module_navigation.sql` zet
  `workforce.core` voor Basic, Pro én Enterprise op `enabled = true`.
- Workforce-RPC's controleren rollen, maar geen Enterprise-entitlement.
- ServiceDesk-RPC's en de onderliggende tabelpolicies controleren tenant/rol,
  maar geen ServiceDesk-entitlement of actieve-orderlimiet.
- De publieke ServiceDesk-tracking hoort beschikbaar te blijven voor reeds
  uitgegeven tokens, maar nieuwe dossiers mogen niet buiten het plan ontstaan.
- Auditregels moeten altijd worden geschreven, maar het lezen/exporteren van
  het commerciële auditproduct moet apart worden afgeschermd.
- Een historiekgrens van 30 dagen is niet echt afdwingbaar zolang een lid via
  generieke table-selectpolicies alle transacties kan lezen.
- Product- en categorielimieten zijn al op UI- en databasegrens aanwezig; dit is
  het patroon dat voor andere limieten moet worden doorgetrokken.

### 2.4 De betaalvrije plansimulator blijft voorlopig bewust breed open

Nieuwe winkels krijgen `test_mode = true`. Een owner kan via
`change_test_subscription` zichzelf naar Pro of Enterprise zetten. Dit blijft
op uitdrukkelijk productbesluit voorlopig mogelijk zodat iedere tester alle
plannen kan beoordelen. De UI moet dit ondubbelzinnig als betaalvrije,
tijdelijke testmodus tonen.

### 2.5 Waarom de teller op 30 blijft staan

Er spelen meerdere oorzaken tegelijk:

1. `trialDaysRemaining` gebruikt `Math.ceil`. Een trial met 29 dagen, 23 uur en
   59 minuten resteert daardoor zichtbaar nog steeds als 30 dagen.
2. `BillingSettings` heeft geen klokstate of interval. De berekening draait
   alleen opnieuw wanneer React om een andere reden rendert.
3. Alleen `TrialStatus` plant tijdsgebonden updates; de billingpagina gebruikt
   die state niet.
4. De geladen featuremap blijft Pro totdat een nieuwe entitlement-RPC is
   opgehaald. De huidige refresh kan rond expiratie tot ongeveer een uur later
   plaatsvinden.
5. De simulatieroute zet `trial_started_at` telkens opnieuw op `now()`. Dat is
   correct voor een testsimulator, maar mag nooit het echte eenmalige
   trialstartmoment wijzigen.

## 3. Aanbevolen commerciële matrix

Deze matrix is het concrete implementatiebesluit. Bedragen zijn exclusief btw.
Een klantendisplay is een tweede klantgericht scherm en telt niet als extra
POS-terminal.

| Domein | PWAYMENT Basis — €0 | Retail Professional — €69/mnd of €55 effectief per maand bij jaarbetaling | Enterprise & Ketens — vanaf €149/mnd |
| --- | --- | --- | --- |
| Locaties | 1 | 1 | 1 inbegrepen; extra filialen als add-on/contract |
| POS-terminals | 1 | 1 | contractueel aantal |
| Producten | 250 actief | onbeperkt | onbeperkt |
| Categorieën | 5 actief | onbeperkt | onbeperkt |
| Kassa | verkoop, barcode, cash/PIN-registratie, parkeren/split indien stabiel | alles uit Basis | alles uit Pro |
| Bonprinter/scanner | basisondersteuning | volledige compatibiliteitsmatrix | volledige matrix en begeleide uitrol |
| Geavanceerde hardware | — | terminalkoppeling, weegschaal, Dymo/Zebra, kassaladeconfiguratie | inbegrepen |
| Historiek | laatste 30 dagen | volledige historiek | volledige historiek |
| Z-rapport | standaard | uitgebreid | uitgebreid, ketenoverzicht |
| Klanten | basis klant koppelen aan verkoop of geen afzonderlijke CRM-view | CRM, prijsprofielen, loyalty, VIP en cadeaubonnen | inbegrepen |
| Klantendisplay | — | 1 lokaal klantendisplay per actieve terminal | inbegrepen, later remote pairing |
| ServiceDesk | — | maximaal 50 actieve dossiers, mail/QR-status | onbeperkt, foto's, SMS, techniekertoewijzing en geavanceerde workflow |
| Webshop | — | één PWAYMENT-storefront en realtime stockflow | multi-storefront/headless mogelijkheden |
| Inzichten | basis Z-data | verkoop-, marge- en klantinzichten | inbegrepen |
| AI-voorraadprognose | — | — | inbegrepen |
| Purchase orders | — | — | inbegrepen |
| Workforce | — | — | planning, uren, PIN-klok, verlof en loonkostinzichten |
| Rollen/rechten | eenvoudige owner/kassier | standaard teamrollen | fijnmazige rollen, manager-PIN en overrides |
| Auditproduct | altijd intern schrijven, geen commerciële viewer | beperkte operationele historiek | volledige auditviewer en export |
| Boekhouding/Peppol | — | ondersteunde live connectoren volgens statusregistry | inbegrepen plus maatwerk |
| REST API/webhooks | — | — | inbegrepen met contractueel quotum |
| Multi-store/transfers | — | — | inbegrepen |
| Support | e-mail | prioriteit e-mail/chat | SLA alleen na operationele en contractuele goedkeuring |

### 3.1 Add-ons zonder betaling

| Add-on | Richtprijs | Gedrag vóór betaalintegratie |
| --- | ---: | --- |
| Extra POS-terminal | €29/maand | offerte-/activatieverzoek; intern toegewezen limiet |
| Extra Enterprise-filiaal | €79/maand | offerte-/activatieverzoek; intern toegewezen limiet |
| ServiceDesk SMS | €15 per 200 | bundel zichtbaar; verzenden pas na intern toegekend saldo en werkende provider |
| Externe webshop-sync | €19/maand | alleen aanbieden wanneer connectorstatus live/pilot dit toelaat |
| Hardware + installatie | €500–€1.500 eenmalig | configureerbare offerte, geen checkout |

De bestaande fictieve toggles in Billing mogen geen features activeren. Zij
worden vervangen door een calculator die een prijsindicatie en een
contact-/activatieverzoek oplevert. De berekening bewaart `plan`,
`billingCycle`, aantallen en add-ons in het leadrecord, zonder betaalgegevens.

## 4. Eén capability- en plancatalogus

### 4.1 Structuur

Voeg een versieerbare bron toe, bijvoorbeeld
`src/billing/billingCatalog.ts`, met:

- plan-ID, naam, doelgroep, prijs per cyclus en rang;
- feature-ID, interne entitlementkey, publieke naam, beschrijving, categorie en
  productstatus (`live`, `pilot`, `beta`, `planned`);
- per plan `enabled`, limiet, eenheid en downgradegedrag;
- aanbevolen upgradeplan;
- add-on-ID, prijs, inbegrepen hoeveelheid en de entitlement/limietdelta;
- bewijs-/helpverwijzing voor claims;
- `catalogVersion` en `effectiveFrom`.

Voorbeeldvorm:

```ts
serviceOrders: {
  key: "service.orders",
  category: "service",
  plans: {
    basic: { enabled: false },
    pro: { enabled: true, limit: 50, unit: "active_orders" },
    enterprise: { enabled: true, limit: null }
  },
  downgrade: "read_existing_no_create"
}
```

### 4.2 Nieuwe entitlementkeys

Minimaal invoeren of opsplitsen:

- `pos.checkout`, `pos.park_sale`, `pos.split_tender`;
- `registers.active`, `locations.active`;
- `reports.z`, `history.retention_days`, `history.full`;
- `catalog.active_products`, `catalog.categories`, `catalog.labels`;
- `customers.crm`, `loyalty.manage`, `gift_cards.issue`;
- `customer_display.local`, `customer_display.remote`;
- `service.orders`, `service.active_orders`, `service.attachments`,
  `service.notifications.email`, `service.notifications.sms`,
  `service.technician_assignment`;
- `insights.sales`, `insights.customers`, `inventory.forecast`,
  `purchase_orders.create`;
- `webshop.publish`, `webshop.storefronts`, `webshop.external_sync`;
- `hardware.advanced`, `payments.terminal_integrations`;
- `accounting.export`, `accounting.peppol`;
- `team.members`, `team.advanced`, `workforce.core`,
  `workforce.time_clock`;
- `audit.viewer`, `audit.export`;
- `integrations.configure`, `api.access`, `api.calls_per_day`,
  `webhooks.manage`;
- `multi_store.manage`, `inventory.transfers`;
- `support.tier` als presentatiegegeven, niet als boolean codegate.

Niet elke commerciële rij heeft een gate nodig. Alleen een functie, mutatie,
datatoegang of meetbare limiet krijgt een entitlement. Marketingteksten zoals
“prioriteitssupport” blijven catalogusmetadata.

### 4.3 Brongezag en driftpreventie

- De statische catalogus bouwt website en app-UI.
- `get_store_entitlements` blijft per winkel de runtimeautoriteit.
- Een generator maakt uit dezelfde catalogus de SQL-upsert voor een nieuwe
  catalogusversie; toegepaste migraties worden nooit achteraf gewijzigd.
- Een contracttest vergelijkt alle TypeScriptkeys met de Supabasefeatures en
  faalt op ontbrekende, extra of verkeerd geconfigureerde keys.
- Websitebullets, planmatrix en upgradecopy worden afgeleid; geen tweede
  handgeschreven matrix meer.

## 5. Entitlementruntime en trialklok

### 5.1 Snapshot aanscherpen

Breid `EntitlementSnapshot` uit met:

- `catalogVersion`;
- `subscriptionVersion`;
- `resolvedAt`/`serverNow`;
- `offlineValidUntil`;
- planfeatures en samengestelde add-onoverrides;
- expliciete limieten met `null = onbeperkt` en afwezige key = niet toegekend;
- `reason` per geweigerde check (`plan_required`, `limit_reached`,
  `trial_expired`, `offline_stale`, `role_required`).

Gebruik één pure evaluator:

```ts
evaluateCapability(snapshot, feature, context?)
// -> { allowed, mode, limit, used, remaining, reason, requiredPlan }
```

Alle hooks, stores en UI-gates roepen deze evaluator aan. Losse checks als
`snapshot.features[key]` en truthy/falsy-limitlogica verdwijnen.

### 5.2 Gedeelde tikkende klok

Maak `useEntitlementClock`/`useTrialRemaining` met:

- offset op basis van `serverNow` plus een monotone `performance.now()`-basis
  zodat een handmatige systeemtijdwijziging de open sessie niet verlengt;
- tick elke 60 seconden, elke 10 seconden in het laatste uur;
- aparte exacte `setTimeout` op `trialEndsAt`;
- refresh bij focus, visibility, `online` en realtime subscription-update;
- één gedeelde formatter voor header, Billing en waarschuwingstoasts;
- progressie op totale verstreken tijd, niet op afgeronde kalenderdagen.

Weergave:

- boven 48 uur: `29 dagen · 23 uur resterend`;
- 1–48 uur: `1 dag · 07 uur resterend`;
- onder 24 uur: `07:42 resterend` (uur:minuut);
- verlopen: `Trial afgelopen · Basis actief`.

De marketingtekst “30 dagen gratis” blijft een label, maar wordt niet aan de
dynamische teller vastgeplakt alsof er altijd 30 dagen over zijn.

### 5.3 Expiratie is direct fail-closed

Zodra de lokale, servergeankerde klok `trialEndsAt` bereikt:

1. evalueert de client alle niet-Basisfeatures onmiddellijk als geweigerd;
2. sluit of bevriest een open premium mutatiedialoog;
3. laat een lopende veilige POS-checkout doorgaan omdat checkout Basis is;
4. vraagt een verse snapshot op;
5. de server blijft via `private.effective_plan` autoritatief Basic retourneren.

Voeg een idempotente serverfinalisatie toe die de rijstatus en een
`trial_expired` event materialiseert. Dit kan bij sessiebootstrap en periodiek
server-side gebeuren; de beveiliging mag niet van die materialisatie afhangen.

### 5.4 Offlinebeleid

- Basis-POS blijft offline beschikbaar.
- Bewaar de laatst geverifieerde snapshot per `storeId` in IndexedDB, nooit in
  een globale localStoragekey zonder tenantbinding.
- Een actieve betaalde entitlement mag beperkt offline doorwerken tot
  `offlineValidUntil` (aanbevolen 72 uur); een trial nooit voorbij
  `trialEndsAt`.
- Een ontbrekende, corrupte of te oude snapshot valt terug op Basis.
- Laat duidelijk “licentiecontrole vereist” zien; verwijder of archiveer geen
  gegevens.

## 6. Gatepatronen en downgradegedrag

Vervang één generieke `FeatureGate` door een kleine set consistente patronen:

- `EntitledRoute`: blokkeert directe view/deeplink en stuurt naar een veilige
  view met upgradecontext;
- `EntitledSection`: toont een read-only teaser of vergrendelde sectie;
- `EntitledAction`: disablet/vervangt een knop en voorkomt de handler;
- `requireCapability`: guard voor Zustand/Dexie/servicecode;
- `requireServerEntitlement`: database/RPC-helper voor de autoritatieve grens;
- `UsageMeter`: toont gebruikt, limiet en resterend bij producten, registers,
  filialen, actieve serviceorders, SMS en API-calls.

### 6.1 Data blijft behouden

Een downgrade verwijdert nooit producten, klanten, orders, roosters of
instellingen. Per capability wordt expliciet één beleid gekozen:

- `read_existing_no_create`: bestaande herstelorders en webshoporders blijven
  leesbaar/afhandelbaar; geen nieuwe commerciële dossiers/orders;
- `read_only`: instellingen en rapportdata zichtbaar zonder mutatie;
- `hidden_but_retained`: bijvoorbeeld ongebruikte premiumconfiguratie;
- `core_always_operational`: audit schrijven, bestaande cadeaubonnen besteden,
  retouren en POS-checkout;
- `hard_limit_on_new`: bestaande aantallen boven limiet blijven bestaan, maar
  er kan niets nieuws worden geactiveerd.

Een uitgegeven cadeaubon moet altijd besteed kunnen worden. Alleen uitgeven en
opladen zijn Pro-acties. Auditregistratie blijft altijd actief, ook als alleen
Enterprise de volledige viewer/export ziet.

## 7. Repo-brede implementatie

### 7.1 Navigatie en views

In `src/components/Layout.tsx`:

- filter navigatie op zowel modulevoorkeur als entitlement;
- toon voor owners optioneel een gelockte module met planbadge; kassiers zien
  alleen bruikbare modules;
- bescherm ook programmatic `setMainView`, hotkeys en `?view=`-deeplinks;
- gate ServiceDesk, Audit, Workforce en Insights op routeniveau;
- gate Inventory Forecast en Purchase Orders afzonderlijk binnen Insights;
- stuur bij verlies van entitlement de actieve premiumview naar een read-only
  toestand of veilige fallback, zonder gegevens te wissen.

In `ModuleSettings.tsx`:

- modulevoorkeur blijft “wil ik in mijn werkbalk zien?”;
- entitlement blijft “mag ik dit gebruiken?”;
- een niet-toegekende module kan door een owner niet als actief worden bewaard;
- toon het vereiste plan en laat de upgrade-CTA Billing openen.

### 7.2 ServiceDesk

- `service.orders` op route, nieuw-dossierknop, `persistServiceOrder` en
  `save_service_order`;
- tel op de server orders met actieve statussen voor de Pro-limiet van 50;
- sta bestaande orders veilig afhandelen toe na downgrade, maar geen nieuw
  dossier;
- gate foto-upload, SMS en techniekertoewijzing afzonderlijk;
- laat publieke tracking voor een bestaand token werken na downgrade;
- laat mail/SMS alleen als “verzonden” verschijnen na een echte providerack;
  tot dan is de feature `planned` of `pilot`.

### 7.3 Customer Display

- `customer_display.local` op instellingen, activeren en venster openen;
- dezelfde entitlement in `CustomerDisplayPublisher`; zonder recht publiceert
  hij niets en zet hij runtime op `disabled`;
- het displayvenster accepteert geen bruikbare cartsnapshot zonder geldige,
  actuele kassasessie;
- bewaar premiumconfiguratie bij downgrade, maar forceer effectief `enabled =
  false`;
- reserveer `customer_display.remote` voor latere secure pairing.

### 7.4 Insights, forecast en purchase orders

- splits verkoopinzichten (Pro) van AI-voorraadprognose (Enterprise);
- voorkom dat forecastberekeningen en PO-concepten alleen via verborgen JSX
  bereikbaar zijn: guard ook de actie-engine/service-entrypoints;
- `save_purchase_order` blijft server-side controleren, maar verhuist volgens
  de aanbevolen matrix van Pro naar Enterprise;
- bestaande purchase orders blijven ontvangen/afgesloten kunnen worden na
  downgrade; alleen nieuwe orders en AI-concepten worden geweigerd.

### 7.5 Workforce en team

- corrigeer de seedmatrix: `workforce.core` alleen Enterprise;
- voeg `private.has_entitlement(..., 'workforce.core')` toe aan iedere
  Workforce read- en write-RPC;
- voeg dezelfde voorwaarde toe aan directe table-select/mutatiepolicies of
  trek directe toegang in ten gunste van RPC's;
- guard alle methodes in `useWorkforce`, niet alleen de view;
- splits later tijdsklok, planning en verlof als deze commercieel los verkocht
  moeten worden;
- teamlidlimieten en geavanceerde rollen worden op membershipmutaties
  server-side afgedwongen.

### 7.6 Historiek, rapporten en audit

- Basis krijgt een echte `history.retention_days = 30` querygrens;
- vervang onbeperkte directe transactieselects door entitlement-aware RPC's of
  views; clientfilters zijn onvoldoende;
- `reports.z` blijft Basic, uitgebreide cross-store analytics niet;
- audit-events blijven altijd append-only geschreven;
- bescherm audit list/detail/export met `audit.viewer`/`audit.export`;
- laat security-, refund- en checkout-RPC's niet afhangen van toegang tot de
  auditviewer.

### 7.7 Klanten, loyalty en cadeaubonnen

- kies expliciet of basis-klantkoppeling onderdeel van POS blijft; de aanbevolen
  matrix laat alleen een minimale koppeling toe en zet de CRM-view in Pro;
- gate CRM-route, loyalty-instellingen, puntenmutaties en VIP-configuratie;
- behoud de bestaande serverguard voor uitgeven/opladen van cadeaubonnen;
- laat blokkeren, corrigeren en besteden van bestaande verplichtingen
  operationeel beschikbaar volgens rolbeleid.

### 7.8 Webshop en publieke storefront

- gate beheer, publiceren, coupons, design, domein, verzend- en betaalsettings
  per relevante capability;
- `webshop.publish` moet ook server-side bepalen of de publieke catalogus actief
  mag worden geserveerd;
- na downgrade: geen nieuwe publieke orders, maar bestaande orders blijven in
  de POS afhandelbaar;
- externe Shopify/WooCommerce-sync is een aparte add-on, niet hetzelfde als de
  inbegrepen PWAYMENT-storefront.

### 7.9 Integraties, Peppol, API en hardware

- splits de te grove `integrations.configure` key per productfamilie;
- guard alle mutaties in `useIntegrations`, inclusief API-key en webhookcreatie;
- toon alleen connectoren als live/pilot wanneer de capabilityregistry bewijs
  heeft; een configuratiescherm is geen werkende integratie;
- zet API en webhooks in Enterprise; accounting/Peppol kan Pro zijn zodra live;
- guard WebUSB/WebBluetooth/LAN/weegschaal/terminalacties bij de action handler,
  niet uitsluitend rond hun instellingenpaneel;
- de basisbonprinter en keyboard-wedge scanner blijven zonder premiumgate.

### 7.10 Plan- en add-onlimieten

- gebruik atomaire serverchecks voor product, categorie, register, locatie,
  actief serviceorder en teamlid;
- gebruik een usage-counter/ledger voor SMS en API-calls;
- voorkom race conditions met row locks of één transactionele RPC;
- een add-on wijzigt de samengestelde entitlement, niet de basismatrix;
- realtime subscription/add-onupdates verhogen `subscriptionVersion` en
  verversen alle open clients.

## 8. Supabasewijzigingen

Voeg nieuwe migraties toe; wijzig toegepaste migraties niet achteraf.

1. Catalogusfeatures upserten en de juiste Basic/Pro/Enterprise-matrix zetten.
2. `store_subscription_addons` en eventueel `subscription_overrides` toevoegen
   voor intern toegewezen betaalvrije activaties.
3. `test_mode` tijdens de voorlopige testfase standaard `true` houden.
4. `change_test_subscription` en `simulate_test_trial` voor owners beschikbaar
   houden, duidelijk als tijdelijke betaalvrije testmodus; later achter één
   centrale releaseflag of backofficeclaim sluiten.
5. Een interne `set_manual_subscription`-functie alleen via service role/backoffice
   voor de periode zonder betaalprovider.
6. `get_store_entitlements` plan + actieve add-ons + overrides laten
   samenstellen en catalogus-/subscriptionversies teruggeven.
7. Entitlementchecks toevoegen aan ServiceDesk, Workforce, PO, historiek,
   audit, webshoppublicatie, membership- en andere premium-RPC's.
8. Directe RLS-paden sluiten waar ze een entitlement-aware RPC omzeilen.
9. Limietchecks atomair maken en uniforme foutcodes teruggeven, bijvoorbeeld
   `entitlement:limit-reached:service.active_orders`.
10. Een idempotente trial-expiratie/finalisatie en subscription-eventaudit
    toevoegen.

## 9. Publieke website en interne Billing

### 9.1 Publieke `/pricing`

- plancards uit de catalogus;
- USP's prominent: ServiceDesk, klantendisplay, loyalty, Peppol, Workforce,
  AI-voorraad en multi-store;
- inklapbare matrix per Kassa, Hardware, Producten, Klanten, Service,
  E-commerce, Personeel, Inzichten, Integraties, Beveiliging en Support;
- “live/pilot/gepland”-badges waar nodig;
- sticky kolomkoppen, toegankelijke `details/summary` of accordioncontrols en
  goede mobiele vergelijking;
- calculator voor terminals, filialen, SMS, externe webshop-sync en hardware;
- heldere totaalregels: software per maand, usage/bundels, eenmalige hardware,
  btw en jaarlijkse besparing;
- CTA “Start 30 dagen Pro” of “Vraag activatie/offerte aan”; nooit suggereren
  dat een niet-bestaande betaling is uitgevoerd.

### 9.2 Billing in de POS

- verwijder handgeschreven planinhoud en matrix uit
  `BillingSettings.tsx`;
- hergebruik dezelfde plan-, featurematrix- en calculatorcomponenten waar de
  styling dat toelaat;
- toon huidig opgeslagen plan, effectief plan, status, trialeinde en
  toegekende add-ons afzonderlijk;
- toon usage meters en concreet waarom een actie geblokkeerd is;
- toon testsimulatie voorlopig in een duidelijk gemarkeerd publiek testpaneel;
  ontwerp de schakelaar zo dat dit later centraal kan verdwijnen;
- knoppen maken voorlopig een activatieverzoek of tonen “neem contact op”; geen
  lokale toggle mag een abonnement wijzigen.

### 9.3 Claims die niet stil mogen worden verkocht

Peppol, Exact, Moneybird, terminalproviders, SMS, REST API, webhooks, 99,9% SLA
en 24/7 support worden alleen als inbegrepen getoond wanneer hun
capabilitystatus en operationele eigenaar dit toelaten. Tot die tijd: `pilot`,
`gepland` of “op aanvraag”, met precieze taal.

## 10. Teststrategie en CI-poorten

### 10.1 Unit- en contracttests

- iedere catalogusfeature heeft exact één geldige entitlementkey;
- iedere plan-featurecombinatie en limiet matcht de verwachte golden matrix;
- publieke bedragen en interne bedragen zijn byte-for-byte uit dezelfde bron;
- add-oncompositie verhoogt alleen toegestane features/limieten;
- downgrade verwijdert geen gegevens;
- onbekende key, ontbrekende snapshot en verlopen/offline-stale snapshot falen
  gesloten;
- trialformatter met fake timers op start, +1 minuut, 29 dagen, laatste uur,
  exact einde en klokwijziging;
- Basic/Pro/Enterprise-evaluator inclusief rol + plan + usage.

### 10.2 Componenttests

- iedere premium route via navigatie, hotkey en `?view=`;
- elke actieknop bij allowed, denied, loading, expired en limit reached;
- Billing en header tonen op hetzelfde moment exact dezelfde resterende tijd;
- Customer Display publisher zendt niets zonder entitlement;
- modulevoorkeur kan entitlement niet omzeilen;
- calculator werkt maandelijks/jaarlijks en maakt alleen een aanvraag.

### 10.3 Store- en servicetests

Roep mutaties rechtstreeks aan zonder UI:

- ServiceDesk create/update;
- Workforce read/write;
- forecast/PO create;
- integration/webhook/API-key create;
- labels en geavanceerde hardware;
- webshop publish;
- loyalty/giftcard issue;
- product/category/register/location/team/serviceorderlimieten.

Elke directe aanroep moet dezelfde foutreden geven als de UI.

### 10.4 Supabase-integratietests

Test als Basic-, Pro-, Enterprise-, manager-, cashier- en anonieme gebruiker:

- iedere premium RPC;
- directe table select/insert/update als omzeilingspoging;
- concurrerende creaties precies op een limiet;
- trial één seconde vóór, exact op en één seconde na expiratie;
- bestaande orders/cadeaubonnen na downgrade;
- owner-planwissel toegestaan zolang de tijdelijke publieke testmodus actief is;
- publieke webshop en servicetracking met juiste downgradepolicy.

### 10.5 E2E-scenario's

1. Nieuwe winkel start Pro-trial, teller beweegt binnen één minuut.
2. Trial verloopt terwijl Billing openstaat; premiumacties sluiten direct en
   Basis-POS blijft werken.
3. Basic ziet waarde en upgrade-CTA, maar kan ServiceDesk/Display/Workforce niet
   via deeplink of directe actie gebruiken.
4. Pro kan ServiceDesk tot 50 actieve dossiers en klantendisplay gebruiken,
   maar geen Workforce/forecast/PO/auditviewer.
5. Enterprise kan alle toegekende modules gebruiken.
6. Downgrade behoudt data en laat noodzakelijke afhandeling toe zonder nieuwe
   premiumobjecten te creëren.
7. Offline trial kan nooit voorbij het servereindtijdstip worden verlengd.

Voeg een `premiumSurfaceManifest` toe dat route, UI-action, lokale methode,
server-RPC/tabel en entitlement aan elkaar koppelt. Een CI-test faalt wanneer
een geregistreerde premiumfeature geen test op alle toepasselijke grenzen
heeft.

## 11. Gefaseerde uitvoering

### Fase 0 — matrix vastzetten en lekken stoppen (blokkerend)

- commerciële matrix en feature-ID's goedkeuren;
- Workforce niet langer in Basic/Pro;
- productieplansimulator expliciet als tijdelijke publieke testmodus labelen;
- ServiceDesk, Customer Display, Workforce, forecast, PO en audit minimaal
  fail-closed op route, actie en servergrens;
- dynamische trialklok en directe lokale expiratie bouwen;
- regressietests voor de bekende lekken.

**Klaar wanneer:** een Basic-account geen premium mutatie kan uitvoeren via UI,
deeplink, store/service of Supabase, en de trialteller aantoonbaar beweegt.

### Fase 1 — centrale catalogus en volledige frontenddekking

- catalogus, evaluator, nieuwe gatecomponenten en usage meters;
- websitecards/matrix en POS Billing uit dezelfde data;
- alle repo-oppervlakken aan het surface manifest koppelen;
- development/demo-simulator isoleren.

**Klaar wanneer:** prijzen, claims, features en upgradeplan nergens dubbel
handgeschreven zijn en CI drift afvangt.

### Fase 2 — volledige serverhandhaving en downgradeveiligheid

- RLS/RPC voor service, workforce, historiek, audit, webshop, team, add-ons en
  alle limieten;
- samengestelde plan+add-onentitlements;
- handmatige backofficeactivatie zonder betaalprovider;
- offline snapshotbeleid en subscription events.

**Klaar wanneer:** directe API-/database-aanroepen dezelfde beslissing geven
als de UI en data na iedere plantransitie veilig blijft.

### Fase 3 — conversie zonder betalingen

- publieke interactieve matrix en calculator;
- activatie-/offertelead met gekozen configuratie;
- in-app upgradecontext vanuit iedere gate;
- analytics voor pricingview, calculator, limit hit, trialwarning en
  activatieverzoek zonder gevoelige retaildata.

**Klaar wanneer:** een winkelier zelf de juiste configuratie en richtprijs kan
vinden en PWAYMENT een volledige, opvolgbare aanvraag ontvangt.

### Fase 4 — later: echte billingprovider

- checkout, klantportaal, providerwebhooks, idempotentie, proratering,
  facturen, mislukte betaling en herstel;
- providerwebhook verandert de subscription; de frontend nooit rechtstreeks;
- dezelfde entitlementruntime en gates blijven behouden.

## 12. Aanbevolen bestandswijzigingen

Nieuwe kernbestanden:

- `src/billing/billingCatalog.ts`
- `src/billing/capabilityEvaluator.ts`
- `src/billing/useEntitlementClock.ts`
- `src/billing/EntitledRoute.tsx`
- `src/billing/EntitledAction.tsx`
- `src/billing/UsageMeter.tsx`
- `src/billing/premiumSurfaceManifest.ts`
- `src/billing/catalog.test.ts`
- `src/billing/trialClock.test.ts`
- `src/billing/entitlementCoverage.test.ts`
- `scripts/generate-billing-catalog-migration.mjs`
- nieuwe, oplopende Supabasemigraties voor catalogus, RPC/RLS, add-ons en trial
  lifecycle

Belangrijkste bestaande bestanden om te wijzigen:

- `src/billing/entitlements.ts`
- `src/billing/FeatureGate.tsx`
- `src/billing/TrialStatus.tsx`
- `src/billing/planCatalog.ts` (vervangen of dunne compatibiliteitslaag)
- `src/components/BillingSettings.tsx`
- `src/public/PublicSite.tsx`
- `src/public/public-site.css`
- `src/components/Layout.tsx`
- `src/components/Profile.tsx`
- `src/components/ModuleSettings.tsx`
- `src/components/ServiceDesk.tsx`
- `src/services/serviceOrders.ts`
- `src/components/CustomerDisplaySettings.tsx`
- `src/customer-display/CustomerDisplayPublisher.tsx`
- `src/components/Insights.tsx`
- `src/components/InventoryForecast.tsx`
- `src/components/PurchaseOrderWorkflow.tsx`
- `src/store/useWorkforce.ts`
- `src/store/useIntegrations.ts`
- relevante webshop-, customer-, hardware-, history- en auditservices/components
- `src/types/database.generated.ts` na de migraties opnieuw genereren
- `README.md` en publieke capability/statusdocumentatie actualiseren

## 13. Definition of Done

Deze operatie is pas afgerond wanneer:

- één catalogus alle publieke en interne planpresentatie voedt;
- iedere betaalvrije planactivatie zichtbaar en aantoonbaar uit de tijdelijke
  publieke testmodus komt;
- de trialteller zichtbaar afloopt en exact op tijd vergrendelt;
- elke premiumfeature op alle technisch relevante grenzen is beschermd;
- server en client dezelfde uniforme foutreden geven;
- Basic, Pro en Enterprise exact de goedgekeurde matrix volgen;
- add-ons limieten samenstellen maar niet via een lokale toggle activeren;
- bestaande data en financiële verplichtingen veilig blijven na downgrade;
- claims over integraties, hardware, SLA en support hun echte status tonen;
- unit-, component-, store/service-, Supabase- en E2E-tests de matrix bewijzen;
- CI faalt bij prijsdrift, ontbrekende entitlementkeys of een niet-afgedekt
  premiumoppervlak.
