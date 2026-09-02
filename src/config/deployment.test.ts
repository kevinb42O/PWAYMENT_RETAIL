import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

type VercelConfig = {
  cleanUrls: boolean;
  git: {
    deploymentEnabled: Record<string, boolean>;
  };
  headers: Array<{
    headers: Array<{ key: string; value: string }>;
    source: string;
  }>;
  rewrites: Array<{ destination: string; source: string }>;
  redirects: Array<{ destination: string; permanent: boolean; source: string }>;
  trailingSlash: boolean;
};

const config = JSON.parse(
  readFileSync("vercel.json", "utf8"),
) as VercelConfig;

describe("Vercel deployment routing", () => {
  it("allows Vercel to publish production from main", () => {
    expect(config.git.deploymentEnabled.main).toBe(true);
  });

  it("serves prerendered HTML on canonical extensionless URLs", () => {
    expect(config.cleanUrls).toBe(true);
    expect(config.trailingSlash).toBe(false);
  });

  it("falls back to the SPA only for document routes", () => {
    const spaFallback = config.rewrites.find(
      ({ destination }) => destination === "/index.html",
    );

    expect(spaFallback).toBeDefined();
    const matchesFallback = new RegExp(`^${spaFallback!.source}$`);

    for (const documentRoute of [
      "/",
      "/app",
      "/customer-display/register-1",
      "/service/public-token",
      "/legal/privacy",
    ]) {
      expect(matchesFallback.test(documentRoute), documentRoute).toBe(true);
    }

    for (const fileRoute of [
      "/assets/Profile-stale.js",
      "/assets",
      "/sw.js",
      "/manifest.webmanifest",
      "/branding/missing-logo.svg",
      "/api/pace/respond",
      "/api",
    ]) {
      expect(matchesFallback.test(fileRoute), fileRoute).toBe(false);
    }
  });

  it("revalidates documents and caches hashed assets immutably", () => {
    const headerValue = (source: string, key: string) =>
      config.headers
        .find((rule) => rule.source === source)
        ?.headers.find((header) => header.key === key)?.value;

    expect(headerValue("/index.html", "Cache-Control")).toBe("no-cache");
    expect(headerValue("/sw.js", "Cache-Control")).toBe("no-cache");
    expect(headerValue("/assets/(.*)", "Cache-Control")).toContain(
      "immutable",
    );
  });

  it("permanently consolidates duplicate public routes", () => {
    expect(config.redirects).toContainEqual({
      source: "/compare",
      destination: "/pricing",
      permanent: true,
    });
  });
});
