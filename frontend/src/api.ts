const BASE = "/api";

export interface Lecture {
  id: number;
  title: string;
  status: string;
  summary?: string | null;
  created_at: string;
}

export interface Question {
  question: string;
  options: string[];
  correct_index: number;
}

export interface Progress {
  lecture_id: number;
  title: string;
  attempts: number;
  best_score: number | null;
  last_score: number | null;
  mastery_pct: number;
}

export interface AnswerDetail {
  question: string;
  options: string[];
  user_answer: number;
  correct: number;
  is_correct: boolean;
}

export interface AttemptHistory {
  id: number;
  lecture_id: number;
  lecture_title: string;
  score: number;
  total: number;
  details: AnswerDetail[];
  created_at: string;
}

export type Reaction = "skull" | "heart";

export interface QuestionVotes {
  question_index: number;
  skull: number;
  heart: number;
  mine: Reaction | null;
}

async function json<T>(r: Response): Promise<T> {
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

// PUT a (possibly large) file with upload-progress reporting. fetch() can't
// report upload progress, so we use XHR. Rejects on non-2xx / network error.
function putWithProgress(url: string, file: File, onProgress: (pct: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new Error(`загрузка в хранилище не удалась: HTTP ${xhr.status}`));
    xhr.onerror = () => reject(new Error("сетевая ошибка при загрузке в хранилище"));
    xhr.send(file);
  });
}

export const api = {
  login: (name: string) =>
    fetch(`${BASE}/users`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    }).then(json),

  // 1. get presigned URL  2. PUT video to MinIO (with progress)  3. register lecture.
  // Only allow-listed users may upload; the backend enforces it by login name.
  async upload(
    file: File,
    title: string,
    userName: string,
    onProgress?: (pct: number) => void,
  ): Promise<Lecture> {
    const { upload_url, object_key } = await fetch(
      `${BASE}/lectures/upload-url?filename=${encodeURIComponent(file.name)}` +
        `&user_name=${encodeURIComponent(userName)}`,
    ).then((r) => json<{ upload_url: string; object_key: string }>(r));

    await putWithProgress(upload_url, file, onProgress ?? (() => {}));

    return fetch(`${BASE}/lectures`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_name: userName, title, video_path: object_key }),
    }).then((r) => json<Lecture>(r));
  },

  lectures: () => fetch(`${BASE}/lectures`).then((r) => json<Lecture[]>(r)),

  quiz: (lectureId: number, userName: string) =>
    fetch(`${BASE}/quiz/${lectureId}?user_name=${encodeURIComponent(userName)}`, {
      method: "POST",
    }).then((r) =>
      json<{ lecture_id: number; quiz_set_id: number; questions: Question[]; cached: boolean }>(r),
    ),

  submitAttempt: (body: unknown) =>
    fetch(`${BASE}/attempts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then(json),

  votes: (quizSetId: number, userName: string) =>
    fetch(
      `${BASE}/quiz-sets/${quizSetId}/votes?user_name=${encodeURIComponent(userName)}`,
    ).then((r) => json<QuestionVotes[]>(r)),

  vote: (quizSetId: number, questionIndex: number, userName: string, reaction: Reaction) =>
    fetch(`${BASE}/quiz-sets/${quizSetId}/questions/${questionIndex}/vote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_name: userName, reaction }),
    }).then((r) => json<QuestionVotes>(r)),

  progress: (name: string) =>
    fetch(`${BASE}/users/${encodeURIComponent(name)}/progress`).then((r) => json<Progress[]>(r)),

  attempts: (name: string, lectureId?: number) =>
    fetch(
      `${BASE}/users/${encodeURIComponent(name)}/attempts` +
        (lectureId != null ? `?lecture_id=${lectureId}` : ""),
    ).then((r) => json<AttemptHistory[]>(r)),
};
