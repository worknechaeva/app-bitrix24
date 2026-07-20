import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import { PageHeading } from "@/components/page-heading";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { listSubmissions } from "@/server/services/create-task";

const statusView = {
  success: {
    label: "Создана",
    icon: CheckCircle2,
    className: "text-emerald-700 bg-emerald-50 border-emerald-200",
  },
  unknown: {
    label: "Нужно проверить",
    icon: AlertTriangle,
    className: "text-amber-800 bg-amber-50 border-amber-200",
  },
  error: { label: "Ошибка", icon: XCircle, className: "text-red-700 bg-red-50 border-red-200" },
};

export const dynamic = "force-dynamic";

export default function SubmissionsPage() {
  const submissions = listSubmissions();
  return (
    <>
      <PageHeading
        title="История создания"
        description="В mock-режиме новые записи хранятся только до перезапуска сервера."
      />
      <div className="space-y-3">
        {submissions.map((submission) => {
          const view = statusView[submission.status];
          return (
            <Card key={submission.id} className="shadow-sm">
              <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
                <span
                  className={`grid size-10 shrink-0 place-items-center rounded-full border ${view.className}`}
                >
                  <view.icon className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{submission.title}</p>
                  <p className="text-muted-foreground mt-1 text-sm">
                    {submission.projectName} · {submission.responsibleName}
                  </p>
                </div>
                <div className="flex items-center justify-between gap-3 sm:flex-col sm:items-end">
                  <Badge variant="outline">{view.label}</Badge>
                  {submission.bitrixTaskId ? (
                    <span className="text-muted-foreground font-mono text-xs">
                      #{submission.bitrixTaskId}
                    </span>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </>
  );
}
