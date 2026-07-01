// Cache-through wrappers over `api.*` reads, backed by IndexedDB (see ./db).
//
// Mutable lists (lectures/topics/progress) are network-first: refresh from the
// server when online, fall back to the last-known cache offline. Quiz versions
// are immutable once generated, so they're cache-first — served instantly and
// available offline, revalidated in the background to pick up new generations.
import { api, type Lecture, type Topic, type Progress, type SharedQuiz } from "@/api";
import * as db from "./db";

export async function getLectures(): Promise<Lecture[]> {
  try {
    const fresh = await api.lectures();
    await db.replaceLectures(fresh);
    return fresh;
  } catch (e) {
    const cached = await db.getLecturesLocal();
    if (cached.length) return cached;
    throw e;
  }
}

export async function getTopics(): Promise<Topic[]> {
  try {
    const fresh = await api.topics();
    await db.replaceTopics(fresh);
    return fresh;
  } catch (e) {
    const cached = await db.getTopicsLocal();
    if (cached.length) return cached;
    throw e;
  }
}

export async function getProgress(name: string): Promise<Progress[]> {
  try {
    const fresh = await api.progress(name);
    await db.putProgress(name, fresh);
    return fresh;
  } catch {
    // Offline (or the user has no attempts yet): last-known progress, else empty.
    return db.getProgressLocal(name);
  }
}

export async function getQuizVersion(lectureId: number, version: number): Promise<SharedQuiz> {
  const cached = await db.getQuizLocal(lectureId, version);
  if (cached) {
    // Serve instantly; refresh the cache in the background so total_versions
    // reflects any newer generations next time this test is opened.
    api
      .quizVersion(lectureId, version)
      .then((q) => db.putQuiz(q))
      .catch(() => {});
    return cached;
  }
  const fresh = await api.quizVersion(lectureId, version);
  await db.putQuiz(fresh);
  return fresh;
}
