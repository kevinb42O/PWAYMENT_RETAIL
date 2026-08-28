import type { Role } from "../types";

export interface InventoryWorkspaceAccessInput {
  role: Role | null;
  moduleEnabled: boolean;
  entitled: boolean;
  platformEnabled: boolean;
}

export const resolveInventoryWorkspaceBuildDefault = (
  environmentValue: string | undefined,
  development = false,
  e2e = false,
): boolean => {
  if (development || e2e) return true;
  if (environmentValue == null || environmentValue.trim() === "") return true;
  return ["1", "true", "yes", "on"].includes(environmentValue.trim().toLowerCase());
};

// The merchant module preference is the normal on/off switch. The platform
// flag remains an emergency override: an explicit false disables the workspace,
// while the absence of an override must not silently contradict Module Settings.
export const inventoryWorkspaceBuildDefault = resolveInventoryWorkspaceBuildDefault(
  import.meta.env.VITE_INVENTORY_WORKSPACE_ENABLED,
  import.meta.env.DEV,
  import.meta.env.VITE_E2E_BUILD === "true",
);

export const canOpenInventoryWorkspace = ({
  role,
  moduleEnabled,
  entitled,
  platformEnabled,
}: InventoryWorkspaceAccessInput): boolean =>
  (role === "owner" || role === "manager")
  && moduleEnabled
  && entitled
  && platformEnabled;
