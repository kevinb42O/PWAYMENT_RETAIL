import type { ParsedImportFile } from "../utils/integrationImport";
import type {
  BusinessDiscoveryReport,
  ConfidenceBand,
  DetectedDomain,
  DiscoveryEvidence,
  MigrationDomain,
  RetailIndustryHint,
} from "./types";

type SignalDefinition = {
  domain: MigrationDomain;
  expression: RegExp;
  message: string;
  confidence: ConfidenceBand;
};

const signals: SignalDefinition[] = [
  { domain: "catalog", expression: /product|artikel|item|sku|ean|gtin|barcode|merk|brand|variant|categorie|category/, message: "Product-, variant- of classificatievelden gevonden.", confidence: "high" },
  { domain: "inventory", expression: /voorraad|stock|quantity|qty|magazijn|warehouse|location|locatie|reorder|min stock|minimum stock|lot|batch/, message: "Voorraad- of locatiedata gevonden.", confidence: "high" },
  { domain: "pricing", expression: /price|prijs|tarief|cost|kost|aankoop|inkoop|btw|vat|tax|contract|b2b|member|klantprijs|customer price|discount|korting/, message: "Prijs-, kost- of belastingvelden gevonden.", confidence: "high" },
  { domain: "customers", expression: /customer|klant|email|e-mail|phone|telefoon|loyalty|points|punten|address|adres|company|bedrijf/, message: "Klant- of loyaliteitsvelden gevonden.", confidence: "medium" },
  { domain: "sales-history", expression: /order|bestelling|invoice|factuur|sale|verkoop|payment|betaling|refund|return|retour|transaction/, message: "Verkoop-, betaal- of retourdata gevonden.", confidence: "medium" },
  { domain: "service", expression: /repair|herstel|service|imei|serial|serienummer|warranty|garantie|diagnos|defect|deposit|voorschot|ticket/, message: "Herstel-, toestel- of servicevelden gevonden.", confidence: "high" },
  { domain: "workforce", expression: /employee|medewerker|staff|personeel|roster|shift|uurrooster|contract hours|verlof|leave/, message: "Personeels- of roosterdata gevonden.", confidence: "medium" },
  { domain: "commerce", expression: /shopify|woocommerce|webshop|marketplace|fulfillment|verzending|shipping|tracking|coupon/, message: "Webshop- of fulfilmentvelden gevonden.", confidence: "medium" },
];

const industrySignals: Array<{
  value: RetailIndustryHint;
  expression: RegExp;
  title: string;
}> = [
  { value: "telecom-it", expression: /imei|serial|serienummer|sim|repair|herstel|warranty|garantie|device|toestel/, title: "Telecom, IT of herstel" },
  { value: "fashion", expression: /maat|size|colour|color|kleur|seizoen|season|collection|collectie/, title: "Mode of kleding" },
  { value: "bicycles", expression: /fiets|bicycle|bike|frame|wiel|wheel|cassette|derailleur/, title: "Fietsen" },
  { value: "food", expression: /allerg|expiry|verval|houdbaar|lot|batch|gewicht|weight|ingredient/, title: "Voeding of speciaalzaak" },
  { value: "jewelry", expression: /karaat|carat|edelmetaal|gold|goud|zilver|silver|ringmaat|gemstone/, title: "Juwelen" },
];

const normalize = (value: string): string =>
  value
    .toLocaleLowerCase("nl-BE")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const headerMatches = (headers: string[], expression: RegExp): string[] =>
  headers.filter((header) => expression.test(normalize(header)));

const stableFingerprint = (parts: string[]): string => {
  let hash = 2166136261;
  for (const character of parts.join("\u001f")) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return `schema_${(hash >>> 0).toString(36)}`;
};

const sampleValuesFor = (parsed: ParsedImportFile, headers: string[]): string[] => {
  const indexes = headers
    .map((header) => parsed.headers.indexOf(header))
    .filter((index) => index >= 0);
  return parsed.rows
    .flatMap((row) => indexes.map((index) => row[index]?.trim() ?? ""))
    .filter(Boolean)
    .slice(0, 3);
};

const confidenceRank: Record<ConfidenceBand, number> = { low: 1, medium: 2, high: 3 };

const stronger = (left: ConfidenceBand, right: ConfidenceBand): ConfidenceBand =>
  confidenceRank[left] >= confidenceRank[right] ? left : right;

const makeDomainEvidence = (parsed: ParsedImportFile): DiscoveryEvidence[] =>
  signals.flatMap((signal) => {
    const headers = headerMatches(parsed.headers, signal.expression);
    if (headers.length === 0) return [];
    return [{
      id: `evidence:${signal.domain}`,
      domain: signal.domain,
      confidence: signal.confidence,
      message: signal.message,
      headers,
      samples: sampleValuesFor(parsed, headers),
    }];
  });

const detectIndustry = (parsed: ParsedImportFile, evidence: DiscoveryEvidence[]) => {
  const matching = industrySignals
    .map((signal) => ({ signal, headers: headerMatches(parsed.headers, signal.expression) }))
    .filter((candidate) => candidate.headers.length > 0)
    .sort((left, right) => right.headers.length - left.headers.length)[0];
  if (!matching) {
    return { value: "general-retail" as const, confidence: "low" as const, evidenceIds: evidence.filter((item) => item.domain === "catalog").map((item) => item.id) };
  }
  const id = `evidence:industry:${matching.signal.value}`;
  evidence.push({
    id,
    domain: matching.signal.value === "telecom-it" ? "service" : "catalog",
    confidence: matching.headers.length > 1 ? "high" : "medium",
    message: `${matching.signal.title} lijkt waarschijnlijk op basis van bronspecifieke velden.`,
    headers: matching.headers,
    samples: sampleValuesFor(parsed, matching.headers),
  });
  return {
    value: matching.signal.value,
    confidence: matching.headers.length > 1 ? "high" as const : "medium" as const,
    evidenceIds: [id],
  };
};

export const discoverRetailBusiness = (
  parsed: ParsedImportFile,
  sourceLabel: string,
): BusinessDiscoveryReport => {
  const evidence = makeDomainEvidence(parsed);
  const industry = detectIndustry(parsed, evidence);
  const domains = new Map<MigrationDomain, DetectedDomain>();
  evidence.forEach((item) => {
    const existing = domains.get(item.domain);
    domains.set(item.domain, existing
      ? { ...existing, confidence: stronger(existing.confidence, item.confidence), evidenceIds: [...existing.evidenceIds, item.id] }
      : { domain: item.domain, confidence: item.confidence, evidenceIds: [item.id] });
  });

  const hasDomain = (domain: MigrationDomain) => domains.has(domain);
  const questions = [];
  if (!hasDomain("catalog")) {
    questions.push({ id: "question:catalog", title: "Waar staat uw productcatalogus?", detail: "Dit bestand bevat geen duidelijke productidentiteit. Upload ook uw artikelen-, voorraad- of leveranciersexport.", domains: ["catalog" as const], priority: "blocking" as const });
  }
  if (hasDomain("inventory") && !headerMatches(parsed.headers, /magazijn|warehouse|location|locatie/).length) {
    questions.push({ id: "question:stock-location", title: "Komt deze voorraad uit één locatie?", detail: "We zien voorraad maar geen winkel- of magazijnlocatie. Bevestig of dit één totaalvoorraad is.", domains: ["inventory" as const], priority: "important" as const });
  }
  if (hasDomain("pricing") && !headerMatches(parsed.headers, /btw|vat|tax/).length) {
    questions.push({ id: "question:tax", title: "Zijn prijzen inclusief btw?", detail: "We zien prijsvelden maar geen btw-kolom. Bevestig de prijs- en btw-conventie voordat prijzen live gaan.", domains: ["pricing" as const], priority: "blocking" as const });
  }
  if (industry.confidence === "low") {
    questions.push({ id: "question:industry", title: "Welk type retailbedrijf is dit?", detail: "We houden de basis breed totdat we voldoende bewijs hebben voor een gespecialiseerde werkstroom.", domains: ["business" as const], priority: "important" as const });
  }

  const capabilityPacks = [
    ...(hasDomain("catalog") ? [{ id: "core-catalog", title: "Retailcatalogus", confidence: "high" as const, evidenceIds: domains.get("catalog")?.evidenceIds ?? [], modules: ["catalog", "insights"] as const }] : []),
    ...(hasDomain("service") ? [{ id: "service-desk", title: "Herstel & service", confidence: domains.get("service")?.confidence ?? "medium", evidenceIds: domains.get("service")?.evidenceIds ?? [], modules: ["service", "customers", "catalog"] as const }] : []),
    ...(hasDomain("pricing") ? [{ id: "customer-pricing", title: "Prijsboeken & klantprijzen", confidence: domains.get("pricing")?.confidence ?? "medium", evidenceIds: domains.get("pricing")?.evidenceIds ?? [], modules: ["catalog", "customers"] as const }] : []),
    ...(hasDomain("commerce") ? [{ id: "omnichannel", title: "Omnichannel verkoop", confidence: domains.get("commerce")?.confidence ?? "medium", evidenceIds: domains.get("commerce")?.evidenceIds ?? [], modules: ["webshop", "catalog", "customers"] as const }] : []),
  ].map((pack) => ({ ...pack, modules: [...pack.modules] }));

  return {
    sourceFingerprint: stableFingerprint([...parsed.headers.map(normalize).sort(), parsed.format, parsed.sheetName ?? ""]),
    sourceLabel,
    rowCount: parsed.rows.length,
    headers: parsed.headers,
    detectedDomains: Array.from(domains.values()),
    industry,
    capabilityPacks,
    evidence,
    questions,
  };
};
