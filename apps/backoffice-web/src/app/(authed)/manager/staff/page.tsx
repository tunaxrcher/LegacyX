import { UsersListView } from "../../admin/users/UsersListView";

export const dynamic = "force-dynamic";

/**
 * Manager Staff Management.
 *
 * Reuses the same `UsersListView` as `/admin/users`. The api-server's
 * `admin-users.service.ts` applies a Separation-of-Duties filter:
 *
 *   • For MANAGER actors, the user list returns only DOCTOR / NURSE /
 *     RECEPTION / PHARMACIST + peer MANAGERs (read-only). Mutations are
 *     limited to the operational subset — Managers cannot create / edit
 *     other Managers, and ADMIN rows are invisible.
 *
 * That allows us to reuse the same view + dialogs verbatim — they already
 * receive `actorRoles` and trim their own dropdowns to match what the
 * server will accept.
 */
export default async function ManagerStaffPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  return (
    <UsersListView
      searchParams={searchParams}
      basePath="/manager/staff"
      titleKey="manager_staff.title"
      subtitleKey="manager_staff.subtitle"
    />
  );
}
