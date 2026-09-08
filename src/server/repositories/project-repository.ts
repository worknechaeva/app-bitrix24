import "server-only";
import type { Project, ProjectActor, ProjectFormValues } from "@/features/projects/schema";
export type VerifiedProjectInput = Omit<ProjectFormValues, "id" | "bitrixEntityId"> & {
  bitrixEntityId: string;
  bitrixEntityType: Project["bitrixEntityType"];
  bitrixEntityTitle: string;
};
export type ProjectMutation = {
  outcome:
    | "created"
    | "updated"
    | "archived"
    | "restored"
    | "unchanged"
    | "unauthorized"
    | "not_found"
    | "forbidden";
  projectId: string | null;
};
export interface ProjectRepository {
  listVisible(actor: ProjectActor): Promise<Project[]>;
  findAccessible(actor: ProjectActor, id: string): Promise<Project | undefined>;
  create(
    actor: ProjectActor,
    input: VerifiedProjectInput,
    creationOperationKey: string,
  ): Promise<ProjectMutation>;
  update(actor: ProjectActor, id: string, input: VerifiedProjectInput): Promise<Project | undefined>;
  setArchived(actor: ProjectActor, id: string, archived: boolean): Promise<ProjectMutation>;
}
export interface LiveProjectRepository {
  listVisible(actorSessionTokenHash: string): Promise<Project[]>;
  save(
    actorSessionTokenHash: string,
    id: string | null,
    input: VerifiedProjectInput,
    creationOperationKey: string | null,
  ): Promise<ProjectMutation>;
  setArchived(actorSessionTokenHash: string, id: string, archived: boolean): Promise<ProjectMutation>;
}
