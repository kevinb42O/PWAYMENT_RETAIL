# PACE — servergebonden conversation state, entity resolution en evidence tracking

> **Doelarchitectuur.** Dit document beschrijft de volgende Pace-fase en mag
> niet als bewijs worden gelezen dat alle genoemde conversation-state-, entity-
> en evidencefuncties live staan. Gebruik
> [`PROJECT-CONTEXT.md`](PROJECT-CONTEXT.md) voor de actuele algemene status.

## 1. Uitkomst

PACE evolueert van een losse vraag-antwoordfunctie naar een doorlopend, controleerbaar retailonderzoek. Een gebruiker kan in Verkoop starten met “Welke producten lopen achter?”, in Voorraad vragen “Hoeveel hebben we daarvan nog?” en in Inzichten vervolgen met “Vergelijk ze met vorige maand”, zonder het onderwerp opnieuw uit te leggen.

Daarvoor worden drie capabilities samen ingevoerd:

1. **Servergebonden conversation state** bewaart de thread, samenvatting, actieve onderwerpen en beurtvolgorde buiten de browser.
2. **Entity resolution** vertaalt “die sneaker”, “de tweede”, “dat filiaal” of “dezelfde klanten” naar tenantveilige canonieke records.
3. **Evidence tracking** legt per antwoord vast welke actuele records, aggregaties en productkennis de uitspraken dragen.

De browser levert vanaf dan geen autoritatieve `history` meer aan. Hij stuurt alleen de nieuwe vraag, een conversation-ID, een idempotency-ID en actuele UI-context. De server laadt en actualiseert de rest.

## 2. Scope en harde grenzen

### In v1

- Een gesprek is privé voor één gebruiker en gebonden aan één `store_id`.
- Het gesprek blijft bestaan bij navigatie tussen PWAYMENT-werkruimtes en na refresh of aanmelden op een ander toestel.
- Een winkelwissel opent of maakt een aparte thread voor die winkel; state lekt nooit naar een andere tenant.
- Maximaal één beurt per gesprek wordt tegelijk verwerkt. Dubbele submits zijn idempotent.
- PACE bewaart compacte state en bewijs, niet onbeperkt iedere ruwe toolpayload.
- Iedere toolcall controleert de actuele store membership en rol opnieuw. Oude conversation state verleent nooit toegang.
- PACE kan een entiteit automatisch oplossen, om verduidelijking vragen of expliciet melden dat ze niet meer toegankelijk/bestaand is.
- Antwoorden tonen compacte, begrijpelijke bronverwijzingen en freshness.
- De bestaande read-only veiligheidsgrens blijft gelden; conversation state autoriseert geen mutaties.

### Niet in v1

- Gedeelde teamthreads, mentions en gelijktijdig samenwerken.
- Een gesprek dat data uit meerdere winkels combineert.
- Vector search over vrije klantnotities of volledige bonregels.
- Automatische mutaties op basis van een vorige toestemming.
- Een algemene knowledge graph van alle retaildata.
- Onbeperkte transcriptretentie of training op winkelgesprekken.

## 3. Productcontract

### 3.1 Threadgedrag

PACE toont per winkel minimaal:

- het laatst actieve gesprek;
- “Nieuw onderzoek”;
- een compacte lijst recente gesprekken met titel, laatste activiteit en werkruimte;
- “Gesprek sluiten” en “Gesprek verwijderen”.

Terugkeren naar het PACE-overzicht verbergt een gesprek, maar wist het niet. “Nieuw onderzoek” maakt bewust een schone context. Bij winkelwissel wordt de huidige thread losgelaten en de meest recente thread van de nieuwe winkel geladen.

Een gesprekstitel wordt na de eerste succesvolle beurt deterministisch uit onderwerp en periode gevormd, bijvoorbeeld `Trage sneakers · laatste 30 dagen`. Een model mag een kandidaat-titel voorstellen, maar de server valideert lengte en inhoud.

### 3.2 Verwijzingen die minimaal moeten werken

| Vervolgzin | Vereiste interpretatie |
| --- | --- |
| “Hoeveel hebben we daarvan?” | laatst besproken product of productset + actuele voorraad |
| “En vorige maand?” | zelfde measure, filters en entities; periode vervangen |
| “Vergelijk de eerste twee” | rangpositie uit het vorige resultaat naar twee canonieke refs |
| “Open die klant” | laatst eenduidig genoemde klant; navigatie blijft rechtensafe |
| “Waarom is dat lager?” | laatst beantwoorde metric en vergelijking behouden |
| “Nee, ik bedoel de blauwe” | vorige ambiguïteit herresolven met nieuwe qualifier |
| “Doe hetzelfde voor jassen” | queryframe behouden, entityfilter vervangen |

### 3.3 Transparantie

Een antwoord bevat waar relevant:

- een freshness-label zoals `Actueel om 14:32` of `Periode 1–31 juli`;
- bronchips zoals `Verkopen`, `Voorraad per locatie`, `Productcatalogus`;
- een uitklapbare bronweergave met berekeningsbasis en datakwaliteit;
- een waarschuwing wanneer de onderliggende data sinds een vorige beurt gewijzigd kan zijn;
- een verduidelijkingsvraag in plaats van een zelfverzekerde gok bij ambiguïteit.

Interne tabelnamen, UUID's, SQL, tenant-ID's en toolnamen worden niet letterlijk in de UI getoond.

## 4. Architectuur

```text
PaceAssistant
  -> POST /api/pace/respond
       1. authenticatie + requestvalidatie
       2. conversation laden/aanmaken + turn reserveren
       3. compacte state laden
       4. vraagframe plannen
       5. mentions tenant-safe resolven
       6. allow-listed read tools uitvoeren
       7. evidence bundle normaliseren en vastleggen
       8. antwoord deterministisch renderen of met model componeren
       9. citations valideren
      10. turn + state atomair finaliseren
  <- answer + conversation + entities + citations + revision
```

Supabase blijft de autoritatieve state store. De Vercel/API-functie is stateless en gebruikt uitsluitend user-JWT-gebonden, `security definer` RPC's die intern `auth.uid()`, actieve membership en rol controleren. Er komt geen service-role key in de requestflow.

## 5. Datamodel

Nieuwe migratie: `supabase/migrations/<timestamp>_pace_conversation_state.sql`.

### 5.1 `pace_conversations`

| Kolom | Type | Betekenis |
| --- | --- | --- |
| `id` | `uuid` | Publieke conversation-ID |
| `store_id` | `uuid` | Harde tenantscope |
| `owner_user_id` | `uuid` | Privé-eigenaar in v1 |
| `title` | `text` | Veilige, korte titel |
| `status` | enum/text | `active`, `closed`, `deleted` |
| `revision` | `bigint` | Optimistic concurrency token |
| `next_turn_sequence` | `integer` | Monotone beurtvolgorde |
| `active_view` | `text` | Laatste PWAYMENT-werkruimte |
| `state_json` | `jsonb` | Gevalideerde compacte query-/discourse-state |
| `summary` | `text` | Redigeerde server-samenvatting voor het model |
| `last_turn_at` | `timestamptz` | Sortering en lifecycle |
| `expires_at` | `timestamptz` | Retentiegrens |
| timestamps | `timestamptz` | Auditbare lifecycle |

`state_json` krijgt een expliciete schema-versie en bevat alleen:

```ts
interface PaceConversationStateV1 {
  version: 1;
  language: "nl" | "fr" | "en";
  lastIntent: PaceQuestionPlan["intent"] | null;
  lastQueryFrame: PaceResolvedQueryFrame | null;
  focusEntityIds: string[];       // refs naar pace_conversation_entities
  lastResultSet: Array<{ entityId: string; rank: number }>;
  unresolvedMention: PacePendingClarification | null;
  lastEvidenceIds: string[];
}
```

Er worden geen rechten, membershipclaims of volledige toolresultaten in `state_json` gecachet.

### 5.2 `pace_turns`

| Kolom | Type | Betekenis |
| --- | --- | --- |
| `id` | `uuid` | Server turn-ID |
| `conversation_id`, `store_id` | `uuid` | Thread- en tenantscope |
| `sequence` | `integer` | Stabiele volgorde |
| `client_turn_id` | `uuid` | Idempotency key van de browser |
| `user_id` | `uuid` | Actor op het moment van de beurt |
| `question_text` | `text` | Begrensde gebruikersvraag |
| `answer_text` | `text` | Finale zichtbare tekst |
| `status` | text | `processing`, `completed`, `failed`, `clarification` |
| `view` | text | Werkruimte waarin de vraag begon |
| `plan_json` | `jsonb` | Gevalideerd plannerframe, zonder modelvrijheid |
| `model_metadata` | `jsonb` | Provider/model/tokens/latency; geen promptdump |
| `quota_log_id` | `uuid` | Exact één gekoppelde quotareservatie |
| `failure_code` | `text` | Veilige interne foutklasse |
| timestamps | `timestamptz` | Start/finalisatie |

Eén row vertegenwoordigt één volledige user/assistant-exchange. Uniek: `(conversation_id, client_turn_id)` en `(conversation_id, sequence)`. Een retry retourneert de bestaande afgeronde beurt of de bestaande processing-status en consumeert geen tweede quota-eenheid.

### 5.3 `pace_conversation_entities`

Dit is de discourse-laag, niet een kopie van domeintabellen.

| Kolom | Type | Betekenis |
| --- | --- | --- |
| `id` | `uuid` | Conversation-local entity-ID |
| `conversation_id`, `store_id` | `uuid` | Scope |
| `entity_type` | enum/text | Allow-list uit records/planner |
| `canonical_id` | `uuid/text` | ID in de brontabel, nooit door het model bedacht |
| `safe_label` | `text` | Gemaskeerde/rolgeschikte displaynaam |
| `aliases` | `text[]` | Alleen veilige termen uit de conversatie |
| `resolution_state` | text | `resolved`, `ambiguous`, `stale`, `inaccessible` |
| `confidence` | numeric | Resolverconfidence, niet modelconfidence alleen |
| `first_turn_sequence`, `last_turn_sequence` | integer | Recency |
| `attributes_json` | `jsonb` | Minimale disambiguatievelden zoals kleur/SKU-fragment |

Uniek: `(conversation_id, entity_type, canonical_id)`. Voor gevoelige types wordt `safe_label` gemaskeerd en worden geen e-mail, telefoon, adres, notities of volledige giftcardcodes bewaard.

### 5.4 `pace_entity_mentions`

Legt uit welke tekst naar welke entity werd vertaald:

- `turn_id`, `mention_text`, `mention_start`, `mention_end`;
- `entity_type_hint`;
- `conversation_entity_id` nullable;
- `resolution_method`: `explicit_ui`, `exact_identifier`, `exact_label`, `prior_focus`, `rank_reference`, `bounded_fuzzy`, `clarified`;
- `confidence`, `candidate_count`, `status`.

Deze tabel maakt resolverfouten meetbaar zonder ruwe prompts in telemetry te kopiëren.

### 5.5 `pace_evidence_items` en `pace_turn_evidence`

Een evidence item is een begrensde snapshot van de basis van één of meer claims:

```ts
interface PaceEvidenceItemV1 {
  version: 1;
  sourceKind: "record" | "aggregate" | "product_knowledge" | "ui_context";
  sourceName: string;              // server allow-list
  observedAt: string;
  period?: { start: string; endExclusive: string };
  basis: string;
  entityRefs: string[];            // conversation entity IDs
  facts: Array<{ key: string; value: string | number | boolean | null; unit?: string }>;
  dataQuality?: Record<string, number | boolean | string>;
  payloadDigest: string;           // SHA-256 over canonical normalized evidence
}
```

`pace_evidence_items` bevat `conversation_id`, `store_id`, `turn_id`, de velden hierboven en een begrensde `facts_json`. `pace_turn_evidence` koppelt een answer claim/citation aan een evidence item en bewaart `citation_key` (`E1`, `E2`), `claim_index` en `relation` (`supports`, `qualifies`).

Geen volledige read-toolpayload, SQL, modelprompt of verborgen recordvelden worden opgeslagen. Voor een recordbewijs wordt alleen het gebruikte allow-listed feitenfragment bewaard. Evidence is historisch: een later gewijzigd product overschrijft het bewijs van een oud antwoord niet.

## 6. Server-RPC's en API-contract

### 6.1 Conversation-RPC's

Alle functies controleren `auth.uid()`, actieve `store_memberships`, `store_id` en ownership:

- `start_pace_conversation(target_store_id, initial_view)`
- `list_pace_conversations(target_store_id, page_cursor, page_size)`
- `get_pace_conversation(target_conversation_id, after_sequence)`
- `begin_pace_turn_and_reserve_credit(target_conversation_id, client_turn_id, expected_revision, question, view)`
- `complete_pace_turn(target_turn_id, expected_revision, answer, state_patch, entities, evidence, metadata)`
- `fail_pace_turn(target_turn_id, failure_code)`
- `close_pace_conversation(target_conversation_id)`
- `delete_pace_conversation(target_conversation_id)`

`begin_pace_turn_and_reserve_credit` neemt een row lock, reserveert sequence/revision én quota in dezelfde databasetransactie en is de enige ingang om state voor verwerking te lezen. De bestaande logica uit `check_and_consume_pace_credit` wordt daarvoor naar één private helper verplaatst. De unieke sleutel voor quota wordt `(store_id, user_id, conversation_id, client_turn_id)`; alleen een nieuwe turn kan verbruik verhogen. Een retry krijgt de bestaande turn en `pace_logs.id` terug.

`complete_pace_turn` valideert JSON-versies, maximumgroottes, entitytypes en evidencebronnen voordat één transactie turn, entities, evidence, summary, quota-logfinalisatie en nieuwe revision vastlegt. Bij upstreamfalen finaliseert `fail_pace_turn` zowel turn als quota-log volgens het bestaande facturatiebeleid; hij maakt nooit een nieuwe reservatie.

De API mag dus nooit losse inserts in deze tabellen doen.

### 6.2 Nieuw requestcontract

```ts
interface PaceRespondRequestV2 {
  version: 2;
  conversationId?: string;        // weglaten = nieuwe thread
  clientTurnId: string;           // UUID, stabiel over retries
  expectedRevision?: number;
  question: string;
  context: SafePaceUiContext;
  localCandidate?: SafeLocalCandidate;
}
```

`history` verdwijnt uit v2. Tijdens de overgang accepteert de endpoint v1 nog, maar gebruikt clienthistoriek nooit als vertrouwde state.

```ts
interface PaceRespondResponseV2 {
  version: 2;
  conversation: { id: string; revision: number; title: string; turnSequence: number };
  answer: string;
  source: "gemini" | "openai" | "analytics" | "records" | "local";
  entities: Array<{ id: string; type: string; label: string; state: string }>;
  citations: Array<{
    key: string;
    label: string;
    sourceKind: string;
    observedAt: string;
    freshness: "live" | "period" | "general" | "stale";
  }>;
  clarification?: { prompt: string; candidates: Array<{ entityId: string; label: string }> };
  quota?: PaceQuotaSnapshot;
}
```

Conflictgedrag:

- `409 CONVERSATION_REVISION_CONFLICT`: client haalt turns sinds eigen revision op en probeert alleen een nog niet verwerkte vraag opnieuw.
- `409 TURN_IN_PROGRESS`: dezelfde `clientTurnId` is bezig; UI pollt kort of toont “PACE werkt hier al aan”.
- `410 CONVERSATION_CLOSED`: start expliciet een nieuwe thread.
- `403 STORE_ACCESS_DENIED`: lokale fallback mag geen opgeslagen winkelstate tonen.

## 7. Entity-resolutionpipeline

### 7.1 Planneroutput uitbreiden

De planner levert geen canonieke ID's. Hij produceert een strikt gevalideerd frame:

```ts
interface PaceEntityMentionPlan {
  text: string;
  expectedTypes: PaceEntityType[];
  qualifiers: Record<string, string>;
  reference: "explicit" | "pronoun" | "rank" | "same_set";
  rank?: number;
}
```

`PaceQuestionPlan` krijgt daarnaast een `continuation`-blok met herbruikbare onderdelen uit `lastQueryFrame`: measure, dimension, period, filters en vergelijking. Servercode bepaalt welke velden de nieuwe vraag werkelijk overschrijft.

### 7.2 Resolvevolgorde

1. **Expliciete UI-ref**: een veilig geselecteerd record uit de actieve pagina wint, mits de server het record opnieuw mag lezen.
2. **Conversation focus**: voornaamwoorden en “dezelfde” worden tegen recente, typecompatibele focusentities gelegd.
3. **Resultaatpositie**: “de tweede” gebruikt de bewaarde rangorde van het vorige begrensde resultaat.
4. **Exact identifier**: SKU, bonnummer of andere typegebonden identifier via een specifieke tenant-RPC.
5. **Exacte genormaliseerde labelmatch** binnen het verwachte type.
6. **Begrensde fuzzy candidates** via vaste SQL-functies en geïndexeerde velden; nooit vrije tabelkeuze door een model.
7. **Clarify of unresolved** volgens de thresholds hieronder.

Iedere canonieke ref wordt vóór een nieuwe toolcall opnieuw gecontroleerd. Een opgeslagen UUID is een geheugensteun, geen autorisatiebewijs.

### 7.3 Confidence- en ambiguïteitsregels

- Automatisch resolved: één geldige kandidaat met sterke exacte/contextmatch en confidence `>= 0.90`.
- Verduidelijken: meerdere plausibele kandidaten, een top-two marge `< 0.12`, of confidence `0.60–0.89`.
- Unresolved: confidence `< 0.60` of geen toegankelijke kandidaten.
- Voor mutatie-navigatie of gevoelige personenrecords is een expliciete keuze vereist zodra er meer dan één kandidaat is, ongeacht score.
- Modelconfidence kan kandidaten ordenen, maar mag nooit alleen de `resolved` status bepalen.

Maximaal vijf veilige kandidaten gaan naar de UI. Cashiers krijgen alleen kandidaten die hun bestaande rolprojectie toelaat.

### 7.4 Resolvergateway

Breid de huidige recordgateway niet uit tot generieke SQL. Voeg een enumgestuurde RPC toe, bijvoorbeeld `resolve_pace_entities(target_store_id, resolution_requests jsonb)`, met per type vaste zoekvelden, limieten en rolprojecties. Hergebruik waar mogelijk de entiteiten uit `PaceRecordEntity`; voeg pas een type toe met eigen security- en maskingtests.

## 8. Evidencepipeline

### 8.1 Evidence bij de bron maken

Elke PACE read-RPC retourneert naast data een uniforme envelope:

```json
{
  "version": 2,
  "data": {},
  "evidence": {
    "sourceName": "sales.analytics",
    "observedAt": "...",
    "period": {},
    "basis": "...",
    "dataQuality": {},
    "entityRefs": []
  }
}
```

De bestaande `generatedAt`, `basis`, `period` en `dataQuality` in de analytics/read-tool RPC's vormen hiervoor al een goede basis. Recordgatewayresultaten krijgen dezelfde metadata plus veilige recordrefs.

### 8.2 Normaliseren en citeren

De API:

1. haalt alleen allow-listed feiten uit ieder resultaat;
2. zet die in een canonieke volgorde;
3. berekent een digest;
4. kent lokale keys `E1..En` toe;
5. bewaart het evidence item vóór of atomair met het finale antwoord;
6. geeft het model uitsluitend deze evidence bundle;
7. vereist citation keys bij iedere concrete winkelclaim;
8. verwerpt onbekende keys en antwoorden met ongefundeerde cijfers.

Deterministische analytics- en recordantwoorden koppelen citations rechtstreeks in code. Voor modelcompositie wordt structured output gebruikt:

```ts
interface PaceComposedAnswer {
  paragraphs: Array<{ text: string; evidenceKeys: string[] }>;
  followUps: string[];
}
```

Als validatie faalt, volgt één bounded repairpoging. Daarna geeft PACE een deterministisch feitenantwoord of meldt exact welke conclusie niet veilig kon worden onderbouwd.

### 8.3 Freshness

- `live`: actuele toestand gelezen tijdens deze beurt;
- `period`: afgesloten of expliciet afgebakende analyseperiode;
- `general`: versiegebonden productkennis;
- `stale`: een eerder bewijs dat bewust niet opnieuw kon worden gelezen.

Een vervolgvraag gebruikt oude evidence alleen om het onderwerp te begrijpen. Voor woorden als “nu”, “nog”, “vandaag”, voorraad, status en openstaande records wordt de relevante bron altijd opnieuw gelezen.

## 9. Prompt- en contextstrategie

De modelcontext wordt opgebouwd uit:

1. vaste PACE-instructies en relevante productkennis;
2. een servergemaakte, PII-geredigeerde conversation summary;
3. maximaal de laatste vier server-opgeslagen exchanges;
4. het gevalideerde queryframe en resolved entities met veilige labels;
5. de evidence bundle van de huidige beurt;
6. actuele allow-listed UI-context.

Niet meesturen:

- door de client aangeleverde oude assistanttekst;
- volledige transcriptgeschiedenis;
- recordvelden die niet voor de vraag nodig zijn;
- eerdere toolpayloads wanneer alleen de entityref/queryframe nodig is;
- interne membership-, tenant- of foutredenen.

Samenvatten gebeurt na een configureerbare grens, bijvoorbeeld acht exchanges of 8.000 tekens. De summary is afleidbare cache: bij schemawijziging kan hij uit turns opnieuw worden opgebouwd.

## 10. Privacy, security en lifecycle

- RLS weigert directe toegang; alleen de beperkte RPC's krijgen execute voor `authenticated`.
- Alle tabellen dragen `store_id` zodat policies, joins en incidentonderzoek nooit alleen op een indirecte relation hoeven vertrouwen.
- De conversation owner moet ook nu een actieve store member zijn; voormalig lidmaatschap maakt threads direct ontoegankelijk.
- `liveStoreContext = false` betekent: geen nieuwe winkeltoolcalls en geen replay van eerder opgeslagen winkelfacts naar het model. PACE mag de threadtitel en algemene productcontext behouden, maar zet focusentities/evidence voor modelgebruik op slot.
- Vraag- en antwoordtekst krijgen harde bytegrenzen. JSON-velden hebben schema-, array- en tekstlimieten in de RPC.
- Loggen bevat IDs, status, latencies en foutcodes, geen vraagtekst of evidencefacts.
- Verwijderen is soft-delete voor een korte herstelperiode en daarna hard-delete via scheduled cleanup; evidence en mentions cascaderen mee.
- Voorgestelde standaardretentie voor v1: 30 dagen na laatste activiteit, met een expliciete product/privacybeslissing vóór release. Geen plan-afhankelijke langere retentie zonder bijgewerkte privacycopy.
- Data-export en hard delete per gebruiker/winkel worden vóór algemene beschikbaarheid getest.

## 11. Frontendwijzigingen

### `src/pace/paceAi.ts`

- Vervang `history` door `conversationId`, `clientTurnId` en `expectedRevision`.
- Valideer het v2-responsecontract.
- Geef entities, citations en conversationmetadata terug.
- Bewaar een stabiele `clientTurnId` zolang dezelfde submit wordt herprobeerd.

### `src/pace/PaceAssistant.tsx`

- Vervang de lokale `conversation`-array als bron van waarheid door gehydrateerde serverturns.
- Houd alleen optimistic UI state lokaal.
- Reset niet meer bij viewwijziging; update de server met de nieuwe view bij de volgende beurt.
- Bij `storeId`-wijziging: annuleer inflight, wis zichtbare oude tenantdata, laad de laatste thread voor de nieuwe winkel.
- Voeg nieuw gesprek, recente gesprekken, bronchips, freshness en disambiguatiekeuzes toe.
- Toon een expliciete herstelflow voor revision conflicts en mislukte processing turns.

### Nieuwe modules

```text
src/pace/conversation/
  types.ts
  api.ts
  reducer.ts
  citations.ts
  entityLabels.ts

api/pace/
  conversationState.ts
  entityResolution.ts
  evidence.ts
```

De servermodules blijven pure, unit-testbare functies; `respond.ts` orkestreert ze en wordt niet verder één monolithisch bestand.

## 12. Observability en kwaliteitsmetingen

Zonder inhoud te loggen meten we:

- conversation starts, resumes, closes en deletes;
- succesvolle vervolgvragen zonder herformulering;
- resolve-method en resolve/clarify/unresolved-ratio per entitytype;
- correcties na een resolverkeuze (`clarified` na auto-resolve);
- evidence coverage: concrete claims met geldige citation;
- stale-evidencepreventies en re-fetches;
- revision conflicts, dubbele submits en processing timeouts;
- tool-, planner-, resolver- en compositielatency apart;
- tokens per nieuwe vraag versus vervolgbeurt;
- fallbackratio per fase.

Nieuwe telemetry-events bevatten uitsluitend conversation/turn UUID, store/user hash, enumwaarden, counts en timings.

## 13. Gefaseerde uitvoering

### Fase 0 — contracten en golden fixtures

- Definieer `PaceRespondRequestV2`, response, conversation state, entity mention en evidence schema's.
- Maak golden multi-turn scenario's voor product, klant, voorraad, periode en rank references.
- Leg privacy-/retentiekeuze en toegestane entitytypes vast.
- Splits pure planning/compositiehelpers uit `api/pace/respond.ts`.

**Exit:** schema's rejecten onbekende velden/versies en de golden scenario's bestaan vóór persistencecode.

### Fase 1 — server conversation state achter feature flag

- Maak conversation/turntabellen, indices, RLS en RPC's.
- Voeg idempotente begin/complete/fail-turnflow toe.
- Laat de API serverhistory laden, maar houd de oude UI nog als compatibele client.
- Voeg `PACE_SERVER_CONVERSATIONS` flag en v1/v2 metrics toe.

**Exit:** refresh en tweede toestel kunnen dezelfde thread vervolgen; duplicate submit maakt exact één turn en één quotareservatie.

### Fase 2 — deterministische entity resolution

- Voeg entity/mentiontabellen en enumresolvergateway toe.
- Ondersteun eerst `product`, `category`, `customer`, `transaction` en `inventory_location`.
- Voeg focus, rank reference, ambiguity en clarification UI toe.
- Breid plannerframe uit zonder modelgegenereerde IDs toe te staan.

**Exit:** de golden vervolgvragen resolven correct; elke candidate is tenant- en rolgetest; store switch kan geen oude ref dereferencen.

### Fase 3 — evidence envelopes en citations

- Normaliseer de bestaande analytics-, record- en read-toolresultaten.
- Voeg evidence persistence, digests en structured composed answers toe.
- Render citations/freshness in PACE.
- Blokkeer ongefundeerde cijfers en onbekende citation keys.

**Exit:** iedere concrete winkelclaim in de testcatalogus heeft minimaal één geldig bewijs of wordt expliciet als onvoldoende onderbouwd geweigerd.

### Fase 4 — frontend threadervaring en migratie

- Voeg recente gesprekken, nieuw/sluiten/verwijderen en serverhydratie toe.
- Schakel client-authoritatieve history uit.
- Migreer niet-persistente bestaande browsergesprekken niet; start na deployment schoon en communiceer dit eenmalig.
- Verwijder v1-requestondersteuning na een meetperiode zonder oude clients.

**Exit:** werkruimtenavigatie, refresh, reconnect en multiple tabs zijn end-to-end getest.

### Fase 5 — hardening en rollout

- Load-, concurrency-, retention-, export- en delete-tests.
- Security review op RPC grants, search paths, masking en membership revocation.
- Gefaseerde rollout: interne demo, testwinkels, 10%, 50%, 100%.
- Kill switches per capability: persistence, resolver en evidence composition.

**Exit:** foutbudget, citation coverage en resolver-correctieratio blijven binnen vooraf vastgelegde grenzen.

## 14. Testmatrix

### Unit

- State reducer kan alleen geldige transitions uitvoeren.
- Queryframe inheritance verandert uitsluitend expliciet genoemde velden.
- Pronoun, rank, same-set en correction resolution.
- Confidence thresholds en top-two marge.
- Canonical evidence serialization en stabiele digest.
- Citationvalidator accepteert alleen bestaande evidence keys.
- PII-maskers per entitytype.

### SQL contract/integratie

- Iedere RPC weigert anonymous, verkeerde store, inactieve membership en verkeerde owner.
- Cashier/manager/owner projecties blijven gelijk aan de bestaande read gateways.
- `begin_pace_turn_and_reserve_credit` is atomair en idempotent onder parallelle requests.
- Revision mismatch muteert niets.
- Store switch kan conversation, entity of evidence uit store A niet via store B lezen.
- Membership revocation blokkeert bestaande conversation IDs onmiddellijk.
- Cascades en hard-delete verwijderen turns, mentions en evidence.

### API

- Nieuwe thread, vervolgturn, clarification, retry en conflict.
- Quota wordt één keer geconsumeerd per unieke `clientTurnId`.
- Planner-/resolver-/tool-/modelfalen finaliseert een veilige failed turn.
- Een deterministisch antwoord bewaart dezelfde evidence als het responsecontract toont.
- Modelantwoord met onbekende, ontbrekende of fout gekoppelde citations valt veilig terug.
- `liveStoreContext=false` veroorzaakt nul store-read-RPC's.

### End-to-end

1. “Welke sneakers verkochten niet in 60 dagen?”
2. “Hoeveel hebben we daarvan per locatie?”
3. navigeer naar Voorraad;
4. refresh;
5. “Vergelijk de eerste twee met vorige maand.”

Controleer dat entities, periode, rangorde en bronnen behouden blijven, actuele voorraad opnieuw wordt gelezen en geen andere store zichtbaar is.

Aanvullend: twee tabs dienen tegelijk in, gebruiker wisselt winkel, rol verandert midden in de thread, record wordt verwijderd, contextdeling wordt uitgezet en conversation wordt hard verwijderd.

## 15. Concrete acceptatiecriteria

- De requestbody bevat geen client-authoritatieve `history` meer.
- Een gesprek kan na refresh en op een tweede toestel worden hervat.
- Navigatie tussen hoofdwerkruimtes behoudt focus en queryframe.
- Een gesprek of entityref werkt nooit over `store_id` heen.
- Iedere beurt is idempotent en revision-safe.
- De server, niet het model, kent canonieke record-ID's toe.
- Ambigue referenties leiden tot een keuze, niet tot een stille gok.
- Actuele vragen herlezen actuele bronnen.
- Ieder getal of recordspecifiek feit heeft valide evidence.
- Citations verwijzen alleen naar tijdens die beurt toegankelijke evidence.
- Een ingetrokken membership blokkeert bestaande threads onmiddellijk.
- Uitzetten van live winkelcontext voorkomt nieuwe store reads én modelreplay van oude winkelfacts.
- Verwijdering en retentie zijn aantoonbaar met integratietests.

## 16. Belangrijkste ontwerpbeslissingen

1. **Store-scoped en user-private eerst.** Dit geeft continuïteit zonder teamleden onbedoeld elkaars onderzoek of gevoelige resultaten te tonen.
2. **Conversation state onthoudt betekenis, niet autorisatie.** Membership en rol worden bij iedere bronread opnieuw bepaald.
3. **Canonieke IDs komen alleen uit vertrouwde resolvers.** Het model herkent taal, maar kan geen recordidentiteit uitvinden.
4. **Evidence is een minimale historische snapshot.** Zo blijft zichtbaar waarop een oud antwoord rustte zonder volledige retaildatasets te dupliceren.
5. **Oude evidence begrijpt een vervolg; nieuwe reads beantwoorden het heden.** Dat voorkomt dat “hoeveel nog?” met verouderde voorraad wordt beantwoord.
6. **Eén exchange is de consistentie-eenheid.** Begin + quotareservatie zijn atomair; finalisatie + state + bewijs + quota-log zijn atomair. De externe modelcall ligt noodzakelijk tussen beide transacties en wordt via de `processing`/`failed` lifecycle herstelbaar gemaakt.
