# PWAYMENT Retail — code-audit featurelijst

> **Gedateerde auditmomentopname.** De verificatiecijfers, live datatotalen en
> conclusies hieronder horen bij 22 augustus 2026 en zijn niet de huidige
> releasebeslissing. Sindsdien bevat de gecommitteerde basis 120 migraties en gaf de
> schone CI-equivalente controle op 31 augustus 2026 20 falende tests op 651.
> De live juridische configuratie en publieke featureclaims hebben bovendien
> openstaande releasepunten. Gebruik
> [`PROJECT-CONTEXT.md`](PROJECT-CONTEXT.md) als actuele bron van waarheid.

**Auditdatum:** 22 augustus 2026  
**Geaudite basis:** actuele werkboom na de live retail-dieptemigratie; wijzigingen zijn nog niet als commit vastgelegd  
**Repositoryversie:** `0.1.0`  
**Methode:** statische audit van app, POS, services, stores, imports, migraties, tests en configuratie; geheimveilige controle van de lokale target; geverifieerde live SQL-uitrol op het ingelogde Supabase-project; daarna remote schema-lint, data-/rechteninvarianten, REST-smoke, `tsc --noEmit`, productiebouw, site- en bundlecontrole, unit- en E2E-tests.

## Belangrijke afbakening

Dit document maakt bewust vier verschillende uitspraken niet door elkaar:

| Label | Betekenis |
| --- | --- |
| **Geïmplementeerd** | Er is uitvoerbare clientcode en/of servermigratie aanwezig. |
| **Lokaal operationeel** | De flow heeft een IndexedDB/browserpad en kan zonder centrale server werken. |
| **Serverpad aanwezig** | De flow roept een Supabase-RPC aan of heeft een overeenkomstige databasefunctie/tabel. |
| **Live geverifieerd** | De betreffende migratie, functie, constraint, RLS/ACL of data-invariant is op project `kkedepbyrarsewofmoao` uitgelezen en gecontroleerd. |
| **Nu ingeschakeld** | Productie-buildflags zijn lokaal gecontroleerd. De actuele entitlement- en module-records blijven winkelafhankelijk en zijn daarom alleen per concrete winkel vast te stellen. |

Er staat een genegeerde **`.env.local`** in deze werkmap en er zijn opgehaalde Vercel-bestanden in `.vercel/`. De audit publiceert geen URL, sleutel, token of accountgegeven. De lokale Supabase-link, browserdashboard en CLI zijn alle drie tegen exact project `kkedepbyrarsewofmoao` gecontroleerd. Tenantafhankelijke planrechten en platformflags blijven per winkel bepaald; de hieronder genoemde schema-, data- en beveiligingscontroles zijn wél live uitgevoerd.

## Uitkomst van de technische verificatie

| Controle | Resultaat |
| --- | --- |
| TypeScript (`npm run lint`) | Geslaagd |
| Unit-tests (`npm test`) | **71** testbestanden, **329** tests geslaagd |
| Productiebouw (`npm run build`) | Geslaagd; PWA-serviceworker gegenereerd |
| Publieke site (`npm run check:site`) | Geslaagd voor **40** routes; één centrale prijscatalogus |
| Bundlebudget (`npm run check:bundle`) | Geslaagd |
| E2E (`npm run test:e2e`) | **24/24 geslaagd** op desktop- en mobile-Chromium, inclusief expliciete winkelkeuze bij registratie, import/undo, verkoop, retour, split tender, Z-afsluiting, workforce en mobiele POS. |
| Supabase production target | Browserdashboard, lokale projectlink en CLI bevestigen hetzelfde project: `kkedepbyrarsewofmoao`. |
| Remote migratiestatus (`npm run check:supabase-release`) | Geslaagd. De twaalf retailmigraties `20260822160000` t/m `20260822270000` staan live en hun exacte bronnen zijn in `supabase_migrations.schema_migrations` vastgelegd. |
| Remote DB-lint | `public` en `private` zijn met warnings-as-errors gecontroleerd: **nul schemafouten en nul waarschuwingen**. |
| Dependency-audit | `npm audit --audit-level=high`: **nul kwetsbaarheden**. |
| Credentialhygiëne | De tijdens de audit gebruikte browsercredentials komen niet in versiebeheer voor. Lokale loginhulpscripts vereisen environment-variabelen; screenshotfixtures gebruiken een geïsoleerde, niet-productie demo-identiteit. |

## Live retail-diepte: gecontroleerde uitkomst

| Domein | Live resultaat |
| --- | --- |
| Retail-only onboarding | Vijftien expliciete retailprofielen; horeca komt niet voor. Iedere nieuwe winkeleigenaar—zonder accountgebonden demo-bypass—moet een volledig V2-contract indienen met geldige winkelsoort, datum, modules en alle negen capability-antwoorden. Alleen `unknown`, `not-needed` en `required` zijn bij signup aanvaard; `enabled`/`blocked` blijven server-eigendom. Sector stuurt vragen en startaanbevelingen, niet stilzwijgend serverfuncties. |
| Profielkoppeling | **5/5** bestaande winkels hebben exact één genormaliseerd retailprofiel en negen capability-assessments; **0** profiel/store-mismatches en **0** ongeldige lifecycle-states. Beschermde onboardingkolommen zijn niet rechtstreeks schrijfbaar door browserrollen. |
| Catalogusdiepte | **308/308** producten zijn aan een familievariant gekoppeld; hiërarchische categorieën hebben **0** cycli; **0** dubbele variant-signatures, **0** dubbele actieve scancodes en **0** collisions met legacy SKU/barcode. Families, opties, waarden en identifiers zitten in RLS-tabellen en de definitieve RPC-hardening V4 staat live. |
| Voorraadfundament | **5/5** winkels hebben een primaire locatie en **308/308** producten een inventory-profiel; **0** projectiemismatches, negatieve/overgereserveerde balansen of ongeldige serial-statussen. De private ledger heeft RLS en geen clientmutatierechten. Diepe modes worden bewust niet uit sector afgeleid of stil ingeschakeld. |
| Btw en documenten | Nieuwe transacties ondersteunen 0/6/12/21% met een gevalideerde snapshot; alle **1.997** historische transacties blijven geldig als versie 0. Checkout, retour, Z-rapport V4 en cashafronding in de rapporthash zijn live gecontroleerd. |
| Realtime en types | Alle operationeel gebruikte profiel- en catalogusrelaties zitten in `supabase_realtime`; open clients doen een gedebouncete volledige herhydratie. De TypeScript-databasetypes zijn opnieuw gegenereerd uit het live schema en bevatten ook de inventory-relaties. |

**Kritische grens:** “kan aansluiten” betekent dat elke retailwinkel veilig kan registreren, haar echte vereisten kan vastleggen en catalogusdata zonder stille flattening kan importeren. Een capability met nog niet operationele mutatieflow wordt `required`/`blocked` en blokkeert activatie; deze audit noemt lot-, serial-, locatie-, meet- of verpakkingstracking niet ten onrechte “ingeschakeld” enkel omdat de tabellen bestaan.

## Activeringsmodel: de feitelijke beslisboom

```text
Feature in code
  ├─ planrecht (Supabase entitlement / lokale fixture)
  │    ├─ recht ontbreekt of trial verlopen → feature geblokkeerd
  │    └─ recht aanwezig
  ├─ optionele modulevoorkeur per winkel (alleen voor navigatiemodules)
  │    ├─ uit → niet in navigatie, data/implementatie blijft bestaan
  │    └─ aan → zichtbaar, mits rol dit toelaat
  └─ eventuele build- of platformflag
       ├─ uit → specifieke flow geblokkeerd
       └─ aan → flow beschikbaar binnen plan/rol
```

Bronnen: [entitlements](src/billing/entitlements.ts), [module-instellingen](src/components/ModuleSettings.tsx), [buildflags](src/config/features.ts), [platformflags](src/billing/usePlatformFeatureFlag.ts).

### A. Planrechten (server-authoritatief wanneer Supabase beschikbaar is)

| Plan | Code-standaard volgens migraties | Opmerking |
| --- | --- | --- |
| Basis | Kassa, Z-rapport en altijd zichtbare beperkte historiek; limiet 250 actieve producten en 5 categorieën | De client forceert de historiek-tab als kernwerkruimte. |
| Pro | Alle Basis-functies plus volledige historiek, labels, geavanceerde inzichten, loyaliteit, cadeaubonnen uitgeven/opwaarderen, webshop, integratieconfiguratie, geavanceerde hardware, klantendisplay, ServiceDesk (max. 50 actieve dossiers), CRM en sales insights | Foto-intake, SMS, technicustoewijzing, auditviewer/-export, API/webhooks, workforce, forecast, purchase orders, multistore en advanced team blijven Enterprise. |
| Enterprise | Alle aanwezige entitlement-keys | Sommige integratiemogelijkheden zijn nog slechts lokale configuratie/simulatie; een recht maakt geen externe connector live. |

Nieuwe/gebackfillde subscriptions worden in de migraties als **30 dagen Pro-trial** aangemaakt en `test_mode` wordt expliciet op `true` gezet. Dit is een database-default uit de migraties, geen vastgesteld live abonnement. In development-, presentatie- en E2E-builds geeft de client een Enterprise-fixturesnapshot met alle feature keys aan. Bronnen: [planmatrix-migratie](supabase/migrations/20260814160000_complete_plan_entitlements.sql), [entitlement-client](src/billing/entitlements.ts), [publieke catalogus](src/billing/planCatalog.ts).

### B. Modulevoorkeuren per winkel

De eigenaar kan onderstaande navigatiemodules per winkel in- of uitschakelen. De brondefault is **alles aan** voor een normale bestaande configuratie; een nieuw onboardingconcept kiest een sectorpreset. De voorkeur verleent geen recht: planrechten blijven leidend.

| Module | Brondefault | Vereist recht | Effect van uitzetten |
| --- | ---: | --- | --- |
| Integration Hub/catalogusmigratie | aan | `integrations.configure` | verborgen uit navigatie |
| Klanten | aan | `customers.crm` | verborgen uit navigatie |
| Herstellingen | aan | `service.orders` | verborgen uit navigatie |
| Personeel & verlof | aan | `workforce.core` | verborgen uit navigatie |
| Webshop | aan | `webshop.publish` | verborgen uit navigatie |
| Inzichten | aan | `insights.advanced` | verborgen uit navigatie |

Kassa, dagafsluiting en historiek zijn geen optionele modulevoorkeuren. Bronnen: [configuratie-defaults en sectorpresets](src/onboarding/storeConfiguration.ts), [UI en gate](src/components/ModuleSettings.tsx), [navigatie](src/components/Layout.tsx).

### C. Build- en control-planeflags

| Flag | Code-standaard zonder env-override | Activering | Auditstatus |
| --- | ---: | --- | --- |
| `VITE_ENABLE_GIFT_CARD_PAYMENT` | **aan** | buildtijd | De code importeert de flag in de kassamand; de checkout-interface biedt cadeaubongebruik. De voorbeeld-`.env` zet hem expliciet op `false`, dus een deployment die dat voorbeeld volgt schakelt dit uit. |
| `VITE_ENABLE_CSV_IMPORT` | **uit** | buildtijd, daarna eventueel tenant control-plane override `csv_import` | Productbeheer blokkeert importknoppen wanneer uit. Export blijft beschikbaar. |
| `VITE_SEED_DEMO_PRODUCTS` | uit | alleen demonstratiebuild/expliciete env | Seed uitsluitend voor expliciete demowinkel. |
| `VITE_AUTO_RESET_LEGACY_CATALOG` | aan | buildtijd | Herstel/resetlogica voor legacy catalogus. |
| `csv_import` platformflag | geen override aantoonbaar | RPC `get_store_platform_feature_flags` | Kan de CSV builddefault per winkel overschrijven als de server/control-plane draait. |

Bronnen: [flags](src/config/features.ts), [CSV-gate](src/components/ProductAdmin.tsx), [platformflag-hook](src/billing/usePlatformFeatureFlag.ts), [voorbeeldconfiguratie](.env.example).

### D. Gecontroleerde actuele deploymentconfiguratie

De volgende waarden zijn rechtstreeks uit het lokaal aanwezige, door Vercel opgehaalde **production**-dotenvbestand gelezen. Er zijn geen geheimen uitgelezen of opgenomen.

| Productieflag | Gecontroleerde waarde | Consequentie |
| --- | ---: | --- |
| `VITE_ENABLE_GIFT_CARD_PAYMENT` | **true** | Cadeaubonbetaling is in de production build ingeschakeld. |
| `VITE_ENABLE_CSV_IMPORT` | **false** | CSV-import in Productbeheer is in de production build uit, tenzij de control-plane per winkel `csv_import` expliciet naar `true` overschrijft. |
| `VITE_SEED_DEMO_PRODUCTS` | **false** | Geen democatalogus-seeding in de production build. |
| `VITE_AUTO_RESET_LEGACY_CATALOG` | **false** | Geen automatische legacy-catalogusreset in de production build. |
| `VITE_E2E_BUILD` | **false** | Geen E2E-fixturemodus in de production build. |
| `VITE_PRESENTATION_BUILD` | **false** | Geen presentatie-fixturemodus in de production build. |
| Supabase browserconfiguratie | aanwezig | De browser gebruikt een echte Supabase-target in plaats van de lokale testfallback. |

De preview-dotenv bevat eveneens de relevante featurekeys, maar de locally pulled values zijn als `[SENSITIVE]` gemaskeerd. Er wordt daarom geen previewwaarde geclaimd.

---

# Featurelijst

## 1. Toegang, identiteiten en winkelconfiguratie

| Feature | Concreet gedrag | Status / activatie |
| --- | --- | --- |
| E-mail/wachtwoord inloggen | Loginflow via Supabase wanneer geconfigureerd; lokale fixtures in dev/presentatie/E2E. | Geïmplementeerd. Centrale productieauth hangt af van Supabase-configuratie. |
| PIN-inloggen | Zescijferige PIN, PBKDF2-SHA-256-hashing en lokale rate limiting na mislukte pogingen. | Lokaal operationeel; fixturegebruik alleen buiten productiebuild. |
| Registratie | Account-, winkel- en onboardinggegevens kunnen worden geregistreerd. | Live geverifieerd; zonder expliciete, volledige V2-retailconfiguratie wordt eigenaarsregistratie server-side geweigerd. |
| Wachtwoord instellen/herstellen | Routeherkenning voor invite/recovery en een afzonderlijk set-password-scherm. | Geïmplementeerd; afhankelijk van Supabase-authflow. |
| Rollen | Kassier, manager en eigenaar; UI- en actiebeperkingen op rol. | Geïmplementeerd. Server-RLS/rolhelpers bestaan in initiële migratie. |
| Teambeheer | Eigenaar kan medewerkers maken/bewerken, POS-toegang intrekken, rol, contact, contracturen, patroon en PIN beheren. | Geïmplementeerd; geavanceerd teamrecht is Enterprise in planmatrix. |
| Winkel-/bedrijfsprofiel | Naam, juridische gegevens, adres, btw, contact, website, footer en retourbeleid voor documenten. | Geïmplementeerd; lokaal bewaard en tenant-instellingen kunnen syncen. |
| Onboarding | Branche, verkoopmodel, teamgrootte, databron, prijsmodel, standaard-btw, servicecontact en modules. | Geïmplementeerd; sectorpresets sturen alleen aanbevelingen. |
| Thema | Licht/donker thema. | Geïmplementeerd en standaard beschikbaar. |
| Fullscreen POS | Fullscreenbediening in layout. | Geïmplementeerd; browsertoestemming/-ondersteuning vereist. |
| Sneltoetsen en globale scaninvoer | POS-navigatie via Alt-toetsen en keyboard-wedge barcodebuffer. | Geïmplementeerd; geen plan-gate aangetroffen. |

Bewijs: [auth store](src/auth/useAuth.ts), [profiel](src/components/Profile.tsx), [wizard](src/onboarding/OnboardingWizard.tsx), [layout](src/components/Layout.tsx).

## 2. POS, winkelmand en betaling

| Feature | Concreet gedrag | Status / activatie |
| --- | --- | --- |
| Productverkoop | Producten vanuit menu/zoekresultaat in een actieve mand; aantallen, regel-id’s en voorraadcontrole. | Geïmplementeerd; Basis-recht `pos.checkout`. |
| Productzoeker | Zoekt op naam, SKU, barcode en catalogusvelden. | Geïmplementeerd; standaard beschikbaar. |
| Scannerondersteuning | Keyboard-wedge scan, directe producttoevoeging en feedback bij herkenning/uitverkocht; ticketbarcode wordt als retourroute herkend. | Geïmplementeerd; standaard beschikbaar. |
| Categoriefilters | Categorie, subcategorie, merk, zoekopdracht en “meer laden”. | Geïmplementeerd. |
| Regelbewerking | Aantallen, notities en modifiers per verkoopregel. | Geïmplementeerd. |
| Klant koppelen | Klant koppelen/ontkoppelen aan een actieve verkoop. | Clientflow aanwezig; CRM-UI zelf is Pro/Enterprise. |
| Prijsafspraken | Klantprijs-groepen en vaste prijs-tiers per product. | Geïmplementeerd in datamodel en klant/catalogusflow. |
| Kortingen | Winkelmandkorting met reden; managergoedgekeurde korting kan server-side single-use worden gevalideerd/verbruikt. | Geïmplementeerd; server-RPC/migratie aanwezig. Geen afzonderlijke entitlement-key aangetroffen. |
| Cash | Ontvangen bedrag, wisselgeld en Belgische afrondingscorrectie op 5 eurocent. | Geïmplementeerd; Basis checkout. |
| Kaart/PIN | Kassabetaling als tender `PIN`. | Geïmplementeerd als registratie; geen aangetroffen echte betaalterminal-capture/provider. |
| Split tender | Cash/PIN/cadeaubon-tenders in één transactie, met validatie van resterend bedrag. | Geïmplementeerd. |
| Cadeaubon als betaalmiddel | Allocaties op kaartniveau, saldo na gebruik en combinatie met cash/PIN. | Implementatie aanwezig; de gecontroleerde production-dotenv zet deze buildflag aan. `.env.example` blijft een conservatieve kill-switchdefault tonen. |
| Betaling met meerdere cadeaubonnen | Modal kan gekoppelde en handmatig ingegeven kaarten toewijzen. | Geïmplementeerd, onder dezelfde cadeaubonbetaalflow. |
| Documentkeuze | Bon, B2C-factuur of B2B-factuur vóór betaling. | Geïmplementeerd. |
| Factuurklant | Zoeken/selecteren of vastleggen van gefixeerde factuurontvanger; btw- en PO-velden. | Geïmplementeerd. |
| Idempotente checkout | Client request-id; lokale unieke index en server-RPC verwerken retries/dubbelklik niet als tweede verkoop. | Lokaal operationeel én serverpad aanwezig. |
| Atomaire lokale checkout | Transactie, regels, voorraad, klanten, cadeaubongebeurtenissen, audit, outbox en bewegingen binnen Dexie-transactie. | Lokaal operationeel. |
| Servercheckout | `checkout_sale` RPC met tenders, cadeaukaartallocaties, managerapproval, factuurklant en documentgegevens. | Serverpad live; generieke btw-snapshotpatch voor 0/6/12/21% gecontroleerd. |
| Mand parkeren/hervatten/verwijderen | Suspended carts per winkel, met bevestigingsdialogs. | Geïmplementeerd; lokaal. |
| Mand annuleren | Reden, audit en optioneel mand parkeren. | Geïmplementeerd. |
| Bonweergave/print | Ticketweergave en printflow. | Geïmplementeerd; fysieke uitvoer browser/hardware-afhankelijk. |
| Ontvangstbewijsbarcode | Code 128-achtige vaste ticketlookup-code, servergenerator/validatie en scanroute. | Geïmplementeerd; serverpad aanwezig. |

Bewijs: [kassamand](src/components/Cart.tsx), [checkoutservice](src/services/checkout.ts), [store](src/store/useStore.ts), [cash-afronding](src/utils/cashRounding.ts), [servercheckout](supabase/migrations/20260816130000_receipt_barcodes.sql), [kortinggoedkeuring](supabase/migrations/20260820140000_pos_discount_approvals.sql).

## 3. Retouren, facturen, historiek en audit

| Feature | Concreet gedrag | Status / activatie |
| --- | --- | --- |
| Verkoophistoriek | Tabs voor verkopen, Z-rapporten en audit; zoeken, perioden, betaalfilter en sortering. | Kernwerkruimte: altijd zichtbaar, ook bij beperkt plan. |
| Beperkte/volledige historie | Basis toont beperkte retentie volgens commerciële matrix; `history.full` is Pro/Enterprise. | Plan-gate aanwezig. Exacte serverretentie wordt niet in de client hard afgedwongen. |
| Ticket op barcode openen | Scandialoog voor retourticket. | Geïmplementeerd; serverlookup-RPC bestaat. |
| Gedeeltelijke retour | Retourneerbare aantallen per regel, verplichte reden, betaalwijze en koppeling met origineel. | Geïmplementeerd. |
| Retourbestemming voorraad | Sellable, quarantaine, defect of leverancier-retour; alleen sellable terug naar verkoopbare voorraad. | Geïmplementeerd; servermigratie aanwezig. |
| Negatieve correctie | Aparte refund-transactie, origineel blijft behouden. | Lokaal operationeel én `refund_sale` serverpad aanwezig. |
| Factuurpreview en PDF | Voorvertoning en PDF-download van uitgegeven factuur/creditdocument. | Geïmplementeerd in browser. |
| Documentnummering | Optimistische lokale gegevens worden na serverbevestiging met canonical document- en factuurnummer verzoend. | Lokaal + live serverpad. |
| CSV- en JSON-export | Exporteert verkopen, rapporten en auditregels vanuit historiek. | Geïmplementeerd; auditexportrecht is Enterprise voor de volledige auditviewer/export. |
| Auditlog | Lokale append-only audit plus best-effort `append_audit` RPC. | Geïmplementeerd. Volledige auditviewer: Enterprise (`audit.viewer`); export: Enterprise (`audit.export`). |
| Voidregistratie | Datamodel/tabel en server-RPC voor void entries. | Server- en lokale schema-ondersteuning aanwezig; geen zelfstandige hoofdschermflow vastgesteld buiten mandannulering. |

Bewijs: [historiek](src/components/AuditLog.tsx), [refundservice](src/services/refunds.ts), [factuur-PDF](src/utils/invoicePdfGenerator.ts), [return dispositions](supabase/migrations/20260820111500_return_dispositions.sql), [audit/void RPC](supabase/migrations/20260811125500_tenant_audit_and_void_rpc.sql).

## 4. Dagafsluiting, rapportering en financiële controles

| Feature | Concreet gedrag | Status / activatie |
| --- | --- | --- |
| X-/dagoverzicht vóór sluiten | Transacties, cadeaukaart-events, shiftgegevens en sorteermogelijkheden. | Geïmplementeerd. |
| Z-rapport sluiten | Opening float, geteld cash, verschilreden en expliciete checks vóór finaliseren. | Basis-recht `reports.z`; lokaal en serverpad aanwezig. |
| Cashreconciliatie | Verwacht versus geteld cash, verschil en vereiste reden. | Geïmplementeerd. |
| Betaalmix | Cash, PIN, cadeaubon, split tender en afrondingsinvloed in rapportage. | Geïmplementeerd. |
| Belgische btw-uitsplitsing | 0/6/12/21%-subtotalen, excl./incl. btw, btwbedragen en immutable transactiesnapshot in rapporten/bonnen. | Geïmplementeerd en live gevalideerd. |
| Marge/cost of goods | Kostprijs, brutowinst en marge in rapportage/insights. | Geïmplementeerd waar kostprijzen aanwezig zijn. |
| Hashketen | SHA-256-relatie met vorig Z-rapport en verificatie van opgeslagen report-payload. | Geïmplementeerd in lokale rapportflow. |
| Server-authoritatief Z-rapport | Server-RPC finaliseert na synchronisatie van onderliggende financiële ledger. | Live serverpad; V4-btwtotalen en cashafronding zitten in de hashbasis. |
| Z-rapportdetails | Rapport- en dagsamenvattingen plus productregels in aparte servermigratie. | Geïmplementeerd; serverpad aanwezig. |
| Printen | Printversie van X/Z-overzicht via browserprint. | Geïmplementeerd; browser/printerafhankelijk. |

Bewijs: [ZReport UI](src/components/ZReport.tsx), [rapportberekening](src/utils/report.ts), [Z-PDF](src/utils/zReportPdf.ts), [serverfinalisatie](supabase/migrations/20260812140000_server_authoritative_z_reports.sql), [detailmigratie](supabase/migrations/20260812142000_z_report_history_details.sql).

## 5. Catalogus, voorraad en labels

| Feature | Concreet gedrag | Status / activatie |
| --- | --- | --- |
| Productbeheer | Aanmaken, wijzigen, archiveren/herstellen en actieve status. | Geïmplementeerd; activatielimiet Basis 250, Pro/Enterprise onbeperkt. |
| Productvelden | Naam, categorie/subcategorie, merk, leverancier, leveranciercode, variant, SKU, barcode, verkoopprijs, kostprijs, btw, kleur, voorraad, minimumvoorraad, producttype en custom fields. | Geïmplementeerd in model/UI/sync. |
| Producttypes | Merchandise, service en gift-card; gift-cardwaarde wordt niet als merchandise-omzet/marge behandeld. | Geïmplementeerd. |
| Prijstiers | Deterministische prijs per klantgroep naast normale prijs. | Geïmplementeerd. |
| Categoriebeheer | Categorieën met btw, sortering en actieve status; archiveren/herstellen. | Geïmplementeerd; Basislimiet 5, Pro/Enterprise onbeperkt. |
| Hiërarchische categorieën | Parent/child-relaties per tenant met server-side cycluspreventie. | Geïmplementeerd en live gecontroleerd; 0 cycli. |
| Productfamilies en varianten | Eén familie met meerdere verkoopbare SKU’s, optie-definities/-waarden en een unieke optie-signature. | Geïmplementeerd in import, sync, POS-cache en webshop; 308/308 bestaande SKU’s veilig als één-variantfamilie gebackfilld. |
| Meerdere identifiers | Interne SKU, EAN, UPC, GTIN, leveranciers- en alternatieve codes met primaire/scannable status. | Geïmplementeerd in import, serverrelaties, POS-lookup en realtime sync; collisions server-side geblokkeerd. |
| SKU/barcode-validatie | Dubbele SKU/barcode-controles, productlookup en scanmatching. | Geïmplementeerd. |
| CSV-export | Catalogusexport. | Geïmplementeerd en niet door CSV-importflag geblokkeerd. |
| CSV-import | Kolom-, bedrag-, btw-, SKU- en barcodevalidatie in Productbeheer. | Implementatie aanwezig maar **standaard uit** (`VITE_ENABLE_CSV_IMPORT=false` zonder override); control-plane kan per tenant overschrijven. |
| XLSX/CSV migratie-import | Integration Hub leest CSV/XLSX, stelt mappings voor, toont validatie, activeert met safety ledger en kan undo vóór echte activiteit. | Geïmplementeerd; bereikbaar alleen als Integration Hub-module aan én entitlement `integrations.configure` aanwezig is. Dit is een aparte flow van de standaard CSV-importknop. |
| Voorraadmutaties | POS-sale, retour, webshop-reserveren/vrijgeven/commit, ontvangst PO en gecontroleerde telling/correctie. | Geïmplementeerd; local en/of serverpad afhankelijk van flow. |
| Diep voorraadmodel | Locaties, lots, serienummers, decimale basiseenheden, verpakkingen, balansen en private append-only ledger. | Relational foundation live en veilig; niet automatisch ingeschakeld. Activatie blijft geblokkeerd zolang de bijbehorende operationele mutatieflow ontbreekt. |
| Voorraadtelling/correctie | Cycle count, opening balance, damage, loss, found, other, met reden. | Geïmplementeerd; server-RPC/tabel aanwezig. |
| Barcode-etiketten | Labelgenerator en printdialog voor product/SKU/barcode. | Pro/Enterprise (`catalog.labels`). |
| Dymo/Zebra claim | De UI/generator maakt labels; geen bewezen directe Dymo- of Zebra-SDK/driverkoppeling aangetroffen. | Geen directe hardwareintegratie als feit geclassificeerd. |

Bewijs: [productstore](src/store/useProducts.ts), [categorieën](src/store/useCategories.ts), [productbeheer](src/components/ProductAdmin.tsx), [importparser](src/utils/integrationImport.ts), [migratiehub](src/components/IntegrationHub.tsx), [voorraadcorrecties](src/services/inventoryAdjustments.ts), [server inventory count](supabase/migrations/20260820110000_inventory_count_controls.sql), [labels](src/components/BarcodeLabelPrint.tsx).

## 6. Inkoop, forecast en retail intelligence

| Feature | Concreet gedrag | Status / activatie |
| --- | --- | --- |
| Verkoopdashboard | Omzet, marge, producten, categorieën, betaalmix en actuele actiekaarten. | Geïmplementeerd; module `insights` aan + `insights.advanced` (Pro/Enterprise). |
| Productprestatie | Rangschikking op omzet/marge/andere metrics met categoriefilter. | Geïmplementeerd. |
| Verkoopmomenten | Analyse per tijdstip/weekdag. | Geïmplementeerd. |
| Kortinganalyse | Analyse van kortingen. | Geïmplementeerd. |
| Voorraadoverzicht | Low stock, voorraadstatus en vervolgacties. | Geïmplementeerd. |
| Verkoopsnelheid | Velocity en groepen stagnant/slow/healthy. | Geïmplementeerd. |
| Seizoensanalyse | Vooruitblik, ritme en categoriepatronen. | Geïmplementeerd. |
| Klantanalyse | Overzicht, herhaalaankopen, klantwaarde en datakwaliteit. | Geïmplementeerd; werkt alleen op aanwezige klant-/transactiedata. |
| Teamanalyse | Teamoverzicht en weekdagen. | Geïmplementeerd. |
| Actieworkflow | Acties opslaan, uitstellen of afronden; wijzigingen voeren niet autonoom voorraad of externe acties uit. | Geïmplementeerd; browseropslag. |
| Voorraadprognose | Days-of-cover, stockoutdatum, trend, confidence, intermitterende vraag en seizoenscorrectie. | Enterprise (`inventory.forecast`). |
| Besteladvies | Suggesties per product/leverancier, handmatig aanpasbaar. | Enterprise in praktijk via forecast/PO gates. |
| Purchase orders | Concepten, regels, leveranciersreferentie, gedeeltelijke ontvangst en voorraadtoename. | Maken vereist Enterprise `purchase_orders.create`; bestaande data is lokaal/servergesynchroniseerd waar mogelijk. |

Bewijs: [Insights](src/components/Insights.tsx), [Insights-navigatie](src/components/insights/InsightsSidebar.tsx), [forecast](src/components/InventoryForecast.tsx), [PO-workflow](src/components/PurchaseOrderWorkflow.tsx), [forecastalgoritmen](src/utils/retailIntelligence.ts), [seizoensalgoritmen](src/utils/seasonalRetail.ts).

## 7. Klanten, loyaliteit en cadeaubonnen

| Feature | Concreet gedrag | Status / activatie |
| --- | --- | --- |
| Klantendossiers | Naam, e-mail, telefoon, adres, notities, activiteit, omzet, bezoeken, laatste bezoek en aankoopgeschiedenis. | CRM: Pro/Enterprise (`customers.crm`) en module aan voor navigatie. |
| Klantzoeken/filteren/sorteren | Activiteit, aankoopgedrag, contactkwaliteit, omzet en cadeaubonrelatie; desktop/mobile weergaven. | Geïmplementeerd binnen CRM. |
| Archiveren/herstellen klant | Soft delete met herstel. | Geïmplementeerd. |
| Facturen vanuit klant | Transacties/facturen bekijken, previewen en downloaden vanuit dossier. | Geïmplementeerd. |
| Loyalty | Puntenconcept en instellingen. | Pro/Enterprise (`loyalty.manage`). |
| VIP-/prijssegment | Klantprijs-groep wordt bewaard/gebruikt in prijsflow. | Geïmplementeerd. |
| Cadeaubon uitgeven | Unieke code, initieel saldo, klantkoppeling, betaling en vervaldatum/status. | Pro/Enterprise (`gift_cards.issue`). |
| Opwaarderen | Nieuwe gebeurtenis met bedrag en betaalwijze. | Pro/Enterprise (`gift_cards.issue`). |
| Blokkeren/heractiveren | Statusactie met reden. | Geïmplementeerd binnen cadeaubonbeheer. |
| Append-only ledger | Gebeurtenissen bevatten saldo vóór/na en zijn idempotent; transactiegeschiedenis is raadpleegbaar. | Lokaal operationeel én server-RPC/migraties aanwezig. |
| Cadeaubon in POS | Raadplegen/toewijzen als tender op kaartniveau. | Zie buildflag bij POS; niet gelijk aan het recht voor uitgifte. |

Bewijs: [klantencomponent](src/components/Customers.tsx), [giftcardlogica](src/utils/giftCards.ts), [servergiftcards](src/services/supabaseGiftCards.ts), [giftcard-RPC](supabase/migrations/20260811121500_tenant_gift_card_rpc.sql).

## 8. Webshop en publieke storefront

| Feature | Concreet gedrag | Status / activatie |
| --- | --- | --- |
| Publieke route | `/shop` en subpaden renderen storefront; externe router is niet vereist. | Geïmplementeerd. |
| Storefrontcatalogus | Zelfde productdata, alleen beschikbare/zichtbare webshopproducten, categorieën, merk-, prijs- en beschikbaarheidsfilters. | Geïmplementeerd. |
| Branding/design | Shopnaam, kleuren, logo/hero, beelden en beschrijvingen. | Webshopbeheer: Pro/Enterprise + webshopmodule. |
| Assortimentsbeheer | Productzichtbaarheid, uitgebreide copy, afbeeldingen en featured products. | Pro/Enterprise + module. |
| Variants/sku in webshop | Variant/SKU gaat mee met orderregel. | Geïmplementeerd. |
| Winkelmand | Persistente storefrontcart in browser. | Geïmplementeerd. |
| Coupons | Couponinvoer en kortingsregels in storefrontbeheer/checkout. | Geïmplementeerd. |
| Levering en afhalen | Verzendkost, gratis-drempel, pickup-adres/instructies en leveringadres. | Geïmplementeerd. |
| Bestelnotitie | Optionele klantnotitie als instelling ingeschakeld. | Geïmplementeerd. |
| Webshopcheckout | Contact, levering, betaalmethode, idempotencykey en bedragen worden gevalideerd. | Geïmplementeerd. |
| Voorraadreservering | Reserveert voorraad atomair bij lokale order; bij annulatie vrijgeven, bij verzending/afhaling definitief committen. | Lokaal operationeel. Serverorder-RPC’s bestaan ook. |
| Orderbeheer | Status, payment status en fulfilment status; bevestigen, verwerken, verzenden, afhalen, annuleren. | Geïmplementeerd; beheer onder webshopmodule/plan. |
| Centrale publieke catalogus/order | `get_public_webshop`, `place_public_webshop_order` en `update_webshop_order` bestaan in Supabase-migraties/services. | Serverpad live aanwezig; tenantinhoud en externe orderafhandeling blijven runtime-afhankelijk. |
| Externe online betaling | Betaalmethode wordt geregistreerd, maar geen payment-service-provider/capture/webhookimplementatie aangetroffen. | **Niet als live payment processing geclassificeerd.** |
| E-mailbevestigingen | Geen verzendende mailprovider/service aangetroffen. | **Niet geïmplementeerd als externe mailaflevering.** |
| Refunds webshop | Geen aparte externe payment-refundimplementatie aangetroffen. | **Niet als live refund processing geclassificeerd.** |

Bewijs: [storefront](src/components/Storefront.tsx), [webshopinstellingen](src/components/WebshopSettings.tsx), [orders](src/components/WebshopOrders.tsx), [commerce gateway](src/services/webshopCommerce.ts), [publieke webshop](src/services/publicWebshop.ts), [live orders migratie](supabase/migrations/20260812123000_live_webshop_orders.sql).

## 9. ServiceDesk / herstellingen

| Feature | Concreet gedrag | Status / activatie |
| --- | --- | --- |
| Hersteldossier | Intake voor klant, toestel/asset, type, merk, model, serienummer/IMEI/MAC/frame/artikelnummer, accessoires, probleem en conditie. | Pro/Enterprise (`service.orders`) + servicemodule aan. |
| Bestaande of losse klant | Koppelen met actieve klant of losse gegevens bij intake. | Geïmplementeerd. |
| Prijsopbouw | Diagnose, werkuren, onderdelen, overig en voorschot. | Geïmplementeerd. |
| Status en substatus | Dossierstatus, detail, diagnose, oplossing en externe RMA/ticket/leveranciersreferentie. | Geïmplementeerd. |
| Interne notities | Interne notitie die als niet-klantzichtbaar wordt aangeduid. | Geïmplementeerd. |
| Foto-intake | Maximaal 5 afbeeldingen van 5 MB, als data-URL in de flow. | Implementatie aanwezig; entitlement `service.attachments` is Enterprise. |
| Technicustoewijzing | Entitlement-key en commerciële matrix bestaan. | Key/matrix aanwezig; geen volledige UI-/backendeindflow bewezen in deze audit. |
| SMS-notificaties | Entitlement-key en commerciële matrix bestaan. | Key/matrix aanwezig; geen SMS-provider of aflevercode aangetroffen. Dus niet als live SMS geclassificeerd. |
| Actieve-dossierlimiet | Pro max. 50, Enterprise onbeperkt, servercontrole in `save_service_order`. | Server- en cliententitlement aanwezig. |
| Publieke trackingspagina | `/service/<token>` haalt publiek dossier op en toont beperkte status. | Geïmplementeerd; server-RPC `get_public_service_order` aanwezig. |

Bewijs: [ServiceDesk](src/components/ServiceDesk.tsx), [serviceorderservice](src/services/serviceOrders.ts), [publieke tracking](src/public/ServiceTracking.tsx), [service migratie](supabase/migrations/20260813153000_integration_hub_and_service_orders.sql), [complete entitlementmigratie](supabase/migrations/20260814160000_complete_plan_entitlements.sql).

## 10. Workforce, planning en verlof

| Feature | Concreet gedrag | Status / activatie |
| --- | --- | --- |
| Personeelsrooster | Weekrooster met werknemers, shifts, kalenderdagen en bezettingsinformatie. | Enterprise `workforce.core` + workforcemodule aan. |
| Shifts beheren | Toevoegen, wijzigen en verwijderen van shifts. | Geïmplementeerd; server-RPC wrappers enforce Enterprise. |
| Werkpatronen | Patronen opslaan, toepassen en week kopiëren. | Geïmplementeerd; serverpad aanwezig. |
| Rooster publiceren/heropenen | Publicatie- en heropenworkflow met events. | Geïmplementeerd; serverpad aanwezig. |
| Verlof aanvragen | Werknemer kan aanvraag indienen/terugtrekken; segmenten, saldi en coverage worden verwerkt. | Geïmplementeerd; Enterprise. |
| Verlofgoedkeuring | Owner/goedkeurder behandelt aanvraag met persoonlijke PIN, verplichte afwijsreden en geen zelfbeslissing. | Geïmplementeerd; Enterprise en owner-/managerchecks. |
| Saldi | Verloftypes, rekeningen, ledger en handmatige saldoaanpassing. | Geïmplementeerd; Enterprise. |
| Contracturen en beschikbaarheid | Contractweek, werkpatronen, availability exceptions, competenties en coverage rules in schema/workforceflow. | Datamodel en serverlogica aanwezig; UI-dekking varieert per onderdeel. |

Bewijs: [workforce UI](src/components/Workforce.tsx), [planningweergaven](src/components/workforce/WorkforcePlanningViews.tsx), [workforce store](src/store/useWorkforce.ts), [workforce schema/RPC](supabase/migrations/20260813233000_workforce_leave_and_module_navigation.sql), [Enterprise wrappers](supabase/migrations/20260814160000_complete_plan_entitlements.sql).

## 11. Integratie-, import- en migratiebeheer

| Feature | Concreet gedrag | Status / activatie |
| --- | --- | --- |
| Integration Hub | Importwerkruimte voor catalogus en klanten met drag/drop/bestandkiezer, voorbeeldbestand, mapping, preview, issues en reviewbevestiging. | Pro/Enterprise (`integrations.configure`) + catalogmodule. |
| CSV/XLSX parsing | CSV en Excel parsing, mappinginference, normalisatie en validatie. | Geïmplementeerd in browser. |
| Veilig activeren/undo | Alleen creatie, activation ledger, inverse changes en lock; volledige undo mogelijk tot eerste echte activiteit. | Geïmplementeerd lokaal; servermigratiecommando’s/outbox bestaan. |
| Fictieve testzaak | Realistische telecomfixture doorloopt dezelfde mapping/safety-ledger. | Geïmplementeerd als demo/testdata, niet als productiedata. |
| Tenanttelemetrie voor import | Run-id, status, tellingen, foutfingerprint, mapping summary en event timeline zonder ruwe payload. | Serverpad aanwezig; best effort. |
| Algemene integratieconfiguratie | Naam/provider/categorie, endpoint, authvorm, resource, richting, schema en veldmappings. | UI/store aanwezig, Pro/Enterprise. |
| Geheimen in integratieconfig | Alleen masked hint wordt bewaard in lokale store. | Implementatie aanwezig; geen bewezen secret vault/serversecret-opslag in de geaudite code. |
| Verbindingstest | Controleert lokaal alleen endpointprotocol en of credential is gemarkeerd; wacht 550 ms. | **Gesimuleerd**, geen HTTP/SFTP/OAuth-call aangetroffen. |
| Handmatige sync | Simuleert recordaantal/status na 700 ms. | **Gesimuleerd**, geen connector-dataoverdracht aangetroffen. |
| Webhooks beheren | Webhookrecords, eventselectie, activeren/revoken en lokale test/status/log. | Entitlement Enterprise (`webhooks.manage`); **geen daadwerkelijke HTTP-deliveryservice aangetroffen**. |
| REST API-sleutels | Lokale API-keyrecords met prefix/scopes, expiratie, revoke en log. | Entitlement Enterprise (`api.access`); **geen REST API-server aangetroffen**. |
| Accounting/commerce/providerintegraties | Categorieën en configuratievelden bestaan. | **Geen concrete providerconnectoren aangetroffen**; niet als verbonden integratie classificeren. |

Bewijs: [Integration Hub](src/components/IntegrationHub.tsx), [integratiestore](src/store/useIntegrations.ts), [migratieactivatie](src/services/migrationActivation.ts), [migratie-sync](src/services/migrationSync.ts), [integration telemetry](src/services/integrationOperations.ts), [safety commands](supabase/migrations/20260815070000_migration_safety_commands.sql).

## 12. Hardware en klantendisplay

| Feature | Concreet gedrag | Status / activatie |
| --- | --- | --- |
| Thermische bonprinter | WebUSB-hook met Epson TM-T20/T20II/T20III/T88V IDs, open/select/claim interface, raw ESC/POS versturen en disconnect cleanup. | Geïmplementeerd; Chromium/WebUSB, veilige context en compatibele fysieke printer vereist. |
| ESC/POS bonnen | Builder/formatteerlogica voor tickets. | Geïmplementeerd. |
| Barcodescanner | Keyboard-wedge scanning in layout, plus profielinstellingen. | Geïmplementeerd; geen native hardwaredriver nodig. |
| Kassalade | Instellingen/UI aanwezig. | Geavanceerde hardware: Pro/Enterprise; geen bevestigde fysieke driver/protocolflow in audit. |
| Betaalterminal | Host/poortinstellingen en UI. | Geavanceerde hardware: Pro/Enterprise; **geen terminaltransactie/capture-provider aangetroffen**. |
| Weegschaal | Instellingen/UI. | Geavanceerde hardware: Pro/Enterprise; **geen apparaatprotocol/koppeling aangetroffen**. |
| Dual-screen klantendisplay | Afzonderlijke route `/customer-display`, local session/BroadcastChannel-protocol, handdruk/heartbeat/stale detection, mandprojectie, betaalstatus en success-scherm. | Pro/Enterprise (`customer_display.local`), werkt lokaal tussen browsercontexten; geen netwerkdisplay-protocol aangetroffen. |
| Displayconfiguratie | Per winkelregister opgeslagen instellingen en openen vanuit POS. | Geïmplementeerd; plan-gate. |

Bewijs: [thermal printer hook](src/hooks/useThermalPrinter.ts), [ESC/POS](src/utils/escpos.ts), [profiel hardware](src/components/Profile.tsx), [customer display app](src/customer-display/CustomerDisplayApp.tsx), [publisher](src/customer-display/CustomerDisplayPublisher.tsx), [protocol](src/customer-display/protocol.ts).

## 13. Synchronisatie, offline-first en datalaag

| Feature | Concreet gedrag | Status / activatie |
| --- | --- | --- |
| Offline lokale opslag | Per tenant IndexedDB/Dexie-database voor transacties, rapporten, audit, gebruikers, outbox, shifts, catalogus, klanten, giftcards, acties, PO’s, voorraad, webshop, imports, migraties en serviceorders. | Geïmplementeerd; kern van lokale werking. |
| Tenant-isolatie lokaal | Database heet `PwaymentRetailPOS:<storeId>` wanneer winkel bekend is. | Geïmplementeerd. |
| Outbox | Lokale mutaties worden als events bewaard en door worker naar Supabase gepusht bij configuratie/connectiviteit. | Geïmplementeerd; aflevering is best effort en serverconfiguratie-afhankelijk. |
| Financiële sync | Checkout, refund, giftcards, Z-rapporten en webshoporders kennen serverpushpaden. | Serverpaden aanwezig; niet als live delivery gegarandeerd. |
| Catalogussync | Products/customers/categories upserts naar Supabase. | Serverpad aanwezig. |
| Realtime sync | Supabase `postgres_changes` voor producten, klanten en categorieën naar lokale cache. | Geïmplementeerd wanneer winkel en Supabase zijn geconfigureerd. |
| Conflictstrategie | Geen generieke bidirectionele conflictresolver aangetroffen; specifieke flows zijn idempotent via request-id. | Niet breder claimen dan geïmplementeerde flow. |
| Preload recovery | Herstelpad voor mislukte lazy-loaded chunks. | Geïmplementeerd. |
| PWA/service worker | Productiebouw genereert Workbox-serviceworker; dev/presentatie/E2E verwijdert oude worker/cache bewust. | Geïmplementeerd; in productiebouw geverifieerd. |

Bewijs: [Dexie-schema](src/db/db.ts), [outbox worker](src/services/outboxWorker.ts), [realtime sync](src/services/realtimeSync.ts), [Supabase mutaties](src/services/supabaseMutations.ts), [appstart/PWA](src/main.tsx).

## 14. Publieke website, leads en marketinganalyse

| Feature | Concreet gedrag | Status / activatie |
| --- | --- | --- |
| Marketingwebsite | Home, product-, operationele feature-, solution-, pricing-, resources-, guides-, legal-, about-, migration-, contact- en demo-pagina’s. | Geïmplementeerd; buildcontrole telde 40 routes. |
| Responsive navigatie | Desktop- en mobiele navigatie, dropdowns en toegankelijkheidsattributen. | Geïmplementeerd. |
| Pricing | Centrale plan- en vergelijkingscatalogus; maand/jaar toggle en add-oncalculator in publieke site. | Geïmplementeerd als informatie/UI; geen checkout/provider aangetroffen. |
| Capabilitystatus marketing | Integratie-/hardwarestatussecties op publieke website. | Geïmplementeerd als presentatie-inhoud; vervangt geen technische connectoraudit. |
| Contact/demo-leads | Formulier valideert en roept `submit_public_lead` RPC aan met consenttijdstip/bronpad. | Serverpad aanwezig; zonder Supabase-configuratie verschijnt geen succesvolle opslag. |
| Publieke events | `submit_public_event`-migratie voor marketingevents. | Serverfunctie/tabel aanwezig; client-call moet per event in code bestaan. |
| SEO | Gegenereerde sitemap en robots voor indexeerbare routes; metadata. | Geïmplementeerd en build geverifieerd. |
| PWA/offline app-shell | Zie sectie 13. | Geïmplementeerd in productiebouw. |

Bewijs: [PublicSite](src/public/PublicSite.tsx), [leads](src/services/publicLeads.ts), [public leads migratie](supabase/migrations/20260812120000_public_marketing_leads.sql), [buildscript](scripts/generate-public-site-assets.mjs).

## 15. Platformconsole en operationeel beheer

| Feature | Concreet gedrag | Status / activatie |
| --- | --- | --- |
| Admin-route | `/admin` met routeparser en afzonderlijke AdminApp. | Geïmplementeerd; server-session/platformentitlements bepalen feitelijke toegang. |
| Platformoverzicht | Overzicht met stores, gezondheid, incidents en status. | UI + server-RPC aanwezig. |
| Tenantlijst/details | Winkels zoeken/openen; detail inclusief subscription, health en integration runs. | UI + server-RPC aanwezig. |
| Tenant subscription controls | Plan/status bijwerken met reden. | UI + `platform_update_store_subscription` RPC aanwezig. |
| Tenant verwijderen | Naambevestiging en reden; RPC voor delete. | UI + server-RPC aanwezig; destructieve actie, niet uitgevoerd in audit. |
| Incidentbeheer | Incidents listing en status/note update. | UI + server-RPC aanwezig. |
| Health monitoring | Store health snapshots/events en platform incidents. | Servermigraties + client monitoringstart aanwezig. |
| Releases/feature governance | Platform release records met draft/review/approved/live/rolled_back en tenant-/targeting. | Servermigraties/UI aanwezig; concrete live releases niet vastgesteld. |
| Platform feature flags | Per-store flags via `get_store_platform_feature_flags`. | Serverpad aanwezig; client gebruikt dit momenteel expliciet voor `csv_import`. |
| Support access grants | Servermodel/RPC’s voor tijdelijke supporttoegang. | Serverpad aanwezig; geen runtime grants vastgesteld. |
| Development log | GitHub-pushhistoriek met commits en changenotities. | UI + ingest/list serverpaden aanwezig. Een Vercel serverless endpoint valideert GitHub HMAC-SHA-256 en schrijft pushrecords via een service-role RPC. Of de vereiste Vercel-secrets en GitHub-webhook live zijn ingesteld, is niet vastgesteld. |
| Integration operation timeline | Server-side runs/events per tenant, zonder ruwe klantpayloads. | UI + serverpad aanwezig. |

Bewijs: [AdminApp](src/admin/AdminApp.tsx), [tenant controls](src/admin/TenantControls.tsx), [platform API](src/admin/platformApi.ts), [governance migration](supabase/migrations/20260815000000_platform_governance_and_releases.sql), [platform console](supabase/migrations/20260814210000_platform_console.sql), [reliability](supabase/migrations/20260814230000_platform_console_reliability.sql).

---

# Wat niet als “actief/live” mag worden geclaimd op basis van deze code

De volgende onderscheidingen zijn essentieel om geen marketingclaim als technische realiteit te behandelen:

1. **Echte betaalverwerking:** PIN/kaart is een POS-tenderregistratie. Er is geen payment acquirer, terminal-SDK of capture/settlement-service gevonden.
2. **Externe integraties:** de Integration Hub en de algemene integratiestore zijn functioneel als configuratie-, import- en simulatie-UI. Verbindingstest en sync voeren geen echte provider-call uit; REST API en webhooks hebben geen aangetroffen server/delivery worker.
3. **SMS en e-mail:** er is geen SMS-provider of transactionele e-mailaflevering aangetroffen. De webshop kan een e-mailadres opslaan in een order maar niet aantoonbaar mail versturen.
4. **Dymo/Zebra- en terminal/weegschaalkoppeling:** instellingen/labels bestaan, maar geen directe SDK/driver/protocolimplementatie werd gevonden. Alleen WebUSB/ESC-POS voor Epson-compatibele thermische printers is concreet aanwezig.
5. **Live tenantstatus:** de production build heeft een aantoonbaar geconfigureerde Supabase-target, maar zonder geautoriseerde live `get_store_entitlements`/`get_store_platform_feature_flags`-response is niet vast te stellen welke betaalde rechten of control-plane overrides op een specifieke winkel actief zijn.
6. **Diepe inventory-workflows:** de live relational foundation bewijst nog geen volledige locatie-, lot-, serial-, meet- of verpakkingsmutatieflow in de POS. Zulke vereisten worden daarom zichtbaar als `required`/`blocked` behandeld en niet automatisch geactiveerd.

## Concrete antwoord op “wat staat standaard aan?”

- In de **gecontroleerde production buildconfiguratie** staat cadeaukaartbetaling **aan**, CSV-import **uit**, demo-seeding **uit** en legacy-catalogusreset **uit**. CSV-import kan uitsluitend nog veranderen via de server-side `csv_import`-override per winkel; die live override is niet uitleesbaar met de huidige autorisatie.
- In een **development-, presentatie- of E2E-build** geeft de entitlement-store een **Enterprise-snapshot met alle entitlementfeatures aan**. Dat is bewust fixturegedrag en geen productielicentie.
- In een **serververbonden tenant** is de effectieve status afhankelijk van subscription/trial, een eventueel verlopen trial, de eigenaar-keuze voor navigatiemodules en voor CSV-import een mogelijke platformflag override.

## Auditbeperkingen (expliciet)

Deze audit heeft de hierboven opgesomde retailmigraties op de geverifieerde Supabase-instantie uitgevoerd en bestaande stores/producten alleen additief gebackfilld. Er is geen tenant verwijderd, geen betaalprovider of hardware aangestuurd en geen capability stil ingeschakeld. Externe providerfuncties blijven alleen als live geclassificeerd wanneer daarvoor afzonderlijk bewijs bestaat.
