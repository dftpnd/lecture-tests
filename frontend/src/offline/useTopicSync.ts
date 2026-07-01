import { useCallback, useEffect, useState } from "react";
import * as db from "./db";
import { syncTopic } from "./sync";

/**
 * Tracks which topics are kept offline (persisted forever in IndexedDB) and
 * drives their sync. Subscribed topics are re-synced on mount and whenever the
 * network comes back; toggling a topic on syncs it immediately.
 */
export function useTopicSync() {
  const [synced, setSynced] = useState<number[]>([]);
  const [syncing, setSyncing] = useState<number[]>([]);

  const runTopic = useCallback(async (id: number) => {
    setSyncing((prev) => (prev.includes(id) ? prev : [...prev, id]));
    try {
      await syncTopic(id);
    } finally {
      setSyncing((prev) => prev.filter((x) => x !== id));
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const ids = await db.getSyncedTopics();
      if (cancelled) return;
      setSynced(ids);
      if (navigator.onLine) ids.forEach(runTopic);
    })();
    // When the connection returns, refresh everything the user subscribed to.
    const onOnline = async () => (await db.getSyncedTopics()).forEach(runTopic);
    window.addEventListener("online", onOnline);
    return () => {
      cancelled = true;
      window.removeEventListener("online", onOnline);
    };
  }, [runTopic]);

  const toggle = useCallback(
    async (id: number) => {
      const next = await db.toggleSyncedTopic(id);
      setSynced(next);
      if (next.includes(id)) runTopic(id);
    },
    [runTopic],
  );

  return { synced, syncing, toggle };
}
