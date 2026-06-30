const BASE = "/api";

export interface User {
  id: number;
  name: string;
}

export interface Topic {
  id: number;
  name: string;
}

export interface Lecture {
  id: number;
  topic_id: number;
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

export interface SharedQuiz {
  lecture_id: number;
  lecture_title: string;
  quiz_set_id: number;
  version: number;
  total_versions: number;
  questions: Question[];
}

export interface Progress {
  lecture_id: number;
  title: string;
  attempts: number;
  best_score: number | null;
  last_score: number | null;
  mastery_pct: number;
}

export interface UserProgressSummary {
  name: string;
  attempts: number;
  lectures_started: number;
  avg_mastery_pct: number;
  created_at: string;
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

// POST a multipart form with upload-progress reporting. fetch() can't report
// upload progress, so we use XHR. Resolves with the parsed JSON response.
function postFormWithProgress<T>(
  url: string,
  form: FormData,
  onProgress: (pct: number) => void,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText) as T);
        } catch {
          reject(new Error("некорректный ответ сервера"));
        }
      } else {
        reject(new Error(xhr.responseText || `HTTP ${xhr.status}`));
      }
    };
    xhr.onerror = () => reject(new Error("сетевая ошибка при загрузке"));
    xhr.send(form);
  });
}

export const api = {
  users: () => fetch(`${BASE}/users`).then((r) => json<UserProgressSummary[]>(r)),

  // Before asking for a password: is the name new, password-protected, or needs setup?
  userStatus: (name: string) =>
    fetch(`${BASE}/users/check?name=${encodeURIComponent(name)}`).then((r) =>
      json<{ exists: boolean; has_password: boolean }>(r),
    ),

  login: (name: string, password: string) =>
    fetch(`${BASE}/users`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, password }),
    }).then((r) => json<User>(r)),

  topics: () => fetch(`${BASE}/topics`).then((r) => json<Topic[]>(r)),

  createTopic: (name: string, userName: string) =>
    fetch(`${BASE}/topics`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_name: userName, name }),
    }).then((r) => json<Topic>(r)),

  // Upload the video straight through the API (which streams it into MinIO
  // server-side and registers the lecture). Keeps MinIO off the public network.
  // Only allow-listed users may upload; the backend enforces it by login name.
  async upload(
    file: File,
    title: string,
    topicId: number,
    userName: string,
    onProgress?: (pct: number) => void,
  ): Promise<Lecture> {
    const form = new FormData();
    form.append("file", file);
    form.append("title", title);
    form.append("topic_id", String(topicId));
    form.append("user_name", userName);
    return postFormWithProgress<Lecture>(`${BASE}/lectures/upload`, form, onProgress ?? (() => {}));
  },

  // Preview a YouTube URL before ingesting so the user confirms the right video.
  youtubeInfo: (url: string, userName: string) =>
    fetch(
      `${BASE}/lectures/youtube/info?url=${encodeURIComponent(url)}&user_name=${encodeURIComponent(userName)}`,
    ).then((r) => json<{ title: string; duration: number | null; uploader: string | null }>(r)),

  // Register a lecture from a YouTube URL; the server downloads it and runs the
  // same pipeline. Only allow-listed users may do this (enforced by the backend).
  uploadYoutube: (url: string, topicId: number, userName: string): Promise<Lecture> =>
    fetch(`${BASE}/lectures/youtube`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, topic_id: topicId, user_name: userName }),
    }).then((r) => json<Lecture>(r)),

  lectures: () => fetch(`${BASE}/lectures`).then((r) => json<Lecture[]>(r)),

  quiz: (lectureId: number, userName: string) =>
    fetch(`${BASE}/quiz/${lectureId}?user_name=${encodeURIComponent(userName)}`, {
      method: "POST",
    }).then((r) =>
      json<{
        lecture_id: number;
        quiz_set_id: number;
        version: number;
        total_versions: number;
        questions: Question[];
        cached: boolean;
      }>(r),
    ),

  // Fetch one generation of a lecture's test by 1-based version — the /t/<lec>/<ver> target.
  quizVersion: (lectureId: number, version: number) =>
    fetch(`${BASE}/quiz/lectures/${lectureId}/versions/${version}`).then((r) =>
      json<SharedQuiz>(r),
    ),

  // Resolve a legacy /t/<quizSetId> link to its (lecture, version).
  quizSet: (quizSetId: number) =>
    fetch(`${BASE}/quiz/sets/${quizSetId}`).then((r) => json<SharedQuiz>(r)),

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
