"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useId, useMemo, useState } from "react";
import { optionLabel, type ClientResource } from "@flaredev/core";
import { BarChart3Icon, ChevronDownIcon } from "lucide-react";
import { resourceInsightsAction, type InsightsData, type InsightsUnit } from "@/app/dashboard/actions";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

const UNITS: { key: InsightsUnit; label: string; per: string; span: string }[] = [
  { key: "day", label: "Daily", per: "day", span: "the last 30 days" },
  { key: "week", label: "Weekly", per: "week", span: "the last 26 weeks" },
  { key: "month", label: "Monthly", per: "month", span: "the last 12 months" },
];

/** A period as someone would say it: "9 Oct", "the week of 5 Oct", "Oct 2026". */
function periodLabel(unit: InsightsUnit, bucket: string, long = false): string {
  // UTC throughout: a bucket is a calendar day or month, not a moment, and must not slide a day in another timezone.
  const date = new Date(`${unit === "month" ? `${bucket}-01` : bucket}T00:00:00Z`);
  if (unit === "month") return new Intl.DateTimeFormat("en-GB", { month: "short", year: "numeric", timeZone: "UTC" }).format(date);
  const day = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", ...(long ? { year: "numeric" } : {}), timeZone: "UTC" }).format(date);
  return unit === "week" && long ? `the week of ${day}` : day;
}

/**
 * Charts above a list, closed until somebody wants them.
 *
 * Closed is the default on purpose. The panel's numbers are a grouped query each over
 * everything the list matches, which is work an ordinary visit to a list doesn't need.
 * So nothing is asked for until it is opened, and whether it was left open is remembered
 * for the next visit.
 *
 * What it charts is the rows the table is showing: the same search and filters go on the
 * request, so narrowing the list to one category redraws the charts for that category.
 *
 * Drawn with plain elements and no chart library: bars are all these are, and a library
 * for bars would be several hundred kilobytes to draw rectangles.
 */
export function ResourceInsights({ resource, total }: { resource: ClientResource; /** The list's own count: when it changes, so have the charts. */ total: number }) {
  const panel = useId();
  const remembered = `nevela.insights.${resource.name}`;
  const [open, setOpen] = useState(false);
  const [unit, setUnit] = useState<InsightsUnit>("day");
  const [data, setData] = useState<InsightsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Only what narrows the list. A page number or a sort order changes no count.
  const params = useSearchParams();
  const narrowed = useMemo(() => {
    const kept = new URLSearchParams();
    for (const [key, value] of params) if (key === "q" || key.startsWith("filter[")) kept.append(key, value);
    kept.sort();
    return kept.toString();
  }, [params]);

  // Read after the first paint: the server can't know what this browser remembers.
  useEffect(() => {
    try {
      if (window.localStorage.getItem(remembered) === "open") setOpen(true);
    } catch {
      // No storage (a private window, or it is switched off): it just starts closed.
    }
  }, [remembered]);

  function toggle() {
    const next = !open;
    setOpen(next);
    try {
      window.localStorage.setItem(remembered, next ? "open" : "closed");
    } catch {
      // Not remembered, and that is all.
    }
  }

  useEffect(() => {
    if (!open) return;
    let current = true;
    setLoading(true);
    void resourceInsightsAction(resource.name, narrowed, unit).then((result) => {
      if (!current) return;
      setLoading(false);
      if (result.ok) {
        setData(result.data);
        setError(null);
      } else {
        setError(result.error);
      }
    });
    return () => {
      current = false;
    };
  }, [open, unit, narrowed, total, resource.name]);

  const chosen = UNITS.find((entry) => entry.key === unit)!;
  const plural = resource.pluralLabel.toLowerCase();

  return (
    <section className="rounded-xl border bg-card">
      <button type="button" onClick={toggle} aria-expanded={open} aria-controls={panel} className="flex w-full items-center gap-2 rounded-xl px-4 py-3 text-left text-sm font-medium hover:bg-muted/50">
        <BarChart3Icon className="size-4 text-muted-foreground" />
        Insights
        <span className="truncate font-normal text-muted-foreground">{narrowed ? `for the ${plural} this list is showing` : `when ${plural} were created, and how they split`}</span>
        {loading && <Spinner className="ml-1" />}
        <ChevronDownIcon className={cn("ml-auto size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div id={panel} className="border-t p-4">
          {error && !data && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          {!data && !error && <p className="text-sm text-muted-foreground">Counting…</p>}
          {data && (
            <div className={cn("grid gap-x-10 gap-y-8", data.breakdown.length > 0 && "lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]", loading && "opacity-60")}>
              <div className="flex min-w-0 flex-col gap-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm">
                    <span className="font-medium">Created per {chosen.per}</span> <span className="text-muted-foreground">· {chosen.span}</span>
                  </p>
                  <div role="group" aria-label="Period" className="flex rounded-md border p-0.5 text-xs">
                    {UNITS.map((entry) => (
                      <button
                        key={entry.key}
                        type="button"
                        aria-pressed={entry.key === unit}
                        onClick={() => setUnit(entry.key)}
                        className={cn("rounded px-2 py-1", entry.key === unit ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
                      >
                        {entry.label}
                      </button>
                    ))}
                  </div>
                </div>
                <Series unit={data.unit} series={data.series} noun={plural} />
              </div>

              {data.breakdown.length > 0 && (
                <div className="flex min-w-0 flex-col gap-6">
                  {data.breakdown.map((group) => (
                    <Breakdown key={group.field} resource={resource} group={group} />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function Series({ unit, series, noun }: { unit: InsightsUnit; series: InsightsData["series"]; noun: string }) {
  const most = Math.max(0, ...series.map((point) => point.count));
  const sum = series.reduce((all, point) => all + point.count, 0);
  const peak = series.find((point) => point.count === most);
  const middle = series[Math.floor(series.length / 2)];
  const summary =
    sum === 0 || !peak
      ? `No ${noun} were created in this time.`
      : `${sum.toLocaleString()} created in this time. The most was ${most.toLocaleString()}, ${unit === "day" ? "on" : "in"} ${periodLabel(unit, peak.bucket, true)}.`;

  return (
    <figure className="flex flex-col gap-2">
      <div role="img" aria-label={summary} className="flex h-40 items-end gap-0.5 border-b pb-px">
        {series.map((point) => (
          <div key={point.bucket} title={`${point.count.toLocaleString()} · ${periodLabel(unit, point.bucket, true)}`} className="group flex h-full min-w-0 flex-1 items-end">
            <div
              // A count of one in a tall chart still has to be seen: never thinner than a hairline.
              style={{ height: most > 0 && point.count > 0 ? `max(${(point.count / most) * 100}%, 3px)` : "1px" }}
              className={cn("w-full rounded-t-sm", point.count > 0 ? "bg-primary/75 group-hover:bg-primary" : "bg-border")}
            />
          </div>
        ))}
      </div>
      <div className="flex justify-between text-xs text-muted-foreground tabular-nums" aria-hidden="true">
        <span>{series[0] && periodLabel(unit, series[0].bucket)}</span>
        <span>{middle && periodLabel(unit, middle.bucket)}</span>
        <span>{series.at(-1) && periodLabel(unit, series.at(-1)!.bucket)}</span>
      </div>
      <figcaption className="text-xs text-muted-foreground">{summary}</figcaption>
    </figure>
  );
}

function Breakdown({ resource, group }: { resource: ClientResource; group: InsightsData["breakdown"][number] }) {
  const def = resource.fields[group.field];
  const sum = group.slices.reduce((all, slice) => all + slice.count, 0);
  const name = (value: string) => {
    if (value === "") return "Not set";
    if (group.kind === "boolean") return value === "true" ? "Yes" : "No";
    return def && def.kind === "enum" ? optionLabel(def, value) : value;
  };

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium">{def && "label" in def && def.label ? String(def.label) : group.field}</p>
      <ul className="flex flex-col gap-1.5">
        {group.slices.map((slice) => {
          const share = sum > 0 ? (slice.count / sum) * 100 : 0;
          return (
            <li key={slice.value} className="grid grid-cols-[minmax(4rem,7rem)_1fr_auto] items-center gap-3 text-sm">
              <span className="truncate text-muted-foreground">{name(slice.value)}</span>
              <span className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                <span className="block h-full rounded-full bg-primary/75" style={{ width: `${share}%` }} />
              </span>
              <span className="tabular-nums">
                {slice.count.toLocaleString()} <span className="text-muted-foreground">· {Math.round(share)}%</span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
