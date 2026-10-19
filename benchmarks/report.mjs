// Turns a run's results into the tables the docs publish.
//
//   node report.mjs [results/latest]
//
// The MEDIAN of the runs is reported, never the best one: a best run is the number the
// next person to try can't get. The CPU columns say which side gave out first, which
// decides what a row means. An app at its CPU limit is at its ceiling. With the database
// at its limit and the app not, the number is where the database stopped, and the app
// could go further.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const dir = path.resolve(here, process.argv[2] ?? 'results/latest');
const APPS = {
  laravel: 'Laravel',
  'laravel-auth': 'Laravel + Sanctum',
  nevela: 'Nevela',
  'laravel-auth-octane': 'Laravel + Sanctum, Octane',
  'nevela-octane': 'Nevela, Octane',
};
const SCENARIOS = {
  show: 'show: one product by its id',
  list: 'list: a page of 20, and the total',
  write: 'write: validate and insert',
  mixed: 'mixed: 85% list, 10% show, 5% write',
};

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};
const fixed = (n, digits = 1) => (n == null || Number.isNaN(n) ? '–' : n.toFixed(digits));

const environment = fs.readFileSync(path.join(dir, 'environment.txt'), 'utf8');
const limit = (name) => Number(new RegExp(`${name} ([0-9.]+) CPUs`).exec(environment)?.[1] ?? NaN);
const seconds = Number(/load: .*?, (\d+)s per run/.exec(environment)?.[1] ?? 30);
const appLimit = limit('app') * 100;
const dbLimit = limit('postgres') * 100;

/** Every run of one app in one scenario. */
function runs(app, scenario) {
  const out = [];
  for (const file of fs.readdirSync(dir)) {
    const match = new RegExp(`^${app}-${scenario}-(\\d+)\\.json$`).exec(file);
    if (!match) continue;
    const summary = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
    const m = summary.metrics;
    const cpu = {};
    const cpuFile = path.join(dir, file.replace(/\.json$/, '.cpu'));
    if (fs.existsSync(cpuFile)) {
      for (const line of fs.readFileSync(cpuFile, 'utf8').split('\n')) {
        const [name, percent] = line.trim().split(/\s+/);
        if (!name) continue;
        cpu[name.includes('postgres') ? 'db' : 'app'] = parseFloat(percent);
      }
    }
    out.push({
      rps: m.http_reqs?.values.rate ?? 0,
      med: m.http_req_duration?.values.med,
      p95: m.http_req_duration?.values['p(95)'],
      p99: m.http_req_duration?.values['p(99)'],
      failed: m.failed_requests?.values.rate ?? 1,
      // k6 waited past the run's end for requests that never finished, and counted them nowhere.
      overran: summary.state.testRunDurationMs > seconds * 1000 + 2000,
      app: cpu.app,
      db: cpu.db,
    });
  }
  return out;
}

function summary(app, scenario) {
  const all = runs(app, scenario);
  if (all.length === 0) return null;
  const pick = (key) => median(all.map((r) => r[key]).filter((v) => v != null));
  const row = {
    runs: all.length,
    rps: pick('rps'),
    min: Math.min(...all.map((r) => r.rps)),
    max: Math.max(...all.map((r) => r.rps)),
    med: pick('med'),
    p95: pick('p95'),
    p99: pick('p99'),
    failed: Math.max(...all.map((r) => r.failed)),
    overran: all.filter((r) => r.overran).length,
    app: pick('app'),
    db: pick('db'),
  };
  row.bound = row.app >= appLimit * 0.85 ? 'the app' : row.db >= dbLimit * 0.85 ? 'the database' : 'neither';
  return row;
}

const lines = [];
const json = {};
lines.push('## Results', '', '```', environment.trim(), '```', '');

for (const [scenario, title] of Object.entries(SCENARIOS)) {
  const rows = Object.keys(APPS).map((app) => [app, summary(app, scenario)]).filter(([, row]) => row);
  if (rows.length === 0) continue;
  json[scenario] = Object.fromEntries(rows);

  lines.push(`### ${title}`, '');
  lines.push('| App | Requests/s | Median | p95 | p99 | App CPU | Postgres CPU | Gave out first | Failed |');
  lines.push('|---|--:|--:|--:|--:|--:|--:|---|--:|');
  for (const [app, r] of rows) {
    lines.push(`| ${APPS[app]} | ${fixed(r.rps, 0)} | ${fixed(r.med, 2)} ms | ${fixed(r.p95, 2)} ms | ${fixed(r.p99, 2)} ms | ${fixed(r.app, 0)}% | ${fixed(r.db, 0)}% | ${r.bound} | ${fixed(r.failed * 100, 2)}%${r.overran ? `, ${r.overran} run(s) left requests unanswered` : ''} |`);
  }
  lines.push('');

  // Each app against the one before it in the line: what signing in costs, then what Nevela costs.
  const by = Object.fromEntries(rows);
  // Then what Octane does for each, and Nevela against Laravel on Octane.
  const pairs = [
    ['laravel-auth', 'laravel'],
    ['nevela', 'laravel-auth'],
    ['nevela', 'laravel'],
    ['laravel-auth-octane', 'laravel-auth'],
    ['nevela-octane', 'nevela'],
    ['nevela-octane', 'laravel-auth-octane'],
  ];
  for (const [a, b] of pairs) {
    if (!by[a] || !by[b]) continue;
    const ratio = by[a].rps / by[b].rps;
    // Where the runs of the two overlap, the difference isn't one the runs can tell apart.
    const overlap = by[a].min <= by[b].max && by[b].min <= by[a].max;
    const said = overlap ? 'within the spread of the runs' : `${fixed(Math.abs(1 - ratio) * 100, 0)}% ${ratio < 1 ? 'fewer' : 'more'} requests a second`;
    lines.push(`- ${APPS[a]} against ${APPS[b]}: ${fixed(ratio, 2)}×, ${said}`);
  }
  lines.push('');
}

const markdown = `${lines.join('\n')}\n`;
fs.writeFileSync(path.join(dir, 'summary.md'), markdown);
fs.writeFileSync(path.join(dir, 'summary.json'), `${JSON.stringify(json, null, 2)}\n`);
process.stdout.write(markdown);
