import { useState } from "react";
import { api } from "./api";
import { PwaInstall } from "./PwaInstall";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";

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
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-sm flex-col justify-center gap-4 px-4 py-16 [padding-left:max(1rem,env(safe-area-inset-left))] [padding-right:max(1rem,env(safe-area-inset-right))]">
      <h1 className="text-2xl font-bold">Лекции → Тесты</h1>
      {intro && <p className="text-sm text-muted-foreground">{intro}</p>}

      {step === "name" && (
        <>
          <p className="text-sm text-muted-foreground">Введите имя, чтобы продолжить</p>
          <Input
            placeholder="Ваше имя"
            value={name}
            onChange={(e) => setName(e.currentTarget.value)}
            onKeyDown={(e) => e.key === "Enter" && handleContinue()}
            autoFocus
          />
          {authError && <p className="text-sm text-destructive">{authError}</p>}
          <Button onClick={handleContinue} disabled={authBusy}>
            {authBusy ? "Проверяем…" : "Далее"}
          </Button>
        </>
      )}

      {step === "password" && (
        <>
          {mode === "register" && (
            <p className="text-sm text-muted-foreground">
              Первый вход под именем <b>{name.trim()}</b>. Придумайте пароль.
            </p>
          )}
          {mode === "setup" && (
            <Alert variant="info">
              <AlertTitle>Теперь нужен пароль</AlertTitle>
              <AlertDescription>
                Раньше вход был только по имени. Придумайте пароль для своей учётной записи{" "}
                <b>{name.trim()}</b> — дальше он будет нужен при каждом входе.
              </AlertDescription>
            </Alert>
          )}
          {mode === "login" && (
            <p className="text-sm text-muted-foreground">
              С возвращением, <b>{name.trim()}</b>. Введите пароль.
            </p>
          )}

          <Input
            type="password"
            placeholder="Пароль"
            value={password}
            onChange={(e) => setPassword(e.currentTarget.value)}
            onKeyDown={(e) => e.key === "Enter" && mode === "login" && handleSubmit()}
            autoFocus
          />
          {mode !== "login" && (
            <Input
              type="password"
              placeholder="Повторите пароль"
              value={confirm}
              onChange={(e) => setConfirm(e.currentTarget.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            />
          )}
          {authError && <p className="text-sm text-destructive">{authError}</p>}
          <div className="flex items-center justify-between">
            <Button variant="ghost" onClick={backToName} disabled={authBusy}>
              ← Назад
            </Button>
            <Button onClick={handleSubmit} disabled={authBusy}>
              {mode === "login" ? "Войти" : "Создать пароль и войти"}
            </Button>
          </div>
        </>
      )}
      <PwaInstall />
    </div>
  );
}
