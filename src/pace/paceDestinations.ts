import type { MainView } from "../store/useStore";

export type PaceDestinationRole = "owner" | "manager" | "cashier";
export type PaceProfileTab = "billing" | "modules" | "pace" | "catalog-products" | "catalog-categories" | "labels" | "webshop-general" | "integrations";
export type PaceWorkspaceFocus = "product-search" | "cart" | "return-search";

export type PaceDestination =
  | { type: "workspace"; view: MainView; focus?: PaceWorkspaceFocus; label: string; reason: string; requiredRoles?: PaceDestinationRole[] }
  | { type: "profile"; tab: PaceProfileTab; label: string; reason: string; requiredRoles?: PaceDestinationRole[] }
  | { type: "catalog-selection"; productIds: string[]; filterLabel: string; label: string; reason: string; requiredRoles?: PaceDestinationRole[] }
  | { type: "setup"; label: string; reason: string; requiredRoles?: PaceDestinationRole[] };

export interface PaceDestinationAccess {
  allowed: boolean;
  message?: string;
}

const MANAGEMENT_ROLES: PaceDestinationRole[] = ["owner", "manager"];

export const paceWorkspaceDestination = (
  view: MainView,
  label: string,
  reason: string,
  options: { focus?: PaceWorkspaceFocus; requiredRoles?: PaceDestinationRole[] } = {},
): PaceDestination => ({ type: "workspace", view, label, reason, ...options });

export const paceProfileDestination = (
  tab: PaceProfileTab,
  label: string,
  reason: string,
  requiredRoles: PaceDestinationRole[] = MANAGEMENT_ROLES,
): PaceDestination => ({ type: "profile", tab, label, reason, requiredRoles });

export const paceSetupDestination = (label: string, reason: string): PaceDestination => ({
  type: "setup",
  label,
  reason,
  requiredRoles: MANAGEMENT_ROLES,
});

export const paceCatalogSelectionDestination = (productIds: string[], filterLabel: string, label: string, reason: string): PaceDestination => ({
  type: "catalog-selection",
  productIds: [...new Set(productIds)].slice(0, 100),
  filterLabel: filterLabel.trim().slice(0, 120),
  label,
  reason,
  requiredRoles: MANAGEMENT_ROLES,
});

export const validatePaceDestination = (destination: PaceDestination, role: PaceDestinationRole | null): PaceDestinationAccess => {
  if (!destination.label.trim() || !destination.reason.trim()) return { allowed: false, message: "Deze Pace-bestemming mist een controleerbare omschrijving." };
  if (destination.type === "workspace" && destination.focus === "return-search" && destination.view !== "audit-log") {
    return { allowed: false, message: "De retourzoekflow kan alleen vanuit Historiek worden geopend." };
  }
  if (destination.type === "catalog-selection" && destination.productIds.length === 0) {
    return { allowed: false, message: "Er zijn geen toegestane producten om te openen." };
  }
  const requiredRoles = destination.requiredRoles ?? [];
  if (requiredRoles.length > 0 && (!role || !requiredRoles.includes(role))) {
    return { allowed: false, message: "Deze oplossing vereist manager- of eigenaarstoegang. Pace omzeilt die bevoegdheid niet." };
  }
  return { allowed: true };
};

export const isPaceCatalogDestination = (destination: PaceDestination) => destination.type === "catalog-selection";
