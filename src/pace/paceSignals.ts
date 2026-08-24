import type { MainView } from "../store/useStore";
import type { PacePreferences, PaceTone } from "./usePace";
import type { CustomerInsight } from "./customerInsights";
import { answerFromPaceKnowledge } from "./paceKnowledge";

export type PaceSignalTone = "flow" | "attention" | "success";
export type PaceProfileTab = "billing" | "modules" | "catalog-products" | "catalog-categories" | "labels" | "webshop-general" | "integrations";
export type PaceAction =
  | { kind: "navigate"; view: MainView }
  | { kind: "setup" }
  | { kind: "profile"; tab: PaceProfileTab }
  | { kind: "catalog"; productIds: string[]; filterLabel: string }
  | { kind: "none" };

export interface PaceSignal {
  id: string;
  source: "Werkruimte" | "Winkelconfiguratie" | "Lokale status" | "Rol & rechten" | "Klantcontext";
  title: string;
  compact: string;
  detail: string;
  actionLabel?: string;
  action: PaceAction;
  tone: PaceSignalTone;
  priority: number;
  customerInsightId?: string;
  evidenceLabel?: string;
}

export interface PaceContext {
  storeId?: string | null;
  view: MainView;
  role: "owner" | "manager" | "cashier" | null;
  productCount: number;
  cartCount: number;
  firstRunCompleted: boolean;
  online: boolean;
  pendingSync: number;
  retryingSync: number;
  failedSync: number;
  syncIssueSummary?: string;
  syncIssueResolution?: string;
  cartSummary?: {
    items: Array<{ name: string; quantity: number; unitPriceCents: number; sku?: string; variant?: string }>;
    customerLinked: boolean;
    customerName?: string;
    discountCents?: number;
    documentType: "receipt" | "invoice-b2c" | "invoice-b2b";
  };
  customerInsights?: CustomerInsight[];
}

export interface PaceQueryAnswer {
  intentId: string;
  title: string;
  answer: string;
  action: PaceAction;
  actionLabel?: string;
  steps?: string[];
  limitation?: string;
  followUps?: string[];
  confidence: number;
  matched: boolean;
}

const viewSignals: Record<MainView, Omit<PaceSignal, "id" | "priority">> = {
  pos: {
    source: "Werkruimte",
    title: "Kassa in focus",
    compact: "Scan, zoek of kies een product. Pace blijft stil tijdens afrekenen.",
    detail: "Gebruik de zoekbalk voor naam, SKU of barcode. Tijdens betaal- en PIN-stappen onderbreekt Pace de flow nooit.",
    action: { kind: "none" },
    tone: "flow",
  },
  "z-report": {
    source: "Werkruimte",
    title: "Dagafsluiting onder controle",
    compact: "Controleer kasverschil en betaalmix vóór je definitief afsluit.",
    detail: "De dagafsluiting bundelt omzet, betaalmiddelen, btw en kasreconciliatie. Definitieve stappen blijven altijd bij jou.",
    action: { kind: "none" },
    tone: "flow",
  },
  "audit-log": {
    source: "Werkruimte",
    title: "Historiek met bewijs",
    compact: "Zoek op ticket of transactie om de volledige gebeurtenisketen te zien.",
    detail: "Gebruik Historiek voor verkopen, retouren en het controleerbare auditspoor. Pace verandert hier nooit records.",
    action: { kind: "none" },
    tone: "flow",
  },
  customers: {
    source: "Werkruimte",
    title: "Klantcontext, geen ruis",
    compact: "Segmenteer op gedrag en datakwaliteit om gericht verder te werken.",
    detail: "Pace respecteert rolrechten en toont nooit klantgegevens buiten de actieve, toegestane werkruimte.",
    action: { kind: "none" },
    tone: "flow",
  },
  insights: {
    source: "Werkruimte",
    title: "Van signaal naar beslissing",
    compact: "Begin bij één afwijking en open daarna de onderliggende producten of periode.",
    detail: "Inzichten worden nuttig wanneer een patroon naar een controleerbare actie leidt. Pace presenteert daarom één volgende stap tegelijk.",
    action: { kind: "none" },
    tone: "flow",
  },
  service: {
    source: "Werkruimte",
    title: "Herstellingen in beweging",
    compact: "Focus op dossiers die wachten op diagnose, klant of leverancier.",
    detail: "Status, toestelgegevens en interne notities blijven gescheiden van de publieke opvolgpagina voor de klant.",
    action: { kind: "none" },
    tone: "flow",
  },
  workforce: {
    source: "Rol & rechten",
    title: "Planning binnen bevoegdheid",
    compact: "Roosters en verlof volgen de rol- en PIN-controles van PWAYMENT.",
    detail: "Pace kan naar de juiste workflow leiden, maar omzeilt nooit eigenaarstoegang of persoonlijke goedkeurings-PINs.",
    action: { kind: "none" },
    tone: "flow",
  },
  "integration-hub": {
    source: "Werkruimte",
    title: "Koppelingen met zichtbare status",
    compact: "Controleer eerst de laatste run en deliverytimeline vóór je opnieuw synchroniseert.",
    detail: "Pace maakt onderscheid tussen configuratie, verbinding en levering zodat een herhaalactie geen blind experiment wordt.",
    action: { kind: "none" },
    tone: "flow",
  },
  profile: {
    source: "Winkelconfiguratie",
    title: "Instellingen met impact",
    compact: "Wijzig bewust: Pace toont waar een instelling doorwerkt.",
    detail: "Plan, modules, catalogus en webshop beïnvloeden verschillende werkruimtes. Gevoelige wijzigingen vragen altijd expliciete bevestiging.",
    action: { kind: "none" },
    tone: "flow",
  },
  admin: {
    source: "Rol & rechten",
    title: "Beheer met auditspoor",
    compact: "Platformacties blijven gescheiden van de dagelijkse winkelomgeving.",
    detail: "Pace respecteert tenantgrenzen, bevoegdheden en gelogde supporttoegang. Hij kan context uitleggen, niet grenzen overslaan.",
    action: { kind: "none" },
    tone: "flow",
  },
};
export const buildPaceSignals = (
  context: PaceContext,
  preferences: PacePreferences,
): PaceSignal[] => {
  const signals: PaceSignal[] = [];

  if (preferences.customerGuidance) {
    for (const insight of context.customerInsights ?? []) {
      signals.push({
        id: `customer:${insight.id}`,
        source: "Klantcontext",
        title: insight.title,
        compact: insight.compact,
        detail: insight.detail,
        actionLabel: insight.action?.label,
        action: insight.action
          ? { kind: "catalog", productIds: insight.action.productIds, filterLabel: insight.action.filterLabel }
          : { kind: "none" },
        tone: insight.tone,
        priority: insight.priority,
        customerInsightId: insight.id,
        evidenceLabel: insight.evidenceSummary ?? (insight.kind === "automatic-recommendation"
          ? (() => {
            const count = new Set(insight.evidence.map((entry) => entry.transactionId).filter(Boolean)).size;
            return `${count} relevante ${count === 1 ? "verkoop" : "verkopen"} · automatisch geleerd`;
          })()
          : `${new Set(insight.evidence.map((entry) => entry.transactionId).filter(Boolean)).size} controleerbare ${insight.evidence.length === 1 ? "bron" : "bronnen"}`),
      });
    }
  }

  if (preferences.operationalSignals && !context.online) {
    signals.push({
      id: "offline",
      source: "Lokale status",
      title: "Offline, maar operationeel",
      compact: "Je kunt veilig verder werken. Nieuwe mutaties wachten lokaal op verbinding.",
      detail: "PWAYMENT bewaart ondersteunde handelingen lokaal en levert ze via de duurzame wachtrij af zodra de verbinding terug is.",
      action: { kind: "none" },
      tone: "attention",
      priority: 100,
    });
  } else if (preferences.operationalSignals && context.failedSync > 0) {
    signals.push({
      id: "failed-sync",
      source: "Lokale status",
      title: `${context.failedSync} ${context.failedSync === 1 ? "synchronisatie vraagt" : "synchronisaties vragen"} herstel`,
      compact: context.syncIssueSummary ?? "Dit toestel is online, maar deze levering is afgewezen.",
      detail: context.syncIssueResolution ?? "Open de herstelwachtrij, corrigeer eerst de getoonde oorzaak en plan daarna alleen de juiste rij opnieuw in.",
      actionLabel: context.role === "owner" || context.role === "manager" ? "Open herstelwachtrij" : undefined,
      action: context.role === "owner" || context.role === "manager"
        ? { kind: "profile", tab: "integrations" }
        : { kind: "none" },
      tone: "attention",
      priority: 95,
    });
  } else if (preferences.operationalSignals && context.retryingSync > 0) {
    signals.push({
      id: "retrying-sync",
      source: "Lokale status",
      title: `${context.retryingSync} ${context.retryingSync === 1 ? "wijziging wordt" : "wijzigingen worden"} opnieuw geprobeerd`,
      compact: context.syncIssueSummary ?? "De verbinding is actief. De afleverpoging mislukte en wordt automatisch hervat.",
      detail: context.syncIssueResolution ?? "PWAYMENT gebruikt een korte oplopende wachttijd tussen pogingen. Voer de handeling niet opnieuw uit; de lokale kopie blijft veilig bewaard.",
      action: { kind: "none" },
      tone: "attention",
      priority: 85,
    });
  } else if (preferences.operationalSignals && context.pendingSync > 0) {
    signals.push({
      id: "pending-sync",
      source: "Lokale status",
      title: `${context.pendingSync} ${context.pendingSync === 1 ? "wijziging wordt" : "wijzigingen worden"} afgeleverd`,
      compact: "Je bent online. De serverbevestiging is onderweg; je hoeft niets opnieuw uit te voeren.",
      detail: "Pace toont een normale online aflevering als voortgang. Zodra de server bevestigt, verdwijnt deze status direct.",
      action: { kind: "none" },
      tone: "flow",
      priority: 60,
    });
  }

  if (
    preferences.setupGuidance &&
    (context.role === "owner" || context.role === "manager") &&
    context.productCount === 0
  ) {
    signals.push({
      id: "empty-catalog",
      source: "Winkelconfiguratie",
      title: "Je catalogus wacht op zijn eerste product",
      compact: "Start begeleid, voeg handmatig toe of importeer je bestaande lijst.",
      detail: "Pace opent de bestaande configuratiegids. Er worden geen voorbeeldproducten of instellingen zonder jouw keuze aangemaakt.",
      actionLabel: "Start begeleid",
      action: { kind: "setup" },
      tone: "attention",
      priority: 80,
    });
  } else if (
    preferences.setupGuidance &&
    (context.role === "owner" || context.role === "manager") &&
    !context.firstRunCompleted
  ) {
    signals.push({
      id: "finish-setup",
      source: "Winkelconfiguratie",
      title: "Maak je winkel verkoopklaar",
      compact: "Loop de resterende configuratie gecontroleerd door.",
      detail: "De gids controleert catalogus, labels en relevante modules zonder je dagelijkse kassawerk over te nemen.",
      actionLabel: "Ga verder",
      action: { kind: "setup" },
      tone: "flow",
      priority: 70,
    });
  }

  if (context.view === "pos" && context.cartCount > 0) {
    signals.push({
      id: "active-cart",
      source: "Werkruimte",
      title: "Verkoop in opbouw",
      compact: `${context.cartCount} ${context.cartCount === 1 ? "artikel" : "artikelen"} in de winkelwagen. Pace onderbreekt de betaalflow niet.`,
      detail: "Controleer aantallen, klant, korting en documentkeuze vóór betaling. Financiële acties blijven volledig onder jouw controle.",
      action: { kind: "none" },
      tone: "success",
      priority: 65,
    });
  }

  const base = viewSignals[context.view];
  signals.push({ ...base, id: `view-${context.view}`, priority: 10 });
  return signals.sort((a, b) => b.priority - a.priority);
};

export const signalCopy = (signal: PaceSignal, tone: PaceTone) =>
  tone === "explanatory" ? signal.detail : signal.compact;

export const answerPaceQuery = (
  query: string,
  context: PaceContext,
): PaceQueryAnswer => answerFromPaceKnowledge(query, context);
