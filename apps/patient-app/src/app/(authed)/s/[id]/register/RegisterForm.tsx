"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Camera, Loader2, Phone, User } from "lucide-react";

const GUEST_HANDOFF_KEY = "lx_pending_registration";

export type GuestRegistration = {
  serviceId: string;
  fullName: string;
  phone: string;
  kycImageDataUrl: string | null;
};

/**
 * Identity capture form (image 3). On submit we DON'T hit the API yet —
 * just stash the data in sessionStorage and forward to the booking page.
 * The actual booking POST happens after the user has chosen a slot, so
 * we send name + phone + KYC + slot in one atomic request.
 */
export function RegisterForm({ serviceId }: { serviceId: string }) {
  const t = useTranslations("register");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [kycFileName, setKycFileName] = useState<string | null>(null);
  const kycDataUrlRef = useRef<string | null>(null);

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) {
      kycDataUrlRef.current = null;
      setKycFileName(null);
      return;
    }
    // Hard cap at 5MB to avoid storing massive base64 blobs in sessionStorage.
    if (file.size > 5 * 1024 * 1024) {
      setError(t("kyc_too_large"));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      kycDataUrlRef.current = typeof reader.result === "string" ? reader.result : null;
      setKycFileName(file.name);
    };
    reader.readAsDataURL(file);
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = e.currentTarget;
    const fullName = String(new FormData(form).get("full_name") ?? "").trim();
    const phone = String(new FormData(form).get("phone") ?? "").trim();
    if (fullName.length < 2) {
      setError(t("err_name_short"));
      return;
    }
    if (phone.replace(/\D/g, "").length < 8) {
      setError(t("err_phone_short"));
      return;
    }
    const payload: GuestRegistration = {
      serviceId,
      fullName,
      phone,
      kycImageDataUrl: kycDataUrlRef.current,
    };
    try {
      window.sessionStorage.setItem(GUEST_HANDOFF_KEY, JSON.stringify(payload));
    } catch {
      // sessionStorage may fail in private mode — fall back to URL params (not
      // ideal because of length but works in a pinch).
      setError(t("err_session_storage"));
      return;
    }
    start(() => {
      router.push(`/s/${serviceId}/book`);
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {/* Full name */}
      <div>
        <label className="block text-[10px] font-bold tracking-widest text-muted-foreground uppercase mb-1.5">
          {t("full_name_label")}
        </label>
        <div className="relative">
          <User className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            name="full_name"
            required
            placeholder={t("full_name_placeholder")}
            className="w-full rounded-2xl border bg-background pl-10 pr-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        </div>
      </div>

      {/* Phone */}
      <div>
        <label className="block text-[10px] font-bold tracking-widest text-muted-foreground uppercase mb-1.5">
          {t("phone_label")}
        </label>
        <div className="relative">
          <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="tel"
            name="phone"
            inputMode="tel"
            required
            placeholder={t("phone_placeholder")}
            className="w-full rounded-2xl border bg-background pl-10 pr-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        </div>
      </div>

      {/* KYC upload */}
      <div>
        <label className="block">
          <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed bg-background/50 py-6 cursor-pointer hover:bg-accent/30 transition">
            <Camera className="h-6 w-6 text-muted-foreground" />
            <p className="text-sm font-medium">
              {kycFileName ?? t("kyc_label")}
            </p>
            <p className="text-[10px] text-muted-foreground">
              {t("kyc_subtitle")}
            </p>
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={onFileChange}
            />
          </div>
        </label>
      </div>

      {error ? (
        <div className="rounded-xl bg-destructive/10 text-destructive text-xs px-3 py-2">
          {error}
        </div>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-2xl bg-primary text-primary-foreground font-semibold py-3.5 disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98] transition inline-flex items-center justify-center gap-2"
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        {t("submit")}
      </button>
    </form>
  );
}
