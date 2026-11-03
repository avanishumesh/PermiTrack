import { Badge } from "@/components/ui/badge";
import {
  REQUEST_STATUS_CLASSES,
  REQUEST_STATUS_LABELS,
  STAGE_STATUS_CLASSES,
  STAGE_STATUS_LABELS,
} from "@/lib/constants";
import type { RequestStatus, StageStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

export function RequestStatusBadge({
  status,
  className,
}: {
  status: RequestStatus;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium",
        REQUEST_STATUS_CLASSES[status],
        className
      )}
    >
      {REQUEST_STATUS_LABELS[status]}
    </span>
  );
}

export function StageStatusBadge({
  status,
  className,
}: {
  status: StageStatus;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium",
        STAGE_STATUS_CLASSES[status],
        className
      )}
    >
      {STAGE_STATUS_LABELS[status]}
    </span>
  );
}

export function OverdueBadge({ overdue }: { overdue: boolean }) {
  if (!overdue) return null;
  return <Badge variant="danger">Overdue</Badge>;
}
