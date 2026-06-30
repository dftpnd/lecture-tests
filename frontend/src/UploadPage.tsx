import { useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Card,
  Container,
  Group,
  Progress,
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
