"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  MoreHorizontal,
  Pencil,
  KeyRound,
  Shield,
  Building2,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { clientApi } from "@/lib/clientApi";

type AdminUser = {
  id: string;
  email: string;
  fullName: string;
  status: "ACTIVE" | "INACTIVE" | "LOCKED";
  roles: Array<{ code: string; name: string }>;
  branches: Array<{ id: string; code: string; name: string }>;
};

type Mode = null | "edit" | "password" | "roles" | "branches";

export function UserRowActions({
  user,
  allRoles,
  allBranches,
}: {
  user: AdminUser;
  allRoles: Array<{ code: string; name: string }>;
  allBranches: Array<{ id: string; code: string; name: string }>;
}) {
  const t = useTranslations("admin_users");
  const router = useRouter();
  const [mode, setMode] = React.useState<Mode>(null);

  const close = () => setMode(null);
  const onDone = () => {
    close();
    router.refresh();
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>{user.email}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setMode("edit")}>
            <Pencil className="h-4 w-4" /> {t("edit")}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setMode("roles")}>
            <Shield className="h-4 w-4" /> {t("assign_roles")}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setMode("branches")}>
            <Building2 className="h-4 w-4" /> {t("assign_branches")}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setMode("password")}>
            <KeyRound className="h-4 w-4" /> {t("reset_password")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {mode === "edit" && (
        <EditUserDialog user={user} onDone={onDone} onCancel={close} />
      )}
      {mode === "password" && (
        <ResetPasswordDialog user={user} onDone={onDone} onCancel={close} />
      )}
      {mode === "roles" && (
        <AssignRolesDialog
          user={user}
          allRoles={allRoles}
          onDone={onDone}
          onCancel={close}
        />
      )}
      {mode === "branches" && (
        <AssignBranchesDialog
          user={user}
          allBranches={allBranches}
          onDone={onDone}
          onCancel={close}
        />
      )}
    </>
  );
}

function EditUserDialog({
  user,
  onDone,
  onCancel,
}: {
  user: AdminUser;
  onDone: () => void;
  onCancel: () => void;
}) {
  const t = useTranslations("admin_users");
  const tCommon = useTranslations("common");
  const [fullName, setFullName] = React.useState(user.fullName);
  const [status, setStatus] = React.useState(user.status);
  const [busy, setBusy] = React.useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await clientApi.patch(`/api/v1/admin/users/${user.id}`, {
        full_name: fullName,
        status,
      });
      toast.success(t("update_success"));
      onDone();
    } catch (err) {
      toast.error(String((err as Error).message ?? err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("edit")}</DialogTitle>
          <DialogDescription>{user.email}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="fullName">{t("full_name")}</Label>
            <Input
              id="fullName"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="status">{t("status")}</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as AdminUser["status"])}>
              <SelectTrigger id="status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ACTIVE">ACTIVE</SelectItem>
                <SelectItem value="INACTIVE">INACTIVE</SelectItem>
                <SelectItem value="LOCKED">LOCKED</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>
              {tCommon("cancel")}
            </Button>
            <Button type="submit" disabled={busy}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {tCommon("save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ResetPasswordDialog({
  user,
  onDone,
  onCancel,
}: {
  user: AdminUser;
  onDone: () => void;
  onCancel: () => void;
}) {
  const t = useTranslations("admin_users");
  const tCommon = useTranslations("common");
  const [password, setPassword] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await clientApi.post(`/api/v1/admin/users/${user.id}/password`, {
        new_password: password,
      });
      toast.success(t("reset_password_success"));
      onDone();
    } catch (err) {
      toast.error(String((err as Error).message ?? err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("reset_password")}</DialogTitle>
          <DialogDescription>
            {t("reset_password_desc")} · {user.email}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="newPw">{t("new_password")}</Label>
            <Input
              id="newPw"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={8}
              required
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>
              {tCommon("cancel")}
            </Button>
            <Button type="submit" disabled={busy || password.length < 8}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {tCommon("save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AssignRolesDialog({
  user,
  allRoles,
  onDone,
  onCancel,
}: {
  user: AdminUser;
  allRoles: Array<{ code: string; name: string }>;
  onDone: () => void;
  onCancel: () => void;
}) {
  const t = useTranslations("admin_users");
  const tCommon = useTranslations("common");
  const [selected, setSelected] = React.useState<string[]>(
    user.roles.map((r) => r.code),
  );
  const [busy, setBusy] = React.useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await clientApi.put(`/api/v1/admin/users/${user.id}/roles`, {
        role_codes: selected,
      });
      toast.success(t("assign_roles_success"));
      onDone();
    } catch (err) {
      toast.error(String((err as Error).message ?? err));
    } finally {
      setBusy(false);
    }
  }

  function toggle(code: string) {
    setSelected((s) => (s.includes(code) ? s.filter((x) => x !== code) : [...s, code]));
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("assign_roles")}</DialogTitle>
          <DialogDescription>{user.email}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {allRoles.map((r) => {
              const on = selected.includes(r.code);
              return (
                <button
                  key={r.code}
                  type="button"
                  onClick={() => toggle(r.code)}
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
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>
              {tCommon("cancel")}
            </Button>
            <Button type="submit" disabled={busy}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {tCommon("save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AssignBranchesDialog({
  user,
  allBranches,
  onDone,
  onCancel,
}: {
  user: AdminUser;
  allBranches: Array<{ id: string; code: string; name: string }>;
  onDone: () => void;
  onCancel: () => void;
}) {
  const t = useTranslations("admin_users");
  const tCommon = useTranslations("common");
  const [selected, setSelected] = React.useState<string[]>(
    user.branches.map((b) => b.id),
  );
  const [busy, setBusy] = React.useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await clientApi.put(`/api/v1/admin/users/${user.id}/branches`, {
        branch_ids: selected,
      });
      toast.success(t("assign_branches_success"));
      onDone();
    } catch (err) {
      toast.error(String((err as Error).message ?? err));
    } finally {
      setBusy(false);
    }
  }

  function toggle(id: string) {
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("assign_branches")}</DialogTitle>
          <DialogDescription>{user.email}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {allBranches.map((b) => {
              const on = selected.includes(b.id);
              return (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => toggle(b.id)}
                  className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                    on
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-input bg-background text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {b.code}
                </button>
              );
            })}
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>
              {tCommon("cancel")}
            </Button>
            <Button type="submit" disabled={busy}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {tCommon("save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
