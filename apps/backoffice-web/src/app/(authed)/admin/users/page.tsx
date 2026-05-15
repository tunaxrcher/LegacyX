import { getTranslations } from "next-intl/server";
import type { RawSearchParams } from "@/lib/list-params";
import { UsersListView } from "./UsersListView";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams?: RawSearchParams;
}) {
  const t = await getTranslations();
  return (
    <UsersListView
      searchParams={searchParams}
      basePath="/admin/users"
      copy={{
        title: t("admin_users.title"),
        subtitle: t("admin_users.subtitle"),
        searchPlaceholder: t("admin_users.search_placeholder"),
        emptyTitle: t("admin_users.list_empty_title"),
        emptyDesc: t("admin_users.list_empty_desc"),
      }}
    />
  );
}
