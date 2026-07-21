import "server-only";

import {
  isSupportedTaskFile,
  MAX_TASK_FILES,
  MAX_TASK_FILE_SIZE_BYTES,
  taskFileMetadataInputSchema,
  taskFileMetadataSchema,
  type TaskFileMetadata,
} from "@/features/tasks/files";

export class TaskFileValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TaskFileValidationError";
  }
}

export interface TaskFileStore {
  prepare(files: readonly unknown[]): Promise<TaskFileMetadata[]>;
}

export class MockTaskFileStore implements TaskFileStore {
  async prepare(files: readonly unknown[]) {
    if (files.length > MAX_TASK_FILES) {
      throw new TaskFileValidationError(`Можно прикрепить не более ${MAX_TASK_FILES} файлов`);
    }

    return files.map((file) => {
      const parsed = taskFileMetadataInputSchema.safeParse(file);
      if (!parsed.success) {
        throw new TaskFileValidationError("Некорректные данные файла");
      }
      if (parsed.data.size > MAX_TASK_FILE_SIZE_BYTES) {
        throw new TaskFileValidationError(`Файл «${parsed.data.name}» больше 20 МБ`);
      }
      if (!isSupportedTaskFile(parsed.data)) {
        throw new TaskFileValidationError(`Формат файла «${parsed.data.name}» не поддерживается`);
      }
      return taskFileMetadataSchema.parse(parsed.data);
    });
  }
}

export const taskFileStore: TaskFileStore = new MockTaskFileStore();
