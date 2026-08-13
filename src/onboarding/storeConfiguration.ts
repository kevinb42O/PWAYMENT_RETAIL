export const STORE_CONFIGURATION_VERSION = 1 as const;

export const RETAIL_INDUSTRIES = [
  { value: "telecom-it", label: "Telecom & IT" },
  { value: "fashion", label: "Mode & kleding" },
  { value: "lingerie", label: "Lingerie" },
  { value: "bicycles", label: "Fietsen" },
  { value: "toys", label: "Speelgoed" },
  { value: "skate-sports", label: "Skate, sport & outdoor" },
  { value: "electronics", label: "Elektronica" },
  { value: "home-living", label: "Interieur & wonen" },
  { value: "beauty", label: "Beauty & verzorging" },
  { value: "food", label: "Voeding & speciaalzaak" },
  { value: "jewelry", label: "Juwelen & accessoires" },
  { value: "books-hobby", label: "Boeken, hobby & cadeau" },
  { value: "general-retail", label: "Algemene retail" },
  { value: "repair-service", label: "Herstel- of servicedienst" },
  { value: "other", label: "Andere retail" },
] as const;

export const SALES_MODELS = [
  { value: "physical", label: "Fysieke winkel" },
  { value: "omnichannel", label: "Winkel + online verkoop" },
  { value: "online-first", label: "Hoofdzakelijk online" },
  { value: "service-led", label: "Afspraak- of servicegericht" },
] as const;

export const TEAM_SIZES = [
  { value: "solo", label: "Ik werk alleen" },
  { value: "small", label: "2–5 medewerkers" },
  { value: "medium", label: "6–15 medewerkers" },
  { value: "large", label: "16+ medewerkers" },
] as const;

export const CATALOG_SOURCES = [
  { value: "none", label: "Ik start zonder bestaande productlijst" },
  { value: "spreadsheet", label: "Excel, CSV of een andere spreadsheet" },
  { value: "pos", label: "Een bestaand kassasysteem" },
  { value: "ecommerce", label: "Een webshopplatform" },
  { value: "erp", label: "ERP- of boekhoudsoftware" },
  { value: "supplier", label: "Bestanden van leveranciers" },
] as const;

export const PRICING_MODELS = [
  { value: "single", label: "Eén verkoopprijs per product" },
  { value: "customer-groups", label: "Verschillende prijzen per klantgroep" },
  { value: "retail-b2b", label: "Retail- en B2B-prijzen" },
  { value: "contract", label: "Contract- of ledenprijzen" },
] as const;

export const VAT_DEFAULTS = [
  { value: "mixed", label: "Gemengd — btw staat per product" },
  { value: "21", label: "Meestal 21%" },
  { value: "12", label: "Meestal 12%" },
  { value: "6", label: "Meestal 6%" },
] as const;

export const SERVICE_CONTACT_OPTIONS = [
  { value: "both", label: "E-mail én telefonisch" },
  { value: "email", label: "Voornamelijk per e-mail" },
  { value: "phone", label: "Voornamelijk telefonisch" },
] as const;

export type RetailIndustry = (typeof RETAIL_INDUSTRIES)[number]["value"];
export type SalesModel = (typeof SALES_MODELS)[number]["value"];
export type TeamSize = (typeof TEAM_SIZES)[number]["value"];
export type CatalogSource = (typeof CATALOG_SOURCES)[number]["value"];
export type PricingModel = (typeof PRICING_MODELS)[number]["value"];
export type VatDefault = (typeof VAT_DEFAULTS)[number]["value"];
export type ServiceContactPreference =
  (typeof SERVICE_CONTACT_OPTIONS)[number]["value"];
export type ImportTiming = "now" | "later";
export type ConfigurableModule =
  | "catalog"
  | "customers"
  | "service"
  | "webshop"
  | "insights";
export type RecommendedStartView = "pos" | "integration-hub" | "service";

export interface StoreModulePreferences {
  catalog: boolean;
  customers: boolean;
  service: boolean;
  webshop: boolean;
  insights: boolean;
}

export interface StoreConfiguration {
  version: typeof STORE_CONFIGURATION_VERSION;
  completedAt: string | null;
  firstRunCompleted: boolean;
  industry: RetailIndustry;
  salesModel: SalesModel;
  teamSize: TeamSize;
  modules: StoreModulePreferences;
  catalogSource: CatalogSource;
  importTiming: ImportTiming;
  pricingModel: PricingModel;
  defaultVat: VatDefault;
  serviceContactPreference: ServiceContactPreference;
}

export const MODULE_DETAILS: Array<{
  key: ConfigurableModule;
  title: string;
  description: string;
}> = [
  {
    key: "catalog",
    title: "Voorraad & Integration Hub",
    description: "Producten, stock, leveranciersvelden en bestaande bestanden meenemen.",
  },
  {
    key: "customers",
    title: "Klanten",
    description: "Klantgegevens, prijsafspraken, historiek en loyaliteit beheren.",
  },
  {
    key: "service",
    title: "Hersteldienst",
    description: "Intake, prijs, status, communicatie, bon en klanttracking.",
  },
  {
    key: "webshop",
    title: "Webshop",
    description: "Online catalogus en verkoop voorbereiden vanuit dezelfde productdata.",
  },
  {
    key: "insights",
    title: "Inzichten",
    description: "Verkoop-, voorraad- en klantpatronen omzetten in concrete acties.",
  },
];

const broadModuleDefaults: StoreModulePreferences = {
  catalog: true,
  customers: true,
  service: true,
  webshop: true,
  insights: true,
};

const modulePreset = (
  enabled: ConfigurableModule[],
): StoreModulePreferences => ({
  catalog: enabled.includes("catalog"),
  customers: enabled.includes("customers"),
  service: enabled.includes("service"),
  webshop: enabled.includes("webshop"),
  insights: enabled.includes("insights"),
});

const INDUSTRY_MODULE_PRESETS: Record<RetailIndustry, StoreModulePreferences> = {
  "telecom-it": modulePreset(["catalog", "customers", "service", "insights"]),
  fashion: modulePreset(["catalog", "customers", "webshop", "insights"]),
  lingerie: modulePreset(["catalog", "customers", "webshop", "insights"]),
  bicycles: modulePreset(["catalog", "customers", "service", "webshop", "insights"]),
  toys: modulePreset(["catalog", "customers", "webshop", "insights"]),
  "skate-sports": modulePreset(["catalog", "customers", "service", "webshop", "insights"]),
  electronics: modulePreset(["catalog", "customers", "service", "webshop", "insights"]),
  "home-living": modulePreset(["catalog", "customers", "webshop", "insights"]),
  beauty: modulePreset(["catalog", "customers", "webshop", "insights"]),
  food: modulePreset(["catalog", "customers", "insights"]),
  jewelry: modulePreset(["catalog", "customers", "service", "webshop", "insights"]),
  "books-hobby": modulePreset(["catalog", "customers", "webshop", "insights"]),
  "general-retail": modulePreset(["catalog", "customers", "webshop", "insights"]),
  "repair-service": modulePreset(["catalog", "customers", "service"]),
  other: modulePreset(["catalog", "customers", "webshop", "insights"]),
};

export const recommendedModulesForIndustry = (
  industry: RetailIndustry,
): StoreModulePreferences => ({ ...INDUSTRY_MODULE_PRESETS[industry] });

export const DEFAULT_STORE_CONFIGURATION: StoreConfiguration = {
  version: STORE_CONFIGURATION_VERSION,
  completedAt: null,
  firstRunCompleted: true,
  industry: "general-retail",
  salesModel: "physical",
  teamSize: "small",
  modules: { ...broadModuleDefaults },
  catalogSource: "none",
  importTiming: "later",
  pricingModel: "single",
  defaultVat: "mixed",
  serviceContactPreference: "both",
};

export const createStoreConfigurationDraft = (): StoreConfiguration => ({
  ...DEFAULT_STORE_CONFIGURATION,
  firstRunCompleted: false,
  modules: recommendedModulesForIndustry("general-retail"),
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const optionValue = <T extends string>(
  options: readonly { value: T }[],
  value: unknown,
  fallback: T,
): T =>
  typeof value === "string" && options.some((option) => option.value === value)
    ? (value as T)
    : fallback;

export const normalizeStoreConfiguration = (
  value: unknown,
): StoreConfiguration => {
  if (!isRecord(value) || value.version !== STORE_CONFIGURATION_VERSION) {
    return {
      ...DEFAULT_STORE_CONFIGURATION,
      modules: { ...DEFAULT_STORE_CONFIGURATION.modules },
    };
  }

  const sourceModules = isRecord(value.modules) ? value.modules : {};
  const modules = Object.fromEntries(
    (Object.keys(broadModuleDefaults) as ConfigurableModule[]).map((key) => [
      key,
      typeof sourceModules[key] === "boolean"
        ? sourceModules[key]
        : broadModuleDefaults[key],
    ]),
  ) as unknown as StoreModulePreferences;

  return {
    version: STORE_CONFIGURATION_VERSION,
    completedAt:
      typeof value.completedAt === "string" ? value.completedAt : null,
    firstRunCompleted:
      typeof value.firstRunCompleted === "boolean"
        ? value.firstRunCompleted
        : true,
    industry: optionValue(
      RETAIL_INDUSTRIES,
      value.industry,
      DEFAULT_STORE_CONFIGURATION.industry,
    ),
    salesModel: optionValue(
      SALES_MODELS,
      value.salesModel,
      DEFAULT_STORE_CONFIGURATION.salesModel,
    ),
    teamSize: optionValue(
      TEAM_SIZES,
      value.teamSize,
      DEFAULT_STORE_CONFIGURATION.teamSize,
    ),
    modules,
    catalogSource: optionValue(
      CATALOG_SOURCES,
      value.catalogSource,
      DEFAULT_STORE_CONFIGURATION.catalogSource,
    ),
    importTiming:
      value.importTiming === "now" || value.importTiming === "later"
        ? value.importTiming
        : DEFAULT_STORE_CONFIGURATION.importTiming,
    pricingModel: optionValue(
      PRICING_MODELS,
      value.pricingModel,
      DEFAULT_STORE_CONFIGURATION.pricingModel,
    ),
    defaultVat: optionValue(
      VAT_DEFAULTS,
      value.defaultVat,
      DEFAULT_STORE_CONFIGURATION.defaultVat,
    ),
    serviceContactPreference: optionValue(
      SERVICE_CONTACT_OPTIONS,
      value.serviceContactPreference,
      DEFAULT_STORE_CONFIGURATION.serviceContactPreference,
    ),
  };
};

export const completeStoreConfiguration = (
  value: StoreConfiguration,
  completedAt = new Date().toISOString(),
): StoreConfiguration => ({
  ...normalizeStoreConfiguration(value),
  completedAt,
  firstRunCompleted: false,
});

export const recommendedStartView = (
  configuration: StoreConfiguration,
): RecommendedStartView => {
  if (
    configuration.modules.catalog &&
    configuration.catalogSource !== "none" &&
    configuration.importTiming === "now"
  ) {
    return "integration-hub";
  }
  if (configuration.modules.service && !configuration.modules.catalog) {
    return "service";
  }
  return "pos";
};

export const configuredVatFallback = (
  configuration: StoreConfiguration,
): number =>
  configuration.defaultVat === "mixed"
    ? 21
    : Number(configuration.defaultVat);

export const labelFor = <T extends string>(
  options: readonly { value: T; label: string }[],
  value: T,
): string => options.find((option) => option.value === value)?.label ?? value;
