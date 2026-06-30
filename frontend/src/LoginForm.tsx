import { useState } from "react";
import {
  Alert,
  Button,
  Container,
  Group,
  PasswordInput,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { api } from "./api";
import { PwaInstall } from "./PwaInstall";

/**
 * Two-step login (enter a name, then create/verify a password) shared by the
 * home page and the shared-test page. Persists the canonical user name in
 * localStorage and reports it back via onLoggedIn.
 */
export function LoginForm({
  onLoggedIn,
  intro,
}: {
  onLoggedIn: (name: string) => void;
  intro?: string;
}) {
  const [name, setName] = useState(localStorage.getItem("user") ?? "");
  const [step, setStep] = useState<"name" | "password">("name");
  // register = brand-new user · setup = existing user without a password yet · login = has one
  const [mode, setMode] = useState<"register" | "setup" | "login">("login");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState("");

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
      onLoggedIn(user.name);
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

  return (
    <Container size="xs" pt={120}>
      <Stack>
        <Title order={2}>Лекции → Тесты</Title>
        {intro && <Text c="dimmed">{intro}</Text>}

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
