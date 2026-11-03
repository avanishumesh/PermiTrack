import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

export function Brand({
  href = "/",
  className,
  compact = false,
}: {
  href?: string;
  className?: string;
  compact?: boolean;
}) {
  return (
    <Link href={href} className={cn("inline-flex items-center gap-2", className)}>
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
        <ShieldCheck className="h-4 w-4" />
      </span>
      {compact ? null : (
        <span className="text-base font-semibold tracking-tight">
          Permi<span className="text-primary">Track</span>
        </span>
      )}
    </Link>
  );
}
