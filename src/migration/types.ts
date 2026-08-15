/**
 * Explainable, source-derived migration metadata. These types deliberately
 * describe a proposed tenant setup rather than mutating current settings.
 */
export type MigrationDomain =
  | "business"
  | "catalog"
  | "inventory"
  | "pricing"
  | "customers"
  | "sales-history"
  | "service"
  | "workforce"
  | "commerce";

export type RetailModule =
  | "catalog"
  | "customers"
  | "service"
  | "workforce"
  | "webshop"
  | "insights";

export type RetailIndustryHint =
  | "telecom-it"
  | "fashion"
  | "bicycles"
  | "food"
  | "jewelry"
  | "general-retail";

export type ConfidenceBand = "high" | "medium" | "low";
export type ConfigurationNodeStatus =
  | "proposed"
  | "needs-decision"
  | "not-applicable";
export type ReadinessStatus = "ready" | "needs-decision" | "not-applicable";

export type ConfigurationValue =
  | string
  | number
  | boolean
  | null
  | ConfigurationValue[]
  | { [key: string]: ConfigurationValue };

export interface DiscoveryEvidence {
  id: string;
  domain: MigrationDomain;
  confidence: ConfidenceBand;
  message: string;
  headers: string[];
  samples?: string[];
}

export interface DetectedDomain {
  domain: MigrationDomain;
  confidence: ConfidenceBand;
  evidenceIds: string[];
}

export interface CapabilityPackProposal {
  id: string;
  title: string;
  confidence: ConfidenceBand;
  evidenceIds: string[];
  modules: RetailModule[];
}

export interface DiscoveryQuestion {
  id: string;
  title: string;
  detail: string;
  domains: MigrationDomain[];
  priority: "blocking" | "important" | "optional";
}

export interface BusinessDiscoveryReport {
  sourceFingerprint: string;
  sourceLabel: string;
  rowCount: number;
  headers: string[];
  detectedDomains: DetectedDomain[];
  industry: {
    value: RetailIndustryHint;
    confidence: ConfidenceBand;
    evidenceIds: string[];
  };
  capabilityPacks: CapabilityPackProposal[];
  evidence: DiscoveryEvidence[];
  questions: DiscoveryQuestion[];
}

export interface ConfigurationNode {
  key: string;
  domain: MigrationDomain;
  label: string;
  value: ConfigurationValue;
  status: ConfigurationNodeStatus;
  confidence: ConfidenceBand;
  evidenceIds: string[];
}

export interface ReadinessCheck {
  id: string;
  title: string;
  detail: string;
  status: ReadinessStatus;
  evidenceIds: string[];
}

export interface RetailConfigurationProposal {
  version: 1;
  sourceFingerprint: string;
  modules: Partial<Record<RetailModule, ConfigurationNode>>;
  nodes: ConfigurationNode[];
  readinessChecks: ReadinessCheck[];
  questions: DiscoveryQuestion[];
}
