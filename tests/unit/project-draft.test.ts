import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearProjectDraft, readProjectDraft, saveProjectDraft } from "@/features/projects/project-draft";

const draft = {
  actorProfileId: "mock-editor",
  projectId: "forma",
  creationOperationKey: null,
  name: "Измененное название",
  websiteUrl: "https://forma.example",
  requiredTag: "forma.example",
  bitrixEntityId: "77",
  defaultResponsibleId: "102",
};

describe("project OAuth draft", () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.useRealTimers();
  });
  afterEach(() => vi.restoreAllMocks());

  it("preserves the actor and edited project identity", () => {
    saveProjectDraft(draft);
    expect(readProjectDraft("mock-editor")).toMatchObject(draft);
    clearProjectDraft();
    expect(readProjectDraft("mock-editor")).toBeNull();
  });

  it("does not expose a draft to another actor", () => {
    saveProjectDraft(draft);
    expect(readProjectDraft("mock-admin")).toBeNull();
    expect(readProjectDraft("mock-editor")).toBeNull();
  });

  it("discards an expired draft", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-08T10:00:00Z"));
    saveProjectDraft(draft);
    vi.setSystemTime(new Date("2026-09-08T10:16:00Z"));
    expect(readProjectDraft("mock-editor")).toBeNull();
  });

  it("does not block OAuth when session storage is unavailable", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Storage unavailable");
    });
    expect(() => saveProjectDraft(draft)).not.toThrow();
  });
});
