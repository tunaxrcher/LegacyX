"use client";

import * as React from "react";
import { Building2, Check, ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { switchBranchAction } from "@/app/actions";
import type { Session } from "@/lib/session";

export function BranchPicker({ session }: { session: Session }) {
  const branches = session.branches ?? [];
  const [pending, start] = React.useTransition();

  if (branches.length <= 1) {
    // Single-branch users get a static badge — no need to switch
    return (
      <div className="hidden items-center gap-1.5 rounded-md border bg-muted/40 px-2.5 py-1 text-xs font-medium text-muted-foreground md:flex">
        <Building2 className="h-3.5 w-3.5" />
        <span>{session.branchName ?? session.branchId.slice(-6)}</span>
      </div>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" disabled={pending}>
          <Building2 className="h-4 w-4" />
          <span className="hidden truncate md:inline">
            {session.branchName ?? session.branchId.slice(-6)}
          </span>
          <ChevronDown className="h-3.5 w-3.5 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Switch branch</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {branches.map((b) => {
          const active = b.id === session.branchId;
          return (
            <DropdownMenuItem
              key={b.id}
              disabled={pending || active}
              onClick={() => start(() => switchBranchAction(b.id))}
              className="cursor-pointer"
            >
              <Building2 className="h-4 w-4 text-muted-foreground" />
              <div className="flex flex-1 flex-col">
                <span className="text-sm">{b.name}</span>
                <span className="text-[10px] text-muted-foreground">{b.code}</span>
              </div>
              {active && <Check className="h-4 w-4 text-primary" />}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
