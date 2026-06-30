import { useEffect, useState } from "react";
import { toast } from "sonner";
import { X } from "lucide-react";
import { api, type Question, type QuestionVotes, type Reaction } from "./api";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogTitle, DialogClose } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

interface Props {
  lectureId: number;
  lectureTitle: string;
  questions: Question[];
  quizSetId: number;
  version: number;
  totalVersions: number;
  onChangeVersion: (version: number) => void;
  userName: string;
  onClose: () => void;
  onSubmitted: () => void;
}

interface Result {
  score: number;
  total: number;
  wrong: { question: string; chosen: string; correct: string }[];
}

export function Quiz({
  lectureId,
  lectureTitle,
  questions,
  quizSetId,
  version,
  totalVersions,
  onChangeVersion,
  userName,
  onClose,
  onSubmitted,
}: Props) {
  // answers[i] = chosen option index, or -1 if unanswered
  const [answers, setAnswers] = useState<number[]>(() => questions.map(() => -1));
  const [current, setCurrent] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // votes[i] = aggregate reactions for question i; missing until loaded.
  const [votes, setVotes] = useState<Record<number, QuestionVotes>>({});

  useEffect(() => {
    api
      .votes(quizSetId, userName)
      .then((list) => setVotes(Object.fromEntries(list.map((v) => [v.question_index, v]))))
      .catch(() => {});
  }, [quizSetId, userName]);

  async function react(index: number, reaction: Reaction) {
    // Optimistic: server returns the authoritative counts, swapped in on resolve.
    try {
      const updated = await api.vote(quizSetId, index, userName, reaction);
      setVotes((prev) => ({ ...prev, [index]: updated }));
    } catch (e) {
      toast.error(`Не удалось проголосовать: ${e}`);
    }
  }

  // Generation switcher: each version is a different set (possibly a different
  // number of questions). Switching just opens another version by URL.
  const versionBar = (
    <div className="flex items-center gap-2">
      <span className="text-sm text-muted-foreground">Генерация</span>
      <Select
        value={String(version)}
        onValueChange={(v) => v && Number(v) !== version && onChangeVersion(Number(v))}
        disabled={totalVersions <= 1}
      >
        <SelectTrigger className="h-8 w-[72px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {Array.from({ length: totalVersions }, (_, i) => (
            <SelectItem key={i + 1} value={String(i + 1)}>
              {i + 1}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <span className="text-sm text-muted-foreground">
        / {totalVersions} · {questions.length} вопросов
      </span>
    </div>
  );

  const q = questions[current];
  const chosen = answers[current]; // -1 until this question is answered
  const answered = chosen >= 0;
  const isLast = current === questions.length - 1;

  function choose(oi: number) {
    if (answered) return; // lock in the first choice — feedback is immediate
    setAnswers((prev) => prev.map((a, i) => (i === current ? oi : a)));
  }

  async function submit() {
    setSubmitting(true);
    // Client-side checking: compare each answer to the correct index.
    const details = questions.map((q, i) => ({
      question: q.question,
      options: q.options,
      user_answer: answers[i],
      correct: q.correct_index,
      is_correct: answers[i] === q.correct_index,
    }));
    const score = details.filter((d) => d.is_correct).length;

    try {
      await api.submitAttempt({
        user_name: userName,
        lecture_id: lectureId,
        quiz_set_id: quizSetId,
        score,
        total: questions.length,
        details,
      });
      setResult({
        score,
        total: questions.length,
        wrong: details
          .filter((d) => !d.is_correct)
          .map((d) => ({
            question: d.question,
            chosen: d.user_answer >= 0 ? d.options[d.user_answer] : "— нет ответа —",
            correct: d.options[d.correct],
          })),
      });
      onSubmitted();
    } catch (e) {
      toast.error(`Не удалось сохранить результат: ${e}`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent fullScreen showClose={false} className="p-0">
        {/* Header — clear of the iOS notch in standalone mode. */}
        <div className="flex items-center justify-between gap-2 border-b px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
          <DialogTitle className="min-w-0 truncate text-base">Тест: {lectureTitle}</DialogTitle>
          <DialogClose asChild>
            <Button variant="ghost" size="icon" aria-label="Закрыть">
              <X />
            </Button>
          </DialogClose>
        </div>

        {result ? (
          <div className="flex-1 overflow-y-auto px-4 py-4">
            <div className="mx-auto flex max-w-2xl flex-col gap-4">
              {versionBar}
              <h2 className="text-xl font-semibold">
                Результат: {result.score} / {result.total}
              </h2>
              <Progress className="h-3" value={(result.score / result.total) * 100} />
              {result.wrong.length === 0 ? (
                <Alert variant="success">
                  <AlertDescription>Все ответы верны 🎉</AlertDescription>
                </Alert>
              ) : (
                <>
                  <h3 className="font-semibold">Ошибки ({result.wrong.length}):</h3>
                  {result.wrong.map((w, i) => (
                    <Alert key={i} variant="destructive">
                      <AlertTitle>{w.question}</AlertTitle>
                      <AlertDescription>
                        <p>Ваш ответ: {w.chosen}</p>
                        <p className="font-semibold">Верно: {w.correct}</p>
                      </AlertDescription>
                    </Alert>
                  ))}
                </>
              )}
              <Button onClick={onClose}>Закрыть</Button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto px-4 py-4">
              <div className="mx-auto flex max-w-2xl flex-col gap-4">
                {versionBar}
                <Progress value={(current / questions.length) * 100} />
                <p className="text-sm text-muted-foreground">
                  Вопрос {current + 1} / {questions.length}
                </p>
                <h2 className="text-lg font-semibold">{q.question}</h2>
                <div className="flex gap-2">
                  {(["skull", "heart"] as Reaction[]).map((r) => {
                    const v = votes[current];
                    const count = v ? (r === "skull" ? v.skull : v.heart) : 0;
                    const mine = v?.mine === r;
                    return (
                      <Button
                        key={r}
                        size="sm"
                        variant={mine ? "default" : "outline"}
                        onClick={() => react(current, r)}
                      >
                        {r === "skull" ? "💀" : "❤️"} {count}
                      </Button>
                    );
                  })}
                </div>
                <div className="flex flex-col gap-2">
                  {q.options.map((opt, oi) => {
                    const isCorrect = oi === q.correct_index;
                    const isChosen = oi === chosen;
                    // Reveal correctness only after the user has answered.
                    return (
                      <button
                        key={oi}
                        type="button"
                        onClick={() => choose(oi)}
                        disabled={answered}
                        className={cn(
                          "w-full rounded-md border p-3 text-left transition-colors",
                          !answered
                            ? "cursor-pointer border-input hover:bg-accent"
                            : isCorrect
                              ? "border-green-500 bg-green-500/10"
                              : isChosen
                                ? "border-red-500 bg-red-500/10"
                                : "border-input opacity-70",
                        )}
                      >
                        {opt}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Sticky action bar, clear of the iOS home indicator. */}
            <div className="flex items-center justify-end gap-2 border-t bg-background px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              <Button variant="outline" onClick={onClose}>
                Отмена
              </Button>
              {isLast ? (
                <Button onClick={submit} disabled={submitting || !answered}>
                  {submitting ? "…" : "Завершить тест"}
                </Button>
              ) : (
                <Button onClick={() => setCurrent((c) => c + 1)} disabled={!answered}>
                  Дальше
                </Button>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
