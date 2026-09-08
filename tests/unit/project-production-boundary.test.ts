import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
describe("production project composition", () => {
  it("opens only the project page and composes persistent storage with Directory", () => {
    const actions = readFileSync(resolve("src/features/projects/actions.ts"), "utf8");
    const layout = readFileSync(resolve("src/app/(protected)/layout.tsx"), "utf8");
    const taskPage = readFileSync(resolve("src/app/(protected)/tasks/new/page.tsx"), "utf8");
    expect(actions).toContain("createSupabaseProjectRepository");
    expect(actions).toContain("createProductionBitrix24DirectoryClient");
    expect(actions).toContain("hashAppSessionToken(authority.sessionToken)");
    expect(layout).not.toContain('user.mode === "live"');
    expect(taskPage).toContain('session.mode === "live"');
  });
});
