import Link from "next/link";
import { ArrowRight, CheckCircle2, CircleDot, Plus, Wifi } from "lucide-react";
import { PageHeading } from "@/components/page-heading";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PROJECTS } from "@/server/fixtures";
import { listSubmissions } from "@/server/services/create-task";

export default function DashboardPage() {
  const recent = listSubmissions().slice(0, 3);
  const projects = PROJECTS.filter((project) => project.active).slice(0, 3);

  return (
    <>
      <PageHeading
        eyebrow="Добрый день"
        title="Поставьте задачу без лишних шагов"
        description="Проектные настройки подставятся автоматически. Вам останется описать результат."
        action={
          <Button asChild size="lg" className="min-h-12">
            <Link href="/tasks/new">
              <Plus className="size-4" /> Новая задача
            </Link>
          </Button>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[1.5fr_1fr]">
        <Card className="shadow-sm">
          <CardHeader className="flex-row items-center justify-between">
            <div>
              <CardTitle>Последние задачи</CardTitle>
              <CardDescription>Созданы через Task Launcher</CardDescription>
            </div>
            <Button asChild variant="ghost" size="sm">
              <Link href="/submissions">
                Все <ArrowRight className="size-4" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {recent.map((submission) => (
              <article key={submission.id} className="border-border flex gap-3 rounded-2xl border p-4">
                {submission.status === "success" ? (
                  <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-600" />
                ) : (
                  <CircleDot className="mt-0.5 size-5 shrink-0 text-amber-600" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{submission.title}</p>
                  <p className="text-muted-foreground mt-1 text-sm">
                    {submission.projectName} · {submission.responsibleName}
                  </p>
                </div>
                {submission.bitrixTaskId ? (
                  <span className="text-muted-foreground font-mono text-xs">#{submission.bitrixTaskId}</span>
                ) : null}
              </article>
            ))}
          </CardContent>
        </Card>

        <div className="space-y-5">
          <Card className="border-emerald-200 bg-emerald-50/60 shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Wifi className="size-5 text-emerald-700" /> Bitrix24 подключен
              </CardTitle>
              <CardDescription>Сейчас работает безопасный mock-режим.</CardDescription>
            </CardHeader>
          </Card>
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle>Недавние проекты</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {projects.map((project) => (
                <Link
                  key={project.id}
                  href={`/tasks/new?project=${project.id}`}
                  className="hover:bg-muted flex min-h-12 items-center justify-between rounded-xl px-2 transition-colors"
                >
                  <span>
                    <span className="block text-sm font-medium">{project.name}</span>
                    <span className="text-muted-foreground text-xs">{project.requiredTag}</span>
                  </span>
                  <ArrowRight className="text-muted-foreground size-4" />
                </Link>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
      <Badge variant="outline" className="mt-6">
        Milestone 1 · данные не сохраняются после перезапуска
      </Badge>
    </>
  );
}
