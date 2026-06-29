import { useState } from "react";
import {
  Alert,
  Button,
  Group,
  Modal,
  Progress,
  Radio,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { api, type Lecture, type Question } from "./api";

interface Props {
  lecture: Lecture;
  questions: Question[];
  userName: string;
  onClose: () => void;
  onSubmitted: () => void;
}

interface Result {
  score: number;
  total: number;
  wrong: { question: string; chosen: string; correct: string }[];
}

export function Quiz({ lecture, questions, userName, onClose, onSubmitted }: Props) {
  // answers[i] = chosen option index, or -1 if unanswered
  const [answers, setAnswers] = useState<number[]>(() => questions.map(() => -1));
  const [result, setResult] = useState<Result | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const answeredCount = answers.filter((a) => a >= 0).length;

  function setAnswer(qi: number, oi: number) {
    setAnswers((prev) => prev.map((a, i) => (i === qi ? oi : a)));
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
    <Modal opened onClose={onClose} title={`Тест: ${lecture.title}`} size="lg" fullScreen>
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
          <Progress value={(answeredCount / questions.length) * 100} />
          <Text c="dimmed" size="sm">
            Отвечено: {answeredCount} / {questions.length}
          </Text>
          {questions.map((q, qi) => (
            <Radio.Group
              key={qi}
              value={answers[qi] >= 0 ? String(answers[qi]) : null}
              onChange={(v) => setAnswer(qi, Number(v))}
              label={`${qi + 1}. ${q.question}`}
            >
              <Stack gap="xs" mt="xs" mb="md">
                {q.options.map((opt, oi) => (
                  <Radio key={oi} value={String(oi)} label={opt} />
                ))}
              </Stack>
            </Radio.Group>
          ))}
          <Group justify="flex-end">
            <Button variant="default" onClick={onClose}>
              Отмена
            </Button>
            <Button onClick={submit} loading={submitting} disabled={answeredCount === 0}>
              Завершить тест
            </Button>
          </Group>
        </Stack>
      )}
    </Modal>
  );
}
