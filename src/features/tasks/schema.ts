import { z } from "zod";

const estimateSchema = z
  .string()
  .trim()
  .refine((value) => value === "" || /^\d+(?:[.,]\d{1,2})?$/.test(value), "Укажите число часов")
  .refine((value) => {
    if (value === "") return true;
    const hours = Number(value.replace(",", "."));
    return hours >= 0.25 && hours <= 999 && hours * 4 === Math.round(hours * 4);
  }, "Используйте шаг 0,25 часа");

export const taskFormSchema = z.object({
  idempotencyKey: z.uuid("Не удалось подготовить безопасный идентификатор"),
  projectId: z.string().min(1, "Выберите проект"),
  title: z.string().trim().min(2, "Введите название задачи").max(200, "Не более 200 символов"),
  responsibleId: z.string(),
  deadline: z.string(),
  description: z.string().trim().max(5000, "Не более 5000 символов"),
  priority: z.enum(["default", "low", "medium", "high"]),
  estimateHours: estimateSchema,
  additionalTags: z.string().max(500, "Слишком длинный список тегов"),
  mockScenario: z.enum(["success", "error", "timeout"]),
});

export type TaskFormValues = z.infer<typeof taskFormSchema>;
