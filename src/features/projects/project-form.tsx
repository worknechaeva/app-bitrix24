"use client";

import { Loader2 } from "lucide-react";
import { FormEvent, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { saveProjectAction } from "./actions";
import type { Project } from "./schema";

type Employee = { id: string; name: string };

type ProjectFormProps = {
  project?: Project;
  employees: readonly Employee[];
  onSaved: (projects: Project[], message: string) => void;
  onCancel: () => void;
};

export function ProjectForm({ project, employees, onSaved, onCancel }: ProjectFormProps) {
  const [responsibleId, setResponsibleId] = useState(project?.defaultResponsibleId ?? employees[0]?.id ?? "");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string>();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage(undefined);
    setFieldErrors({});
    const formData = new FormData(event.currentTarget);
    const result = await saveProjectAction({
      id: project?.id,
      name: formData.get("name"),
      websiteUrl: formData.get("websiteUrl"),
      bitrixGroupId: formData.get("bitrixGroupId"),
      bitrixGroupName: formData.get("bitrixGroupName"),
      requiredTag: formData.get("requiredTag"),
      defaultResponsibleId: responsibleId,
      active: formData.get("active") === "on",
    });
    setPending(false);
    if (result.status === "success") onSaved(result.projects, result.message);
    else {
      setMessage(result.message);
      setFieldErrors(result.fieldErrors ?? {});
    }
  }

  function errorFor(field: string) {
    const message = fieldErrors[field]?.[0];
    return message ? (
      <p className="text-destructive mt-1 text-sm" role="alert">
        {message}
      </p>
    ) : null;
  }

  return (
    <Card className="border-primary/20 mb-6 shadow-sm" data-testid="project-form">
      <CardHeader>
        <CardTitle>{project ? `Редактировать «${project.name}»` : "Новый проект"}</CardTitle>
        <CardDescription>Настройки сохраняются в памяти mock-сервера до его перезапуска.</CardDescription>
      </CardHeader>
      <CardContent>
        {message ? (
          <Alert variant="destructive" className="mb-5">
            <AlertTitle>Проект не сохранен</AlertTitle>
            <AlertDescription>{message}</AlertDescription>
          </Alert>
        ) : null}
        <form onSubmit={onSubmit} className="grid gap-5 sm:grid-cols-2" noValidate>
          <div>
            <Label htmlFor="project-name">Название *</Label>
            <Input id="project-name" name="name" defaultValue={project?.name} className="mt-2 min-h-12" />
            {errorFor("name")}
          </div>
          <div>
            <Label htmlFor="project-website">Адрес сайта</Label>
            <Input
              id="project-website"
              name="websiteUrl"
              type="url"
              placeholder="https://example.ru"
              defaultValue={project?.websiteUrl}
              className="mt-2 min-h-12"
            />
            {errorFor("websiteUrl")}
          </div>
          <div>
            <Label htmlFor="project-group-id">ID рабочей группы Bitrix24 *</Label>
            <Input
              id="project-group-id"
              name="bitrixGroupId"
              defaultValue={project?.bitrixGroupId}
              className="mt-2 min-h-12"
            />
            {errorFor("bitrixGroupId")}
          </div>
          <div>
            <Label htmlFor="project-group-name">Название рабочей группы *</Label>
            <Input
              id="project-group-name"
              name="bitrixGroupName"
              defaultValue={project?.bitrixGroupName}
              className="mt-2 min-h-12"
            />
            {errorFor("bitrixGroupName")}
          </div>
          <div>
            <Label htmlFor="project-tag">Обязательный тег *</Label>
            <Input
              id="project-tag"
              name="requiredTag"
              defaultValue={project?.requiredTag}
              className="mt-2 min-h-12"
            />
            {errorFor("requiredTag")}
          </div>
          <div>
            <Label htmlFor="project-responsible">Ответственный по умолчанию *</Label>
            <Select value={responsibleId} onValueChange={setResponsibleId}>
              <SelectTrigger id="project-responsible" className="mt-2 min-h-12 w-full">
                <SelectValue placeholder="Выберите сотрудника" />
              </SelectTrigger>
              <SelectContent>
                {employees.map((employee) => (
                  <SelectItem key={employee.id} value={employee.id}>
                    {employee.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errorFor("defaultResponsibleId")}
          </div>
          <label className="flex min-h-12 items-center gap-3 sm:col-span-2">
            <input
              type="checkbox"
              name="active"
              defaultChecked={project?.active ?? true}
              className="size-5 rounded border"
            />
            <span className="text-sm font-medium">Проект активен</span>
          </label>
          <div className="flex flex-col-reverse gap-3 sm:col-span-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="ghost" className="min-h-11" onClick={onCancel}>
              Отмена
            </Button>
            <Button type="submit" className="min-h-11" disabled={pending}>
              {pending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
              {project ? "Сохранить проект" : "Добавить проект"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
