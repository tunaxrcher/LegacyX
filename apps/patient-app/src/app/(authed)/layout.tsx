import { redirect } from "next/navigation";
import { getPatientSession } from "@/lib/session";
import { BottomNav } from "@/components/bottom-nav";

export default function AuthedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = getPatientSession();
  if (!session) redirect("/login");
  return (
    <div className="mx-auto max-w-md min-h-screen pb-20">
      {children}
      <BottomNav />
    </div>
  );
}
