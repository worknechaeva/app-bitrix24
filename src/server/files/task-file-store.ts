import "server-only";

import {
  isSupportedTaskFile,
  MAX_TASK_FILES,
  MAX_TASK_FILE_SIZE_BYTES,
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
  prepare(files: readonly File[]): Promise<TaskFileMetadata[]>;
}

export class MockTaskFileStore implements TaskFileStore {
  async prepare(files: readonly File[]) {
    if (files.length > MAX_TASK_FILES) {
      throw new TaskFileValidationError(`Можно прикрепить не более ${MAX_TASK_FILES} файлов`);
    }

    return files.map((file) => {
      if (file.size > MAX_TASK_FILE_SIZE_BYTES) {
        throw new TaskFileValidationError(`Файл «${file.name}» больше 20 МБ`);
      }
      if (!isSupportedTaskFile(file)) {
        throw new TaskFileValidationError(`Формат файла «${file.name}» не поддерживается`);
      }
      return taskFileMetadataSchema.parse({ name: file.name, size: file.size, type: file.type });
    });
  }
}

export const taskFileStore: TaskFileStore = new MockTaskFileStore();
