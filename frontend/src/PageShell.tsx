import type { ReactNode } from "react";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import { ServerStatus } from "./offline/ServerStatus";

/**
 * Shared app layout: a sticky top bar of fixed height with the page title and
 * action buttons. On phones the actions collapse into a slide-in menu (so the
 * bar never grows tall or overlaps content); page content flows naturally below
 * the sticky header. Each page passes its own content as children.
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
    <div className="min-h-[100dvh] bg-background">
      <header className="sticky top-0 z-40 border-b bg-background/95 pt-[env(safe-area-inset-top)] backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between gap-2 px-4 [padding-left:max(1rem,env(safe-area-inset-left))] [padding-right:max(1rem,env(safe-area-inset-right))]">
          <h1 className="min-w-0 truncate text-base font-semibold sm:text-lg">{title}</h1>

          <div className="flex shrink-0 items-center gap-2">
            {/* Connection indicator: always visible on every page (and on phones,
                where the actions collapse into the menu). */}
            <ServerStatus />

            {actions && (
              <>
                {/* Desktop: actions inline in the bar. */}
                <div className="hidden items-center gap-2 sm:flex">{actions}</div>

                {/* Mobile: actions tucked into a slide-in menu. */}
                <Sheet>
                  <SheetTrigger asChild>
                    <Button variant="ghost" size="icon" className="sm:hidden" aria-label="Меню">
                      <Menu className="text-brand-accent" />
                    </Button>
                  </SheetTrigger>
                  <SheetContent>
                    <SheetTitle>Меню</SheetTitle>
                    <div className="mt-4 flex flex-col items-stretch gap-2 [&_a]:w-full [&_button]:w-full">
                      {actions}
                    </div>
                  </SheetContent>
                </Sheet>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-6 [padding-left:max(1rem,env(safe-area-inset-left))] [padding-right:max(1rem,env(safe-area-inset-right))]">
        {children}
      </main>
    </div>
  );
}
