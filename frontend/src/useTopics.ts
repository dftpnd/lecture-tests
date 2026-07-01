import { useEffect, useState } from "react";
import { type Topic } from "./api";
import { getTopics } from "./offline/cachedApi";

/** Shared topic list. */
export function useTopics() {
  const [topics, setTopics] = useState<Topic[]>([]);

  async function refresh() {
    setTopics(await getTopics());
  }

  useEffect(() => {
    refresh();
  }, []);

  return { topics, refresh };
}
