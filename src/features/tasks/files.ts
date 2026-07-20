import { z } from "zod";

export const MAX_TASK_FILE_SIZE_BYTES = 20 * 1024 * 1024;
export const MAX_TASK_FILES = 10;
export const TASK_FILE_ACCEPT = "image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.odt,.ods,.rtf,.txt";

export const taskFileMetadataSchema = z.object({
  name: z.string().min(1).max(255),
  size: z.number().int().nonnegative().max(MAX_TASK_FILE_SIZE_BYTES),
  type: z.string().max(160),
});

export type TaskFileMetadata = z.infer<typeof taskFileMetadataSchema>;

const officeExtensions = new Set([
  "pdf",
  "doc",
  "docx",
  "xls",
  "xlsx",
  "ppt",
  "pptx",
  "odt",
  "ods",
  "rtf",
  "txt",
]);

export function isSupportedTaskFile(file: Pick<File, "name" | "type">) {
  if (file.type.startsWith("image/")) return true;
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  return officeExtensions.has(extension);
}

export function formatFileSize(size: number) {
  if (size < 1024) return `${size} Б`;
  if (size < 1024 * 1024) return `${Math.ceil(size / 1024)} КБ`;
  return `${(size / (1024 * 1024)).toLocaleString("ru-RU", { maximumFractionDigits: 1 })} МБ`;
}
