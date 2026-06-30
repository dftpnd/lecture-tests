import { useEffect, useState } from "react";
import {
  Accordion,
  Alert,
  Badge,
  Group,
  Loader,
  Modal,
  Stack,
  Text,
} from "@mantine/core";
import { api, type AttemptHistory, type Lecture } from "./api";

interface Props {
  lecture: Lecture;
  userName: string;
  onClose: () => void;
}

function scoreColor(pct: number): string {
  if (pct >= 80) return "green";
  if (pct >= 50) return "yellow";
  return "red";
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
    <Modal opened onClose={onClose} title={`История: ${lecture.title}`} size="lg">
      {error && <Alert color="red">Не удалось загрузить историю: {error}</Alert>}
      {!error && attempts === null && (
        <Group justify="center" py="lg">
          <Loader />
        </Group>
      )}
      {attempts !== null && attempts.length === 0 && (
        <Text c="dimmed">Попыток по этой лекции ещё нет.</Text>
      )}
      {attempts !== null && attempts.length > 0 && (
        <Accordion variant="separated">
          {attempts.map((a) => {
            const pct = Math.round((a.score / a.total) * 100);
            const wrong = a.details.filter((d) => !d.is_correct);
            return (
              <Accordion.Item key={a.id} value={String(a.id)}>
                <Accordion.Control>
                  <Group justify="space-between" pr="md">
                    <Text size="sm">{fmtDate(a.created_at)}</Text>
                    <Badge color={scoreColor(pct)}>
                      {a.score} / {a.total} · {pct}%
                    </Badge>
                  </Group>
                </Accordion.Control>
                <Accordion.Panel>
                  {wrong.length === 0 ? (
                    <Alert color="green">Все ответы верны 🎉</Alert>
                  ) : (
                    <Stack gap="sm">
                      {wrong.map((d, i) => (
                        <Alert key={i} color="red" title={d.question}>
                          <Text size="sm">
                            Ваш ответ:{" "}
                            {d.user_answer >= 0 ? d.options[d.user_answer] : "— нет ответа —"}
                          </Text>
                          <Text size="sm" fw={600}>
                            Верно: {d.options[d.correct]}
                          </Text>
                        </Alert>
                      ))}
                    </Stack>
                  )}
                </Accordion.Panel>
              </Accordion.Item>
            );
          })}
        </Accordion>
      )}
    </Modal>
  );
}
