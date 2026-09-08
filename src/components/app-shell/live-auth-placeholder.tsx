import Link from "next/link";
import { CheckCircle2, LockKeyhole } from "lucide-react";
import { Button } from "@/components/ui/button";
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
          <p>Этот раздел еще не подключен к постоянным данным. Проекты уже доступны в live-режиме.</p>
        </CardContent>
        <CardContent>
          <Button asChild>
            <Link href="/projects">Открыть проекты</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
