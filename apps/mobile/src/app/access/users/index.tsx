import { router, useFocusEffect } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { RefreshControl, Text, View } from "react-native";

import { Body, Button, Card, Field, Loading, Notice, Row, Screen } from "@/components/ui";
import { api, messageOf } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { can, rolesLine, type AccessUser } from "@/lib/access";
import { spacing, text, useColors } from "@/lib/theme";
import { useLoaded } from "@/lib/use-loaded";

interface Page {
  data: AccessUser[];
  meta: { page: number; totalPages: number; total: number };
}

/** The people who can sign in: who they are, what role they hold, and whether they are switched on. */
export default function Users() {
  const { user } = useAuth();
  const colors = useColors();
  const [search, setSearch] = useState("");
  const [asked, setAsked] = useState("");
  const [more, setMore] = useState<AccessUser[]>([]);
  const [page, setPage] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  const [problem, setProblem] = useState<unknown>(null);

  const load = useCallback(() => api.get<Page>("/_nevela/users", { q: asked || undefined, perPage: 25 }), [asked]);
  const people = useLoaded(load);

  // Looked at again when the screen is come back to: someone was added or switched off there.
  const first = useRef(true);
  const { reload } = people;
  useFocusEffect(
    useCallback(() => {
      if (first.current) {
        first.current = false;
        return;
      }
      setMore([]);
      setPage(1);
      reload();
    }, [reload]),
  );

  if (!can(user, "users.view")) return <Screen edges={["bottom"]}><Body muted>You don't have access to the people of this app.</Body></Screen>;
  if (people.loading) return <Loading />;

  const first25 = people.data?.data ?? [];
  const rows = [...first25, ...more];
  const total = people.data?.meta.total ?? 0;

  const showMore = async () => {
    setLoadingMore(true);
    setProblem(null);
    try {
      const next = await api.get<Page>("/_nevela/users", { q: asked || undefined, perPage: 25, page: page + 1 });
      setMore((current) => [...current, ...next.data]);
      setPage(page + 1);
    } catch (caught) {
      setProblem(caught);
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <Screen edges={["bottom"]} refreshControl={<RefreshControl refreshing={people.refreshing} onRefresh={() => { setMore([]); setPage(1); people.refresh(); }} />}>
      {people.error || problem ? <Notice>{messageOf(people.error ?? problem)}</Notice> : null}

      <Field label="Search" placeholder="Name or email" value={search} onChangeText={setSearch} onSubmitEditing={() => { setMore([]); setPage(1); setAsked(search.trim()); }} returnKeyType="search" autoCapitalize="none" />
      {can(user, "users.create") ? <Button label="Add a person" icon="person-add-outline" onPress={() => router.push("/access/users/new")} /> : null}

      {rows.length === 0 ? (
        <Body muted>{asked ? "Nobody matches that." : "No one yet."}</Body>
      ) : (
        <Card>
          {rows.map((person, index) => (
            <Row
              key={person.id}
              icon={person.active ? "person-outline" : "person-remove-outline"}
              label={`${person.name ?? person.email ?? "No name"}${person.isSelf ? " (you)" : ""}`}
              detail={`${person.email ?? ""} · ${rolesLine(person)}${person.active ? "" : " · switched off"}`}
              onPress={() => router.push({ pathname: "/access/users/[id]", params: { id: person.id } })}
              last={index === rows.length - 1}
            />
          ))}
        </Card>
      )}
      <View style={{ gap: spacing.xs }}>
        <Text style={{ color: colors.muted, fontSize: text.small }}>{rows.length} of {total}</Text>
      </View>
      {rows.length < total ? <Button variant="secondary" label="Show more" busy={loadingMore} onPress={showMore} /> : null}
    </Screen>
  );
}
