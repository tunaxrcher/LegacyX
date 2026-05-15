import * as React from "react";
import { cn } from "@/lib/utils";

export interface EntityCardProps extends React.HTMLAttributes<HTMLLIElement> {
  /** Top-right action slot (e.g. row dropdown menu). */
  actions?: React.ReactNode;
  /**
   * Centered cards (default — used by users, branches, patients) stack the
   * avatar and metadata down the middle. `align="start"` keeps content
   * left-aligned (used by promotions where the icon sits beside the title).
   */
  align?: "center" | "start";
  /** Optional dim modifier — applies `opacity-70`. Used for inactive entities. */
  dim?: boolean;
}

/**
 * `<EntityCard>` — the shared grid-view tile used by every list page.
 * Centralizes the hover lift, border + shadow tokens, and the top-right
 * actions positioning so individual pages just compose their content.
 *
 *   <EntityCard actions={<RowActions/>}>
 *     <Avatar /> <Title /> <Subtitle />
 *   </EntityCard>
 */
export const EntityCard = React.forwardRef<HTMLLIElement, EntityCardProps>(
  function EntityCard(
    { className, children, actions, align = "center", dim = false, ...props },
    ref,
  ) {
    return (
      <li
        ref={ref}
        className={cn(
          "group relative flex h-full flex-col gap-3 rounded-xl border bg-card p-4 shadow-soft transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-soft-lg",
          align === "center" && "items-center text-center",
          dim && "opacity-70",
          className,
        )}
        {...props}
      >
        {actions ? (
          <div className="absolute right-2 top-2">{actions}</div>
        ) : null}
        {children}
      </li>
    );
  },
);
