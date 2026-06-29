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

export function UploadPage() {
  const { lectures, refresh } = useLectures();
  const [uploading, setUploading] = useState(false);
  const [pct, setPct] = useState(0);
  const [currentFile, setCurrentFile] = useState("");

  async function handleDrop(files: File[]) {
    const file = files[0];
    setCurrentFile(file.name);
    setPct(0);
    setUploading(true);
    try {
      await api.upload(file, file.name.replace(/\.[^.]+$/, ""), setPct);
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
            <Dropzone
              onDrop={handleDrop}
              accept={[MIME_TYPES.mp4, "video/x-matroska", "video/*"]}
              maxFiles={1}
              loading={uploading}
              disabled={uploading}
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
