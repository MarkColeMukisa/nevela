import { redirect } from "next/navigation";
import { DownloadIcon } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { dashboardSession } from "@/lib/dashboard";
import { fieldsOf, loadOpenApi, METHODS, refName, resolve, type Method, type OpenApiDocument, type Operation, type Parameter, type Schema } from "@/lib/openapi";
import { cn } from "@/lib/utils";

export const metadata = { title: "API" };

const METHOD_STYLE: Record<Method, string> = {
  get: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  post: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  put: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  patch: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  delete: "bg-red-500/15 text-red-700 dark:text-red-300",
};

/**
 * The app's API, read from what Laravel says it is (GET _nevela/openapi.json): each
 * resource's addresses, what they take and what they answer. For administrators, who
 * build on the API; the same document is a download for tools that make clients from one.
 */
export default async function ApiPage() {
  const { session, isAdmin } = await dashboardSession();
  if (!session) redirect("/sign-in?next=%2Fdashboard%2Fapi");
  if (!isAdmin) redirect("/dashboard?error=forbidden");
  const result = await loadOpenApi();

  return (
    <>
      <PageHeader
        title="API"
        description="Every address your resources have, what each one takes and what it answers. Written from the descriptors, so it changes as they do."
        crumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "API" }]}
        actions={
          result.status === "ok" ? (
            <Button variant="outline" size="sm" asChild>
              <a href="/dashboard/api/openapi.json" download="openapi.json">
                <DownloadIcon /> openapi.json
              </a>
            </Button>
          ) : undefined
        }
      />
      {result.status === "missing" ? (
        <Alert>
          <AlertTitle>The Laravel app doesn&apos;t describe its API yet</AlertTitle>
          <AlertDescription>
            It comes with Nevela 0.34. Run <code>nevela upgrade</code> in the project.
          </AlertDescription>
        </Alert>
      ) : result.status === "error" ? (
        <Alert variant="destructive">
          <AlertTitle>The API description couldn&apos;t be loaded</AlertTitle>
          <AlertDescription>{result.message}</AlertDescription>
        </Alert>
      ) : (
        <Reference document={result.document} />
      )}
    </>
  );
}

function Reference({ document }: { document: OpenApiDocument }) {
  const byTag = new Map<string, { method: Method; path: string; operation: Operation; shared: Parameter[] }[]>();
  for (const [path, item] of Object.entries(document.paths)) {
    for (const method of METHODS) {
      const operation = item[method];
      if (!operation) continue;
      const tag = operation.tags?.[0] ?? "Other";
      byTag.set(tag, [...(byTag.get(tag) ?? []), { method, path, operation, shared: item.parameters ?? [] }]);
    }
  }
  const tags = [...(document.tags ?? []).map((tag) => tag.name), ...[...byTag.keys()].filter((name) => !document.tags?.some((tag) => tag.name === name))];

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardContent className="flex flex-col gap-2 text-sm">
          <p>
            Every address starts <code className="rounded bg-muted px-1.5 py-0.5">{document.servers[0]?.url}</code>. Send{" "}
            <code className="rounded bg-muted px-1.5 py-0.5">Authorization: Bearer &lt;token&gt;</code>, the token <code>POST /auth/token</code> answers, unless an address says it needs none.
          </p>
          {document.info.description && <p className="text-muted-foreground">{document.info.description}</p>}
        </CardContent>
      </Card>
      {tags
        .filter((tag) => byTag.has(tag))
        .map((tag) => (
          <Card key={tag} id={tag.toLowerCase().replace(/[^a-z0-9]+/g, "-")}>
            <CardHeader>
              <CardTitle>{tag}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col divide-y">
              {byTag.get(tag)!.map(({ method, path, operation, shared }) => (
                <Endpoint key={`${method} ${path}`} document={document} method={method} path={path} operation={operation} shared={shared} />
              ))}
            </CardContent>
          </Card>
        ))}
    </div>
  );
}

function Endpoint({ document, method, path, operation, shared }: { document: OpenApiDocument; method: Method; path: string; operation: Operation; shared: Parameter[] }) {
  const parameters = [...shared, ...(operation.parameters ?? [])];
  const [contentType, body] = Object.entries(operation.requestBody?.content ?? {})[0] ?? [];
  const open = Array.isArray(operation.security) && operation.security.length === 0;

  return (
    <details className="group py-3 first:pt-0 last:pb-0">
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1 [&::-webkit-details-marker]:hidden">
        <span className={cn("w-16 shrink-0 rounded px-2 py-0.5 text-center font-mono text-xs font-semibold uppercase", METHOD_STYLE[method])}>{method}</span>
        <code className="min-w-0 break-all font-mono text-sm">{path}</code>
        <span className="text-sm text-muted-foreground">{operation.summary}</span>
        {open && <Badge variant="outline">No sign-in</Badge>}
      </summary>
      <div className="mt-3 flex flex-col gap-4 pl-0 text-sm md:pl-19">
        {operation.description && <p className="text-muted-foreground">{operation.description}</p>}
        {operation["x-nevela-permission"] && (
          <p>
            Needs the permission <code className="rounded bg-muted px-1.5 py-0.5">{operation["x-nevela-permission"]}</code>.
          </p>
        )}
        {parameters.length > 0 && (
          <Section title="Parameters">
            <Fields rows={parameters.map((parameter) => ({ name: parameter.name, required: Boolean(parameter.required), type: describe(document, parameter.schema), about: parameter.description ?? "" }))} />
          </Section>
        )}
        {body && (
          <Section title="Body" note={contentType === "application/json" ? refName(body.schema) : contentType}>
            <Body document={document} schema={body.schema} />
          </Section>
        )}
        <Section title="Answers">
          <ul className="flex flex-col gap-1">
            {Object.entries(operation.responses).map(([status, answer]) => {
              const resolved = resolve(document, answer);
              const schema = resolved.content?.["application/json"]?.schema;
              return (
                <li key={status} className="flex gap-3">
                  <span className={cn("w-10 shrink-0 font-mono tabular-nums", status.startsWith("2") ? "text-emerald-700 dark:text-emerald-300" : "text-muted-foreground")}>{status}</span>
                  <span>
                    {resolved.description}
                    {schema && refName(schema) && <span className="text-muted-foreground"> {refName(schema)}</span>}
                  </span>
                </li>
              );
            })}
          </ul>
        </Section>
      </div>
    </details>
  );
}

function Body({ document, schema }: { document: OpenApiDocument; schema: Schema }) {
  const rows = fieldsOf(document, schema);
  // A body whose one field is a named schema ({ input: … }, { items: [ … ] }) shows that schema's fields too.
  const inner = rows.length === 1 ? resolve(document, schema).properties?.[rows[0].name] : undefined;
  const nested = inner ? (inner.items ?? inner) : undefined;
  return (
    <div className="flex flex-col gap-3">
      <Fields rows={rows} />
      {nested && refName(nested) && fieldsOf(document, nested).length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-muted-foreground">
            {rows[0].name}: {refName(nested)}
          </p>
          <Fields rows={fieldsOf(document, nested)} />
        </div>
      )}
    </div>
  );
}

function describe(document: OpenApiDocument, schema: Schema): string {
  return fieldsOf(document, { properties: { value: schema } })[0]?.type ?? "";
}

function Section({ title, note, children }: { title: string; note?: string | null; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="flex items-baseline gap-2 text-xs text-muted-foreground">
        <span className="font-medium uppercase tracking-wide">{title}</span>
        {note && <code className="font-mono">{note}</code>}
      </h3>
      {children}
    </section>
  );
}

function Fields({ rows }: { rows: { name: string; required: boolean; type: string; about: string }[] }) {
  if (rows.length === 0) return <p className="text-muted-foreground">Nothing.</p>;
  return (
    <div className="overflow-x-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>About</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.name}>
              <TableCell className="align-top font-mono text-xs">
                {row.name}
                {row.required && <span className="ml-1 text-red-600 dark:text-red-400" title="Required">*</span>}
              </TableCell>
              <TableCell className="align-top text-xs whitespace-normal">{row.type}</TableCell>
              <TableCell className="align-top text-xs whitespace-normal text-muted-foreground">{row.about}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
