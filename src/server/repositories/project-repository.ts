import "server-only";

import type { Project, ProjectFormValues } from "@/features/projects/schema";

export interface ProjectRepository {
  listAll(): Promise<Project[]>;
  listActive(): Promise<Project[]>;
  findById(id: string): Promise<Project | undefined>;
  create(input: Omit<ProjectFormValues, "id">): Promise<Project>;
  update(id: string, input: Omit<ProjectFormValues, "id">): Promise<Project | undefined>;
  setActive(id: string, active: boolean): Promise<Project | undefined>;
}
