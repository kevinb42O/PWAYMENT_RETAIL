import { describe, expect, it } from "vitest";
import {
  paceCatalogSelectionDestination,
  paceProfileDestination,
  paceWorkspaceDestination,
  validatePaceDestination,
} from "./paceDestinations";

describe("Pace typed destinations", () => {
  it("allows a cashier to open a non-mutating POS focus target", () => {
    const destination = paceWorkspaceDestination("pos", "productzoeken", "De zoekbalk staat klaar.", { focus: "product-search" });
    expect(validatePaceDestination(destination, "cashier")).toEqual({ allowed: true });
  });

  it("keeps the return search behind manager or owner access", () => {
    const destination = paceWorkspaceDestination("audit-log", "retour zoeken", "Open de retourzoekflow.", { focus: "return-search", requiredRoles: ["owner", "manager"] });
    expect(validatePaceDestination(destination, "cashier")).toEqual(expect.objectContaining({ allowed: false }));
    expect(validatePaceDestination(destination, "manager")).toEqual({ allowed: true });
  });

  it("rejects a return-search focus outside Historiek", () => {
    const destination = paceWorkspaceDestination("pos", "retour zoeken", "Ongeldige route.", { focus: "return-search" });
    expect(validatePaceDestination(destination, "owner")).toEqual(expect.objectContaining({ allowed: false }));
  });

  it("requires management access for profile destinations", () => {
    const destination = paceProfileDestination("integrations", "synchronisatieherstel", "Open de herstelstatus.");
    expect(validatePaceDestination(destination, "cashier").allowed).toBe(false);
    expect(validatePaceDestination(destination, "owner").allowed).toBe(true);
  });

  it("bounds and deduplicates catalog selections", () => {
    const destination = paceCatalogSelectionDestination(["a", "a", ...Array.from({ length: 120 }, (_, index) => `p-${index}`)], "  selectie  ", "artikelen", "Open bewijsproducten.");
    expect(destination.type).toBe("catalog-selection");
    if (destination.type !== "catalog-selection") throw new Error("Expected catalog selection destination");
    expect(destination.productIds).toHaveLength(100);
    expect(destination.productIds[0]).toBe("a");
    expect(destination.filterLabel).toBe("selectie");
    expect(validatePaceDestination(destination, "manager")).toEqual({ allowed: true });
  });
});
