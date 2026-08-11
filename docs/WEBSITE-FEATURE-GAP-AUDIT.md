# PWAYMENT website-featureaudit

**Datum:** 12 augustus 2026

**Scope:** publieke website tegenover de aantoonbare productflows in deze repository

**Bronnen:** publieke pagina's, POS-navigatie, checkout/refunds, historiek en Z-rapporten, productbeheer, klanten/cadeaubonnen, insights, webshoporders, entitlements, services en database/RPC-migraties

## Samenvatting

De website verkoopt PWAYMENT overtuigend als zes grote domeinen — kassa, voorraad, inzichten, klanten, webshop en integraties — maar liet veel van de operationele diepte weg die het product onderscheidt van een eenvoudige POS. Daardoor leek het product op de homepage kleiner dan het is.

De zwaarste onderbelichting zat in:

1. retouren, facturen en documenthistoriek;
2. kasreconciliatie, Z-rapportdetails en auditexports;
3. voorraadprognose naar inkooporder en deelontvangst;
4. kortings-, verkoopmoment-, medewerker- en datakwaliteitsanalyse;
5. geavanceerd klant- en cadeaubonbeheer;
6. de volledige webshoporder- en voorraadreserveringsflow.

De prijsweergave had daarnaast twee afzonderlijke presentaties: een minimale homepage-teaser en een volledige prijspagina. Dat was zowel visueel zwakker als een toekomstige bron van prijsdrift. Homepage en prijspagina gebruiken nu dezelfde plandata, facturatiekeuze en kaartcomponent.

## Featuredekking

| Productfunctie die aantoonbaar aanwezig is | Oude websiteweergave | Kloof | Actie in deze wijziging |
| --- | --- | --- | --- |
| Gedeeltelijke retour per verkoopregel, verplichte reden en voorraadherstel | Alleen generiek “retouren” | Hoog | Expliciet op homepage, product- en POS-pagina |
| Factuurpreview en PDF vanuit historiek/klantprofiel | Niet zichtbaar | Hoog | Expliciet op homepage, product-, POS- en klantenpagina |
| Ontvangen cash, wisselgeld en cadeaubon + cash/PIN | Alleen “cash, PIN, cadeaubon en split” | Middel | Betaalflow concreet gemaakt |
| CSV- en JSON-export van verkopen, rapporten en audit | Niet zichtbaar | Hoog | Expliciet op homepage en POS-pagina |
| Kasreconciliatie, betaalmix, kostprijs, brutowinst en btw in dagafsluiting | Alleen “kassatelling en verschillen” | Hoog | Expliciet op homepage en POS-pagina |
| Controleerbare hashketen tussen Z-rapporten | Alleen “onveranderlijk auditspoor” | Middel | Expliciet gemaakt op POS-pagina |
| Product archiveren/herstellen en eigen EAN-13 genereren | Niet zichtbaar | Middel | Toegevoegd aan voorraadpagina |
| CSV-validatie op bedragen, btw, SKU en barcode | Alleen “bulkimport” | Middel | Als gevalideerde import/export gepositioneerd |
| Days-of-cover, stockout-risico, trend en confidence | Alleen “60-dagen prognose” | Hoog | Expliciet op voorraadpagina |
| Bestelvoorstellen per leverancier, purchase-orderconcept en deelontvangst | Alleen “inkooporders en ontvangst” | Hoog | Expliciet op homepage, product- en voorraadpagina |
| Acties bewaren, uitstellen en afronden | Kort genoemd | Laag | Concreter gemaakt op inzichtpagina |
| Kortingsanalyse per product/categorie | Niet zichtbaar | Hoog | Expliciet op homepage, product- en inzichtpagina |
| Verkoopmomenten per weekdag en uur | Niet zichtbaar | Hoog | Expliciet op homepage en inzichtpagina |
| Teamomzet en verkopen per medewerker/weekdag | Niet zichtbaar | Hoog | Expliciet op homepage, product- en inzichtpagina |
| Datadekking en registratiedekking | Niet zichtbaar | Hoog | Expliciet op homepage, product- en inzichtpagina |
| Klanten zoeken/filteren/sorteren op gedrag en waarde | Niet zichtbaar | Middel | Toegevoegd aan klantenpagina |
| Cadeaubon blokkeren/heractiveren en append-only saldohistoriek | Grotendeels generiek | Hoog | Volledige lifecycle toegevoegd |
| Webshoporder bevestigen, verwerken, verzenden, afhalen en annuleren | Alleen “ontvang bestellingen” | Hoog | Expliciet op homepage en webshoppagina |
| Atomaire voorraadreservering en vrijgave/commit per orderstatus | Alleen “live voorraad” | Hoog | Operationele flow expliciet gemaakt |

## Zware inconsistenties in de andere richting

Niet elke kloof is ondermarketing. Een aantal publieke claims loopt juist vóór op wat in de repository aantoonbaar end-to-end beschikbaar is. Deze claims moeten vóór publieke lancering een eigenaar en bewijs krijgen, of tijdelijk preciezer worden geformuleerd.

| Publieke claim | Wat de repository momenteel bewijst | Risico | Advies |
| --- | --- | --- | --- |
| Worldline, CCV, SumUp, Viva en Verifone als gekoppelde terminals | Checkout registreert PIN; er is geen zichtbare provider-SDK, terminalprotocol of providerreconciliatie | Zeer hoog | Alleen als “ondersteund” publiceren na een echte testmatrix per terminal/model |
| Shopify, WooCommerce, Exact, Octopus, Moneybird en Peppol | Integratiebeheer en connectorconfiguratie zijn aanwezig, maar de README noemt tests/sync en delivery nog demo | Zeer hoog | Geef elke connector status: live, pilot, beta of gepland; toon geen logo als actief zonder werkende flow |
| REST API, webhooks, signing, retries en delivery logs | Configuratie-UI bestaat; geen aantoonbare publieke API- of deliveryservice in deze repo | Zeer hoog | Claims koppelen aan werkende endpoints, documentatie en observabilitybewijs |
| Native webshop met genoemde echte betaalmethoden | Storefront en order/voorraadflow bestaan; betalingen en e-mails worden in de README nog als gesimuleerd omschreven | Zeer hoog | Scheid “orderflow werkt” van “payment capture live” |
| MFA, herstelcodes, sessie-intrekking, verdachte-loginmeldingen en rate limiting | Niet volledig aantoonbaar in de huidige klantflow | Zeer hoog | Securitypagina baseren op een gecontroleerde security-capabilitylijst |
| 99,5% uptime en 99,9% SLA, 24/7 noodsupport | Commerciële belofte zonder operationeel bewijs in de repo | Hoog | Pas publiceren na supportmodel, monitoring, incidentproces en contracttekst |
| Bluetooth-printers, weegschalen, kassalade-automatisering en brede hardwarecompatibiliteit | WebUSB ESC/POS en keyboard-wedge scanning zijn aantoonbaar; overige dekking is niet volledig bewezen | Hoog | Publiceer een hardwarecompatibiliteitsmatrix met browser, model en geteste functie |
| “De publieke vergelijking volgt de actuele licentie- en functiematrix in PWAYMENT zelf” | De publieke prijzen stonden als losse broncode naast de entitlementtabellen | Hoog | Eén centrale planregistry invoeren die website, billing en feature gates voedt |

## Informatiearchitectuur na uitvoering

De zes featurepagina's blijven de bovenlaag. De vier concrete productbestemmingen zijn nu toegevoegd:

1. **Historiek, retouren & facturen** — verkoop zoeken, retour boeken, factuur/PDF, export en audit.
2. **Dagafsluiting & rapportage** — kasreconciliatie, btw, betaalmix, Z-hash, shift en exports.
3. **Inkoop & leveranciers** — forecast, besteladvies, purchase order, deelontvangst en voorraadbeweging.
4. **Team & rechten** — rollen, managergoedkeuring, medewerkeranalyse en gevoelige acties.

Ze vormen bewust geen extra hoofdnavigatieniveau. Ze zijn bereikbaar vanuit homepage, featurepagina's, footer en relevante gidsen.

## Uitvoeringsplan

### P0 — Waarheid en risicobeheersing

- Maak één capability registry met productstatus, bewijs, plan, limiet, publieke naam en eigenaar.
- Label elke externe koppeling en hardwarecombinatie als live, pilot, beta of gepland.
- Laat prijzen, vergelijkingsregels, feature gates en billing dezelfde planregistry gebruiken.
- Laat security-, SLA-, Peppol- en betaalproviderclaims afzonderlijk aftekenen.

**Klaar wanneer:** geen publieke claim bestaat zonder aantoonbare status en eigenaar.

### P1 — Productdiepte zichtbaar maken

- Voeg de vier verdiepende pagina's toe.
- Maak een echte featurevergelijking met alle relevante rijen, gegroepeerd per merchant-job.
- Voeg actuele productcaptures toe van retour, dagafsluiting, inkooporder, cadeaubonhistoriek en webshoporders.
- Maak op elke featurepagina duidelijk welke functies samen één workflow vormen.

**Klaar wanneer:** iedere aantoonbare kernflow via maximaal twee klikken vanaf de homepage te vinden is.

**Status 12 augustus 2026:** uitgevoerd. De vier verdiepende pagina's, uitgebreide planvergelijking, actuele productcaptures en onderlinge workflowlinks staan in de publieke router.

### P2 — Bewijs en conversie

- Vervang generieke integratielogo's door geverifieerde statuskaarten.
- Voeg een hardwarecompatibiliteitspagina en migratiechecklist toe.
- Laat demo-aanvragen echt opslaan/verzenden en instrumenteer CTA-, pricing- en form events privacyvriendelijk.
- Voeg echte klantbewijzen toe zodra toestemming en meetbare uitkomsten bestaan.

**Klaar wanneer:** elke grote koopbezwaar — hardware, migratie, internet, support, prijs en data — met bewijs wordt beantwoord.

**Status 12 augustus 2026:** technisch uitgevoerd. Integraties en hardware hebben een expliciete actief/pilot/validatie-status, de migratieflow bestaat, leadformulieren schrijven via een afgeschermde Supabase-RPC en CTA-, prijs- en formulierevents worden zonder persoonsgegevens opgeslagen. Echte klantcases blijven bewust afwezig totdat toestemming en controleerbare resultaten beschikbaar zijn.

### P3 — Zoekbaarheid en onderhoud

- Maak metadata, canonical URLs, sitemap, structured data en deelkaarten route-specifiek.
- Bouw contentpagina's rond retouren, Z-rapport, voorraadprognose, cadeaubonnen, webshopvoorraad en Belgische retailflows.
- Voeg geautomatiseerde controles toe voor dode links, prijsdrift en claims zonder actieve capability.

**Klaar wanneer:** product- en websitewijzigingen niet meer stil van elkaar kunnen afwijken.

**Status 12 augustus 2026:** uitgevoerd. Er zijn route-specifieke metadata, canonicals, Open Graph/Twitter-tags, JSON-LD, sitemap en robots.txt, zes inhoudelijke retailgidsen en geautomatiseerde checks voor routes, sitemap en prijsdrift.

## Reeds uitgevoerd

- Homepage toont dezelfde volledige prijskaarten als de prijspagina.
- Maand/jaar-keuze werkt op beide plekken.
- Homepage en prijspagina gebruiken dezelfde plandata en component.
- Homepage heeft een nieuwe sectie voor de zes zwaarst onderbelichte operationele flows.
- Product-, POS-, voorraad-, inzichten-, klanten- en webshoppagina's benoemen de bestaande productdiepte concreter.
- De scannertekst is gecorrigeerd naar de aantoonbare USB/keyboard-wedge flow.
- De prijspagina claimt niet langer ten onrechte dat website en entitlementmatrix al één technische bron delen.
- Vier operationele dieptepagina's tonen historiek/retouren, dagafsluiting, inkoop en teamrechten met actuele productbeelden.
- Klanten en webshop tonen nu actuele captures van cadeaubonhistoriek en webshoporderbeheer.
- Integratie- en hardwareclaims zijn herschreven naar aantoonbare actief-, pilot- of validatiestatus.
- Contact- en demo-aanvragen hebben duurzame, niet-publiek leesbare opslag met server-side validatie en rate limiting.
- Homepage en prijspagina lezen dezelfde centrale prijscatalogus; de interne billingweergave gebruikt dezelfde bedragen.
- Zes gidsen, route-specifieke SEO en gegenereerde sitemap/robots zijn toegevoegd.
- De build controleert voortaan de publieke routes en losgeraakte planprijzen.

## Overblijvende releasevoorwaarden

- Pas de nieuwe Supabase-migratie toe vóór het publieke formulier live verkeer krijgt.
- Voeg alleen klantcases toe na expliciete toestemming en verificatie van meetbare resultaten.
- Rond P0 af met een centrale capability registry inclusief eigenaar; de website toont nu al eerlijke statussen, maar eigenaarschap hoort nog bij het releaseproces.
- Laat SLA-, support- en securitytekst juridisch en operationeel aftekenen voordat een contractuele belofte publiek wordt.
