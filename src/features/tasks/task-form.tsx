"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { AlertCircle, CheckCircle2, ChevronDown, Clock3, ExternalLink, Loader2, Plus } from "lucide-react";
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { createTaskAction } from "./actions";
import { taskFormSchema, type TaskFormValues } from "./schema";
import type { CreateTaskOutcome } from "@/server/services/create-task";
import type { Project } from "@/server/fixtures";

type Employee = { id: string; name: string; position: string; active: boolean };

function FieldError({ message }: { message?: string }) {
  return message ? (
    <p className="text-destructive mt-1 text-sm" role="alert">
      {message}
    </p>
  ) : null;
}

export function TaskForm({
  projects,
  employees,
  idempotencyKey,
  showMockControls,
}: {
  projects: Project[];
  employees: readonly Employee[];
  idempotencyKey: string;
  showMockControls: boolean;
}) {
  const [outcome, setOutcome] = useState<CreateTaskOutcome | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const form = useForm<TaskFormValues>({
    resolver: zodResolver(taskFormSchema),
    defaultValues: {
      idempotencyKey,
      projectId: projects[0]?.id ?? "",
      title: "",
      responsibleId: "default",
      deadline: "",
      description: "",
      priority: "default",
      estimateHours: "",
      additionalTags: "",
      mockScenario: "success",
    },
  });

  const projectId = useWatch({ control: form.control, name: "projectId" });
  const responsibleId = useWatch({ control: form.control, name: "responsibleId" });
  const priority = useWatch({ control: form.control, name: "priority" });
  const mockScenario = useWatch({ control: form.control, name: "mockScenario" });
  const selectedProject = projects.find((project) => project.id === projectId);

  async function onSubmit(values: TaskFormValues) {
    if (submitting) return;
    setSubmitting(true);
    setOutcome(null);
    try {
      const result = await createTaskAction(values);
      setOutcome(result);
      if (result.status === "error" && result.fieldErrors) {
        for (const [field, messages] of Object.entries(result.fieldErrors)) {
          form.setError(field as keyof TaskFormValues, { message: messages[0] });
        }
      }
    } finally {
      setSubmitting(false);
    }
  }

  function resetForAnotherTask() {
    form.reset({
      ...form.getValues(),
      idempotencyKey: crypto.randomUUID(),
      title: "",
      deadline: "",
      description: "",
      estimateHours: "",
      additionalTags: "",
      mockScenario: "success",
    });
    setOutcome(null);
  }

  if (outcome?.status === "success") {
    const task = outcome.submission;
    return (
      <Card className="border-emerald-200 shadow-sm">
        <CardHeader>
          <span className="mb-2 grid size-12 place-items-center rounded-full bg-emerald-100 text-emerald-700">
            <CheckCircle2 className="size-6" aria-hidden="true" />
          </span>
          <CardTitle>Задача создана</CardTitle>
          <CardDescription>
            Mock Bitrix24 принял задачу. Повторная отправка с тем же ключом не создаст дубликат.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <dl className="bg-muted/60 grid gap-4 rounded-2xl p-4 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">Проект</dt>
              <dd className="mt-1 font-medium">{task.projectName}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Ответственный</dt>
              <dd className="mt-1 font-medium">{task.responsibleName}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Срок</dt>
              <dd className="mt-1 font-medium">{task.deadline || "Не указан"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">ID Bitrix24</dt>
              <dd className="mt-1 font-mono font-medium">#{task.bitrixTaskId}</dd>
            </div>
          </dl>
          <div>
            <p className="text-muted-foreground text-sm">Название</p>
            <p className="mt-1 font-medium">{task.title}</p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button onClick={resetForAnotherTask} className="min-h-12 flex-1">
              <Plus className="size-4" aria-hidden="true" /> Создать еще
            </Button>
            {task.bitrixTaskUrl ? (
              <Button asChild variant="outline" className="min-h-12 flex-1">
                <a href={task.bitrixTaskUrl} target="_blank" rel="noreferrer">
                  Открыть задачу <ExternalLink className="size-4" aria-hidden="true" />
                </a>
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="space-y-5">
      <input type="hidden" {...form.register("idempotencyKey")} />
      {outcome?.status === "error" ? (
        <Alert variant="destructive">
          <AlertCircle className="size-4" aria-hidden="true" />
          <AlertTitle>Задача не создана</AlertTitle>
          <AlertDescription>{outcome.message}</AlertDescription>
        </Alert>
      ) : null}
      {outcome?.status === "unknown" ? (
        <Alert className="border-amber-300 bg-amber-50 text-amber-950">
          <Clock3 className="size-4" aria-hidden="true" />
          <AlertTitle>Статус создания неизвестен</AlertTitle>
          <AlertDescription>{outcome.message}</AlertDescription>
        </Alert>
      ) : null}

      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle>Основное</CardTitle>
          <CardDescription>Достаточно выбрать проект и коротко назвать задачу.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div>
            <Label htmlFor="project">Проект *</Label>
            <Select
              value={projectId}
              onValueChange={(value) => form.setValue("projectId", value, { shouldValidate: true })}
            >
              <SelectTrigger
                id="project"
                className="mt-2 min-h-12 w-full"
                aria-invalid={Boolean(form.formState.errors.projectId)}
              >
                <SelectValue placeholder="Выберите проект" />
              </SelectTrigger>
              <SelectContent>
                {projects.map((project) => (
                  <SelectItem key={project.id} value={project.id}>
                    {project.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldError message={form.formState.errors.projectId?.message} />
            {selectedProject ? (
              <div className="mt-3 flex flex-wrap gap-2">
                <Badge variant="secondary">{selectedProject.requiredTag}</Badge>
                <Badge variant="outline">{selectedProject.bitrixGroupName}</Badge>
                {selectedProject.timeTrackingEnabled ? <Badge variant="outline">Учет времени</Badge> : null}
              </div>
            ) : null}
          </div>

          <div>
            <Label htmlFor="title">Название задачи *</Label>
            <Input
              id="title"
              className="mt-2 min-h-12 text-base"
              placeholder="Например, исправить форму обратной связи"
              autoComplete="off"
              aria-invalid={Boolean(form.formState.errors.title)}
              {...form.register("title")}
            />
            <FieldError message={form.formState.errors.title?.message} />
          </div>
        </CardContent>
      </Card>

      <details className="border-border bg-card group rounded-2xl border shadow-sm">
        <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between px-5 font-medium [&::-webkit-details-marker]:hidden">
          Дополнительные параметры
          <ChevronDown
            className="text-muted-foreground size-5 transition-transform group-open:rotate-180"
            aria-hidden="true"
          />
        </summary>
        <div className="border-border grid gap-5 border-t p-5 sm:grid-cols-2">
          <div>
            <Label htmlFor="responsible">Ответственный</Label>
            <Select value={responsibleId} onValueChange={(value) => form.setValue("responsibleId", value)}>
              <SelectTrigger id="responsible" className="mt-2 min-h-12 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="default">По настройкам проекта</SelectItem>
                {employees.map((employee) => (
                  <SelectItem key={employee.id} value={employee.id}>
                    {employee.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="deadline">Срок</Label>
            <Input id="deadline" type="date" className="mt-2 min-h-12" {...form.register("deadline")} />
          </div>
          <div>
            <Label htmlFor="priority">Приоритет</Label>
            <Select
              value={priority}
              onValueChange={(value) => form.setValue("priority", value as TaskFormValues["priority"])}
            >
              <SelectTrigger id="priority" className="mt-2 min-h-12 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="default">По настройкам проекта</SelectItem>
                <SelectItem value="low">Низкий</SelectItem>
                <SelectItem value="medium">Средний</SelectItem>
                <SelectItem value="high">Высокий</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="estimate">Оценка, часов</Label>
            <Input
              id="estimate"
              inputMode="decimal"
              placeholder="Например, 1,5"
              className="mt-2 min-h-12"
              {...form.register("estimateHours")}
            />
            <FieldError message={form.formState.errors.estimateHours?.message} />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="description">Описание</Label>
            <Textarea
              id="description"
              className="mt-2 min-h-28 resize-y"
              placeholder="Контекст, ожидаемый результат или полезные ссылки"
              {...form.register("description")}
            />
            <FieldError message={form.formState.errors.description?.message} />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="tags">Дополнительные теги</Label>
            <Input
              id="tags"
              className="mt-2 min-h-12"
              placeholder="срочно, контент — через запятую"
              {...form.register("additionalTags")}
            />
            <p className="text-muted-foreground mt-1 text-xs">
              Обязательный тег проекта добавится автоматически.
            </p>
          </div>
          {showMockControls ? (
            <div className="rounded-xl border border-dashed p-4 sm:col-span-2">
              <Label htmlFor="scenario">Mock-сценарий для проверки</Label>
              <Select
                value={mockScenario}
                onValueChange={(value) =>
                  form.setValue("mockScenario", value as TaskFormValues["mockScenario"])
                }
              >
                <SelectTrigger id="scenario" className="mt-2 min-h-12 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="success">Успешное создание</SelectItem>
                  <SelectItem value="error">Ошибка Bitrix24</SelectItem>
                  <SelectItem value="timeout">Неизвестный статус после timeout</SelectItem>
                </SelectContent>
              </Select>
            </div>
          ) : null}
        </div>
      </details>

      <Button type="submit" size="lg" className="min-h-14 w-full text-base" disabled={submitting}>
        {submitting ? (
          <>
            <Loader2 className="size-5 animate-spin" aria-hidden="true" /> Создаем задачу...
          </>
        ) : (
          "Создать задачу"
        )}
      </Button>
      <p className="text-muted-foreground text-center text-xs">
        Данные отправляются только на сервер Task Launcher.
      </p>
    </form>
  );
}
