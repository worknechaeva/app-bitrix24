import { z } from "zod";
import { taskFileMetadataSchema } from "./files";

export const taskFormSchema = z.object({
  idempotencyKey: z.uuid("Не удалось подготовить безопасный идентификатор"),
  projectId: z.string().min(1, "Выберите проект"),
  title: z.string().trim().min(2, "Введите название задачи").max(200, "Не более 200 символов"),
  responsibleId: z.string(),
  deadline: z.union([z.literal(""), z.iso.date("Укажите корректную дату")]),
  description: z.string().trim().max(5000, "Не более 5000 символов"),
  additionalTags: z.string().max(500, "Слишком длинный список тегов"),
  mockScenario: z.enum(["success", "error", "timeout"]),
});

export type TaskFormValues = z.infer<typeof taskFormSchema>;

export const taskCreateRequestSchema = taskFormSchema.extend({
  files: z.array(taskFileMetadataSchema),
});

export type TaskCreateRequest = z.infer<typeof taskCreateRequestSchema>;
