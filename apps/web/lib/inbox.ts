/**
 * The bell in the dashboard's header, as Laravel serves it (`/_nevela/notifications`). Kept
 * apart from lib/notifications.ts, which talks to Laravel and so can't be loaded in the browser.
 *
 * Laravel writes a notification when something happens that someone should know about: a
 * form sent, an account made or closed, a change to how they sign in, a job that failed.
 * Several of a kind that arrive before they are read are one, with a count.
 */
export interface Notification {
  id: string;
  /** What it is about: "form.received", "account.created", or the app's own name. */
  kind: string;
  title: string;
  body: string | null;
  /** Where it is in the dashboard, or null. */
  url: string | null;
  tone: "info" | "warning";
  /** How many of its kind it stands for. */
  count: number;
  read: boolean;
  /** When it last happened, ISO 8601. */
  at: string;
}

/**
 * What is wrong with the app right now: a migration not run, a newer Nevela, a scheduler
 * that isn't running. For administrators only, shown while it is true, and never read.
 */
export interface Condition {
  id: string;
  title: string;
  body: string;
  tone: "info" | "warning";
  url: string | null;
}

export interface Inbox {
  items: Notification[];
  unread: number;
  conditions: Condition[];
}

export const EMPTY_INBOX: Inbox = { items: [], unread: 0, conditions: [] };
