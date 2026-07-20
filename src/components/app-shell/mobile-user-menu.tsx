"use client";

import { LogOut, UserRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

type MobileUserMenuProps = {
  user: { name: string; role: "admin" | "editor" };
  logoutAction: () => Promise<void>;
};

export function MobileUserMenu({ user, logoutAction }: MobileUserMenuProps) {
  const initials = user.name
    .split(" ")
    .slice(0, 2)
    .map((part) => part[0])
    .join("");

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          className="size-11 rounded-full p-0"
          aria-label={`Меню пользователя ${user.name}`}
          data-testid="mobile-user-menu"
        >
          <span className="bg-secondary text-secondary-foreground grid size-9 place-items-center rounded-full text-xs font-semibold">
            {initials || <UserRound className="size-4" aria-hidden="true" />}
          </span>
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-[min(88vw,22rem)]">
        <SheetHeader className="pt-16">
          <SheetTitle>{user.name}</SheetTitle>
          <SheetDescription>Профиль текущей mock-сессии</SheetDescription>
          <Badge variant="outline" className="mt-3 w-fit">
            {user.role === "admin" ? "Администратор" : "Редактор"}
          </Badge>
        </SheetHeader>
        <SheetFooter>
          <form action={logoutAction}>
            <Button variant="outline" className="min-h-11 w-full justify-start" type="submit">
              <LogOut aria-hidden="true" className="size-4" /> Выйти
            </Button>
          </form>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
