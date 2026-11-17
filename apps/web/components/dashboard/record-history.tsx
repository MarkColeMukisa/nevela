import { optionLabel, type Resource } from "@flaredev/core";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { laravel } from "@/lib/laravel";
import { LocalTime } from "./local-time";

/** One step in a record's history, as Laravel keeps it (GET _nevela/history/{slug}/{id}). */
interface Step {
  id: string;
  action: string;
  label: string;
  user: { id: string; name: string | null } | null;
  changes: Record<string, { from: unknown; to: unknown }>;
  input: Record<string, unknown>;
  at: string | null;
}

/** A value as the page reads it: an option by its label. */
function shown(resource: Resource, field: string, value: unknown): string {
  const def = resource.fields[field];
  if (value === null || value === undefined || value === "") return "—";
  if (def && (def.kind === "enum" || def.kind === "multiselect")) return optionLabel(def, String(value));
  return String(value);
}

/**
 * What has been done to a record through its actions, oldest first: who did it, when, and
 * what it changed. "Accept, by Mercy Auma: Status Pending → Accepted". The person the record
 * belongs to reads the same steps on their phone.
 */
export async function RecordHistory({ resource, id }: { resource: Resource; id: string }) {
  const response = await laravel(`_nevela/history/${resource.slug}/${encodeURIComponent(id)}`);
  // Before its migration, or for a record they can't see: there is nothing to tell.
  if (!response.ok) return null;
  const steps = ((response.body as { data?: Step[] }).data ?? []) as Step[];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">History</CardTitle>
        <CardDescription>{steps.length === 0 ? "Nothing done to it yet." : "What has been done to it, and by whom."}</CardDescription>
      </CardHeader>
      {steps.length > 0 && (
        <CardContent>
          <ol className="flex flex-col gap-3">
            {steps.map((step) => (
              <li key={step.id} className="border-l-2 border-primary/40 pl-3 text-sm">
                <p className="font-medium">
                  {step.label}
                  <span className="font-normal text-muted-foreground">, by {step.user?.name ?? "someone"}</span>
                </p>
                {Object.entries(step.changes).map(([field, change]) => (
                  <p key={field} className="text-muted-foreground">
                    {resource.fields[field]?.label ?? field}: {shown(resource, field, change.from)} → {shown(resource, field, change.to)}
                  </p>
                ))}
                {Object.entries(step.input).map(([field, value]) =>
                  typeof value === "string" && value.trim() !== "" ? (
                    <p key={field} className="whitespace-pre-line">
                      {value}
                    </p>
                  ) : null,
                )}
                {step.at && (
                  <p className="text-xs text-muted-foreground">
                    <LocalTime value={step.at} />
                  </p>
                )}
              </li>
            ))}
          </ol>
        </CardContent>
      )}
    </Card>
  );
}
