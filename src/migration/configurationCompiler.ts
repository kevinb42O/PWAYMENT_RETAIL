import type {
  BusinessDiscoveryReport,
  ConfidenceBand,
  ConfigurationNode,
  MigrationDomain,
  ReadinessCheck,
  RetailConfigurationProposal,
  RetailModule,
} from "./types";

const rank: Record<ConfidenceBand, number> = { low: 1, medium: 2, high: 3 };

const domainConfidence = (
  report: BusinessDiscoveryReport,
  domain: MigrationDomain,
): ConfidenceBand => report.detectedDomains.find((item) => item.domain === domain)?.confidence ?? "low";

const domainEvidence = (report: BusinessDiscoveryReport, domain: MigrationDomain): string[] =>
  report.detectedDomains.find((item) => item.domain === domain)?.evidenceIds ?? [];

const hasDomain = (report: BusinessDiscoveryReport, domain: MigrationDomain) =>
  report.detectedDomains.some((item) => item.domain === domain);

const moduleNode = (
  report: BusinessDiscoveryReport,
  module: RetailModule,
  domain: MigrationDomain,
  label: string,
  enabled: boolean,
): ConfigurationNode => ({
  key: `module.${module}`,
  domain,
  label,
  value: enabled,
  status: enabled ? "proposed" : "not-applicable",
  confidence: enabled ? domainConfidence(report, domain) : "high",
  evidenceIds: domainEvidence(report, domain),
});

export const compileRetailConfiguration = (
  report: BusinessDiscoveryReport,
): RetailConfigurationProposal => {
  const catalog = hasDomain(report, "catalog");
  const customers = hasDomain(report, "customers") || hasDomain(report, "pricing") || hasDomain(report, "service");
  const service = hasDomain(report, "service");
  const workforce = hasDomain(report, "workforce");
  const webshop = hasDomain(report, "commerce");
  const inventory = hasDomain(report, "inventory");
  const pricing = hasDomain(report, "pricing");
  const nodes: ConfigurationNode[] = [
    {
      key: "business.industry",
      domain: "business",
      label: "Voorgesteld winkelprofiel",
      value: report.industry.value,
      status: report.industry.confidence === "low" ? "needs-decision" : "proposed",
      confidence: report.industry.confidence,
      evidenceIds: report.industry.evidenceIds,
    },
    {
      key: "inventory.tracking",
      domain: "inventory",
      label: "Voorraad opvolgen",
      value: inventory,
      status: inventory ? "proposed" : "not-applicable",
      confidence: inventory ? domainConfidence(report, "inventory") : "high",
      evidenceIds: domainEvidence(report, "inventory"),
    },
    {
      key: "pricing.customer-groups",
      domain: "pricing",
      label: "Prijsboeken of klantprijzen",
      value: pricing,
      status: pricing ? "needs-decision" : "not-applicable",
      confidence: pricing ? domainConfidence(report, "pricing") : "high",
      evidenceIds: domainEvidence(report, "pricing"),
    },
  ];
  const moduleEntries: Array<[RetailModule, MigrationDomain, string, boolean]> = [
    ["catalog", "catalog", "Catalogus & voorraad", catalog],
    ["customers", "customers", "Klanten", customers],
    ["service", "service", "Hersteldienst", service],
    ["workforce", "workforce", "Personeel & verlof", workforce],
    ["webshop", "commerce", "Webshop", webshop],
    ["insights", "catalog", "Inzichten", catalog],
  ];
  const modules = Object.fromEntries(moduleEntries.map(([module, domain, label, enabled]) => [
    module,
    moduleNode(report, module, domain, label, enabled),
  ])) as RetailConfigurationProposal["modules"];
  const readinessChecks: ReadinessCheck[] = [
    {
      id: "readiness.catalog",
      title: "Catalogus herkend",
      detail: catalog ? "Productstructuur is herkend en kan naar staging." : "Een catalogusbron ontbreekt nog.",
      status: catalog ? "ready" : "needs-decision",
      evidenceIds: domainEvidence(report, "catalog"),
    },
    {
      id: "readiness.tax",
      title: "Prijs- en btw-beleid bevestigd",
      detail: pricing ? "Prijsvelden zijn gezien; bevestig btw- en prijsboekregels vóór publicatie." : "Geen prijsbeleid in deze bron gevonden.",
      status: pricing ? "needs-decision" : "not-applicable",
      evidenceIds: domainEvidence(report, "pricing"),
    },
    {
      id: "readiness.stock",
      title: "Voorraadregel bepaald",
      detail: inventory ? "Bevestig of de bron een voorraadmomentopname of een wijzigingsfeed is." : "Geen voorraad in deze bron gevonden.",
      status: inventory ? "needs-decision" : "not-applicable",
      evidenceIds: domainEvidence(report, "inventory"),
    },
    {
      id: "readiness.configuration",
      title: "Winkelopzet beoordeeld",
      detail: report.questions.length > 0 ? `${report.questions.length} gerichte beslissing(en) blijven over.` : "De voorgestelde basisopzet heeft geen open vragen.",
      status: report.questions.some((question) => question.priority === "blocking") ? "needs-decision" : "ready",
      evidenceIds: report.evidence.map((item) => item.id),
    },
  ];
  // Retain this comparison as an explicit invariant: a low-confidence
  // business profile can never silently appear as launch-ready.
  if (rank[report.industry.confidence] === rank.low) {
    readinessChecks[3] = { ...readinessChecks[3], status: "needs-decision" };
  }
  return {
    version: 1,
    sourceFingerprint: report.sourceFingerprint,
    modules,
    nodes,
    readinessChecks,
    questions: report.questions,
  };
};
