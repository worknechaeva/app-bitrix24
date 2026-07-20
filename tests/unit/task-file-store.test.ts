import { describe, expect, it } from "vitest";
import { MAX_TASK_FILE_SIZE_BYTES } from "@/features/tasks/files";
import { MockTaskFileStore } from "@/server/files/task-file-store";

describe("MockTaskFileStore", () => {
  it("returns safe metadata without file contents", async () => {
    const store = new MockTaskFileStore();
    const file = new File(["private contents"], "brief.pdf", { type: "application/pdf" });
    await expect(store.prepare([file])).resolves.toEqual([
      { name: "brief.pdf", size: 16, type: "application/pdf" },
    ]);
  });

  it("rejects a file over the configured limit", async () => {
    const store = new MockTaskFileStore();
    const file = { name: "large.pdf", size: MAX_TASK_FILE_SIZE_BYTES + 1, type: "application/pdf" } as File;
    await expect(store.prepare([file])).rejects.toThrow("больше 20 МБ");
  });
});
