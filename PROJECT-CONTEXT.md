# PWAYMENT — Project Reality

**Statussnapshot: 2 september 2026 · gecontroleerde basis: `main` op `8e6d9d1`, gevalideerd met de lokale releasepatches hieronder**

PWAYMENT is een vergevorderde retail-PWA met een werkende lokale demo en veel uitgewerkte productlogica, maar het is **niet klaar voor een echte winkelpilot of commerciële productie**. Een begeleide demo zonder echte betaalterminal, live juridische gegevens of externe koppelingen kan wel. Een schone tijdelijke checkout slaagt nu voor typecontrole, 666 unittests met coverage, productiebuild, site-/bundelcontrole, dependency-audit en alle 36 browserflows. De compliancecontrole faalt nog door ontbrekende juridische productiegegevens. Hardware, productieconfiguratie en echte providerflows zijn niet bewezen. Dit is dus geen go/no-go op basis van mooie schermen, maar een **NO-GO voor pilot en productie**.

**Hoe deze momentopname is gemaakt.** Bij tegenspraak tellen uitvoerbare code, migraties, tests en gecontroleerde configuratie zwaarder dan plannen, README of UI. De statuswoorden hieronder betekenen: **Proven** = in deze snapshot door een relevante controle bewezen; **Implemented but unproven** = code en/of schema bestaan, maar geen volledig betrouwbaar bewijs in een echte context; **In progress** = lokale of documentatieverandering zonder afgerond bewijs; **Prototype/simulation** = zichtbaar gedrag zonder echte provider- of productieketen; **Blocked externally** = een mens, contract, hardware of omgeving moet eerst iets leveren; **Planned** = richting, geen geleverde functie.

## 1. The product in human language

PWAYMENT wil de dagelijkse kassa en winkelwerking van een Belgische retailer samenbrengen: verkopen, voorraad, klanten, rapportering en aanvullende diensten in één offline-bruikbare webapp. De betrouwbare technische kern is vandaag vooral de lokale productlogica: een winkelmand, lokale dataopslag, voorraad- en financiële berekeningen, bonnen, retouren en dagafsluiting. De centrale laag is ontworpen rond Supabase voor accounts, winkelafbakening en sync; die opzet bestaat in code en migraties, maar is niet hetzelfde als een bewezen productiebedrijf in een echte winkel.

## 2. Reality at a glance

| Area | Status | What works | What is still missing | Why it matters |
| --- | --- | --- | --- | --- |
| POS | Implemented but unproven | Winkelmand, cash, kaartregistratie, cadeaubon, split tender, retour, bon en Z-rapport hebben code, unittests en groene browserflows. | Een echte kassaflow met personeel en hardware is niet aangetoond. | Een kassa moet elke dag foutloos kunnen openen, verkopen en afsluiten. |
| Payments | Prototype/simulation | Mollie API-route, statuspolling en een test-simulator bestaan. | Geactiveerde terminal, productiecredentials, provideracceptatie en reconciliatie in een winkel ontbreken als bewijs. | Een scherm met “betaald” is geen ontvangen geld. |
| Offline / sync | Implemented but unproven | IndexedDB/Dexie-cache, outbox, retry en idempotentie zijn aanwezig. | Herstel bij echte netwerkuitval en conflict-/wachtrijgedrag voor alle nevenstromen is niet bewezen. | Verkoop mag niet verdwijnen of dubbel boeken na een internetstoring. |
| Inventory | Implemented but unproven | Catalogus, varianten, barcodes, bewegingen, tellingen, correcties en purchase-orderlogica bestaan; de browseracceptatie is groen. | Het diepe voorraadmodel is niet als volledige operationele flow in een winkel bewezen. | Voorraadfouten leiden rechtstreeks tot foute verkoop en bestelling. |
| Customers / gift cards | Implemented but unproven | Profielen, historiek, segmentatie, loyalty en gift-cardledger zijn getest in code. | Geen bewijs van een productiepilot met echte klantdata en procedures. | Privacy, saldo en historiek moeten ook buiten een demo kloppen. |
| Reports / finance | Implemented but unproven | Historiek, kasreconciliatie, BTW, retouren, shifts en servergerichte Z-rapportlogica bestaan. | Groene browserflow, echte dagafsluiting en boekhoudkundige acceptatie ontbreken. | Financiële output moet controleerbaar en operationeel bruikbaar zijn. |
| Webshop | Implemented but unproven | Storefront, orderaanmaak en voorraadreservering bestaan. | Productiebetaling, ordermail, foutopvolging en reconciliatie zijn niet geconfigureerd of bewezen. | Een webshoporder zonder betaal- en communicatieketen is geen veilige verkoop. |
| Workforce | Implemented but unproven | Medewerkers, roosters en verlof zijn aanwezig en hun browserflows zijn groen. | POS-operatorgebruik is nieuw en niet op de echte backend of in een winkel bewezen. | Personeelsrechten moeten veilig aansluiten op de fysieke kassa. |
| ServiceDesk | Implemented but unproven | Intake, herstelorder en publieke opvolging bestaan. | Geen uniforme duurzame outbox voor alle mutaties; centrale bijlagenstroom is niet bewezen. | Een klant mag zijn herstelstatus niet kwijt zijn door één toestelprobleem. |
| Integrations | Prototype/simulation | Hub, configuratieschermen, logs en gesimuleerde runs bestaan. | Geen bewezen echte adapter, credentials, duurzame synchronisatie of gecontroleerde writes. | Noem dit geen integratieproduct tegenover een klant. |
| Billing | Prototype/simulation | Plancatalogus en entitlements bestaan. | Geen checkout, abonnement, webhook, factuur, mislukte betaling, opzegging of reconciliatie. | Er is nog geen echte SaaS-betalingscyclus. |
| Public site / onboarding | Implemented but unproven | Registratie, onboarding, publieke routes en formulieren bestaan; sitecontrole slaagt. | Juridische productiegegevens ontbreken; commerciële claims moeten bij bewijs blijven. | Een live site zonder correcte identiteit en teksten blokkeert commerciële lancering. |
| Legal | Blocked externally | Technische compliancecheck en juridische pagina’s bestaan. | Goedgekeurde bedrijfsgegevens, teksten, contracten en operationele procedures ontbreken. | Dit is een harde commerciële en reputatierisico. |
| Hardware | Blocked externally | WebUSB/ESC-POS- en klantenschermcode bestaan. | Exacte terminal, scanner, printer, scherm en storingsherstel zijn niet getest in de winkel. | Hardware is waar een theoretische POS vaak faalt. |
| Deployment / security | Implemented but unproven | Vercel/Supabase deployflow, RLS/migraties en securitycheck bestaan; `npm audit` meldt 0 high-severity kwetsbaarheden en de lokale releaseketen is groen. | Compliancegate in CI en een bewezen live smoke test van dezelfde revisie ontbreken. | Een build is geen veilige release. |

## 3. How the important pieces connect

| Ketting | Werkelijke verbinding | Eind-tot-eind status |
| --- | --- | --- |
| POS sale → voorraad → historiek → Z-rapport → audit | Checkout- en voorraadservices schrijven verkoop- en financiële gegevens; de servermigraties leggen rapportering en audit vast. | **Lokaal browsermatig bewezen.** Unit- en browserketen zijn groen; echte dagafsluiting op terminal/hardware ontbreekt. |
| Browser/PWA → lokale cache/outbox → Supabase → realtime sync | De browser bewaart lokale context in Dexie/IndexedDB en heeft sync-/outboxcode naar Supabase. | **Niet bewezen.** De keten bestaat; uitval, recovery en productie-RLS moeten nog op de echte omgeving worden bewezen. |
| Publieke site → registratie/onboarding → winkeltenant → retail app | Routes, accountflow en provisioningcode bestaan. | **Lokaal browsermatig bewezen.** De live juridische basis is nog niet compleet. |
| Betaalterminal → Mollie-status → geboekte sale | `/api/mollie/payments` maakt/statuscontroleert terminalbetalingen; de client kan ook simuleren. | **Stopt bij provider/hardware.** Er is geen bewijs van een geactiveerde fysieke terminal die een echte sale afrondt. |
| Webshoporder → voorraadreservering → betaling → klantcommunicatie | Order- en reserveringslogica bestaan. | **Stopt na reservering.** Betaling, e-mail en reconciliatie zijn niet productierijp bewezen. |
| Persoonlijke POS-PIN → toestel → operatorattributie → sale/retour/rapport | Vier recente commits voegden operatorcode en vier migraties toe, inclusief PIN-, device- en attributielogica. | **Lokaal browsermatig bewezen.** De gedeelde helper volgt de nieuwe toegangskop; remote migratie en echte gedeelde-kassatest zijn niet bevestigd. |

Onderliggende technische bronnen: [checkout](src/services/checkout.ts), [outbox worker](src/services/outboxWorker.ts), [Mollie-client](src/services/mollieTerminal.ts), [Mollie API](api/mollie/payments.ts), [POS access](src/pos-access), [POS-accessmigraties](supabase/migrations/20260831100000_pos_operator_access.sql) en [attributiemigratie](supabase/migrations/20260831103000_pos_operator_attribution.sql).

## 4. What is safe to rely on today

- **Een lokale, begeleide productdemo.** De huidige code bouwt, de types zijn geldig en 666 unittests in 126 bestanden slagen wanneer lokale, niet-productgerelateerde pitch-artifacts worden uitgesloten. De demo mag geen echte kaartbetaling of wettelijk correcte commerciële lancering voorstellen.
- **Lokale reken- en domeinlogica als ontwikkelbasis.** Geld, BTW, voorraad, cadeaubonnen, retouren, rapportdetails, migraties en POS-PINcode hebben gerichte unittests. Dat is waardevol ontwikkelbewijs, geen winkelacceptatie.
- **Een reproduceerbare frontendbuild en browserreleaseketen.** In een schone tijdelijke checkout slagen typecontrole, 666 unittests met coverage, productiebuild, publieke-sitecontrole, bundelbudget, audit op hoge afhankelijkheidskwetsbaarheden en 36/36 Playwright-flows. De build pre-renderde 123 publieke taalroutes.

Niets in deze lijst bewijst een live Vercel-deploy, toegepaste remote migraties, een echte kaartbetaling, fiscale/boekhoudkundige goedkeuring of werken met personeel op een gedeelde kassa.

## 5. Things that look more complete than they are

- **De nieuwe POS-aanmelding.** De gedeelde Playwright-helper is hersteld van “Voer je PIN in” naar de huidige, toegankelijke kop “Aanmelden op de kassa”; 36/36 browserflows zijn nu groen. Dit bewijst de echte backend-, hardware- of pilotflow nog niet.
- **Mollie-kaartbetaling.** Er is een echte API-route én een simulator. Zonder geactiveerde terminal en bewezen providerflow blijft het een testpad.
- **Integration Hub, billing, API/webhooks, multi-store en Peppol.** Schermen, schema’s of plannen zijn geen operationele leverancierkoppeling. Geen ervan mag als live dienst worden verkocht.
- **Webshop.** Een order en voorraadreservering zijn niet genoeg: zonder betaalstatus, ordermail en reconciliatie blijft de verkoopketen open.
- **ServiceDesk en customer display.** De UI bestaat; duurzame centrale opslag, hardwareopstelling en storingsherstel zijn niet aangetoond.
- **Compliancepagina’s.** De controle faalt momenteel wegens tien ontbrekende juridische waarden. Placeholders of voorbeeldgegevens zouden de gate alleen cosmetisch groen maken en zijn niet aanvaardbaar.

## 6. Production blockers and near-term risks

| Prioriteit | Problem | Impact | What must be true before it is closed | Owner/dependency |
| --- | --- | --- | --- | --- |
| Stop-ship | Juridische productiegegevens en goedgekeurde teksten ontbreken; `check:compliance` faalt. | Geen verantwoorde commerciële publicatie. | Echte KBO/btw/RPR/contactgegevens in productie, juridische review en geslaagde controle na deploy. | Business owner + Belgische jurist. |
| Stop-ship | Geen bewezen productiekaartbetaling of winkelhardware. | Geen betrouwbare echte verkoop op een kassa. | Geactiveerde Mollie-terminal, scanner, printer en scherm getest met succes-, fout- en recoveryscenario’s. | Hardware vendor + Mollie + pilot shop. |
| Stop-ship | Releaseproces bewaakt compliance niet in de Quality-gatesworkflow. | Een revision kan technisch bouwen maar juridisch onvolledig deployen. | `check:compliance` als CI- én deploygate, plus live smoke test van exact de groene revisie. | Development + release owner. |
| Pilot blocker | Nieuwe gedeelde-POS-operatorflow is niet remote gemigreerd of end-to-end bewezen. | Identiteit, rechten en financiële attributie kunnen in een echte winkel falen. | Vier POS-accessmigraties gecontroleerd toegepast; owner/manager/cashier, lockout, offline en attributie in pilot getest. | Development + pilot shop. |
| Pilot blocker | Offline/realtime herstel buiten unittests niet bewezen. | Verlies, dubbelboeking of vastlopende wachtrij bij netwerkuitval. | Gecontroleerde uitval-/recoverytest op een pilotconfiguratie met gecontroleerde uitkomst. | Development + QA. |
| Important soon | Webshop e-mail, betaling en foutopvolging onvolledig. | Onvolledige webverkoop en slechte klantcommunicatie. | Gekozen providers, statusmodel, retries, monitoring en reconciliatie live bewezen. | Product + providers. |
| Important soon | ServiceDesk heeft geen uniforme duurzame outbox en bewezen centrale bijlagen. | Herstelstatus kan apparaatgebonden of onvolledig blijven. | Centrale opslag, retry/recovery en publieke opvolgacceptatie. | Development. |
| Later | Integration Hub, echte billing, multi-store, publieke API/webhooks en Peppol. | Groeifuncties, niet noodzakelijk voor een scherpe POS-pilot. | Elk als afzonderlijk provider- en operationeel project afbakenen en bewijzen. | Product owner + relevante providers. |

## 7. Work currently in progress

De gedeelde werkmap is niet schoon. Dat maakt haar zelf geen releasebasis, ook al zijn de relevante POS-accesscode en vier bijhorende migraties inmiddels **gecommit** op `main` (van `8a734e7` tot `b8ea565`) en `main` inmiddels op `8e6d9d1` staat. Daarom is de releaseketen gecontroleerd in een afzonderlijke, tijdelijke worktree vanaf `8e6d9d1`, met alleen drie niet-gecommitteerde releasepatches: de actuele POS-heading in de E2E-helper, een zelfvoorzienende unit-testconfiguratie en lokaal herstel van een legacy categoriecache. Alle gevraagde lokale gates zijn daar groen. Remote migratiestatus en echte winkelacceptatie blijven open.

Lokaal, niet-gecommit werk bestaat vooral uit gewijzigde audits, README en masterplannen, een gewijzigde gegenereerde `public/sitemap.xml`, en losse pitch- en mailbestanden. Dit bewijst geen productfunctie en mag niet met een release worden verward. Vier ongetrackte `.codex-pitch-*`-mappen bevatten bovendien testachtige bestanden; een gewone `npm test` ontdekte er één. De geslaagde unittestelling hierboven gebruikte expliciete uitsluitingen voor die lokale presentatie-artifacts. Voor een release is een schone checkout verplicht.

## 8. Decisions and facts needed from humans

- Officiële juridische naam, handelsnaam, rechtsvorm, adres, ondernemings-/btw-nummer, RPR, telefoon en juridische-, privacy- en supportcontacten; geen voorbeeldwaarden.
- Juridisch goedgekeurde algemene voorwaarden, privacy- en cookiebeleid, DPA’s, retentie, incidentprocedure, supportmodel en aansprakelijkheidsafspraken.
- Mollie-contract/profiel, exact terminalmodel, activering, en de definitieve scanner, printer en klantenschermopstelling.
- Keuze en contractstatus voor billing, e-mail, SMS en Peppol, inclusief verwerkingsregio, kosten en support/escalatie.
- Pilotwinkel, echte catalogus, BTW-/bonvereisten, rollen, netwerkcondities, trainingsplan, supportcontact en schriftelijke acceptatiecriteria.
- Beslissing welke publieke claims en prijsbeloften pas na bewijs mogen worden gepubliceerd.

## 9. The next 5 meaningful moves

1. **Houd de schone releaseketen groen.** Outcome: de drie releasepatches worden gereviewd en gecommit; typecheck, unit/coverage, build, site/bundel, security én alle 36 browserflows blijven slagen zonder lokale artifacts.
2. **Sluit de juridische releasegate.** Outcome: alleen geverifieerde bedrijfsgegevens en juridisch goedgekeurde teksten staan in productie, `check:compliance` slaagt lokaal en in CI/deploy, en de live pagina’s zijn nagekeken.
3. **Verifieer de nieuwe kassatoegang op de echte backend.** Outcome: de vier migrations zijn aantoonbaar op de beoogde Supabase-omgeving toegepast en owner/manager/cashier, lockout, offline-grace en audit-attributie slagen in een gerichte acceptatietest.
4. **Doe één volledige pilot-kassaproef.** Outcome: sale → voorraad → historiek → Z-rapport → audit is bewezen op de gekozen terminal, scanner, printer en klantenscherm, inclusief offline en herstel na storing.
5. **Beperk de pilotbelofte tot wat bewezen is.** Outcome: pricing, website en demo zeggen expliciet dat billing, echte integraties, Peppol, publieke API, multi-store, webshopbetaling/-mail en ServiceDesk-bijlagen geen live producttoezegging zijn; plan deze daarna afzonderlijk.

## 10. How to keep this document true

- Werk dit document bij zodra een releasekritisch feit verandert; dateer elke snapshot en noem de gecontroleerde revisie.
- Link waar nuttig naar code, test, migratie of audit; plannen zijn nooit bewijs boven geverifieerde werkelijkheid.
- Verplaats gesloten risico’s naar een korte, gedateerde sectie **Recent opgelost** met het bijbehorende bewijs.
- Verwijder of markeer verouderde claims meteen, vooral publieke claims.
- Geef een zichtbare UI, route of schema nooit de status “live” zonder configuratie-, provider-, gebruikers- en end-to-endbewijs.

### Recent opgelost

- **2 september 2026, schone tijdelijke worktree vanaf `8e6d9d1`:** de POS-helper gebruikt nu “Aanmelden op de kassa” in plaats van de verouderde PIN-kop. Een ontbrekende test-only Supabaseconfiguratie is gedicht en een legacy categoriecache wordt lokaal hersteld vóór een netwerklookup. Hiermee verdwijnen de 33 POS-gate E2E-fouten, de afhankelijke unitfouten en de offline Realtime-timeout.

### Recent gecontroleerd bewijs

- **2 september 2026, schone tijdelijke worktree vanaf `8e6d9d1` met de drie releasepatches:** `npm run lint` geslaagd; `npm run test:coverage` geslaagd met **666/666** tests in 126 bestanden en 79,67% statements, 65,72% branches, 82,85% functions en 82,67% lines; `npm run build`, `check:site`, `check:bundle` en `check:security` geslaagd; `npm run test:e2e` geslaagd met **36/36** browserflows. De worktree is daarna verwijderd, dus er bleven geen lokale build-, coverage- of Playwright-artifacts in de gedeelde werkmap achter.
- **2 september 2026, lokaal:** `npm run check:compliance` faalt nog op ontbrekende juridische waarden; dit is een externe juridische releaseblocker en is niet cosmetisch aangepast.
- Historisch achtergrondmateriaal: [compliance-readiness](COMPLIANCE-READINESS.md), [feature-audit](FEATURE-AUDIT-2026-08-22.md) en [audit](AUDIT.md). Deze documenten zijn geen vervanging voor deze gedateerde releasebeslissing.
