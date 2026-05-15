import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ArrowLeft } from "lucide-react";
import { getPatientSession } from "@/lib/session";
import { RegisterForm } from "./RegisterForm";

type Service = {
  id: string;
  code: string;
  name: string;
  name_th: string;
  category: { id: string; code: string; name: string; name_th: string };
};

const API_BASE = process.env.API_BASE_URL ?? "http://localhost:3001";

/**
 * Registration screen (image 3).
 *
 * Behaviour:
 *   - If session cookie is present → skip directly to booking page. The user
 *     is already a known patient, no KYC needed.
 *   - Otherwise render the name + phone + KYC upload form. The form's submit
 *     action is the actual booking call (`/api/v1/public/book`) — registration
 *     and the appointment are CREATED ATOMICALLY in one round-trip so we never
 *     have a half-onboarded patient sitting in the DB without an appointment.
 *
 * The form's "next step" therefore goes via /s/[id]/book (slot picker), not
 * back to this page. We pre-collect identity then carry it forward in
 * sessionStorage as a transient handoff.
 */
export default async function ServiceRegisterPage({
  params,
}: {
  params: { id: string };
}) {
  const session = getPatientSession();
  if (session) {
    redirect(`/s/${params.id}/book`);
  }

  const t = await getTranslations("register");

  let service: Service | null = null;
  try {
    const res = await fetch(
      `${API_BASE}/api/v1/public/services/${params.id}?tenant_slug=legacyx`,
      { cache: "no-store" },
    );
    if (res.ok) {
      const json = (await res.json()) as { data: Service };
      service = json.data;
    } else if (res.status === 404) {
      notFound();
    }
  } catch {
    /* will show empty state */
  }

  if (!service) notFound();

  return (
    <main className="mx-auto max-w-md px-4 pt-4 pb-10 animate-fade-in">
      {/* Header */}
      <div className="mb-6">
        <Link
          href={`/c/${service.category.code}`}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition"
        >
          <ArrowLeft className="h-4 w-4" />
          {t("back")}
        </Link>
      </div>

      <div className="rounded-3xl border bg-card shadow-soft-lg p-6">
        <h1 className="text-xl font-bold text-center">{t("title")}</h1>
        <div className="flex justify-center mt-3 mb-6">
          <span className="rounded-full bg-primary/10 text-primary px-3 py-1 text-xs font-semibold">
            {service.name_th}
          </span>
        </div>

        <RegisterForm serviceId={service.id} />
      </div>
    </main>
  );
}
