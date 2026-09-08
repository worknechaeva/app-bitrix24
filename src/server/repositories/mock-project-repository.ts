import "server-only";
import type { Project, ProjectActor } from "@/features/projects/schema";
import { INITIAL_PROJECTS } from "@/server/fixtures";
import type { ProjectRepository, VerifiedProjectInput } from "./project-repository";

export class MockProjectRepository implements ProjectRepository {
  private readonly projects = new Map<string, Project>();
  private readonly createOperations = new Map<string, { projectId: string; input: VerifiedProjectInput }>();
  private readonly audit: Array<{
    projectId: string;
    actorProfileId: string;
    action: "archived" | "restored";
  }> = [];
  constructor(initialProjects: readonly Project[] = INITIAL_PROJECTS) {
    this.reset(initialProjects);
  }
  async listVisible(actor: ProjectActor) {
    return [...this.projects.values()]
      .filter((p) => actor.role === "administrator" || p.ownerProfileId === actor.profileId)
      .map((p) => ({
        ...structuredClone(p),
        canEdit: p.ownerProfileId === actor.profileId,
        canArchive: p.ownerProfileId === actor.profileId || actor.role === "administrator",
      }));
  }
  async findAccessible(actor: ProjectActor, id: string) {
    return (await this.listVisible(actor)).find((p) => p.id === id);
  }
  async create(actor: ProjectActor, input: VerifiedProjectInput, creationOperationKey: string) {
    const operationIdentity = `${actor.profileId}:${creationOperationKey}`;
    const existing = this.createOperations.get(operationIdentity);
    if (existing) {
      return {
        outcome: sameCreateRequest(existing.input, input) ? ("unchanged" as const) : ("forbidden" as const),
        projectId: existing.projectId,
      };
    }
    const project: Project = {
      ...structuredClone(input),
      id: crypto.randomUUID(),
      ownerProfileId: actor.profileId,
      archived: false,
      canEdit: true,
      canArchive: true,
    };
    this.projects.set(project.id, project);
    this.createOperations.set(operationIdentity, {
      projectId: project.id,
      input: structuredClone(input),
    });
    return { outcome: "created" as const, projectId: project.id };
  }
  async update(actor: ProjectActor, id: string, input: VerifiedProjectInput) {
    const current = this.projects.get(id);
    if (!current || current.ownerProfileId !== actor.profileId) return undefined;
    const project = { ...current, ...structuredClone(input) };
    this.projects.set(id, project);
    return structuredClone(project);
  }
  async setArchived(actor: ProjectActor, id: string, archived: boolean) {
    const project = this.projects.get(id);
    if (!project) return { outcome: "not_found" as const, projectId: null };
    if (project.ownerProfileId !== actor.profileId && actor.role !== "administrator")
      return { outcome: "forbidden" as const, projectId: id };
    if (project.archived === archived) return { outcome: "unchanged" as const, projectId: id };
    this.projects.set(id, { ...project, archived });
    this.audit.push({
      projectId: id,
      actorProfileId: actor.profileId,
      action: archived ? "archived" : "restored",
    });
    return { outcome: archived ? ("archived" as const) : ("restored" as const), projectId: id };
  }
  listAuditEvents() {
    return structuredClone(this.audit);
  }
  reset(initialProjects: readonly Project[] = INITIAL_PROJECTS) {
    this.projects.clear();
    this.createOperations.clear();
    this.audit.length = 0;
    for (const p of initialProjects) this.projects.set(p.id, structuredClone(p));
  }
}

function sameCreateRequest(left: VerifiedProjectInput, right: VerifiedProjectInput) {
  return (
    left.name === right.name &&
    left.websiteUrl === right.websiteUrl &&
    left.bitrixEntityId === right.bitrixEntityId &&
    left.requiredTag === right.requiredTag &&
    left.defaultResponsibleId === right.defaultResponsibleId
  );
}
const repository = new MockProjectRepository();
export function getProjectRepository(): ProjectRepository {
  return repository;
}
export function resetMockProjects() {
  repository.reset();
}
