import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations, getLocale } from "next-intl/server";
import { Info, MapPin } from "lucide-react";
import { getPatientSession } from "@/lib/session";
import { patientFetch, publicFetch } from "@/lib/api";
import { SuccessCheck, Confetti } from "@/components/success-check";
import { formatPriceLabel } from "@/lib/format";

/**
 * Booking success screen (image 5).
 *
 * Arrives in TWO contexts:
 *   1. Guest who just booked — `bookGuestAction` already set the session
 *      cookie, so by the time we render this page the user is effectively
 *      logged in. We simply confirm + offer return-to-home.
 *   2. Logged-in patient who booked — same cookie is already present.
 *
 * In both cases we fetch the appointment via the authed patient endpoint to
 * resolve the service name and human-readable time, then render the confirmation.
 */

type AppointmentDetail = {
  id: string;
  scheduled_at: string;
  channel: string;
  status: string;
  branch?: { id: string; name: string };
  service?: { id: string; name: string; name_th: string };
  metadata?: {
    service_name?: string;
    service_id?: string;
    category_code?: string;
  } | null;
};

export default async function BookingSuccessPage({
  params,
}: {
  params: { id: string };
}) {
  const session = getPatientSession();
  if (!session) redirect("/");

  const t = await getTranslations("success");
  const locale = await getLocale();

  let appt: AppointmentDetail | null = null;
  let serviceName: string | null = null;
  let priceLabel: string | null = null;
  try {
    const res = await patientFetch(
      session,
      `/api/v1/patient/appointments/${params.id}`,
    );
    if (res.ok) {
      const json = (await res.json()) as { data: AppointmentDetail };
      appt = json.data;
      const meta = json.data.metadata ?? null;
      if (meta?.service_id) {
        const svcRes = await publicFetch(
          `/api/v1/public/services/${meta.service_id}`,
        );
        if (svcRes.ok) {
          const sj = (await svcRes.json()) as {
            data: {
              name: string;
              name_th: string;
              price_from: number | null;
              price_to: number | null;
            };
          };
          serviceName = locale === "th" ? sj.data.name_th : sj.data.name;
          priceLabel = formatPriceLabel(sj.data, locale);
        }
      } else if (meta?.service_name) {
        serviceName = meta.service_name;
      }
    }
  } catch {
    /* render minimal confirmation */
  }

  const time = appt
    ? new Date(appt.scheduled_at).toLocaleTimeString(
        locale === "th" ? "th-TH" : "en-US",
        { hour: "2-digit", minute: "2-digit" },
      )
    : null;

  return (
    <main className="mx-auto max-w-md px-4 pt-10 pb-10 min-h-[80vh] flex flex-col items-center justify-center">
      <Confetti />
      <div className="w-full max-w-sm text-center">
        {/* Success icon — SVG checkmark draws in over ~0.8s */}
        <div className="inline-flex h-20 w-20 items-center justify-center rounded-full bg-success/10 mb-4 animate-scale-in">
          <SuccessCheck size={56} />
        </div>

        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="text-sm text-muted-foreground mt-2">{t("subtitle")}</p>
        {serviceName ? (
          <p className="text-primary font-bold mt-1.5">{serviceName}</p>
        ) : null}
        {time ? (
          <p className="text-xs text-muted-foreground mt-1">
            {t("scheduled_at", { time })}
          </p>
        ) : null}

        {/* Detail rows */}
        <div className="mt-6 space-y-2">
          {appt?.branch ? (
            <div className="flex items-center justify-between rounded-2xl bg-card border p-3.5 text-sm shadow-soft">
              <span className="inline-flex items-center gap-2 text-muted-foreground text-xs">
                <MapPin className="h-3.5 w-3.5" />
                {t("location")}
              </span>
              <span className="font-medium">{appt.branch.name}</span>
            </div>
          ) : null}
          {priceLabel ? (
            <div className="flex items-center justify-between rounded-2xl bg-card border p-3.5 text-sm shadow-soft">
              <span className="inline-flex items-center gap-2 text-muted-foreground text-xs">
                <Info className="h-3.5 w-3.5" />
                {t("service_fee")}
              </span>
              <span className="font-bold text-primary">{priceLabel}</span>
            </div>
          ) : null}
        </div>

        <Link
          href="/"
          className="mt-8 inline-flex items-center justify-center rounded-full bg-foreground text-background px-8 py-3.5 text-sm font-semibold active:scale-[0.98] transition"
        >
          {t("back_home")}
        </Link>
      </div>
    </main>
  );
}
