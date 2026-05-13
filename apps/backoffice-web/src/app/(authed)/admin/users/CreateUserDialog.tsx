"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Plus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { clientApi } from "@/lib/clientApi";

type Role = { code: string; name: string };
type Branch = { id: string; code: string; name: string };

export function CreateUserDialog({
  roles,
  branches,
}: {
  roles: Role[];
  branches: Branch[];
}) {
  const router = useRouter();
  const t = useTranslations("admin_users");
  const tCommon = useTranslations("common");
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [email, setEmail] = React.useState("");
  const [fullName, setFullName] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [selectedRoles, setSelectedRoles] = React.useState<string[]>([]);
  const [selectedBranches, setSelectedBranches] = React.useState<string[]>(
    branches.map((b) => b.id),
  );

  function reset() {
    setEmail("");
    setFullName("");
    setPassword("");
    setSelectedRoles([]);
    setSelectedBranches(branches.map((b) => b.id));
  }

  function toggle(arr: string[], val: string): string[] {
    return arr.includes(val) ? arr.filter((x) => x !== val) : [...arr, val];
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await clientApi.post("/api/v1/admin/users", {
        email,
        full_name: fullName,
        password,
        role_codes: selectedRoles,
        branch_ids: selectedBranches,
      });
      toast.success(t("create_success"));
      setOpen(false);
      reset();
      router.refresh();
    } catch (err) {
      toast.error(String((err as Error).message ?? err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="h-4 w-4" />
          {t("new")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("new")}</DialogTitle>
          <DialogDescription>{t("new_desc")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="email">{t("email")}</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="full_name">{t("full_name")}</Label>
              <Input
                id="full_name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="password">{t("password")}</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              placeholder="≥ 8 chars"
            />
          </div>

          <div className="space-y-1.5">
            <Label>{t("roles")}</Label>
            <div className="flex flex-wrap gap-2">
              {roles.map((r) => {
                const on = selectedRoles.includes(r.code);
                return (
                  <button
                    key={r.code}
                    type="button"
                    onClick={() => setSelectedRoles((s) => toggle(s, r.code))}
                    className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                      on
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-input bg-background text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    {r.code}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>{t("branches")}</Label>
            <div className="flex flex-wrap gap-2">
              {branches.map((b) => {
                const on = selectedBranches.includes(b.id);
                return (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => setSelectedBranches((s) => toggle(s, b.id))}
                    className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                      on
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-input bg-background text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    {b.code} · {b.name}
                  </button>
                );
              })}
            </div>
          </div>

          <DialogFooter>
            <Button
              type="submit"
              disabled={
                busy ||
                !email ||
                !fullName ||
                password.length < 8 ||
                selectedBranches.length === 0
              }
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {t("create")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
