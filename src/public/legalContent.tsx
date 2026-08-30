import type { ReactNode } from "react";
import {
  LEGAL_EFFECTIVE_DATE,
  LEGAL_VERSION,
  legalIdentity,
  subprocessorPlaceholders,
} from "../config/legal";

export interface LegalSection {
  title: string;
  body: ReactNode;
}

const List = ({ children }: { children: ReactNode }) => <ul>{children}</ul>;
const Item = ({ children }: { children: ReactNode }) => <li>{children}</li>;

const identity = <><strong>{legalIdentity.legalName}</strong>, handelend onder de naam {legalIdentity.tradeName}, {legalIdentity.legalForm}, gevestigd te {legalIdentity.registeredAddress}, ondernemingsnummer {legalIdentity.enterpriseNumber}, btw-nummer {legalIdentity.vatNumber}, {legalIdentity.rpr}.</>;

export const legalTitles: Record<string, string> = {
  privacy: "Privacyverklaring",
  cookies: "Cookie- en technologieverklaring",
  terms: "Algemene SaaS-voorwaarden",
  dpa: "Verwerkersovereenkomst",
  subprocessors: "Subverwerkers",
};

export const legalIntro: Record<string, string> = {
  privacy: "Hoe PWAYMENT persoonsgegevens verwerkt als verantwoordelijke en als verwerker voor winkels.",
  cookies: "Welke browsertechnologie, lokale opslag en publieksmeting PWAYMENT gebruikt en hoe u uw keuzes beheert.",
  terms: "De contractuele afspraken voor professioneel gebruik van het PWAYMENT-platform.",
  dpa: "De afspraken van artikel 28 AVG wanneer PWAYMENT persoonsgegevens namens een winkel verwerkt.",
  subprocessors: "De leveranciers die PWAYMENT kunnen ondersteunen bij hosting, verwerking en beveiligde dienstverlening.",
};

const privacy: LegalSection[] = [
  { title: "1. Wie is verantwoordelijk?", body: <p>{identity} Voor websitebezoeken, accounts, contractbeheer, support en eigen beveiliging is PWAYMENT verwerkingsverantwoordelijke. Voor klant-, personeels-, verkoop- en servicegegevens die een winkel in het platform verwerkt, is de winkel doorgaans verwerkingsverantwoordelijke en treedt PWAYMENT op als verwerker.</p> },
  { title: "2. Welke gegevens verwerken we?", body: <><p>Afhankelijk van uw gebruik verwerken we account- en contactgegevens, bedrijfsgegevens, winkelconfiguratie, supportcommunicatie, beveiligings- en auditgegevens, abonnementinformatie en beperkte websitegebeurtenissen. In opdracht van winkels kan het platform ook gegevens verwerken van klanten, medewerkers, leveranciers en servicecontacten.</p><p>Betaalkaartgegevens horen rechtstreeks door de geactiveerde betaalprovider te worden verwerkt. PWAYMENT bewaart alleen de noodzakelijke betalingsreferentie en status wanneer de koppeling dat ondersteunt.</p></> },
  { title: "3. Doeleinden en rechtsgronden", body: <List><Item>Contractuitvoering: account, winkelomgeving, support, beveiligde synchronisatie en abonnementsbeheer.</Item><Item>Wettelijke verplichting: boekhouding, facturatie, fraudebestrijding en beantwoording van bevoegde autoriteiten.</Item><Item>Gerechtvaardigd belang: platformbeveiliging, beperkte foutdiagnose, misbruikpreventie en verbetering van de betrouwbaarheid, na belangenafweging.</Item><Item>Toestemming: niet-noodzakelijke marketing of technologieën wanneer die later worden geactiveerd. Toestemming kan steeds worden ingetrokken.</Item></List> },
  { title: "4. Ontvangers en doorgiften", body: <p>Alleen bevoegde medewerkers en contractueel gebonden leveranciers krijgen toegang voor hun taak. De actuele categorieën en nog te bevestigen leveranciers staan op de pagina <a href="/legal/subprocessors">Subverwerkers</a>. Doorgifte buiten de EER gebeurt alleen met een geldig mechanisme, zoals een adequaatheidsbesluit of EU-modelcontractbepalingen, en passende aanvullende maatregelen.</p> },
  { title: "5. Bewaartermijnen", body: <List><Item>Account- en contractgegevens: tijdens de overeenkomst en daarna zolang nodig voor wettelijke vorderingen en administratie.</Item><Item>Financiële documenten en controleerbare transactiedata: in beginsel tien jaar vanaf het relevante wettelijke startmoment, tenzij een langere legal hold geldt.</Item><Item>Contact- en demoaanvragen: maximaal 24 maanden na het laatste inhoudelijke contact, tenzij een overeenkomst ontstaat of eerdere verwijdering wordt gevraagd.</Item><Item>Beveiligingslogs: standaard maximaal 12 maanden, tenzij een incidentonderzoek langere bewaring vereist.</Item><Item>Marketingevents zonder accountidentificatie: maximaal 13 maanden.</Item></List> },
  { title: "6. Uw rechten", body: <p>U kunt inzage, correctie, wissing, beperking, overdraagbaarheid of bezwaar vragen voor zover de AVG dat toestaat. Stuur uw verzoek naar <a href={`mailto:${legalIdentity.privacyEmail}`}>{legalIdentity.privacyEmail}</a>. We kunnen uw identiteit proportioneel verifiëren. Voor winkelklant- of personeelsdata neemt u eerst contact op met de betrokken winkel; PWAYMENT ondersteunt die winkel bij de afhandeling. U kunt ook klacht indienen bij de Belgische Gegevensbeschermingsautoriteit via <a href="https://www.gegevensbeschermingsautoriteit.be" rel="noreferrer">gegevensbeschermingsautoriteit.be</a>.</p> },
  { title: "7. Beveiliging en incidenten", body: <p>PWAYMENT gebruikt tenantisolatie, rollen en rechten, versleutelde verbindingen, gecontroleerde serverfuncties, auditregistratie en beperkte supporttoegang. Geen systeem is risicoloos. Bevestigde inbreuken worden onderzocht en, waar vereist, gemeld aan betrokken verantwoordelijken, toezichthouders en betrokkenen.</p> },
  { title: "8. Pace en geautomatiseerde verwerking", body: <p>Pace kan operationele context samenvatten en veilige vervolgstappen voorstellen. Het platform is niet bedoeld om uitsluitend geautomatiseerde beslissingen met rechtsgevolg over personen te nemen. Financiële, personeels- en definitieve acties blijven onder controle van een bevoegde gebruiker. Generatieve verwerking wordt alleen gebruikt wanneer de functie is geactiveerd en de relevante leverancier contractueel is ingericht.</p> },
  { title: "9. Contact", body: <p>Privacyvragen: <a href={`mailto:${legalIdentity.privacyEmail}`}>{legalIdentity.privacyEmail}</a>. Algemene juridische vragen: <a href={`mailto:${legalIdentity.email}`}>{legalIdentity.email}</a>.</p> },
];

const cookies: LegalSection[] = [
  { title: "1. Huidige keuze: geen advertentietracking", body: <p>De publieke PWAYMENT-website plaatst volgens de huidige applicatieconfiguratie geen advertentiecookies, sociale pixels of persoonsgebonden analyticscookies. Daarom tonen we geen misleidende alles-accepterenbanner. Zodra niet-noodzakelijke technologie wordt toegevoegd, wordt die standaard geblokkeerd tot geldige toestemming is gegeven.</p> },
  { title: "2. Noodzakelijke browseropslag", body: <List><Item>Sessie- en beveiligingsopslag voor aanmelding en herstel van de actieve dienst.</Item><Item>Lokale applicatieopslag en IndexedDB voor de uitdrukkelijk gevraagde offline kassafunctionaliteit.</Item><Item>Service-worker- en cachegegevens om de geïnstalleerde applicatie betrouwbaar en actueel te houden.</Item><Item>Tijdelijke taal-, interface- of herstelvoorkeuren wanneer u die functie gebruikt.</Item></List> },
  { title: "3. Publieke meting", body: <p>De website kan beperkte first-party gebeurtenissen registreren, zoals een klik op een demo- of prijsknop. De applicatie stuurt daarbij eventnaam, bronpad en doel door, zonder een marketingcookie of browser-ID te plaatsen. Hostingproviders kunnen daarnaast technische logs verwerken voor beveiliging en aflevering. Deze verwerking en bewaartermijnen staan in de privacyverklaring.</p> },
  { title: "4. Uw controle", body: <p>U kunt websiteopslag verwijderen via uw browser. Verwijder applicatieopslag van de kassa alleen na gecontroleerde synchronisatie; anders kunnen nog niet gesynchroniseerde offline gegevens verloren gaan. Wanneer optionele cookies worden ingevoerd, verschijnt hier ook een permanente knop om toestemming even eenvoudig in te trekken als te geven.</p> },
  { title: "5. Wijzigingen", body: <p>Nieuwe analytics, embeds of advertentietechnologie mogen pas worden geactiveerd nadat deze inventaris, de subverwerkerslijst en — indien vereist — het toestemmingsmechanisme zijn bijgewerkt.</p> },
];

const terms: LegalSection[] = [
  { title: "1. Toepassing en professionele doelgroep", body: <p>Deze voorwaarden gelden voor offertes, proefaccounts, abonnementen en professioneel gebruik van PWAYMENT. PWAYMENT wordt uitsluitend aangeboden aan ondernemingen en natuurlijke personen die handelen voor hun handels-, bedrijfs-, ambachts- of beroepsactiviteit. Wie registreert, bevestigt bevoegd te zijn om de opgegeven onderneming te verbinden.</p> },
  { title: "2. Dienst en activering", body: <p>PWAYMENT levert een modulair retailplatform voor onder meer verkoop, voorraad, klanten, rapportage en optionele integraties. Alleen functies die in het account als actief zijn aangeduid en end-to-end zijn ingericht, behoren tot de operationele dienst. Pilot-, validatie- en providerafhankelijke functies zijn geen gegarandeerde live koppeling.</p> },
  { title: "3. Verplichtingen van de klant", body: <List><Item>Correcte bedrijfs-, btw-, product-, prijs-, belasting- en gebruikersgegevens invoeren en controleren.</Item><Item>Accounts, apparaten en pincodes beveiligen en rollen correct toekennen.</Item><Item>Dagafsluitingen, exports, providerafrekeningen en boekhouding tijdig controleren.</Item><Item>PWAYMENT niet gebruiken in een sector met bijzondere fiscalisatie-eisen zonder schriftelijke bevestiging van geschiktheid.</Item><Item>Wettelijke informatie aan eigen klanten en medewerkers verstrekken.</Item></List> },
  { title: "4. Prijzen, proefperiode en betaling", body: <p>Prijzen zijn exclusief btw tenzij uitdrukkelijk anders vermeld. De bestelpagina of offerte bepaalt plan, facturatiecyclus en inbegrepen gebruik. Een proefperiode wordt niet betalend zonder een geldige bestel- en betalingshandeling. Bij niet-betaling kan toegang proportioneel worden beperkt na kennisgeving, zonder wettelijk te bewaren data te vernietigen.</p> },
  { title: "5. Beschikbaarheid, onderhoud en support", body: <p>PWAYMENT onderhoudt de dienst professioneel en communiceert materiële geplande onderbrekingen waar redelijk mogelijk. Offline functionaliteit, externe providers en internetverbindingen hebben eigen grenzen. Alleen een afzonderlijk ondertekende SLA bevat gegarandeerde responstijden, beschikbaarheidspercentages of service credits.</p> },
  { title: "6. Updates en wijzigingen", body: <p>Beveiligings-, wettelijke en betrouwbaarheidsupdates mogen worden uitgevoerd wanneer nodig. Materiële nadelige wijzigingen aan betaalde kernfunctionaliteit worden vooraf gemeld wanneer redelijk mogelijk. De klant krijgt bij een wezenlijke contractwijziging het wettelijk of contractueel toepasselijke opzeggingsrecht.</p> },
  { title: "7. Intellectuele eigendom", body: <p>PWAYMENT en zijn licentiegevers behouden alle rechten op software, documentatie en merken. De klant krijgt voor de contractduur een beperkte, niet-exclusieve en niet-overdraagbare gebruikslicentie voor de eigen onderneming. De klant behoudt zijn rechten op ingevoerde bedrijfsdata en verleent alleen de rechten die nodig zijn om de dienst te leveren.</p> },
  { title: "8. Data, export en einde overeenkomst", body: <p>Na beëindiging wordt operationele toegang gedeactiveerd. De klant kan gedurende de overeengekomen exitperiode een gangbare export aanvragen. Persoonsgegevens worden daarna verwijderd of geanonimiseerd, behalve data die PWAYMENT of de klant wettelijk moet bewaren. Financiële bewijsdata wordt niet automatisch vernietigd door accountbeëindiging.</p> },
  { title: "9. Aansprakelijkheid", body: <p>Elke partij is aansprakelijk volgens het toepasselijke recht voor haar contractuele tekortkomingen. Voor zover wettelijk toegestaan, is PWAYMENT niet aansprakelijk voor indirecte schade, gevolgschade of verlies dat voortvloeit uit foutieve klantconfiguratie of een niet-geactiveerde externe provider. Een eventuele contractuele aansprakelijkheidslimiet wordt in de offerte of hoofdovereenkomst vastgelegd. Geen bepaling sluit aansprakelijkheid uit die wettelijk niet kan worden uitgesloten, waaronder bedrog, opzettelijke fout of andere dwingendrechtelijke gevallen.</p> },
  { title: "10. Overmacht en derden", body: <p>Geen partij is aansprakelijk voor een tekortkoming door een gebeurtenis buiten haar redelijke controle, mits zij redelijke continuïteits- en herstelmaatregelen neemt. Externe betaal-, hosting-, Peppol-, hardware- en AI-leveranciers blijven onderworpen aan hun technische beschikbaarheid en toepasselijke voorwaarden.</p> },
  { title: "11. E-facturatie en boekhouding", body: <p>Een PDF- of factuurpreview is niet automatisch een gestructureerde elektronische factuur. PWAYMENT ondersteunt Belgische B2B-e-facturatie pas wanneer een Peppol/EN 16931-koppeling voor de betrokken winkel expliciet als actief is bevestigd. Tot dan moet de klant een geschikte boekhoud- of Peppoloplossing gebruiken. PWAYMENT vervangt geen accountant of fiscaal adviseur.</p> },
  { title: "12. Recht en geschillen", body: <p>Belgisch recht is van toepassing. Partijen proberen eerst gedurende dertig dagen een oplossing te bereiken. Daarna zijn, behoudens dwingend recht of een andersluidende ondertekende overeenkomst, de rechtbanken van {legalIdentity.rpr} bevoegd.</p> },
];

const dpa: LegalSection[] = [
  { title: "1. Rollen en voorwerp", body: <p>Deze verwerkersovereenkomst maakt deel uit van de PWAYMENT-overeenkomst. De klant is verantwoordelijke voor persoonsgegevens die hij in de dienst verwerkt; PWAYMENT is verwerker. Het voorwerp is het hosten, beveiligen, synchroniseren, ondersteunen en op gedocumenteerde instructie verwerken van retail-, klant-, personeels-, service- en accountgegevens gedurende de overeenkomst en de gecontroleerde exitperiode.</p> },
  { title: "2. Instructies", body: <p>PWAYMENT verwerkt persoonsgegevens alleen op gedocumenteerde instructie van de klant, waaronder de overeenkomst, geconfigureerde functies en bevoegde supportverzoeken, tenzij Unierecht of Belgisch recht anders verplicht. PWAYMENT meldt een vermoedelijk onrechtmatige instructie zonder die zelfstandig uit te breiden.</p> },
  { title: "3. Vertrouwelijkheid en beveiliging", body: <p>Personen met toegang zijn tot vertrouwelijkheid gebonden. Maatregelen omvatten tenantisolatie, least-privilege rollen, versleuteling tijdens transport, gecontroleerde mutatiefuncties, logging, herstelprocedures, afhankelijkhedenbeheer en periodieke technische verificatie. Concrete maatregelen worden aangepast aan risico en stand van de techniek.</p> },
  { title: "4. Subverwerkers", body: <p>De klant geeft algemene toestemming voor de gepubliceerde subverwerkers. PWAYMENT kondigt een materiële nieuwe subverwerker vooraf aan via het account of het bekende contractadres en biedt een redelijke, gemotiveerde bezwaarmogelijkheid. PWAYMENT legt gelijkwaardige gegevensbeschermingsverplichtingen op en blijft verantwoordelijk zoals artikel 28 AVG bepaalt.</p> },
  { title: "5. Rechten en verzoeken", body: <p>PWAYMENT ondersteunt de klant, rekening houdend met de aard van de verwerking, bij verzoeken van betrokkenen. PWAYMENT antwoordt niet zelfstandig namens de klant, behalve wanneer wettelijk vereist. Kennelijk buitensporige of maatwerkverzoeken kunnen tegen vooraf meegedeelde redelijke kosten worden uitgevoerd.</p> },
  { title: "6. Inbreuken", body: <p>PWAYMENT meldt een bevestigde inbreuk in verband met klantdata zonder onredelijke vertraging via het aangewezen contactpunt en verstrekt beschikbare informatie over aard, categorieën, waarschijnlijke gevolgen en maatregelen. De klant blijft verantwoordelijk voor zijn wettelijke melding, tenzij schriftelijk anders overeengekomen.</p> },
  { title: "7. DPIA, overleg en audits", body: <p>PWAYMENT verstrekt redelijk beschikbare informatie voor DPIA’s en voorafgaand overleg. Compliance-informatie en onafhankelijke rapporten worden eerst gebruikt. Een aanvullende audit gebeurt maximaal eenmaal per jaar, tijdens kantooruren, met redelijke aankondiging, vertrouwelijkheid en zonder de beveiliging of andere klanten te schaden, behalve na een materieel incident of op bevel van een toezichthouder.</p> },
  { title: "8. Teruggave, verwijdering en wettelijke bewaring", body: <p>Bij einde dienstverlening geeft PWAYMENT op verzoek een beschikbare export terug en verwijdert of anonimiseert daarna persoonsgegevens volgens het retentiebeleid. Gegevens die wettelijk bewaard moeten blijven worden geïsoleerd, beperkt toegankelijk gehouden en uitsluitend voor dat wettelijke doel gebruikt tot verwijdering is toegestaan.</p> },
  { title: "9. Internationale doorgifte", body: <p>Doorgifte buiten de EER vindt alleen plaats met een geldig mechanisme en, waar nodig, een doorgifteeffectbeoordeling en aanvullende maatregelen. De subverwerkerslijst vermeldt de relevante locatie en waarborg zodra deze contractueel is bevestigd.</p> },
  { title: "10. Contact en rangorde", body: <p>Privacycontact: <a href={`mailto:${legalIdentity.privacyEmail}`}>{legalIdentity.privacyEmail}</a>. Bij conflict heeft deze verwerkersovereenkomst voor gegevensbeschermingsonderwerpen voorrang op de algemene voorwaarden; een specifiek ondertekend contract heeft voorrang wanneer het minstens dezelfde AVG-bescherming biedt.</p> },
];

const subprocessors: LegalSection[] = [
  { title: "Voorafgaande waarschuwing", body: <p>Onderstaande lijst bevat de leverancierscategorieën die in de huidige code of deploymentarchitectuur voorkomen. Items tussen rechte haken moeten vóór publieke contractering worden bevestigd aan de hand van de werkelijk gebruikte productieaccounts, regio’s en verwerkersovereenkomsten.</p> },
  ...subprocessorPlaceholders.map((entry, index) => ({
    title: `${index + 1}. ${entry.name}`,
    body: <><p><strong>Doel:</strong> {entry.purpose}</p><p><strong>Verwerkingslocatie:</strong> {entry.location}</p><p><strong>Waarborgen:</strong> {entry.safeguards}</p></>,
  })),
  { title: "Wijzigingsprocedure", body: <p>Materiële wijzigingen worden vooraf gepubliceerd en aan actieve klanten meegedeeld via het contractadres of de applicatie. Gemotiveerde bezwaren kunnen binnen dertig dagen worden gericht aan <a href={`mailto:${legalIdentity.privacyEmail}`}>{legalIdentity.privacyEmail}</a>.</p> },
];

export const legalSections: Record<string, LegalSection[]> = {
  privacy,
  cookies,
  terms,
  dpa,
  subprocessors,
};

export const legalMeta = {
  version: LEGAL_VERSION,
  effectiveDate: LEGAL_EFFECTIVE_DATE,
  governingLanguage: "De Nederlandstalige versie is de juridisch leidende tekst zolang geen ondertekende overeenkomst anders bepaalt.",
};
