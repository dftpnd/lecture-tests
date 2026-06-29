import { useEffect, useState } from "react";
import { api, type Lecture } from "./api";

/** Shared lecture list with polling while any lecture is still processing. */
export function useLectures() {
  const [lectures, setLectures] = useState<Lecture[]>([]);

  async function refresh() {
    setLectures(await api.lectures());
  }

  useEffect(() => {
    refresh();
  }, []);

  useEffect(() => {
    const anyProcessing = lectures.some((l) => !["done", "failed"].includes(l.status));
    if (!anyProcessing) return;
    const t = setInterval(refresh, 4000);
    return () => clearInterval(t);
  }, [lectures]);

  return { lectures, refresh };
}
