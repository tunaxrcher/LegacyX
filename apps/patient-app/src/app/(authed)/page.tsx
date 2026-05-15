import Image from "next/image";
import Link from "next/link";
import { getTranslations, getLocale } from "next-intl/server";
import {
  ChevronRight,
  HeartPulse,
  LogIn,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  type LucideIcon,
} from "lucide-react";
import { getPatientSession, type PatientSession } from "@/lib/session";
import { patientJson } from "@/lib/api";
import { LineSection } from "./profile/LineSection";
import { HeroMesh } from "@/components/hero-mesh";
import { BlurImage } from "@/components/blur-image";
import { RippleSurface } from "@/components/ripple";

type Category = {
  id: string;
  code: string;
  name: string;
  name_th: string;
  description: string | null;
  description_th: string | null;
  image_url: string | null;
};

type ProfileLineSummary = {
  line_linked: boolean;
  line_display_name: string | null;
  line_picture_url: string | null;
  line_linked_at: string | null;
  line_notifications_opt_in: boolean;
  line_friend_status: "UNKNOWN" | "FRIEND" | "BLOCKED";
};

const API_BASE = process.env.API_BASE_URL ?? "http://localhost:3001";

/** Lightweight profile fetch for the home strip — only the LINE fields. */
async function getLineSummary(
  session: PatientSession,
): Promise<ProfileLineSummary | null> {
  try {
    const res = await patientJson<{ data: ProfileLineSummary }>(
      session,
      "/api/v1/patient/me",
    );
    return res.data;
  } catch {
    return null;
  }
}

/**
 * Visual identity for each category card.
 * Mapped by `code` so seed/admin can add more categories with a sensible
 * fallback ("default" theme used for any code we don't recognise).
 */
const CATEGORY_THEME: Record<
  string,
  { icon: LucideIcon; iconBg: string; iconColor: string }
> = {
  dental: {
    icon: Stethoscope,
    iconBg: "bg-blue-500",
    iconColor: "text-white",
  },
  beauty: {
    icon: Sparkles,
    iconBg: "bg-teal-500",
    iconColor: "text-white",
  },
  wellness: {
    icon: HeartPulse,
    iconBg: "bg-rose-500",
    iconColor: "text-white",
  },
  default: {
    icon: Sparkles,
    iconBg: "bg-primary",
    iconColor: "text-primary-foreground",
  },
};

export default async function WelcomePage() {
  const session = getPatientSession();
  const t = await getTranslations("welcome");
  const tApp = await getTranslations("app");
  const tLogin = await getTranslations("login");
  const locale = await getLocale();

  let categories: Category[] = [];
  try {
    const res = await fetch(
      `${API_BASE}/api/v1/public/categories?tenant_slug=legacyx`,
      { cache: "no-store" },
    );
    if (res.ok) {
      const json = (await res.json()) as { data: Category[] };
      categories = json.data ?? [];
    }
  } catch {
    /* render empty state */
  }

  // ────────────────────────────────────────────────────────────────────────
  // GUEST mode — full-width "marketing" landing: top bar (logo + sign in),
  // centred hero, responsive category grid, ecosystem footer. Designed for
  // both desktop browsers and the mobile PWA.
  // ────────────────────────────────────────────────────────────────────────
  if (!session) {
    return (
      <div className="relative min-h-screen flex flex-col bg-background overflow-hidden">
        <HeroMesh />
        {/* Top bar */}
        <header className="sticky top-0 z-30 bg-background/85 backdrop-blur-md border-b">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-10 h-16 flex items-center justify-between gap-3">
            <Link href="/" className="flex items-center gap-2 shrink-0">
              <Image
                src="/logo.png"
                alt={tApp("name")}
                width={1000}
                height={234}
                priority
                className="h-7 sm:h-8 w-auto object-contain"
              />
            </Link>
            <Link
              href="/login"
              className="btn-gradient inline-flex items-center gap-1.5 rounded-full px-4 sm:px-5 py-2 text-xs sm:text-sm font-semibold"
            >
              <LogIn className="h-4 w-4" />
              {tLogin("phone_title")}
            </Link>
          </div>
        </header>

        {/* Main */}
        <main className="flex-1 px-4 sm:px-6 lg:px-10 py-8 sm:py-12">
          <div className="mx-auto max-w-7xl">
            {/* Hero */}
            <section className="text-center mb-10 sm:mb-12">
              <div className="flex justify-center mb-4">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 text-primary px-3.5 py-1.5 text-[10px] sm:text-[11px] font-bold uppercase tracking-[0.18em]">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  {t("certified_badge")}
                </span>
              </div>
              <Image
                src="/logo.png"
                alt={tApp("name")}
                width={1000}
                height={234}
                priority
                className="mx-auto h-12 sm:h-16 lg:h-20 w-auto object-contain"
              />
              <p className="text-[11px] sm:text-xs text-muted-foreground mt-3 sm:mt-4 max-w-xl mx-auto leading-relaxed font-medium tracking-[0.18em] uppercase">
                {t("hero_subtitle")}
              </p>
            </section>

            {/* Categories */}
            {categories.length === 0 ? (
              <div className="mx-auto max-w-md rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">
                {t("no_categories")}
              </div>
            ) : (
              <div className="grid gap-4 sm:gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 max-w-6xl mx-auto">
                {categories.map((c, i) => (
                  <div
                    key={c.id}
                    className="animate-slide-up"
                    style={{ animationDelay: `${i * 70}ms` }}
                  >
                    <CategoryCard category={c} locale={locale} />
                  </div>
                ))}
              </div>
            )}
          </div>
        </main>

        {/* Ecosystem footer */}
        <footer className="px-4 sm:px-6 lg:px-10 py-6 mt-4">
          <div className="mx-auto max-w-7xl flex justify-center">
            <span className="inline-flex items-center gap-2 rounded-full bg-muted/60 text-muted-foreground px-4 py-1.5 text-[10px] sm:text-[11px] font-bold uppercase tracking-[0.2em]">
              <ShieldCheck className="h-3 w-3" />
              {t("ecosystem_footer")}
            </span>
          </div>
        </footer>
      </div>
    );
  }

  // ────────────────────────────────────────────────────────────────────────
  // AUTHED mode — mobile-first shell (parent layout supplies the max-w-md
  // wrapper + bottom nav).
  // ────────────────────────────────────────────────────────────────────────
  const lineSummary = await getLineSummary(session);
  const lineLinked = !!lineSummary?.line_linked;

  return (
    <main className="px-4 pt-4 pb-6">
      {/* Trust badge */}
      <div className="flex justify-center mb-4">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 text-primary px-3 py-1 text-[10px] font-bold uppercase tracking-[0.15em]">
          <ShieldCheck className="h-3 w-3" />
          {t("certified_badge")}
        </span>
      </div>

      {/* Hero */}
      <section className="text-center mb-8">
        <Image
          src="/logo.png"
          alt={tApp("name")}
          width={1000}
          height={234}
          priority
          className="mx-auto h-14 w-auto object-contain"
        />
        <p className="text-[11px] text-muted-foreground mt-2 max-w-xs mx-auto leading-relaxed font-medium tracking-wider">
          {t("hero_subtitle")}
        </p>
      </section>

      {/* Personalised strip */}
      <div className="mb-5 rounded-2xl bg-card border p-3.5 flex items-center justify-between shadow-soft">
        <div className="flex items-center gap-3 min-w-0">
          {lineLinked && lineSummary?.line_picture_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={lineSummary.line_picture_url}
              alt={lineSummary.line_display_name ?? "LINE"}
              className="h-10 w-10 rounded-full object-cover ring-2 ring-[#06C755]/40 shrink-0"
            />
          ) : (
            <div className="h-10 w-10 rounded-full bg-primary-gradient text-white inline-flex items-center justify-center text-sm font-semibold shrink-0">
              {(session.patient.first_name?.[0] ?? "").toUpperCase()}
              {(session.patient.last_name?.[0] ?? "").toUpperCase()}
            </div>
          )}
          <div className="min-w-0">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
              {t("welcome_back")}
            </p>
            <p className="text-sm font-semibold truncate">
              {session.patient.first_name} {session.patient.last_name}{" "}
              <span className="text-muted-foreground text-xs font-normal">
                ({session.patient.hn})
              </span>
            </p>
          </div>
        </div>
        <Link
          href="/profile"
          className="text-xs font-semibold text-primary inline-flex items-center shrink-0"
        >
          {t("view_profile")} <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      {/* LINE binding nudge — only when LINE is not yet linked. Once linked
          the section moves to /profile and disappears from the home screen. */}
      {lineSummary && !lineLinked ? (
        <div className="mb-5">
          <LineSection
            initialLinked={false}
            initialDisplayName={null}
            initialPictureUrl={null}
            initialLinkedAt={null}
            initialOptIn={lineSummary.line_notifications_opt_in}
            initialFriendStatus={lineSummary.line_friend_status}
            addFriendUrl={process.env.NEXT_PUBLIC_LINE_OA_ADD_FRIEND_URL}
          />
        </div>
      ) : null}

      {/* Category grid — 1 col on mobile, 2 cols ≥ md */}
      {categories.length === 0 ? (
        <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          {t("no_categories")}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {categories.map((c, i) => (
            <div
              key={c.id}
              className="animate-slide-up"
              style={{ animationDelay: `${i * 70}ms` }}
            >
              <CategoryCard category={c} locale={locale} />
            </div>
          ))}
        </div>
      )}
    </main>
  );
}

function CategoryCard({
  category,
  locale,
}: {
  category: Category;
  locale: string;
}) {
  const title = category.name;
  const subtitle =
    locale === "th"
      ? category.name_th
      : category.description ?? category.name;

  const theme = CATEGORY_THEME[category.code] ?? CATEGORY_THEME.default!;
  const Icon = theme.icon;

  return (
    <Link
      href={`/c/${category.code}`}
      className="relative block overflow-hidden isolate rounded-[28px] aspect-[3/4] md:aspect-[4/5] shadow-soft-lg group active:scale-[0.98] hover:shadow-2xl hover:-translate-y-1 transition-[transform,box-shadow] duration-300"
    >
      {/* Background image — blur-up via skeleton shimmer until loaded */}
      {category.image_url ? (
        <BlurImage
          src={category.image_url}
          alt={category.name}
          className="absolute inset-0 h-full w-full rounded-[28px]"
          imgClassName="group-hover:scale-110 transition-transform duration-700 ease-out"
        />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-primary/30 to-primary/60" />
      )}

      {/* Bottom-to-top dark overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent" />

      {/* Icon badge — middle-left */}
      <div className="absolute left-4 top-1/2 -translate-y-1/2">
        <span
          className={`inline-flex h-12 w-12 items-center justify-center rounded-2xl ${theme.iconBg} ${theme.iconColor} shadow-soft-lg ring-4 ring-white/20`}
        >
          <Icon className="h-6 w-6" />
        </span>
      </div>

      {/* Title block — bottom-left */}
      <div className="absolute inset-x-4 bottom-14 z-10 text-white">
        <h2 className="text-2xl font-extrabold leading-tight drop-shadow-md">
          {title}
        </h2>
        <p className="text-[11px] text-white/85 mt-0.5 line-clamp-1">
          {subtitle}
        </p>
      </div>

      {/* BOOK NOW pill — bottom-left */}
      <span className="absolute left-4 bottom-4 z-10 inline-flex items-center rounded-full bg-black/60 backdrop-blur-md text-white px-3.5 py-1.5 text-[10px] font-bold uppercase tracking-[0.15em]">
        Book Now
      </span>

      {/* Chevron — bottom-right */}
      <span className="absolute right-4 bottom-4 z-10 inline-flex h-7 w-7 items-center justify-center rounded-full bg-black/40 backdrop-blur-md text-white">
        <ChevronRight className="h-4 w-4" />
      </span>

      {/* Material-style ripple on tap */}
      <RippleSurface />
    </Link>
  );
}
