import { getPatientSession } from "@/lib/session";
import { BottomNav } from "@/components/bottom-nav";

/**
 * Shell layout for the public-facing patient app. Pre-Phase G this layout
 * REDIRECTED to /login when no session existed — the new guest flow (welcome
 * → category → service → register → book → success) intentionally requires
 * the user to browse anonymously, so the redirect was lifted.
 *
 * Protected screens (visits / wallet / profile) now perform their own
 * `getPatientSession() → redirect("/login")` check, keeping the security
 * boundary explicit at the page level.
 *
 * Layout strategy:
 *   - **Guest** (no session): no max-width constraint — pages render in
 *     full-width "marketing" mode (welcome page, category browsing) so the
 *     desktop view doesn't waste screen real estate.
 *   - **Logged in**: classic mobile shell (`max-w-md`) with the bottom-nav.
 *
 * Pages that need to look identical regardless of auth state (the booking
 * flow itself) wrap themselves in `max-w-md` so they keep the mobile layout
 * even for guests.
 */
export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const hasSession = !!getPatientSession();
  if (!hasSession) {
    return <div className="min-h-screen">{children}</div>;
  }
  return (
    <div className="mx-auto max-w-md min-h-screen pb-20">
      {children}
      <BottomNav hasSession />
    </div>
  );
}
