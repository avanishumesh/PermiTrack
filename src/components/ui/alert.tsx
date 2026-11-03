import * as React from "react";
import { AlertCircle, CheckCircle2, Info, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";

const styles = {
  info: "border-sky-200 bg-sky-50 text-sky-900 [&>svg]:text-sky-600",
  success: "border-emerald-200 bg-emerald-50 text-emerald-900 [&>svg]:text-emerald-600",
  warning: "border-amber-200 bg-amber-50 text-amber-900 [&>svg]:text-amber-600",
  danger: "border-rose-200 bg-rose-50 text-rose-900 [&>svg]:text-rose-600",
} as const;

const icons = {
  info: Info,
  success: CheckCircle2,
  warning: TriangleAlert,
  danger: AlertCircle,
} as const;

export function Alert({
  variant = "info",
  title,
  children,
  className,
}: {
  variant?: keyof typeof styles;
  title?: string;
  children?: React.ReactNode;
  className?: string;
}) {
  const Icon = icons[variant];
  return (
    <div className={cn("flex gap-3 rounded-lg border p-3 text-sm", styles[variant], className)}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="space-y-1">
        {title ? <p className="font-medium leading-tight">{title}</p> : null}
        {children ? <div className="text-current/90 [&_p]:leading-relaxed">{children}</div> : null}
      </div>
    </div>
  );
}
