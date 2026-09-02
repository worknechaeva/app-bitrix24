import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { StoredBitrix24DirectoryCredentialProvider } from "@/server/credentials/bitrix24-directory-credential-provider";

describe("Bitrix24 production directory boundary", () => {
  it("binds stored credentials to the server actor and does not refresh an expired token", async () => {
    const service = {
      resolve: vi.fn().mockResolvedValue({
        outcome: "active",
        accessToken: "access",
        refreshToken: "refresh",
        clientEndpoint: "https://portal.example/rest/",
        accessTokenExpiresAt: "2026-01-01T00:00:00.000Z",
        tokenVersion: 1,
      }),
      rotate: vi.fn(),
    };
    const provider = new StoredBitrix24DirectoryCredentialProvider(
      service as never,
      { portalInstallationId: 1, profileId: "018f47a7-7c60-7a31-8f6a-27f4bb596f5a" },
      () => Date.parse("2026-01-02T00:00:00.000Z"),
    );
    await expect(provider.resolve()).rejects.toMatchObject({ code: "unauthorized" });
    expect(service.resolve).toHaveBeenCalledWith({
      portalInstallationId: 1,
      profileId: "018f47a7-7c60-7a31-8f6a-27f4bb596f5a",
    });
    expect(service.rotate).not.toHaveBeenCalled();
  });

  it("keeps transport, credentials and composition server-only with no arbitrary browser method", () => {
    for (const file of [
      "src/integrations/bitrix24/directory-client.ts",
      "src/integrations/bitrix24/live-directory-client.ts",
      "src/server/credentials/bitrix24-directory-credential-provider.ts",
      "src/server/directory/production-directory.ts",
    ]) {
      expect(readFileSync(resolve(file), "utf8")).toMatch(/^import "server-only";/);
    }
    const contract = readFileSync(resolve("src/integrations/bitrix24/directory-client.ts"), "utf8");
    expect(contract).not.toContain("accessToken");
    expect(contract).not.toContain("clientEndpoint");
    expect(contract).not.toContain("method:");
    const composition = readFileSync(resolve("src/server/directory/production-directory.ts"), "utf8");
    expect(composition).not.toContain("process.env");
    expect(composition).toContain("createSupabaseBitrix24CredentialRepository");
  });
});
