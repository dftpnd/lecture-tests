import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Link, useNavigate } from "react-router-dom";
import { api, type Lecture, type Progress as Prog } from "./api";
import { History } from "./History";
import { LoginForm } from "./LoginForm";
import { useLectures } from "./useLectures";
import { useTopics } from "./useTopics";
import { PwaInstall } from "./PwaInstall";
import { PageShell } from "./PageShell";
import { canUploadVideos } from "./permissions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

// Hardcoded ordering/visibility tweaks for the topic list.
const PINNED_TOPIC = "LLM инженер (гигаскул)"; // always shown first
const UPLOADERS_ONLY_TOPIC = "для тест"; // only visible to users who can upload videos

export function TestPage() {
  const [name, setName] = useState(localStorage.getItem("user") ?? "");
  const [loggedIn, setLoggedIn] = useState(Boolean(localStorage.getItem("user")));
  const { lectures } = useLectures();
  const { topics } = useTopics();
  const [progress, setProgress] = useState<Prog[]>([]);
  const [historyLecture, setHistoryLecture] = useState<Lecture | null>(null);
  const [generating, setGenerating] = useState<number | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (loggedIn && name) api.progress(name).then(setProgress).catch(() => setProgress([]));
  }, [loggedIn, name, lectures]);

  async function startTest(lec: Lecture) {
    setGenerating(lec.id);
    const tid = toast.loading("Готовлю тест…");
    try {
      const quiz = await api.quiz(lec.id, name);
      // Reuses a set you haven't taken yet; generates a fresh one if you've done them all.
      toast.success(quiz.cached ? "Готовый набор вопросов" : "Новый набор вопросов сгенерирован", {
        id: tid,
        duration: 2000,
      });
      // Open the test at its own shareable, versioned URL instead of a modal.
      navigate(`/t/${quiz.lecture_id}/${quiz.version}`);
    } catch (e) {
      toast.error(`Не удалось открыть тест: ${e}`, { id: tid, duration: 4000 });
    } finally {
      setGenerating(null);
    }
  }

  if (!loggedIn) {
    return (
      <LoginForm
        onLoggedIn={(n) => {
          setName(n);
          setLoggedIn(true);
        }}
      />
    );
  }

  const masteryByLecture = new Map(progress.map((p) => [p.lecture_id, p]));

  // Group lectures by topic. "для тест" is only for users who may upload videos;
  // "LLM инженер (гигаскул)" is pinned to the top, the rest keep API order (by name).
  const canUpload = canUploadVideos(name);
  const orderedTopics = topics
    .filter((t) => lectures.some((l) => l.topic_id === t.id))
    .filter((t) => canUpload || t.name !== UPLOADERS_ONLY_TOPIC)
    .sort((a, b) => {
      if (a.name === PINNED_TOPIC) return -1;
      if (b.name === PINNED_TOPIC) return 1;
      return 0;
    });
  const orphanLectures = lectures.filter((l) => !topics.some((t) => t.id === l.topic_id));

  function renderLectureCard(lec: Lecture) {
    const p = masteryByLecture.get(lec.id);
    const ready = lec.status === "done";
    return (
      <Card key={lec.id}>
        <CardContent className="flex items-center justify-between gap-3 p-4">
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold">{lec.title}</p>
            {ready ? (
              <Progress className="mt-2" value={p?.mastery_pct ?? 0} />
            ) : (
              <Badge variant={lec.status === "failed" ? "destructive" : "warning"} className="mt-1">
                {lec.status}
              </Badge>
            )}
            {p && (
              <p className="mt-1 text-xs text-muted-foreground">
                Освоено {p.mastery_pct}% · попыток: {p.attempts}
              </p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {p && p.attempts > 0 && (
              <Button variant="secondary" size="sm" onClick={() => setHistoryLecture(lec)}>
                История
              </Button>
            )}
            <Button
              size="sm"
              disabled={!ready || generating === lec.id}
              onClick={() => startTest(lec)}
            >
              {generating === lec.id ? "…" : "Начать тест"}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <PageShell
      title="Лекции → Тесты"
      actions={
        <>
          <Button asChild variant="ghost" size="sm">
            <Link to="/users">Пользователи</Link>
          </Button>
          <Button asChild variant="secondary" size="sm">
            <Link to="/upload">Загрузить лекцию</Link>
          </Button>
          <Badge variant="secondary" className="justify-center">
            {name}
          </Badge>
        </>
      }
    >
      <div className="flex flex-col gap-6">
        <h2 className="text-lg font-semibold">Выберите лекцию для теста</h2>
        {lectures.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Лекций пока нет.{" "}
            <Link to="/upload" className="text-primary underline-offset-4 hover:underline">
              Загрузите первую →
            </Link>
          </p>
        )}
        {orderedTopics.map((topic) => (
          <div key={topic.id} className="flex flex-col gap-3">
            <h3 className="text-sm font-semibold text-muted-foreground">{topic.name}</h3>
            {lectures.filter((l) => l.topic_id === topic.id).map((lec) => renderLectureCard(lec))}
          </div>
        ))}
        {orphanLectures.length > 0 && (
          <div className="flex flex-col gap-3">
            <h3 className="text-sm font-semibold text-muted-foreground">Без темы</h3>
            {orphanLectures.map((lec) => renderLectureCard(lec))}
          </div>
        )}
        <PwaInstall />
        <div className="flex items-center justify-center gap-6">
          <a
            href="https://t.me/daft_frame"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.139-5.061 3.345-.479.329-.913.489-1.302.481-.428-.009-1.252-.242-1.865-.44-.752-.244-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
            </svg>
            daft_frame
          </a>
          <a
            href="https://github.com/dftpnd/lecture-tests"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0 1 12 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222 0 1.606-.014 2.898-.014 3.293 0 .322.216.694.825.576C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
            </svg>
            GitHub
          </a>
        </div>
      </div>

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
