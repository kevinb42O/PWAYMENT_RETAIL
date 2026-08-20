import { describe, expect, it } from "vitest";
import {
  ReleaseVerificationError,
  migrationDiscrepancies,
  projectRefFromSupabaseUrl,
  verifySupabaseRelease,
} from "./verify-supabase-release.mjs";

const cwdWithoutLinkedFiles = "/tmp/pwayment-supabase-release-gate";
const matchingEnvironment = {
  SUPABASE_PROJECT_REF: "abc123def",
  VITE_SUPABASE_URL: "https://abc123def.supabase.co",
};

describe("Supabase release verification", () => {
  it("extracts a project reference only from a hosted HTTPS Supabase URL", () => {
    expect(projectRefFromSupabaseUrl("https://abc123def.supabase.co")).toBe(
      "abc123def",
    );
    expect(() => projectRefFromSupabaseUrl("http://abc123def.supabase.co")).toThrow(
      ReleaseVerificationError,
    );
    expect(() => projectRefFromSupabaseUrl("https://example.test")).toThrow(
      ReleaseVerificationError,
    );
  });

  it("accepts aligned frontend, linked project and migration history", () => {
    expect(() =>
      verifySupabaseRelease({
        cwd: cwdWithoutLinkedFiles,
        env: matchingEnvironment,
        run: () =>
          JSON.stringify({
            migrations: [{ local: "20260811070147", remote: "20260811070147" }],
          }),
      }),
    ).not.toThrow();
  });

  it("blocks a mismatched frontend target before querying migrations", () => {
    expect(() =>
      verifySupabaseRelease({
        cwd: cwdWithoutLinkedFiles,
        env: {
          ...matchingEnvironment,
          VITE_SUPABASE_URL: "https://other123.supabase.co",
        },
        run: () => {
          throw new Error("must not be called");
        },
      }),
    ).toThrow("does not match");
  });

  it("reports local-only and remote-only migration rows as drift", () => {
    expect(
      migrationDiscrepancies({
        migrations: [
          { local: "20260811070147", remote: "20260811070147" },
          { local: "20260811071000", remote: "" },
          { local: "", remote: "20260811072000" },
        ],
      }),
    ).toEqual({ localOnly: 1, remoteOnly: 1, mismatched: 0 });
  });
});
