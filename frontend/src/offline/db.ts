// IndexedDB storage for offline support, via the tiny `idb` promise wrapper.
//
// Schema (v1) — kept intentionally small (a quiz is ~20 questions of text):
//   topics / lectures  — the list views, keyed by id
//   quizzes            — a whole SharedQuiz per `${lectureId}:${version}` (immutable once generated)
//   progress           — a user's Progress[] keyed by user name
//   outbox / meta      — reserved for Phase 2 (queued writes) and Phase 3 (offline flags);
//                        created now so adding those features needs no version bump.
import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { Lecture, Topic, Progress, SharedQuiz } from "@/api";

/** A write that couldn't reach the server yet (attempt/vote), replayed when back online. */
export interface OutboxItem {
  id?: number; // autoincrement key
  kind: "attempt" | "vote";
  idempotencyKey: string;
  body: unknown;
  createdAt: number;
}

interface LtDB extends DBSchema {
  topics: { key: number; value: Topic };
  lectures: { key: number; value: Lecture };
  quizzes: { key: string; value: SharedQuiz };
  progress: { key: string; value: Progress[] };
  outbox: { key: number; value: OutboxItem; indexes: { by_created: number } };
  meta: { key: string; value: unknown };
}

const DB_NAME = "lecture-tests";
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<LtDB>> | null = null;

function getDb(): Promise<IDBPDatabase<LtDB>> {
  if (!dbPromise) {
    dbPromise = openDB<LtDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        db.createObjectStore("topics", { keyPath: "id" });
        db.createObjectStore("lectures", { keyPath: "id" });
        db.createObjectStore("quizzes"); // out-of-line key: `${lectureId}:${version}`
        db.createObjectStore("progress"); // out-of-line key: user name
        const outbox = db.createObjectStore("outbox", { keyPath: "id", autoIncrement: true });
        outbox.createIndex("by_created", "createdAt");
        db.createObjectStore("meta"); // out-of-line key: arbitrary string
      },
    });
  }
  return dbPromise;
}

// --- lectures / topics: replace the whole list so server-side deletions don't linger ---

export async function replaceLectures(list: Lecture[]): Promise<void> {
  const db = await getDb();
  const tx = db.transaction("lectures", "readwrite");
  await tx.store.clear();
  for (const l of list) await tx.store.put(l);
  await tx.done;
}

export async function getLecturesLocal(): Promise<Lecture[]> {
  return (await getDb()).getAll("lectures");
}

export async function replaceTopics(list: Topic[]): Promise<void> {
  const db = await getDb();
  const tx = db.transaction("topics", "readwrite");
  await tx.store.clear();
  for (const t of list) await tx.store.put(t);
  await tx.done;
}

export async function getTopicsLocal(): Promise<Topic[]> {
  return (await getDb()).getAll("topics");
}

// --- quizzes: immutable, cached forever under `${lectureId}:${version}` ---

const quizKey = (lectureId: number, version: number) => `${lectureId}:${version}`;

export async function getQuizLocal(
  lectureId: number,
  version: number,
): Promise<SharedQuiz | undefined> {
  return (await getDb()).get("quizzes", quizKey(lectureId, version));
}

export async function putQuiz(q: SharedQuiz): Promise<void> {
  await (await getDb()).put("quizzes", q, quizKey(q.lecture_id, q.version));
}

// --- progress: a user's whole Progress[] keyed by name ---

export async function getProgressLocal(user: string): Promise<Progress[]> {
  return (await (await getDb()).get("progress", user)) ?? [];
}

export async function putProgress(user: string, items: Progress[]): Promise<void> {
  await (await getDb()).put("progress", items, user);
}

/** Smallest cached generation for a lecture, or null — used to open a test offline. */
export async function getAnyCachedQuizVersion(lectureId: number): Promise<number | null> {
  const keys = await (await getDb()).getAllKeys("quizzes");
  const prefix = `${lectureId}:`;
  const versions = keys
    .filter((k): k is string => typeof k === "string" && k.startsWith(prefix))
    .map((k) => Number(k.slice(prefix.length)))
    .filter((n) => Number.isInteger(n));
  return versions.length ? Math.min(...versions) : null;
}

// --- meta: topics the user subscribed to keep offline (persisted forever) ---

const SYNCED_TOPICS_KEY = "syncedTopics";

export async function getSyncedTopics(): Promise<number[]> {
  const v = (await (await getDb()).get("meta", SYNCED_TOPICS_KEY)) as number[] | undefined;
  return v ?? [];
}

export async function toggleSyncedTopic(topicId: number): Promise<number[]> {
  const cur = await getSyncedTopics();
  const next = cur.includes(topicId) ? cur.filter((id) => id !== topicId) : [...cur, topicId];
  await (await getDb()).put("meta", next, SYNCED_TOPICS_KEY);
  return next;
}
