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
 * Bottom nav: shown ONLY when the patient is logged in. Guests see the
 * minimal welcome page with an inline "Sign in" CTA in the header — the
 * extra navigation chrome would be noise when there's nowhere they can go
 * yet.
 */
export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = getPatientSession();
  const hasSession = !!session;
  return (
    <div
      className={
        hasSession
          ? "mx-auto max-w-md min-h-screen pb-20"
          : "mx-auto max-w-md min-h-screen pb-6"
      }
    >
      {children}
      {hasSession && <BottomNav hasSession={hasSession} />}
    </div>
  );
}
