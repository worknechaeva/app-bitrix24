import { z } from "zod";

const optionalWebsiteSchema = z
  .string()
  .trim()
  .refine(
    (value) => value === "" || z.url().safeParse(value).success,
    "Укажите полный адрес с http:// или https://",
  );

export const projectFormSchema = z.object({
  id: z.string().trim().optional(),
  name: z.string().trim().min(2, "Введите название проекта").max(120, "Не более 120 символов"),
  websiteUrl: optionalWebsiteSchema,
  bitrixGroupId: z.string().trim().min(1, "Укажите ID рабочей группы").max(40, "Не более 40 символов"),
  bitrixGroupName: z
    .string()
    .trim()
    .min(2, "Введите название рабочей группы")
    .max(160, "Не более 160 символов"),
  requiredTag: z.string().trim().min(1, "Укажите обязательный тег").max(100, "Не более 100 символов"),
  defaultResponsibleId: z.string().trim().min(1, "Выберите ответственного"),
  active: z.boolean(),
});

export type ProjectFormValues = z.infer<typeof projectFormSchema>;
export type Project = ProjectFormValues & { id: string };
