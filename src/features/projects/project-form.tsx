"use client";

import Link from "next/link";
import { Loader2, Search } from "lucide-react";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import type { Bitrix24Employee, Bitrix24TaskEntity } from "@/integrations/bitrix24/directory-client";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { saveProjectAction, searchProjectDirectoryAction } from "./actions";
import { clearProjectDraft, readProjectDraft, saveProjectDraft } from "./project-draft";
import { employeeOptionLabel } from "./project-option-labels";
import type { Project } from "./schema";

type Props = {
  project?: Project;
  actorProfileId: string;
  entities: Bitrix24TaskEntity[];
  employees: Bitrix24Employee[];
  onSaved: (projects: Project[] | null, message: string, refreshRequired: boolean) => void;
  onCancel: () => void;
};

export function ProjectForm({
  project,
  actorProfileId,
  entities: initialEntities,
  employees: initialEmployees,
  onSaved,
  onCancel,
}: Props) {
  const formRef = useRef<HTMLFormElement>(null);
  const [creationOperationKey, setCreationOperationKey] = useState(() =>
    project ? undefined : crypto.randomUUID(),
  );
  const [entityId, setEntityId] = useState(project?.bitrixEntityId ?? "");
  const [responsibleId, setResponsibleId] = useState(project?.defaultResponsibleId ?? "");
  const [entities, setEntities] = useState(initialEntities);
  const [employees, setEmployees] = useState(initialEmployees);
  const [entityQuery, setEntityQuery] = useState("");
  const [employeeQuery, setEmployeeQuery] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string>();
  const [messageTitle, setMessageTitle] = useState("Проект не сохранен");
  const [reauth, setReauth] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const entityOptions = useMemo(
    () =>
      project && !entities.some((e) => e.id === project.bitrixEntityId)
        ? [
            { id: project.bitrixEntityId, title: project.bitrixEntityTitle, type: project.bitrixEntityType },
            ...entities,
          ]
        : entities,
    [project, entities],
  );

  useEffect(() => {
    const draft = readProjectDraft(actorProfileId);
    if (!draft || draft.projectId !== (project?.id ?? null) || !formRef.current) return;
    for (const name of ["name", "websiteUrl", "requiredTag"] as const) {
      const field = formRef.current.elements.namedItem(name);
      if (field instanceof HTMLInputElement) field.value = draft[name];
    }
    queueMicrotask(() => {
      setEntityId(draft.bitrixEntityId);
      setResponsibleId(draft.defaultResponsibleId);
      if (!project && draft.creationOperationKey) setCreationOperationKey(draft.creationOperationKey);
    });
    clearProjectDraft();
  }, [actorProfileId, project]);

  function saveDraft() {
    if (!formRef.current) return;
    const data = new FormData(formRef.current);
    saveProjectDraft({
      actorProfileId,
      projectId: project?.id ?? null,
      creationOperationKey: creationOperationKey ?? null,
      name: String(data.get("name") ?? ""),
      websiteUrl: String(data.get("websiteUrl") ?? ""),
      requiredTag: String(data.get("requiredTag") ?? ""),
      bitrixEntityId: entityId,
      defaultResponsibleId: responsibleId,
    });
  }

  async function search(kind: "entities" | "employees") {
    setPending(true);
    setMessage(undefined);
    setMessageTitle("Поиск не выполнен");
    setReauth(false);
    try {
      const result = await searchProjectDirectoryAction(
        kind,
        kind === "entities" ? entityQuery : employeeQuery,
      );
      if (result.status === "error") {
        setMessage(result.message);
        setReauth(result.code === "reauth_required");
        return;
      }
      if (kind === "entities") setEntities(result.items as Bitrix24TaskEntity[]);
      else setEmployees(result.items as Bitrix24Employee[]);
    } catch {
      setMessage("Не удалось выполнить поиск. Проверьте соединение и повторите попытку.");
    } finally {
      setPending(false);
    }
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage(undefined);
    setMessageTitle("Проект не сохранен");
    setReauth(false);
    setFieldErrors({});
    const formData = new FormData(event.currentTarget);
    saveDraft();
    try {
      const result = await saveProjectAction({
        id: project?.id,
        creationOperationKey,
        name: formData.get("name"),
        websiteUrl: formData.get("websiteUrl"),
        bitrixEntityId: entityId,
        requiredTag: formData.get("requiredTag"),
        defaultResponsibleId: responsibleId,
      });
      if (result.status === "success") {
        clearProjectDraft();
        onSaved(result.projects, result.message, result.refreshRequired);
      } else {
        setMessage(result.message);
        setMessageTitle(
          result.code === "save_result_unknown" ? "Результат сохранения неизвестен" : "Проект не сохранен",
        );
        setReauth(result.code === "reauth_required");
        setFieldErrors(result.fieldErrors ?? {});
      }
    } catch {
      setMessageTitle("Результат сохранения неизвестен");
      setMessage("Не удалось получить результат сохранения. Проверьте список проектов перед повтором.");
    } finally {
      setPending(false);
    }
  }
  const errorFor = (field: string) =>
    fieldErrors[field]?.[0] ? (
      <p className="text-destructive mt-1 text-sm" role="alert">
        {fieldErrors[field][0]}
      </p>
    ) : null;

  return (
    <Card className="border-primary/20 mb-6 shadow-sm" data-testid="project-form">
      <CardHeader>
        <CardTitle>{project ? `Редактировать «${project.name}»` : "Новый проект"}</CardTitle>
        <CardDescription>
          Настройка принадлежит вам. Доступность проекта и сотрудника проверяется в Bitrix24 перед
          сохранением.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {message ? (
          <Alert variant="destructive" className="mb-5">
            <AlertTitle>{messageTitle}</AlertTitle>
            <AlertDescription>
              {message}
              {reauth ? (
                <Button asChild variant="link" className="ml-1 h-auto p-0">
                  <Link href="/api/bitrix24/oauth/start?return_path=%2Fprojects" onClick={saveDraft}>
                    Войти повторно
                  </Link>
                </Button>
              ) : null}
            </AlertDescription>
          </Alert>
        ) : null}
        <form ref={formRef} onSubmit={onSubmit} className="grid gap-5 sm:grid-cols-2" noValidate>
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
          <div className="sm:col-span-2">
            <Label htmlFor="entity-search">Проект Bitrix24 *</Label>
            <div className="mt-2 flex gap-2">
              <Input
                id="entity-search"
                value={entityQuery}
                onChange={(e) => setEntityQuery(e.target.value)}
                placeholder="Найти группу, проект или Scrum"
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => search("entities")}
                disabled={pending}
                aria-label="Найти проект Bitrix24"
              >
                <Search className="size-4" />
              </Button>
            </div>
            <Select value={entityId} onValueChange={setEntityId}>
              <SelectTrigger className="mt-2 min-h-12 w-full" aria-label="Проект Bitrix24">
                <SelectValue placeholder="Выберите проект Bitrix24" />
              </SelectTrigger>
              <SelectContent>
                {entityOptions.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.title} · {e.type}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errorFor("bitrixEntityId")}
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
            <Label htmlFor="employee-search">Ответственный по умолчанию *</Label>
            <div className="mt-2 flex gap-2">
              <Input
                id="employee-search"
                value={employeeQuery}
                onChange={(e) => setEmployeeQuery(e.target.value)}
                placeholder="Найти сотрудника"
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => search("employees")}
                disabled={pending}
                aria-label="Найти сотрудника"
              >
                <Search className="size-4" />
              </Button>
            </div>
            <Select value={responsibleId} onValueChange={setResponsibleId}>
              <SelectTrigger className="mt-2 min-h-12 w-full" aria-label="Ответственный по умолчанию">
                <SelectValue placeholder="Выберите сотрудника" />
              </SelectTrigger>
              <SelectContent>
                {employees.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {employeeOptionLabel(e, employees)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errorFor("defaultResponsibleId")}
          </div>
          <div className="flex flex-col-reverse gap-3 sm:col-span-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="ghost"
              className="min-h-11"
              onClick={() => {
                clearProjectDraft();
                onCancel();
              }}
            >
              Отмена
            </Button>
            <Button type="submit" className="min-h-11" disabled={pending}>
              {pending ? <Loader2 className="size-4 animate-spin" /> : null}
              {project ? "Сохранить проект" : "Добавить проект"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
