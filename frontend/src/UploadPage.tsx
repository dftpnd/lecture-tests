import { useState } from "react";
import { useDropzone } from "react-dropzone";
import { toast } from "sonner";
import { Link } from "react-router-dom";
import { api } from "./api";
import { useLectures } from "./useLectures";
import { useTopics } from "./useTopics";
import { PageShell } from "./PageShell";
import { canUploadVideos } from "./permissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const statusVariant = (s: string): "success" | "destructive" | "warning" =>
  s === "done" ? "success" : s === "failed" ? "destructive" : "warning";

export function UploadPage() {
  const { lectures, refresh } = useLectures();
  const { topics, refresh: refreshTopics } = useTopics();
  const [topicId, setTopicId] = useState<string | null>(null);
  const [showNewTopic, setShowNewTopic] = useState(false);
  const [newTopicName, setNewTopicName] = useState("");
  const [creatingTopic, setCreatingTopic] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [pct, setPct] = useState(0);
  const [currentFile, setCurrentFile] = useState("");
  const [source, setSource] = useState<"file" | "link">("file");
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [submittingLink, setSubmittingLink] = useState(false);
  const [checkingLink, setCheckingLink] = useState(false);
  const [linkInfo, setLinkInfo] = useState<{
    title: string;
    duration: number | null;
    uploader: string | null;
  } | null>(null);

  const userName = localStorage.getItem("user") ?? "";
  const canUpload = canUploadVideos(userName);
  const topicName = new Map(topics.map((t) => [t.id, t.name]));

  async function handleCreateTopic() {
    const name = newTopicName.trim();
    if (!name) return;
    setCreatingTopic(true);
    try {
      const topic = await api.createTopic(name, userName);
      await refreshTopics();
      setTopicId(String(topic.id));
      setNewTopicName("");
      setShowNewTopic(false);
    } catch (e) {
      toast.error(`Не удалось создать тему: ${e}`);
    } finally {
      setCreatingTopic(false);
    }
  }

  async function handleCheckLink() {
    const url = youtubeUrl.trim();
    if (!url) return;
    setCheckingLink(true);
    setLinkInfo(null);
    try {
      const info = await api.youtubeInfo(url, userName);
      setLinkInfo(info);
    } catch (e) {
      toast.error(`Не удалось прочитать ссылку: ${e}`);
    } finally {
      setCheckingLink(false);
    }
  }

  async function handleYoutubeSubmit() {
    if (!topicId) {
      toast.warning("Сначала выберите тему для лекции");
      return;
    }
    const url = youtubeUrl.trim();
    if (!url) return;
    setSubmittingLink(true);
    try {
      await api.uploadYoutube(url, Number(topicId), userName);
      toast.success("Ссылка принята, видео скачивается");
      setYoutubeUrl("");
      setLinkInfo(null);
      refresh();
    } catch (e) {
      toast.error(`Не удалось добавить ссылку: ${e}`);
    } finally {
      setSubmittingLink(false);
    }
  }

  // Format seconds as h:mm:ss / m:ss for the preview card.
  function formatDuration(sec: number | null): string {
    if (sec == null) return "—";
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    const mm = String(m).padStart(h ? 2 : 1, "0");
    const ss = String(s).padStart(2, "0");
    return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
  }

  async function handleDrop(files: File[]) {
    if (!files.length) return;
    if (!topicId) {
      toast.warning("Сначала выберите тему для лекции");
      return;
    }
    const file = files[0];
    setCurrentFile(file.name);
    setPct(0);
    setUploading(true);
    try {
      await api.upload(file, file.name.replace(/\.[^.]+$/, ""), Number(topicId), userName, setPct);
      toast.success("Видео загружено, началась обработка");
      refresh();
    } catch (e) {
      toast.error(`Ошибка загрузки: ${e}`);
    } finally {
      setUploading(false);
    }
  }

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: handleDrop,
    accept: { "video/*": [], "video/x-matroska": [".mkv"] },
    maxFiles: 1,
    disabled: uploading || !canUpload,
  });

  return (
    <PageShell
      title="Загрузка лекций"
      actions={
        <Button asChild variant="secondary" size="sm">
          <Link to="/">К тестам →</Link>
        </Button>
      }
    >
      <div className="flex flex-col gap-5">
        <Alert variant="info">
          <AlertTitle>Перед загрузкой</AlertTitle>
          <AlertDescription>
            Лекции принимаются <b>только на русском языке</b>.
          </AlertDescription>
        </Alert>

        {!canUpload && (
          <Card>
            <CardContent className="p-4 text-sm text-muted-foreground">
              У вас нет прав на загрузку лекций.
              {userName ? ` Вы вошли как «${userName}».` : " Войдите под нужным именем."}{" "}
              Если хотите загружать видео — напишите <b>@dftpnd</b>.
            </CardContent>
          </Card>
        )}

        {canUpload && (
          <div className="flex flex-col gap-2">
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <label className="mb-1.5 block text-sm font-medium">Тема</label>
                <Select value={topicId ?? undefined} onValueChange={setTopicId} disabled={uploading}>
                  <SelectTrigger>
                    <SelectValue placeholder="Выберите тему для лекции" />
                  </SelectTrigger>
                  <SelectContent>
                    {topics.map((t) => (
                      <SelectItem key={t.id} value={String(t.id)}>
                        {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button variant="secondary" disabled={uploading} onClick={() => setShowNewTopic((v) => !v)}>
                + Новая тема
              </Button>
            </div>
            {showNewTopic && (
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <label className="mb-1.5 block text-sm font-medium">Название новой темы</label>
                  <Input
                    placeholder="Например: Базы данных"
                    value={newTopicName}
                    onChange={(e) => setNewTopicName(e.currentTarget.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleCreateTopic()}
                  />
                </div>
                <Button onClick={handleCreateTopic} disabled={creatingTopic}>
                  {creatingTopic ? "…" : "Создать"}
                </Button>
              </div>
            )}
          </div>
        )}

        {canUpload && (
          <Tabs value={source} onValueChange={(v) => setSource(v as "file" | "link")}>
            <TabsList>
              <TabsTrigger value="file" disabled={uploading || submittingLink}>
                Загрузить файл
              </TabsTrigger>
              <TabsTrigger value="link" disabled={uploading || submittingLink}>
                Ссылка на YouTube
              </TabsTrigger>
            </TabsList>
          </Tabs>
        )}

        {source === "file" ? (
          <div
            {...getRootProps()}
            className={`flex min-h-32 cursor-pointer items-center justify-center rounded-xl border-2 border-dashed p-6 text-center text-sm transition-colors ${
              isDragActive ? "border-primary bg-accent" : "border-input"
            } ${uploading || !canUpload ? "cursor-not-allowed opacity-60" : "hover:bg-accent/50"}`}
          >
            <input {...getInputProps()} />
            <span className="text-muted-foreground">
              {uploading
                ? `Загрузка «${currentFile}»…`
                : canUpload && !topicId
                  ? "Сначала выберите тему, затем перетащите видео сюда"
                  : "Перетащите видео лекции сюда или кликните для выбора"}
            </span>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <label className="mb-1.5 block text-sm font-medium">Ссылка на YouTube</label>
                <Input
                  placeholder="https://www.youtube.com/watch?v=..."
                  value={youtubeUrl}
                  onChange={(e) => {
                    setYoutubeUrl(e.currentTarget.value);
                    setLinkInfo(null); // url changed → previous preview no longer applies
                  }}
                  onKeyDown={(e) => e.key === "Enter" && handleCheckLink()}
                  disabled={submittingLink || !canUpload}
                />
              </div>
              <Button
                variant="secondary"
                onClick={handleCheckLink}
                disabled={checkingLink || !canUpload || !youtubeUrl.trim()}
              >
                {checkingLink ? "…" : "Проверить"}
              </Button>
            </div>

            {linkInfo && (
              <Card>
                <CardContent className="flex items-start justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <p className="font-semibold">{linkInfo.title || "Без названия"}</p>
                    <p className="text-xs text-muted-foreground">
                      {linkInfo.uploader ? `${linkInfo.uploader} · ` : ""}
                      длительность {formatDuration(linkInfo.duration)}
                    </p>
                    {linkInfo.duration != null && linkInfo.duration < 120 && (
                      <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                        Это короткое видео — точно лекция, а не реклама/превью?
                      </p>
                    )}
                  </div>
                  <Button onClick={handleYoutubeSubmit} disabled={submittingLink || !topicId}>
                    {submittingLink ? "…" : "Добавить"}
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {uploading && (
          <Card>
            <CardContent className="p-4">
              <p className="mb-2 text-sm">
                Загрузка «{currentFile}» — {pct}%
              </p>
              <Progress value={pct} />
              <p className="mt-2 text-xs text-muted-foreground">
                Не закрывайте вкладку до завершения загрузки
              </p>
            </CardContent>
          </Card>
        )}

        <h2 className="text-lg font-semibold">Загруженные лекции</h2>
        {lectures.length === 0 && <p className="text-sm text-muted-foreground">Пока ничего не загружено</p>}
        {lectures.map((lec) => (
          <Card key={lec.id}>
            <CardContent className="flex items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <p className="truncate font-semibold">{lec.title}</p>
                <p className="text-xs text-muted-foreground">{topicName.get(lec.topic_id) ?? "Без темы"}</p>
              </div>
              <Badge variant={statusVariant(lec.status)}>{lec.status}</Badge>
            </CardContent>
          </Card>
        ))}
      </div>
    </PageShell>
  );
}
