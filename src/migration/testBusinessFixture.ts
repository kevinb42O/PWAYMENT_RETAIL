import type { ParsedImportFile } from "../utils/integrationImport";

/**
 * A deliberately substantial fictional telecom retailer, not a tiny smoke
 * sample. It models eight years of catalog growth, recurring stock counts,
 * customer pricing, device repair evidence, and 240 GDPR-safe synthetic
 * customers. Nothing in this fixture represents a real merchant or person.
 */
const catalogHeaders = [
  "Artikelcode", "Productnaam", "Categorie", "Subcategorie", "Merk", "Leverancier",
  "Leverancierscode", "EAN", "Aankoopprijs", "Verkoopprijs", "Prijs Telenet klant",
  "Prijs B2B", "Voorraad", "BTW", "Locatie", "Herstelstatus", "Garantie einddatum", "IMEI patroon",
];

const catalogFamilies = [
  ["Smartphones", "Android toestellen", "Samsung", "Galaxy A", 18, 29900, 21900],
  ["Smartphones", "Android toestellen", "Google", "Pixel", 12, 54900, 46900],
  ["Smartphones", "iOS toestellen", "Apple", "iPhone", 10, 69900, 62900],
  ["Tablets", "Tablets", "Samsung", "Galaxy Tab", 9, 27900, 23900],
  ["Wearables", "Smartwatches", "Apple", "Watch", 14, 24900, 21900],
  ["Wearables", "Smartwatches", "Samsung", "Galaxy Watch", 12, 19900, 16900],
  ["Accessoires", "Bescherming", "OtterBox", "Defender case", 36, 3990, 3490],
  ["Accessoires", "Laders & kabels", "Anker", "PowerLine USB-C", 48, 2490, 1990],
  ["Accessoires", "Audio", "JBL", "Tune", 22, 7990, 6990],
  ["Netwerk", "Modems & routers", "Telenet", "F@ST modem", 15, 9900, 7900],
  ["Netwerk", "Mesh wifi", "TP-Link", "Deco", 16, 12900, 10900],
  ["Diensten", "Herstellingen", "Pwayment Service", "Diagnose toestel", 1, 3500, 3500],
] as const;

const makeCatalog = (): ParsedImportFile => {
  const rows = catalogFamilies.flatMap(([category, subcategory, brand, model, count, basePrice, memberPrice], familyIndex) =>
    Array.from({ length: count }, (_, itemIndex) => {
      const sequence = familyIndex * 100 + itemIndex + 1;
      const sale = basePrice + itemIndex * (category === "Smartphones" ? 2500 : 350);
      const cost = Math.round(sale * (category === "Diensten" ? 0.18 : 0.62));
      const stock = category === "Diensten" ? "" : String((itemIndex * 7 + familyIndex * 3) % 38);
      return [
        `VTR-${String(sequence).padStart(4, "0")}`,
        `${model} ${2021 + (itemIndex % 6)} ${["Zwart", "Blauw", "Zilver", "Graphite"][itemIndex % 4]}`,
        category,
        subcategory,
        brand,
        familyIndex % 3 === 0 ? "Telenet Business Distribution" : familyIndex % 3 === 1 ? "Tech Data Belgium" : "Ingram Micro Belgium",
        `${brand.slice(0, 3).toUpperCase()}-${2021 + (itemIndex % 6)}-${String(itemIndex + 1).padStart(3, "0")}`,
        `540${String(1000000000 + sequence).slice(-10)}`,
        (cost / 100).toFixed(2).replace(".", ","),
        (sale / 100).toFixed(2).replace(".", ","),
        ((memberPrice + itemIndex * 275) / 100).toFixed(2).replace(".", ","),
        ((sale * 0.88) / 100).toFixed(2).replace(".", ","),
        stock,
        "21",
        familyIndex < 2 ? `Toonbank ${1 + (itemIndex % 4)}` : familyIndex < 10 ? `Magazijn A-${1 + (itemIndex % 8)}` : "Werkplaats",
        category === "Diensten" ? "Actief herstelartikel" : itemIndex % 9 === 0 ? "Garantiecontrole vereist" : "Verkoopklaar",
        `${2027 + (itemIndex % 3)}-${String(1 + (itemIndex % 12)).padStart(2, "0")}-15`,
        category === "Smartphones" ? "15 cijfers (IMEI)" : "",
      ];
    }),
  );
  return { format: "csv", headers: catalogHeaders, rows };
};

const firstNames = ["Noor", "Lars", "Marie", "Jules", "Elise", "Thomas", "Sofie", "Yassin", "Lotte", "Bram", "Amina", "Wout"];
const lastNames = ["De Smet", "Janssens", "Peeters", "Maes", "Willems", "Vermeulen", "Claes", "Mertens", "Vandenberghe", "De Clercq"];
const cities = ["Gent", "Antwerpen", "Brugge", "Mechelen", "Leuven", "Aalst"];

const makeCustomers = (): ParsedImportFile => ({
  format: "csv",
  headers: ["Klant-ID", "Naam", "E-mail", "Telefoon", "Adres", "Segment", "Loyaliteitsniveau", "Aangemaakt op", "Laatste aankoop", "Voorkeur communicatie"],
  rows: Array.from({ length: 240 }, (_, index) => {
    const number = index + 1;
    const firstName = firstNames[index % firstNames.length];
    const lastName = lastNames[Math.floor(index / firstNames.length) % lastNames.length];
    const city = cities[index % cities.length];
    return [
      `VTR-C${String(number).padStart(5, "0")}`,
      `${firstName} ${lastName}`,
      `klant${String(number).padStart(3, "0")}@voorbeeld.invalid`,
      `+32 4${String(60000000 + number).slice(-8)}`,
      `${1 + (index % 178)} Teststraat, ${9000 + (index % 100)} ${city}`,
      index % 7 === 0 ? "b2b" : index % 3 === 0 ? "telenet klant" : "niet klant",
      ["Brons", "Zilver", "Goud"][index % 3],
      `${2018 + (index % 8)}-${String(1 + (index % 12)).padStart(2, "0")}-10`,
      `2026-${String(1 + (index % 8)).padStart(2, "0")}-${String(1 + (index % 27)).padStart(2, "0")}`,
      index % 2 === 0 ? "E-mail" : "SMS",
    ];
  }),
});

export const multiYearTelecomRetailFixture = () => ({
  businessName: "Vermeer Telecom & Repair · 2018–2026 (fictieve testzaak)",
  catalog: makeCatalog(),
  customers: makeCustomers(),
});
