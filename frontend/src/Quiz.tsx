import { useEffect, useState } from "react";
import {
  Alert,
  Button,
  Group,
  Modal,
  Progress,
  Stack,
  Text,
  Title,
  UnstyledButton,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { api, type Lecture, type Question, type QuestionVotes, type Reaction } from "./api";

interface Props {
  lecture: Lecture;
  questions: Question[];
  quizSetId: number;
  userName: string;
  onClose: () => void;
  onSubmitted: () => void;
}

interface Result {
  score: number;
  total: number;
  wrong: { question: string; chosen: string; correct: string }[];
}

export function Quiz({ lecture, questions, quizSetId, userName, onClose, onSubmitted }: Props) {
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
      notifications.show({ message: `Не удалось проголосовать: ${e}`, color: "red" });
    }
  }

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
        lecture_id: lecture.id,
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
      notifications.show({ message: `Не удалось сохранить результат: ${e}`, color: "red" });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      opened
      onClose={onClose}
      title={`Тест: ${lecture.title}`}
      size="lg"
      fullScreen
      styles={{ body: { paddingBottom: 0 } }}
    >
      {result ? (
        <Stack>
          <Title order={3}>
            Результат: {result.score} / {result.total}
          </Title>
          <Progress value={(result.score / result.total) * 100} size="lg" />
          {result.wrong.length === 0 ? (
            <Alert color="green">Все ответы верны 🎉</Alert>
          ) : (
            <>
              <Title order={5}>Ошибки ({result.wrong.length}):</Title>
              {result.wrong.map((w, i) => (
                <Alert key={i} color="red" title={w.question}>
                  <Text size="sm">Ваш ответ: {w.chosen}</Text>
                  <Text size="sm" fw={600}>
                    Верно: {w.correct}
                  </Text>
                </Alert>
              ))}
            </>
          )}
          <Button onClick={onClose}>Закрыть</Button>
        </Stack>
      ) : (
        <Stack>
          <Progress value={(current / questions.length) * 100} />
          <Text c="dimmed" size="sm">
            Вопрос {current + 1} / {questions.length}
          </Text>
          <Title order={4}>{q.question}</Title>
          <Group gap="xs">
            {(["skull", "heart"] as Reaction[]).map((r) => {
              const v = votes[current];
              const count = v ? (r === "skull" ? v.skull : v.heart) : 0;
              const mine = v?.mine === r;
              return (
                <Button
                  key={r}
                  size="compact-md"
                  variant={mine ? "filled" : "default"}
                  color={r === "skull" ? "gray" : "red"}
                  onClick={() => react(current, r)}
                >
                  {r === "skull" ? "💀" : "❤️"} {count}
                </Button>
              );
            })}
          </Group>
          <Stack gap="xs">
            {q.options.map((opt, oi) => {
              const isCorrect = oi === q.correct_index;
              const isChosen = oi === chosen;
              // Reveal correctness only after the user has answered.
              const bg = !answered
                ? undefined
                : isCorrect
                  ? "var(--mantine-color-green-light)"
                  : isChosen
                    ? "var(--mantine-color-red-light)"
                    : undefined;
              const border = !answered
                ? "1px solid var(--mantine-color-default-border)"
                : isCorrect
                  ? "1px solid var(--mantine-color-green-filled)"
                  : isChosen
                    ? "1px solid var(--mantine-color-red-filled)"
                    : "1px solid var(--mantine-color-default-border)";
              return (
                <UnstyledButton
                  key={oi}
                  onClick={() => choose(oi)}
                  disabled={answered}
                  style={{
                    padding: "var(--mantine-spacing-sm)",
                    borderRadius: "var(--mantine-radius-md)",
                    border,
                    background: bg,
                    cursor: answered ? "default" : "pointer",
                  }}
                >
                  <Text>{opt}</Text>
                </UnstyledButton>
              );
            })}
          </Stack>
          <Group
            justify="flex-end"
            style={{
              position: "sticky",
              bottom: 0,
              marginTop: "var(--mantine-spacing-xs)",
              paddingTop: "var(--mantine-spacing-sm)",
              paddingBottom: "calc(env(safe-area-inset-bottom) + var(--mantine-spacing-sm))",
              background: "var(--mantine-color-body)",
              borderTop: "1px solid var(--mantine-color-default-border)",
            }}
          >
            <Button variant="default" onClick={onClose}>
              Отмена
            </Button>
            {isLast ? (
              <Button onClick={submit} loading={submitting} disabled={!answered}>
                Завершить тест
              </Button>
            ) : (
              <Button onClick={() => setCurrent((c) => c + 1)} disabled={!answered}>
                Дальше
              </Button>
            )}
          </Group>
        </Stack>
      )}
    </Modal>
  );
}
