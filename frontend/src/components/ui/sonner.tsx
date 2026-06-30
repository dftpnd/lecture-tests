import { Toaster as Sonner, type ToasterProps } from "sonner";

/**
 * App-wide toast host (replaces @mantine/notifications). theme="system" follows
 * the OS colour scheme to match the rest of the app.
 */
function Toaster(props: ToasterProps) {
  return (
    <Sonner
      theme="system"
      position="top-center"
      toastOptions={{
        classNames: {
          toast:
            "group rounded-lg border bg-card text-card-foreground shadow-lg p-3 text-sm flex gap-2 items-center w-full",
          description: "text-muted-foreground",
        },
      }}
      style={
        {
          "--normal-bg": "var(--card)",
          "--normal-text": "var(--card-foreground)",
          "--normal-border": "var(--border)",
        } as React.CSSProperties
      }
      {...props}
    />
  );
}

export { Toaster };
