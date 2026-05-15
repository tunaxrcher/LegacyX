import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import {
  ChevronRight,
  ShieldOff,
  Settings as SettingsIcon,
  Layers,
} from "lucide-react";
import { getSessionFromCookies } from "@/lib/session";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { visibleGroups, SETTINGS_ROLES } from "@/components/settings/catalog";

export const dynamic = "force-dynamic";

/**
 * Deep-link fallback for the Settings hub. The primary entry point is the
 * `SettingsDialog` triggered from the sidebar — this page exists so direct
 * URLs (`/settings`) and external links still resolve to a real page.
 */
export default async function SettingsPage() {
  const session = getSessionFromCookies();
  if (!session) redirect("/login");

  const roles = session.roles ?? [];
  const t = await getTranslations();

  // Hard guard: receptionists / doctors / nurses / pharmacists can't open
  // any setting in this hub. Show a friendly EmptyState rather than 404.
  const canSeeAny = SETTINGS_ROLES.some((r) => roles.includes(r));
  if (!canSeeAny) {
    return (
      <div className="space-y-6">
        <SettingsHero
          title={t("settings_hub.title")}
          subtitle={t("settings_hub.subtitle")}
        />
        <EmptyState
          icon={<ShieldOff className="h-5 w-5" />}
          title={t("settings_hub.no_access_title")}
          description={t("settings_hub.no_access_desc")}
        />
      </div>
    );
  }

  const groups = visibleGroups(roles);
  const totalTiles = groups.reduce((sum, g) => sum + g.tiles.length, 0);
  const visibleRoles = SETTINGS_ROLES.filter((r) => roles.includes(r));

  return (
    <div className="space-y-8">
      <SettingsHero
        title={t("settings_hub.title")}
        subtitle={t("settings_hub.subtitle")}
        meta={
          <>
            <Badge variant="secondary" className="gap-1.5">
              <Layers className="h-3 w-3" />
              {t("settings_hub.meta_categories", { count: totalTiles })}
            </Badge>
            {visibleRoles.map((role) => (
              <Badge
                key={role}
                variant="outline"
                className="font-mono text-[10px]"
              >
                {role}
              </Badge>
            ))}
          </>
        }
      />

      {groups.map((group) => {
        const GroupIcon = group.icon;
        return (
          <Card key={group.titleKey} className="overflow-hidden">
            <CardHeader className="flex flex-row items-center gap-3 space-y-0 border-b bg-muted/20 py-4">
              <div
                className={cn(
                  "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
                  group.tone,
                )}
              >
                <GroupIcon className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <CardTitle className="text-base">{t(group.titleKey)}</CardTitle>
                <CardDescription className="mt-0.5 text-xs">
                  {t(group.descriptionKey)}
                </CardDescription>
              </div>
              <Badge variant="muted" className="hidden sm:inline-flex">
                {group.tiles.length}
              </Badge>
            </CardHeader>
            <CardContent className="p-3 sm:p-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {group.tiles.map((tile) => {
                  const Icon = tile.icon;
                  return (
                    <Link
                      key={tile.href}
                      href={tile.href}
                      className={cn(
                        "group relative flex items-start gap-3 overflow-hidden rounded-xl border bg-card p-4 transition-all",
                        "hover:-translate-y-[1px] hover:border-primary/40 hover:shadow-soft-lg",
                      )}
                    >
                      <span
                        aria-hidden
                        className="absolute inset-x-0 top-0 h-[2px] bg-primary-gradient opacity-0 transition-opacity group-hover:opacity-100"
                      />
                      <span
                        className={cn(
                          "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset ring-border/40 transition-transform group-hover:scale-105",
                          tile.tone,
                        )}
                      >
                        <Icon className="h-5 w-5" />
                      </span>
                      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="line-clamp-1 text-sm font-semibold text-foreground">
                          {t(tile.titleKey)}
                        </span>
                        <span className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                          {t(tile.descriptionKey)}
                        </span>
                      </div>
                      <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-all group-hover:translate-x-0.5 group-hover:text-primary" />
                    </Link>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function SettingsHero({
  title,
  subtitle,
  meta,
}: {
  title: string;
  subtitle: string;
  meta?: React.ReactNode;
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl border bg-card p-6 shadow-soft sm:p-8">
      <div
        aria-hidden
        className="pointer-events-none absolute -right-12 -top-12 h-48 w-48 rounded-full bg-primary/15 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-16 -left-8 h-48 w-48 rounded-full bg-fuchsia-500/10 blur-3xl"
      />
      <div className="relative flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-primary-gradient text-primary-foreground shadow-soft-lg">
          <SettingsIcon className="h-7 w-7" />
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            {title}
          </h1>
          <p className="max-w-2xl text-sm text-muted-foreground sm:text-[15px]">
            {subtitle}
          </p>
          {meta ? (
            <div className="flex flex-wrap items-center gap-2 pt-2">{meta}</div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
