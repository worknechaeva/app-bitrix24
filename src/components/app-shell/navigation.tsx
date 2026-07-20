"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FolderKanban, History, Home, PlusCircle, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

const primaryItems = [
  { href: "/", label: "Главная", icon: Home },
  { href: "/tasks/new", label: "Новая задача", icon: PlusCircle },
  { href: "/submissions", label: "История", icon: History },
  { href: "/projects", label: "Проекты", icon: FolderKanban },
];

export function DesktopNavigation() {
  const pathname = usePathname();
  return (
    <nav aria-label="Основная навигация" className="space-y-1">
      {primaryItems.map((item) => {
        const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors",
              active
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            <item.icon aria-hidden="true" className="size-5" />
            {item.label}
          </Link>
        );
      })}
      <Link
        href="/settings/bitrix24"
        className="text-muted-foreground hover:bg-accent hover:text-foreground flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium"
      >
        <Settings aria-hidden="true" className="size-5" />
        Настройки
      </Link>
    </nav>
  );
}

export function MobileNavigation() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Мобильная навигация"
      data-testid="mobile-navigation"
      className="bg-background/95 border-border fixed inset-x-0 bottom-0 z-40 h-[calc(4rem+env(safe-area-inset-bottom))] border-t pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
    >
      <div className="mx-auto grid h-16 max-w-lg grid-cols-4 px-2">
        {primaryItems.map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-h-11 min-w-11 flex-col items-center justify-center gap-1 text-[11px] font-medium",
                active ? "text-primary" : "text-muted-foreground",
              )}
            >
              <item.icon aria-hidden="true" className="size-5" />
              {item.label === "Новая задача" ? "Создать" : item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
