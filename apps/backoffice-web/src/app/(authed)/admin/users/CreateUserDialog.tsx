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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ImageUploader } from "@/components/ui/image-uploader";
import { clientApi } from "@/lib/clientApi";

type Role = { code: string; name: string };
type Branch = { id: string; code: string; name: string };

/**
 * Create user dialog (v2 — phone-based).
 *
 * Differences from v1:
 *   • Email is gone (only phone is required for login).
 *   • One role per user (Select, not multi-select chips).
 *   • Optional avatar uploader.
 *   • Password is optional — phone+OTP is the canonical login. Field is kept
 *     for back-compat with tests that hit the legacy endpoint.
 *
 * Phase Q — role-allowlist:
 *   • The list of selectable roles is derived from `actorRoles` (the calling
 *     user's role codes from session). The server enforces the same rules,
 *     this is just so the dropdown matches what the API will accept.
 */
export function CreateUserDialog({
  roles,
  branches,
  actorRoles,
}: {
  roles: Role[];
  branches: Branch[];
  /** Role codes from session.roles — drives which roles appear in dropdown. */
  actorRoles?: string[];
}) {
  const router = useRouter();
  const t = useTranslations("admin_users");
  // ADMIN is a system role provisioned at install time — not assignable from
  // the UI. MANAGER may only assign operational roles; ADMIN may assign
  // MANAGER + operational roles. The server enforces the same rules.
  const assignableRoles = React.useMemo(() => {
    const isAdmin = actorRoles?.includes("ADMIN") ?? false;
    const operational = ["DOCTOR", "NURSE", "RECEPTION", "PHARMACIST"];
    const allowed = new Set<string>(isAdmin ? ["MANAGER", ...operational] : operational);
    return roles.filter((r) => allowed.has(r.code));
  }, [roles, actorRoles]);
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [phone, setPhone] = React.useState("");
  const [fullName, setFullName] = React.useState("");
  const [roleCode, setRoleCode] = React.useState<string>(
    assignableRoles[0]?.code ?? "",
  );
  const [avatarUrl, setAvatarUrl] = React.useState<string | null>(null);
  const [selectedBranches, setSelectedBranches] = React.useState<string[]>(
    branches.map((b) => b.id),
  );

  function reset() {
    setPhone("");
    setFullName("");
    setAvatarUrl(null);
    setRoleCode(assignableRoles[0]?.code ?? "");
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
        phone: phone.trim(),
        full_name: fullName,
        role_code: roleCode,
        avatar_url: avatarUrl ?? undefined,
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
          <div className="flex items-start gap-4">
            <div className="w-32 shrink-0">
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
                <Label htmlFor="full_name">{t("full_name")}</Label>
                <Input
                  id="full_name"
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
                  placeholder="0800000003"
                />
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="role">{t("role")}</Label>
            <Select value={roleCode} onValueChange={setRoleCode}>
              <SelectTrigger id="role">
                <SelectValue placeholder={t("role")} />
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
            <Label>{t("branches")}</Label>
            <div className="flex flex-wrap gap-2">
              {branches.map((b) => {
                const on = selectedBranches.includes(b.id);
                return (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() =>
                      setSelectedBranches((s) => toggle(s, b.id))
                    }
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
                phone.trim().length < 4 ||
                !fullName ||
                !roleCode ||
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
