import { AppShell, Group, Title } from "@mantine/core";
import type { ReactNode } from "react";

/**
 * Shared app layout: a top bar that grows taller on phones so the menu row
 * never overlaps the page content, plus a distinct header background.
 * Page content is passed as children (each page keeps its own Container).
 */
export function PageShell({
  title,
  actions,
  children,
}: {
  title: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <AppShell header={{ height: { base: 96, sm: 56 } }} padding="md">
      {/* Background comes from a color-scheme-aware CSS rule in index.html
          (works on older Safari, unlike the light-dark() function). */}
      <AppShell.Header>
        <Group h="100%" px="md" py="xs" gap="xs" justify="space-between" align="center">
          <Title order={4}>{title}</Title>
          {actions && (
            <Group gap="xs" wrap="wrap" justify="flex-end">
              {actions}
            </Group>
          )}
        </Group>
      </AppShell.Header>

      <AppShell.Main>{children}</AppShell.Main>
    </AppShell>
  );
}
