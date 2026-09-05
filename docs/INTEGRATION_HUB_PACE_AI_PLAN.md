# Integration Hub + PACE AI — beslis- en implementatieplan

**Datum:** 25 augustus 2026  
**Status:** voorstel na code-audit; nog niet implementeren zonder fase-0-beslissingen  
**Productbesluit:** voeg AI toe als een expliciet gekozen assistentiemodus. Behoud de bestaande handmatige en regelgebaseerde flows volledig en laat AI nooit rechtstreeks publiceren, synchroniseren of een risicovolle mapping afdwingen.

## 1. Kort oordeel

Ja, PACE-technologie kan de Integration Hub wezenlijk beter maken. De grootste winst zit niet in het vervangen van de importer, maar in het begrijpen van onbekende bronstructuren, het verklaren van voorstellen en het terugbrengen van tientallen technische beslissingen tot enkele begrijpelijke uitzonderingen.

De huidige basis is hiervoor verrassend geschikt:

- bestanden worden al lokaal geparseerd en gepreviewd;
- mapping heeft expliciete targets en confidence;
- business discovery produceert evidence, domeinen, capability packs en vragen;
- de configuration compiler maakt een versieerbaar voorstel;
- validatie, capability-blocks, expliciete review en undo bestaan al;
- PACE heeft al authenticatie, providerfallback, rate limiting, allow-listed context en lokale fallback.

Maar AI maakt de Hub niet automatisch een echte integratieplatform. De providerverbindingen, sync, OAuth/SFTP, webhooks en API-sleutels in `IntegrationsSettings` zijn vandaag grotendeels lokale simulaties. AI mag die lacune niet maskeren. Eerst moeten de succeslabels eerlijk worden gemaakt; echte connectoruitvoering vereist nog steeds de server-owned control plane uit het masterplan.

De realistische belofte is daarom niet “100× correcter”. De doelstelling is:

- 5–10× minder tijd om een onbekende export reviewklaar te krijgen;
- 70–90% minder manuele mappinghandelingen bij geschikte bronnen;
- duidelijk betere herkenning van leverancierstaal, vreemde kolomnamen en samengestelde retailmodellen;
- geen verslechtering van financiële, privacy- of activatieveiligheid;
- nul AI-beslissingen die zonder deterministische validatie en vereiste goedkeuring live gaan.

## 2. Wat er vandaag werkelijk staat

### 2.1 Migratiewerkruimte

De zichtbare `IntegrationHub` is momenteel een veilige v0-importer voor catalogus/voorraad en klanten:

1. CSV, TSV, XLSX of JSON wordt in de browser gelezen.
2. Headers worden met Nederlandse/Engelse regels aan canonieke velden gekoppeld.
3. Onbekende kolommen worden veilig als eigen bronveld bewaard in plaats van stil weggegooid.
4. De gebruiker kan elke mapping handmatig aanpassen.
5. Regels worden deterministisch omgezet en gevalideerd.
6. Een bedrijfsscan herkent domeinen en een mogelijk winkelprofiel.
7. Capability-readiness blokkeert bronnen die de actieve catalogusmogelijkheden te boven gaan.
8. Activatie maakt alleen nieuwe records en heeft een undo-venster tot de eerste echte activiteit.

Sterk: transparant, controleerbaar, relatief veilig en goed testbaar.  
Zwak: headerregels begrijpen weinig context, analyseren vooral één bestand, tonen confidence nauwelijks in de UI en stellen geen adaptieve vervolgvragen.

### 2.2 Integratie-instellingen

`IntegrationsSettings` bevat providerkaarten, authenticatievelden, resources, richting, planning, mappings, webhooks, API-sleutels en activiteit. De onderliggende Zustand-store simuleert echter belangrijke successen:

- verbindingstest = URL-vorm + credential-aanwezigheid + vaste wachttijd;
- synchronisatie = vaste wachttijd + berekend fictief recordaantal;
- OAuth en SFTP hebben geen echte server lifecycle;
- webhooktest en API-sleutels vormen geen productieklare delivery/API-laag.

Dit oppervlak is dus geen goede eerste plek om autonome AI-operaties te introduceren. AI-diagnose van echte runs wordt pas waardevol zodra echte run records, foutcodes, adapterversies, retries en reconciliatie bestaan.

### 2.3 PACE AI

PACE gebruikt vandaag een bruikbaar hybride patroon:

- deterministische lokale match/productkennis als gronding;
- beperkte allow-listed browsercontext;
- optionele tenantcontext onder de bestaande sessierechten;
- server-side Gemini met OpenAI als alternatief;
- korte timeouts, rate limiting en lokale fallback;
- geen autonome mutaties.

Dat patroon is herbruikbaar. Het huidige `/api/pace/respond`-contract is dat niet: het levert vrije tekst, accepteert geen importprofiel, heeft andere limieten en is niet ontworpen voor schema-gevalideerde mappingvoorstellen.

## 3. Gewenste gebruikerskeuze

Toon na het uploaden of verbinden één duidelijke keuze onder “Hoe wil je deze bron voorbereiden?”

| Modus | Gedrag | Beschikbaarheid |
| --- | --- | --- |
| Handmatig | Start met lege of minimaal bekende mapping; gebruiker beslist elk veld | Blijft altijd bestaan |
| Slimme basis | Huidige deterministische headerregels, previews en validators | Bestaande standaard; blijft altijd bestaan |
| PACE AI-assistent | Regels eerst, daarna AI-voorstellen voor onzekere mappings, bronsemantiek, bedrijfspatroon en gerichte vragen | Expliciet te kiezen; later premium |

Belangrijke UX-regels:

- een opgeslagen voorkeur mag de modus vooraf selecteren, maar een nieuwe bron toont altijd zichtbaar welke modus actief is;
- overschakelen tussen modi wist het bronbestand en handmatige correcties niet;
- “PACE AI” toont vóór de eerste analyse welke metadata/samples worden verzonden;
- AI-uitval schakelt dezelfde sessie terug naar “Slimme basis”, zonder verlies van werk;
- ieder AI-voorstel heeft confidence, een korte reden, gebruikte evidence en “accepteren/wijzigen”;
- handmatig gewijzigde velden worden gelockt en nooit stil door een volgende AI-run overschreven;
- activeren blijft dezelfde aparte reviewstap, onafhankelijk van de gekozen voorbereidingsmodus.

## 4. Waar AI echt grote meerwaarde geeft

### 4.1 Semantische veldmapping

AI kan onbekende of providerspecifieke termen relateren aan de canonieke registry. Voorbeelden: `VK incl`, `stock libre`, `repair_state`, `article maître`, `Telenet PP`, of een kolom waarvan de betekenis pas duidelijk wordt door naburige headers en waardepatronen.

AI-output is alleen een voorstel uit een gesloten lijst van canonieke targets en reeds goedgekeurde extension fields. Nieuwe velden komen als apart conceptvoorstel, nooit als directe schemamutatie.

### 4.2 Bron- en bedrijfsbegrip

AI kan meerdere evidenceblokken combineren: bestandsnaam, sheetnamen, headerprofiel, datatypes, null/distinct-statistieken, relaties en veilige voorbeeldwaarden. Daarmee kan het betere hypotheses maken over:

- catalogus versus varianten;
- voorraadmomentopname versus deltafeed;
- prijs inclusief/exclusief btw;
- klantprijsboeken;
- open versus historische herstellingen;
- service-, telecom-, fashion-, fiets- of food-capability packs;
- welke bestanden bij elkaar horen.

### 4.3 Adaptieve vragen

In plaats van een generieke configuratievragenlijst kiest de orchestrator de vraag met de hoogste informatiewinst. AI mag de vraag en uitleg formuleren, maar de mogelijke beslissingen en hun impact komen uit de configuration graph/policy engine.

### 4.4 Uitleg en exception review

AI kan technische problemen in handelaarstaal uitleggen: waarom 43 regels dezelfde EAN lijken te gebruiken, waarom een kolom waarschijnlijk een prijs exclusief btw is, of waarom een voorraadfeed niet veilig kan publiceren. Dit verlaagt supportdruk zonder de onderliggende foutcode of validatie te veranderen.

### 4.5 Mappingrecepten opstellen

Na goedkeuring kan AI een concept voor een herbruikbaar provider/source-recept voorstellen. Alleen menselijk goedgekeurde, versieerbare DSL-regels gaan de Source Schema Registry in. Merchantwaarden worden niet gebruikt als trainingscorpus.

## 5. Waar AI niet beter of niet toegestaan is

Gebruik deterministische code voor:

- parsing, encoding-, delimiter-, datum- en geldconversie;
- GTIN/check-digit, btw, required-field en uniqueness-validatie;
- exacte externe-ID-, SKU- en barcode-identiteit;
- change sets, aantallen, totalen en reconciliatie;
- tenantrechten en entitlements;
- source-of-truth- en field-ownershipbeleid;
- conflictresolutie met financiële of voorraadimpact;
- staging, idempotente promotie, rollback en sync;
- secretverwerking, OAuth, webhooks en API-authenticatie.

AI mag nooit:

- ruwe credentials, PINs, betaaldata of volledige klantbestanden ontvangen;
- een lage-confidence voorstel verbergen;
- een financieel veld of voorraadsemantiek stil mappen;
- een nieuwe capability of connector verzinnen;
- validatiefouten wegschrijven;
- zelf publiceren, verwijderen, bidirectionele sync activeren of een bron als autoriteit instellen;
- een gesimuleerde verbinding omschrijven als een echte succesvolle integratie.

## 6. Technische architectuur

### 6.1 Orchestratie

```text
Upload/connector
  → veilige parser + profiler
  → huidige regels en schema-registry
  → onzekerheidsselectie
  → optionele PACE AI-analyse
  → JSON-schema validatie
  → policy/risk filter
  → deterministische mapper + validators
  → exception review
  → expliciete goedkeuring
  → staging/promotie via bestaande of toekomstige control plane
```

AI ziet dus niet standaard elk record. De profiler maakt eerst een compacte `SourceAnalysisEnvelope`:

- source fingerprint, format, sheetnamen en headers;
- per kolom: vermoed datatype, null-rate, distinct-band, patroonflags en maximaal enkele geredigeerde voorbeelden;
- huidige rule match en confidence;
- canonieke targets met beschrijving, datatype en risk class;
- gevonden relaties en tegenstrijdigheden;
- actieve store-capabilities en reeds goedgekeurde extension-field-definities;
- nooit secrets; PII-waarden standaard gemaskeerd of geheel weggelaten.

### 6.2 Nieuw servercontract

Maak een afzonderlijke route, bijvoorbeeld `POST /api/integrations/analyze`, met dezelfde bewezen bouwstenen als PACE-authenticatie/providerfallback maar een nieuw strikt contract.

Minimale response:

```ts
type IntegrationAiProposal = {
  schemaVersion: 1;
  sourceFingerprint: string;
  mappings: Array<{
    source: string;
    target: CanonicalTarget;
    confidence: number;
    rationaleCode: string;
    evidence: string[];
    risk: "low" | "medium" | "high";
  }>;
  sourceSemantics: {
    stockMode?: "snapshot" | "delta" | "unknown";
    taxMode?: "inclusive" | "exclusive" | "mixed" | "unknown";
    entityKinds: CanonicalEntityKind[];
  };
  configurationHints: ConfigurationHint[];
  questions: ProposedQuestion[];
  warnings: ProposedWarning[];
};
```

Alle enums zijn gesloten. Zod/JSON Schema verwerpt onbekende targets, dubbele bronmappings, ongeldige evidence, te hoge confidence zonder bewijs en output die niet bij de ingestuurde fingerprint hoort.

### 6.3 Meerstapsmodelgebruik

Gebruik geen één grote prompt die “de migratie oplost”. Splits het op:

1. classificatie van alleen onzekere kolommen;
2. bronsemantiek en relaties;
3. gerichte vraagselectie;
4. uitleg van bestaande deterministische exceptions.

Elke stap heeft een klein schema, eigen timeout, eigen evaluatieset en kan afzonderlijk terugvallen op regels. Cache voorstellen op `(tenant, sourceFingerprint, registryVersion, modelPolicyVersion)`; stuur handmatige correcties als locks mee.

### 6.4 Audit en privacy

Bewaar bij elk voorstel:

- model/provider en policyversie;
- prompt-templateversie, niet de geheime systeemtekst of credentials;
- source fingerprint en gebruikte evidence-ID’s;
- voorgestelde en uiteindelijk gekozen mapping;
- actor, tijdstip en accept/edit/reject-status;
- token-/kostmetadata en latency;
- geen ruwe PII in gewone logs.

Voeg een privacy-preview toe: “PACE analyseert 38 kolomnamen, datatypeprofielen en 24 gemaskeerde voorbeelden; klantnamen, e-mails, telefoons en notities worden niet meegestuurd.”

## 7. Product- en premiumontwerp

Voeg een aparte entitlement toe, bijvoorbeeld `integrations.ai_assist`. Koppel deze niet aan de algemene PACE-toggle en niet aan `integrations.configure`; zo kunnen producthulp, gewone importer en premium importintelligentie afzonderlijk worden aangeboden.

Aanbevolen pakketlogica:

- Handmatig en Slimme basis blijven inbegrepen waar de importer vandaag beschikbaar is.
- PACE AI-assistent krijgt een beperkte proefanalyse per winkel of migratiewerkruimte.
- Premium bevat volledige AI-mapping, multi-source discovery, adaptieve vragen en AI-exceptionuitleg.
- Fleet learning, herbruikbare providerrecepten en supportcopilot passen later bij Enterprise/partnerniveau.
- Een downgrade maakt bestaande goedgekeurde mappingversies read-only bruikbaar; alleen nieuwe AI-analyses worden geblokkeerd.

Meet verbruik per analyse-eenheid, niet per chatbericht: fingerprintanalyse, mappingvoorstel en exceptionuitleg. Toon geen onvoorspelbare tokenrekening aan de merchant.

## 8. Gefaseerde uitvoering

### Fase 0 — productwaarheid en baseline (1 week)

1. Label gesimuleerde providerconnecties, syncs, webhooks en API-keys als demo/gepland of verberg acties zonder servercapability.
2. Instrumenteer huidige importer: tijd tot review, aantal handmatige mappingwijzigingen, onbekende velden, validatiefouten, abandon-stage en undo.
3. Leg risicoklassen per canoniek veld vast: identity, operationeel, PII, voorraad, prijs/btw, financieel.
4. Beslis welke samples de AI per risicoklasse mag zien.

**Exit:** geen AI-experiment kan prototypegedrag als echte integratie presenteren; er is een meetbare niet-AI-baseline.

### Fase 1 — contract en evaluatielab (2–3 weken)

1. Maak canonical field registry, `SourceAnalysisEnvelope`, AI-response-schema en policyfilter.
2. Bouw golden fixtures uit de bestaande telecomfixture plus minimaal 3 bronfamilies × 30 varianten.
3. Voeg Nederlandse, Franse en Engelse headers, rare afkortingen, schema drift, PII en financieel gevaarlijke ambiguïteit toe.
4. Meet precision/recall per risk class en confidence-calibratie.

**Go/no-go:** minimaal 95% juiste voorstellen voor low-risk mappings, 100% recall van de expliciet gedefinieerde high-risk ambiguïteiten, en nul ongecontroleerde high-risk auto-accepts. Anders blijft de feature intern/shadow-only.

### Fase 2 — AI-mapping in shadow mode (2 weken)

1. Implementeer `/api/integrations/analyze` achter deploymentflag.
2. Draai AI na de regels, maar toon voorstellen nog niet aan merchants.
3. Vergelijk AI, regelengine en uiteindelijke handmatige keuzes.
4. Log alleen fingerprints, evidence en beslisuitkomsten volgens privacycontract.

**Exit:** AI verbetert onbekende/low-confidence mapping aantoonbaar zonder meer risicovolle fouten of onaanvaardbare latency/kost.

### Fase 3 — optionele PACE AI-mapping (2–3 weken)

1. Voeg de drie assistentiemodi toe aan de Migration Workspace.
2. Toon confidence, reden, evidence, warnings en per-veld accept/edit.
3. Respecteer locks voor handmatige wijzigingen.
4. Voeg automatische fallback naar Slimme basis toe.
5. Laat alle output door de bestaande mapper, capability-readiness en activatiebevestiging lopen.

**Exit:** een gebruiker kan AI volledig vermijden; dezelfde bron kan in elke modus worden voltooid; AI-uitval verliest geen werk; activatiegedrag is identiek veilig.

### Fase 4 — business discovery en adaptieve review (3–4 weken)

1. Analyseer meerdere bronnen binnen één migration workspace.
2. Laat AI configuration hints en maximaal drie gerichte vragen voorstellen.
3. Laat de deterministische compiler impact, afhankelijkheden en toegestane antwoorden bepalen.
4. Voeg PACE-uitleg toe aan exceptions en capability-blocks.

**Exit:** pilotgebruikers beantwoorden minder vragen en bereiken sneller een volledig verklaarbare configuration proposal; geen graph-node wordt zonder policy en approval toegepast.

### Fase 5 — premium pilot en packaging (2–4 weken)

1. Voeg `integrations.ai_assist` toe aan feature catalog, server-entitlements en FeatureGate.
2. Bepaal fair-use-limieten, trialanalyse en cost guardrails.
3. Pilot met 8–12 consented merchants uit telecom/repair en specialty retail.
4. Vergelijk AI versus Slimme basis met vooraf vastgelegde metrics.

**Exit:** bewezen tijdswinst, gelijke of betere datakwaliteit, begrijpelijke privacykeuze en beheersbare support/providerkosten.

### Fase 6 — operationele AI na echte connectors

Pas nadat durable runs, echte adapters en reconciliatie bestaan:

- leg failed runs in merchanttaal uit;
- rangschik exceptions op impact;
- stel veilige retry/reconnect/backfill-stappen voor;
- detecteer schema drift;
- stel een mappingversie-update voor;
- voer nooit zelfstandig retry, replay, autoriteitswijziging of write-sync uit zonder de normale rechten en bevestiging.

## 9. Meetplan

Vergelijk per bronfamilie en risicoklasse:

| Metric | Baseline | Pilotdoel |
| --- | --- | --- |
| Tijd upload → reviewklaar | Eerst meten | minstens 60% lager |
| Handmatige mappingwijzigingen | Eerst meten | minstens 70% lager bij onbekende bronnen |
| Correcte field mapping | Rule baseline | hoger, apart gerapporteerd per risk class |
| Onterecht financieel/voorraadvoorstel | Eerst meten | 0 live-geaccepteerd zonder expliciete review |
| Onbekende kritieke velden gemist | Eerst meten | 0 in gecertificeerde fixtures |
| Validatiefouten na voorstel | Rule baseline | niet hoger |
| Activatie-undo door verkeerde mapping | Eerst meten | niet hoger; streef naar lager |
| P95 analysetijd | n.v.t. | < 12 s voor geprofileerde file |
| AI-fallback voltooiingsgraad | n.v.t. | gelijk aan Slimme basis |
| Kost per succesvolle review | n.v.t. | binnen vooraf gekozen pakketmarge |

“100× beter” gebruiken we alleen als intern aspiratiebeeld, niet als productclaim. De feature is commercieel klaar wanneer zij meetbaar veel tijd bespaart zonder safety, uitlegbaarheid of offline fallback te verzwakken.

## 10. Belangrijkste risico’s en mitigaties

| Risico | Mitigatie |
| --- | --- |
| Hallucinatie of verkeerde mapping | Gesloten targets, schema-validatie, risk policy, menselijke review |
| Automatiseringsbias | Toon evidence en alternatieven; high-risk nooit vooraf accepteren |
| PII naar provider | Profiler/redactor vóór request, privacy-preview, minimale samples, audit |
| Prompt injection uit bronwaarden | Waarden als data behandelen, instructies server-side scheiden, gesloten outputschema |
| Kosten/latency | Alleen onzekerheden analyseren, caching per fingerprint, kleine stappen, quotas |
| Provideruitval | Huidige rules engine als volledige fallback; werk lokaal bewaren |
| AI maskeert nepconnectors | Fase 0 verplicht; capability badges uit serverwaarheid |
| Modelwijziging verslechtert kwaliteit | Model/policyversies pinnen; eval gate vóór promotie |
| Merchantcorrecties verdwijnen | Mapping locks en immutable mapping versions |
| Premium breekt bestaande flow | Nieuwe entitlement alleen voor AI; manual/rules nooit verwijderen |

## 11. Concrete eerste backlog

1. Maak capability/status van alle providerkaarten eerlijk.
2. Voeg importer-baseline events toe.
3. Definieer canonical field registry en risk classes.
4. Definieer redactionbeleid en `SourceAnalysisEnvelope`.
5. Bouw fixture/evaluation corpus en scorecard.
6. Maak gestructureerde AI-provider service los van de PACE-chatroute.
7. Implementeer mappinganalyse in shadow mode.
8. Bouw mode selector, evidence cards en mapping locks.
9. Voeg fallback- en privacy-UX toe.
10. Voeg entitlement en usage accounting pas toe nadat pilotmetrics de meerwaarde bewijzen.

## 12. Definitieve aanbeveling

Doen, maar positioneer het als **PACE AI-assistent in de Migration Workspace**, niet als een autonome integratiemotor en niet als vervanging van bestaande opties.

De onderscheidende architectuur is:

> AI begrijpt en verklaart; de Integration Hub profileert, valideert en berekent; de merchant keurt goed; de control plane voert controleerbaar uit.

Zo benut PWAYMENT wat PACE al goed doet—context, taal, grounding en fallback—terwijl de delen die absoluut correct moeten zijn deterministisch, auditbaar en omkeerbaar blijven. Dat is geloofwaardiger en uiteindelijk waardevoller dan een generieke “AI import”-knop.
