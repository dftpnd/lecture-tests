// Offline sync for a subscribed topic: cache one test per lecture so the topic's
// tests can be opened and taken without network. Quizzes are immutable, so a
// lecture already downloaded is skipped — a sync only fetches what's missing.
// Runs are best-effort: offline, the quiz fetches simply fail and are retried
// on the next sync (triggered when the network comes back).
import { api } from "@/api";
import * as db from "./db";
import { getLectures } from "./cachedApi";

/** Download version 1 of every done-lecture in the topic that isn't cached yet. */
export async function syncTopic(topicId: number): Promise<void> {
  const lectures = await getLectures(); // also refreshes the cached lecture list
  const done = lectures.filter((l) => l.topic_id === topicId && l.status === "done");
  for (const lec of done) {
    if (await db.getAnyCachedQuizVersion(lec.id)) continue; // already downloaded
    try {
      await db.putQuiz(await api.quizVersion(lec.id, 1));
    } catch {
      // No test generated for this lecture yet (or offline) — a later sync retries.
    }
  }
}
