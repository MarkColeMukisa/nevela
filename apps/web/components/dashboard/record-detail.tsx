import Link from "next/link";
import { notFound } from "next/navigation";
import { clientResource, formatValue, optionLabel, relationGraph, statusTone, storedFields, type Resource } from "@flaredev/core";
import { displayValue } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { FileCell } from "@/components/dashboard/fields/file-cell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { adminPermissions, allowedActions, allResources, dashboardStore, requireAccess, resourcePath } from "@/lib/dashboard";
import { actionApplies, publishFieldOf, publishState } from "@/lib/extras";
import { fileName, fileUrl, privateFileUrl } from "@/lib/files";
import { fileKeys, filesOf } from "@/lib/gallery";
import { lineTitles, linesOf, linesResource } from "@/lib/line-items";
import { lineAmounts } from "@/lib/line-totals";
import { itemsOf } from "@/lib/lines";
import { isRich } from "@/lib/rich";
import { site } from "@/lib/site";
import { trashFor } from "@/lib/trash";
import { LocalTime } from "./local-time";
import { PageHeader } from "./page-header";
import { RecordActions } from "./record-actions";
import type { RelationMeta } from "./fields/field-widget";

/** How many of a record's children to show before pointing at the filtered list. */
const RELATED_LIMIT = 5;

/**
 * One record: its fields, what belongs to it, and what's been done to it.
 *
 * A row in a table is a summary; this is the page you send someone when you want them
 * to look at the thing itself.
 */
export async function RecordDetail({ resource, id }: { resource: Resource; id: string }) {
  await requireAccess(resource, "read");
  // Hooks and computed values are functions, and a function can't be sent to the browser.
  // This is the same resource without them, for the client components below.
  const forClient = clientResource(resource);
  const store = dashboardStore(resource.name);
  const result = await store.get(id);
  if (!result.ok) notFound();
  const record = result.data;
  const permissions = await adminPermissions(resource.name);
  const trash = permissions.delete ? await trashFor(resource.slug) : undefined;

  const all = allResources();
  const byName = new Map(all.map((item) => [item.name, item]));
  const fields = storedFields(resource);

  // Relation titles, so a belongsTo reads as a name rather than an id.
  const relationTitles: Record<string, string> = {};
  const relations: Record<string, RelationMeta & { initialTitle?: string }> = {};
  for (const [key, def] of fields) {
    if (def.kind !== "belongsTo") continue;
    const target = byName.get(def.target);
    if (!target) continue;
    relations[key] = { name: target.name, label: target.label, pluralLabel: target.pluralLabel, slug: target.slug, titleField: target.titleField };
    const value = record[key];
    if (typeof value === "string") {
      const titles = await dashboardStore(target.name).titles([value]);
      const title = titles[value];
      if (title) relationTitles[key] = title;
    }
  }

  // Its lines, if it has some: shown whole, in a table of their own, rather than as children.
  const lines = linesResource(resource);
  const lineRows = linesOf(record);
  const lineColumns = lines ? storedFields(lines.lines).filter(([key]) => key !== lines.field) : [];
  const titlesOfLines = lines ? await lineTitles(lines.lines, lines.field, lineRows) : {};
  const amounts = lineAmounts(lineColumns);

  // Children: resources with a belongsTo pointing back here.
  const graph = relationGraph(all);
  const children = (graph.byResource[resource.name]?.hasMany ?? []).flatMap((relation) => {
    const target = byName.get(relation.target);
    const isLines = lines !== undefined && relation.target === lines.lines.name && relation.foreignKey === lines.field;
    return target && !isLines ? [{ relation, target }] : [];
  });
  const related = await Promise.all(
    children.map(async ({ relation, target }) => {
      const params = new URLSearchParams({ perPage: String(RELATED_LIMIT), [`filter[${relation.foreignKey}]`]: id });
      const list = await dashboardStore(target.name).list(params);
      return { relation, target, rows: list.ok ? list.data.data : [], total: list.ok ? list.data.meta.total : 0, filterKey: relation.foreignKey };
    }),
  );

  const titleDef = resource.fields[resource.titleField];
  const title = titleDef && titleDef.kind !== "hasMany" ? String(formatValue(titleDef, record[resource.titleField]) || id) : id;

  return (
    <>
      <PageHeader
        title={title}
        description={<>Created <LocalTime value={record.createdAt as string | number | Date} /></>}
        crumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: resource.pluralLabel, href: resourcePath(resource) },
          { label: title },
        ]}
        actions={
          <RecordActions
            resource={forClient}
            id={id}
            record={record}
            relations={relations}
            listHref={resourcePath(resource)}
            editHref={resourcePath(resource, id, "edit")}
            canUpdate={permissions.update}
            canDelete={permissions.delete}
            overlayForms={site.dashboard.forms === "sheet" && !itemsOf(resource.name)}
            trash={trash}
            actions={(await allowedActions(resource.name)).filter((action) => action.on === "record" && actionApplies(action, record))}
            published={publishFieldOf(resource.name) ? publishState(record[publishFieldOf(resource.name)!]) : undefined}
          />
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Details</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
            {fields.map(([key, def]) => {
              const value = record[key];
              let content: React.ReactNode = displayValue(def, value);
              if ((def.kind === "datetime") && value != null) {
                content = <LocalTime value={value as string | number | Date} />;
              } else if (def.kind === "enum" && value != null) {
                const tone = statusTone(value);
                content = <Badge variant={tone === "neutral" ? "secondary" : tone}>{content}</Badge>;
              } else if (isRich(def) && typeof value === "string" && value) {
                // Shown as it was written. Laravel cleaned it when it was saved and again when it was read.
                content = <div className="rich-text" dangerouslySetInnerHTML={{ __html: value }} />;
              } else if (filesOf(def)) {
                // A gallery: every one of them, each opening at full size.
                const keys = fileKeys(value);
                content =
                  keys.length === 0 ? (
                    "—"
                  ) : (
                    <span className="flex flex-wrap gap-2">
                      {keys.map((key) => (
                        <a key={key} href={fileUrl(key)} target="_blank" rel="noreferrer" aria-label={`Open ${fileName(key)}`}>
                          <FileCell value={key} size={96} />
                        </a>
                      ))}
                    </span>
                  );
              } else if (def.kind === "file" && typeof value === "string" && value) {
                // Bigger here than in the table: this is the page for looking at one record.
                content = <FileCell resourceName={resource.name} fieldKey={key} value={value} size={96} download={privateFileUrl(resource.slug, id, key)} />;
              } else if (def.kind === "multiselect" && Array.isArray(value) && value.length > 0) {
                content = (
                  <span className="flex flex-wrap gap-1">
                    {value.map((item) => (
                      <Badge key={String(item)} variant="secondary">
                        {optionLabel(def, String(item))}
                      </Badge>
                    ))}
                  </span>
                );
              } else if (def.kind === "belongsTo" && typeof value === "string") {
                const target = byName.get(def.target);
                // No title: this person's role doesn't let them see that record. Its id would mean nothing to them.
                content =
                  target && relationTitles[key] === undefined ? (
                    <span className="text-muted-foreground" title={`Your role doesn't include ${target.pluralLabel.toLowerCase()}.`}>
                      Hidden
                    </span>
                  ) : target ? (
                    <Link href={resourcePath(target, value)} className="text-primary hover:underline">
                      {relationTitles[key]}
                    </Link>
                  ) : (
                    value
                  );
              }
              return (
                <div key={key} className={def.kind === "text" || filesOf(def) ? "flex flex-col gap-1 sm:col-span-2" : "flex flex-col gap-1"}>
                  <dt className="text-xs text-muted-foreground">{def.label}</dt>
                  <dd className="text-sm break-words">{content}</dd>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <div className="flex flex-col gap-6">

          {related.map(({ relation, target, rows, total, filterKey }) => (
            <Card key={relation.key}>
              <CardHeader>
                <CardTitle className="text-base">{target.pluralLabel}</CardTitle>
                <CardDescription>
                  {total === 0 ? `No ${target.pluralLabel.toLowerCase()} yet.` : `${total.toLocaleString()} in total.`}
                </CardDescription>
              </CardHeader>
              {rows.length > 0 && (
                <CardContent className="flex flex-col">
                  {rows.map((row) => {
                    const childTitle = target.fields[target.titleField];
                    const label = childTitle && childTitle.kind !== "hasMany" ? formatValue(childTitle, row[target.titleField]) : String(row.id);
                    return (
                      <Link
                        key={String(row.id)}
                        href={resourcePath(target, String(row.id))}
                        className="truncate border-b py-2 text-sm last:border-b-0 last:pb-0 hover:text-primary"
                      >
                        {label || String(row.id)}
                      </Link>
                    );
                  })}
                  {total > rows.length && (
                    <Button variant="link" className="h-auto justify-start p-0 pt-2" asChild>
                      <Link href={`${resourcePath(target)}?filter[${filterKey}]=${id}`}>See all {total.toLocaleString()}</Link>
                    </Button>
                  )}
                </CardContent>
              )}
            </Card>
          ))}
        </div>
      </div>

      {lines && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{lines.lines.pluralLabel}</CardTitle>
            <CardDescription>
              {lineRows.length === 0
                ? `No ${lines.lines.pluralLabel.toLowerCase()} yet.`
                : `${lineRows.length.toLocaleString()} ${lineRows.length === 1 ? lines.lines.label.toLowerCase() : lines.lines.pluralLabel.toLowerCase()}.`}
            </CardDescription>
          </CardHeader>
          {lineRows.length > 0 && (
            <CardContent className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead className="text-left text-muted-foreground">
                  <tr>
                    {lineColumns.map(([key, def]) => (
                      <th key={key} scope="col" className="py-2 pr-4 font-medium whitespace-nowrap">
                        {def.label}
                      </th>
                    ))}
                    {amounts && (
                      <th scope="col" className="py-2 text-right font-medium whitespace-nowrap">
                        Amount
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {lineRows.map((row, index) => {
                    const amount = amounts?.amount(row) ?? null;
                    return (
                      <tr key={String(row.id ?? index)} className="border-t">
                        {lineColumns.map(([key, def]) => {
                          const value = row[key];
                          return (
                            <td key={key} className="py-2 pr-4">
                              {def.kind === "belongsTo" && typeof value === "string" ? (titlesOfLines[key]?.[value] ?? value) : displayValue(def, value)}
                            </td>
                          );
                        })}
                        {amounts && <td className="py-2 text-right whitespace-nowrap tabular-nums">{amount === null ? "—" : amounts.format(amount)}</td>}
                      </tr>
                    );
                  })}
                </tbody>
                {amounts && (
                  <tfoot>
                    <tr className="border-t font-medium">
                      <td colSpan={lineColumns.length} className="py-2 pr-4 text-right">
                        Total
                      </td>
                      <td className="py-2 text-right whitespace-nowrap tabular-nums">{amounts.format(lineRows.reduce((sum, row) => sum + (amounts.amount(row) ?? 0), 0))}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </CardContent>
          )}
        </Card>
      )}
    </>
  );
}
