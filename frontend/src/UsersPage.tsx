import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type UserProgressSummary } from "./api";
import { PageShell } from "./PageShell";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";

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
    <PageShell
      title="Пользователи и прогресс"
      actions={
        <Button asChild variant="secondary" size="sm">
          <Link to="/">К тестам →</Link>
        </Button>
      }
    >
      <div className="flex flex-col gap-5">
        <h2 className="text-lg font-semibold">Рейтинг по среднему освоению</h2>
        {loaded && users.length === 0 && (
          <p className="text-sm text-muted-foreground">Пользователей пока нет</p>
        )}
        {users.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">#</TableHead>
                <TableHead>Имя</TableHead>
                <TableHead className="w-[40%] min-w-40">Среднее освоение</TableHead>
                <TableHead className="w-16 text-right">Лекций</TableHead>
                <TableHead className="w-16 text-right">Попыток</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((u, i) => (
                <TableRow key={u.name}>
                  <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                  <TableCell className="font-semibold">{u.name}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Progress className="flex-1" value={u.avg_mastery_pct} />
                      <span className="w-10 text-right text-xs text-muted-foreground">
                        {u.avg_mastery_pct}%
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right">{u.lectures_started}</TableCell>
                  <TableCell className="text-right">{u.attempts}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </PageShell>
  );
}
