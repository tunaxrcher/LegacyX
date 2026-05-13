"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Stethoscope, X } from "lucide-react";
import { cn } from "@/lib/utils";

const Dialog = DialogPrimitive.Root;
const DialogTrigger = DialogPrimitive.Trigger;
const DialogPortal = DialogPrimitive.Portal;
const DialogClose = DialogPrimitive.Close;

/**
 * Overlay: strong backdrop blur + subtle darkening, per theme spec.
 * Using `backdrop-blur-md` gives the glassy "frosted" feel while the page
 * behind still hints at context.
 */
const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-50 bg-foreground/30 backdrop-blur-md data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className
    )}
    {...props}
  />
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        "fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-5 border bg-card p-6 shadow-soft-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 sm:rounded-2xl",
        className
      )}
      {...props}
    >
      {children}
      <DialogPrimitive.Close className="absolute right-4 top-4 rounded-full p-1 opacity-60 ring-offset-background transition-all hover:bg-muted hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none">
        <X className="h-4 w-4" />
        <span className="sr-only">Close</span>
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </DialogPortal>
));
DialogContent.displayName = DialogPrimitive.Content.displayName;

/**
 * DialogHeader — centered, with a small logo badge on top per theme spec.
 * Content inside (title / description) is auto-centered.
 *
 * If you explicitly want NO logo (rare — e.g. a very dense picker dialog),
 * pass `hideLogo` or compose your own header layout.
 */
interface DialogHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  hideLogo?: boolean;
}
const DialogHeader = ({ className, children, hideLogo, ...props }: DialogHeaderProps) => (
  <div
    className={cn("flex flex-col items-center gap-3 text-center", className)}
    {...props}
  >
    {!hideLogo && (
      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary-gradient text-primary-foreground shadow-soft">
        <Stethoscope className="h-5 w-5" />
      </div>
    )}
    <div className="flex w-full flex-col gap-1.5">{children}</div>
  </div>
);
DialogHeader.displayName = "DialogHeader";

/**
 * DialogFooter — by convention, put a SINGLE primary button inside and the
 * cancel action is handled by the close (X) icon. The footer auto-stretches
 * that single button to full width.
 *
 * If you need multiple buttons, pass `variant="row"` to get the old
 * right-aligned horizontal row back.
 */
interface DialogFooterProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "full" | "row";
}
const DialogFooter = ({ className, variant = "full", ...props }: DialogFooterProps) => (
  <div
    className={cn(
      variant === "full"
        ? "[&>button]:w-full [&>button]:h-11 flex flex-col gap-2 pt-1"
        : "flex flex-col-reverse gap-2 sm:flex-row sm:justify-end",
      className
    )}
    {...props}
  />
);
DialogFooter.displayName = "DialogFooter";

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn("text-lg font-semibold leading-tight tracking-tight", className)}
    {...props}
  />
));
DialogTitle.displayName = DialogPrimitive.Title.displayName;

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
));
DialogDescription.displayName = DialogPrimitive.Description.displayName;

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogTrigger,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
};
