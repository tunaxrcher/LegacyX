"use client";

import * as React from "react";
import { LogOut, User as UserIcon, Building2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { initials } from "@/lib/utils";
import { logoutAction } from "@/app/actions";
import type { Session } from "@/lib/session";

export function UserMenu({ session }: { session: Session }) {
  const t = useTranslations("common");
  const [pending, start] = React.useTransition();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="h-9 gap-2 px-2">
          <Avatar className="h-7 w-7">
            <AvatarFallback className="bg-primary/10 text-primary">
              {initials(session.userName)}
            </AvatarFallback>
          </Avatar>
          <span className="hidden text-left md:flex md:flex-col md:leading-tight">
            <span className="text-xs font-medium">{session.userName ?? "—"}</span>
            <span className="text-[10px] text-muted-foreground">{session.branchName}</span>
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="flex items-center gap-2 py-2">
          <Avatar className="h-9 w-9">
            <AvatarFallback className="bg-primary/10 text-primary">
              {initials(session.userName)}
            </AvatarFallback>
          </Avatar>
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-sm font-semibold text-foreground">
              {session.userName ?? "—"}
            </span>
            <span className="truncate text-xs text-muted-foreground">
              {session.tenantName}
            </span>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled>
          <Building2 className="h-4 w-4" />
          <span className="truncate text-xs">{session.branchName}</span>
        </DropdownMenuItem>
        <DropdownMenuItem disabled>
          <UserIcon className="h-4 w-4" />
          <span className="truncate font-mono text-[10px]">{session.userId}</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => start(() => logoutAction())}
          disabled={pending}
          className="text-destructive focus:text-destructive"
        >
          <LogOut className="h-4 w-4" /> {t("logout")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
