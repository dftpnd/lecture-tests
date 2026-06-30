import { useEffect, useState } from "react";
import { api, type Topic } from "./api";

/** Shared topic list. */
export function useTopics() {
  const [topics, setTopics] = useState<Topic[]>([]);

  async function refresh() {
    setTopics(await api.topics());
  }

  useEffect(() => {
    refresh();
  }, []);

  return { topics, refresh };
}
