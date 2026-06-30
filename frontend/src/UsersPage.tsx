import { useEffect, useState } from "react";
import {
  AppShell,
  Button,
  Container,
  Group,
  Progress,
  Stack,
  Table,
  Text,
  Title,
} from "@mantine/core";
import { Link } from "react-router-dom";
import { api, type UserProgressSummary } from "./api";

export function UsersPage() {
  const [users, setUsers] = useState<UserProgressSummary[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    api
      .users()
      .then(setUsers)
      .catch(() => setUsers([]))
      .finally(() => setLoaded(true));
  }, []);

  return (
    <AppShell header={{ height: 56 }} padding="md">
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <Title order={4}>Пользователи и прогресс</Title>
          <Button component={Link} to="/" variant="light">
            К тестам →
          </Button>
        </Group>
      </AppShell.Header>

      <AppShell.Main>
        <Container size="md">
          <Stack gap="lg">
            <Title order={3}>Рейтинг по среднему освоению</Title>
            {loaded && users.length === 0 && <Text c="dimmed">Пользователей пока нет</Text>}
            {users.length > 0 && (
              <Table highlightOnHover>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th w={40}>#</Table.Th>
                    <Table.Th>Имя</Table.Th>
                    <Table.Th w={220}>Среднее освоение</Table.Th>
                    <Table.Th w={100}>Лекций</Table.Th>
                    <Table.Th w={100}>Попыток</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {users.map((u, i) => (
                    <Table.Tr key={u.name}>
                      <Table.Td>{i + 1}</Table.Td>
                      <Table.Td>
                        <Text fw={600}>{u.name}</Text>
                      </Table.Td>
                      <Table.Td>
                        <Group gap="xs" wrap="nowrap">
                          <Progress value={u.avg_mastery_pct} style={{ flex: 1 }} />
                          <Text size="xs" c="dimmed" w={42} ta="right">
                            {u.avg_mastery_pct}%
                          </Text>
                        </Group>
                      </Table.Td>
                      <Table.Td>{u.lectures_started}</Table.Td>
                      <Table.Td>{u.attempts}</Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            )}
          </Stack>
        </Container>
      </AppShell.Main>
    </AppShell>
  );
}
