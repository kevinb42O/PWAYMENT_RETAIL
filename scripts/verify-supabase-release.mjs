#!/usr/bin/env node

/**
 * Stops a production deploy when the browser bundle points at a different
 * Supabase project than the project whose migration history is being checked.
 *
 * This deliberately never prints URLs, project refs, tokens, or Supabase CLI
 * output. The production workflow runs it after `vercel pull`, so the Vite
 * target is read from Vercel's production environment file rather than a
 * developer's local `.env` file.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const SUPABASE_URL_KEY = "VITE_SUPABASE_URL";
const PROJECT_REF_PATTERN = /^[a-z0-9]{6,}$/i;

export class ReleaseVerificationError extends Error {}

const valueFromEnvLine = (line, key) => {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) return undefined;

  const withoutExport = trimmed.replace(/^export\s+/, "");
  const separator = withoutExport.indexOf("=");
  if (separator < 1 || withoutExport.slice(0, separator).trim() !== key) {
    return undefined;
  }

  let value = withoutExport.slice(separator + 1).trim();
  const quote = value.at(0);
  if (
    (quote === '"' || quote === "'") &&
    value.endsWith(quote) &&
    value.length >= 2
  ) {
    value = value.slice(1, -1);
  }
  return value || undefined;
};

export const readEnvValue = (filePath, key) => {
  if (!existsSync(filePath)) return undefined;
  const lines = readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const value = valueFromEnvLine(line, key);
    if (value) return value;
  }
  return undefined;
};

export const projectRefFromSupabaseUrl = (urlValue) => {
  let url;
  try {
    url = new URL(urlValue);
  } catch {
    throw new ReleaseVerificationError(
      "The production frontend Supabase URL is not a valid URL.",
    );
  }

  if (url.protocol !== "https:") {
    throw new ReleaseVerificationError(
      "The production frontend Supabase URL must use HTTPS.",
    );
  }

  const hostname = url.hostname.toLowerCase();
  const suffix = [".supabase.co", ".supabase.in"].find((candidate) =>
    hostname.endsWith(candidate),
  );
  if (!suffix) {
    throw new ReleaseVerificationError(
      "The production frontend Supabase URL must use a hosted Supabase project URL.",
    );
  }

  const projectRef = hostname.slice(0, -suffix.length);
  if (!PROJECT_REF_PATTERN.test(projectRef) || projectRef.includes(".")) {
    throw new ReleaseVerificationError(
      "The production frontend Supabase URL has an invalid project reference.",
    );
  }
  return projectRef;
};

const validProjectRef = (value) =>
  typeof value === "string" && PROJECT_REF_PATTERN.test(value.trim());

export const resolveFrontendProjectRef = ({ cwd = process.cwd(), env = process.env } = {}) => {
  const configuredUrl =
    env[SUPABASE_URL_KEY]?.trim() ||
    readEnvValue(join(cwd, ".vercel", ".env.production.local"), SUPABASE_URL_KEY) ||
    readEnvValue(join(cwd, ".env.production.local"), SUPABASE_URL_KEY);

  if (!configuredUrl) {
    throw new ReleaseVerificationError(
      "The production frontend Supabase target is unavailable. Run this after Vercel production configuration has been pulled.",
    );
  }
  return projectRefFromSupabaseUrl(configuredUrl);
};

const linkedRefs = ({ cwd, env }) => {
  const refs = [];
  if (env.SUPABASE_PROJECT_REF?.trim()) refs.push(env.SUPABASE_PROJECT_REF.trim());

  const projectRefFile = join(cwd, "supabase", ".temp", "project-ref");
  if (existsSync(projectRefFile)) {
    const ref = readFileSync(projectRefFile, "utf8").trim();
    if (ref) refs.push(ref);
  }

  const linkedProjectFile = join(cwd, "supabase", ".temp", "linked-project.json");
  if (existsSync(linkedProjectFile)) {
    try {
      const linkedProject = JSON.parse(readFileSync(linkedProjectFile, "utf8"));
      if (typeof linkedProject.ref === "string" && linkedProject.ref.trim()) {
        refs.push(linkedProject.ref.trim());
      }
    } catch {
      throw new ReleaseVerificationError(
        "The linked Supabase project metadata is unreadable.",
      );
    }
  }
  return refs;
};

export const resolveLinkedProjectRef = ({ cwd = process.cwd(), env = process.env } = {}) => {
  const refs = linkedRefs({ cwd, env });
  if (!refs.length || refs.some((ref) => !validProjectRef(ref))) {
    throw new ReleaseVerificationError(
      "No valid linked Supabase project reference is available for migration verification.",
    );
  }
  if (new Set(refs.map((ref) => ref.toLowerCase())).size !== 1) {
    throw new ReleaseVerificationError(
      "The linked Supabase project references do not agree.",
    );
  }
  return refs[0];
};

export const migrationDiscrepancies = (payload) => {
  if (!payload || !Array.isArray(payload.migrations)) {
    throw new ReleaseVerificationError(
      "The linked Supabase migration status has an unexpected format.",
    );
  }

  return payload.migrations.reduce((discrepancies, migration) => {
    const local = typeof migration?.local === "string" ? migration.local.trim() : "";
    const remote = typeof migration?.remote === "string" ? migration.remote.trim() : "";

    if (local && remote && local === remote) return discrepancies;
    if (!local && remote) discrepancies.remoteOnly += 1;
    else if (local && !remote) discrepancies.localOnly += 1;
    else discrepancies.mismatched += 1;
    return discrepancies;
  }, { localOnly: 0, remoteOnly: 0, mismatched: 0 });
};

/**
 * @param {{
 *   cwd?: string;
 *   env?: NodeJS.ProcessEnv;
 *   run?: (file: string, args: string[], options: object) => string;
 * }} options
 */
export const readLinkedMigrationStatus = ({
  cwd = process.cwd(),
  env = process.env,
  run = execFileSync,
} = {}) => {
  const cliPath = join(cwd, "node_modules", ".bin", process.platform === "win32" ? "supabase.cmd" : "supabase");
  let output;
  try {
    output = run(
      cliPath,
      ["migration", "list", "--linked", "--output-format", "json", "--log-level", "error"],
      {
        cwd,
        env,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
  } catch {
    throw new ReleaseVerificationError(
      "Could not read the linked Supabase migration status.",
    );
  }

  try {
    return JSON.parse(output);
  } catch {
    throw new ReleaseVerificationError(
      "The linked Supabase migration status has an unexpected format.",
    );
  }
};

/**
 * @param {{
 *   cwd?: string;
 *   env?: NodeJS.ProcessEnv;
 *   run?: (file: string, args: string[], options: object) => string;
 * }} options
 */
export const verifySupabaseRelease = ({ cwd = process.cwd(), env = process.env, run } = {}) => {
  const frontendProjectRef = resolveFrontendProjectRef({ cwd, env });
  const linkedProjectRef = resolveLinkedProjectRef({ cwd, env });
  if (frontendProjectRef.toLowerCase() !== linkedProjectRef.toLowerCase()) {
    throw new ReleaseVerificationError(
      "The production frontend Supabase target does not match the linked migration project.",
    );
  }

  const status = readLinkedMigrationStatus({ cwd, env, ...(run ? { run } : {}) });
  const discrepancies = migrationDiscrepancies(status);
  if (Object.values(discrepancies).some((count) => count > 0)) {
    throw new ReleaseVerificationError(
      "The linked Supabase migration history differs from the local migration files. Apply or repair migrations before deployment.",
    );
  }
};

const invokedDirectly =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  try {
    verifySupabaseRelease();
    console.log("Supabase release verification passed.");
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Supabase release verification failed.";
    console.error(`Supabase release verification failed: ${message}`);
    process.exitCode = 1;
  }
}
