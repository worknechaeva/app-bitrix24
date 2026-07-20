import "server-only";

import type { Project, ProjectFormValues } from "@/features/projects/schema";
import { INITIAL_PROJECTS } from "@/server/fixtures";
import type { ProjectRepository } from "./project-repository";

export class MockProjectRepository implements ProjectRepository {
  private readonly projects = new Map<string, Project>();

  constructor(initialProjects: readonly Project[] = INITIAL_PROJECTS) {
    for (const project of initialProjects) this.projects.set(project.id, structuredClone(project));
  }

  async listAll() {
    return [...this.projects.values()].map((project) => structuredClone(project));
  }

  async listActive() {
    return (await this.listAll()).filter((project) => project.active);
  }

  async findById(id: string) {
    const project = this.projects.get(id);
    return project ? structuredClone(project) : undefined;
  }

  async create(input: Omit<ProjectFormValues, "id">) {
    const project: Project = { ...structuredClone(input), id: crypto.randomUUID() };
    this.projects.set(project.id, project);
    return structuredClone(project);
  }

  async update(id: string, input: Omit<ProjectFormValues, "id">) {
    if (!this.projects.has(id)) return undefined;
    const project: Project = { ...structuredClone(input), id };
    this.projects.set(id, project);
    return structuredClone(project);
  }

  async setActive(id: string, active: boolean) {
    const project = this.projects.get(id);
    if (!project) return undefined;
    const updated = { ...project, active };
    this.projects.set(id, updated);
    return structuredClone(updated);
  }

  reset() {
    this.projects.clear();
    for (const project of INITIAL_PROJECTS) this.projects.set(project.id, structuredClone(project));
  }
}

const repository = new MockProjectRepository();

export function getProjectRepository(): ProjectRepository {
  return repository;
}

export function resetMockProjects() {
  repository.reset();
}
