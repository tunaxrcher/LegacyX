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
 */
export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = getPatientSession();
  return (
    <div className="mx-auto max-w-md min-h-screen pb-20">
      {children}
      <BottomNav hasSession={!!session} />
    </div>
  );
}
