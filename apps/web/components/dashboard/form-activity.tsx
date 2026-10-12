import type { Resource } from "@flaredev/core";
import { ShieldCheckIcon } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { formOf } from "@/lib/extras";
import { laravel } from "@/lib/laravel";

/** GET _nevela/forms/<slug>: what a resource's public form checks and has turned away. */
interface FormReport {
  robotCheck: "on" | "off" | "skipped" | "refusing";
  blocked: { total: number; days: number; reasons: { reason: string; label: string; count: number }[] };
}

/**
 * What a resource's public form turned away this week, above its table: "Blocked this
 * week: 132 (118 robot check, 14 throwaway address)". Without it a form that is well
 * protected and a form nobody uses look the same from in here.
 *
 * Shown for a resource whose descriptor has "protect", and says so plainly when the
 * robot check it asks for isn't being made.
 */
export async function FormActivity({ resource }: { resource: Resource }) {
  if (!formOf(resource.name)?.protect) return null;
  const response = await laravel(`_nevela/forms/${resource.slug}`);
  if (!response.ok) return null;
  const { robotCheck, blocked } = response.body as FormReport;

  return (
    <div className="flex flex-col gap-2">
      {robotCheck === "refusing" && (
        <Alert variant="destructive">
          <AlertDescription>
            The public form is refusing everyone: it asks for the robot check, and TURNSTILE_SECRET_KEY isn&apos;t set in the API. Set it, or take
            &quot;turnstile&quot; out of the descriptor.
          </AlertDescription>
        </Alert>
      )}
      {robotCheck === "skipped" && (
        <Alert>
          <AlertDescription>
            The robot check is skipped while TURNSTILE_SECRET_KEY isn&apos;t set. That is fine in development. Set it before the site goes live.
          </AlertDescription>
        </Alert>
      )}
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <ShieldCheckIcon className="size-4 shrink-0" aria-hidden="true" />
        <span>
          Blocked this week: <span className="font-medium text-foreground tabular-nums">{blocked.total === 0 ? "none" : blocked.total.toLocaleString()}</span>
          {blocked.total > 0 && ` (${blocked.reasons.map((row) => `${row.count.toLocaleString()} ${row.label}`).join(", ")})`}
        </span>
      </p>
    </div>
  );
}
