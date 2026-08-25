# Pace op de publieke website — onderzoeks- en positioneringsplan

**Datum:** 25 augustus 2026  
**Scope:** homepageblok, `/pace`, publieke claims en bewijsvoering  
**Doel:** Pace positioneren als de geïntegreerde intelligentielaag van PWAYMENT, zonder aantoonbare productgrenzen of privacykeuzes mooier voor te stellen dan ze zijn.

## 1. Besluit

De huidige website maakt Pace kleiner dan het product werkelijk is. Het homepageblok presenteert vooral een rustige “volgende stap”; de Pace-pagina legt vooral uit wat Pace niet doet en toont slechts één klantvoorbeeld. Daardoor blijven de sterkste productfeiten buiten beeld:

- Pace kent niet alleen de actieve pagina, maar combineert werkruimte, rol, winkelmand, setup, online/offlinestatus, afleverwachtrij en toegestane live winkelcontext.
- Pace heeft **45 gecontroleerde lokale intentfamilies** voor alle belangrijke merchantflows en **16 versieerbare kennisdomeinen** die ook de AI begrenzen.
- Pace kan actuele tenantdata interpreteren over catalogus, verkopen, klanten, abonnement, modules, webshoporders, herstellingen, inkoop, personeelsstatus en dagafsluiting.
- Pace werkt in drie lagen: proactieve signalen, deterministische lokale productkennis en optionele generatieve compositie via Gemini of OpenAI.
- Pace heeft lokale fallback: uitleg, signalen en bekende routes blijven nuttig als AI niet beschikbaar is.
- Pace maakt klantinzichten uit echte transacties: retourtermijnen, merkaffiniteit en automatisch geleerde productcombinaties, gefilterd op actuele voorraad en gecorrigeerd voor retouren.
- Pace kan veilige bestaande bestemmingen openen, maar voert geen betaling, retour, bestelling, personeelsbeslissing of andere definitieve mutatie zelfstandig uit.

De kernpositie wordt daarom:

> **Pace is de geïntegreerde AI-laag over de volledige retailoperatie van PWAYMENT: hij begrijpt waar je werkt, kent je toegestane winkelcontext, verklaart wat er gebeurt en brengt je naar de juiste volgende actie.**

Dit is sterker en preciezer dan “een AI-chat in je dashboard”. Het woord **volledige** slaat op de breedte van de retailcontext en de integratie in de operatie, niet op autonome uitvoering van iedere handeling.

## 2. Wat aantoonbaar in het product zit

| Capability | Wat de code werkelijk doet | Publieke formulering |
| --- | --- | --- |
| Contextbewuste assistent | Leest actieve werkruimte, rol, product- en mandaantallen, setup, online/offline en syncstatus; kan met toestemming winkelmanddetails en servercontext gebruiken. | “Pace begrijpt waar je werkt en wat daar nu relevant is.” |
| Productbrede kennis | 45 lokale intentfamilies over POS, retouren, dagafsluiting, catalogus, voorraad, inzichten, klanten, webshop, service, workforce, integraties, hardware, account en privacy. | “Van kassa en voorraad tot klanten, webshop, team en rapportage: Pace kent de PWAYMENT-workflows.” |
| Live winkelantwoorden | Tenant-scoped serverprojectie bevat onder meer verkoopaggregaten, betaalmix, lage voorraad, productmatches, transacties, klanten, abonnement/modules en operationele statussen. | “Vraag wat er in jouw winkel gebeurt en krijg een antwoord vanuit de gegevens waartoe jij toegang hebt.” |
| Generatieve AI met productgronding | Gemini is de primaire provider wanneer geconfigureerd; OpenAI is fallback. Antwoorden krijgen geselecteerde productkennis, lokale match en afgeschermde tenantcontext. | “Vrij vragen, met antwoorden die in PWAYMENT-productkennis en jouw winkelcontext verankerd zijn.” |
| Multi-turn gesprek | Maximaal zes recente gespreksturns worden meegestuurd; antwoorden zijn kort, plain text en begrensd. | “Pace kan een vervolgvraag in dezelfde context begrijpen.” |
| Proactieve signalen | Rangschikt offline, failed/retrying/pending sync, incomplete setup, lege catalogus, actieve mand en klantinzichten op prioriteit. | “Je hoeft niet altijd eerst een vraag te stellen: Pace brengt urgente signalen zelf rustig naar voren.” |
| Veilige hand-off | Lokale antwoorden en signalen kunnen naar bestaande werkruimtes, instellingen, setup of gefilterde catalogus leiden. | “Pace brengt je naar de juiste bestaande flow; jij controleert en bevestigt.” |
| Klantintelligentie | Retourtermijn op bevroren winkelbeleid, netto aankopen na retouren, merkaffiniteit, winkelbrede productaffiniteit en actuele voorraadfilter. | “Pace maakt echte aankoophistorie bruikbaar op het servicemoment, zonder een smaakprofiel te verzinnen.” |
| Offline/lokale fallback | Lokale kennis, signalen en bekende navigatie blijven beschikbaar; cloud-AI en verse servercontext vereisen verbinding. | “Ook zonder AI-provider blijft Pace bruikbare producthulp en lokale status geven.” |
| Persoonlijke regie | Instellingen voor aan/uit, AI, live winkelcontext, proactiviteit, beweging, toon, signaaltypes en klantbegeleiding; voorkeuren lokaal en per gebruiker/winkel opgeslagen. | “Iedere gebruiker bepaalt hoe proactief Pace is en welke context AI mag gebruiken.” |
| Veiligheidsgrenzen | Geen autonome financiële of definitieve mutaties; normale rollen, entitlements, bevestiging en manager-PIN blijven gelden; kritieke dialogen onderdrukken Pace. | “Pace adviseert en navigeert. Rollen, controles en bevestigingen blijven intact.” |

## 3. Claims die niet gepubliceerd mogen worden

### Niet aantoonbaar: “het eerste platform” of “niemand heeft dit”

Actuele primaire bronnen tonen dat Shopify Sidekick, Square AI en Lightspeed AI eveneens contextuele of geïntegreerde AI in commerce/retail aanbieden. PWAYMENT mag zich dus niet feitelijk “de eerste” of “de enige” noemen zonder een onafhankelijk, afgebakend marktonderzoek en een exacte vergelijkingsdefinitie.

Wel verdedigbaar:

- “AI geïntegreerd over je volledige retailoperatie.”
- “Geen losse chatbot naast je winkelsoftware.”
- “Van live winkelvraag tot veilige volgende workflow.”
- “Eén intelligentielaag voor kassa, voorraad, klanten, webshop, service, team en rapportage.”
- “Gebouwd voor de realiteit van Belgische retail.”

### Huidige siteclaim: “externe AI is optioneel, standaard uit”

Dit botst met `DEFAULT_PACE_PREFERENCES`, waar `aiEnabled: true` staat. Kies één productbesluit:

1. AI werkelijk opt-in maken en de default in code wijzigen; of
2. de site eerlijk wijzigen naar “AI is afzonderlijk uitschakelbaar”.

Voor dit plan wordt optie 2 als huidige waarheid gebruikt.

### Huidige siteclaim: “nooit klantprofielen, aankoopregels of andere klantdata”

Te absoluut. De lokale `customerInsights`-records worden inderdaad niet naar de AI-request gekopieerd, maar toegestane live context kan wel klantnaam/-aggregaten bevatten en de actieve winkelmand kan klantnaam en productregels bevatten wanneer **live winkelcontext** aanstaat. De serverprojectie bevat bovendien beperkte klantmatches en topklanten.

Correcte publieke formulering:

> “Pace gebruikt alleen afgeschermde context waarvoor de ingelogde gebruiker binnen deze winkel toegang heeft. Je kunt live winkelcontext afzonderlijk uitschakelen. Lokale klantinzichtkaarten worden niet als klantinzichtrecord naar de AI-provider gestuurd.”

Voor een sterkere privacyclaim is eerst een productwijziging nodig: namen/persoonsgegevens uit de AI-projectie verwijderen of per vraag expliciet laten toestemmen.

### Niet zeggen

- Dat Pace betalingen, retouren, bestellingen of personeelsbeslissingen zelfstandig uitvoert.
- Dat alle klantinzichten uitsluitend lokaal blijven; er bestaat ook een server-side affiniteitspad.
- Dat generatieve antwoorden offline werken.
- Dat iedere zichtbare integratie ook een werkende externe connector bewijst.
- Dat “AI in elke functie” betekent dat elke functie door AI kan worden gewijzigd.

## 4. Nieuw homepageblok

### Rol van het blok

Dit mag geen kleine featureteaser meer zijn. Pace is de strategische differentiator en moet direct na de eerste productdemonstratie als **platformlaag** worden uitgelegd. Het blok moet drie dingen binnen vijf seconden bewijzen:

1. de AI zit door de hele winkeloperatie;
2. hij kent live context, niet alleen algemene tekst;
3. de medewerker houdt controle.

### Voorgestelde kerncopy

**Eyebrow**  
`PACE · AI DOOR HEEL PWAYMENT`

**Headline**  
`Niet nóg een AI-chat.`  
`Een intelligentielaag voor je hele winkel.`

**Body**  
`Pace begrijpt waar je werkt, kent de PWAYMENT-workflows en gebruikt—als jij dat toestaat—de actuele context van je winkel. Vraag naar omzet, voorraad, klanten of een vastgelopen proces. Pace verklaart wat er speelt en brengt je naar de juiste volgende stap.`

**Proof labels**

- `Kassa tot dagafsluiting`
- `Live context per winkel en rol`
- `Lokale fallback zonder AI-provider`

**CTA**  
`Ontdek Pace in actie →`

**Control line**  
`Pace adviseert en navigeert. Jij controleert en bevestigt.`

### Visual

Vervang het losse Pace-logo door een compacte, geloofwaardige productdemonstratie:

- links een echte Pace-vraag: “Welke producten dreigen uit voorraad te gaan?”;
- midden een korte contextregel: `23 lage-voorraadartikelen · live winkeldata · eigenaar`;
- rechts een antwoord met één vervolgstap: `Open voorraadinzichten`;
- daaronder drie wisselbare situaties: **Kassa**, **Voorraad**, **Dagafsluiting**;
- behoud de donkere Pace-identiteit, maar toon vooral productgedrag in plaats van mascotte.

Op mobiel wordt dit één scenario met een horizontale scenariokiezer. Animatie respecteert reduced motion.

## 5. Nieuwe structuur voor `/pace`

### 1. Hero — de categorie claimen

**Eyebrow:** `PACE · RETAILINTELLIGENTIE IN DE WORKFLOW`  
**H1:** `De AI-laag die je hele winkel begrijpt.`  
**Intro:** `Pace combineert PWAYMENT-productkennis, jouw actieve werkruimte en toegestane live winkelcontext. Zo krijg je geen generiek antwoord, maar een bruikbare volgende stap binnen de flow waarin je al werkt.`

CTA’s:

- `Probeer PWAYMENT gratis`
- `Bekijk vier echte Pace-situaties`

Hero-visual: een geloofwaardige uitsnede van het echte Pace-paneel met vraag, live-contextlabel, antwoordbron en veilige actieknop. Niet alleen het Pace-symbool.

### 2. Bewijsstrip — meteen concreet

- `45 gecontroleerde vraagroutes`
- `16 productkennisdomeinen`
- `Live context onder winkelrechten`
- `Lokale fallback bij AI-uitval`

Deze aantallen mogen alleen blijven zolang ze vanuit code worden gegenereerd of bij releases worden gecontroleerd. Anders formuleren zonder getal.

### 3. “Eén Pace, vier momenten” — interactieve productdemo

Vier tabs met realistische, door de code gedekte situaties:

1. **Kassamedewerker** — “Waarom werd deze sync afgewezen?” met echte oorzaak en herstelroute.
2. **Eigenaar** — “Wie is mijn beste klant en wat verkocht ik vandaag?” met periode en live context.
3. **Voorraadbeheer** — “Wat dreigt uit voorraad te gaan?” met lage voorraad en link naar relevante producten.
4. **Service aan de kassa** — retourtermijn, eerdere netto aankoop en een beschikbare aanvulling, pas na bewuste klantkoppeling.

Iedere demo toont zichtbaar:

`vraag → gebruikte context → antwoord → veilige volgende actie`

Zo wordt het onderscheid tastbaar: Pace is niet enkel een model dat tekst genereert, maar een orchestratie van productkennis, actuele context en bestaande workflows.

### 4. “Geïntegreerd over de hele retailoperatie”

Geen vier generieke capabilitycards, maar een brede operationele kaart:

- Kassa & betalingen
- Historiek, retouren & facturen
- Dagafsluiting & kascontrole
- Catalogus, varianten & voorraad
- Inzichten, forecast & inkoop
- Klanten, loyalty & cadeaubonnen
- Webshop & orders
- ServiceDesk & herstellingen
- Team, rooster & verlof
- Integraties, migratie & synchronisatie

Per domein één voorbeeldvraag. Dit bewijst “volledige integratie” veel beter dan de huidige abstracte tekst.

### 5. “Pace ziet wat nu telt” — proactieve laag

Leg uit dat Pace niet op een prompt hoeft te wachten. Toon de prioriteitsstack:

`offline/failed sync → setupblokkade → actieve winkelcontext → klantinzicht → gewone werkruimtehulp`

Benadruk dat urgente signalen voorrang krijgen, gedempt kunnen worden en verdwijnen wanneer ze opgelost zijn.

### 6. “Van transacties naar betere service” — klantintelligentie

Behoud het goede Anneke-voorbeeld, maar maak het technisch en commercieel sterker:

- retouren worden van eerdere aankopen afgetrokken;
- demo-aankopen, diensten en cadeaubonnen worden uitgesloten;
- aanbevelingen moeten op voorraad zijn;
- winkelbrede productcombinaties worden automatisch sterker of zwakker door nieuwe verkopen;
- iedere suggestie blijft een voorstel en voegt niets automatisch aan de mand toe.

Gebruik niet de claim “alles lokaal”. Benoem precies welk inzicht lokaal wordt berekend en wanneer de centrale winkelscore wordt gebruikt.

### 7. “Drie lagen, één betrouwbaar antwoord” — architectuur in gewone taal

1. **Lokale signalen** — actieve pagina, setup, winkelmand en synchronisatie.
2. **PWAYMENT-kennis** — gecontroleerde uitleg en grenzen voor echte productflows.
3. **AI-compositie** — vrije taal en live winkelvragen wanneer AI en context zijn ingeschakeld.

Fallbackboodschap: als laag 3 wegvalt, blijven laag 1 en 2 bruikbaar. Dit is een veel sterker betrouwbaarheidsverhaal dan alleen “AI is optioneel”.

### 8. “Jij bepaalt de grenzen” — transparantie en controle

Toon de echte instellingen als product-UI:

- Pace aan/uit
- AI-antwoorden aan/uit
- live winkelcontext aan/uit
- stil, gebalanceerd of proactief
- compact of uitleggend
- operationele, setup-, inzicht- en klantbegeleiding
- beweging en reduced motion

Daarnaast expliciet:

- tenant- en rolcontrole;
- geen PINs, wachtwoorden, API-sleutels of volledige kaartgegevens;
- geen definitieve mutatie zonder bestaande productflow en bevestiging;
- kritieke dialogen sluiten Pace automatisch.

### 9. CTA — laat de belofte aansluiten op bewijs

**Headline:** `Je winkelsoftware kent de cijfers. Pace helpt je begrijpen wat ze nu betekenen.`  
**Primary:** `Start gratis met PWAYMENT`  
**Secondary:** `Plan een Pace-demo`

## 6. Copytoon

Pace moet zelfverzekerd worden verkocht, maar niet futuristisch of vaag.

Wel:

- concrete winkelvragen;
- echte schermen en echte contextlabels;
- “begrijpt”, “verklaart”, “rangschikt”, “brengt je naar”;
- “geïntegreerd over de hele retailoperatie”;
- Belgische retailtaal: kassa, ticket, kasverschil, retour, voorraad, winkel.

Niet:

- “magisch”, “revolutionair” of “voelt aan” zonder bewijs;
- lange verdediging tegen Clippy als hoofdverhaal;
- concurrenten bij naam aanvallen;
- angstige formuleringen waarin vooral wordt uitgelegd wat Pace niet kan.

De veiligheid blijft zichtbaar, maar wordt bewijs onder de sterke hoofdpropositie—niet de hoofdpropositie zelf.

## 7. Implementatievolgorde

### Fase 1 — claims corrigeren

- Corrigeer “standaard uit”.
- Vervang absolute privacyclaims door de feitelijke context- en toestemmingsgrenzen.
- Leg intern vast of AI in de toekomst opt-in of standaard aan moet zijn.
- Beslis of persoonsnamen in server- en cartcontext naar de AI-provider mogen blijven gaan.

### Fase 2 — homepageblok herbouwen

- Nieuwe copy en proof labels.
- Productdemonstratie in plaats van los logo.
- Drie scenario’s met echte, door tests gedekte antwoorden.
- Responsive en reduced-motionvariant.

### Fase 3 — `/pace` inhoudelijk herbouwen

- Nieuwe hero en bewijsstrip.
- Interactieve vierscenario-demo.
- Operationele domeinkaart.
- Proactieve laag, klantintelligentie, drie-lagenarchitectuur en echte instellingen.
- Nieuwe afsluitende CTA.

### Fase 4 — kwaliteit en onderhoud

- Nederlandse broncopy eerst afronden; daarna bewuste EN/FR-vertaling in plaats van automatische of letterlijke vertaling.
- SEO-title richten op “AI retailsoftware / AI kassasysteem / retail assistant België”, zonder “eerste” of “enige”.
- Accessibility: semantische tabs, toetsenbordnavigatie, contrast, aria-labels en reduced motion.
- Tests toevoegen die verboden claims detecteren en bewijsgetallen aan de broncode koppelen.
- Visuele regressie op desktop en mobiel.
- Analytics op homepage-CTA, scenariotabs en conversie naar registratie/demo.

## 8. Acceptatiecriteria

De herwerking is geslaagd wanneer:

- een bezoeker binnen vijf seconden begrijpt dat Pace AI door de volledige PWAYMENT-operatie integreert;
- de homepage minimaal drie concrete productbewijzen toont;
- `/pace` minimaal vier door de code gedekte situaties demonstreert;
- iedere publieke privacy- en defaultclaim overeenkomt met de actuele runtime;
- nergens “eerste”, “enige” of “niemand anders” staat zonder onafhankelijk bewijs;
- nergens autonome uitvoering wordt gesuggereerd;
- offline fallback en generatieve AI duidelijk van elkaar worden onderscheiden;
- NL, EN en FR inhoudelijk dezelfde belofte en grenzen dragen;
- Pace visueel als productgedrag wordt getoond, niet hoofdzakelijk als mascotte of abstract logo.

## 9. Onderzoeksbasis

Interne productbronnen:

- `src/pace/paceKnowledge.ts`
- `src/pace/paceProductKnowledge.ts`
- `src/pace/paceSignals.ts`
- `src/pace/paceAi.ts`
- `src/pace/customerInsights.ts`
- `src/pace/PaceAssistant.tsx`
- `src/pace/usePace.ts`
- `src/components/PaceSettings.tsx`
- `api/pace/respond.ts`
- `supabase/migrations/20260824234500_pace_ai_tenant_context.sql`
- `supabase/migrations/20260825015000_expand_pace_customer_context.sql`
- `supabase/migrations/20260824143000_pace_actionable_recommendations.sql`
- `supabase/migrations/20260824170000_pace_platform_affinity_engine.sql`

Verificatie op 25 augustus 2026:

- 45 lokale intentfamilies geteld.
- 16 AI-productkennisdomeinen geteld.
- 53 geselecteerde Pace-tests geslaagd in 7 testbestanden.

Externe primaire bronnen voor de marktclaim:

- Shopify Help Center — Sidekick: https://help.shopify.com/en/manual/ai-powered-tools/sidekick
- Square — Square AI voor retail: https://squareup.com/us/en/releases/retail
- Lightspeed — introductie Lightspeed AI: https://www.lightspeedhq.com/news/lightspeed-commerce-launches-lightspeed-ai-a-new-ai-powered-intelligence-layer-for-retail-and-hospitality/

