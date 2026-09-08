import { createClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";
import { AppSessionService, hashAppSessionToken } from "@/server/auth/app-session-service";
import { createSupabaseAppSessionRepository } from "@/server/auth/supabase-app-session-repository";
import { createSupabaseProfileRepository } from "@/server/profile/supabase-profile-repository";
import { createSupabaseProfileLifecycleRepository } from "@/server/profile/supabase-profile-lifecycle-repository";
import { createSupabaseProjectRepository } from "@/server/repositories/supabase-project-repository";
function env(name: "SUPABASE_URL" | "SUPABASE_SERVICE_ROLE_KEY") {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}
const client = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false },
});
const profiles = createSupabaseProfileRepository();
const lifecycle = createSupabaseProfileLifecycleRepository();
const sessions = new AppSessionService(createSupabaseAppSessionRepository());
const projects = createSupabaseProjectRepository();
const input = {
  name: "Персональный проект",
  websiteUrl: "https://project.example",
  bitrixEntityId: "77",
  bitrixEntityType: "project" as const,
  bitrixEntityTitle: "Разработка",
  requiredTag: "project.example",
  defaultResponsibleId: "101",
};
async function actor(bitrixUserId: string, role: "editor" | "administrator") {
  const profile = (
    await profiles.reconcileVerifiedEmployee({
      portalInstallationId: 1,
      user: { id: bitrixUserId, active: true, userType: "employee" },
    })
  ).profile;
  const { error } = await client.from("profiles").update({ role, is_active: true }).eq("id", profile.id);
  expect(error).toBeNull();
  const issued = await sessions.issue({ portalInstallationId: 1, profileId: profile.id });
  if (issued.outcome !== "created") throw new Error("session expected");
  return { profile, hash: hashAppSessionToken(issued.token) };
}
describe.sequential("launcher projects database", () => {
  beforeAll(async () => {
    const { error } = await client.rpc("reconcile_portal_installation", {
      p_member_id: "a".repeat(32),
      p_portal_origin: "https://portal-a.example",
    });
    expect(error).toBeNull();
  });
  it("isolates editor ownership, permits duplicates, and gives administrators read-only access", async () => {
    const editor = await actor("9701", "editor");
    const administrator = await actor("9702", "administrator");
    const first = await projects.save(editor.hash, null, input, crypto.randomUUID());
    const second = await projects.save(
      editor.hash,
      null,
      { ...input, name: "Вторая настройка" },
      crypto.randomUUID(),
    );
    expect(first.outcome).toBe("created");
    expect(second.outcome).toBe("created");
    expect(await projects.listVisible(editor.hash)).toHaveLength(2);
    expect((await projects.listVisible(administrator.hash)).length).toBeGreaterThanOrEqual(2);
    expect(
      (await projects.save(administrator.hash, first.projectId, { ...input, name: "Чужое изменение" }, null))
        .outcome,
    ).toBe("forbidden");
  });
  it("archives atomically and records only one audit event for repeated requests", async () => {
    const editor = await actor("9703", "editor");
    const created = await projects.save(editor.hash, null, input, crypto.randomUUID());
    expect(
      (
        await Promise.all(
          Array.from({ length: 6 }, () => projects.setArchived(editor.hash, created.projectId!, true)),
        )
      ).filter((r) => r.outcome === "archived"),
    ).toHaveLength(1);
    const { count, error } = await client
      .from("launcher_project_audit_events")
      .select("id", { count: "exact", head: true })
      .eq("launcher_project_id", created.projectId!);
    expect(error).toBeNull();
    expect(count).toBe(1);
    expect((await projects.listVisible(editor.hash))[0].archived).toBe(true);
  });

  it("serializes archive and restore and keeps audit aligned with the final state", async () => {
    const editor = await actor("9704", "editor");
    const created = await projects.save(editor.hash, null, input, crypto.randomUUID());
    const projectId = created.projectId!;

    await Promise.all([
      projects.setArchived(editor.hash, projectId, true),
      projects.setArchived(editor.hash, projectId, false),
    ]);

    const { data: events, error } = await client
      .from("launcher_project_audit_events")
      .select("action,created_at,id")
      .eq("launcher_project_id", projectId)
      .order("id", { ascending: true });
    expect(error).toBeNull();
    expect(events?.length).toBeGreaterThanOrEqual(1);
    expect(events?.length).toBeLessThanOrEqual(2);
    const finalProject = (await projects.listVisible(editor.hash)).find(
      (project) => project.id === projectId,
    );
    expect(finalProject?.archived).toBe(events?.at(-1)?.action === "archived");
  });

  it("serializes project mutation with actor blocking and rejects all later operations", async () => {
    const administrator = await actor("9705", "administrator");
    const editor = await actor("9706", "editor");
    const created = await projects.save(editor.hash, null, input, crypto.randomUUID());
    const projectId = created.projectId!;

    const [saveResult, blockResult] = await Promise.all([
      projects.save(editor.hash, projectId, { ...input, name: "Конкурентное изменение" }, null),
      lifecycle.block({
        actorSessionTokenHash: administrator.hash,
        targetProfileId: editor.profile.id,
      }),
    ]);
    expect(["updated", "unauthorized"]).toContain(saveResult.outcome);
    expect(blockResult.outcome).toBe("blocked");
    await expect(projects.save(editor.hash, projectId, input, null)).resolves.toMatchObject({
      outcome: "unauthorized",
    });
    await expect(projects.setArchived(editor.hash, projectId, true)).resolves.toMatchObject({
      outcome: "unauthorized",
    });
    await expect(projects.listVisible(editor.hash)).resolves.toEqual([]);
  });

  it("deduplicates concurrent creates and rejects reuse with different content", async () => {
    const administrator = await actor("9708", "administrator");
    const editor = await actor("9707", "editor");
    const operationKey = crypto.randomUUID();
    const results = await Promise.all(
      Array.from({ length: 6 }, () => projects.save(editor.hash, null, input, operationKey)),
    );
    expect(results.filter((result) => result.outcome === "created")).toHaveLength(1);
    expect(results.filter((result) => result.outcome === "unchanged")).toHaveLength(5);
    expect(new Set(results.map((result) => result.projectId)).size).toBe(1);
    await expect(
      projects.save(editor.hash, null, { ...input, name: "Другие данные" }, operationKey),
    ).resolves.toMatchObject({ outcome: "forbidden" });

    const anotherEditor = await actor("9709", "editor");
    await expect(projects.save(anotherEditor.hash, null, input, operationKey)).resolves.toMatchObject({
      outcome: "created",
    });
    await lifecycle.block({
      actorSessionTokenHash: administrator.hash,
      targetProfileId: editor.profile.id,
    });
    await expect(projects.save(editor.hash, null, input, operationKey)).resolves.toMatchObject({
      outcome: "unauthorized",
    });
  });
});
