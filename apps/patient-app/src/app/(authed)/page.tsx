import Link from "next/link";
import { getTranslations, getLocale } from "next-intl/server";
import {
  ChevronRight,
  HeartPulse,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  type LucideIcon,
} from "lucide-react";
import { getPatientSession } from "@/lib/session";

type Category = {
  id: string;
  code: string;
  name: string;
  name_th: string;
  description: string | null;
  description_th: string | null;
  image_url: string | null;
};

const API_BASE = process.env.API_BASE_URL ?? "http://localhost:3001";

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

  return (
    <main className="px-4 pt-8 pb-6 animate-fade-in">
      {/* Trust badge */}
      <div className="flex justify-center mb-4">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 text-primary px-3 py-1 text-[10px] font-bold uppercase tracking-[0.15em]">
          <ShieldCheck className="h-3 w-3" />
          {t("certified_badge")}
        </span>
      </div>

      {/* Hero */}
      <section className="text-center mb-8">
        <h1 className="text-4xl font-black tracking-tight">LEGACYX</h1>
        <p className="text-[11px] text-muted-foreground mt-2 max-w-xs mx-auto leading-relaxed font-medium tracking-wider">
          {t("hero_subtitle")}
        </p>
      </section>

      {/* Personalised strip when logged in */}
      {session ? (
        <div className="mb-5 rounded-2xl bg-card border p-3.5 flex items-center justify-between shadow-soft">
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
          <Link
            href="/profile"
            className="text-xs font-semibold text-primary inline-flex items-center shrink-0"
          >
            {t("view_profile")} <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      ) : null}

      {/* Category grid — 1 col on mobile, 3 cols ≥ md */}
      {categories.length === 0 ? (
        <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          {t("no_categories")}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 md:max-w-5xl md:mx-auto">
          {categories.map((c) => (
            <CategoryCard key={c.id} category={c} locale={locale} />
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
      className="relative block overflow-hidden rounded-[28px] aspect-[3/4] md:aspect-[4/5] shadow-soft-lg group active:scale-[0.98] transition"
    >
      {/* Background image */}
      {category.image_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={category.image_url}
          alt={category.name}
          className="absolute inset-0 h-full w-full object-cover transition group-hover:scale-105"
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
    </Link>
  );
}
