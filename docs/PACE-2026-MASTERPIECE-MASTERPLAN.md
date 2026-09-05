# Pace 2026 — intelligence, actions & experience masterplan

> **Domeinplan:** de implementatiestatus hieronder geldt alleen voor de
> expliciet benoemde Pace-foundations. Gebruik
> [`../PROJECT-CONTEXT.md`](../PROJECT-CONTEXT.md) voor de algemene product- en
> releasestatus.

**Status:** code-audit en toekomstplan
**Auditdatum:** 29 augustus 2026
**Scope:** de actuele repository, met focus op `src/pace`, `src/server/pace`, `api/pace` en de Pace-koppeling in `Layout`
**Doel:** Pace laten evolueren van een sterke, veilige read-only retailcopiloot naar een aantoonbaar betrouwbare operationele interface voor PWAYMENT—zonder financiële controle, privacy of snelheid aan de kassa op te offeren.

## Implementatiestatus

**Gestart op 29 augustus 2026.** De eerste veilige P0/P1-foundations zijn inmiddels in de code opgenomen:

- remote antwoorden erven geen onbewezen lokale actie of instructiemetadata meer;
- opgeslagen antwoorden krijgen eerlijke provenance en geen gereconstrueerde actie;
- header- en thinking-copy volgen de werkelijke privacy-/requestmodus;
- bestaande clarification candidates zijn interactief beschikbaar;
- typed destinations met gesloten workspace-, profiel-, setup- en catalogustargets;
- role-gated return-search en beheerbestemmingen;
- concrete POS-focus voor productzoeken en winkelmand;
- een bevestigende, tijdelijke Pace-cue na geslaagde navigatie;
- historische gesprekken herstellen na database-uitrol hun echte antwoordbron, model en begrensde publieke bronvermeldingen, zonder ruwe evidence of interne plannen vrij te geven;
- een versioned publiek NDJSON-progressprotocol stuurt de truth-state reducer aan met planning, resolving, retrieval, comparison, composition en verification; klassieke JSON-clients blijven compatibel;
- regressietests voor responseveiligheid, destinations, rollen, concrete oplossingsroutes en historische provenance.

Nog niet geactiveerd: server-gegenereerde action proposals, write-commands, streaming progress en protected transactions. Deze blijven bewust achter de volgende architectuur- en securitygates.

---

## 1. Executive verdict

Pace is vandaag geen prototype-chatbot. De huidige code bevat al vijf waardevolle fundamenten:

1. deterministische lokale productkennis met concrete navigatie;
2. tenant- en rolgebonden live winkeldata via server-side RPC's;
3. gecontroleerde analytics, record-lookups en vijf gespecialiseerde read-tools;
4. persistent conversatiegeheugen, entiteitsresolutie, quota, bronmetadata en privacyredactie;
5. proactieve operationele signalen en lokale, evidence-based klantinzichten.

De grootste beperking is niet het taalmodel. Het ontbrekende stuk is een productbreed **Pace capability- en action-platform**. Momenteel zijn lezen, antwoorden, navigeren, signaleren en animeren nog afzonderlijke mechanismen. Daardoor:

- kent Pace veel, maar kan hij het antwoord zelden omzetten in een precieze volgende stap;
- kan de server geen gevalideerde UI-actie voorstellen;
- ziet de gebruiker tijdens wachten geen echte voortgang;
- is de visuele expressie rijker dan een standaardspinner, maar semantisch nog beperkt;
- is de context breed aan de serverkant, maar smal en handmatig samengesteld aan de actieve UI-kant;
- kunnen acties, bronnen, permissies en interface-state nog niet als één controleerbaar geheel worden gepresenteerd.

De juiste ambitie is daarom niet “een chatbot die ook knoppen kan indrukken”. De juiste ambitie is:

> **Pace wordt de veilige intentielaag van PWAYMENT: hij begrijpt wat de gebruiker wil bereiken, verzamelt alleen toegestane feiten, toont een controleerbaar voorstel, brengt de gebruiker exact naar de oplossing en voert uitsluitend expliciet toegestane acties uit via dezelfde domeincommando's, controles en auditregels als de rest van het kassasysteem.**

Acties door Pace zijn gewenst, maar niet allemaal op dezelfde manier. Navigatie, filtering, focus en het voorbereiden van een concept kunnen snel. Reversibele operationele mutaties kunnen na preview en bevestiging. Geldbewegingen, wettelijke finalisatie, gevoelige personeelsbeslissingen en bevoegdheidswijzigingen blijven altijd mensgestuurd in de bestaande beveiligde flow.

---

## 2. Wat Pace vandaag effectief kan

### 2.1 In de interface

De launcher is geïntegreerd in de hoofdheader en krijgt actuele context uit `Layout`:

- actieve `MainView`;
- rol van de gebruiker;
- aantal producten en mandregels;
- setupstatus;
- online/offline-status;
- pending, retrying en failed outbox-items, inclusief gekende oorzaak en hersteladvies;
- begrensde winkelmandsamenvatting;
- gekoppelde klant en lokale klantinzichten;
- setupmilestones.

Pace toont momenteel:

- één primair signaal onder “Nu belangrijk”;
- maximaal twee secundaire signalen;
- setupvoortgang voor owner/manager;
- recente onderzoeken;
- vraag en vervolgvraag;
- quota en een quota-wall;
- antwoordblokken, stappen, beperkingen, vervolgvragen en bronchips;
- een privacy-/veiligheidsboodschap.

### 2.2 Lokale kennis en fallback

`paceKnowledge.ts` bevat een omvangrijke intentcatalogus met regexmatching, viewrelevantie, antwoorden, stappen, beperkingen, follow-ups en optionele acties. Deze laag blijft bruikbaar wanneer AI uitstaat of tijdelijk faalt. Bekende lokale synchronisatieproblemen worden bewust deterministisch beantwoord.

Dit is een sterk ontwerpbesluit: kritieke productwaarheid hoeft niet van een model af te hangen.

### 2.3 Live intelligentie

De endpoint ondersteunt twee providers en gebruikt een planner om een vraag op te splitsen in:

- productkennis;
- analytics;
- recordlookup;
- voorraadanalyse/advies;
- gespecialiseerde read-tools;
- brede winkelcontext;
- samengestelde vragen;
- verduidelijking.

De planner kan maximaal drie analyticsplannen, één recordplan en vijf gespecialiseerde tools kiezen. De huidige gespecialiseerde tools zijn:

- btw-uitsplitsing;
- tender-/splitbetalingsuitsplitsing;
- cadeaubonsamenvatting;
- verlofsamenvatting;
- voorraad per locatie.

Daarnaast kan Pace gecontroleerde analytics lezen over onder meer omzet, marge, transacties, units, gemiddelde ticketwaarde, kortingen, refunds, voorraad, klantgedrag, workforce, cashverschil en voids, gegroepeerd over relevante retaildimensies en periodes.

Concreet recordzoeken bestaat voor transacties, producten, klanten, cadeaubonnen, dagrapporten, aankooporders, webshoporders, servicedossiers, voorraadbewegingen, medewerkers, verlofaanvragen en auditentries.

### 2.4 Betrouwbaarheid en privacy

De implementatie bevat al:

- Supabase-sessieverificatie;
- tenant membership en RLS als toegangsgrens;
- rolbeperkingen voor gevoelige velden;
- begrensde resultaten en begrensde recordregels;
- uitsluiting/redactie van onder meer e-mail, telefoon, adressen, notities, PIN, tokens en secrets;
- serverberekende deterministische antwoorden voor geschikte analytics- en recordvragen;
- evidence-digests en publieke bronmetadata;
- conversation revision control en idempotente client turn IDs;
- recovery voor actieve/stale turns;
- quotareservering en usage logging;
- timeout en lokale fallback;
- expliciete gebruikerskeuze voor AI en live winkelcontext.

### 2.5 Acties die vandaag al bestaan

De huidige `PaceAction` is een gesloten client-side union met vijf mogelijkheden:

- naar een hoofdview navigeren;
- setup openen;
- een profieltab openen;
- catalogus openen met product-ID's en filterlabel;
- niets doen.

De acties komen uit lokale kennis en signalen, niet uit de serverresponse. Er is geen generiek commandocontract en geen server-side mutatie door Pace.

### 2.6 Visuele expressie vandaag

`PaceMark` kent zes emoties:

- idle;
- attentive;
- thinking;
- guiding;
- celebrating;
- sleeping.

Er zijn drie expliciete performances/morphs:

- vraagteken;
- uitroepteken;
- liquid/blob.

De kleuren reageren op signaaltoon (`flow`, `attention`, `success`), beweging respecteert reduced motion en de gebruiker kan full, subtle of off kiezen.

Tijdens een vraag wordt echter altijd dezelfde UI getoond:

- “Pace denkt met je mee”;
- “Je vraag begrijpen”;
- “Je winkelcontext erbij nemen”;
- “Een helder antwoord maken”.

Die drie teksten roteren elke 5,4 seconden, los van de echte serverfase. De request is één niet-streamende `fetch` met een timeout van 22 seconden. De client kan dus niet weten welke fase werkelijk bezig is.

---

## 3. Belangrijkste huidige gaps

### 3.1 Antwoord en actie zijn niet betrouwbaar aan elkaar gekoppeld

Na een AI-antwoord bouwt de UI de response op vanuit het lokale knowledge-resultaat en vervangt voornamelijk titel/antwoord. Daardoor kunnen `action`, `actionLabel`, `steps`, `limitation` en `followUps` van een lokale regexmatch naast een inhoudelijk ruimer AI-antwoord verschijnen. Bij een zwakke of onbedoelde lokale match kan de knop semantisch afwijken van het antwoord.

**Vereiste:** antwoord, bronnen, aanbevolen actie, permissiebeoordeling en UI-target moeten één servergevalideerd responsecontract vormen. Lokale fallback krijgt hetzelfde contract, maar met `source=local`.

### 3.2 Server-intelligentie bereikt de UI niet volledig

De server retourneert resolved entities en kan verduidelijkingskandidaten teruggeven. `askPaceAi` parseert deze velden, maar `PaceAssistant` gebruikt ze niet. De gebruiker krijgt dus tekstuele verduidelijking zonder selecteerbare kandidaten en entiteitsresolutie wordt visueel niet benut.

### 3.3 Conversatiegeheugen bestaat, maar de interface toont geen echt gesprek

De laatste beurten worden bewaard en meegestuurd, maar het conversatievenster rendert in essentie de actieve vraag en het laatste antwoord. Bij heropenen wordt bovendien een lokaal antwoordobject gereconstrueerd rond de historische servertekst en wordt de bron als lokaal gezet. Historische bronnen, acties en provenance zijn daardoor niet volledig gerehydrateerd.

### 3.4 “Live context” is te generiek gecommuniceerd

De header zegt altijd `LIVE CONTEXT`, terwijl de gebruiker live winkelcontext kan uitschakelen, AI uit kan staan of een lokaal antwoord kan krijgen. De composer is preciezer, maar het hoofdmerk niet. Vertrouwen vraagt dat de actuele modus overal klopt.

### 3.5 De denkstatus simuleert proceskennis

De drie wachtteksten zijn niet fout bedoeld, maar ze zijn niet gekoppeld aan echte backend-events. Bij een lokale fallback, deterministisch analyticsantwoord of providerrequest blijft dezelfde cyclus zichtbaar. Dat maakt de ervaring repetitief en op termijn minder geloofwaardig.

### 3.6 Proactiviteit is een instelling met beperkte gedragsdifferentiatie

`quiet/balanced/coach` beïnvloedt badges en copy, maar er is nog geen volwaardige attentie-engine met frequentieplafonds, momentgeschiktheid, impact, confidence, snooze, teamcoördinatie en leerfeedback.

### 3.7 Context is nog geen productbreed capability-register

Een deel van de actieve context wordt handmatig door `Layout` aangeleverd en serverdata komt uit afzonderlijke RPC's. Nieuwe modules moeten Pace momenteel op meerdere plaatsen handmatig uitbreiden. Er bestaat nog geen afdwingbaar contract dat bij elke feature beschrijft:

- wat Pace mag lezen;
- welke samenvatting veilig is;
- welke acties bestaan;
- welke rollen/entitlements gelden;
- welke UI-targets opengezet kunnen worden;
- welke audit- en confirmatieregels gelden.

### 3.8 Het visuele systeem heeft states, maar nog geen choreografie

Het merkteken beweegt en morpht, maar de panelinhoud, bronnen, cards, acties en navigatie bewegen niet als één semantisch systeem. Er zijn weinig situationele verschillen tussen bijvoorbeeld analyseren, records vergelijken, een probleem detecteren, een voorstel klaarzetten of om bevestiging vragen.

---

## 4. Productprincipes voor de masterpiece-versie

1. **Retailflow eerst.** Pace mag een scan, betaling of wachtrij aan de kassa nooit vertragen of visueel overnemen.
2. **Geen toneelmatige intelligentie.** Toon alleen echte processtatus; geen chain-of-thought en geen verzonnen “ik controleer nu X”.
3. **Evidence before eloquence.** Feitelijke claims krijgen bron, periode, actualiteit en datakwaliteit.
4. **Progressive agency.** Eerst navigeren, dan voorbereiden, pas daarna gecontroleerd uitvoeren.
5. **Same commands, same rules.** Pace gebruikt dezelfde domeinservices/RPC's als de gewone UI; nooit rechtstreekse willekeurige databasewrites.
6. **Preview is a product surface.** Een actievoorstel toont vooraf effect, scope, uitzonderingen en vereiste bevoegdheid.
7. **No silent side effects.** Geen verborgen toevoeging aan mand, wijziging, externe sync of communicatie.
8. **Reversible where possible.** Lage/middelmatige acties krijgen undo of een duidelijk herstelpad.
9. **Permission is contextual.** Rol, store, plan, module, device, workflowstate en persoonlijke bevestiging worden op uitvoermoment opnieuw gecontroleerd.
10. **Calm technology.** Meer expressie betekent niet meer afleiding. Animatie communiceert toestand en prioriteit.

---

## 5. Moet Pace acties kunnen uitvoeren?

### 5.1 Besluit

**Ja.** Zonder acties blijft Pace een slimme uitleglaag. Met een veilige actielaag wordt hij een fundamentele productinterface. Maar “acties uitvoeren” moet in vier niveaus worden opgesplitst.

| Niveau | Gedrag | Voorbeelden | Bevestiging |
|---|---|---|---|
| A — Reveal | Brengt exact naar de oplossing | juiste view, tab, record, filter, regel of fout openen en highlighten | geen, want geen mutatie |
| B — Prepare | Bouwt een concept of vult een gecontroleerde flow voor | filterset, rapportperiode, concept-PO, retourregels selecteren, telling starten, antwoordtemplate | expliciete knop “Voorstel gebruiken” |
| C — Execute reversible | Voert een beperkte, omkeerbare domeinactie uit | inzicht opslaan/snoozen, taak aanmaken, intern label toepassen, draft bewaren | duidelijke preview + bevestiging; undo waar mogelijk |
| D — Protected transaction | Opent en begeleidt, maar finaliseert niet zelfstandig | betaling, refund, Z-rapport, korting met PIN, cadeaubonwaarde, voorraadboeking, PO verzenden, verlofbeslissing, rechten/abonnement | bestaande beveiligde flow, menselijke finale bevestiging en waar vereist PIN/step-up |

Pace krijgt nooit een generiek `write_database`-tool. Hij krijgt afzonderlijke, schema-gevalideerde commands met een gekende risicoklasse.

### 5.2 Eerste acties met hoge waarde en laag risico

1. `ui.open_target`: open view/tab/panel/record en focus exact element.
2. `ui.apply_filter`: zet periode, status, zoekterm en dimensie.
3. `ui.highlight_blocker`: open de echte reden waarom een knop of flow geblokkeerd is.
4. `report.prepare`: open Inzichten of Historiek met voorgeselecteerde vergelijking.
5. `catalog.open_selection`: huidige gefilterde selectie, uitgebreid met bron/evidence.
6. `setup.open_milestone`: bestaande flow, maar exact op de ontbrekende stap.
7. `sync.open_recovery_item`: open de concrete dead-letter in plaats van alleen de integratietab.
8. `draft.purchase_order`: maak een niet-verzonden concept op basis van gecontroleerde voorraadcriteria.
9. `draft.inventory_count`: bereid een telling voor met locaties/producten; geen voorraadboeking.
10. `insight.disposition`: opslaan, snoozen, toewijzen of als niet relevant markeren.

### 5.3 Acties die Pace niet autonoom hoort te finaliseren

- betaling starten of als geslaagd markeren;
- cashbedrag, wisselgeld of terminalresultaat bevestigen;
- refund of retour finaliseren;
- Z-rapport finaliseren of kasverschilreden invullen;
- manager-PIN vragen, verwerken of omzeilen;
- korting goedkeuren;
- voorraadcorrectie/ontvangst boeken zonder menselijke review;
- purchase order verzenden naar leverancier;
- cadeaubon uitgeven, opwaarderen of blokkeren;
- verlof goedkeuren/afwijzen;
- medewerker, rol, entitlement, abonnement of facturatie wijzigen;
- klantcommunicatie versturen zonder preview en expliciete bevestiging;
- integratiecredentials lezen of wijzigen.

---

## 6. Target architecture: Pace Capability Platform

### 6.1 Capability registry per module

Elke PWAYMENT-module publiceert een versieerbaar manifest:

```ts
interface PaceCapabilityManifest {
  module: string;
  version: number;
  readModels: PaceReadModelDefinition[];
  uiTargets: PaceUiTargetDefinition[];
  commands: PaceCommandDefinition[];
  signals: PaceSignalDefinition[];
  glossary: PaceKnowledgeReference[];
}
```

Dit manifest wordt de enige bron voor wat Pace kan zien, openen, voorbereiden en uitvoeren. CI faalt wanneer een nieuwe relevante feature geen Pace-contract of expliciete `paceUnsupportedReason` bevat.

### 6.2 Context broker in plaats van brede datadumps

Introduceer server-side een context broker die planner-intent omzet in minimaal noodzakelijke read models:

```text
Vraag
  -> intent + entiteiten + benodigde claims
  -> capability/permission resolution
  -> geselecteerde read models
  -> parallelle bounded fetch
  -> evidence graph
  -> deterministisch antwoord of modelcompositie
  -> response + action proposals
```

Ieder read model definieert:

- tenant/role/entitlement-check;
- toegestane velden;
- aggregatie- en rowlimiet;
- PII-classificatie;
- freshness/SLA;
- datakwaliteitsindicatoren;
- cachebeleid;
- bronlabel voor de gebruiker.

### 6.3 UI context snapshots

Naast databasecontext heeft Pace gecontroleerde live UI-state nodig:

- actieve record-ID en subview;
- actieve filters/periode;
- geselecteerde regels;
- validatiefouten en blocker codes;
- loading/sync state;
- beschikbare commando's in de huidige state;
- dirty state van een formulier, zonder geheime velden;
- device-capabilities zoals scanner/display/terminal connection-status, niet de credentials.

Modules publiceren een compacte `PaceSurfaceSnapshot`; het hoofdcomponent hoeft niet alle domeindata handmatig te verzamelen.

### 6.4 Evidence graph

Evolueer de huidige evidence-array naar claims die aan bronnen én acties gekoppeld zijn:

```ts
interface PaceClaim {
  id: string;
  text: string;
  evidenceIds: string[];
  confidence: number;
  freshness: "live" | "period" | "stale";
}
```

Een actievoorstel benoemt welke claims de actie ondersteunen. Daardoor kan de gebruiker vragen: “Waarom stel je dit voor?” zonder een nieuwe vrije interpretatie.

### 6.5 Structured response contract

De serverresponse wordt versie 3:

```ts
interface PaceResponseV3 {
  answer: PaceAnswerDocument;
  claims: PaceClaim[];
  citations: PaceCitation[];
  entities: PaceResolvedEntity[];
  clarification?: PaceClarification;
  actions: PaceActionProposal[];
  trace: PacePublicTraceSummary;
  conversation: PaceConversationSummary;
}
```

Geen action parsing uit vrije modeltekst. Het model mag alleen action intents voorstellen uit een allow-list; de server valideert en verrijkt ze met capability, permissions, huidige state en risk policy.

### 6.6 Command gateway

Iedere uitvoerbare actie loopt door:

1. schema-validatie;
2. tenant- en actorresolutie;
3. rol/entitlement/module/featureflag-check;
4. huidige workflowstate-check;
5. policy- en riskclassificatie;
6. preview/dry run;
7. user confirmation of step-up;
8. idempotency-key;
9. bestaande domeinservice/RPC;
10. append-only audit met `initiatedBy=Pace`, actor, proposal, confirmation en resultaat;
11. resultaatverificatie;
12. undo/hersteloptie waar mogelijk.

### 6.7 Prompt-injection- en dataveiligheid

Records, productnamen, notities en externe integratiedata zijn onbetrouwbare data, geen instructies. De broker labelt bronnen en de modelprompt behandelt opgehaalde inhoud uitsluitend als evidence. Commands kunnen nooit door tekst in data worden geactiveerd. URL's, scripts, credentials en ongekende action types worden geweigerd.

---

## 7. “Breng mij direct naar de oplossing”

Dit is de beste eerstvolgende investering, nog vóór write-actions.

### 7.1 Typed destination model

Vervang generieke viewnavigatie door targets:

```ts
interface PaceDestination {
  view: MainView;
  subview?: string;
  record?: { type: string; id: string };
  filters?: Record<string, string | number | boolean>;
  focus?: string;
  highlight?: string;
  reason: string;
  expiresAt?: string;
}
```

### 7.2 UX bij een antwoord

Een antwoord kan maximaal één primaire en twee secundaire acties tonen:

- **Open oplossing** — exact doel met filter/focus;
- **Bekijk bewijs** — onderliggende records/periodedata;
- **Maak voorstel** — alleen als prepare-action bestaat.

Na navigatie blijft een compacte Pace-guidance rail zichtbaar met:

- waarom de gebruiker hier is;
- welk element gemarkeerd is;
- één volgende stap;
- “Terug naar antwoord”;
- “Klaar” of “Dit loste het niet op”.

### 7.3 Geen blinde deep links

Voor elk target wordt op het moment van openen opnieuw gecontroleerd:

- module zichtbaar;
- entitlement actief;
- rol toegestaan;
- record bestaat en hoort bij tenant;
- target is in deze appversie beschikbaar.

Anders toont Pace de exacte blocker en een toegestane alternatiefroute.

---

## 8. Pace nog intelligenter maken

### 8.1 Van vraagbeantwoording naar retail reasoning

De volgende intelligentielaag combineert vier soorten waarheid:

1. **Productwaarheid:** hoe PWAYMENT werkelijk werkt.
2. **Operationele waarheid:** actuele records, tellingen, sync en device-status.
3. **Beslissingscontext:** periode, doel, beperkingen, rol en winkelbeleid.
4. **Uitvoerbaarheid:** welke volgende stappen nu werkelijk beschikbaar zijn.

Een sterk antwoord is niet alleen “wat gebeurde er?”, maar:

```text
Observatie -> verklaring -> impact -> aanbevolen vervolgstap -> bewijs -> uitvoerbare knop
```

### 8.2 Nieuwe read-capabilities met hoge productwaarde

Prioriteit 1:

- checkout blockers en payment-provider status, mits echte providerintegratie;
- concrete sync/dead-letter recorddiagnose;
- return eligibility per transactie/regel;
- Z-report readiness en ontbrekende controles;
- voorraadbeschikbaarheid, reserveringen en open ontvangsten;
- product-/variantdatakwaliteit en identifierconflicten;
- entitlement/module/featureflag explanation;
- integratierun, deliverytimeline en foutclassificatie;
- actieve UI-validatiefouten.

Prioriteit 2:

- purchase order status, supplier lead time en ontvangstanomalieën;
- workforce coverage en onbehandelde verlofimpact;
- service-order SLA/wachtreden;
- webshop order exceptions en reservation conflicts;
- customer cohort/recency met privacyveilige aggregatie;
- margekwaliteit: percentage verkopen zonder kostprijs;
- anomaly detection met baseline, confidence en seasonality.

Prioriteit 3:

- multi-store vergelijkingen voor expliciet bevoegde owners;
- forecastscenario's met confidence bands;
- leverancier- en assortimentscenario's;
- natuurlijke taal naar een bewaarbaar dashboard of periodiek rapport;
- externe bronnen via afzonderlijk geautoriseerde integraties, met duidelijke provenance.

### 8.3 Proactive intelligence engine

Signalen worden geen losse if-statements maar gevalideerde events met:

- impact;
- urgency;
- confidence;
- actionability;
- role relevance;
- interruption cost;
- expiry;
- deduplication key;
- cooldown/frequency cap;
- evidence;
- recommended target/command.

De ranking kan beginnen als deterministische score. Pas nadat voldoende feedbackdata bestaat, kan een tenantveilige rankinglaag leren welke signalen waardevol zijn. Geen black-box personalisatie voor gevoelige beslissingen.

### 8.4 Geheugen

Splits geheugen op in:

- **turn memory:** huidige vraag en korte context;
- **investigation memory:** gekozen periode, entiteiten, filters, bewijs en conclusies;
- **user preference memory:** toon, detail, motion, proactiviteit;
- **store policy memory:** expliciet ingestelde regels, nooit afgeleid als feit;
- **no-memory zones:** PIN, credentials, gevoelige vrije notities en betaaldata.

De gebruiker krijgt “Wat onthoudt Pace?” en kan onderzoeken sluiten/verwijderen. Retentie is plan- en privacybeleid, niet onbeperkt.

---

## 9. Nieuwe visuele experience: Pace als levend operating system

### 9.1 Ontwerpdoel

Pace moet niet voelen als een side-panel met een geanimeerd logo. Het moet voelen alsof PWAYMENT zelf begrijpt wat er gebeurt. De identiteit blijft rustig, precies en premium—meer “instrument” dan “mascotte”.

### 9.2 Semantische state machine

Introduceer één centrale `PaceExperienceState`:

```ts
type PaceExperienceState =
  | "dormant" | "aware" | "listening" | "planning"
  | "resolving" | "retrieving" | "comparing" | "composing"
  | "verifying" | "ready" | "guiding" | "awaiting_confirmation"
  | "executing" | "completed" | "blocked" | "degraded" | "offline";
```

Elke state stuurt consistent:

- morph/glyph;
- rigbeweging;
- kleurtoon;
- panelchoreografie;
- statuscopy;
- geluid/haptic alleen indien toegestaan;
- ARIA-status;
- beschikbare interacties.

### 9.3 Uitbreiding van het morph- en motionvocabularium

Behoud het P-vormige merk als herkenbare basis. Voeg situationele, korte performances toe:

- **Listening pulse:** subtiele expansie rond de dot wanneer input actief is.
- **Source orbit:** 1–3 kleine gecontroleerde bronpunten die samenkomen wanneer echte read models terugkeren.
- **Compare split:** vorm deelt optisch in twee vlakken bij periode-/recordvergelijking.
- **Path/arrow:** een tijdelijke richtingsexpressie bij “Open oplossing”.
- **Shield lock:** rustige compactie bij permission/confirmatiestap.
- **Check settle:** één korte, tactiele afronding bij geverifieerd resultaat.
- **Blocked notch:** duidelijke maar niet alarmerende stopvorm bij een echte blocker.
- **Offline tether:** statische lokale toestand met zichtbare maar rustige pending-indicator.
- **Draft stack:** gelaagde vorm wanneer een concept klaarstaat.
- **Handoff:** morph van Pace naar het doelaccent in de geopende module.

Niet elke state hoeft een nieuw pictogram te worden. De masterpiece-kwaliteit komt uit timing, overgang en betekenis, niet uit zoveel mogelijk animaties.

### 9.4 Choreografie buiten het logo

- Bronnen verschijnen zodra ze werkelijk beschikbaar zijn, niet pas na het hele antwoord.
- Vergelijkingen groeien in als compacte datacards met dezelfde accentkleur als de bronorbit.
- Een actieknop “trekt” visueel een zachte route naar het UI-target; na klik gaat het accent mee naar de bestemmingshighlight.
- Bij confirmatie verandert het panel van antwoordmodus naar een vaste previewkaart—geen chatballon.
- Bij succes keert Pace terug naar compact formaat en blijft alleen resultaat/undo zichtbaar.
- Bij fout verandert niet het hele scherm rood; Pace benoemt oorzaak, behouden werk en herstelactie.

### 9.5 Motionregels

- idle animatie maximaal incidenteel; geen permanente 360°-rotaties als decoratie;
- functionele microtransities 120–240 ms;
- state-overgangen 240–480 ms;
- eenmalige expressive performance 700–1.800 ms;
- wachtanimatie mag loopen, maar zonder opvallende reset;
- geen layout shift en geen animatie die scan-/inputfocus steelt;
- full/subtle/off blijven bestaan;
- reduced motion toont state via vorm, kleur, tekst en progress, niet via rotatie/morph;
- animatiebudget testen op low-end kassa-hardware.

### 9.6 Emote-architectuur: expressie bovenop waarheid

“Emotes” worden geen verzameling willekeurige animatiebestanden en ook geen gesimuleerde menselijke emoties. Ze vormen een **versioned expression layer** bovenop de semantische state machine. De waarheidstoestand komt uitsluitend uit lokale UI-events en publieke serverevents; de expressielaag mag die toestand vertalen, maar nooit zelf bedenken.

```ts
type PaceTruthState = {
  phase: PaceExperienceState;
  progress?: { completed: number; total: number };
  sourceCount?: number;
  severity?: "neutral" | "positive" | "attention" | "critical";
  interaction: "none" | "cancel" | "choose" | "confirm" | "retry" | "undo";
  reasonCode?: string;
};

type PaceExpressionToken = {
  pose: "rest" | "focus" | "split" | "gather" | "shield" | "path" | "settle" | "notch" | "tether";
  energy: "still" | "low" | "medium";
  accent: "brand" | "information" | "success" | "warning" | "danger" | "offline";
  performance?: "acknowledge" | "source-arrival" | "handoff" | "completion" | "blocked";
};
```

De mapping `derivePaceExpression(truthState, motionPreference)` is zuiver, deterministisch en getest. Componenten mogen niet rechtstreeks op losse booleans zoals `isLoading` een animatie kiezen.

### 9.7 Technische lagen

1. **Truth/event layer:** request lifecycle, progress stream, connectivity, permissions, actionresultaat en gebruikerinteractie.
2. **Experience controller:** reduceert events tot één geldige `PaceTruthState`; bewaakt transities, prioriteit, minimum dwell en interruptregels.
3. **Expression mapper:** vertaalt de truth state naar vorm-, kleur-, energie- en performancetokens.
4. **Renderers:** `PaceMark`, panel, bronchips, copy, target highlight en optionele audio/haptic consumeren dezelfde tokens.
5. **Preference/accessibility adapter:** past `full`, `subtle`, `off` en `prefers-reduced-motion` toe zonder betekenis te verwijderen.
6. **Telemetry:** registreert state, performance-id, duur, dropped frames, cancellation en task outcome—nooit verborgen redeneerstappen.

Deze scheiding maakt web, customer display en toekomstige native/hardware-surfaces consistent zonder overal dezelfde animatie-implementatie te moeten kopiëren.

### 9.8 Transitiegates en prioriteit

- `critical/blocked` onderbreekt planning- of retrievalperformances onmiddellijk;
- `awaiting_confirmation` blijft stabiel en mag niet automatisch terugvallen naar idle;
- bronarrivals mogen een lopende input, scan of confirmatie nooit onderbreken;
- voltooiingsperformances spelen maximaal één keer per operationeel resultaat, ook na rerender of reconnect;
- korte tussenstappen worden samengevoegd zodat de vorm niet flikkert;
- stale of out-of-order serverevents worden genegeerd op basis van `turnId` en monotone eventsequence;
- bij streamverlies gaat Pace naar `degraded`, niet fictief naar `verifying` of `ready`;
- `off` behoudt tekst, kleurcontrast, ARIA-live en interactiestatus, maar verwijdert niet-essentiële beweging.

### 9.9 Asset- en kwaliteitscontract

Elke nieuwe performance krijgt een stabiele id, semantische aanleiding, toegestane begin/eindposes, maximumduur, interruptgedrag, reduced-motion variant en performancebudget. Nieuwe emotes worden pas toegelaten wanneer unit-transitietests, visuele regressies, toetsenbord/focuscontrole en een frame-budgetmeting op targethardware slagen.

Start met zes productiedragende performances—`acknowledge`, `source-arrival`, `compare`, `confirm`, `handoff` en `completion`—en breid pas uit wanneer telemetry aantoont dat gebruikers de toestand beter begrijpen. Zo ontstaat een herkenbare Pace-taal in plaats van een steeds groter maar onsamenhangend animatiepakket.

---

## 10. Een veel sterkere “Pace denkt”-ervaring

### 10.1 Wat vervangen moet worden

Verwijder de tijdgestuurde rotatie van drie generieke zinnen. Die suggereert kennis van backendvoortgang die de client niet heeft.

### 10.2 Public progress events, geen chain-of-thought

Gebruik SSE of een fetch-stream voor compacte, veilige events:

```ts
type PaceProgressEvent =
  | { type: "accepted" }
  | { type: "plan_ready"; mode: "knowledge" | "analytics" | "records" | "mixed" }
  | { type: "sources_selected"; labels: string[] }
  | { type: "source_ready"; label: string; freshness: string }
  | { type: "composing" }
  | { type: "verifying"; checks: string[] }
  | { type: "answer"; payload: PaceResponseV3 }
  | { type: "degraded"; reasonCode: string }
  | { type: "error"; recoverable: boolean; reasonCode: string };
```

Dit zijn publieke systeemstatussen, geen verborgen modelredenering.

### 10.3 Situationele copy

Copy wordt bepaald door echte plan/data-events:

| Werkelijke toestand | Voorbeeldcopy |
|---|---|
| Lokale kennis gevonden | “Ik controleer dit in de PWAYMENT-productkennis.” |
| Analyticsplannen actief | “Ik vergelijk omzet en transacties voor de gekozen periode.” |
| Recordlookup | “Ik zoek de toegestane winkelrecords.” |
| Meerdere bronnen | “2 van 3 bronnen zijn klaar.” |
| Entiteit ambigu | “Ik heb twee producten met deze naam gevonden.” + kandidaatknoppen |
| Geen live context toegestaan | “Ik antwoord zonder actuele winkelgegevens.” |
| Deterministisch antwoord | “Cijfers gecontroleerd. Ik maak het overzicht leesbaar.” |
| Provider traag | “De winkelgegevens zijn veilig opgehaald; de formulering duurt langer dan normaal.” |
| Fallback | “De AI-service reageert niet. Ik schakel over op lokale productkennis.” |

Gebruik 3–6 formuleringen per toestand om herhaling te verminderen, maar kies deterministisch/stabiel per turn zodat tekst niet nerveus wisselt.

### 10.4 Progressieve resultaten

Wacht niet altijd op prose. Zodra bewijs beschikbaar is:

- toon bronchips en freshness;
- toon een gevonden recordheader;
- toon periode en filters;
- toon datakwaliteitswaarschuwing;
- laat de gebruiker annuleren;
- bewaar verkregen bewijs wanneer alleen de laatste modelcompositie faalt.

### 10.5 Latencybudgets

- `<150 ms`: onmiddellijke lokale acknowledgement;
- `<500 ms`: plan/mode zichtbaar;
- `<1.500 ms`: eerste bron of deterministisch antwoord;
- `1.500–5.000 ms`: normale samengestelde analyse;
- `>5.000 ms`: concrete voortgang + annuleren;
- `>10.000 ms`: “duurt langer” met reeds gevonden bewijs;
- harde deadline per bron en totale turn; fallback behoudt partial evidence.

---

## 11. Nieuwe panel- en antwoordarchitectuur

### 11.1 Drie modi

1. **Pulse:** gesloten/compact; toont alleen relevante status of één signaal.
2. **Guide:** smalle contextuele rail naast de actieve workflow.
3. **Investigate:** ruimer onderzoeksscherm voor gesprek, vergelijking, bewijs en actiepreview.

Het huidige zijpaneel kan Pulse/Guide bedienen. Complexe analytics horen niet in een smalle kaart; Investigate krijgt voldoende breedte en kan split-view gebruiken zonder de POS-flow te blokkeren.

### 11.2 Antwoorddocumenten, geen platte tekst

Ondersteun gevalideerde blokken:

- summary;
- key metric;
- comparison;
- ranked list;
- record card;
- warning/blocker;
- steps;
- evidence;
- action proposal;
- limitation;
- follow-up chips.

Modeloutput wordt naar dit beperkte schema gevalideerd. Onbekende blokken vallen veilig terug naar tekst.

### 11.3 Clarification UX

Wanneer entiteiten ambigu zijn:

- toon echte kandidaatcards met naam, variant, SKU en relevante veilige context;
- één klik vervolgt dezelfde serverturn;
- “Geen van deze” laat de gebruiker verfijnen;
- kandidaat-ID's blijven server-authoritatief;
- geen vrije modelkeuze namens de gebruiker.

### 11.4 Conversation UX

- toon echte turnhistoriek, niet alleen het laatste antwoord;
- behoud per turn bronnen, acties, mode en actualiteit;
- markeer oudere feiten als stale wanneer de onderliggende data veranderlijk is;
- “Ververs met actuele gegevens” maakt een nieuwe turn;
- heropenen herstelt de originele responsemetadata;
- onderzoek kan worden hernoemd, gesloten, verwijderd of naar een rapport worden omgezet.

---

## 12. Implementatieroadmap

### Fase 0 — Contractcorrectheid en observability (1–2 sprints)

**Doel:** huidige Pace aantoonbaar correct maken vóór uitbreiding.

- responseobject niet langer blind combineren met lokale action/steps;
- clarification candidates en entities renderen;
- historische source/citations/answermetadata bewaren en rehydrateren;
- headerstatus laten overeenkomen met AI/live/local mode;
- analytics record-source inconsistentie corrigeren;
- traces voor planning, RPC-latency, provider-latency, fallback en action clicks;
- e2e-tests voor AI uit, live context uit, fallback, ambiguity, quota en heropenen.

**Exitcriterium:** elke zichtbare actie hoort aantoonbaar bij het getoonde antwoord en elke mode/source-label klopt.

### Fase 1 — Real progress & experience state machine (2–3 sprints)

**Doel:** de repetitieve wachtstatus vervangen door echte voortgang.

- centrale experience state machine;
- truth-state reducer, expression-token mapper en afzonderlijke renderers;
- progress streaming;
- publieke fase-events;
- situationele copycatalogus;
- cancel/timeout/partial evidence;
- bronchips progressief tonen;
- reduced-motion equivalent;
- eerste choreografie voor listening, retrieval, compare, verify, ready en degraded.
- transitietests, visuele regressies en frame-budgetmeting op targethardware.

**Exitcriterium:** geen tijdgestuurde fake statuscopy; iedere status is door een echte event/state gedreven.

### Fase 2 — Universal “Open oplossing” (2–4 sprints)

**Doel:** Pace kan op elke kernwerkruimte exact navigeren en focus aanbrengen.

- capability registry v1;
- typed destinations;
- view/subview/record/filter/focus/highlight;
- permission/entitlement validation;
- guidance rail en return-to-answer;
- targets voor POS, Historiek/retour, Dagafsluiting, Catalogus, Voorraad, Sync en Instellingen.

**Exitcriterium:** minstens 90% van de top-how-to/blockervragen eindigt in een geldige, specifieke destination of een expliciete reden waarom die niet beschikbaar is.

### Fase 3 — Structured answers & evidence graph (3–4 sprints)

**Doel:** antwoorden worden interactieve retailobjecten.

- response v3;
- gevalideerde answer blocks;
- claims gekoppeld aan evidence;
- datakwaliteit en freshness;
- echte conversation rehydration;
- Investigate-mode voor vergelijkingen en recordonderzoek.

**Exitcriterium:** cijfers/claims zijn inspecteerbaar en complexe antwoorden blijven zonder vrije markdown consistent renderen.

### Fase 4 — Prepare actions (3–5 sprints)

**Doel:** Pace maakt gecontroleerde concepten, zonder zelf te finaliseren.

- action proposal contract;
- dry-run/preview service;
- concept-PO;
- voorbereide telling;
- voorbereide retourselectie;
- opgeslagen filter/dashboard;
- sync recovery target;
- action provenance en audit.

**Exitcriterium:** alle prepare-actions zijn herhaalbaar, permission-safe en veroorzaken geen definitieve domeinmutatie.

### Fase 5 — Reversible execution (4–6 sprints)

**Doel:** lage-risicoacties gecontroleerd uitvoeren.

- command gateway;
- idempotency;
- confirmation receipts;
- undo/herstel;
- audit UI;
- actions: inzichtstatus, snooze, taak/draft, intern label en andere expliciet geclassificeerde commando's.

**Exitcriterium:** zero unauthorized execution in security tests; elke actie heeft actor, intent, preview, bevestiging en resultaat.

### Fase 6 — Proactive retail operating system (doorlopend)

**Doel:** Pace detecteert relevante situaties vóór de gebruiker zoekt.

- event-driven signal engine;
- interruption budget;
- teamdeduplicatie;
- rolrelevantie;
- confidence en impact;
- feedbackloop;
- anomaly detection;
- periodieke briefs en optionele managementdigest.

**Exitcriterium:** meetbare operationele tijdswinst zonder stijging in dismissals, foutacties of kassavertraging.

---

## 13. Prioritized backlog

### P0 — eerst

- response/action mismatch verwijderen;
- clarification UI activeren;
- source/provenance bij history herstellen;
- real-mode header;
- progress eventcontract en state machine;
- typed destination foundation;
- analytics/recordlabels en foutcodes opschonen;
- observability dashboards;
- veiligheids- en latencytests.

### P1 — grootste zichtbare sprong

- nieuwe thinking experience;
- destination targets voor alle kernflows;
- guidance rail;
- structured answer cards;
- evidence inspector;
- richer conversation timeline;
- morphs voor retrieval/compare/confirm/success/blocked;
- investigate split-view;
- prepare-action preview.

### P2 — echte agency

- command gateway;
- reversible actions;
- undo;
- capability manifests per module;
- event-driven proactivity;
- draft PO/count/return;
- policy center voor store owner;
- team- en devicecontext.

### P3 — frontier

- multi-store intelligence;
- scenario planning en forecast bands;
- geautoriseerde externe tool connectors;
- voice als hands-free query/input, nooit als stille bevestiging van financiële acties;
- multimodale intake van leveranciersdocumenten met preview/validatie;
- autonome achtergrondanalyse die alleen voorstellen/signalen creëert, geen beschermde transacties uitvoert.

---

## 14. Metrics die kwaliteit bewijzen

### Betrouwbaarheid

- grounded claim rate;
- factual error/contradiction rate;
- stale-context disclosure rate;
- action-to-answer consistency;
- permission-denial correctness;
- fallback success rate;
- duplicate command rate: doel 0.

### Productwaarde

- time-to-resolution;
- destination success rate;
- prepare-action acceptance rate;
- completed workflow after Pace guidance;
- supportdeflection met correcte oplossing;
- terugkerend gebruik per rol, niet alleen aantal vragen.

### Rust en UX

- dismissal/snooze rate per signaal;
- interruption rate tijdens checkout;
- reduced-motion compliance;
- animation frame budget op targethardware;
- percentage turns met eerste nuttige feedback binnen 1,5 seconde;
- abandonment tijdens thinking.

### Veiligheid

- unauthorized action attempts;
- confirmations bypassed: doel 0;
- PII leakage tests;
- cross-tenant access tests;
- prompt-injection resistance;
- audit completeness;
- undo success rate.

---

## 15. Test- en releasebeleid

### 15.1 Golden task suite

Bouw per hoofdwerkruimte een versieerbare set van realistische taken met:

- vraagvarianten en typefouten;
- rol/store/plan combinaties;
- online/offline/stale data;
- ambiguë entiteiten;
- ontbrekende records;
- exacte verwachte claims, bronnen, target, action risk en limitation.

### 15.2 Action safety tests

Voor ieder command:

- schema fuzzing;
- tenant escape;
- stale preview;
- role downgrade tussen preview en execute;
- dubbelklik/retry;
- netwerkverlies na submit;
- partial failure;
- audit failure;
- undo;
- malicious record content.

### 15.3 Visual QA

- screenshotmatrix voor alle experience states;
- full/subtle/off/reduced motion;
- desktop/tablet/smalle viewport;
- licht/donker indien ondersteund;
- lange Nederlandse tekst en toekomstige talen;
- low-end GPU/CPU-profiel;
- axe en toetsenbordflow;
- geen focusverlies bij scanner/POS.

### 15.4 Release gates

- nieuwe read capability begint intern/read-only;
- action eerst shadow proposal: wel genereren/loggen, niet tonen;
- daarna staff/beta met prepare-only;
- execution per command afzonderlijk activeren via server-side flag;
- kill switch per capability en per store;
- rollback vereist geen clientrelease.

---

## 16. Concrete eerste architectuurbeslissingen

1. Behoud lokale productkennis als betrouwbare fallback.
2. Behoud Supabase/RLS en bounded RPC's als datagrens.
3. Geen generieke database- of browsercontroltool aan het model geven.
4. Bouw eerst typed destinations; dit levert direct waarde zonder mutatierisico.
5. Maak action proposals server-authoritatief en los van vrije antwoordtekst.
6. Gebruik echte progress events; toon nooit interne reasoning.
7. Sla volledige responsemetadata per turn op, niet alleen antwoordtekst.
8. Maak Pace-capabilitydekking een definition-of-done voor nieuwe productfeatures.
9. Bescherm checkout met een expliciete interruption policy.
10. Behandel visuele expressie als semantische producttaal met performancebudget, niet als decoratieve animatiebibliotheek.

---

## 17. Eindbeeld

Een winkelmedewerker vraagt:

> “Waarom kan ik deze retour niet afronden?”

Pace reageert niet met een algemeen stappenplan en ook niet met een mysterieuze spinner. Binnen een fractie van een seconde toont hij dat hij de actieve retourflow ziet. Vervolgens:

1. resolveert hij de actieve transactie onder dezelfde tenant- en rolregels;
2. leest hij de return-eligibility en huidige validatiecode;
3. toont hij: “De retourreden ontbreekt voor regel 2; de overige regels zijn geldig”;
4. koppelt die claim aan de transactie en UI-validatie als bewijs;
5. biedt **Open ontbrekende reden** aan;
6. brengt de gebruiker naar exact het veld en highlight het rustig;
7. blijft in Guide-mode zichtbaar;
8. laat de medewerker zelf reden, bestemming en refund bevestigen;
9. meldt pas succes nadat de bestaande retourservice de transactie en audit heeft bevestigd.

Dat is de kern van de toekomstige masterpiece: niet de meest menselijke chatbot, maar het meest competente, transparante en veilige retailinstrument—met een visuele identiteit die exact laat voelen wat het systeem werkelijk doet.
