import { UsersListView } from "./UsersListView";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  return (
    <UsersListView
      searchParams={searchParams}
      basePath="/admin/users"
      titleKey="admin_users.title"
      subtitleKey="admin_users.subtitle"
    />
  );
}
