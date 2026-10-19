import http from 'k6/http';
import { check } from 'k6';
import { Rate } from 'k6/metrics';
import { SharedArray } from 'k6/data';

/*
 * One script for every app, pointed at whichever one is up:
 *
 *   k6 run -e BASE=http://nevela:8080 -e SCENARIO=show -e TOKEN=… k6/bench.js
 *
 * Every app here answers the same requests with the same JSON, so the script is the
 * same for all of them. Two scripts drift, and then you are comparing the scripts.
 *
 *   show   GET  /api/products/{id}               one row by its key
 *   list   GET  /api/products?page=N&perPage=20  a page of rows, and the count of all of them
 *   write  POST /api/products                    validation and an insert
 *   mixed  85% list, 10% show, 5% write
 *
 * Modelled on Grit's harness (github.com/MUKE-coder/grit, benchmarks/, MIT), so the
 * scenarios and their mix are the ones Grit publishes.
 */

const BASE = __ENV.BASE;
const SCENARIO = __ENV.SCENARIO || 'list';
const VUS = parseInt(__ENV.VUS || '50', 10);
const DURATION = __ENV.DURATION || '30s';
// The app's sign-in token, for the apps that ask for one. The plain app gets none.
const TOKEN = __ENV.TOKEN || '';

if (!BASE) throw new Error('set -e BASE=http://host:port');

// Read once and shared by every virtual user, rather than parsed 50 times.
const IDS = new SharedArray('ids', () => JSON.parse(open('../seed/ids.json')));

const failures = new Rate('failed_requests');

export const options = {
  scenarios: {
    [SCENARIO]: {
      executor: 'constant-vus',
      vus: VUS,
      duration: DURATION,
      exec: SCENARIO,
      // Time for requests in flight to land, so a slow tail isn't counted as failed at the cut-off.
      gracefulStop: '10s',
    },
  },
  summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(90)', 'p(95)', 'p(99)'],
  thresholds: {
    failed_requests: ['rate<0.01'],
  },
};

const HEADERS = {
  Accept: 'application/json',
  'Content-Type': 'application/json',
  ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
};

function record(res, expected) {
  const ok = check(res, {
    'status as expected': (r) => r.status === expected,
    'has a body': (r) => r.body && r.body.length > 2,
  });
  failures.add(!ok);
}

export function list() {
  // Walk the pages rather than asking for page 1 all run, so no app gets to answer from one cached page.
  const page = (__ITER % 50) + 1;
  record(http.get(`${BASE}/api/products?page=${page}&perPage=20`, { headers: HEADERS }), 200);
}

export function show() {
  const id = IDS[(__VU * 7919 + __ITER) % IDS.length];
  record(http.get(`${BASE}/api/products/${id}`, { headers: HEADERS }), 200);
}

export function write() {
  // __VU and __ITER keep the SKU unique without a shared counter, which would make the
  // virtual users wait on each other and measure the counter. RUN keeps it apart from
  // the warm-up's, which ran against the same table.
  const n = `${__ENV.RUN || 'run'}-${__VU}-${__ITER}`;
  const body = JSON.stringify({
    name: `Bench product ${n}`,
    sku: `BENCH-${n}`,
    description: 'Created by the write scenario.',
    price: 19.99,
    stock: 42,
    active: true,
  });
  record(http.post(`${BASE}/api/products`, body, { headers: HEADERS }), 201);
}

export function mixed() {
  const roll = __ITER % 20;
  if (roll < 17) return list();
  if (roll < 19) return show();
  return write();
}

// The numbers, as JSON, where run.sh asked for them, and one line for the log.
export function handleSummary(data) {
  const m = data.metrics;
  const reqs = m.http_reqs ? m.http_reqs.values : { count: 0, rate: 0 };
  const failed = m.failed_requests ? m.failed_requests.values.rate : 1;
  // A run that took longer than asked had requests that never finished: k6 waited for
  // them until gracefulStop, and they are in no other number.
  const overran = data.state.testRunDurationMs > parseInt(DURATION, 10) * 1000 + 2000;
  const line = `${SCENARIO}: ${reqs.count} requests, ${reqs.rate.toFixed(1)}/s, failed ${(failed * 100).toFixed(2)}%${overran ? ', OVERRAN: requests left unanswered' : ''}\n`;
  return __ENV.SUMMARY ? { [__ENV.SUMMARY]: JSON.stringify(data, null, 1), stdout: line } : { stdout: line };
}
