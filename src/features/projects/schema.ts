import { z } from "zod";

const optionalWebsiteSchema = z
  .string()
  .trim()
  .max(2048, "Не более 2048 символов")
  .refine((value) => {
    if (value === "") return true;
    const parsed = z.url().safeParse(value);
    return parsed.success && ["http:", "https:"].includes(new URL(value).protocol);
  }, "Укажите адрес с http:// или https://");

export const projectFormSchema = z
  .object({
    id: z.string().trim().optional(),
    name: z.string().trim().min(2, "Введите название проекта").max(120, "Не более 120 символов"),
    websiteUrl: optionalWebsiteSchema,
    bitrixEntityId: z
      .string()
      .trim()
      .regex(/^[1-9][0-9]{0,63}$/, "Выберите проект Bitrix24"),
    requiredTag: z.string().trim().min(1, "Укажите обязательный тег").max(100, "Не более 100 символов"),
    defaultResponsibleId: z
      .string()
      .trim()
      .regex(/^[1-9][0-9]{0,63}$/, "Выберите ответственного"),
  })
  .strict();

export type ProjectFormValues = z.infer<typeof projectFormSchema>;
export type Project = Omit<ProjectFormValues, "id"> & {
  id: string;
  ownerProfileId: string;
  bitrixEntityType: "group" | "project" | "scrum";
  bitrixEntityTitle: string;
  archived: boolean;
  canEdit: boolean;
  canArchive: boolean;
  createdAt?: string;
  updatedAt?: string;
};
export type ProjectActor = { profileId: string; role: "editor" | "administrator" };
