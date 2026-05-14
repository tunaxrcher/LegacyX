import { redirect } from "next/navigation";

/**
 * Legacy `/book` route. The patient app flow now starts at `/` (categories)
 * and proceeds through `/c/[code]` → `/s/[id]/register` → `/s/[id]/book`.
 *
 * This shim keeps old deep links from breaking — anything that pointed at
 * `/book` (e.g. the previous bottom-nav, push notifications, share links)
 * gets bounced back to the new entry point.
 */
export default function LegacyBookPage(): never {
  redirect("/");
}
