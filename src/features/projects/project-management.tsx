"use client";

import { ExternalLink, Pencil, Plus, Tag, Users } from "lucide-react";
import { useState, useTransition } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { setProjectActiveAction } from "./actions";
import { ProjectForm } from "./project-form";
import type { Project } from "./schema";

type Employee = { id: string; name: string };

type ProjectManagementProps = {
  initialProjects: Project[];
  employees: readonly Employee[];
  canManage: boolean;
};

export function ProjectManagement({ initialProjects, employees, canManage }: ProjectManagementProps) {
  const [projects, setProjects] = useState(initialProjects);
  const [editing, setEditing] = useState<Project | "new">();
  const [notice, setNotice] = useState<{ kind: "success" | "error"; message: string }>();
  const [pending, startTransition] = useTransition();

  function onSaved(nextProjects: Project[], message: string) {
    setProjects(nextProjects);
    setEditing(undefined);
    setNotice({ kind: "success", message });
  }

  function toggleProject(project: Project) {
    startTransition(async () => {
      const result = await setProjectActiveAction(project.id, !project.active);
      if (result.status === "success") {
        setProjects(result.projects);
        setNotice({ kind: "success", message: result.message });
      } else setNotice({ kind: "error", message: result.message });
    });
  }

  return (
    <>
      {canManage ? (
        <div className="mb-5 flex justify-end">
          <Button className="min-h-12" onClick={() => setEditing("new")}>
            <Plus className="size-4" aria-hidden="true" /> Добавить проект
          </Button>
        </div>
      ) : null}
      {notice ? (
        <Alert variant={notice.kind === "error" ? "destructive" : "default"} className="mb-5">
          <AlertTitle>{notice.kind === "error" ? "Не удалось изменить проект" : "Готово"}</AlertTitle>
          <AlertDescription>{notice.message}</AlertDescription>
        </Alert>
      ) : null}
      {editing ? (
        <ProjectForm
          key={editing === "new" ? "new" : editing.id}
          project={editing === "new" ? undefined : editing}
          employees={employees}
          onSaved={onSaved}
          onCancel={() => setEditing(undefined)}
        />
      ) : null}
      <div className="grid gap-5 lg:grid-cols-2">
        {projects.map((project) => (
          <Card key={project.id} className={project.active ? "shadow-sm" : "opacity-70"}>
            <CardHeader>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <CardTitle>{project.name}</CardTitle>
                  <CardDescription className="mt-1 truncate">
                    {project.websiteUrl || "Сайт не указан"}
                  </CardDescription>
                </div>
                <Badge variant={project.active ? "secondary" : "outline"}>
                  {project.active ? "Активен" : "Отключен"}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p className="flex items-center gap-2">
                <Tag className="text-muted-foreground size-4" aria-hidden="true" /> {project.requiredTag}
              </p>
              <p className="flex items-center gap-2">
                <Users className="text-muted-foreground size-4" aria-hidden="true" />
                {employees.find((employee) => employee.id === project.defaultResponsibleId)?.name ??
                  `Сотрудник #${project.defaultResponsibleId}`}
              </p>
              <p className="text-muted-foreground">
                Группа: {project.bitrixGroupName} · #{project.bitrixGroupId}
              </p>
              <div className="flex flex-wrap items-center gap-2 pt-1">
                {project.websiteUrl ? (
                  <Button asChild variant="link" className="min-h-11 px-0">
                    <a href={project.websiteUrl} target="_blank" rel="noopener noreferrer">
                      Открыть сайт <ExternalLink className="size-4" aria-hidden="true" />
                    </a>
                  </Button>
                ) : null}
                {canManage ? (
                  <>
                    <Button variant="outline" className="min-h-11" onClick={() => setEditing(project)}>
                      <Pencil className="size-4" aria-hidden="true" /> Редактировать
                    </Button>
                    <Button
                      variant="ghost"
                      className="min-h-11"
                      disabled={pending}
                      onClick={() => toggleProject(project)}
                    >
                      {project.active ? "Выключить" : "Включить"}
                    </Button>
                  </>
                ) : null}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </>
  );
}
