import { describe, expect, it, vi } from "vitest";
import { SupabaseProjectRepository } from "@/server/repositories/supabase-project-repository";
const hash = "a".repeat(64);
const row = {
  id: "11111111-1111-4111-8111-111111111111",
  owner_profile_id: "22222222-2222-4222-8222-222222222222",
  name: "Проект",
  website_url: null,
  bitrix_entity_id: "77",
  bitrix_entity_type: "project",
  bitrix_entity_title: "Разработка",
  required_tag: "site.ru",
  default_responsible_id: "101",
  archived_at: null,
  created_at: "2026-09-08T20:00:00.000Z",
  updated_at: "2026-09-08T20:00:00.000Z",
  can_edit: true,
  can_archive: true,
};
describe("SupabaseProjectRepository", () => {
  it("maps safe RPC rows and sends only a session hash", async () => {
    const list = vi.fn().mockResolvedValue({ data: [row], error: null });
    const save = vi
      .fn()
      .mockResolvedValue({ data: [{ outcome: "created", project_id: row.id }], error: null });
    const archive = vi
      .fn()
      .mockResolvedValue({ data: [{ outcome: "archived", project_id: row.id }], error: null });
    const repository = new SupabaseProjectRepository(list, save, archive);
    await expect(repository.listVisible(hash)).resolves.toMatchObject([{ name: "Проект", archived: false }]);
    const operationKey = "33333333-3333-4333-8333-333333333333";
    await repository.save(
      hash,
      null,
      {
        name: "Проект",
        websiteUrl: "",
        bitrixEntityId: "77",
        bitrixEntityType: "project",
        bitrixEntityTitle: "Разработка",
        requiredTag: "site.ru",
        defaultResponsibleId: "101",
      },
      operationKey,
    );
    expect(save.mock.calls[0][0]).toMatchObject({
      p_actor_session_token_hash: hash,
      p_project_id: null,
      p_creation_operation_key: operationKey,
    });
    expect(JSON.stringify(save.mock.calls[0][0])).not.toMatch(/accessToken|profileId|ownerProfileId/);
  });
  it("fails closed on malformed storage data", async () => {
    const repository = new SupabaseProjectRepository(
      vi.fn().mockResolvedValue({ data: [{ ...row, can_edit: "yes" }], error: null }),
      vi.fn(),
      vi.fn(),
    );
    await expect(repository.listVisible(hash)).rejects.toMatchObject({ code: "project_storage_failure" });
  });
});
