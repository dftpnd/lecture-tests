import { useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Card,
  Container,
  Group,
  Progress,
  SegmentedControl,
  Select,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { Dropzone, MIME_TYPES } from "@mantine/dropzone";
import { notifications } from "@mantine/notifications";
import { Link } from "react-router-dom";
import { api } from "./api";
import { useLectures } from "./useLectures";
import { useTopics } from "./useTopics";
import { PageShell } from "./PageShell";

const statusColor = (s: string) => (s === "done" ? "green" : s === "failed" ? "red" : "yellow");

// Mirrors the backend allowlist (upload_allowed_users); the backend is the real gate.
const UPLOAD_ALLOWED = ["dft", "li", "Гоша"];

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
  const canUpload = UPLOAD_ALLOWED.includes(userName.trim());
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
      notifications.show({ message: `Не удалось создать тему: ${e}`, color: "red" });
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
      notifications.show({ message: `Не удалось прочитать ссылку: ${e}`, color: "red" });
    } finally {
      setCheckingLink(false);
    }
  }

  async function handleYoutubeSubmit() {
    if (!topicId) {
      notifications.show({ message: "Сначала выберите тему для лекции", color: "yellow" });
      return;
    }
    const url = youtubeUrl.trim();
    if (!url) return;
    setSubmittingLink(true);
    try {
      await api.uploadYoutube(url, Number(topicId), userName);
      notifications.show({ message: "Ссылка принята, видео скачивается", color: "green" });
      setYoutubeUrl("");
      setLinkInfo(null);
      refresh();
    } catch (e) {
      notifications.show({ message: `Не удалось добавить ссылку: ${e}`, color: "red" });
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
    if (!topicId) {
      notifications.show({ message: "Сначала выберите тему для лекции", color: "yellow" });
      return;
    }
    const file = files[0];
    setCurrentFile(file.name);
    setPct(0);
    setUploading(true);
    try {
      await api.upload(file, file.name.replace(/\.[^.]+$/, ""), Number(topicId), userName, setPct);
      notifications.show({ message: "Видео загружено, началась обработка", color: "green" });
      refresh();
    } catch (e) {
      notifications.show({ message: `Ошибка загрузки: ${e}`, color: "red" });
    } finally {
      setUploading(false);
    }
  }

  return (
    <PageShell
      title="Загрузка лекций"
      actions={
        <Button component={Link} to="/" variant="light" size="xs">
          К тестам →
        </Button>
      }
    >
      <Container size="md" pt={26}>
        <Stack gap="lg">
            <Alert color="blue" title="Перед загрузкой">
              Лекции принимаются <b>только на русском языке</b>.
            </Alert>

            {!canUpload && (
              <Card withBorder>
                <Text c="dimmed">
                  У вас нет прав на загрузку лекций.
                  {userName ? ` Вы вошли как «${userName}».` : " Войдите под нужным именем."}{" "}
                  Если хотите загружать видео — напишите <b>@dftpnd</b>.
                </Text>
              </Card>
            )}

            {canUpload && (
              <Stack gap="xs">
                <Group align="flex-end" gap="sm">
                  <Select
                    label="Тема"
                    placeholder="Выберите тему для лекции"
                    data={topics.map((t) => ({ value: String(t.id), label: t.name }))}
                    value={topicId}
                    onChange={setTopicId}
                    searchable
                    disabled={uploading}
                    style={{ flex: 1 }}
                  />
                  <Button
                    variant="light"
                    disabled={uploading}
                    onClick={() => setShowNewTopic((v) => !v)}
                  >
                    + Новая тема
                  </Button>
                </Group>
                {showNewTopic && (
                  <Group align="flex-end" gap="sm">
                    <TextInput
                      label="Название новой темы"
                      placeholder="Например: Базы данных"
                      value={newTopicName}
                      onChange={(e) => setNewTopicName(e.currentTarget.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleCreateTopic()}
                      style={{ flex: 1 }}
                    />
                    <Button onClick={handleCreateTopic} loading={creatingTopic}>
                      Создать
                    </Button>
                  </Group>
                )}
              </Stack>
            )}

            {canUpload && (
              <SegmentedControl
                value={source}
                onChange={(v) => setSource(v as "file" | "link")}
                disabled={uploading || submittingLink}
                data={[
                  { label: "Загрузить файл", value: "file" },
                  { label: "Ссылка на YouTube", value: "link" },
                ]}
              />
            )}

            {source === "file" ? (
              <Dropzone
                onDrop={handleDrop}
                accept={[MIME_TYPES.mp4, "video/x-matroska", "video/*"]}
                maxFiles={1}
                loading={uploading}
                disabled={uploading || !canUpload}
              >
                <Text ta="center" py="xl">
                  {canUpload && !topicId
                    ? "Сначала выберите тему, затем перетащите видео сюда"
                    : "Перетащите видео лекции сюда или кликните для выбора"}
                </Text>
              </Dropzone>
            ) : (
              <Stack gap="sm">
                <Group align="flex-end" gap="sm">
                  <TextInput
                    label="Ссылка на YouTube"
                    placeholder="https://www.youtube.com/watch?v=..."
                    value={youtubeUrl}
                    onChange={(e) => {
                      setYoutubeUrl(e.currentTarget.value);
                      setLinkInfo(null); // url changed → previous preview no longer applies
                    }}
                    onKeyDown={(e) => e.key === "Enter" && handleCheckLink()}
                    disabled={submittingLink || !canUpload}
                    style={{ flex: 1 }}
                  />
                  <Button
                    variant="light"
                    onClick={handleCheckLink}
                    loading={checkingLink}
                    disabled={!canUpload || !youtubeUrl.trim()}
                  >
                    Проверить
                  </Button>
                </Group>

                {linkInfo && (
                  <Card withBorder>
                    <Group justify="space-between" align="flex-start" wrap="nowrap">
                      <div>
                        <Text fw={600}>{linkInfo.title || "Без названия"}</Text>
                        <Text size="xs" c="dimmed">
                          {linkInfo.uploader ? `${linkInfo.uploader} · ` : ""}
                          длительность {formatDuration(linkInfo.duration)}
                        </Text>
                        {linkInfo.duration != null && linkInfo.duration < 120 && (
                          <Text size="xs" c="orange" mt={4}>
                            Это короткое видео — точно лекция, а не реклама/превью?
                          </Text>
                        )}
                      </div>
                      <Button
                        onClick={handleYoutubeSubmit}
                        loading={submittingLink}
                        disabled={!topicId}
                      >
                        Добавить
                      </Button>
                    </Group>
                  </Card>
                )}
              </Stack>
            )}

            {uploading && (
              <Card withBorder>
                <Text size="sm" mb="xs">
                  Загрузка «{currentFile}» — {pct}%
                </Text>
                <Progress value={pct} animated />
                <Text size="xs" c="dimmed" mt="xs">
                  Не закрывайте вкладку до завершения загрузки
                </Text>
              </Card>
            )}

            <Title order={3}>Загруженные лекции</Title>
            {lectures.length === 0 && <Text c="dimmed">Пока ничего не загружено</Text>}
            {lectures.map((lec) => (
              <Card key={lec.id} withBorder>
                <Group justify="space-between">
                  <div>
                    <Text fw={600}>{lec.title}</Text>
                    <Text size="xs" c="dimmed">
                      {topicName.get(lec.topic_id) ?? "Без темы"}
                    </Text>
                  </div>
                  <Badge color={statusColor(lec.status)}>{lec.status}</Badge>
                </Group>
              </Card>
            ))}
        </Stack>
      </Container>
    </PageShell>
  );
}
