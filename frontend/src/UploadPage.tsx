import {
  AppShell,
  Badge,
  Button,
  Card,
  Container,
  Group,
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

  async function handleDrop(files: File[]) {
    const file = files[0];
    notifications.show({ message: `Загружаю «${file.name}»…`, color: "blue" });
    try {
      await api.upload(file, file.name.replace(/\.[^.]+$/, ""));
      notifications.show({ message: "Видео загружено, идёт обработка", color: "green" });
      refresh();
    } catch (e) {
      notifications.show({ message: `Ошибка загрузки: ${e}`, color: "red" });
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
            >
              <Text ta="center" py="xl">
                Перетащите видео лекции сюда или кликните для выбора
              </Text>
            </Dropzone>

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
