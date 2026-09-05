# PWAYMENT compliance-readiness

**Statuscontrole:** 31 augustus 2026 — **niet vrijgegeven voor commerciële
productie**. Dit document is een implementatiechecklist en geen formeel
juridisch advies. Zie ook [`PROJECT-CONTEXT.md`](PROJECT-CONTEXT.md).

Tijdens de audit waren de verplichte juridische waarden niet aanwezig in de
gecontroleerde Vercel-productieconfiguratie en toonde de live site nog
placeholders. `npm run check:compliance` faalt in die toestand terecht. De
huidige GitHub quality-workflow roept deze controle nog niet aan; onderstaande
releasegate is dus een vereiste doeltoestand en nog niet volledig afgedwongen.

## Voor productie nog door de eigenaar in te vullen

Vul de volgende productievariabelen in met gegevens die exact overeenkomen met KBO en btw-registratie:

- `VITE_LEGAL_NAME`
- `VITE_LEGAL_TRADE_NAME`
- `VITE_LEGAL_FORM`
- `VITE_LEGAL_ADDRESS`
- `VITE_LEGAL_ENTERPRISE_NUMBER`
- `VITE_LEGAL_VAT_NUMBER`
- `VITE_LEGAL_RPR`
- `VITE_LEGAL_EMAIL`
- `VITE_PRIVACY_EMAIL`
- `VITE_SUPPORT_EMAIL`
- `VITE_LEGAL_PHONE`

Controleer dit met `npm run check:compliance`. De publieke site toont bewust een waarschuwing zolang verplichte waarden ontbreken.

## Nog contractueel te bevestigen

1. Laat de teksten onder `/legal/*` nakijken door een Belgische jurist met ervaring in SaaS, AVG en B2B-contracten.
2. Bevestig per productieprovider de contracterende entiteit, verwerkingsregio, DPA, bewaartermijn en doorgiftemechanisme. Werk daarna `src/config/legal.ts` bij.
3. Leg de concrete aansprakelijkheidslimiet, verzekering, supporturen, exitperiode en eventuele SLA vast in offerte/hoofdovereenkomst.
4. Richt een periodieke taak in die `private.purge_expired_marketing_data()` uitvoert met een beveiligde serviceverbinding. De functie zelf is niet bereikbaar voor browserrollen.
5. Leg een procedure vast voor verzoeken van betrokkenen, incidentmelding, legal holds, restoretests en jaarlijkse review van subverwerkers.

## Financiële retentie en offboarding

- Een tenant met niet-demo transacties of Z-rapporten kan niet meer rechtstreeks worden verwijderd.
- Offboarding schorst alle winkellidmaatschappen, annuleert het abonnement en bewaart financiële bewijsdata tot minstens de berekende retentiedatum.
- Een lege tenant zonder financiële bewijsdata kan wel fysiek worden verwijderd.
- De uiteindelijke purge na retentie vereist een afzonderlijke, juridisch gecontroleerde workflow met legal-holdcontrole; die is bewust niet automatisch gemaakt.

## Belgische e-facturatie

PWAYMENT maakt momenteel PDF-documenten maar implementeert nog geen bewezen Peppol BIS/EN 16931 verzend- en ontvangstflow. De website en voorwaarden noemen Peppol daarom expliciet **niet live**. Voor Belgische B2B-facturen moet de winkel een geactiveerde externe Peppoloplossing gebruiken tot de volledige PWAYMENT-flow is gebouwd en gecertificeerd door end-to-endtests.

## Bronnen voor juridische review

- [FOD Economie: verplichte identificatiegegevens op bedrijfswebsites](https://economie.fgov.be/nl/themas/online/elektronische-handel/verkoop-internet/bedrijfswebsite-en-accounts-op)
- [FOD Financiën: boekhouding, facturering en bewaring](https://financien.belgium.be/nl/ondernemingen/btw/boekhouding-facturering/boekhouding-facturering)
- [Belgische e-factuur: toepassingsgebied vanaf 1 januari 2026](https://efactuur.belgium.be/nl/article/voor-wie-wordt-e-facturatie-verplicht)
- [Gegevensbeschermingsautoriteit: cookies en trackers](https://www.gegevensbeschermingsautoriteit.be/cookies-en-andere-traceringsmiddelen)
- [AVG, met name artikelen 13 en 28](https://eur-lex.europa.eu/legal-content/NL/TXT/?uri=CELEX:32016R0679)

## Releasegate

Voor commerciële productie moeten minimaal slagen:

```bash
npm run check:compliance
npm run lint
npm run test
npm run build
npm run check:site
npm run check:security
npm run check:supabase-release
```

Voeg `npm run check:compliance` toe aan de GitHub quality-workflow en controleer
dezelfde waarden opnieuw na deploy op de live juridische pagina's. Vul geen
voorbeeldwaarden in om de gate alleen technisch groen te maken.
