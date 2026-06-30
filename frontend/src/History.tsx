import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { api, type AttemptHistory, type Lecture } from "./api";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface Props {
  lecture: Lecture;
  userName: string;
  onClose: () => void;
}

function scoreVariant(pct: number): "success" | "warning" | "destructive" {
  if (pct >= 80) return "success";
  if (pct >= 50) return "warning";
  return "destructive";
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Past attempts for one lecture, each expandable to its per-question mistakes. */
export function History({ lecture, userName, onClose }: Props) {
  const [attempts, setAttempts] = useState<AttemptHistory[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .attempts(userName, lecture.id)
      .then(setAttempts)
      .catch((e) => setError(String(e)));
  }, [userName, lecture.id]);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="truncate pr-6">История: {lecture.title}</DialogTitle>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>Не удалось загрузить историю: {error}</AlertDescription>
          </Alert>
        )}
        {!error && attempts === null && (
          <div className="flex justify-center py-6">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        )}
        {attempts !== null && attempts.length === 0 && (
          <p className="text-sm text-muted-foreground">Попыток по этой лекции ещё нет.</p>
        )}
        {attempts !== null && attempts.length > 0 && (
          <Accordion type="multiple" className="flex flex-col gap-2">
            {attempts.map((a) => {
              const pct = Math.round((a.score / a.total) * 100);
              const wrong = a.details.filter((d) => !d.is_correct);
              return (
                <AccordionItem key={a.id} value={String(a.id)}>
                  <AccordionTrigger>
                    <span className="flex flex-1 items-center justify-between pr-2">
                      <span>{fmtDate(a.created_at)}</span>
                      <Badge variant={scoreVariant(pct)}>
                        {a.score} / {a.total} · {pct}%
                      </Badge>
                    </span>
                  </AccordionTrigger>
                  <AccordionContent>
                    {wrong.length === 0 ? (
                      <Alert variant="success">
                        <AlertDescription>Все ответы верны 🎉</AlertDescription>
                      </Alert>
                    ) : (
                      <div className="flex flex-col gap-2">
                        {wrong.map((d, i) => (
                          <Alert key={i} variant="destructive">
                            <AlertTitle>{d.question}</AlertTitle>
                            <AlertDescription>
                              <p>
                                Ваш ответ:{" "}
                                {d.user_answer >= 0 ? d.options[d.user_answer] : "— нет ответа —"}
                              </p>
                              <p className="font-semibold">Верно: {d.options[d.correct]}</p>
                            </AlertDescription>
                          </Alert>
                        ))}
                      </div>
                    )}
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>
        )}
      </DialogContent>
    </Dialog>
  );
}
