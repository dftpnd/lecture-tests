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

async function json<T>(r: Response): Promise<T> {
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export const api = {
  login: (name: string) =>
    fetch(`${BASE}/users`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    }).then(json),

  // 1. get presigned URL  2. PUT video to MinIO  3. register lecture
  async upload(file: File, title: string): Promise<Lecture> {
    const { upload_url, object_key } = await fetch(
      `${BASE}/lectures/upload-url?filename=${encodeURIComponent(file.name)}`,
    ).then((r) => json<{ upload_url: string; object_key: string }>(r));

    await fetch(upload_url, { method: "PUT", body: file });

    return fetch(`${BASE}/lectures`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, video_path: object_key }),
    }).then((r) => json<Lecture>(r));
  },

  lectures: () => fetch(`${BASE}/lectures`).then((r) => json<Lecture[]>(r)),

  quiz: (lectureId: number, n = 20) =>
    fetch(`${BASE}/quiz/${lectureId}?n=${n}`, { method: "POST" }).then((r) =>
      json<{ lecture_id: number; questions: Question[] }>(r),
    ),

  submitAttempt: (body: unknown) =>
    fetch(`${BASE}/attempts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then(json),

  progress: (name: string) =>
    fetch(`${BASE}/users/${encodeURIComponent(name)}/progress`).then((r) => json<Progress[]>(r)),
};
