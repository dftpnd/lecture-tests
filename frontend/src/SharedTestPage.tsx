import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { api, type SharedQuiz } from "./api";
import { Quiz } from "./Quiz";
import { LoginForm } from "./LoginForm";
import { Button } from "@/components/ui/button";

/**
 * The target of a shared test link (/t/:lectureId/:version): logs the visitor in
 * if needed, then opens that lecture's test at the requested generation. The
 * version switcher inside the test navigates between generations by URL.
 */
export function SharedTestPage() {
  const { lectureId, version } = useParams();
  const lecId = Number(lectureId);
  const ver = Number(version);
  const navigate = useNavigate();

  const [name, setName] = useState(localStorage.getItem("user") ?? "");
  const [loggedIn, setLoggedIn] = useState(Boolean(localStorage.getItem("user")));
  const [quiz, setQuiz] = useState<SharedQuiz | null>(null);
  const [error, setError] = useState("");

  const valid = Number.isInteger(lecId) && Number.isInteger(ver) && ver >= 1;

  useEffect(() => {
    if (!loggedIn || !valid) return;
    setQuiz(null);
    setError("");
    api
      .quizVersion(lecId, ver)
      .then(setQuiz)
      .catch(() => setError("Тест не найден — возможно, ссылка устарела."));
  }, [loggedIn, lecId, ver, valid]);

  if (!valid) {
    return <Notice text="Некорректная ссылка на тест." onHome={() => navigate("/")} />;
  }

  if (!loggedIn) {
    return (
      <LoginForm
        intro="Войдите, чтобы пройти тест по ссылке."
        onLoggedIn={(n) => {
          setName(n);
          setLoggedIn(true);
        }}
      />
    );
  }

  if (error) {
    return <Notice text={error} onHome={() => navigate("/")} />;
  }

  if (!quiz) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="size-7 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <Quiz
      // Remount on version switch so answers/progress reset for the new set.
      key={quiz.version}
      lectureId={quiz.lecture_id}
      lectureTitle={quiz.lecture_title}
      questions={quiz.questions}
      quizSetId={quiz.quiz_set_id}
      version={quiz.version}
      totalVersions={quiz.total_versions}
      onChangeVersion={(v) => navigate(`/t/${quiz.lecture_id}/${v}`)}
      userName={name}
      onClose={() => navigate("/")}
      onSubmitted={() => {}}
    />
  );
}

/**
 * Legacy /t/:quizSetId links: look the set up, then redirect to the versioned
 * URL so old shared links keep working.
 */
export function LegacyTestRedirect() {
  const { quizSetId } = useParams();
  const id = Number(quizSetId);
  const navigate = useNavigate();
  const [error, setError] = useState("");

  useEffect(() => {
    if (!Number.isInteger(id)) {
      setError("Некорректная ссылка на тест.");
      return;
    }
    api
      .quizSet(id)
      .then((q) => navigate(`/t/${q.lecture_id}/${q.version}`, { replace: true }))
      .catch(() => setError("Тест не найден — возможно, ссылка устарела."));
  }, [id]);

  if (error) {
    return <Notice text={error} onHome={() => navigate("/")} />;
  }
  return (
    <div className="flex h-[60vh] items-center justify-center">
      <Loader2 className="size-7 animate-spin text-muted-foreground" />
    </div>
  );
}

function Notice({ text, onHome }: { text: string; onHome: () => void }) {
  return (
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-sm flex-col justify-center gap-4 px-4">
      <p>{text}</p>
      <Button onClick={onHome}>На главную</Button>
    </div>
  );
}
