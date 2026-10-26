import { STATUS_CLASS, STATUS_LABEL } from "@/lib/client/status";
import type { StatusValue } from "@/lib/schema/common";
import { cn } from "@/lib/utils";
import { Badge } from "./badge";

export function StatusChip({ status, className, children }: { status: StatusValue; className?: string; children?: React.ReactNode }) {
  return (
    <Badge className={cn(STATUS_CLASS[status], className)}>
      <span className="size-1.5 rounded-full bg-current" aria-hidden />
      {children ?? STATUS_LABEL[status]}
    </Badge>
  );
}
