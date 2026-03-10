import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import * as React from "react";

import { cn } from "@/lib/utils";

const sheetGlassClassName =
  "border-[rgba(255,255,255,var(--glass-border-opacity,0.55))] bg-[rgba(255,255,255,var(--glass-bg-opacity,0.46))] shadow-2xl shadow-primary/15 backdrop-blur-lg";

const Sheet = DialogPrimitive.Root;
const SheetTrigger = DialogPrimitive.Trigger;
const SheetClose = DialogPrimitive.Close;

function SheetPortal({ ...props }: DialogPrimitive.DialogPortalProps) {
  return <DialogPrimitive.Portal {...props} />;
}

const SheetOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    className={cn("fixed inset-0 z-50 bg-foreground/25 backdrop-blur-sm", className)}
    {...props}
    ref={ref}
  />
));
SheetOverlay.displayName = DialogPrimitive.Overlay.displayName;

type SheetContentProps = React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
  hideOverlay?: boolean;
};

const SheetContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  SheetContentProps
>(({ className, children, hideOverlay = false, ...props }, ref) => (
  <SheetPortal>
    {!hideOverlay ? <SheetOverlay /> : null}
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        `fixed inset-x-[max(0.75rem,var(--safe-left))] bottom-[max(0.75rem,var(--safe-bottom))] top-[max(0.75rem,var(--safe-top))] z-50 max-h-[calc(var(--app-dvh)-max(1.5rem,calc(var(--safe-top)+var(--safe-bottom))))] overflow-y-auto overscroll-y-contain rounded-[28px] border p-6 [touch-action:pan-y] [-webkit-overflow-scrolling:touch] sm:inset-y-6 sm:left-6 sm:right-auto sm:w-[420px] sm:max-h-[calc(var(--app-dvh)-3rem)] sm:rounded-[28px] ${sheetGlassClassName}`,
        className,
      )}
      {...props}
    >
      {children}
      <DialogPrimitive.Close className="absolute right-4 top-4 rounded-full p-2 text-muted-foreground transition hover:bg-white/70 hover:text-foreground">
        <X className="h-4 w-4" />
        <span className="sr-only">Close</span>
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </SheetPortal>
));
SheetContent.displayName = DialogPrimitive.Content.displayName;

function SheetHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("mb-6 flex flex-col gap-1.5 text-left", className)} {...props} />;
}

function SheetTitle({ className, ...props }: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>) {
  return <DialogPrimitive.Title className={cn("font-display text-2xl font-semibold", className)} {...props} />;
}

function SheetDescription({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>) {
  return <DialogPrimitive.Description className={cn("text-sm text-muted-foreground", className)} {...props} />;
}

export {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  sheetGlassClassName,
};
