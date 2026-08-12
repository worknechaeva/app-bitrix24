import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("profile lifecycle storage boundary", () => {
  it("keeps the privileged gateway server-only and narrow", () => {
    const gateway = readFileSync(resolve("src/server/database/supabase-privileged-gateway.ts"), "utf8");
    const repository = readFileSync(
      resolve("src/server/profile/supabase-profile-lifecycle-repository.ts"),
      "utf8",
    );
    const entrypoints = readFileSync(resolve("src/server/profile/profile-admin-entrypoints.ts"), "utf8");

    expect(gateway).toContain('import "server-only"');
    expect(gateway).not.toMatch(/export\s+(?:const|function)\s+createPrivilegedClient/);
    expect(repository).toContain('import "server-only"');
    expect(entrypoints).toContain('import "server-only"');
    expect(entrypoints).not.toContain("actorProfileId");
    expect(entrypoints).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
  });
});
