import * as React from "react";
import { cn } from "@/lib/utils";

export function Input({ className, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      className={cn(
        "h-10 w-full rounded-full border border-line bg-bg-raised/60 px-4 text-sm text-fg placeholder:text-fg-muted/70 focus:border-amber/60 focus:outline-none",
        className,
      )}
      {...props}
    />
  );
}
