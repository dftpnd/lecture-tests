import { useEffect, useState } from "react";
import {
  AppShell,
  Badge,
  Button,
  Card,
  Container,
  Group,
  Progress,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { Link } from "react-router-dom";
import { api, type Lecture, type Question, type Progress as Prog } from "./api";
import { Quiz } from "./Quiz";
import { History } from "./History";
import { useLectures } from "./useLectures";

export function TestPage() {
  const [name, setName] = useState(localStorage.getItem("user") ?? "");
  const [loggedIn, setLoggedIn] = useState(Boolean(localStorage.getItem("user")));
  const { lectures, refresh } = useLectures();
  const [progress, setProgress] = useState<Prog[]>([]);
  const [activeQuiz, setActiveQuiz] = useState<{ lecture: Lecture; questions: Question[] } | null>(null);
  const [historyLecture, setHistoryLecture] = useState<Lecture | null>(null);
  const [generating, setGenerating] = useState<number | null>(null);

  useEffect(() => {
    if (loggedIn && name) api.progress(name).then(setProgress).catch(() => setProgress([]));
  }, [loggedIn, name, lectures]);

  async function handleLogin() {
    if (!name.trim()) return;
    await api.login(name.trim());
    localStorage.setItem("user", name.trim());
    setLoggedIn(true);
  }

  async function startTest(lec: Lecture) {
    setGenerating(lec.id);
    const nid = notifications.show({
      message: "Готовлю тест…",
      color: "blue",
      loading: true,
      autoClose: false,
    });
    try {
      const quiz = await api.quiz(lec.id);
      // Only the first visit generates; later visits reuse the saved set.
      notifications.update({
        id: nid,
        message: quiz.cached ? "Готовый набор вопросов" : "Вопросы сгенерированы",
        color: "green",
        loading: false,
        autoClose: 2000,
      });
      setActiveQuiz({ lecture: lec, questions: quiz.questions });
    } catch (e) {
      notifications.update({
        id: nid,
        message: `Не удалось открыть тест: ${e}`,
        color: "red",
        loading: false,
        autoClose: 4000,
      });
    } finally {
      setGenerating(null);
    }
  }

  if (!loggedIn) {
    return (
      <Container size="xs" pt={120}>
        <Stack>
          <Title order={2}>Лекции → Тесты</Title>
          <Text c="dimmed">Введите имя, чтобы продолжить</Text>
          <TextInput
            placeholder="Ваше имя"
            value={name}
            onChange={(e) => setName(e.currentTarget.value)}
            onKeyDown={(e) => e.key === "Enter" && handleLogin()}
          />
          <Button onClick={handleLogin}>Войти</Button>
          <Button component={Link} to="/upload" variant="subtle">
            Загрузить лекцию →
          </Button>
        </Stack>
      </Container>
    );
  }

  const masteryByLecture = new Map(progress.map((p) => [p.lecture_id, p]));

  return (
    <AppShell header={{ height: 56 }} padding="md">
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <Title order={4}>Лекции → Тесты</Title>
          <Group>
            <Button component={Link} to="/upload" variant="light">
              Загрузить лекцию
            </Button>
            <Badge variant="light">{name}</Badge>
          </Group>
        </Group>
      </AppShell.Header>

      <AppShell.Main>
        <Container size="md">
          <Stack gap="lg">
            <Title order={3}>Выберите лекцию для теста</Title>
            {lectures.length === 0 && (
              <Text c="dimmed">
                Лекций пока нет. <Link to="/upload">Загрузите первую →</Link>
              </Text>
            )}
            {lectures.map((lec) => {
              const p = masteryByLecture.get(lec.id);
              const ready = lec.status === "done";
              return (
                <Card key={lec.id} withBorder>
                  <Group justify="space-between">
                    <div style={{ flex: 1 }}>
                      <Text fw={600}>{lec.title}</Text>
                      {ready ? (
                        <Progress value={p?.mastery_pct ?? 0} mt="xs" />
                      ) : (
                        <Badge color={lec.status === "failed" ? "red" : "yellow"}>{lec.status}</Badge>
                      )}
                      {p && (
                        <Text size="xs" c="dimmed" mt={4}>
                          Освоено {p.mastery_pct}% · попыток: {p.attempts}
                        </Text>
                      )}
                    </div>
                    <Group gap="xs">
                      {p && p.attempts > 0 && (
                        <Button variant="light" onClick={() => setHistoryLecture(lec)}>
                          История
                        </Button>
                      )}
                      <Button disabled={!ready} loading={generating === lec.id} onClick={() => startTest(lec)}>
                        Начать тест
                      </Button>
                    </Group>
                  </Group>
                </Card>
              );
            })}
          </Stack>
        </Container>
      </AppShell.Main>

      {activeQuiz && (
        <Quiz
          lecture={activeQuiz.lecture}
          questions={activeQuiz.questions}
          userName={name}
          onClose={() => setActiveQuiz(null)}
          onSubmitted={refresh}
        />
      )}

      {historyLecture && (
        <History
          lecture={historyLecture}
          userName={name}
          onClose={() => setHistoryLecture(null)}
        />
      )}
    </AppShell>
  );
}
