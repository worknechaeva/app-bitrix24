import { z } from "zod";

const PROJECT_DRAFT_KEY = "task-launcher-project-draft:v2";
const PROJECT_DRAFT_TTL_MS = 15 * 60 * 1000;

const projectDraftSchema = z
  .object({
    actorProfileId: z.string().trim().min(1).max(128),
    projectId: z.string().trim().min(1).max(128).nullable(),
    creationOperationKey: z.uuid().nullable(),
    name: z.string(),
    websiteUrl: z.string(),
    requiredTag: z.string(),
    bitrixEntityId: z.string(),
    defaultResponsibleId: z.string(),
    savedAt: z.number().int().nonnegative(),
  })
  .strict();

export type ProjectDraft = z.infer<typeof projectDraftSchema>;

export function saveProjectDraft(draft: Omit<ProjectDraft, "savedAt">) {
  try {
    sessionStorage.setItem(PROJECT_DRAFT_KEY, JSON.stringify({ ...draft, savedAt: Date.now() }));
  } catch {
    // OAuth navigation must remain available when browser storage is unavailable.
  }
}

export function readProjectDraft(actorProfileId: string): ProjectDraft | null {
  try {
    const raw = sessionStorage.getItem(PROJECT_DRAFT_KEY);
    if (!raw) return null;
    const parsed = projectDraftSchema.parse(JSON.parse(raw));
    if (parsed.actorProfileId !== actorProfileId || Date.now() - parsed.savedAt > PROJECT_DRAFT_TTL_MS) {
      clearProjectDraft();
      return null;
    }
    return parsed;
  } catch {
    clearProjectDraft();
    return null;
  }
}

export function clearProjectDraft() {
  try {
    sessionStorage.removeItem(PROJECT_DRAFT_KEY);
  } catch {
    // Nothing else is required when browser storage is unavailable.
  }
}
