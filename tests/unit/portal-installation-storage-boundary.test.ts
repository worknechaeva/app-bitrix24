import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const gatewayPath = resolve("src/server/database/supabase-privileged-gateway.ts");
const adapterPath = resolve("src/server/portal/supabase-portal-installation-repository.ts");
const profileAdapterPath = resolve("src/server/profile/supabase-profile-repository.ts");

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? sourceFiles(path) : /\.[cm]?[jt]sx?$/.test(entry.name) ? [path] : [];
  });
}

describe("portal installation storage boundary", () => {
  it("keeps the Supabase client and adapter behind explicit server-only modules", () => {
    const gateway = readFileSync(gatewayPath, "utf8");
    const adapter = readFileSync(adapterPath, "utf8");
    const profileAdapter = readFileSync(profileAdapterPath, "utf8");

    expect(gateway.startsWith('import "server-only";')).toBe(true);
    expect(adapter.startsWith('import "server-only";')).toBe(true);
    expect(profileAdapter.startsWith('import "server-only";')).toBe(true);
    expect(gateway).toContain('from "@supabase/supabase-js"');
    expect(adapter).not.toContain('from "@supabase/supabase-js"');
    expect(profileAdapter).not.toContain('from "@supabase/supabase-js"');
    expect(gateway).not.toMatch(/export\s+(?:const|let|var)\s+\w*client/i);
  });

  it("does not import the gateway, adapter, or Supabase client from browser-facing code", () => {
    const browserFacingSources = ["src/app", "src/components", "src/features"]
      .flatMap((directory) => sourceFiles(resolve(directory)))
      .map((path) => readFileSync(path, "utf8"))
      .join("\n");

    expect(browserFacingSources).not.toContain("@supabase/supabase-js");
    expect(browserFacingSources).not.toContain("supabase-privileged-gateway");
    expect(browserFacingSources).not.toContain("supabase-portal-installation-repository");
    expect(browserFacingSources).not.toContain("supabase-profile-repository");
  });
});
