"use client";
import Link from "next/link";
import { ExternalLink, Pencil, Plus, Tag, Users } from "lucide-react";
import { useEffect, useMemo, useState, useTransition } from "react";
import type { Bitrix24Employee, Bitrix24TaskEntity } from "@/integrations/bitrix24/directory-client";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { reloadProjectListAction, setProjectArchivedAction } from "./actions";
import { clearProjectDraft, readProjectDraft } from "./project-draft";
import { ProjectForm } from "./project-form";
import type { Project } from "./schema";

type Props = {
  initialProjects: Project[];
  entities: Bitrix24TaskEntity[];
  employees: Bitrix24Employee[];
  actorProfileId: string;
  directoryStatus: "available" | "reauth_required" | "unavailable";
};
export function ProjectManagement({
  initialProjects,
  entities,
  employees,
  actorProfileId,
  directoryStatus,
}: Props) {
  const [projects, setProjects] = useState(initialProjects);
  const [editing, setEditing] = useState<Project | "new">();
  const [filter, setFilter] = useState<"active" | "archive" | "all">("active");
  const [notice, setNotice] = useState<{
    kind: "success" | "error";
    message: string;
    refreshRequired?: boolean;
  }>();
  const [pending, startTransition] = useTransition();
  const directoryUnavailable = directoryStatus !== "available";
  const shown = useMemo(
    () => projects.filter((p) => filter === "all" || (filter === "archive" ? p.archived : !p.archived)),
    [projects, filter],
  );
  const employeeName = (id: string) => {
    const e = employees.find((item) => item.id === id);
    return e ? [e.lastName, e.name].filter(Boolean).join(" ") : `Сотрудник #${id}`;
  };
  useEffect(() => {
    if (directoryUnavailable) return;
    const draft = readProjectDraft(actorProfileId);
    if (!draft) return;
    const target =
      draft.projectId === null ? "new" : projects.find((project) => project.id === draft.projectId);
    if (target !== "new" && (!target || !target.canEdit)) {
      clearProjectDraft();
      return;
    }
    queueMicrotask(() => setEditing(target));
  }, [actorProfileId, directoryUnavailable, projects]);
  function toggle(project: Project) {
    startTransition(async () => {
      try {
        const result = await setProjectArchivedAction(project.id, !project.archived);
        if (result.status === "success") {
          if (result.projects) setProjects(result.projects);
          setNotice({
            kind: "success",
            message: result.message,
            refreshRequired: result.refreshRequired,
          });
        } else setNotice({ kind: "error", message: result.message });
      } catch {
        setNotice({ kind: "error", message: "Не удалось получить результат изменения проекта" });
      }
    });
  }
  function reloadProjects() {
    startTransition(async () => {
      try {
        const result = await reloadProjectListAction();
        if (result.status === "success" && result.projects) {
          setProjects(result.projects);
          setNotice({ kind: "success", message: result.message });
          return;
        }
        setNotice({
          kind: "error",
          message: result.message,
          refreshRequired: true,
        });
      } catch {
        setNotice({
          kind: "error",
          message: "Не удалось обновить список проектов",
          refreshRequired: true,
        });
      }
    });
  }
  return (
    <>
      {directoryUnavailable ? (
        <Alert className="mb-5">
          <AlertTitle>Справочник временно недоступен</AlertTitle>
          <AlertDescription>
            {directoryStatus === "reauth_required" ? (
              <>
                Сохраненные проекты и архив доступны. Для создания и редактирования нужно{` `}
                <Button asChild variant="link" className="h-auto p-0">
                  <Link href="/api/bitrix24/oauth/start?return_path=%2Fprojects">войти повторно</Link>
                </Button>
                .
              </>
            ) : (
              "Сохраненные проекты и архив доступны. Создание и редактирование возобновятся после восстановления Bitrix24."
            )}
          </AlertDescription>
        </Alert>
      ) : null}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <Select value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
          <SelectTrigger className="min-h-11 w-44" aria-label="Показать проекты">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="active">Активные</SelectItem>
            <SelectItem value="archive">Архив</SelectItem>
            <SelectItem value="all">Все</SelectItem>
          </SelectContent>
        </Select>
        <Button className="min-h-12" onClick={() => setEditing("new")} disabled={directoryUnavailable}>
          <Plus className="size-4" /> Добавить проект
        </Button>
      </div>
      {notice ? (
        <Alert variant={notice.kind === "error" ? "destructive" : "default"} className="mb-5">
          <AlertTitle>{notice.kind === "error" ? "Не удалось изменить проект" : "Готово"}</AlertTitle>
          <AlertDescription>
            {notice.message}
            {notice.refreshRequired ? (
              <Button
                type="button"
                variant="link"
                className="ml-1 h-auto p-0"
                disabled={pending}
                onClick={reloadProjects}
              >
                Обновить список
              </Button>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : null}
      {editing ? (
        <ProjectForm
          key={editing === "new" ? "new" : editing.id}
          project={editing === "new" ? undefined : editing}
          actorProfileId={actorProfileId}
          entities={entities}
          employees={employees}
          onSaved={(next, message, refreshRequired) => {
            if (next) setProjects(next);
            setEditing(undefined);
            setNotice({ kind: "success", message, refreshRequired });
          }}
          onCancel={() => setEditing(undefined)}
        />
      ) : null}
      {shown.length === 0 ? (
        <Card>
          <CardContent className="text-muted-foreground p-6">В этом разделе проектов пока нет.</CardContent>
        </Card>
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          {shown.map((project) => (
            <Card key={project.id} className={project.archived ? "opacity-70" : "shadow-sm"}>
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <CardTitle>{project.name}</CardTitle>
                    <CardDescription className="mt-1 truncate">
                      {project.websiteUrl || "Сайт не указан"}
                    </CardDescription>
                  </div>
                  <Badge variant={project.archived ? "outline" : "secondary"}>
                    {project.archived ? "В архиве" : "Активен"}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <p className="flex items-center gap-2">
                  <Tag className="text-muted-foreground size-4" />
                  {project.requiredTag}
                </p>
                <p className="flex items-center gap-2">
                  <Users className="text-muted-foreground size-4" />
                  {employeeName(project.defaultResponsibleId)}
                </p>
                <p className="text-muted-foreground">
                  {project.bitrixEntityTitle} · {project.bitrixEntityType} #{project.bitrixEntityId}
                </p>
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  {project.websiteUrl ? (
                    <Button asChild variant="link" className="min-h-11 px-0">
                      <a href={project.websiteUrl} target="_blank" rel="noopener noreferrer">
                        Открыть сайт <ExternalLink className="size-4" />
                      </a>
                    </Button>
                  ) : null}
                  {project.canEdit && !project.archived ? (
                    <Button
                      variant="outline"
                      className="min-h-11"
                      disabled={directoryUnavailable}
                      onClick={() => setEditing(project)}
                    >
                      <Pencil className="size-4" /> Редактировать
                    </Button>
                  ) : null}
                  {project.canArchive ? (
                    <Button
                      variant="ghost"
                      className="min-h-11"
                      disabled={pending}
                      onClick={() => toggle(project)}
                    >
                      {project.archived ? "Восстановить" : "В архив"}
                    </Button>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
