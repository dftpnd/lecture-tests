import { useEffect, useState } from "react";
import {
  Alert,
  AppShell,
  Badge,
  Button,
  Card,
  Container,
  Group,
  PasswordInput,
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
import { useTopics } from "./useTopics";

export function TestPage() {
  const [name, setName] = useState(localStorage.getItem("user") ?? "");
  const [loggedIn, setLoggedIn] = useState(Boolean(localStorage.getItem("user")));
  // Login is two-step: enter a name, then enter/create a password depending on status.
  const [step, setStep] = useState<"name" | "password">("name");
  // register = brand-new user · setup = existing user without a password yet · login = has one
  const [mode, setMode] = useState<"register" | "setup" | "login">("login");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState("");
  const { lectures, refresh } = useLectures();
  const { topics } = useTopics();
  const [progress, setProgress] = useState<Prog[]>([]);
  const [activeQuiz, setActiveQuiz] = useState<{
    lecture: Lecture;
    questions: Question[];
    quizSetId: number;
  } | null>(null);
  const [historyLecture, setHistoryLecture] = useState<Lecture | null>(null);
  const [generating, setGenerating] = useState<number | null>(null);

  useEffect(() => {
    if (loggedIn && name) api.progress(name).then(setProgress).catch(() => setProgress([]));
  }, [loggedIn, name, lectures]);

  // Step 1: look up the name to decide whether to register, set up, or just log in.
  async function handleContinue() {
    const n = name.trim();
    if (!n) return;
    setAuthError("");
    setAuthBusy(true);
    try {
      const status = await api.userStatus(n);
      setMode(!status.exists ? "register" : status.has_password ? "login" : "setup");
      setPassword("");
      setConfirm("");
      setStep("password");
    } catch {
      setAuthError("Не удалось проверить имя, попробуйте ещё раз");
    } finally {
      setAuthBusy(false);
    }
  }

  // Step 2: create the password (register/setup, with confirmation) or verify it (login).
  async function handleSubmit() {
    if (!password) return;
    if (mode !== "login" && password !== confirm) {
      setAuthError("Пароли не совпадают");
      return;
    }
    setAuthError("");
    setAuthBusy(true);
    try {
      // Use the canonical name the backend stores, not the typed casing,
      // so the identity stays stable however the login was capitalised.
      const user = await api.login(name.trim(), password);
      localStorage.setItem("user", user.name);
      setName(user.name);
      setLoggedIn(true);
    } catch {
      // Backend returns 401 only for a wrong password (login mode).
      setAuthError(mode === "login" ? "Неверный пароль" : "Не удалось войти, попробуйте ещё раз");
    } finally {
      setAuthBusy(false);
    }
  }

  function backToName() {
    setStep("name");
    setAuthError("");
    setPassword("");
    setConfirm("");
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
      const quiz = await api.quiz(lec.id, name);
      // Reuses a set you haven't taken yet; generates a fresh one if you've done them all.
      notifications.update({
        id: nid,
        message: quiz.cached ? "Готовый набор вопросов" : "Новый набор вопросов сгенерирован",
        color: "green",
        loading: false,
        autoClose: 2000,
      });
      setActiveQuiz({ lecture: lec, questions: quiz.questions, quizSetId: quiz.quiz_set_id });
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

          {step === "name" && (
            <>
              <Text c="dimmed">Введите имя, чтобы продолжить</Text>
              <TextInput
                placeholder="Ваше имя"
                value={name}
                onChange={(e) => setName(e.currentTarget.value)}
                onKeyDown={(e) => e.key === "Enter" && handleContinue()}
                autoFocus
              />
              {authError && <Text c="red" size="sm">{authError}</Text>}
              <Button onClick={handleContinue} loading={authBusy}>
                Далее
              </Button>
            </>
          )}

          {step === "password" && (
            <>
              {mode === "register" && (
                <Text c="dimmed">
                  Первый вход под именем <b>{name.trim()}</b>. Придумайте пароль.
                </Text>
              )}
              {mode === "setup" && (
                <Alert color="blue" title="Теперь нужен пароль">
                  Раньше вход был только по имени. Придумайте пароль для своей учётной записи{" "}
                  <b>{name.trim()}</b> — дальше он будет нужен при каждом входе.
                </Alert>
              )}
              {mode === "login" && (
                <Text c="dimmed">
                  С возвращением, <b>{name.trim()}</b>. Введите пароль.
                </Text>
              )}

              <PasswordInput
                placeholder="Пароль"
                value={password}
                onChange={(e) => setPassword(e.currentTarget.value)}
                onKeyDown={(e) => e.key === "Enter" && mode === "login" && handleSubmit()}
                autoFocus
              />
              {mode !== "login" && (
                <PasswordInput
                  placeholder="Повторите пароль"
                  value={confirm}
                  onChange={(e) => setConfirm(e.currentTarget.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                />
              )}
              {authError && <Text c="red" size="sm">{authError}</Text>}
              <Group justify="space-between">
                <Button variant="subtle" onClick={backToName} disabled={authBusy}>
                  ← Назад
                </Button>
                <Button onClick={handleSubmit} loading={authBusy}>
                  {mode === "login" ? "Войти" : "Создать пароль и войти"}
                </Button>
              </Group>
            </>
          )}
        </Stack>
      </Container>
    );
  }

  const masteryByLecture = new Map(progress.map((p) => [p.lecture_id, p]));

  // Group lectures by topic, ordered the same way topics come from the API (by name).
  const orderedTopics = topics.filter((t) => lectures.some((l) => l.topic_id === t.id));
  const orphanLectures = lectures.filter((l) => !topics.some((t) => t.id === l.topic_id));

  function renderLectureCard(lec: Lecture) {
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
  }

  return (
    <AppShell header={{ height: 56 }} padding="md">
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <Title order={4}>Лекции → Тесты</Title>
          <Group>
            <Button component={Link} to="/users" variant="subtle">
              Пользователи
            </Button>
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
            {orderedTopics.map((topic) => (
              <Stack key={topic.id} gap="sm">
                <Title order={5} c="dimmed">
                  {topic.name}
                </Title>
                {lectures
                  .filter((l) => l.topic_id === topic.id)
                  .map((lec) => renderLectureCard(lec))}
              </Stack>
            ))}
            {orphanLectures.length > 0 && (
              <Stack gap="sm">
                <Title order={5} c="dimmed">
                  Без темы
                </Title>
                {orphanLectures.map((lec) => renderLectureCard(lec))}
              </Stack>
            )}
          </Stack>
        </Container>
      </AppShell.Main>

      {activeQuiz && (
        <Quiz
          lecture={activeQuiz.lecture}
          questions={activeQuiz.questions}
          quizSetId={activeQuiz.quizSetId}
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
