import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Key, ShieldCheck } from "lucide-react";
import { getSessionFromCookies } from "@/lib/session";
import { apiJson } from "@/lib/api";
import { PageHeader } from "@/components/app-shell/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

type Role = {
  id: string;
  code: string;
  name: string;
  isSystem: boolean;
  userCount: number;
  permissions: Array<{ resource: string; action: string; scope: string }>;
};

export default async function AdminRolesPage() {
  const session = getSessionFromCookies();
  if (!session) redirect("/login");
  const t = await getTranslations();

  const res = await apiJson<{ data: Role[] }>(session, "/api/v1/admin/roles").catch(
    () => ({ data: [] as Role[] }),
  );
  const roles = res.data;

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("admin_roles.title")}
        description={t("admin_roles.subtitle")}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {roles.map((r) => {
          // Group permissions by resource
          const byResource = new Map<
            string,
            Array<{ action: string; scope: string }>
          >();
          for (const p of r.permissions) {
            const arr = byResource.get(p.resource) ?? [];
            arr.push({ action: p.action, scope: p.scope });
            byResource.set(p.resource, arr);
          }

          return (
            <Card key={r.id}>
              <CardContent className="space-y-4 pt-6">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Key className="h-4 w-4 text-primary" />
                      <h3 className="text-base font-bold">{r.code}</h3>
                      {r.isSystem && (
                        <Badge variant="muted" className="text-[10px]">
                          system
                        </Badge>
                      )}
                    </div>
                    <div className="text-sm text-muted-foreground">{r.name}</div>
                  </div>
                  <div className="text-right text-xs text-muted-foreground">
                    <div>
                      <span className="font-semibold text-foreground">{r.userCount}</span>{" "}
                      {t("admin_roles.user_count")}
                    </div>
                    <div>
                      <span className="font-semibold text-foreground">
                        {r.permissions.length}
                      </span>{" "}
                      {t("admin_roles.permission_count")}
                    </div>
                  </div>
                </div>

                <div className="space-y-2 border-t pt-3">
                  {Array.from(byResource.entries()).map(([resource, actions]) => (
                    <div key={resource} className="flex items-start gap-3">
                      <div className="w-24 shrink-0 font-mono text-xs font-semibold text-muted-foreground">
                        {resource}
                      </div>
                      <div className="flex flex-1 flex-wrap gap-1">
                        {actions.map((a) => (
                          <Badge
                            key={`${a.action}:${a.scope}`}
                            variant="info"
                            className="font-mono text-[10px]"
                          >
                            {a.action}
                            <span className="opacity-60">:{a.scope}</span>
                          </Badge>
                        ))}
                      </div>
                    </div>
                  ))}
                  {r.permissions.length === 0 && (
                    <div className="flex items-center gap-2 text-xs italic text-muted-foreground">
                      <ShieldCheck className="h-3.5 w-3.5" />
                      No permissions assigned
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
