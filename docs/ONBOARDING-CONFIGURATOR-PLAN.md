# PWAYMENT onboardingconfigurator

## Doel

Nieuwe winkeleigenaars moeten in ongeveer twee tot drie minuten een bruikbare PWAYMENT-werkruimte krijgen. De configurator vraagt alleen informatie die een concrete standaard, modulekeuze of eerstvolgende actie beïnvloedt. Abonnementsrechten blijven volledig gescheiden van voorkeuren: een module kiezen maakt ze zichtbaar en relevant, maar omzeilt nooit een plan- of featuregate.

## Productprincipes

1. **Kort maar betekenisvol** — vijf duidelijke stappen, vooraf ingevulde defaults en geen administratieve velden die later even goed ingevuld kunnen worden.
2. **Sector als aanbeveling, niet als beperking** — PWAYMENT ondersteunt elke retailsoort. De sector bepaalt alleen slimme beginwaarden.
3. **Adaptief** — herstelvragen verschijnen alleen wanneer Hersteldienst gekozen is; import wordt de aanbevolen start wanneer bestaande productdata aanwezig is.
4. **Herstelbaar** — terug navigeren bewaart antwoorden, fouten staan naast de relevante stap en de configuratie kan later opnieuw geopend worden.
5. **Tenantveilig** — de configuratie wordt op de winkel opgeslagen, is alleen door eigenaar/manager te lezen en alleen door de eigenaar te wijzigen volgens het bestaande winkelbeleid.
6. **Progressieve activatie** — PWAYMENT configureert de navigatie en eerste actie zonder data te publiceren, een webshop live te zetten of betaalde rechten toe te kennen.

## Flow

### Stap 1 — Account

- Voornaam en familienaam
- Winkel- of bedrijfsnaam
- E-mailadres
- Wachtwoord en bevestiging
- Snel-PIN alleen in expliciete lokale/E2E-omgevingen

Validatie: verplichte namen, geldig e-mailadres, minimaal twaalf tekens, overeenkomende wachtwoorden en een PIN van zes cijfers waar die functie actief is.

### Stap 2 — Winkelprofiel

- Sector: telecom & IT, mode, lingerie, fietsen, speelgoed, skate/sport, elektronica, interieur, beauty, voeding, juwelen, boeken/hobby, algemene retail, hersteldienst of andere retail
- Verkoopmodel: fysieke winkel, winkel + online, hoofdzakelijk online of afspraak/servicegericht
- Teamgrootte: alleen, 2–5, 6–15 of 16+

De sector vult een aanbevolen moduleset in. “Andere retail” blijft een eersteklas keuze en krijgt een brede retailbasis.

### Stap 3 — Werkstromen

Kassa, dagafsluiting en historiek vormen de vaste basis. De eigenaar kiest daarnaast:

- Voorraad & Integration Hub
- Klanten
- Hersteldienst
- Webshop
- Inzichten

Iedere keuze bevat een korte operationele omschrijving. De eigenaar kan de sectoraanbeveling met één klik herstellen.

### Stap 4 — Data & prijsvoering

- Huidige productbron: nog geen catalogus, spreadsheet, bestaand kassasysteem, webshopplatform, ERP of leveranciersbestanden
- Importmoment: meteen na aanmelden of later
- Prijsstrategie: één verkoopprijs, klantgroepen, retail + B2B of contractprijzen
- Standaard-btw: gemengd, 21%, 12% of 6%
- Voorkeurscontact voor herstellingen: e-mail, telefoon of beide — alleen zichtbaar wanneer Hersteldienst actief is

### Stap 5 — Controle

- Samenvatting van winkelprofiel en werkstromen
- Duidelijke eerstvolgende actie
- Vermelding dat alle keuzes later aangepast kunnen worden
- Account wordt pas na deze bevestiging aangemaakt

## Afgeleide systeemacties

- Bestaande productdata + import nu → open Integration Hub bij de eerste sessie.
- Hersteldienst als belangrijkste gekozen workflow zonder directe import → open Hersteldienst.
- Anders → open Kassa.
- Modulekeuzes sturen de hoofdnavigatie; verborgen modules blijven later activeerbaar via Winkelconfiguratie.
- De standaard-btw wordt gebruikt als veilige importfallback wanneer een bronbestand geen geldig btw-veld bevat.
- Pricingmodel en servicecontactvoorkeur worden tenantbreed bewaard voor volgende configuratie-uitbreidingen.

## Compatibiliteit en migratie

- Bestaande winkels krijgen brede standaardmodulevoorkeuren en worden niet door een nieuwe wizard geblokkeerd.
- Nieuwe configuratie wordt als versieerbaar JSON-object op de winkel opgeslagen, plus een geïndexeerde sectorcode en voltooiingsdatum.
- De bestaande auth-trigger neemt de configuratie veilig over uit Supabase-signupmetadata en blijft proefabonnementen aanmaken.
- Lokale E2E-registratie gebruikt hetzelfde configuratiecontract zonder Supabase nodig te hebben.

## Kwaliteitscriteria

- Responsive vanaf kleine telefoons tot desktop.
- Semantische labels, zichtbare focus, foutmeldingen met `role=alert`, voortgang met `aria-current` en toetsenbordbediening.
- Geen verlies van invoer bij teruggaan.
- Geen modulekeuze kan abonnementsrechten omzeilen.
- Unit-tests voor normalisatie, sectoraanbevelingen en startactie.
- E2E-test van volledige registratie, modulekeuze en eerste scherm.
- TypeScript, tests, productiebuild en browser-QA moeten slagen voor publicatie.
