import { useEffect, useState } from "react";
import {
  Alert,
  Anchor,
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
import { PwaInstall } from "./PwaInstall";
import { PageShell } from "./PageShell";

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
          <PwaInstall />
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
    <PageShell
      title="Лекции → Тесты"
      actions={
        <>
          <Button component={Link} to="/users" variant="subtle" size="xs">
            Пользователи
          </Button>
          <Button component={Link} to="/upload" variant="light" size="xs">
            Загрузить лекцию
          </Button>
          <Badge variant="light">{name}</Badge>
        </>
      }
    >
      <Container size="md" pt={26}>
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
            <PwaInstall />
            <Group justify="center" gap="lg">
              <Anchor
                href="https://t.me/daft_frame"
                target="_blank"
                rel="noopener noreferrer"
                c="dimmed"
                style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.139-5.061 3.345-.479.329-.913.489-1.302.481-.428-.009-1.252-.242-1.865-.44-.752-.244-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
                </svg>
                daft_frame
              </Anchor>
              <Anchor
                href="https://github.com/dftpnd/lecture-tests"
                target="_blank"
                rel="noopener noreferrer"
                c="dimmed"
                style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0 1 12 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222 0 1.606-.014 2.898-.014 3.293 0 .322.216.694.825.576C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
                </svg>
                GitHub
              </Anchor>
            </Group>
          </Stack>
        </Container>

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
    </PageShell>
  );
}
