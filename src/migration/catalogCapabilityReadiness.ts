import type { ImportFieldMapping } from "../types";
import type {
  RetailCapabilityCode,
  RetailCapabilityState,
  StoreConfiguration,
} from "../onboarding/storeConfiguration";
import type { ParsedImportFile } from "../utils/integrationImport";

export type CatalogCapabilityReadinessStatus =
  | "ready"
  | "profile-decision"
  | "profile-conflict"
  | "catalog-workflow-pending";

export interface CatalogCapabilityFinding {
  capability: RetailCapabilityCode;
  state: RetailCapabilityState;
  headers: string[];
  rowsWithData: number;
  status: CatalogCapabilityReadinessStatus;
  title: string;
  detail: string;
}

export interface CatalogCapabilityReadiness {
  findings: CatalogCapabilityFinding[];
  blockingFindings: CatalogCapabilityFinding[];
}

type CapabilitySignal = {
  capability: RetailCapabilityCode;
  title: string;
  /** The V1 mapper can preserve this capability without flattening it. */
  supportedByCurrentImporter: boolean;
  expression: RegExp;
  /** A location field only requires multi-location stock when values differ. */
  requireMultipleDistinctValues?: boolean;
};

const signals: CapabilitySignal[] = [
  {
    capability: "variant-matrix",
    title: "varianten",
    supportedByCurrentImporter: true,
    expression: /(^| )(variant|maat|size|kleur|colour|color|dimension|breedte|width|lengte|length)( |$)/,
  },
  {
    capability: "stock-locations",
    title: "voorraadlocaties",
    supportedByCurrentImporter: false,
    expression: /(^| )(magazijn|warehouse|location|locatie|filiaal|branch|bin|schap|shelf)( |$)/,
    requireMultipleDistinctValues: true,
  },
  {
    capability: "serial-numbers",
    title: "serienummers",
    supportedByCurrentImporter: false,
    expression: /(^| )(imei|serial|serienummer|serial number|frame number|framenummer)( |$)/,
  },
  {
    capability: "lot-traceability",
    title: "lot- of batchtracking",
    supportedByCurrentImporter: false,
    expression: /(^| )(lot|batch|partij|expiry|vervaldatum|houdbaar|best before)( |$)/,
  },
  {
    capability: "measurable-quantities",
    title: "gewogen of gemeten hoeveelheden",
    supportedByCurrentImporter: false,
    expression: /(^| )(gewicht|weight|gram|kg|kilogram|liter|volume|meter|meetunit|uom|unit of measure)( |$)/,
  },
  {
    capability: "packaging",
    title: "verpakkingseenheden",
    supportedByCurrentImporter: false,
    expression: /(^| )(verpakking|packaging|pack|doos|box|carton|case|multipack|inhoud|units per)( |$)/,
  },
];

const normalizeHeader = (value: string): string =>
  value
    .toLocaleLowerCase("nl-BE")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const nonEmptyValueCount = (
  parsed: ParsedImportFile,
  headers: string[],
): number => {
  const indexes = headers
    .map((header) => parsed.headers.indexOf(header))
    .filter((index) => index >= 0);
  return parsed.rows.filter((row) =>
    indexes.some((index) => Boolean(row[index]?.trim())),
  ).length;
};

const distinctValueCount = (
  parsed: ParsedImportFile,
  headers: string[],
): number => {
  const indexes = headers
    .map((header) => parsed.headers.indexOf(header))
    .filter((index) => index >= 0);
  return new Set(
    parsed.rows.flatMap((row) =>
      indexes
        .map((index) => row[index]?.trim())
        .filter((value): value is string => Boolean(value))
        .map((value) => value.toLocaleLowerCase("nl-BE")),
    ),
  ).size;
};

const makeFinding = (
  signal: CapabilitySignal,
  state: RetailCapabilityState,
  headers: string[],
  rowsWithData: number,
): CatalogCapabilityFinding => {
  if (state === "not-needed") {
    return {
      capability: signal.capability,
      state,
      headers,
      rowsWithData,
      status: "profile-conflict",
      title: `Bron vraagt ${signal.title}, winkelprofiel zegt “niet nodig”`,
      detail: `De bron bevat ${signal.title} in ${headers.join(", ")}. Pas eerst uw winkelprofiel aan of gebruik een bron zonder deze gegevens; de import neemt geen tegenstrijdige keuze over.`,
    };
  }
  if (state === "unknown") {
    return {
      capability: signal.capability,
      state,
      headers,
      rowsWithData,
      status: "profile-decision",
      title: `Bevestig ${signal.title} voor deze winkel`,
      detail: `De bron bevat ${signal.title} in ${headers.join(", ")}. Omdat dit nog niet beoordeeld is in het winkelprofiel, wordt deze import niet op basis van een gok geactiveerd.`,
    };
  }
  if (!signal.supportedByCurrentImporter) {
    return {
      capability: signal.capability,
      state,
      headers,
      rowsWithData,
      status: "catalog-workflow-pending",
      title: `${signal.title} niet naar een platte SKU-import reduceren`,
      detail: `Deze bron vraagt ${signal.title} (${headers.join(", ")}). De huidige import kan die relatie nog niet als volwaardige catalogus- en POS-workflow opslaan, dus activering blijft geblokkeerd in plaats van data plat te slaan.`,
    };
  }
  return {
    capability: signal.capability,
    state,
    headers,
    rowsWithData,
    status: "ready",
    title: `${signal.title} beoordeeld`,
    detail: `De bron en het winkelprofiel zijn in lijn voor ${signal.title}.`,
  };
};

const customerPricingFinding = (
  parsed: ParsedImportFile,
  mappings: ImportFieldMapping[],
  state: RetailCapabilityState,
): CatalogCapabilityFinding | null => {
  const headers = mappings
    .filter((mapping) => mapping.target.startsWith("price:"))
    .map((mapping) => mapping.source);
  const rowsWithData = nonEmptyValueCount(parsed, headers);
  if (headers.length === 0 || rowsWithData === 0) return null;
  return makeFinding(
    {
      capability: "customer-pricing",
      title: "klantprijzen",
      supportedByCurrentImporter: true,
      expression: /.*/,
    },
    state,
    headers,
    rowsWithData,
  );
};

const multipleIdentifiersFinding = (
  parsed: ParsedImportFile,
  mappings: ImportFieldMapping[],
  state: RetailCapabilityState,
): CatalogCapabilityFinding | null => {
  // A normal SKU plus one EAN is already a supported retail baseline. This
  // signal only fires when the merchant maps another explicit identifier
  // column, which cannot safely be flattened into the legacy two fields.
  const headers = mappings
    .filter((mapping) => mapping.target === "identifier" || mapping.target.startsWith("identifier:"))
    .map((mapping) => mapping.source);
  const rowsWithData = nonEmptyValueCount(parsed, headers);
  if (headers.length === 0 || rowsWithData === 0) return null;
  return makeFinding(
    {
      capability: "multiple-identifiers",
      title: "meerdere productidentificaties",
      supportedByCurrentImporter: true,
      expression: /.*/,
    },
    state,
    headers,
    rowsWithData,
  );
};

/**
 * Conservative, source-evidence-only protection for the legacy flat-SKU
 * migration. This function deliberately does not infer requirements from a
 * selected sector; it only compares explicit source data with the merchant's
 * own profile declaration.
 */
export const assessCatalogCapabilityReadiness = (
  parsed: ParsedImportFile,
  mappings: ImportFieldMapping[],
  configuration: Pick<StoreConfiguration, "capabilities">,
): CatalogCapabilityReadiness => {
  const findings = signals.flatMap((signal) => {
    const headers = parsed.headers.filter((header) =>
      signal.expression.test(normalizeHeader(header)),
    );
    const rowsWithData = nonEmptyValueCount(parsed, headers);
    const needsCapability = rowsWithData > 0
      && (!signal.requireMultipleDistinctValues
        || distinctValueCount(parsed, headers) > 1);
    return needsCapability
      ? [makeFinding(signal, configuration.capabilities[signal.capability], headers, rowsWithData)]
      : [];
  });
  const pricing = customerPricingFinding(
    parsed,
    mappings,
    configuration.capabilities["customer-pricing"],
  );
  if (pricing) findings.push(pricing);
  const multipleIdentifiers = multipleIdentifiersFinding(
    parsed,
    mappings,
    configuration.capabilities["multiple-identifiers"],
  );
  if (multipleIdentifiers) findings.push(multipleIdentifiers);
  return {
    findings,
    blockingFindings: findings.filter((finding) => finding.status !== "ready"),
  };
};
