"use client";

import { useState, useSyncExternalStore } from "react";
import { MoonIcon, SunIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { EMPTY_INBOX, type Inbox } from "@/lib/inbox";
import { NotificationBell } from "./notification-bell";
import { UserAvatar, UserMenuItems, type DashboardUser } from "./user-menu";

export type Theme = "light" | "dark" | "system";

/** Persist the choice for SSR (so the first paint matches) and apply it now. */
function applyTheme(theme: Theme) {
  document.cookie = `flare-theme=${theme}; path=/; max-age=31536000; samesite=lax`;
  const root = document.documentElement;
  root.classList.remove("light", "dark");
  if (theme !== "system") root.classList.add(theme);
}

const DARK_QUERY = "(prefers-color-scheme: dark)";

function watchSystemTheme(onChange: () => void) {
  const query = window.matchMedia(DARK_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/**
 * Whether the device prefers dark. The server can't know, so it and the first render in
 * the browser both say no, and the real answer follows straight after: reading it during
 * that first render would give the browser a different page from the one the server sent.
 */
function useSystemDark() {
  return useSyncExternalStore(
    watchSystemTheme,
    () => window.matchMedia(DARK_QUERY).matches,
    () => false,
  );
}

export function DashboardHeader({ user, initialTheme, inbox = EMPTY_INBOX }: { user: DashboardUser; initialTheme: Theme; inbox?: Inbox }) {
  const [theme, setTheme] = useState<Theme>(initialTheme);
  const systemDark = useSystemDark();
  const dark = theme === "dark" || (theme === "system" && systemDark);

  return (
    <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b bg-background px-4">
      <SidebarTrigger />
      <Separator orientation="vertical" className="mr-1 h-4" />

      <div className="ml-auto flex items-center gap-1">
        <NotificationBell initial={inbox} />

        <Button
          variant="ghost"
          size="icon"
          aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
          onClick={() => {
            const next: Theme = dark ? "light" : "dark";
            setTheme(next);
            applyTheme(next);
          }}
        >
          {dark ? <SunIcon /> : <MoonIcon />}
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Account" className="rounded-full">
              <UserAvatar user={user} className="size-7" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-60">
            <UserMenuItems user={user} />
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
