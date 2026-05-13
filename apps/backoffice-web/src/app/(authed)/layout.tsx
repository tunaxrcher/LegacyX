import { redirect } from "next/navigation";
import { getSessionFromCookies } from "@/lib/session";
import { Sidebar } from "@/components/app-shell/sidebar";
import { Breadcrumbs } from "@/components/app-shell/breadcrumbs";
import { CommandPalette } from "@/components/app-shell/command-palette";
import { ThemeToggle } from "@/components/app-shell/theme-toggle";
import { LocaleSwitcher } from "@/components/app-shell/locale-switcher";
import { UserMenu } from "@/components/app-shell/user-menu";
import { BranchPicker } from "@/components/app-shell/branch-picker";

export const dynamic = "force-dynamic";

export default function AuthedLayout({ children }: { children: React.ReactNode }) {
  const session = getSessionFromCookies();
  if (!session) redirect("/login");

  return (
    <div className="flex min-h-screen">
      <Sidebar roles={session.roles ?? []} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-background/80 px-4 backdrop-blur md:px-6">
          <Breadcrumbs />
          <div className="ml-auto flex items-center gap-2">
            <BranchPicker session={session} />
            <CommandPalette />
            <LocaleSwitcher />
            <ThemeToggle />
            <UserMenu session={session} />
          </div>
        </header>
        <main className="flex-1 overflow-x-hidden px-4 py-6 md:px-8 md:py-8">
          <div className="mx-auto w-full max-w-7xl animate-fade-in">{children}</div>
        </main>
      </div>
    </div>
  );
}
