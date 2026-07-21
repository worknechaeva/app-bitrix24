"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TASK_STATUS_LABELS, type TaskStatus } from "@/features/tasks/task-status";
import type { Project } from "@/features/projects/schema";
import type { SubmissionRecord } from "@/server/services/create-task";

type SubmissionHistoryProps = {
  submissions: SubmissionRecord[];
  projects: Project[];
};

const statusClasses: Record<TaskStatus, string> = {
  new: "border-blue-200 bg-blue-50 text-blue-800",
  in_progress: "border-amber-200 bg-amber-50 text-amber-900",
  completed: "border-emerald-200 bg-emerald-50 text-emerald-800",
  unknown: "border-slate-200 bg-slate-50 text-slate-700",
};

function CreatedAt({ value }: { value: string }) {
  const formatted = new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(new Date(value));
  return <time dateTime={value}>{formatted}</time>;
}

function StatusBadge({ status }: { status: TaskStatus }) {
  return (
    <Badge variant="outline" className={statusClasses[status]}>
      {TASK_STATUS_LABELS[status]}
    </Badge>
  );
}

export function SubmissionHistory({ submissions, projects }: SubmissionHistoryProps) {
  const [projectId, setProjectId] = useState("all");
  const filtered =
    projectId === "all"
      ? submissions
      : submissions.filter((submission) => submission.projectId === projectId);

  return (
    <div>
      <div className="mb-5 max-w-sm">
        <label htmlFor="history-project" className="mb-2 block text-sm font-medium">
          Проект
        </label>
        <Select value={projectId} onValueChange={setProjectId}>
          <SelectTrigger id="history-project" className="min-h-12 w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все проекты</SelectItem>
            {projects.map((project) => (
              <SelectItem key={project.id} value={project.id}>
                {project.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {filtered.length ? (
        <>
          <div className="border-border bg-card hidden overflow-hidden rounded-2xl border shadow-sm md:block">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/60 text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Задача</th>
                  <th className="px-4 py-3 font-medium">Проект</th>
                  <th className="px-4 py-3 font-medium">Ответственный</th>
                  <th className="px-4 py-3 font-medium">ID Bitrix24</th>
                  <th className="px-4 py-3 font-medium">Статус</th>
                  <th className="px-4 py-3 font-medium">Создана</th>
                </tr>
              </thead>
              <tbody className="divide-border divide-y">
                {filtered.map((submission) => (
                  <tr key={submission.id}>
                    <td className="max-w-xs px-4 py-3 font-medium">{submission.title}</td>
                    <td className="px-4 py-3">{submission.projectName}</td>
                    <td className="px-4 py-3">{submission.responsibleName}</td>
                    <td className="text-muted-foreground px-4 py-3 font-mono text-xs">
                      {submission.bitrixTaskId ? `#${submission.bitrixTaskId}` : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={submission.taskStatus} />
                    </td>
                    <td className="text-muted-foreground px-4 py-3 text-xs">
                      <CreatedAt value={submission.createdAt} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="space-y-3 md:hidden">
            {filtered.map((submission) => (
              <Card key={submission.id} className="shadow-sm">
                <CardContent className="space-y-2 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <p className="font-medium">{submission.title}</p>
                    <StatusBadge status={submission.taskStatus} />
                  </div>
                  <p className="text-muted-foreground text-sm">
                    {submission.projectName} · {submission.responsibleName}
                  </p>
                  <div className="text-muted-foreground flex items-center justify-between gap-3 text-xs">
                    <span className="font-mono">
                      {submission.bitrixTaskId ? `#${submission.bitrixTaskId}` : "ID не присвоен"}
                    </span>
                    <CreatedAt value={submission.createdAt} />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      ) : (
        <Card className="border-dashed shadow-none">
          <CardContent className="py-10 text-center">
            <p className="font-medium">По этому проекту задач пока нет</p>
            <p className="text-muted-foreground mt-1 text-sm">
              Выберите другой проект или покажите все задачи.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
