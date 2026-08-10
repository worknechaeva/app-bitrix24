import { CheckCircle2, LockKeyhole } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function LiveAuthPlaceholder() {
  return (
    <div className="mx-auto max-w-2xl">
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle2 className="size-5 text-emerald-600" /> Вход выполнен
          </CardTitle>
          <CardDescription>Соединение с корпоративным порталом Bitrix24 подтверждено.</CardDescription>
        </CardHeader>
        <CardContent className="text-muted-foreground flex gap-3 text-sm">
          <LockKeyhole className="mt-0.5 size-4 shrink-0" />
          <p>
            Рабочие справочники и создание задач еще не подключены в текущем Milestone 2. Mock-данные в
            live-режиме не отображаются.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
