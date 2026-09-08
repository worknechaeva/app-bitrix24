import "server-only";
import { z } from "zod";
import { validateAppSessionTokenHash } from "@/server/auth/app-session-repository";
import {
  listLauncherProjectsRpc,
  saveLauncherProjectRpc,
  setLauncherProjectArchivedRpc,
  type LauncherProjectRpcTransport,
  type LauncherProjectListArguments,
  type LauncherProjectSaveArguments,
  type LauncherProjectArchiveArguments,
} from "@/server/database/supabase-privileged-gateway";
import type { LiveProjectRepository, ProjectMutation, VerifiedProjectInput } from "./project-repository";

const rowSchema = z
  .object({
    id: z.uuid(),
    owner_profile_id: z.uuid(),
    name: z.string(),
    website_url: z.string().nullable(),
    bitrix_entity_id: z.string(),
    bitrix_entity_type: z.enum(["group", "project", "scrum"]),
    bitrix_entity_title: z.string(),
    required_tag: z.string(),
    default_responsible_id: z.string(),
    archived_at: z.iso.datetime({ offset: true }).nullable(),
    created_at: z.iso.datetime({ offset: true }),
    updated_at: z.iso.datetime({ offset: true }),
    can_edit: z.boolean(),
    can_archive: z.boolean(),
  })
  .strict();
const mutationSchema = z
  .array(
    z
      .object({
        outcome: z.enum([
          "created",
          "updated",
          "archived",
          "restored",
          "unchanged",
          "unauthorized",
          "not_found",
          "forbidden",
        ]),
        project_id: z.uuid().nullable(),
      })
      .strict(),
  )
  .length(1);

export class ProjectStorageError extends Error {
  readonly code = "project_storage_failure";
}

export class SupabaseProjectRepository implements LiveProjectRepository {
  constructor(
    private readonly listRpc: LauncherProjectRpcTransport<LauncherProjectListArguments>,
    private readonly saveRpc: LauncherProjectRpcTransport<LauncherProjectSaveArguments>,
    private readonly archiveRpc: LauncherProjectRpcTransport<LauncherProjectArchiveArguments>,
  ) {}
  async listVisible(actorSessionTokenHash: string) {
    const hash = validateAppSessionTokenHash(actorSessionTokenHash);
    const response = await this.safe(() => this.listRpc({ p_actor_session_token_hash: hash }));
    const parsed = z.array(rowSchema).safeParse(response.data);
    if (response.error !== null || !parsed.success) throw new ProjectStorageError();
    return parsed.data.map((row) => ({
      id: row.id,
      ownerProfileId: row.owner_profile_id,
      name: row.name,
      websiteUrl: row.website_url ?? "",
      bitrixEntityId: row.bitrix_entity_id,
      bitrixEntityType: row.bitrix_entity_type,
      bitrixEntityTitle: row.bitrix_entity_title,
      requiredTag: row.required_tag,
      defaultResponsibleId: row.default_responsible_id,
      archived: row.archived_at !== null,
      canEdit: row.can_edit,
      canArchive: row.can_archive,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }
  async save(
    actorSessionTokenHash: string,
    id: string | null,
    input: VerifiedProjectInput,
    creationOperationKey: string | null,
  ) {
    const response = await this.safe(() =>
      this.saveRpc({
        p_actor_session_token_hash: validateAppSessionTokenHash(actorSessionTokenHash),
        p_project_id: id,
        p_creation_operation_key: creationOperationKey === null ? null : z.uuid().parse(creationOperationKey),
        p_name: input.name,
        p_website_url: input.websiteUrl,
        p_bitrix_entity_id: input.bitrixEntityId,
        p_bitrix_entity_type: input.bitrixEntityType,
        p_bitrix_entity_title: input.bitrixEntityTitle,
        p_required_tag: input.requiredTag,
        p_default_responsible_id: input.defaultResponsibleId,
      }),
    );
    return this.parseMutation(response);
  }
  async setArchived(actorSessionTokenHash: string, id: string, archived: boolean) {
    const response = await this.safe(() =>
      this.archiveRpc({
        p_actor_session_token_hash: validateAppSessionTokenHash(actorSessionTokenHash),
        p_project_id: id,
        p_archived: archived,
      }),
    );
    return this.parseMutation(response);
  }
  private parseMutation(response: { data: unknown; error: unknown }): ProjectMutation {
    const parsed = mutationSchema.safeParse(response.data);
    if (response.error !== null || !parsed.success) throw new ProjectStorageError();
    return { outcome: parsed.data[0].outcome, projectId: parsed.data[0].project_id };
  }
  private async safe<T>(call: () => Promise<T>): Promise<T> {
    try {
      return await call();
    } catch {
      throw new ProjectStorageError();
    }
  }
}

export function createSupabaseProjectRepository(): LiveProjectRepository {
  return new SupabaseProjectRepository(
    listLauncherProjectsRpc,
    saveLauncherProjectRpc,
    setLauncherProjectArchivedRpc,
  );
}
