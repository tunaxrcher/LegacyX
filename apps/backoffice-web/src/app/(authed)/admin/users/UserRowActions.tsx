"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  MoreHorizontal,
  Pencil,
  KeyRound,
  Building2,
  Loader2,
  Unlock,
  LogOut,
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
import { ImageUploader } from "@/components/ui/image-uploader";
import { clientApi } from "@/lib/clientApi";

type AdminUser = {
  id: string;
  phone: string | null;
  avatarUrl: string | null;
  primaryRoleCode: string | null;
  fullName: string;
  status: "ACTIVE" | "INACTIVE" | "LOCKED";
  roles: Array<{ code: string; name: string }>;
  branches: Array<{ id: string; code: string; name: string }>;
};

type Mode = null | "edit" | "password" | "branches";

export function UserRowActions({
  user,
  allRoles,
  allBranches,
  actorRoles,
}: {
  user: AdminUser;
  allRoles: Array<{ code: string; name: string }>;
  allBranches: Array<{ id: string; code: string; name: string }>;
  /** Role codes from session.roles — passed through to dialogs for SoD. */
  actorRoles?: string[];
}) {
  const t = useTranslations("admin_users");
  const router = useRouter();
  const [mode, setMode] = React.useState<Mode>(null);
  const [busyAction, setBusyAction] = React.useState<
    "unlock" | "revoke" | null
  >(null);

  const close = () => setMode(null);
  const onDone = () => {
    close();
    router.refresh();
  };

  async function unlock() {
    if (!confirm(t("unlock_confirm"))) return;
    setBusyAction("unlock");
    try {
      const res = await clientApi.post<{
        data: { changed: boolean; status: string };
      }>(`/api/v1/admin/users/${user.id}/unlock`, {});
      if (res.data.changed) {
        toast.success(t("unlock_success"));
      } else {
        toast.message(t("unlock_noop"));
      }
      router.refresh();
    } catch (err) {
      toast.error(String((err as Error).message ?? err));
    } finally {
      setBusyAction(null);
    }
  }

  async function revokeSessions() {
    if (!confirm(t("revoke_sessions_confirm"))) return;
    setBusyAction("revoke");
    try {
      const res = await clientApi.post<{ data: { revoked: number } }>(
        `/api/v1/admin/users/${user.id}/revoke-sessions`,
        {},
      );
      toast.success(
        t("revoke_sessions_success", { count: res.data.revoked }),
      );
      router.refresh();
    } catch (err) {
      toast.error(String((err as Error).message ?? err));
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8">
            {busyAction ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <MoreHorizontal className="h-4 w-4" />
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>{user.phone ?? user.fullName}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setMode("edit")}>
            <Pencil className="h-4 w-4" /> {t("edit")}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setMode("branches")}>
            <Building2 className="h-4 w-4" /> {t("assign_branches")}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setMode("password")}>
            <KeyRound className="h-4 w-4" /> {t("reset_password")}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={unlock}
            disabled={user.status !== "LOCKED" || busyAction !== null}
          >
            <Unlock className="h-4 w-4" /> {t("unlock")}
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={revokeSessions}
            disabled={busyAction !== null}
          >
            <LogOut className="h-4 w-4" /> {t("revoke_sessions")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {mode === "edit" && (
        <EditUserDialog
          user={user}
          allRoles={allRoles}
          actorRoles={actorRoles}
          onDone={onDone}
          onCancel={close}
        />
      )}
      {mode === "password" && (
        <ResetPasswordDialog user={user} onDone={onDone} onCancel={close} />
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
  allRoles,
  actorRoles,
  onDone,
  onCancel,
}: {
  user: AdminUser;
  allRoles: Array<{ code: string; name: string }>;
  actorRoles?: string[];
  onDone: () => void;
  onCancel: () => void;
}) {
  const t = useTranslations("admin_users");
  const tCommon = useTranslations("common");
  // SoD-aware role list — same rule as CreateUserDialog. We always KEEP the
  // user's current role in the list so editing other fields doesn't force
  // a role change (and so a Manager editing a junior user without changing
  // their role still gets a valid Select state).
  const assignableRoles = React.useMemo(() => {
    const isAdmin = actorRoles?.includes("ADMIN") ?? false;
    const operational = ["DOCTOR", "NURSE", "RECEPTION", "PHARMACIST"];
    const allowed = new Set<string>(isAdmin ? ["MANAGER", ...operational] : operational);
    if (user.primaryRoleCode) allowed.add(user.primaryRoleCode);
    return allRoles.filter((r) => allowed.has(r.code));
  }, [allRoles, actorRoles, user.primaryRoleCode]);
  const [fullName, setFullName] = React.useState(user.fullName);
  const [phone, setPhone] = React.useState(user.phone ?? "");
  const [roleCode, setRoleCode] = React.useState(
    user.primaryRoleCode ??
      user.roles[0]?.code ??
      assignableRoles[0]?.code ??
      "",
  );
  const [avatarUrl, setAvatarUrl] = React.useState<string | null>(
    user.avatarUrl,
  );
  const [status, setStatus] = React.useState(user.status);
  const [busy, setBusy] = React.useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await clientApi.patch(`/api/v1/admin/users/${user.id}`, {
        full_name: fullName,
        phone: phone.trim() || undefined,
        role_code: roleCode || undefined,
        avatar_url: avatarUrl,
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
          <DialogDescription>
            {user.phone ?? user.fullName}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="flex items-start gap-4">
            <div className="w-28 shrink-0">
              <ImageUploader
                value={avatarUrl}
                onChange={setAvatarUrl}
                uploadUrl="/api/v1/uploads/avatar"
                aspect="aspect-square"
                label={t("avatar")}
              />
            </div>
            <div className="flex-1 space-y-3">
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
                <Label htmlFor="phone">{t("phone")}</Label>
                <Input
                  id="phone"
                  type="tel"
                  inputMode="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  required
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="role">{t("role")}</Label>
              <Select value={roleCode} onValueChange={setRoleCode}>
                <SelectTrigger id="role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {assignableRoles.map((r) => (
                    <SelectItem key={r.code} value={r.code}>
                      <span className="font-medium">{r.name}</span>
                      <span className="ml-2 font-mono text-[10px] text-muted-foreground">
                        {r.code}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="status">{t("status")}</Label>
              <Select
                value={status}
                onValueChange={(v) => setStatus(v as AdminUser["status"])}
              >
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
          </div>

          <DialogFooter>
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
            {t("reset_password_desc")} · {user.phone ?? user.fullName}
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
    setSelected((s) =>
      s.includes(id) ? s.filter((x) => x !== id) : [...s, id],
    );
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("assign_branches")}</DialogTitle>
          <DialogDescription>
            {user.phone ?? user.fullName}
          </DialogDescription>
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
