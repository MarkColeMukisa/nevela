import { Text, View } from "react-native";

import { Body, Card, Heading } from "@/components/ui";
import { fieldLabel, optionLabel, type Resource } from "@/lib/resources";
import { spacing, text, useColors } from "@/lib/theme";
import { ago } from "@/lib/when";

/** One step in a record's history, as Laravel keeps it (GET _nevela/history/{slug}/{id}). */
export interface Step {
  id: string;
  action: string;
  label: string;
  user: { id: string; name: string | null } | null;
  changes: Record<string, { from: unknown; to: unknown }>;
  input: Record<string, unknown>;
  at: string | null;
}

/** A value as a person reads it: an option by its label. */
function shown(resource: Resource, name: string, value: unknown): string {
  const field = resource.fields[name];
  if (value === null || value === undefined || value === "") return "nothing";
  return field?.kind === "enum" ? optionLabel(field, String(value)) : String(value);
}

/**
 * What has been done to a record, oldest first, and by whom: "Accepted by Mercy Auma, 5
 * minutes ago". The customer an order belongs to reads it, so nothing that happens to their
 * order happens out of their sight.
 */
export function RecordHistory({ resource, steps, you }: { resource: Resource; steps: Step[]; you: string | null }) {
  const colors = useColors();
  if (steps.length === 0) return null;

  return (
    <View style={{ gap: spacing.sm }}>
      <Heading>History</Heading>
      <Card>
        <View style={{ padding: spacing.lg, gap: spacing.md }}>
          {steps.map((step) => {
            const who = step.user ? (step.user.id === you ? "you" : step.user.name ?? "someone") : "someone";
            const said = Object.values(step.input).filter((value): value is string => typeof value === "string" && value.trim() !== "");
            return (
              <View key={step.id} accessible style={{ borderLeftWidth: 2, borderLeftColor: colors.accent, paddingLeft: spacing.md, gap: 2 }}>
                <Text style={{ color: colors.text, fontSize: text.body, fontWeight: "600" }}>
                  {step.label}
                  <Text style={{ color: colors.muted, fontWeight: "400" }}>, by {who}</Text>
                </Text>
                {Object.entries(step.changes).map(([name, change]) => (
                  <Body key={name} muted small>
                    {resource.fields[name] ? fieldLabel(name, resource.fields[name]) : name}: {shown(resource, name, change.from)} → {shown(resource, name, change.to)}
                  </Body>
                ))}
                {said.map((value, index) => (
                  <Body key={index} small>
                    “{value}”
                  </Body>
                ))}
                {step.at ? <Body muted small>{ago(step.at)}</Body> : null}
              </View>
            );
          })}
        </View>
      </Card>
    </View>
  );
}
