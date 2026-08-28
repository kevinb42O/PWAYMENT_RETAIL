import type { Role } from "../types";

export interface InventoryWorkspaceAccessInput {
  role: Role | null;
  moduleEnabled: boolean;
  entitled: boolean;
  platformEnabled: boolean;
}

export const inventoryWorkspaceBuildDefault =
  import.meta.env.DEV
  || import.meta.env.VITE_E2E_BUILD === "true"
  || import.meta.env.VITE_INVENTORY_WORKSPACE_ENABLED === "true";

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
