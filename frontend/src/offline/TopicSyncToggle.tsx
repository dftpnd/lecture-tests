import { Cloud, CloudDownload, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Per-topic offline toggle shown next to the topic name. */
export function TopicSyncToggle({
  subscribed,
  syncing,
  onToggle,
}: {
  subscribed: boolean;
  syncing: boolean;
  onToggle: () => void;
}) {
  const Icon = syncing ? Loader2 : subscribed ? Cloud : CloudDownload;
  const label = subscribed
    ? syncing
      ? "Синхронизация…"
      : "Доступно офлайн — нажмите, чтобы отключить"
    : "Сохранить тему для офлайна";
  return (
    <Button
      variant="ghost"
      size="icon"
      className="size-7 shrink-0"
      aria-label={label}
      aria-pressed={subscribed}
      title={label}
      onClick={onToggle}
    >
      <Icon
        className={cn(
          "size-4",
          syncing && "animate-spin",
          subscribed ? "text-primary" : "text-muted-foreground",
        )}
      />
    </Button>
  );
}
