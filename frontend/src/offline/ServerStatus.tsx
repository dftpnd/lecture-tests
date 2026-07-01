import { Cloud, CloudOff, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useServerStatus } from "./useServerStatus";

// Small always-visible indicator of the link to the server. Offline is a normal,
// supported mode here (tests are cached), so it's flagged amber ("degraded, still
// usable") rather than alarming red.
const VIEW = {
  online: { Icon: Cloud, className: "text-emerald-500", label: "Сервер на связи" },
  offline: {
    Icon: CloudOff,
    className: "text-amber-500",
    label: "Нет связи с сервером — работает офлайн",
  },
  checking: {
    Icon: Loader2,
    className: "text-muted-foreground animate-spin",
    label: "Проверяем соединение…",
  },
} as const;

export function ServerStatus({ className }: { className?: string }) {
  const status = useServerStatus();
  const { Icon, className: tone, label } = VIEW[status];
  return (
    <span
      role="status"
      aria-label={label}
      title={label}
      className={cn("inline-flex shrink-0 items-center", className)}
    >
      <Icon className={cn("size-5", tone)} aria-hidden="true" />
    </span>
  );
}
