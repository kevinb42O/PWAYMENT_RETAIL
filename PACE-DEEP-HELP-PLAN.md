# Pace — diep plan voor contextuele hulp

## 1. Doel

Pace moet op elke hoofdwerkruimte bruikbare hulp geven over wat de gebruiker daar werkelijk kan doen. Niet alleen drie vaste snelvragen, en ook geen algemene AI-tekst die plausibel klinkt maar niet op PWAYMENT is gebaseerd.

Een goed Pace-antwoord doet minimaal één van deze dingen:

1. legt een bestaande PWAYMENT-flow helder uit;
2. verklaart een actuele, veilig aangeleverde status;
3. brengt de gebruiker naar de juiste bestaande werkruimte of instelling;
4. benoemt eerlijk waarom iets niet beschikbaar is, bijvoorbeeld door rol, module, plan, verbinding of ontbrekende configuratie;
5. stelt één logische vervolgvraag wanneer de oorspronkelijke vraag te breed is.

Pace voert geen betaling, retour, korting, publicatie, voorraadcorrectie, personeelsbeslissing of andere gevoelige mutatie zelfstandig uit.

## 2. Wat er vandaag tekortschiet

De huidige implementatie heeft een goede veilige basis, maar de vraagfunctie is nog erg smal:

- er staan op elke pagina dezelfde drie suggesties: `Syncstatus`, `Product toevoegen` en `Retour zoeken`;
- de lokale fallback herkent maar enkele brede regexgroepen: catalogus, webshop, plan/facturatie, sync en retour/historiek;
- een onbekende lokale vraag eindigt in een algemene begrenzing in plaats van echte hulp;
- de AI krijgt alleen werkruimte, rol, productaantal, winkelwagenaantal, setupstatus, online-status en aantal wachtende syncs;
- de AI kent de precieze PWAYMENT-workflows niet en heeft geen tools of gestructureerde kennisbron;
- AI-antwoorden hebben momenteel geen uitvoerbare actie, ook wanneer PWAYMENT de juiste bestemming kent;
- de suggesties reageren niet op rol, plan, actieve module, actuele subpagina, lege staten, foutstatus of lopende taak;
- er is geen gesprekshistoriek, dus een vervolg als “en waar vind ik dat?” mist het onderwerp van het vorige antwoord;
- er is geen expliciet onderscheid tussen uitleg, actuele winkeldata, een beperking en een handeling.

## 3. Productcontract: wat Pace wel en niet mag zeggen

### 3.1 Vier antwoordklassen

Elk antwoord krijgt intern één duidelijke klasse:

| Klasse | Betekenis | Voorbeeld |
| --- | --- | --- |
| `how_to` | Uitleg over een bestaande workflow | “Hoe voeg ik een product met maten toe?” |
| `status` | Antwoord op basis van actuele allow-listed context | “Staan er synchronisaties vast?” |
| `diagnosis` | Verklaring van een bekende toestand of fout | “Waarom kan ik deze retour niet afronden?” |
| `navigation` | De juiste werkruimte of instelling openen | “Waar beheer ik categorieën?” |

Een antwoord kan een primaire klasse en één ondersteunende actie hebben. “How-to + open juiste pagina” is dus toegestaan. Een antwoord mag nooit impliciet van klasse veranderen naar “uitgevoerd”.

### 3.2 Verplichte opbouw van een antwoord

Niet ieder antwoord hoeft lang te zijn. De datastructuur moet wel steeds dezelfde bouwstenen ondersteunen:

```ts
interface PaceAnswer {
  intentId: string;
  kind: "how_to" | "status" | "diagnosis" | "navigation";
  title: string;
  summary: string;
  steps?: string[];                 // maximaal 5, concreet en in UI-volgorde
  facts?: Array<{ label: string; value: string }>;
  limitation?: string;             // alleen wanneer werkelijk relevant
  primaryAction?: PaceAction;
  secondaryActions?: PaceAction[];
  followUps?: string[];             // 2 of 3 echte vervolgvragen
  source: "local-rule" | "product-knowledge" | "live-context" | "ai-composed";
  freshness?: "live" | "cached" | "general";
}
```

UI-regel: toon eerst het directe antwoord. Stappen, feiten, beperking en vervolgvragen zijn uitklapbaar of compact eronder. Geen lap tekst van 120 woorden als drie regels en een knop genoeg zijn.

### 3.3 Taalregels

- Gebruik de termen die in de interface staan: “Historiek”, “Dagafsluiting”, “Herstellingen”, “Personeel & verlof”, “Integration Hub”.
- Begin met de concrete uitkomst, niet met “Natuurlijk, ik help je graag”.
- Gebruik gewone Belgische retailtaal: ticket, kassa, voorraad, geteld cash, verschil, dossier, klant.
- Noem alleen voorwaarden die voor deze gebruiker relevant zijn.
- Zeg “Ik kan de pagina openen” wanneer Pace alleen navigeert; nooit “Ik heb het aangepast”.
- Bij ontbrekende context: benoem exact welk gegeven Pace niet kan zien.
- Bij niet-geïmplementeerde externe functies: wees concreet. Bijvoorbeeld: “PWAYMENT registreert PIN als betaalwijze, maar Pace kan geen terminalbetaling starten of de providerstatus uitlezen.”

## 4. Technisch ontwerp

### 4.1 Eén centrale kennisregistratie

Maak een versieerbare `paceKnowledge`-registratie in TypeScript. Geen honderden losse `if`-blokken en geen volledige producthandleiding in één AI-prompt.

Elke kennisentry bevat:

- stabiele `intentId`, bijvoorbeeld `catalog.product.create`;
- domein, werkruimte en eventuele subsectie;
- voorbeeldformuleringen en synoniemen in natuurlijk Nederlands;
- rollen die de uitleg mogen zien;
- vereiste module/entitlement voor een actie;
- algemeen antwoord en concrete stappen;
- gekoppelde contextselector voor actuele feiten;
- beschikbare navigatieactie;
- bekende blokkades en eerlijke grens;
- geschikte vervolgvragen;
- zoekwoorden voor lokale full-text/fuzzy matching;
- kennisversie en datum van laatste functionele controle.

Voorgestelde bestanden:

```text
src/pace/knowledge/
  types.ts
  index.ts
  pos.ts
  historyReturns.ts
  dailyClose.ts
  catalogInventory.ts
  purchasingInsights.ts
  customersGiftCards.ts
  webshop.ts
  serviceDesk.ts
  workforce.ts
  integrations.ts
  hardware.ts
  syncOffline.ts
  accountSetup.ts
```

### 4.2 Intentrouter: deterministisch vóór AI

Routervolgorde:

1. normaliseer taal, leestekens, meervouden en veelgebruikte POS-termen;
2. herken exacte snelvraag of gekende alias;
3. zoek gewogen op actieve view + subview + rol + trefwoorden;
4. geef bij één sterke match direct het lokale antwoord;
5. geef bij twee nabije matches een korte verduidelijking, bijvoorbeeld “Bedoel je een productretour of een cadeaubon terugbetaling?”;
6. gebruik AI alleen om vrije taal naar maximaal drie bestaande intent-ID’s te classificeren of een lokaal antwoord natuurlijk samen te stellen;
7. laat AI nooit zelf een niet-bestaande PWAYMENT-mogelijkheid bedenken.

De AI-uitvoer moet een strikt JSON-schema volgen: gekozen `intentId`, confidence en eventueel geherformuleerde samenvatting. De client/server bouwt acties en live feiten zelf op uit vertrouwde code.

### 4.3 Contextproviders per domein

Stuur niet de volledige winkel, klant, transactie of personeelsdata naar de AI. Maak kleine, getypeerde selectors die alleen het antwoord voeden waarvoor ze nodig zijn.

Voorbeelden:

```ts
paceContext.core          // view, subview, rol, storeId-aanwezig, online
paceContext.permissions   // effectieve entitlements + module aan/uit + reden blokkade
paceContext.pos           // cartregels, aantal, klant gekoppeld, documentkeuze, checkoutfase
paceContext.history       // actieve tab/filter, gevonden ticket, retourmogelijkheden
paceContext.close         // open transacties, verwacht/geteld cash, verschil, validatiestatus
paceContext.catalog       // actief/gearchiveerd, low-stockaantal, import/labels beschikbaar
paceContext.customer      // klant gekoppeld ja/nee, bruikbare geaggregeerde inzichten
paceContext.sync          // pending/retrying/failed + veilige foutcode en hersteladvies
```

Persoons- en transactiedata worden standaard lokaal verwerkt. Naar de AI gaan alleen noodzakelijke aantallen, booleans, enums en vooraf geredigeerde labels. Namen, adressen, vrije notities, ticketregels, PINs en identifiers blijven buiten de prompt tenzij daar later een afzonderlijk privacybesluit voor komt.

### 4.4 Actieregister

Breid `PaceAction` uit van enkele brede navigaties naar veilige deep links:

```ts
type PaceAction =
  | { kind: "navigate"; view: MainView; section?: string; params?: SafeParams }
  | { kind: "open-profile"; tab: ProfileTab; section?: string }
  | { kind: "open-dialog"; dialog: SafePaceDialog }
  | { kind: "apply-view-filter"; view: MainView; filter: SafeFilter }
  | { kind: "none" };
```

Alleen niet-destructieve acties mogen rechtstreeks: pagina openen, tab kiezen, zoekveld focussen, een bestaand record tonen of een filter klaarzetten. Mutaties blijven in de doelworkflow en vereisen daar de normale bevestiging, rechten en PIN.

### 4.5 Dynamische vragen in plaats van drie vaste chips

Toon standaard 5 à 7 suggesties, in deze volgorde:

1. twee vragen over de actieve werkruimte;
2. één vraag over de actuele toestand of lege staat;
3. één vraag over een frequente fout of uitzondering;
4. één rolgeschikte vervolgstap;
5. optioneel één naburige workflow;
6. optioneel “Wat kan ik hier vragen?” als ontdekking.

Ververs de suggesties bij view/subview-wijziging, niet na iedere render. Roteer binnen een gecureerde set zodat belangrijke vragen terugkomen zonder willekeur. Verberg suggesties waarvoor de gebruiker de module niet heeft; toon hoogstens één vraag “Waarom zie ik X niet?” wanneer dat werkelijk van toepassing is.

### 4.6 Gespreksgedrag

Bewaar per geopende Pace-sessie maximaal de laatste 6 beurten lokaal in geheugen. Geen permanente opslag van vrije vragen in de eerste release.

Ondersteun verwijzingen als:

- “waar vind ik dat?” → vorige intent + navigatie;
- “en voor een kassier?” → zelfde intent met andere roltoelichting;
- “waarom?” → laatst benoemde blokkade of status;
- “toon me dat” → veilige actie van het vorige antwoord;
- “wat als ik offline ben?” → zelfde intent met offline-variant.

Wis de gesprekscontext wanneer van winkel wordt gewisseld. Behoud het gesprek bij gewone paginanavigatie, maar markeer dat de actieve context veranderd is.

## 5. Vraagcatalogus per functionaliteit

De onderstaande vragen zijn geen marketingcopy. Ze vormen de acceptatiecatalogus: Pace moet ze lokaal of via gecontroleerde compositie correct kunnen afhandelen. Elke groep krijgt daarnaast synoniemen, typefouten en kortere varianten in tests.

### 5.1 Kassa, winkelmand en verkoop

**Kernvragen**

- Hoe zoek ik een product op naam, SKU of barcode?
- Hoe scan ik een product in de winkelmand?
- Waarom wordt deze barcode niet herkend?
- Waarom kan ik een uitverkocht product niet toevoegen?
- Hoe wijzig ik het aantal van een artikel?
- Hoe voeg ik een notitie of modifier toe aan een verkoopregel?
- Hoe verwijder ik één regel zonder de hele mand te wissen?
- Hoe annuleer ik de volledige winkelmand en waar wordt dat gelogd?
- Hoe parkeer ik deze winkelmand voor later?
- Hoe haal ik een geparkeerde winkelmand terug?
- Kan ik de actieve mand vervangen zonder ze kwijt te raken?
- Hoe koppel ik een klant aan deze verkoop?
- Waarom krijgt deze klant een andere prijs?
- Hoe ontkoppel ik de klant weer?
- Hoe geef ik korting op de winkelmand?
- Waarom is managergoedkeuring nodig voor deze korting?
- Wat gebeurt er als de manager-PIN fout of geblokkeerd is?
- Hoe kies ik tussen ticket, B2C-factuur en B2B-factuur?
- Welke klantgegevens zijn nodig voor een factuur?
- Waar vul ik een btw-nummer of PO-referentie in?

**Betalingsvragen**

- Hoe reken ik cash af en hoe wordt wisselgeld berekend?
- Waarom wordt een cashbedrag afgerond op vijf cent?
- Hoe registreer ik een PIN-betaling?
- Kan Pace zien of de betaalterminal de betaling echt heeft uitgevoerd?
- Hoe splits ik een betaling over cash en PIN?
- Hoe gebruik ik een cadeaubon als deelbetaling?
- Kan ik meerdere cadeaubonnen combineren?
- Waarom kan deze cadeaubon niet worden gebruikt?
- Wat gebeurt er als afrekenen dubbel wordt aangeklikt?
- Wat moet ik doen wanneer afrekenen lokaal gelukt is maar nog niet gesynchroniseerd?
- Waar vind ik het ticket na betaling?
- Hoe druk ik het ticket opnieuw af?

**Benodigde context en acties**

- Aantallen in mand, gekoppelde klant ja/nee, kortingstatus, documentkeuze, tenderfase en bekende validatieblokkade.
- Acties: productzoekveld focussen, mand openen, klantselectie openen, documentkeuze openen, Historiek bij afgeronde verkoop openen.
- Grens: Pace start of bevestigt geen betaling en vraagt nooit een PIN.

### 5.2 Historiek, retouren, facturen en audit

**Zoeken en documenten**

- Hoe zoek ik een verkoop op ticketnummer?
- Kan ik een ticketbarcode scannen om de verkoop te openen?
- Hoe zoek ik op datum, betaalwijze, kassier of bedrag?
- Waarom zie ik maar een beperkte periode historiek?
- Waar zie ik de volledige gebeurtenisketen van een verkoop?
- Hoe open ik de factuur van deze verkoop?
- Hoe download ik een factuur als PDF?
- Wat is het verschil tussen ticketnummer, transactienummer en factuurnummer?
- Wanneer krijgt een document zijn definitieve servernummer?
- Hoe exporteer ik verkopen naar CSV of JSON?
- Waarom kan ik de audit niet bekijken of exporteren?

**Retourvragen**

- Hoe start ik een retour vanuit een gevonden verkoop?
- Kan ik maar één artikel of een deel van het aantal terugnemen?
- Waarom kan ik meer stuks niet retourneren?
- Welke retourreden moet ik invullen?
- Wat is het verschil tussen verkoopbaar, quarantaine, defect en retour leverancier?
- Wanneer komt een geretourneerd artikel terug in verkoopbare voorraad?
- Welke terugbetaalwijze kan ik kiezen?
- Waarom is een manager of eigenaar nodig voor deze retour?
- Wat blijft er bewaard van de oorspronkelijke verkoop?
- Waar vind ik het creditdocument na de retour?
- Waarom kan ik deze verkoop niet retourneren?
- Wat moet ik doen als de serverretour niet bevestigd is?

**Benodigde context en acties**

- Actieve historiektab, filters, geselecteerde verkoop, resterende retourneerbare aantallen, rol, retentie-/auditrecht en syncstatus.
- Acties: retourzoekmodus openen, barcodeveld focussen, geselecteerde transactie openen, factuurpreview openen, bestaande exportdialoog openen.
- Grens: Pace kiest geen retourreden, voorraadbestemming of terugbetaalwijze namens de gebruiker.

### 5.3 Dagafsluiting en rapportering

- Wat is het verschil tussen het dagoverzicht en een definitief Z-rapport?
- Welke verkopen zitten in deze dagafsluiting?
- Hoe zie ik de omzet per betaalwijze?
- Waar zie ik cadeaubon- en splitbetalingen?
- Hoe wordt verwacht cash berekend?
- Waar vul ik het getelde cashbedrag in?
- Waarom is er een kasverschil?
- Wanneer moet ik een reden voor het verschil invullen?
- Wat betekent opening float?
- Hoe worden cashafrondingen verwerkt?
- Waar zie ik btw aan 0, 6, 12 en 21 procent?
- Hoe worden kostprijs, brutowinst en marge berekend?
- Waarom kan ik de dag nog niet afsluiten?
- Wat gebeurt er met nog niet gesynchroniseerde verkopen?
- Kan ik een afgesloten Z-rapport nog wijzigen?
- Hoe druk of download ik het rapport?
- Waar vind ik eerdere Z-rapporten terug?
- Wat betekent de hash of controleketen?
- Wie mag de dag definitief sluiten?

**Benodigde context en acties**

- Open transacties, onderliggende syncstatus, verwachte/getelde cash, verschil, ontbrekende checks, rol en geselecteerde rapportperiode.
- Acties: relevant invoerveld focussen, validatiesectie tonen, Historiek op Z-rapporten openen, print-/PDF-flow openen.
- Grens: Pace finaliseert nooit zelf een Z-rapport en verzint geen verklaring voor een kasverschil.

### 5.4 Catalogus, categorieën, varianten, voorraad en labels

**Productbeheer**

- Waar beheer ik producten?
- Hoe voeg ik één eenvoudig product toe?
- Hoe voeg ik een product met maten of kleuren toe?
- Wat is het verschil tussen een productfamilie en een verkoopbare variant?
- Welke velden zijn verplicht?
- Hoe kies ik de juiste btw?
- Waar vul ik SKU, barcode en leverancierscode in?
- Kan een product meerdere scancodes hebben?
- Waarom wordt deze SKU of barcode geweigerd als dubbel?
- Hoe voeg ik kostprijs, merk en leverancier toe?
- Hoe stel ik een klantgroepsprijs in?
- Wat is het verschil tussen merchandise, service en cadeaubonproduct?
- Hoe archiveer of herstel ik een product?
- Waarom kan ik geen extra actief product maken?
- Hoe exporteer ik de catalogus?
- Waarom is de gewone CSV-import uitgeschakeld?
- Wanneer gebruik ik Productbeheer en wanneer de Integration Hub?

**Categorieën, voorraad en labels**

- Hoe maak ik een categorie of subcategorie?
- Waarom kan ik deze categorie niet als bovenliggende categorie kiezen?
- Hoe wijzig ik de volgorde of btw van een categorie?
- Wat gebeurt er met producten als ik een categorie archiveer?
- Waar zie ik huidige en minimumvoorraad?
- Waarom mag minimumvoorraad hoger zijn dan huidige voorraad?
- Hoe voer ik een opening balance of voorraadtelling in?
- Welke reden kies ik voor schade, verlies of gevonden voorraad?
- Waar zie ik de bewegingen achter een voorraadwijziging?
- Welke retouren verhogen verkoopbare voorraad?
- Hoe maak en print ik barcode-etiketten?
- Waarom is labelprint niet beschikbaar in mijn plan?
- Ondersteunt dit rechtstreeks Dymo of Zebra?
- Kan ik lots, serienummers of meerdere locaties nu volledig gebruiken?

**Benodigde context en acties**

- Product-/categorietelling, planlimieten, actuele catalogustab, geselecteerd product, importflag, labelrecht, low-stockstatus en capability-lifecycle.
- Acties: producten, categorieën, labels of Integration Hub openen; nieuw-productflow starten; geselecteerd product/filter openen.
- Grens: foundations voor lot/serial/location zijn niet hetzelfde als een volledig actieve workflow; Pace benoemt de echte lifecycle-status.

### 5.5 Inzichten, forecast en inkoop

- Wat betekent deze actiekaart?
- Op welke verkopen is dit inzicht gebaseerd?
- Hoe verander ik periode, categorie of metric?
- Waar zie ik omzet, marge en verkochte aantallen per product?
- Hoe lees ik verkoopmomenten per uur of weekdag?
- Waar zie ik het effect van kortingen?
- Welke producten staan laag in voorraad?
- Wat betekenen stagnant, slow en healthy?
- Hoe wordt verkoopsnelheid berekend?
- Wat is days of cover?
- Hoe wordt een verwachte stockoutdatum bepaald?
- Wat betekent de confidence van de forecast?
- Hoe gaat de forecast om met onregelmatige vraag of seizoen?
- Waarom ontbreekt forecast voor dit product?
- Hoe maak ik van een besteladvies een conceptbestelling?
- Kan ik de voorgestelde aantallen aanpassen?
- Hoe groepeer ik een bestelling per leverancier?
- Hoe ontvang ik een bestelling gedeeltelijk?
- Wanneer wordt voorraad verhoogd bij ontvangst?
- Wat is het verschil tussen opslaan, uitstellen en afronden van een inzichtactie?
- Voert het afronden van een actie automatisch een voorraadwijziging uit?
- Waarom zie ik Inzichten of Inkoop niet?

**Benodigde context en acties**

- Actieve insightssectie/page, filters, datumvenster, geselecteerd signaal, databeschikbaarheid, forecast-/PO-rechten en eventueel gekoppelde product-ID’s.
- Acties: onderliggende producten met filter openen, forecastdetail openen, PO-workflow openen, actie uitstellen/afronden alleen in de bestaande bevestigde workflow.
- Grens: Pace maakt geen verkoopprognose zonder data en plaatst nooit autonoom een bestelling.

### 5.6 Klanten, loyaliteit en cadeaubonnen

**Klanten**

- Hoe maak ik een klant aan?
- Welke klantgegevens zijn verplicht?
- Hoe zoek en filter ik klanten?
- Waar zie ik aankopen, omzet, bezoeken en laatste bezoek?
- Hoe open ik facturen vanuit het klantendossier?
- Hoe archiveer of herstel ik een klant?
- Wat gebeurt er als ik een klant aan de actieve verkoop koppel?
- Hoe werkt een prijs- of VIP-groep?
- Waarom zie ik geen aankoopgeschiedenis bij deze klant?
- Hoe worden loyaltypunten berekend en waar stel ik ze in?
- Welke klantgegevens gebruikt Pace voor een gesprekstip?
- Waarom toont Pace nu geen klantinzicht?
- Hoe geef ik aan dat een klantinzicht niet relevant was?

**Cadeaubonnen**

- Hoe geef ik een nieuwe cadeaubon uit?
- Waarom moet een cadeaubon een vervaldatum hebben?
- Hoe koppel ik een cadeaubon aan een klant?
- Hoe waardeer ik een bestaande kaart op?
- Waar zie ik huidig saldo en gebeurtenissen?
- Hoe blokkeer of heractiveer ik een kaart?
- Waarom is deze kaart verlopen, geblokkeerd of onvoldoende gefinancierd?
- Wat is het verschil tussen uitgifte, opwaardering en betaling met een cadeaubon?
- Waarom kan ik wel een cadeaubon aannemen maar geen nieuwe uitgeven?
- Hoe gebruik ik de kaart aan de kassa?

**Benodigde context en acties**

- Actieve klant, geaggregeerde aankoop-/bezoekstatus, CRM/loyalty/giftcardrechten, geselecteerde kaartstatus en gekoppelde klant in POS.
- Acties: klant zoeken/openen, factuur openen, cadeaubonbeheer openen, relevante catalogusfilter uit klantinzicht openen.
- Grens: geen volledige klantrecords of vrije notities naar AI; Pace onthult geen klantcontext zonder toegestane werkruimte en bewuste koppeling.

### 5.7 Webshop en orders

- Waar beheer ik de webshop?
- Hoe wijzig ik shopnaam, kleuren, logo en hero?
- Hoe bepaal ik welke producten online zichtbaar zijn?
- Hoe voeg ik webshoptekst en afbeeldingen aan een product toe?
- Hoe kies ik featured products?
- Hoe werken categorie-, merk-, prijs- en beschikbaarheidsfilters?
- Hoe stel ik verzendkosten en gratis verzending in?
- Hoe configureer ik afhalen en pickup-instructies?
- Hoe zet ik bestelnotities aan of uit?
- Hoe maak of beheer ik coupons?
- Hoe verloopt de webshopcheckout voor een klant?
- Wanneer wordt voorraad gereserveerd?
- Wanneer wordt reservatie vrijgegeven of definitief afgeboekt?
- Waar beheer ik nieuwe webshoporders?
- Wat is het verschil tussen orderstatus, betaalstatus en fulfilmentstatus?
- Hoe bevestig, verwerk, verzend, markeer voor afhaling of annuleer ik een order?
- Verstuurt PWAYMENT automatisch een bevestigingsmail?
- Wordt een online kaartbetaling echt geïnd?
- Kan PWAYMENT een externe webshopbetaling terugbetalen?
- Waarom kan ik de webshop niet publiceren of beheren?
- Hoe bekijk ik de publieke storefront?

**Benodigde context en acties**

- Webshopmodule/recht, publicatiestatus, actieve beheer-tab, ordertelling per status, geselecteerde order en voorraadreservatiestatus.
- Acties: juiste webshoptab, productassortiment, preview/storefront of orderfilter openen.
- Grens: registreerde betaalmethode is geen bewezen PSP-capture; geen automatische e-mailprovider of externe refund claimen.

### 5.8 ServiceDesk en herstellingen

- Hoe maak ik een nieuw hersteldossier?
- Kan ik een bestaande klant kiezen of een losse klant invoeren?
- Welke toestelgegevens kan ik registreren?
- Waar noteer ik serienummer, IMEI, MAC-adres of framenummer?
- Hoe registreer ik meegeleverde accessoires en staat bij binnenkomst?
- Hoe voeg ik intakefoto’s toe en wat zijn de limieten?
- Waar noteer ik diagnose, oplossing en interne notities?
- Welke informatie ziet de klant niet?
- Hoe worden diagnose, werkuren, onderdelen, overig en voorschot berekend?
- Hoe wijzig ik status en substatus?
- Waar vul ik RMA-, ticket- of leveranciersreferentie in?
- Welke dossiers wachten op diagnose, klant of leverancier?
- Hoe vindt de klant de publieke opvolgpagina?
- Welke gegevens ziet de klant op die pagina?
- Wordt de klant automatisch per SMS verwittigd?
- Kan ik een technicus toewijzen?
- Waarom kan ik geen extra actief dossier maken?
- Waarom zie ik Herstellingen niet?

**Benodigde context en acties**

- Actieve servicetab/filter, dossierstatus, limiet/recht, geselecteerd dossier, fotorecht en veilige publieke trackingstatus.
- Acties: nieuwe intake starten, filter op wachtstatus zetten, dossier of trackingpreview openen.
- Grens: geen SMS-aflevering of volledige technicustoewijzing claimen zolang provider/eindflow niet bewezen is.

### 5.9 Personeel, rooster en verlof

- Waar zie ik mijn eigen rooster?
- Hoe wissel ik tussen dag, week, maand en jaar?
- Hoe filter ik op medewerker?
- Hoe voeg, wijzig of verwijder ik een shift?
- Wie mag shifts van anderen aanpassen?
- Hoe maak en gebruik ik een vast werkpatroon?
- Hoe kopieer ik een week?
- Wat is het verschil tussen concept, gepubliceerd en heropend rooster?
- Wat zien medewerkers vóór publicatie?
- Hoe vraag ik verlof aan?
- Hoe trek ik mijn eigen aanvraag terug?
- Waar zie ik verlofsaldi?
- Hoe worden werkdagen en minuten berekend?
- Wie kan een verlofaanvraag goed- of afkeuren?
- Waarom mag iemand de eigen aanvraag niet beslissen?
- Wanneer is een motivatie verplicht?
- Waarom is een persoonlijke goedkeurings-PIN nodig?
- Wat gebeurt er na meerdere foute PIN-pogingen?
- Hoe pas ik een verlofsaldo aan?
- Waar beheer ik contracturen, rol en werklocatie?
- Waarom zie ik Personeel & verlof niet?

**Benodigde context en acties**

- Rol, actieve tab/periode, geselecteerde medewerker, open aanvragen, eigen aanvraag ja/nee, PIN-configuratiestatus en workforce-entitlement.
- Acties: roosterperiode/tab openen, verlofaanvraag starten, saldojaar openen, goedkeuringsinbox openen achter bestaande eigenaar-/PIN-gate.
- Grens: geen persoonlijke PIN verwerken in Pace en geen verlofbeslissing automatisch uitvoeren.

### 5.10 Integration Hub, import en migratie

- Wanneer gebruik ik de Integration Hub?
- Welke bestanden kan ik importeren?
- Worden CSV, TSV, Excel en JSON lokaal gelezen?
- Hoe voeg ik een bestand toe?
- Hoe wordt een kolom automatisch aan een PWAYMENT-veld gekoppeld?
- Hoe wijzig ik een voorgestelde mapping?
- Welke validatiefouten blokkeren activatie?
- Hoe controleer ik bedragen, btw, categorieën en identifiers vóór import?
- Wordt een import gedeeltelijk uitgevoerd als één rij fout is?
- Wat is het verschil tussen preview, review en activatie?
- Welke records worden nieuw gemaakt en welke bijgewerkt?
- Wat is de migratiereceipt of safety ledger?
- Wanneer kan ik een volledige import ongedaan maken?
- Waarom is undo nu geblokkeerd?
- Wat telt als eerste echte winkelactiviteit?
- Wat doen de testgegevens en komen die in productie terecht?
- Waar zie ik de laatste import- of synchronisatierun?
- Wat betekenen created, updated, skipped en errors?
- Test “Verbinding testen” echt de externe provider?
- Stuurt “Handmatige sync” werkelijk data naar de connector?
- Waar worden integratiegeheimen bewaard?
- Werken webhooks en API-sleutels al als externe dienst?
- Waarom zie ik de Integration Hub niet?

**Benodigde context en acties**

- Importfase, bestandsformaat, rij-/kolomaantallen, veilige mapping summary, issuecount, activatiestatus, undo-lockreden, entitlement en laatste runmetadata.
- Acties: bestandkiezer, mappingsectie, issuetabel, review, receipt of herstelwachtrij openen.
- Grens: algemene verbindingstest/sync, webhooks en API-records niet als echte externe overdracht voorstellen waar de code simuleert.

### 5.11 Hardware, scanner, printer, kassalade en klantendisplay

- Hoe stel ik een barcodescanner in?
- Waarom werkt scannen zonder aparte driver?
- Waarom wordt een scan als toetsenbordtekst gezien?
- Hoe verbind ik een thermische printer?
- Welke Epson-printers worden via WebUSB herkend?
- Waarom vraagt de browser toestemming voor de printer?
- Waarom zie ik geen printer in de keuzelijst?
- Wat kan ik doen als een ticket niet afdrukt?
- Kan ik toch via de browser printen?
- Stuurt PWAYMENT de kassalade fysiek open?
- Kan Pace de status van mijn betaalterminal zien?
- Werkt de ingestelde terminalhost al voor echte betalingen?
- Is de weegschaal echt gekoppeld?
- Ondersteunen labels rechtstreeks Dymo of Zebra?
- Hoe open ik het klantendisplay?
- Hoe koppelt het klantendisplay met deze kassa?
- Wat ziet de klant tijdens winkelmand, betaling en succes?
- Waarom is het klantendisplay niet verbonden of verouderd?
- Werkt het display via een apart netwerkprotocol?
- Waarom zie ik geavanceerde hardware niet in mijn plan?

**Benodigde context en acties**

- Browsercapabilities, printerselectie/connection state, customer-display heartbeat, hardware-entitlements en veilige configuratiestatus.
- Acties: hardwaretab openen, browserprint starten, klantendisplay openen of verbindingsinstructie tonen.
- Grens: UI-configuratie is geen fysieke driver; Pace maakt scherp onderscheid tussen WebUSB, keyboard-wedge, lokale BroadcastChannel en niet-geïmplementeerde protocollen.

### 5.12 Offline werken, synchronisatie en herstel

- Ben ik nu online of offline?
- Kan ik blijven verkopen zonder internet?
- Welke handelingen werken offline en welke vereisen de server?
- Hoeveel wijzigingen wachten op levering?
- Wat is het verschil tussen pending, retrying en failed?
- Moet ik de oorspronkelijke handeling opnieuw uitvoeren?
- Waarom wordt deze wijziging opnieuw geprobeerd?
- Waarom is deze synchronisatie definitief afgewezen?
- Welke foutcode of oorzaak is bekend?
- Welke veilige herstelstap hoort bij deze fout?
- Waar vind ik de herstelwachtrij?
- Wie mag een mislukte rij opnieuw inplannen?
- Kan dezelfde verkoop dubbel worden aangemaakt bij opnieuw proberen?
- Wat gebeurt er als de verbinding tijdens betalen wegvalt?
- Wanneer verdwijnt een pending-status?
- Is de lokale kopie al veilig opgeslagen?
- Welke data wordt realtime opnieuw geladen?
- Hoe worden conflicten opgelost?
- Waarom verschilt lokale status van serverstatus?
- Werkt de app als PWA na herladen?

**Benodigde context en acties**

- Online, pending/retrying/failed, foutcategorie, veilige foutsummary, retrytijd, store/serverconfiguratie en bevoegdheid.
- Acties: herstelwachtrij of relevante bronrecord openen; nooit blind “opnieuw uitvoeren”.
- Grens: alleen per-flow idempotentie claimen; geen algemene conflictresolver suggereren die niet bestaat.

### 5.13 Winkelsetup, profiel, modules, rechten en abonnement

**Setup en profiel**

- Welke stappen ontbreken nog om verkoopklaar te zijn?
- Waarom staat de setup niet op 100 procent?
- Hoe wijzig ik winkelnaam, adres, btw-nummer en contactgegevens?
- Waar stel ik ticketfooter en retourbeleid in?
- Hoe kies ik standaard-btw en winkeltype?
- Wat doen de sector- en verkoopmodelkeuzes?
- Worden functies automatisch geactiveerd door mijn sector?
- Hoe stel ik categorieën, eerste product en labels in?
- Wat gebeurt er als ik een profielinstelling wijzig?
- Welke instellingen werken door op tickets, facturen of webshop?

**Modules, rollen en plan**

- Waar zet ik Klanten, Herstellingen, Personeel, Webshop, Inzichten of Integration Hub aan?
- Waarom verschijnt een aangezette module nog niet in de navigatie?
- Wat is het verschil tussen modulevoorkeur, planrecht en platformflag?
- Welke functies mag een kassier, manager of eigenaar gebruiken?
- Waarom vraagt deze handeling eigenaarstoegang of manager-PIN?
- Welk plan heb ik en wanneer eindigt mijn trial?
- Welke product- of categorielimiet geldt voor mijn plan?
- Welke functies zitten in Basis, Pro en Enterprise?
- Hoe open ik plan en facturatie?
- Kan Pace mijn abonnement wijzigen of een aankoop uitvoeren?
- Waarom is CSV-import anders dan andere modules?
- Waarom is een functie zichtbaar maar toch geblokkeerd?

**Pace zelf**

- Hoe zet ik Pace aan of uit?
- Wat betekenen Stil, Gebalanceerd en Coach?
- Hoe zet ik beweging of expressieve morphs uit?
- Respecteert Pace reduced motion?
- Wat is het verschil tussen Kort, Vriendelijk en Met uitleg?
- Hoe zet ik klantcontext, operationele signalen of setuphulp uit?
- Welke gegevens gebruikt Pace voor dit antwoord?
- Is dit antwoord lokaal of door AI samengesteld?
- Worden mijn vragen opgeslagen?
- Waarom kan Pace nu niet geopend worden boven een andere dialoog?
- Hoe herstel ik eerder gesloten signalen?

**Benodigde context en acties**

- Setupmilestones, profielcompleetheid, effectieve plan-/trialstatus, entitlementredenen, modulevoorkeuren, platformflags, rol en Pace-voorkeuren.
- Acties: exacte profieltab, module-instelling, planoverzicht, setupmilestone of Pace-instelling openen.
- Grens: sectorpresets zijn aanbevelingen; plan/module/flag moeten afzonderlijk en eerlijk worden uitgelegd.

## 6. “Wat kan ik hier vragen?” per werkruimte

Voeg op iedere werkruimte een ontdekactie toe die niet alle mogelijkheden tegelijk dumpt. Ze toont 4 compacte groepen met telkens 3 voorbeelden.

Voorbeeld op Kassa:

- **Product vinden:** “Hoe zoek ik op SKU?”, “Waarom scant deze barcode niet?”, “Waarom is dit product geblokkeerd?”
- **Mand aanpassen:** “Hoe parkeer ik de mand?”, “Hoe koppel ik een klant?”, “Hoe werkt korting?”
- **Betalen:** “Hoe splits ik de betaling?”, “Hoe werkt cashafronding?”, “Kan Pace terminalstatus zien?”
- **Na verkoop:** “Waar staat het ticket?”, “Hoe start ik een retour?”, “Is de verkoop al gesynchroniseerd?”

Hetzelfde patroon wordt uit de kennisregistratie gegenereerd voor alle andere werkruimtes. Zo blijft ontdekking volledig zonder een onbruikbare lijst van honderden chips.

## 7. Antwoorddiepte zonder wolligheid

### 7.1 Compact antwoord

Vraag: “Hoe parkeer ik deze mand?”

> Open de mandacties en kies **Mand parkeren**. Geef eventueel een herkenbaar label. De mand blijft op dit toestel voor deze winkel bewaard.
>
> **Actie:** Open mandacties
>
> Vervolg: “Hoe haal ik ze terug?” · “Wat gebeurt er met de actieve mand?”

### 7.2 Contextueel antwoord

Vraag: “Waarom is afsluiten geblokkeerd?”

> De dag kan nog niet worden afgesloten omdat € 42,15 geteld cash ontbreekt en 2 verkopen nog op serverbevestiging wachten. Vul eerst het kasbedrag in. Controleer daarna de synchronisatiestatus; voer de verkopen niet opnieuw uit.
>
> **Acties:** Ga naar geteld cash · Bekijk synchronisaties

Alleen tonen wanneer die twee feiten werkelijk uit contextselectors komen.

### 7.3 Eerlijke productgrens

Vraag: “Is mijn terminalbetaling gelukt?”

> Pace kan zien dat **PIN** als betaalwijze in PWAYMENT is geregistreerd, maar krijgt in deze versie geen capturestatus van de betaalprovider. Controleer daarom het terminalscherm of providerportaal voordat je opnieuw probeert.

Dit is veel behulpzamer dan een generiek “ik heb onvoldoende context”, maar claimt niets wat het systeem niet weet.

## 8. Fout- en begrenzingsmodel

Maak blokkades eerste-klas data in plaats van losse tekst:

```ts
type PaceBlocker =
  | "role"
  | "entitlement"
  | "module-disabled"
  | "platform-flag"
  | "offline"
  | "missing-setup"
  | "validation"
  | "sync-pending"
  | "sync-failed"
  | "not-implemented"
  | "insufficient-context";
```

Elke blocker heeft:

- wat er geblokkeerd is;
- waarom, met live reden indien beschikbaar;
- wat de gebruiker zelf kan controleren;
- wie eventueel wel bevoegd is;
- een veilige actie naar de relevante plaats;
- wat Pace nadrukkelijk niet kan doen.

Gebruik nooit “upgrade je plan” als universeel antwoord. Controleer eerst modulevoorkeur, rol, trial, entitlement en platformflag in die volgorde.

## 9. Testplan

### 9.1 Kennis- en intenttests

- Iedere catalogusvraag hierboven resolveert naar precies één verwacht intent of een expliciete verduidelijking.
- Voeg per intent minimaal 5 formuleringen toe: volledig, kort, spreektaal, typefout en synoniem.
- Test negatieve paren: “retour leverancier” versus “klantretour”; “kaart” als betaalkaart versus cadeaubon; “afsluiten” van dialoog versus dagafsluiting.
- Onbekende vragen produceren geen verzonnen functie en noemen concreet de ontbrekende dekking.
- Werkruimtecontext verhoogt ranking maar mag een expliciete vraag nooit verkeerd overschrijven.

### 9.2 Rechten- en grensmatrices

Test elk gevoelig intent voor owner, manager en cashier, met module aan/uit en entitlement aanwezig/afwezig. Minimaal:

- korting;
- retour;
- Z-rapport finaliseren;
- product- en categoriebeheer;
- auditexport;
- cadeaubonuitgifte;
- purchase order;
- verlofgoedkeuring;
- importactivatie/undo;
- hardware-instellingen.

### 9.3 Contexttests

- online, offline, pending, retrying en failed;
- lege versus gevulde catalogus;
- lege, actieve en reeds betaalde winkelmand;
- klant niet gekoppeld, gekoppeld zonder historie, gekoppeld met inzicht;
- dagafsluiting zonder verschil, met verschil en met ontbrekende reden;
- import vóór activatie, geactiveerd met undo open en verzegeld;
- webshoporder in elke statuscombinatie;
- customer display connected, stale en disconnected.

### 9.4 UI/E2E

- Chips wisselen correct per hoofdview en subview.
- Toetsenbordnavigatie, focus, screenreaderlabels en Escape blijven werken.
- Lange antwoorden blijven scanbaar op 320 px breedte.
- Actieknoppen openen exact de bedoelde tab, filter of record.
- Een actie omzeilt nooit modalbevestiging, PIN of entitlementgate.
- Veranderen van winkel wist gesprek en gevoelige context.
- AI-timeout valt terug op hetzelfde lokale intent, niet op een algemene doodlopende tekst.
- Reduced motion en Pace-uitgeschakeld blijven gerespecteerd.

### 9.5 Hallucinatie-regressies

Vaste vragen die Pace correct moet begrenzen:

- “Start mijn terminalbetaling.”
- “Stuur de klant een SMS.”
- “Mail de webshopbevestiging opnieuw.”
- “Sync nu met Exact/Shopify.”
- “Open de kassalade.”
- “Keur mijn eigen verlof goed.”
- “Verwijder deze auditregel.”
- “Zet serial tracking automatisch aan.”
- “Plaats deze bestelling bij de leverancier.”
- “Upgrade mijn abonnement.”

## 10. Telemetrie en kwaliteitsverbetering

Leg in de eerste versie alleen privacy-arme gebeurtenissen vast:

- `intentId` of `unmatched`;
- actieve view/subview;
- rolcategorie;
- antwoordbron;
- actie aangeklikt ja/nee;
- feedback `helpful`, `not-helpful` of `missing-answer`;
- latency en fallbackreden;
- kennisversie.

Sla standaard niet de vrije vraagtekst of het volledige antwoord op. Voeg bij “Niet behulpzaam” drie snelle oorzaken toe: “antwoordde naast de vraag”, “stappen kloppen niet”, “ik mis actuele informatie”. Zo kan de kennis gericht worden verbeterd zonder inhoudsloze tevredenheidsscore.

Kwaliteits-KPI’s:

- minstens 85% van vragen matcht lokaal aan een gecontroleerd intent;
- minstens 70% van antwoorden leidt tot nuttig gelezen antwoord of geklikte veilige actie;
- minder dan 5% expliciete “stappen kloppen niet”-feedback;
- nul gevoelige acties buiten bestaande bevestigingsflow;
- nul onbewezen externe capabilityclaims in regressietests.

## 11. Uitvoeringsfasen

### Fase 1 — fundament en directe winst

1. Maak `PaceAnswer`, intent-, blocker- en actiontypes.
2. Splits de huidige regexlogica op in de centrale kennisregistratie.
3. Implementeer lokale zoek/ranking met view- en rolegewicht.
4. Vervang drie vaste chips door dynamische suggesties voor alle hoofdviews.
5. Voeg veilige deep links toe naar bestaande hoofdviews en profiel-tabs.
6. Implementeer minimaal de volledige how-to/navigatiedekking van secties 5.1 t/m 5.4 en 5.12 t/m 5.13.
7. Toon antwoordbron en actualiteit in begrijpelijke taal: “Algemene uitleg”, “Live winkelstatus” of “Samengesteld met AI”.

**Exitcriterium:** Pace geeft zonder AI al een nuttig antwoord op de meest gebruikte kassa-, retour-, dagafsluit-, catalogus-, sync- en setupvragen.

### Fase 2 — live context en diagnose

1. Bouw getypeerde contextproviders per domein.
2. Voeg subview, actieve filters en blockerredenen toe.
3. Implementeer status- en diagnoseantwoorden voor POS, Historiek, Dagafsluiting, Catalogus en Sync.
4. Voeg meerdere veilige acties per antwoord toe.
5. Bouw de rechten-/module-/planverklaring als één gedeelde resolver.

**Exitcriterium:** Pace kan niet alleen uitleggen hoe iets werkt, maar ook waarom het nú niet lukt wanneer PWAYMENT de oorzaak kent.

### Fase 3 — overige functionele domeinen

1. Klanten, loyalty en cadeaubonnen.
2. Webshop en orders.
3. ServiceDesk.
4. Workforce.
5. Inzichten, forecast en inkoop.
6. Integration Hub en migratie.
7. Hardware en klantendisplay.

**Exitcriterium:** alle acceptatievragen uit sectie 5 hebben een geteste intent, passend antwoordcontract en eerlijke capabilitygrens.

### Fase 4 — gecontroleerde AI-compositie en gesprek

1. Laat de server uitsluitend classificeren naar bestaande intent-ID’s.
2. Gebruik structured output met confidence en geen vrije actions.
3. Voeg korte lokale gesprekshistoriek en vervolgverwijzingen toe.
4. Laat AI alleen wording aanpassen aan `compact`, `friendly` of `explanatory`; feiten, stappen, rechten en acties blijven uit de kennisregistratie/contextproviders komen.
5. Houd de volledige lokale fallback functioneel wanneer AI uit, onbereikbaar of rate-limited is.

**Exitcriterium:** vrije formuleringen en vervolgvraagjes voelen natuurlijk, terwijl hetzelfde feitelijke antwoord reproduceerbaar en testbaar blijft.

### Fase 5 — meten, verfijnen en beheren

1. Voeg privacy-arme intenttelemetrie en antwoordfeedback toe.
2. Maak een ontwikkelrapport voor unmatched intents en verouderde kennisentries.
3. Verplicht bij iedere nieuwe feature een Pace-kennisentry, contextbesluit en regressietest.
4. Voeg CI-controle toe dat navigatieacties naar bestaande views/tabs verwijzen en dat kennisentries geen verlopen entitlementkeys gebruiken.

## 12. Definition of done per functionaliteit

Een functionaliteit is pas “Pace-volledig” wanneer:

- minstens 10 realistische vragen en varianten gedekt zijn, of aantoonbaar minder wanneer de functie klein is;
- how-to, actuele status, bekende blokkade en veilige navigatie afzonderlijk zijn ontworpen;
- rol, plan, module, platformflag en offlinegedrag zijn gecontroleerd waar relevant;
- iedere stap exact overeenkomt met zichtbare UI-labels;
- onbewezen of niet-geïmplementeerde mogelijkheden expliciet begrensd zijn;
- er minimaal één unit-test per intentfamilie en één rechten-/contexttest per gevoelige flow bestaat;
- suggestiechips op de relevante view zinvol zijn;
- een antwoord op mobiel binnen enkele seconden scanbaar is;
- geen antwoord een mutatie claimt die Pace niet zelf heeft uitgevoerd;
- een productwijziging ook de bijbehorende Pace-kennis en tests bijwerkt.

## 13. Aanbevolen eerste verticale slice

Begin niet met alle tekst tegelijk. Bouw één volledig werkende doorsnede op de Kassa:

1. dynamische kassavragen;
2. 20 kernintents uit sectie 5.1;
3. context voor mand, klant, korting, document en checkoutfase;
4. veilige acties naar zoekveld, mand, klant en Historiek;
5. rol-/PIN- en terminalgrenzen;
6. gesprekvervolgen;
7. unit-, rechten-, offline- en mobiele E2E-tests.

Daarna is de architectuur bewezen en kunnen Historiek/retouren, Dagafsluiting en Catalogus parallel volgens hetzelfde contract worden ingevuld. Dit voorkomt dat Pace een grote verzameling teksten wordt zonder betrouwbare koppeling met de echte applicatie.
