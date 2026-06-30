import { useState } from "react";
import {
  AppShell,
  Badge,
  Button,
  Card,
  Container,
  Group,
  Progress,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { Dropzone, MIME_TYPES } from "@mantine/dropzone";
import { notifications } from "@mantine/notifications";
import { Link } from "react-router-dom";
import { api } from "./api";
import { useLectures } from "./useLectures";

const statusColor = (s: string) => (s === "done" ? "green" : s === "failed" ? "red" : "yellow");

// Mirrors the backend allowlist (upload_allowed_users); the backend is the real gate.
const UPLOAD_ALLOWED = ["dft", "li"];

export function UploadPage() {
  const { lectures, refresh } = useLectures();
  const [uploading, setUploading] = useState(false);
  const [pct, setPct] = useState(0);
  const [currentFile, setCurrentFile] = useState("");

  const userName = localStorage.getItem("user") ?? "";
  const canUpload = UPLOAD_ALLOWED.includes(userName.trim());

  async function handleDrop(files: File[]) {
    const file = files[0];
    setCurrentFile(file.name);
    setPct(0);
    setUploading(true);
    try {
      await api.upload(file, file.name.replace(/\.[^.]+$/, ""), userName, setPct);
      notifications.show({ message: "Видео загружено, началась обработка", color: "green" });
      refresh();
    } catch (e) {
      notifications.show({ message: `Ошибка загрузки: ${e}`, color: "red" });
    } finally {
      setUploading(false);
    }
  }

  return (
    <AppShell header={{ height: 56 }} padding="md">
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <Title order={4}>Загрузка лекций</Title>
          <Button component={Link} to="/" variant="light">
            К тестам →
          </Button>
        </Group>
      </AppShell.Header>

      <AppShell.Main>
        <Container size="md">
          <Stack gap="lg">
            {!canUpload && (
              <Card withBorder>
                <Text c="dimmed">
                  Загружать лекции могут только пользователи <b>dft</b> и <b>li</b>.
                  {userName ? ` Вы вошли как «${userName}».` : " Войдите под нужным именем."}
                </Text>
              </Card>
            )}
            <Dropzone
              onDrop={handleDrop}
              accept={[MIME_TYPES.mp4, "video/x-matroska", "video/*"]}
              maxFiles={1}
              loading={uploading}
              disabled={uploading || !canUpload}
            >
              <Text ta="center" py="xl">
                Перетащите видео лекции сюда или кликните для выбора
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
                  <Text fw={600}>{lec.title}</Text>
                  <Badge color={statusColor(lec.status)}>{lec.status}</Badge>
                </Group>
              </Card>
            ))}
          </Stack>
        </Container>
      </AppShell.Main>
    </AppShell>
  );
}
