# Voorraadoperaties — P0/P1 masterplan

> **Gedateerde domeinverificatie.** De status en 593 geslaagde tests hieronder
> horen bij de voorraaduitrol van 27–28 augustus 2026. Ze blijven waardevol als
> bewijs voor dat domein, maar vervangen de latere algemene releasecontrole
> niet. Zie [`../PROJECT-CONTEXT.md`](../PROJECT-CONTEXT.md).

Status: P0/P1 geïmplementeerd; productiedatabase gemigreerd en clientuitrol via de beveiligde productieflow
Datum audit: 27 augustus 2026
Scope: het volledige pad van voorraad zien, tellen, corrigeren, ontvangen, bestellen, importeren, synchroniseren en auditen

## 0. Implementatiestatus — 27 augustus 2026

P0 en P1 zijn in code afgerond. De onafhankelijke merchanttoggle, entitlementgate en fail-closed platformrelease zijn actief; de scanner-first werkruimte, atomaire batchsessies, veilige CSV-preview, PO receive-all/scanning, variantenmatrix, inbox, volledig SKU-spoor en CSV-export zijn gekoppeld.

Vastgelegde beleidskeuzes volgen het bestaande veiligheidsmodel:

- bestaande winkels krijgen `modules.inventory = true`, zodat een schemamigratie geen bestaande bediening wegneemt;
- `inventory.operations` is een basisrecht op alle bestaande retailplannen; nieuwe PO's behouden hun afzonderlijke Enterprise-recht;
- alleen owner en manager openen of muteren de werkruimte; cashier krijgt geen impliciet voorraadrecht;
- negatieve eindvoorraad blijft geweigerd;
- bestaande PO's blijven na downgrade ontvangbaar of annuleerbaar, terwijl nieuwe PO's geblokkeerd blijven;
- `locations`, `lots` en `serials` worden zowel in de UI als database fail-closed geblokkeerd voor eenvoudige totaalmutaties.

Gemeten klikbudget vanaf de geopende Voorraadmodule:

- levering of telling van één gescande SKU: 1 respectievelijk 2 beslissende klikken;
- batch met willekeurig veel scans: 2 beslissende klikken (batch starten en atomisch verwerken), 0 klikken per scan;
- volledige PO ontvangen: 3 beslissende klikken (Inkooporders, Ontvang alles, verwerken).

Verificatie: 593 tests slagen; branch coverage 65,07%; zes gerichte desktop/mobile browserflows slagen; typecheck, productiebuild, publieke-sitecontrole en alle bundelbudgetten slagen. De drie nieuwe migraties zijn op 28 augustus 2026 toegepast op de gekoppelde productiedatabase en de Supabase releaseverificatie bevestigt dat de lokale en remote migratiehistoriek gelijklopen. De runtimeflag blijft fail-closed totdat de gecontroleerde release wordt geactiveerd.

## 1. Uitkomst die dit plan moet leveren

Voorraad bijwerken wordt een afzonderlijke, scanner-first werkruimte die de bestaande voorraadlogica hergebruikt en alle voorraadmutaties veilig, idempotent en controleerbaar uitvoert.

De module krijgt dezelfde beheerbaarheid als de andere configureerbare modules, maar met drie onafhankelijke poorten:

1. `modules.inventory`: de winkeleigenaar zet de module aan of uit.
2. `inventory.operations`: het abonnement bepaalt of de werkruimte beschikbaar is.
3. `inventory_workspace`: het platform kan de nieuwe werkruimte per winkel of globaal activeren en terugrollen.

De werkruimte is alleen zichtbaar en uitvoerbaar wanneer alle toepasselijke poorten openstaan. Geen van deze poorten mag de onderliggende voorraadadministratie of noodzakelijke achtergrondmutaties uitschakelen.

## 2. Feitelijke nulmeting

### 2.1 Kliklast van de huidige flows

De huidige handmatige voorraadcorrectie vanuit de kassa kost:

- 7 interacties wanneer de gebruiker eerst naar een product zoekt;
- 6 zichtbare muisklikken wanneer het product al zichtbaar staat;
- `5N + 2` interacties voor `N` afzonderlijk opgezochte SKU's;
- dus 102 interacties voor 20 afzonderlijk opgezochte SKU's.

De huidige correctie werkt met een absolute eindvoorraad, niet met een delta. De gebruiker moet dus zelf de nieuwe totale voorraad bepalen.

Een inkooporder aanmaken kost in de huidige flow 7 interacties. Eén leverancier ontvangen kost `N + 5` interacties voor `N` lijnen; over meerdere leveranciers is de huidige orde van grootte `3 + N + 2S`, met `S` het aantal leveranciers.

### 2.2 Bestaande garanties die behouden moeten blijven

De bestaande handmatige correctie heeft al belangrijke servergaranties:

- eigenaar/manager-autorisatie;
- een idempotente request-ID;
- locking tegen gelijktijdige wijzigingen;
- een stale-stockcontrole via de verwachte voorraad;
- een `stock_movements`-record;
- een audit-event.

Deze garanties worden niet opnieuw in de UI geïmplementeerd, maar blijven de minimale serverstandaard voor iedere nieuwe mutatie.

### 2.3 Bevestigde integriteitskloof

De huidige CSV/product-bulkupsert kan `stockQty` van een bestaand product wijzigen zonder voor elke SKU een corresponderende voorraadbeweging te schrijven. Daardoor kan de geprojecteerde productvoorraad afwijken van het controleerbare voorraadspoor.

Dit is P0. Een snellere UI bovenop een onvolledig auditspoor zou het probleem vergroten.

## 3. Volledig gekoppeld systeemlandschap

| Onderdeel | Huidige rol | Gevolg voor dit plan |
|---|---|---|
| `storeConfiguration.ts` | Configureerbare modules en defaults | Nieuw veld `modules.inventory`; configuratiecontract naar V3 |
| `useStoreConfiguration.ts` | Optimistische opslag en serialisatie van moduletoggles | Bestaande save-queue hergebruiken; geen aparte clientopslag |
| `ModuleSettings.tsx` | Eigenaar schakelt modules | Voorraadoptie met entitlement-uitleg toevoegen |
| `useStore.ts` | `MainView`-union | Nieuwe view `inventory` toevoegen |
| `Layout.tsx` | Navigatie, rollen, directe links, hotkeys en verborgen-view redirect | Alle toegangscombinaties expliciet afhandelen |
| `entitlements.ts` en planmigraties | Abonnementsrechten | Nieuw recht `inventory.operations`; enterprise-rechten blijven afzonderlijk |
| `usePlatformFeatureFlag.ts` | Platform override boven build-default | Kill-switch `inventory_workspace`, standaard uit tijdens uitrol |
| `ProductAdmin.tsx` | Productbeheer en huidige handmatige telling | Mutatie-UI migreren; fallback tijdelijk behouden |
| `inventoryAdjustments.ts` | Veilige absolute correctie | P0 hergebruiken en uitbreiden via expliciete servercontracten |
| `InventoryForecast.tsx` | Herbestelsignalen | Read-only analyse behouden; acties naar Voorraad verwijzen |
| `PurchaseOrderWorkflow.tsx` | Bestellen en ontvangen | Controller/service losmaken en binnen Voorraad renderen |
| `supabasePurchaseOrders.ts` | PO-opslag en ontvangst | Servergedrag behouden; nieuwe bulkontvangst toevoegen |
| checkout-RPC/service | POS-verkoop verlaagt voorraad | Altijd actief, ook wanneer de module uitstaat |
| refund-service/RPC | Retour kan terug op voorraad | Altijd actief; disposition blijft leidend |
| webshop commerce/RPC's | Reserveren en vrijgeven | Altijd actief; mag niet aan UI-module gekoppeld worden |
| catalog batch/opening stock | Beginvoorraad bij creatie/migratie | Auditbaar houden; geen dubbele bewegingen creëren |
| realtime/store sync | Nieuwe standen naar clients | Inventory view moet dezelfde bron volgen |
| stock movements/audit log | Controleerbaar spoor | Nieuwe redenen, filters en correlatie-ID's toevoegen |
| Pace signals/knowledge | Contextuele hulp per `MainView` | Inventory-signaal, hints en toegangsveilige navigatie toevoegen |
| diepe inventory-tabellen | Locaties, loten, serienummers, balances | P0 ondersteunt alleen `stock_mode = simple`; nooit stilzwijgend flattenen |

### 3.1 Alle bevestigde voorraadschrijvers

De implementatie mag geen writer overslaan:

1. POS checkout;
2. POS refund met voorraadbestemming;
3. webshop reservation;
4. webshop reservation release;
5. inkooporderontvangst;
6. handmatige telling/correctie;
7. openingsvoorraad bij catalogusbatch;
8. CSV/productimport;
9. integratie- of migratie-import;
10. toekomstige locatie-, lot- en serienummermutaties.

Elke writer krijgt in P0 een contracttest die bewijst dat de productprojectie, relevante balance en beweging/audit samen correct veranderen. Een writer zonder controleerbare beweging wordt niet vanuit de nieuwe werkruimte aangeroepen.

## 4. Bronnen van waarheid en migratiestrategie

### 4.1 Moduleconfiguratie

Er bestaan momenteel twee moduleachtige servermodellen:

- `stores.onboarding_config` / `store_retail_profiles`, dat de actuele frontend gebruikt;
- `store_module_settings`, dat door oudere/parallelle serverlogica wordt gevuld maar niet door de huidige frontend wordt gelezen.

Voor P0 wordt `StoreConfiguration.modules.inventory` de canonieke frontend- en merchantvoorkeur. Om verborgen divergentie te vermijden:

- het configuratiecontract wordt V3;
- V2-records worden deterministisch naar V3 genormaliseerd;
- de server-RPC schrijft de canonieke configuratie en synchroniseert `store_module_settings` transactioneel voor compatibiliteit;
- nieuwe frontendcode leest niet rechtstreeks uit `store_module_settings`;
- een latere consolidatiemigratie kan de compatibiliteitslaag verwijderen nadat bewezen is dat er geen consument meer bestaat.

De voorgestelde V2→V3-default is `inventory: true`, omdat bestaande winkels vandaag al voorraadfunctionaliteit hebben. Dit voorkomt dat een schema-upgrade bestaande functionaliteit onverwacht verbergt. Dit is een expliciet productbesluit dat vóór migratie bevestigd moet worden.

### 4.2 Voorraadaantal

`products.stock_qty` blijft in P0 de compatibele projectie voor de bestaande POS- en catalogusflows. De server is verantwoordelijk voor de atomische koppeling met de append-only beweging en, waar van toepassing, de primary inventory balance.

De UI mag nooit zelf meerdere tabellen na elkaar proberen bij te werken.

### 4.3 Niet-eenvoudige voorraadmodi

P0 en P1 ondersteunen mutaties alleen wanneer `stock_mode = simple`.

Bij `locations`, `lots` of `serials`:

- toont de UI de geregistreerde modus;
- blokkeert zij de eenvoudige mutatie vóór submit;
- verwijst zij naar de gespecialiseerde workflow zodra die bestaat;
- wordt geen totaalstand teruggeschreven die detailinformatie vernietigt.

## 5. Toegang, aan/uit-gedrag en rollen

### 5.1 Beslismatrix

| Situatie | Navigatie | Directe URL/Pace | Mutaties | Data en achtergrondprocessen |
|---|---|---|---|---|
| Merchanttoggle uit | Verborgen | Redirect naar kassa; eigenaar krijgt herinschakelroute | Geen nieuwe Inventory-UI-mutaties | Ongewijzigd actief |
| Entitlement ontbreekt | Verborgen of upgrade-uitleg in instellingen | Geen bypass | Geen nieuwe flow; bestaande PO-verplichtingen blijven afhandelbaar volgens downgradebeleid | Ongewijzigd actief |
| Platformflag uit | Nieuwe werkruimte verborgen | Geen bypass | Nieuwe Inventory-RPC's indien nodig server-side geblokkeerd; veilige legacycorrectie blijft fallback | POS, retour, webshop, sync en audit blijven actief |
| Rol niet toegestaan | Item verborgen/disabled volgens bestaand patroon | Server weigert altijd | Geen mutatie | Alleen roltoegelaten read-only gegevens |
| Alle poorten open | Zichtbaar | Toegelaten | Volgens rol en subfeature-entitlement | Normaal |

### 5.2 Harde invarianten

- Een moduletoggle verwijdert of archiveert nooit data.
- Uitschakelen annuleert geen open inkooporders.
- Uitschakelen stopt geen POS-, retour- of webshopvoorraadmutaties.
- Een client-side flag is geen autorisatie. Iedere muterende RPC valideert winkel, gebruiker, rol, entitlement waar nodig en request-ID.
- Een mutatie die al door de server is aanvaard, wordt niet onderbroken wanneer een flag ondertussen omschakelt.
- Een open, nog niet opgeslagen formulier vraagt bij uitschakeling om te bewaren of te verlaten; een opgeslagen/in-flight verzoek krijgt eerst een ondubbelzinnige uitkomst.
- Bij verlies van een betaald recht kan een winkel geen nieuwe enterprise-PO aanmaken, maar bestaande orders moeten minimaal ontvangen of geannuleerd kunnen worden. Dit sluit aan op operationele verplichtingen en vereist een expliciete entitlement-status voor `create` versus `manage_existing`.

### 5.3 Rollenvoorstel

| Actie | Owner | Manager | Cashier |
|---|---:|---:|---:|
| Voorraad bekijken/scannen | Ja | Ja | Optioneel read-only |
| Telling/correctie boeken | Ja | Ja | Nee |
| Levering ontvangen | Ja | Ja | Alleen via later expliciet recht |
| Nieuwe PO maken | Volgens entitlement | Volgens entitlement | Nee |
| Module aan/uit zetten | Ja | Nee | Nee |
| Bewegingshistoriek/export | Ja | Ja | Nee |

Er wordt geen cashier-recht afgeleid uit alleen het zichtbaar maken van de module. Als ontvangst aan kassiers gewenst is, komt daar een afzonderlijke permission voor.

## 6. P0 — veilige, snelle operationele kern

P0 is pas klaar wanneer integriteit, modulebesturing en de dagelijkse single-itemflow samen werken.

### P0.1 Configuratie, entitlement en releasecontrole

- Voeg `inventory` toe aan `ConfigurableModule`, defaults, presets, validator en owner-instellingen.
- Migreer `STORE_CONFIGURATION_VERSION` van 2 naar 3 met deterministische backward normalization.
- Voeg `inventory.operations` toe aan de entitlementcatalogus.
- Productvoorstel: dit basisrecht staat op alle retailplannen; bestaande enterprise-rechten `inventory.forecast` en `purchase_orders.create` blijven binnen de module subfeatures begrenzen.
- Voeg platformflag `inventory_workspace` toe met build-default `false` tijdens pilot.
- Voeg `inventory` toe aan `MainView`, lazy loading, navigatie, directe-viewallowlist, verborgen-viewguard en responsive menu.
- Voeg volledige Pace-signalen, hints en veilige acties toe; Pace mag geen verborgen view openen.
- Synchroniseer de compatibele `store_module_settings`-rij transactioneel.

### P0.2 Eén scanner-first voorraadwerkruimte

De eerste focus staat altijd in SKU/barcode/naam zoeken. Een scan selecteert direct het product en houdt focus in de scanlus.

Drie expliciete modi voorkomen reken- en betekenisfouten:

1. **Levering** — voer ontvangen aantal als positieve delta in.
2. **Telling** — voer de werkelijk getelde eindvoorraad in.
3. **Correctie/schade** — voer een positieve of negatieve delta in met verplichte reden.

Na herkenning toont de UI minimaal product, variant, SKU/barcode, actuele voorraad, invoer, berekende nieuwe voorraad en reden/bron. Een onbekende scan wijzigt niets.

Klikbudget vanaf de geopende Voorraadmodule:

- product zoeken en telling bevestigen: maximaal 3 interacties;
- herhaalde barcodescan in een ingestelde ontvangstmodus: 0 muisklikken per eenheid;
- onbekende barcode herstellen zonder de reeds ingevoerde sessie te verliezen;
- na succesvolle boeking keert focus automatisch naar de scanner.

### P0.3 Servercontract voor mutaties

Introduceer één duidelijke operationele mutatiegrens, bijvoorbeeld `record_inventory_operation`, met:

- `store_id`, `product_id`, operation mode en hoeveelheid;
- `expected_stock_qty` voor optimistic concurrency;
- unieke `request_id` voor idempotentie;
- gestandaardiseerde reason-code plus optionele korte notitie;
- optionele bronreferentie, zoals PO, importbatch of telsessie;
- server-side rolcontrole;
- row/advisory lock;
- validatie tegen negatieve voorraad volgens bestaand winkelbeleid;
- atomische update van projectie/balance, movement en audit;
- een response met oude stand, delta, nieuwe stand, movement-ID en auditcorrelatie.

Afzonderlijke semantiek blijft zichtbaar in de serverdata. Een telling wordt niet vermomd als levering; een beschadiging wordt niet vermomd als algemene aanpassing.

### P0.4 Inkooporders in de juiste module

- Maak de businesscontroller van `PurchaseOrderWorkflow` herbruikbaar en plaats de operationele UI in Voorraad.
- Insights blijft read-only signalen en besteladvies tonen, maar linkt naar Voorraad voor uitvoering.
- Bestaande PO's, statussen en ontvangsten worden niet gekopieerd naar een nieuw datamodel.
- De enterprise-subfeature blijft apart gated door `purchase_orders.create`.
- Ontvangst van een bestaande PO blijft mogelijk volgens het downgradebeleid uit §5.2.

### P0.5 CSV-integriteit herstellen

Catalogusimport en voorraadaanpassing worden semantisch gescheiden:

- catalogus-CSV mag bij bestaande producten geen `stockQty` rechtstreeks muteren;
- het previewrapport markeert zulke cellen als “voorraadmutatie vereist”;
- nieuwe producten mogen openingsvoorraad alleen via het bestaande gecontroleerde openingsvoorraadpad krijgen;
- een afzonderlijk voorraadimportcontract schrijft per SKU een movement en auditrecord;
- de hele import krijgt een batch-ID en een samenvatting van accepted/rejected/conflicted regels;
- er komt geen client-side reeks losse product-upserts voor stock.

### P0.6 Historiek en foutafhandeling

- Toon recente bewegingen voor het geselecteerde product in dezelfde werkruimte.
- Filters: verkoop, retour, reservering, vrijgave, ontvangst, telling, correctie, import.
- Stale-stockfout toont de nieuwste stand en laat de gebruiker de invoer bewust herbevestigen.
- Dubbele request-ID retourneert hetzelfde resultaat zonder tweede beweging.
- Offline submit wordt niet als geslaagd getoond. Indien queuing later wordt toegestaan, moet die exact dezelfde idempotente request-ID behouden.
- Alle fouten zijn herstelbaar zonder verlies van de actieve scansessie.

### P0.7 P0 acceptatiecriteria

- Alle drie poorten zijn onafhankelijk getest.
- Toggle uit verwijdert alleen bediening, geen data of achtergrondmutatie.
- Alle bestaande stock writers slagen voor integriteitscontracttests.
- Geen bestaand product kan via catalogus-CSV stil voorraad wijzigen.
- Twee gelijktijdige correcties kunnen geen lost update veroorzaken.
- Retry van hetzelfde verzoek creëert exact één movement.
- P0-flow haalt het klikbudget uit §6.2 op desktop en touch.
- `locations`, `lots` en `serials` worden zichtbaar geblokkeerd, niet beschadigd.
- Checkout, refund, webshop reservation/release, sync en auditregressies blijven groen.
- Legacycorrectie wordt pas verwijderd nadat de platformflag stabiel breed live staat.

## 7. P1 — batchwerk, ontvangst en operationeel overzicht

P1 bouwt alleen verder wanneer P0-telemetrie bewijst dat de enkelvoudige mutaties correct en begrijpelijk zijn.

### P1.1 Persistente ontvangst- en telsessies

- Een sessie bewaart gescande lijnen, aantallen, gebruiker, starttijd en bron.
- Eenzelfde barcode verhoogt in ontvangstmodus het lijn-aantal zonder muisactie.
- De gebruiker kan aantallen corrigeren, lijn verwijderen en sessie hervatten.
- Submit valideert eerst de volledige batch.
- Bij stale lijnen schrijft de server niets; de UI toont alle conflicten samen. Na review wordt een nieuwe request-ID gebruikt.
- Een geslaagde batch commit atomisch en maakt per SKU een movement plus één overkoepelend batch-auditrecord.

### P1.2 Sneller PO ontvangen

- “Ontvang alle openstaande aantallen” met één review en één bevestiging.
- Barcode ontvangt tegen open PO-lijnen en signaleert overlevering of onbekend artikel.
- Gedeeltelijke ontvangst blijft ondersteund.
- Leveranciersfilter, besteldatum, verwachte datum, te laat-status en openstaand aantal.
- Klikbudget voor een volledige, foutloze PO: maximaal 3 beslissende acties, onafhankelijk van het aantal lijnen.

### P1.3 Variant- en bulkweergave

- Toon varianten als één compacte matrix met actuele voorraad en getelde/ontvangen waarde.
- Keyboardnavigatie en scannerfocus zonder focusvallen.
- Filter op laag/nul voorraad, categorie, leverancier en alleen gewijzigde lijnen.
- Geen virtuele rij mag invoer verliezen wanneer ze buiten beeld scrolt.

### P1.4 Voorraadinbox en deep links

- Lage-voorraad- en out-of-stocksignalen linken naar een vooraf gefilterde Voorraadview.
- Insights en Pace geven alleen een geldige actie wanneer module, entitlement, flag en rol dit toelaten.
- Als de merchanttoggle uitstaat, krijgt de eigenaar een route naar Module-instellingen; anderen krijgen een neutrale toelichting.
- De inbox bevat open tellingen, open ontvangsten, conflicten en recente mislukte imports zonder data te dupliceren.

### P1.5 Uitgebreide historiek en export

- Tijdlijn per SKU met actor, bron, oude stand, delta, nieuwe stand en correlatie.
- Export alleen voor toegelaten rollen en binnen de winkeltenant.
- Batch/PO/import is van samenvatting naar individuele beweging traceerbaar.
- Correctie van een fout gebeurt via een nieuwe tegenbeweging, nooit door history te wijzigen.

### P1.6 P1 acceptatiecriteria

- Batchcommit is volledig atomisch.
- Conflicten veroorzaken geen verborgen deelresultaat.
- Een volledige PO-ontvangst haalt het vastgelegde klikbudget.
- Scannerloop werkt met USB/Bluetooth keyboard-wedge scanners en handmatige invoer.
- Onderbreken, refresh en opnieuw aanmelden verliezen een opgeslagen sessie niet.
- Variantenmatrix is bruikbaar op desktop en mobiel en voldoet aan keyboard- en screenreaderbasics.
- Iedere lijn blijft van UI tot movement en audit-event traceerbaar.

## 8. Technische werkpakketten en volgorde

### Fase A — contracten en veiligheidsnet

1. Leg reason-codes, rollen, entitlementbeleid, V3-default en negatieve-voorraadbeleid vast.
2. Voeg contracttests toe rond iedere stock writer vóór functionele refactor.
3. Reproduceer en test de CSV-integriteitskloof.
4. Maak platformflags aan, standaard uit.

### Fase B — additieve databasewijzigingen

1. V3-configvalidator en V2→V3-normalisatie.
2. Transactionele compatibiliteitssync voor module settings.
3. Entitlementkey en planmapping.
4. Nieuwe operationele inventory-RPC, reason-codes en indices.
5. Veilige inventory-import/batchcontracten waar P0 ze vereist.

Alle migraties zijn additief en backward compatible; oude clients blijven functioneren tijdens de uitrol.

### Fase C — clientmodule achter flag

1. Type- en navigatiekoppelingen.
2. Module-instelling en driepoorts-gate.
3. Scanner-first single-itemwerkruimte.
4. PO-controller uit Insights losmaken zonder datamodelduplicatie.
5. Historiek, fouten en toegankelijkheid.
6. Pace-kennis en veilige deep links.

### Fase D — CSV en writerconsolidatie

1. Blokkeer directe bestaande-stock-upsert.
2. Routeer opening stock en voorraadimport via gecontroleerde servercontracten.
3. Controleer alle import- en integratiepaden op dubbele of ontbrekende movements.

### Fase E — P1

1. Persistente sessies en atomische batches.
2. Receive-all en PO-scanner.
3. Variantmatrix en operationele inbox.
4. Uitgebreide ledger/export.

## 9. Verificatieplan

### 9.1 Unit- en typechecks

- V2-, gedeeltelijke en corrupte configuraties normaliseren correct naar V3.
- Iedere `Record<MainView, ...>` bevat `inventory`, waaronder Pace signals en hints.
- Gateberekening test alle combinaties van voorkeur, entitlement, platformflag en rol.
- Reason-code en mode bepalen ondubbelzinnig absolute versus delta-semantiek.

### 9.2 Server- en concurrencytests

- Tenant- en rolisolatie voor iedere muterende RPC.
- Idempotente retry, inclusief netwerk-timeout na servercommit.
- Twee gelijktijdige verzoeken op dezelfde SKU.
- Stale expected quantity.
- PO partial/full receipt en overreceipt.
- Per writer: projectie/balance + movement + audit.
- Batch rollback bij één ongeldige of stale lijn.
- Entitlementverlies en platform rollback tijdens bestaande data.

### 9.3 Integratie- en E2E-tests

- Toggle aan, uit, refresh, andere sessie en realtime wijziging.
- Directe `?view=inventory` kan gates niet omzeilen.
- Owner, manager en cashier per actie.
- Scan bekend/onbekend, snel herhalen, correctie en retry.
- POS-verkoop, retour en webshoporder terwijl Inventory uitstaat.
- Open PO vóór en na toggle/planwijziging.
- CSV van nieuw en bestaand product.
- Desktop, smalle viewport, keyboard-only en screenreaderlabels.

### 9.4 Klik- en tijdmeting

De E2E-suite registreert beslissende interacties, niet alleen screenshots. Minimaal worden gemeten:

- één opgezochte telling;
- tien opeenvolgende scans;
- correctie met reden;
- gedeeltelijke PO-ontvangst;
- volledige PO-ontvangst;
- conflict herstellen.

De nulmeting uit §2 blijft als regressiebenchmark in het testrapport staan.

## 10. Uitrol, observatie en rollback

1. Ship database en client met `inventory_workspace = false`.
2. Activeer eerst interne/demo-winkels.
3. Activeer een kleine geselecteerde pilotgroep via de bestaande releaseworkflow.
4. Vergelijk voltooiingstijd, interacties, foutpercentage, stale conflicts, retries en supportmeldingen met de nulmeting.
5. Breid gecontroleerd uit; pas daarna build-default aan.
6. Behoud de legacycorrectie gedurende ten minste één stabiele releasecyclus.
7. Rollback zet alleen de nieuwe werkruimte uit. Databasekolommen, movements en audit blijven intact.

Alarmeringsdrempels vóór brede livegang:

- dubbele movements: exact nul;
- mutatie zonder audit/movement: exact nul;
- lost update in concurrencytests: exact nul;
- onverwachte toename van checkout/refund/webshop-stockfouten: geen statistisch of operationeel relevant verschil;
- onherstelbare scan- of batchsessies: exact nul in pilotdata.

## 11. Productbesluiten die vóór implementatie expliciet bevestigd moeten worden

Dit plan maakt geen stille aannames over onderstaande punten:

1. Staat `modules.inventory` bij migratie voor bestaande winkels standaard aan?
2. Is `inventory.operations` beschikbaar op Basic, Pro en Enterprise zoals voorgesteld?
3. Mag een cashier voorraad alleen bekijken, of helemaal niet?
4. Mag een cashier leveringen ontvangen via een afzonderlijk recht?
5. Mag een correctie ooit onder nul gaan, en zo ja onder welk bestaand winkelbeleid?
6. Welke reason-codes zijn juridisch/boekhoudkundig vereist: schade, diefstal, intern gebruik, fouttelling, verlies, leverancier?
7. Welke acties blijven toegestaan na downgrade: ontvangen en annuleren van bestaande PO's is voorgesteld.
8. Hoe lang moeten onvoltooide telsessies en exports bewaard blijven?

Geen van deze besluiten blokkeert het technische voorbereidende testwerk, maar ze moeten vaststaan vóór de bijbehorende mutatie live kan.

## 12. Definition of done

P0 is niet “een nieuw voorraadscherm”. P0 is klaar wanneer de dagelijkse update aantoonbaar sneller is, alle mutaties hetzelfde controleerbare serverniveau hebben, de CSV-kloof gesloten is en de module veilig aan/uit kan zonder operationele nevenschade.

P1 is klaar wanneer bulk tellen en ontvangen dezelfde garanties behouden, de kliklast niet meer lineair groeit voor normale scanner- en receive-allflows, en iedere batchlijn volledig traceerbaar blijft.
