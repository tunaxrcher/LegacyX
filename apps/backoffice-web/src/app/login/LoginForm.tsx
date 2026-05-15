"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  AlertCircle,
  Building2,
  Loader2,
  Phone as PhoneIcon,
  Shield,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { phoneLookupAction, phoneLoginAction } from "./actions";

type Tenant = { id: string; slug: string; name: string };
type Role = { code: string; name: string };
type Props = {
  tenants: Tenant[];
  defaultTenantSlug?: string;
};

const OTP_LEN = 6;

/**
 * Phone + OTP login.
 *
 * Flow:
 *   1. User enters phone → we POST /auth/phone/lookup.
 *   2. If the phone resolves to 0 or 1 roles → open the OTP dialog directly.
 *      If 2+ roles → show a role picker INSIDE the OTP dialog header.
 *   3. OTP entry is six single-char boxes with auto-advance & paste support.
 *      In dev mode any phone accepts the universal OTP `123456`.
 *
 * The dialog overlays the phone screen so the user still sees the number they
 * just entered.
 */
export default function LoginForm({ tenants, defaultTenantSlug }: Props) {
  const t = useTranslations("login");
  const router = useRouter();

  const [tenantSlug, setTenantSlug] = React.useState<string>(
    defaultTenantSlug ?? tenants[0]?.slug ?? "legacyx",
  );
  const [phone, setPhone] = React.useState("");
  const [phoneError, setPhoneError] = React.useState<string | null>(null);
  const [lookupPending, setLookupPending] = React.useState(false);

  // Dialog state
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [roles, setRoles] = React.useState<Role[]>([]);
  const [pickedRole, setPickedRole] = React.useState<string | null>(null);
  const [otp, setOtp] = React.useState<string[]>(Array(OTP_LEN).fill(""));
  const [otpError, setOtpError] = React.useState<string | null>(null);
  const [loginPending, setLoginPending] = React.useState(false);
  const inputsRef = React.useRef<Array<HTMLInputElement | null>>([]);

  function resetOtp() {
    setOtp(Array(OTP_LEN).fill(""));
    setOtpError(null);
  }

  async function onPhoneSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPhoneError(null);
    const normalized = phone.trim();
    if (normalized.length < 9) {
      setPhoneError(t("phone_too_short"));
      return;
    }
    setLookupPending(true);
    const r = await phoneLookupAction({
      tenant_slug: tenantSlug,
      phone: normalized,
    });
    setLookupPending(false);
    if (!r.ok) {
      setPhoneError(r.error);
      return;
    }
    // Phone-not-on-file → block the OTP step. Better UX than letting the user
    // type a 6-digit OTP only to be told the account doesn't exist. The lookup
    // endpoint deliberately returns an empty list (rather than 404) for
    // unknown phones, so we classify here.
    if (r.roles.length === 0) {
      setPhoneError(t("phone_not_found"));
      return;
    }
    setRoles(r.roles);
    setPickedRole(r.roles.length === 1 ? r.roles[0]!.code : null);
    resetOtp();
    setDialogOpen(true);
    // Focus first OTP cell once the dialog has rendered.
    setTimeout(() => inputsRef.current[0]?.focus(), 80);
  }

  function setOtpAt(idx: number, val: string) {
    const cleaned = val.replace(/\D/g, "").slice(-1);
    setOtp((prev) => {
      const next = [...prev];
      next[idx] = cleaned;
      return next;
    });
    if (cleaned && idx + 1 < OTP_LEN) {
      inputsRef.current[idx + 1]?.focus();
    }
  }

  function onOtpKeyDown(
    e: React.KeyboardEvent<HTMLInputElement>,
    idx: number,
  ) {
    if (e.key === "Backspace") {
      if (otp[idx]) {
        setOtpAt(idx, "");
      } else if (idx > 0) {
        inputsRef.current[idx - 1]?.focus();
        setOtpAt(idx - 1, "");
      }
    } else if (e.key === "ArrowLeft" && idx > 0) {
      inputsRef.current[idx - 1]?.focus();
    } else if (e.key === "ArrowRight" && idx + 1 < OTP_LEN) {
      inputsRef.current[idx + 1]?.focus();
    } else if (e.key === "Enter") {
      void submitOtp();
    }
  }

  function onOtpPaste(e: React.ClipboardEvent<HTMLInputElement>) {
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "");
    if (!pasted) return;
    e.preventDefault();
    const next = Array(OTP_LEN).fill("");
    for (let i = 0; i < Math.min(pasted.length, OTP_LEN); i++) {
      next[i] = pasted[i]!;
    }
    setOtp(next);
    const lastIdx = Math.min(pasted.length, OTP_LEN) - 1;
    inputsRef.current[Math.min(lastIdx + 1, OTP_LEN - 1)]?.focus();
  }

  async function submitOtp() {
    if (loginPending) return;
    const code = otp.join("");
    if (code.length < OTP_LEN) {
      setOtpError(t("otp_too_short"));
      return;
    }
    if (roles.length > 1 && !pickedRole) {
      setOtpError(t("select_role_first"));
      return;
    }
    setLoginPending(true);
    setOtpError(null);
    const r = await phoneLoginAction({
      tenant_slug: tenantSlug,
      phone: phone.trim(),
      otp: code,
      role_code: pickedRole ?? undefined,
    });
    setLoginPending(false);
    if (!r.ok) {
      setOtpError(r.error);
      return;
    }
    router.replace("/");
    router.refresh();
  }

  const canSubmitOtp =
    otp.every((d) => d !== "") &&
    (roles.length <= 1 || !!pickedRole) &&
    !loginPending;

  return (
    <>
      <form onSubmit={onPhoneSubmit} className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="tenant_slug">{t("tenant")}</Label>
          {tenants.length > 0 ? (
            <Select value={tenantSlug} onValueChange={setTenantSlug}>
              <SelectTrigger id="tenant_slug">
                <Building2 className="h-4 w-4 text-muted-foreground" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {tenants.map((tn) => (
                  <SelectItem key={tn.id} value={tn.slug}>
                    <span className="font-medium">{tn.name}</span>
                    <span className="ml-2 font-mono text-[10px] text-muted-foreground">
                      {tn.slug}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Input
              id="tenant_slug"
              value={tenantSlug}
              onChange={(e) => setTenantSlug(e.target.value)}
              placeholder="legacyx"
              required
            />
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="phone">{t("phone")}</Label>
          <div className="relative">
            <PhoneIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              required
              value={phone}
              onChange={(e) => {
                const value = e.target.value
                  .replace(/\D/g, "") // เอาเฉพาะตัวเลข
                  .slice(0, 10); // จำกัด 10 ตัว
            
                setPhone(value);
              }}
              placeholder="0800000003"
              className="pl-9"
            />
          </div>
        </div>

        {phoneError && (
          <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{phoneError}</span>
          </div>
        )}

        <Button
          type="submit"
          size="lg"
          className="w-full"
          disabled={lookupPending}
        >
          {lookupPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <></>
          )}
          {lookupPending ? t("sending_otp") : t("send_otp")}
        </Button>
      </form>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-center">
              {t("otp_title")}
            </DialogTitle>
            <DialogDescription>
              {t("otp_subtitle")}{" "}
              <span className="font-mono font-medium text-foreground">
                {phone}
              </span>
            </DialogDescription>
          </DialogHeader>

          {roles.length > 1 && (
            <div className="space-y-2">
              <Label>{t("pick_role")}</Label>
              <Select
                value={pickedRole ?? undefined}
                onValueChange={(v) => setPickedRole(v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t("pick_role_placeholder")} />
                </SelectTrigger>
                <SelectContent>
                  {roles.map((r) => (
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
          )}

          <div className="space-y-2">
            <Label>{t("otp_code")}</Label>
            <div className="flex justify-between gap-2">
              {otp.map((d, i) => (
                <input
                  key={i}
                  ref={(el) => {
                    inputsRef.current[i] = el;
                  }}
                  value={d}
                  onChange={(e) => setOtpAt(i, e.target.value)}
                  onKeyDown={(e) => onOtpKeyDown(e, i)}
                  onPaste={onOtpPaste}
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={1}
                  className="h-12 w-10 rounded-md border border-input bg-background text-center text-lg font-semibold tabular-nums shadow-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30"
                />
              ))}
            </div>
            <p className="text-xs text-muted-foreground">{t("otp_dev_hint")}</p>
          </div>

          {otpError && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{otpError}</span>
            </div>
          )}

          <Button
            type="button"
            onClick={() => void submitOtp()}
            disabled={!canSubmitOtp}
            size="lg"
            className="w-full"
          >
            {loginPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : null}
            {loginPending ? t("signing_in") : t("verify_otp")}
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
