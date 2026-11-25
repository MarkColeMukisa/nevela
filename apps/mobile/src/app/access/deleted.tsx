import { useCallback, useState } from "react";
import { RefreshControl, View } from "react-native";

import { Body, Button, Card, Field, Heading, Loading, Notice, Row, Screen } from "@/components/ui";
import { api, ApiError, messageOf } from "@/lib/api";
import { can, closedByLine, rolesLine, type BlockedEmail, type DeletedAccount } from "@/lib/access";
import { useAuth } from "@/lib/auth";
import { spacing } from "@/lib/theme";
import { useLoaded } from "@/lib/use-loaded";
import { ago } from "@/lib/when";

interface Page {
  data: DeletedAccount[];
  meta: { page: number; perPage: number; total: number; totalPages: number };
  /** How many emails are blocked with no account left behind them. */
  blocked: number;
}

/** "migrate" when the app has upgraded and not yet run the migration that keeps closed accounts. */
type Loaded = { page: Page; blocked: BlockedEmail[] } | "migrate";

/**
 * Accounts that were closed, by their owners or by someone deleting them from People, as the
 * dashboard's Deleted accounts page has them: restored as they were, or removed for good.
 * Below them, the emails whose accounts were removed for good, which can't sign up again.
 */
export default function DeletedAccounts() {
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [asked, setAsked] = useState("");
  const [page, setPage] = useState(1);
  const [said, setSaid] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [asking, setAsking] = useState<string | null>(null);
  const [working, setWorking] = useState<string | null>(null);

  const load = useCallback(async (): Promise<Loaded> => {
    try {
      const found = await api.get<Page>("/_nevela/deleted-accounts", { q: asked || undefined, page, perPage: 25 });
      const blocked = found.blocked > 0 ? (await api.get<{ data: BlockedEmail[] }>("/_nevela/blocked-emails", { perPage: 100 })).data : [];
      return { page: found, blocked };
    } catch (caught) {
      if (caught instanceof ApiError && (caught.status === 409 || caught.status === 404)) return "migrate";
      throw caught;
    }
  }, [asked, page]);
  const loaded = useLoaded(load);
  const { reload } = loaded;

  const act = async (key: string, run: () => Promise<unknown>, done: string) => {
    setWorking(key);
    setError(null);
    setSaid(null);
    try {
      await run();
      setAsking(null);
      setSaid(done);
      await reload();
    } catch (caught) {
      setError(caught);
    } finally {
      setWorking(null);
    }
  };

  if (!can(user, "users.delete")) return <Screen edges={["bottom"]}><Body muted>You don't have access to deleted accounts.</Body></Screen>;
  if (loaded.loading) return <Loading />;

  if (loaded.data === "migrate") {
    return (
      <Screen edges={["bottom"]}>
        <Heading>This app doesn't keep deleted accounts yet</Heading>
        <Body muted>Deleting a person still removes them. Run nevela upgrade, then nevela migrate, on the server, and from then on a deleted account is kept here.</Body>
      </Screen>
    );
  }

  const accounts = loaded.data?.page.data ?? [];
  const meta = loaded.data?.page.meta;
  const blocked = loaded.data?.blocked ?? [];
  const shown = error ?? loaded.error;

  return (
    <Screen edges={["bottom"]} refreshControl={<RefreshControl refreshing={loaded.refreshing} onRefresh={() => { setSaid(null); loaded.refresh(); }} />}>
      <Body muted>Accounts that were closed. They can't sign in, and their email can't sign up again. Restore one as it was, or remove it for good.</Body>
      {shown ? <Notice>{messageOf(shown)}</Notice> : null}
      {said ? <Notice tone="success">{said}</Notice> : null}

      {(meta?.total ?? 0) > 0 || asked ? (
        <Field label="Search" placeholder="Name or email" value={search} onChangeText={setSearch} onSubmitEditing={() => { setPage(1); setAsked(search.trim()); }} returnKeyType="search" autoCapitalize="none" />
      ) : null}

      {accounts.length === 0 ? (
        <Body muted>{asked ? "Nobody matches that." : "No deleted accounts. When someone closes their account, or you delete a person, the account waits here."}</Body>
      ) : (
        accounts.map((account) => {
          const who = account.name || account.email || "This account";
          return (
            <Card key={account.id}>
              <Row
                icon="person-remove-outline"
                label={who}
                detail={[account.email, rolesLine(account), account.closedAt ? `Closed ${ago(account.closedAt)} ${closedByLine(account)}`.trim() : null].filter(Boolean).join(" · ")}
                last={asking !== account.id}
                // Only accounts that may do no more than you: the rule People has.
                onPress={account.withinYours && asking !== account.id ? () => setAsking(account.id) : undefined}
              />
              {asking === account.id ? (
                <View style={{ padding: spacing.lg, paddingTop: 0, gap: spacing.sm }}>
                  <Button label="Restore" icon="refresh-outline" busy={working === `restore:${account.id}`} disabled={working !== null} onPress={() => act(`restore:${account.id}`, () => api.post(`/_nevela/deleted-accounts/${encodeURIComponent(account.id)}/restore`), `${who} is back, as they were.`)} />
                  <Body muted small>Removing for good erases the account, its roles and its sign-in methods, and it can't be restored afterwards. {account.email ?? "Its email"} stays blocked from signing up again until you allow it, below.</Body>
                  <Button variant="danger" label="Remove for good" busy={working === `remove:${account.id}`} disabled={working !== null} onPress={() => act(`remove:${account.id}`, () => api.delete(`/_nevela/deleted-accounts/${encodeURIComponent(account.id)}`), `${who} was removed for good.`)} />
                  <Button variant="secondary" label="Cancel" disabled={working !== null} onPress={() => setAsking(null)} />
                </View>
              ) : null}
            </Card>
          );
        })
      )}

      {meta && meta.totalPages > 1 ? (
        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          <View style={{ flex: 1 }}>
            <Button variant="secondary" label="Previous" disabled={meta.page <= 1} onPress={() => setPage(meta.page - 1)} />
          </View>
          <View style={{ flex: 1 }}>
            <Button variant="secondary" label="Next" disabled={meta.page >= meta.totalPages} onPress={() => setPage(meta.page + 1)} />
          </View>
        </View>
      ) : null}
      {meta && meta.total > 0 ? <Body muted small>{meta.total} deleted {meta.total === 1 ? "account" : "accounts"}</Body> : null}

      {blocked.length > 0 ? (
        <View style={{ gap: spacing.sm }}>
          <Heading>Emails that can't sign up</Heading>
          <Body muted small>Their accounts were removed for good. Only a fingerprint of each address is kept: enough to refuse it, not to read it back.</Body>
          <Card>
            {blocked.map((entry, index) => (
              <View key={entry.id}>
                <Row icon="mail-unread-outline" label={entry.hint} detail={`Blocked ${ago(entry.blockedAt)}`} last={index === blocked.length - 1 && asking !== `email:${entry.id}`} onPress={asking === `email:${entry.id}` ? undefined : () => setAsking(`email:${entry.id}`)} />
                {asking === `email:${entry.id}` ? (
                  <View style={{ padding: spacing.lg, paddingTop: 0, gap: spacing.sm }}>
                    <Button label="Allow it to sign up again" busy={working === `email:${entry.id}`} disabled={working !== null} onPress={() => act(`email:${entry.id}`, () => api.delete(`/_nevela/blocked-emails/${encodeURIComponent(entry.id)}`), `${entry.hint} can sign up again.`)} />
                    <Button variant="secondary" label="Cancel" disabled={working !== null} onPress={() => setAsking(null)} />
                  </View>
                ) : null}
              </View>
            ))}
          </Card>
        </View>
      ) : null}
    </Screen>
  );
}
