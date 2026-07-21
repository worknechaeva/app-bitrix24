import Link from "next/link";
import { Apple, ArrowLeft, MonitorDown, MoreVertical, Share, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function InstallPage() {
  return (
    <main className="bg-muted/40 min-h-svh px-4 py-8 sm:py-12">
      <div className="mx-auto max-w-3xl">
        <Button asChild variant="ghost" className="mb-5">
          <Link href="/">
            <ArrowLeft className="size-4" /> Вернуться в приложение
          </Link>
        </Button>
        <header className="mb-7">
          <p className="text-primary text-sm font-semibold">Установка PWA</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">Task Launcher на главном экране</h1>
          <p className="text-muted-foreground mt-3">
            Приложение откроется в отдельном окне. Публикация в App Store или Google Play не нужна.
          </p>
        </header>
        <div className="grid gap-5 md:grid-cols-2">
          <Card>
            <CardHeader>
              <Apple className="size-7" />
              <CardTitle>iPhone и iPad</CardTitle>
              <CardDescription>Установка выполняется вручную в Safari.</CardDescription>
            </CardHeader>
            <CardContent>
              <ol className="space-y-4 text-sm">
                <li className="flex gap-3">
                  <span className="bg-muted grid size-8 shrink-0 place-items-center rounded-full">1</span>
                  <span>Откройте эту страницу в Safari.</span>
                </li>
                <li className="flex gap-3">
                  <span className="bg-muted grid size-8 shrink-0 place-items-center rounded-full">
                    <Share className="size-4" />
                  </span>
                  <span>Нажмите кнопку «Поделиться».</span>
                </li>
                <li className="flex gap-3">
                  <span className="bg-muted grid size-8 shrink-0 place-items-center rounded-full">3</span>
                  <span>Выберите «На экран Домой» и подтвердите добавление.</span>
                </li>
              </ol>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <Smartphone className="size-7" />
              <CardTitle>Android</CardTitle>
              <CardDescription>В Chrome доступен системный сценарий установки.</CardDescription>
            </CardHeader>
            <CardContent>
              <ol className="space-y-4 text-sm">
                <li className="flex gap-3">
                  <span className="bg-muted grid size-8 shrink-0 place-items-center rounded-full">
                    <MoreVertical className="size-4" />
                  </span>
                  <span>Откройте меню браузера.</span>
                </li>
                <li className="flex gap-3">
                  <span className="bg-muted grid size-8 shrink-0 place-items-center rounded-full">
                    <MonitorDown className="size-4" />
                  </span>
                  <span>Нажмите «Установить приложение» или «Добавить на главный экран».</span>
                </li>
                <li className="flex gap-3">
                  <span className="bg-muted grid size-8 shrink-0 place-items-center rounded-full">3</span>
                  <span>Подтвердите установку.</span>
                </li>
              </ol>
            </CardContent>
          </Card>
        </div>
        <p className="text-muted-foreground mt-6 text-sm">
          Для установки production-версии потребуется защищенный HTTPS-адрес. Офлайн-создание задач не
          поддерживается.
        </p>
      </div>
    </main>
  );
}
