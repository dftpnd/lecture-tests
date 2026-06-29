import { useEffect, useState } from "react";
import {
  AppShell,
  Button,
  Card,
  Container,
  Group,
  Progress,
  Stack,
  Text,
  TextInput,
  Title,
  Badge,
} from "@mantine/core";
import { Dropzone, MIME_TYPES } from "@mantine/dropzone";
import { notifications } from "@mantine/notifications";
import { api, type Lecture, type Question, type Progress as Prog } from "./api";
import { Quiz } from "./Quiz";

export function App() {
  const [name, setName] = useState(localStorage.getItem("user") ?? "");
  const [loggedIn, setLoggedIn] = useState(false);
  const [lectures, setLectures] = useState<Lecture[]>([]);
  const [progress, setProgress] = useState<Prog[]>([]);
  const [activeQuiz, setActiveQuiz] = useState<{ lecture: Lecture; questions: Question[] } | null>(null);
  const [generating, setGenerating] = useState<number | null>(null);

  async function refresh() {
    setLectures(await api.lectures());
    if (name) setProgress(await api.progress(name).catch(() => []));
  }

  useEffect(() => {
    if (loggedIn) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loggedIn]);

  // Poll while any lecture is still processing.
  useEffect(() => {
    if (!loggedIn) return;
    const anyProcessing = lectures.some((l) => !["done", "failed"].includes(l.status));
    if (!anyProcessing) return;
    const t = setInterval(refresh, 4000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lectures, loggedIn]);

  async function handleLogin() {
    if (!name.trim()) return;
    await api.login(name.trim());
    localStorage.setItem("user", name.trim());
    setLoggedIn(true);
  }

  async function handleDrop(files: File[]) {
    const file = files[0];
    notifications.show({ message: `Загружаю «${file.name}»…`, color: "blue" });
    try {
      await api.upload(file, file.name.replace(/\.[^.]+$/, ""));
      notifications.show({ message: "Видео загружено, идёт обработка", color: "green" });
      refresh();
    } catch (e) {
      notifications.show({ message: `Ошибка загрузки: ${e}`, color: "red" });
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
          <Badge variant="light">{name}</Badge>
        </Group>
      </AppShell.Header>

      <AppShell.Main>
        <Container size="md">
          <Stack gap="lg">
            <Dropzone onDrop={handleDrop} accept={[MIME_TYPES.mp4, "video/x-matroska", "video/*"]} maxFiles={1}>
              <Text ta="center" py="xl">
                Перетащите видео лекции сюда или кликните для выбора
              </Text>
            </Dropzone>

            <Title order={3}>Лекции</Title>
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
                    <Button
                      disabled={!ready}
                      loading={generating === lec.id}
                      onClick={() => startTest(lec)}
                    >
                      Начать тест
                    </Button>
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
    </AppShell>
  );

  // Generate 20 fresh questions on demand, then open the quiz modal.
  async function startTest(lec: Lecture) {
    setGenerating(lec.id);
    notifications.show({ message: "Генерирую вопросы…", color: "blue" });
    try {
      const quiz = await api.quiz(lec.id);
      setActiveQuiz({ lecture: lec, questions: quiz.questions });
    } catch (e) {
      notifications.show({ message: `Не удалось сгенерировать тест: ${e}`, color: "red" });
    } finally {
      setGenerating(null);
    }
  }
}
