# Pace Settings — redesign- en implementatieplan

> **Planstatus:** dit document beschrijft ontwerpbeslissingen en gerichte
> implementatie, niet de algemene releasegereedheid van PWAYMENT. Zie
> [`PROJECT-CONTEXT.md`](PROJECT-CONTEXT.md) voor de actuele projectstatus.

## 1. Doel

De Pace-instellingen worden één actuele, begrijpelijke beheerplek voor drie verschillende zaken:

1. hoe de ingelogde gebruiker Pace persoonlijk ervaart;
2. of AI-antwoorden en live winkelcontext gebruikt mogen worden;
3. welke winkelbrede signalen de zaakvoerder voor het team activeert.

Het scherm moet visueel aansluiten op de bestaande PWAYMENT-instellingen: wit, slate, sky/cyan als accent, rustige borders, compacte kaarten, concrete statuslabels en geen geïsoleerde donkere “experience”-sectie.

## 2. Huidige problemen die expliciet worden opgelost

### 2.1 Verkeerde positionering

De pagina heet en beschrijft Pace nog als “persoonlijke service” voor terugkerende klanten. Pace is inmiddels veel breder: vrije AI-vragen, navigatiehulp, productkennis, actuele winkelcijfers, operationele signalen, synchronisatiehulp en klantcontext.

### 2.2 Twee concurrerende instellingenoppervlakken

- `PaceSettings.tsx` beheert alleen winkelbrede klantinzichten.
- De instellingen in `PaceAssistant.tsx` beheren lokale UI-voorkeuren.
- Beide noemen zichzelf Pace-instellingen, gebruiken andere woorden en tonen niet duidelijk waar een keuze wordt bewaard.

### 2.3 Onduidelijke hoofdschakelaars

- “Pace actief” betekent momenteel: launcher op dit toestel tonen.
- “Persoonlijke verkoophulp” betekent: klantinzichten voor de winkel activeren.
- Er bestaat geen gebruikersschakelaar voor AI-antwoorden.
- De buildflag `VITE_ENABLE_PACE_AI` is deploymentconfiguratie en geen bruikbare productinstelling.

### 2.4 Verkeerde opslaggrenzen

- Persoonlijke Pace-voorkeuren staan in één browserbrede local-storage-key.
- Ze zijn niet gekoppeld aan `user_id` en `store_id`.
- Een gedeelde kassa kan daardoor voorkeuren van de vorige gebruiker overnemen.
- Winkelbrede klantinstellingen worden wel via Supabase opgeslagen, maar zonder duidelijke owner-only status of betrouwbare save-feedback op deze pagina.

### 2.5 Visuele afwijking

- De grote donkere hero en Motion Lab voelen als een los marketingexperiment.
- De pagina wijkt af van Modules, Hardware, Geluid en andere PWAYMENT-settings.
- De grote gradients, glow en zwarte achtergrond krijgen visueel meer gewicht dan de instellingen zelf.

### 2.6 Verouderde en te absolute copy

- “Werkt zodra een klant is gekoppeld” beschrijft slechts één Pace-functie.
- “Klantgegevens blijven binnen jouw winkel” is te absoluut nu geselecteerde, beveiligde winkelcontext server-side naar Gemini kan gaan.
- “Kiest uit beschikbare artikelen” beschrijft niet hoe de huidige AI werkt.
- De pagina legt lokale fallback, AI, live data, permissions en opslaglocatie niet uit.

## 3. Nieuwe informatiearchitectuur

De pagina krijgt vijf vaste secties in deze volgorde.

### 3.1 Overzicht

Een lichte PWAYMENT-kaart met:

- Pace-merkteken op witte/sky achtergrond;
- titel: “Pace-instellingen”;
- uitleg: “Bepaal hoe Pace antwoordt, welke winkelcontext het gebruikt en welke signalen je team ziet.”;
- drie compacte statussen:
  - Pace zichtbaar: aan/uit;
  - AI-antwoorden: aan/uit/beschikbaarheidsfallback;
  - Winkelcontext: toegestaan/beperkt;
- bewaarscope: “Persoonlijk voor [naam]” en winkelnaam;
- geen dark-modevlak, glowhero of marketingclaim.

### 3.2 Mijn Pace

Persoonlijke instellingen voor de ingelogde gebruiker:

- `Pace tonen in de werkruimte`
  - bepaalt of de launcher en het zijpaneel zichtbaar zijn;
  - zet Pace niet winkelbreed uit;
  - uitschakelen blijft herstelbaar via Profiel → Pace.
- `AI-antwoorden gebruiken`
  - nieuwe echte gebruikersinstelling;
  - aan: vrije vragen gaan via de beveiligde serverroute naar Gemini;
  - uit: Pace gebruikt uitsluitend de lokale kennisbank en deterministische statusinformatie;
  - wijziging geldt onmiddellijk voor nieuwe vragen;
  - lokale fallback blijft automatisch beschikbaar wanneer AI tijdelijk niet reageert.
- `Live winkelcontext in AI-antwoorden`
  - alleen actief wanneer AI-antwoorden aanstaan;
  - aan: server-side allow-list met tenantcontrole kan omzet, voorraad, klanten en operationele tellingen ophalen;
  - uit: Gemini ontvangt alleen productkennis en niet de actuele winkelprojectie;
  - nooit PINs, wachtwoorden, API-sleutels, betaalkaartdata, klantnotities of volledige contactdossiers.
- `Antwoordstijl`
  - Kort en direct;
  - Vriendelijk;
  - Meer uitleg.
- `Proactiviteit`
  - Alleen op vraag;
  - Gebalanceerd;
  - Coachend.

Elke rij vermeldt zichtbaar waar de instelling geldt: “Mijn account”, “Deze winkel” of “Dit toestel”.

### 3.3 Gedrag en animatie

Een lichte previewkaart in dezelfde stijl als ModuleSettings:

- live PaceMark-preview op `bg-sky-50`, niet op zwart;
- bewegingskeuze:
  - Volledig;
  - Subtiel;
  - Uit.
- expressieve vormen:
  - vraagteken bij begrijpen;
  - blob bij verwerken;
  - uitroepteken bij aandacht.
- drie kleine testknoppen blijven beschikbaar, maar heten “Bekijk vraag”, “Bekijk verwerking” en “Bekijk aandacht”.
- preview is ondersteunend en maximaal circa 180 px hoog;
- reduced-motion van het besturingssysteem krijgt een zichtbaar maar rustig statusbericht;
- geen termen als “Motion Lab”, “Morph Pace” of “performance” in de merchant-UI.

### 3.4 Meldingen en begeleiding

Persoonlijke filters:

- Operationele waarschuwingen
  - offline status;
  - synchronisatiewachtrij;
  - afgewezen mutaties;
  - betaalstatus die controle vereist.
- Instellingshulp
  - ontbrekende winkelsetup;
  - catalogussetup;
  - moduleconfiguratie.
- Inzichtbegeleiding
  - voorraad- en verkoopinzichten;
  - besteladvies;
  - actiekaarten.
- Klantcontext tonen
  - alleen wanneer de winkelbrede klantinzichten actief zijn;
  - legt uit dat een klant eerst bewust gekoppeld moet zijn.
- “Verborgen tips herstellen” als secundaire actie, met count indien beschikbaar.

### 3.5 Voor deze winkel

Alleen eigenaar kan wijzigen; manager en kassier zien een read-only samenvatting.

- `Klantinzichten voor het team`
  - winkelbrede hoofdschakelaar;
  - vervangt “Persoonlijke verkoophulp”.
- `Merkpatronen tonen`
  - alleen actief als klantinzichten aanstaan;
  - copy benoemt dat dit uit aankoophistoriek van dezelfde winkel komt.
- `Retourmomenten tonen`
  - koppelt aan de commerciële retourpolicy;
  - dagenvenster en herinneringsmoment blijven instelbaar;
  - wettelijke garantie wordt duidelijk onderscheiden van commerciële retourservice.
- toekomstige winkelbrede instellingen worden hier toegevoegd, niet in de persoonlijke sectie.

Deze sectie toont expliciet “Bewaard voor alle medewerkers van [winkel]”.

## 4. AI-schakelaar: exact gedrag

### 4.1 AI aan

Vraagpad:

1. lokale intentmatch wordt altijd voorbereid als veilige fallback;
2. actieve Supabase-sessie wordt gecontroleerd;
3. indien toegestaan wordt tenantcontext server-side opgehaald;
4. Gemini krijgt productkennis, toegestane context en gesprekshistoriek;
5. bij succes toont de UI “Pace · AI”;
6. bij timeout, 429 of providerstoring valt Pace terug op lokale kennis.

### 4.2 AI uit

- `askPaceAi` wordt helemaal niet aangeroepen;
- er verlaat geen AI-request de browser;
- lokale intenten, navigatie, synchronisatiestatus en veilige fallback blijven werken;
- UI-label: “Pace · lokaal”;
- de vraagbalk blijft beschikbaar, zodat “AI uit” niet voelt als “Pace kapot”.

### 4.3 Live winkelcontext uit

- AI blijft algemene PWAYMENT-vragen beantwoorden;
- `storeId`, cart summary en tenant-RPC-resultaat worden niet aan de AI-route meegegeven;
- vragen naar eigen omzet/klanten/voorraad krijgen eerlijk antwoord dat live winkeldata voor AI is uitgeschakeld;
- de UI biedt een directe link naar de relevante instelling, geen technische fout.

### 4.4 Deploymentflag uit

- gebruikersschakelaar wordt disabled met status “AI momenteel niet beschikbaar”;
- geen toggle die visueel aan kan staan terwijl de serverfunctie uitstaat;
- lokale werking blijft beschikbaar.

### 4.5 Quota of storing

- gebruikersvoorkeur blijft “AI aan”; een providerstoring verandert de opgeslagen keuze niet;
- tijdelijke status: “Lokale reserve actief”;
- geen foutcodes, providerjargon of advies om opnieuw in te loggen;
- automatische volgende poging na cooldown.

## 5. Nieuwe gegevensarchitectuur

### 5.1 Persoonlijke, gesynchroniseerde voorkeuren

Nieuwe tabel `pace_user_preferences`:

- `store_id uuid`;
- `user_id uuid`;
- `pace_visible boolean`;
- `ai_enabled boolean`;
- `live_store_context_enabled boolean`;
- `proactivity text`;
- `answer_tone text`;
- `motion text`;
- `expressive_morphs boolean`;
- `operational_signals boolean`;
- `setup_guidance boolean`;
- `insight_guidance boolean`;
- `customer_guidance boolean`;
- `created_at`, `updated_at`;
- primary key `(store_id, user_id)`.

RLS:

- gebruiker mag alleen eigen rij binnen een actieve storemembership lezen/schrijven;
- geen service-role nodig in de browser;
- validatieconstraints voor enums;
- trigger voor `updated_at`;
- authenticated grants minimaal houden.

### 5.2 Lokale cache

- Zustand blijft voor instant UI en offline gebruik;
- storage-key wordt gescopeerd op `store_id:user_id`;
- Supabase is authoritatief wanneer online;
- lokale wijziging wordt optimistic toegepast en daarna opgeslagen;
- bij fout toont de pagina “Niet bewaard — probeer opnieuw” en behoudt de vorige serverwaarde als hersteloptie.

### 5.3 Winkelbrede instellingen

- bestaande `stores.customer_insight_settings` blijft winkelbreed;
- alleen owner mag muteren;
- update gaat via een expliciete storefunctie/service met save-status, niet via een generieke profieldebounce zonder zichtbare foutafhandeling;
- commerciële retourpolicy blijft apart maar de UI coördineert beide velden atomair of met gecontroleerde rollback.

### 5.4 Migratie bestaande gebruikers

- bestaande lokale `pwayment:pace:v1`-waarden één keer importeren naar de nieuwe user/store-scope;
- ontbrekende velden krijgen veilige defaults;
- `ai_enabled` default aan voor bestaande actieve Pace-gebruikers, tenzij deployment-AI uitstaat;
- `live_store_context_enabled` default aan, met duidelijke privacyuitleg;
- oude key pas verwijderen nadat hydratatie geslaagd is;
- gedeelde apparaten mogen geen voorkeur van een vorige gebruiker tonen.

## 6. Visueel ontwerp

### 6.1 Te gebruiken huisstijl

- pagina: `max-w-5xl`, rustige verticale spacing;
- hoofdsurfaces: `bg-white`, `border-slate-200`, `shadow-sm`;
- accent: `sky-50`, `sky-200`, `sky-700`;
- tekst: `slate-950`, secundair `slate-600/500`;
- actieve status: emerald;
- aandacht: amber;
- fout: rose;
- radius: 16–24 px, consistent met ModuleSettings;
- geen full-bleed zwarte hero, neon glow of donker dashboardvlak.

### 6.2 Componenten

- `PaceSettingsOverview`;
- `PacePreferenceRow` met label, uitleg, scopebadge, control en eventuele dependency;
- `PaceAiControls`;
- `PaceMotionPreview`;
- `PaceGuidanceControls`;
- `PaceStoreControls`;
- `PacePrivacySummary`;
- `PaceSaveStatus`.

### 6.3 Responsive gedrag

- desktop: hoofdcontent en compacte statuskolom waar nuttig;
- tablet: één kolom, preview boven controls;
- mobiel: controles onder tekst, minimaal 44 px aanraakdoel;
- lange Nederlandse, Franse en Engelse labels mogen niet afkappen;
- sticky aside alleen als die geen primaire controls bevat.

## 7. Nieuwe copy

### Paginaheader

- Titel: `Pace-instellingen`
- Subtitel: `Bepaal hoe Pace antwoordt, welke winkelcontext het gebruikt en welke signalen je tijdens het werk ziet.`

### AI

- Titel: `AI-antwoorden`
- Beschrijving aan: `Pace kan vrije vragen beantwoorden met PWAYMENT-kennis en, als je dat toestaat, actuele gegevens van deze winkel.`
- Beschrijving uit: `Pace blijft lokaal helpen met navigatie, synchronisatiestatus en ingebouwde productkennis.`

### Live context

- Titel: `Actuele winkelgegevens gebruiken`
- Beschrijving: `Geeft Pace toegang tot een beperkte, beveiligde samenvatting van deze winkel, zoals tellingen, voorraadstatus en recente activiteit. Gevoelige geheimen en klantnotities worden niet meegestuurd.`

### Animatie

- Titel: `Beweging en expressie`
- Beschrijving: `Kies hoeveel Pace beweegt tijdens vragen, waarschuwingen en begeleiding.`

### Teamcontext

- Titel: `Klantinzichten voor het team`
- Beschrijving: `Toon relevante winkelinzichten nadat een medewerker bewust een klant aan de verkoop heeft gekoppeld.`

## 8. Drawer versus volledige pagina

De drawer bevat geen tweede volledige instellingenpagina meer.

In de drawer blijven alleen quick controls:

- Pace tijdelijk tonen/verbergen op dit toestel;
- AI-antwoorden aan/uit;
- antwoordstijl;
- beweging;
- knop `Alle Pace-instellingen openen`.

Alle uitgebreide privacy-, signaal-, klant- en winkelinstellingen staan uitsluitend op Profiel → Pace. Beide oppervlakken gebruiken dezelfde store en dezelfde labels.

## 9. Rollen en bevoegdheden

### Owner

- beheert eigen persoonlijke voorkeuren;
- beheert winkelbrede klantinzichten en retourmomenten;
- ziet save- en foutstatus.

### Manager

- beheert eigen persoonlijke voorkeuren;
- ziet winkelbrede configuratie read-only;
- krijgt tekst “Beheerd door de zaakvoerder”.

### Cashier

- beheert eigen zichtbaarheid, AI, stijl en animatie voor zover het winkelbeleid dit toestaat;
- ziet geen configuratievelden die gevoelige winkelbrede regels suggereren;
- ziet een korte read-only samenvatting van actieve teambegeleiding.

Later kan een owner-policy AI winkelbreed blokkeren; die policy overridet altijd de persoonlijke AI-toggle en wordt duidelijk uitgelegd.

## 10. Toestanden die ontworpen en getest moeten worden

- eerste laadbeurt;
- voorkeuren laden;
- online en opgeslagen;
- lokaal gewijzigd, server save bezig;
- save geslaagd;
- save mislukt;
- offline met lokale cache;
- AI deployment niet geconfigureerd;
- AI persoonlijk uit;
- live winkelcontext uit;
- Gemini tijdelijk over quota;
- lokale fallback actief;
- reduced-motion actief;
- store switch;
- user switch op gedeeld toestel;
- owner, manager en cashier;
- klantinzichten winkelbreed uit;
- retourpolicy uit terwijl retourherinneringen worden aangezet;
- oude voorkeuren migreren;
- corrupte/partiële persisted state.

## 11. Implementatiefasen

### Fase A — semantiek en datamodel

1. definitieve scopes van elke instelling vastleggen;
2. `aiEnabled` en `liveStoreContextEnabled` toevoegen;
3. Supabase-tabel, constraints, RLS en grants toevoegen;
4. user/store-aware preference service bouwen;
5. local-storagemigratie implementeren;
6. storewissel en logout correct afhandelen.

Acceptatie: twee gebruikers op hetzelfde toestel erven elkaars instellingen niet; dezelfde gebruiker behoudt instellingen op een tweede toestel.

### Fase B — werkelijk AI-gedrag

1. AI-toggle koppelen aan `askPaceAi`;
2. live-contexttoggle afdwingen vóór requestconstructie;
3. lokale fallback expliciet behouden;
4. runtimebeschikbaarheid onderscheiden van gebruikersvoorkeur;
5. statuslabel en foutcopy toevoegen.

Acceptatie: netwerkinspectie toont nul AI-request wanneer AI uitstaat en geen tenantcontext wanneer live context uitstaat.

### Fase C — volledige pagina herbouwen

1. donkere hero verwijderen;
2. nieuwe lichte overview bouwen;
3. vijf secties implementeren;
4. owner-only/read-only gedrag toevoegen;
5. echte save-status per scope tonen;
6. alle copy actualiseren.

Acceptatie: scherm sluit visueel aan bij Modules en Hardware en bevat nergens oude “alleen klantservice”-positionering.

### Fase D — drawer vereenvoudigen

1. dubbele instellingen verwijderen;
2. een compact, afzonderlijk overzicht voor actuele aandachtspunten tonen;
3. vraag, denkstatus en antwoord in een eigen conversatievenster plaatsen;
4. deeplink naar de volledige instellingenpagina toevoegen.

Acceptatie: het venster bevat geen tweede instellingeninterface en de conversatie wordt niet meer verdrongen door setup- of signaalkaarten.

### Fase E — kwaliteit en release

1. unit-tests voor migratie, scoping en togglelogica;
2. API-tests voor AI/context off;
3. componenttests voor rollen en dependencies;
4. E2E voor owner/manager/cashier, store switch en gedeeld toestel;
5. responsive visuele QA op desktop/tablet/mobile;
6. reduced-motion QA;
7. keyboard, focus, screenreaderlabels en 44 px targets;
8. productiebuild, bundlebudget, Supabase releaseasserties;
9. gefaseerde productiecheck met echte sessie.

## 12. Concrete acceptatiecriteria

De redesign is pas klaar wanneer:

- er nergens een donker Motion Lab-venster staat;
- de pagina Pace correct beschrijft als AI- en operationele copiloot;
- de gebruiker AI daadwerkelijk kan uitschakelen;
- AI uit betekent aantoonbaar geen modelrequest;
- live context apart kan worden uitgeschakeld;
- elke instelling haar scope toont;
- persoonlijke voorkeuren aan user én store gekoppeld zijn;
- winkelbrede instellingen alleen door owner wijzigbaar zijn;
- drawer en volledige pagina dezelfde bron gebruiken;
- save-, offline-, fallback- en fouttoestanden zichtbaar en menselijk zijn;
- privacycopy technisch correct is en geen absolute onwaarheden bevat;
- alle kernflows geautomatiseerd getest zijn;
- de pagina visueel naast ModuleSettings kan staan zonder aan te voelen als een andere applicatie.

## 13. Aanbevolen uitvoeringsvolgorde

Niet beginnen met CSS. Eerst datamodel en betekenis, daarna gedrag, daarna UI, daarna migratie en tests. De AI-toggle is de eerste functionele mijlpaal; de lichte visuele redesign wordt pas aangesloten zodra die toggle werkelijk het requestpad bestuurt.

## 14. Redesign van het Pace-venster

### 14.1 Primaire taak

Het venster heeft één primaire taak: de gebruiker stelt een vraag en leest een bruikbaar antwoord. Context, setup en signalen ondersteunen die taak, maar mogen de vraagbalk en het antwoord nooit uit beeld duwen.

### 14.2 Twee vaste oppervlakken

#### Oppervlak A — Nu belangrijk

- eigen lichte kaart bovenaan;
- compacte online-, werkruimte-, rol- en klantstatus;
- maximaal één volledig primair aandachtspunt;
- winkelsetup als compacte voortgangsregel;
- maximaal twee secundaire aandachtspunten zonder lange beschrijving;
- eigen begrensde scroll wanneer de inhoud niet past.

#### Oppervlak B — Vraag Pace

- eigen witte conversatiekaart;
- grotere, rustige invoerbalk bovenaan;
- status naast de titel: AI met winkelgegevens, AI zonder winkelgegevens of lokale hulp;
- suggesties op één horizontale, scrollbare regel;
- lege toestand met Pace-merkteken en één concrete uitnodiging;
- denktoestand met de bestaande Pace-animatie;
- antwoord met duidelijk grotere typografie, stappen, beperking, actie en vervolgvragen;
- veiligheidsregel onderaan, zonder het antwoord te onderbreken.

### 14.3 Animaties

- het bestaande Pace-merkteken blijft in de header;
- de bestaande denkbeweging blijft tijdens AI- en lokale verwerking;
- vraagteken, uitroepteken en blob blijven beschikbaar als persoonlijke preview op de instellingenpagina;
- reduced-motion en de persoonlijke bewegingskeuze blijven leidend;
- animatie ondersteunt status en aandacht, nooit decoratieve drukte.

### 14.4 Instellingenroute

Het schuifregelaaricoon in het Pace-venster opent rechtstreeks de volledige Pace-instellingenpagina. Het oude ingebouwde settingspaneel en de donkere Motion Lab-stijlen worden volledig verwijderd.

### 14.5 Vensteracceptatie

- vraagbalk is zonder scrollen zichtbaar bij het openen;
- overzicht en conversatie voelen als twee afzonderlijke vensters;
- lange setupcontent kan de conversatie niet meer wegduwen;
- `hi`, operationele vragen en vrije AI-vragen gebruiken dezelfde flow;
- AI uit is onmiddellijk zichtbaar als `Lokale hulp`;
- live winkelcontext uit is zichtbaar als `AI zonder winkelgegevens`;
- tijdens nadenken blijft de bestaande Pace-animatie zichtbaar;
- op mobiel blijft de vraagruimte groter dan het overzicht;
- er bestaat nog maar één instellingeninterface.
