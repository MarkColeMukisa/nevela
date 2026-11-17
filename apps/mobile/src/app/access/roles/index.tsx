import { router, useFocusEffect } from "expo-router";
import { useCallback, useRef } from "react";
import { RefreshControl } from "react-native";

import { Body, Button, Card, Loading, Notice, Row, Screen } from "@/components/ui";
import { api, messageOf } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { can, type RoleRow } from "@/lib/access";
import { useLoaded } from "@/lib/use-loaded";

const load = () => api.get<{ data: RoleRow[] }>("/_nevela/roles");

/** The roles: named sets of permissions, and how many people hold each. */
export default function Roles() {
  const { user } = useAuth();
  const roles = useLoaded(load);

  // Looked at again when the screen is come back to: a role was made or changed there.
  const first = useRef(true);
  const { reload } = roles;
  useFocusEffect(
    useCallback(() => {
      if (first.current) {
        first.current = false;
        return;
      }
      reload();
    }, [reload]),
  );

  if (!can(user, "roles.view")) return <Screen edges={["bottom"]}><Body muted>You don't have access to roles and permissions.</Body></Screen>;
  if (roles.loading) return <Loading />;
  const rows = roles.data?.data ?? [];

  return (
    <Screen edges={["bottom"]} refreshControl={<RefreshControl refreshing={roles.refreshing} onRefresh={roles.refresh} />}>
      {roles.error ? <Notice>{messageOf(roles.error)}</Notice> : null}
      {can(user, "roles.create") ? <Button label="Make a role" icon="add-circle-outline" onPress={() => router.push("/access/roles/new")} /> : null}
      <Card>
        {rows.map((role, index) => (
          <Row
            key={role.id}
            icon={role.isAdmin ? "shield-checkmark-outline" : "shield-outline"}
            label={role.name}
            detail={`${role.isAdmin ? "Everything" : `${role.permissions.length} permissions`} · ${role.users === 1 ? "1 person" : `${role.users} people`}${role.isSystem ? " · built in" : ""}`}
            onPress={() => router.push({ pathname: "/access/roles/[id]", params: { id: role.id } })}
            last={index === rows.length - 1}
          />
        ))}
      </Card>
      <Body muted small>A role is what a person may do. Give it to people on the Users screen.</Body>
    </Screen>
  );
}
