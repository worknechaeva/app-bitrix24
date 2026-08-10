import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("app session storage boundary", () => {
  it("keeps session modules server-only and the gateway narrow", () => {
    const gateway = readFileSync(resolve("src/server/database/supabase-privileged-gateway.ts"), "utf8");
    const repository = readFileSync(resolve("src/server/auth/supabase-app-session-repository.ts"), "utf8");
    const service = readFileSync(resolve("src/server/auth/app-session-service.ts"), "utf8");

    expect(gateway.startsWith('import "server-only"')).toBe(true);
    expect(repository.startsWith('import "server-only"')).toBe(true);
    expect(service.startsWith('import "server-only"')).toBe(true);
    expect(repository).not.toContain("createClient(");
    expect(gateway).not.toMatch(/export\s+(?:const|function)\s+createPrivilegedClient/);
    expect(gateway).not.toMatch(/export\s+(?:const|function)\s+(?:query|rpc|from)\b/);
  });
});
