"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Loader2, Phone, Smartphone, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { phoneLoginAction } from "./otp/actions";

const OTP_LENGTH = 6;

/**
 * Phone + OTP login. Single screen — when the user clicks "Send OTP" we
 * surface the OTP form in a modal layered over the phone form, so the user
 * stays in context (their phone number remains visible behind the dialog).
 *
 * The OTP value is currently mocked server-side — any 6-digit code is
 * accepted. Auth succeeds by matching `phoneHash` against the Patient table,
 * so only previously-booked patients can sign in. When the real OTP provider
 * is wired up, only the server endpoint changes.
 */
export function PhoneLoginForm() {
  const t = useTranslations("login");
  const router = useRouter();

  const [phone, setPhone] = useState("");
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [otpOpen, setOtpOpen] = useState(false);

  // OTP dialog state
  const [digits, setDigits] = useState<string[]>(Array(OTP_LENGTH).fill(""));
  const [otpError, setOtpError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const refs = useRef<Array<HTMLInputElement | null>>([]);

  // Mask phone for the OTP dialog header: 081-XXX-5678
  const maskedPhone = phone.replace(/\D/g, "").replace(
    /^(\d{3})\d{3}(\d{4})$/,
    "$1-XXX-$2",
  );

  // Focus first OTP digit when dialog opens
  useEffect(() => {
    if (otpOpen) {
      const id = window.setTimeout(() => refs.current[0]?.focus(), 50);
      return () => window.clearTimeout(id);
    }
  }, [otpOpen]);

  // Lock body scroll while dialog is open
  useEffect(() => {
    if (otpOpen) {
      const orig = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = orig;
      };
    }
  }, [otpOpen]);

  function onSendOtp(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPhoneError(null);
    if (phone.length !== 10) {
      setPhoneError(t("err_phone_short"));
      return;
    }
    setDigits(Array(OTP_LENGTH).fill(""));
    setOtpError(null);
    setOtpOpen(true);
  }

  function closeDialog() {
    if (pending) return;
    setOtpOpen(false);
  }

  function setDigitAt(index: number, value: string) {
    setDigits((cur) => {
      const next = [...cur];
      next[index] = value;
      return next;
    });
  }

  function onDigitChange(index: number, raw: string) {
    const cleaned = raw.replace(/\D/g, "").slice(-1);
    setDigitAt(index, cleaned);
    if (cleaned && index < OTP_LENGTH - 1) refs.current[index + 1]?.focus();
  }

  function onDigitKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !digits[index] && index > 0) {
      refs.current[index - 1]?.focus();
    }
  }

  function onPaste(e: React.ClipboardEvent<HTMLInputElement>) {
    e.preventDefault();
    const text = e.clipboardData.getData("text").replace(/\D/g, "");
    if (!text) return;
    const next = Array(OTP_LENGTH).fill("");
    for (let i = 0; i < Math.min(OTP_LENGTH, text.length); i++) next[i] = text[i]!;
    setDigits(next);
    refs.current[Math.min(OTP_LENGTH - 1, text.length - 1)]?.focus();
  }

  function verify(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setOtpError(null);
    const code = digits.join("");
    if (code.length !== OTP_LENGTH) {
      setOtpError(t("err_otp_length"));
      return;
    }
    start(async () => {
      try {
        await phoneLoginAction({ phone, otp_code: code });
        router.push("/");
        router.refresh();
      } catch (err) {
        setOtpError(err instanceof Error ? err.message : t("err_otp_invalid"));
      }
    });
  }

  return (
    <>
      {/* PHONE FORM */}
      <form onSubmit={onSendOtp} className="space-y-4">
        <div>
          <label className="block text-[10px] font-bold tracking-widest text-muted-foreground uppercase mb-1.5">
            {t("phone_label")}
          </label>
          <div className="relative">
            <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="tel"
              inputMode="numeric"
              autoComplete="tel"
              pattern="[0-9]*"
              maxLength={10}
              value={phone}
              onChange={(e) =>
                setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))
              }
              placeholder={t("phone_placeholder")}
              autoFocus
              required
              className="w-full rounded-2xl border bg-background pl-10 pr-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>
          <p className="text-[11px] text-muted-foreground mt-1.5 leading-relaxed">
            {t("phone_hint")}
          </p>
        </div>

        {phoneError ? (
          <div className="rounded-xl bg-destructive/10 text-destructive text-xs px-3 py-2">
            {phoneError}
          </div>
        ) : null}

        <button
          type="submit"
          className="w-full rounded-2xl bg-primary text-primary-foreground font-semibold py-3.5 active:scale-[0.98] transition"
        >
          {t("send_otp")}
        </button>
      </form>

      {/* OTP DIALOG */}
      {otpOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="otp-dialog-title"
        >
          {/* backdrop — keeps the phone form visible blurred underneath */}
          <button
            type="button"
            aria-label="Close"
            className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-fade-in"
            onClick={closeDialog}
          />

          <div className="relative w-full sm:max-w-sm bg-card rounded-t-3xl sm:rounded-3xl shadow-soft-lg p-6 pb-8 animate-slide-up">
            <button
              type="button"
              onClick={closeDialog}
              disabled={pending}
              className="absolute right-4 top-4 inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-muted transition disabled:opacity-50"
              aria-label={t("back_phone")}
            >
              <X className="h-4 w-4" />
            </button>

            <div className="flex flex-col items-center gap-3 text-center mb-4">
              <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center">
                <Smartphone className="h-7 w-7 text-primary" />
              </div>
              <div>
                <h2 id="otp-dialog-title" className="font-semibold">
                  {t("otp_title")}
                </h2>
                <p className="text-xs text-muted-foreground mt-1">
                  {t("otp_subtitle")}{" "}
                  <span className="font-semibold text-foreground">
                    {maskedPhone || phone}
                  </span>
                </p>
              </div>
            </div>

            <form onSubmit={verify} className="space-y-4">
              <div className="flex justify-center gap-2">
                {digits.map((d, i) => (
                  <input
                    key={i}
                    ref={(el) => {
                      refs.current[i] = el;
                    }}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={d}
                    onChange={(e) => onDigitChange(i, e.target.value)}
                    onKeyDown={(e) => onDigitKeyDown(i, e)}
                    onPaste={onPaste}
                    className={cn(
                      "h-12 w-10 rounded-xl border bg-background text-center text-lg font-bold focus:outline-none focus:ring-2 focus:ring-primary/50 transition",
                      d && "border-primary bg-primary/5",
                    )}
                  />
                ))}
              </div>

              {otpError ? (
                <div className="rounded-xl bg-destructive/10 text-destructive text-xs px-3 py-2">
                  {otpError}
                </div>
              ) : null}

              <button
                type="submit"
                disabled={pending}
                className="w-full rounded-2xl bg-primary text-primary-foreground font-semibold py-3.5 disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98] transition inline-flex items-center justify-center gap-2"
              >
                {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {t("verify_otp")}
              </button>

              <div className="text-center pt-2 border-t">
                <button
                  type="button"
                  disabled
                  className="text-xs text-muted-foreground hover:text-foreground transition disabled:opacity-50"
                >
                  {t("resend_otp")}
                </button>
              </div>

              <p className="text-center text-[11px] text-muted-foreground">
                {t("otp_demo_hint")}
              </p>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
