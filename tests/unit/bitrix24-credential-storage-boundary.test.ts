import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Bitrix24 credential persistence boundary", () => {
  it("keeps credential modules server-only and the privileged gateway narrow", () => {
    const gateway = readFileSync(resolve("src/server/database/supabase-privileged-gateway.ts"), "utf8");
    const repository = readFileSync(
      resolve("src/server/credentials/supabase-bitrix24-credential-repository.ts"),
      "utf8",
    );
    const service = readFileSync(resolve("src/server/credentials/bitrix24-credential-service.ts"), "utf8");
    const crypto = readFileSync(resolve("src/server/credentials/bitrix24-credential-crypto.ts"), "utf8");

    for (const source of [gateway, repository, service, crypto]) {
      expect(source.startsWith('import "server-only"')).toBe(true);
    }
    expect(repository).not.toContain("createClient(");
    expect(gateway).not.toMatch(/export\s+(?:const|function)\s+createPrivilegedClient/);
    expect(gateway).not.toMatch(/export\s+(?:const|function)\s+(?:query|rpc|from)\b/);
    expect(repository).not.toMatch(/accessToken:\s*string|refreshToken:\s*string|encryptionKey/);
  });
});
