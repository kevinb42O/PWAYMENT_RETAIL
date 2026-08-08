# PWAyment

Offline-first Point-of-Sale (PWA) voor Belgische skateshops en retail: kassaverkoop,
productbeheer met aankoopprijs en verkoopprijs, voorraad, Belgische BTW, X- en
Z-rapport met hash-keten, audit log, klantenkaart / loyalty plug-in en multi-rol
authenticatie.

## Stack

- Vite 6 + React 19 + TypeScript
- Tailwind v4
- Zustand (state, met persist)
- Dexie (IndexedDB)
- Zod (runtime validatie)
- vite-plugin-pwa (service worker, offline shell)
- Vitest (unit tests)

## Aan de slag

```bash
npm install
npm run dev          # http://localhost:3000
npm run test         # unit tests
npm run lint         # tsc --noEmit
npm run build        # productie-bundle in dist/
npm run preview      # preview van de build
```

### Feature flags

- `VITE_SEED_RETAIL_CATALOG=true` (default): seed een professionele skateshop-catalogus op een lege database.
- `VITE_SEED_DEMO_PRODUCTS=false` (default): compatibele legacy demo-seed flag.
- `VITE_AUTO_RESET_LEGACY_CATALOG=true` (default): vervang de oude demo-catalogus automatisch door retaildata.

Voorbeeld in `.env`:

```bash
VITE_SEED_RETAIL_CATALOG=true
VITE_AUTO_RESET_LEGACY_CATALOG=true
```

## Productbeheer

Producten ondersteunen de velden die een retail-eigenaar nodig heeft:

- naam, categorie, merk, leverancier en variant / maat
- SKU en barcode
- aankoopprijs excl. BTW
- verkoopprijs incl. BTW
- automatisch Belgisch BTW-tarief per categorie
- voorraad, minimumvoorraad en archiveren zonder historie te breken
- CSV import/export voor catalogusbeheer

De standaardcategorieen zijn gericht op een skateshop: decks, complete skateboards,
trucks, wielen, lagers, hardware & grip, schoenen, kleding, protectie, tassen &
accessoires, tools & onderhoud en services.

## BTW

Voor reguliere skateshop-retail in Belgie gebruikt het systeem standaard 21% BTW.
De categorieconfiguratie bewaart het tarief centraal, zodat wijzigingen later niet
in losse producten of kassaschermen aangepast moeten worden. Kortingen worden
proportioneel verdeeld over de BTW-buckets en alle bedragen worden in integer cents
berekend.

## Rapportage

Dagafsluiting genereert een onveranderlijk `DailyReport` met een SHA-256 hash over
`{reportNumber, timestamp, totals, transactionIds, prevHash}`. Rapporten tonen ook
inkoopwaarde verkochte goederen en brutowinst retail op basis van de productkost op
het moment van verkoop.

Voor volledige wettelijke fiscale hardware-integratie moet een gecertificeerde
fiscale module of backend-koppeling worden toegevoegd wanneer de gekozen Belgische
implementatie dat vereist.

## Loyalty

De klantenkaart zit achter een `LoyaltyProvider` interface (`src/loyalty/provider.ts`).
De huidige in-memory adapter kan vervangen worden door een bestaande loyalty-backend
zonder dat de POS-code wijzigt.

## Auth

Client-side scaffold met rollen (`owner` / `manager` / `cashier`) en 6-cijferige
PIN-login. Elke transactie en elk auditlog-record bevat de `userId`. Volledige
server-side authenticatie volgt zodra de backend live is.

Standaard PIN-codes voor lokale ontwikkeling, wijzigen voor productie:

| Rol | PIN |
| --- | --- |
| Eigenaar | 123456 |
| Manager | 234567 |
| Kassa 1 | 111111 |
| Kassa 2 | 222222 |
