import { EMPTY_INBOX, type Inbox } from "./inbox";
import { laravel } from "./laravel";

/** The signed-in person's bell (see lib/inbox.ts). Empty when the API can't be reached, or is from before there was one. */
export async function loadInbox(): Promise<Inbox> {
  try {
    const response = await laravel("_nevela/notifications");
    return response.ok ? (response.body as Inbox) : EMPTY_INBOX;
  } catch {
    return EMPTY_INBOX;
  }
}
