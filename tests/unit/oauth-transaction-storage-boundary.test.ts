import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("OAuth transaction storage boundary", () => {
  it("keeps the privileged gateway server-only and out of browser-facing modules", () => {
    const gateway = readFileSync(resolve("src/server/database/supabase-privileged-gateway.ts"), "utf8");
    const repository = readFileSync(
      resolve("src/server/oauth/supabase-oauth-transaction-repository.ts"),
      "utf8",
    );

    expect(gateway.startsWith('import "server-only"')).toBe(true);
    expect(repository.startsWith('import "server-only"')).toBe(true);
    expect(repository).not.toContain("createClient(");
    expect(gateway).not.toMatch(/export\s+(?:const|function)\s+createPrivilegedClient/);
  });
});
