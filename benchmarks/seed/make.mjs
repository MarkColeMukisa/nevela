// The 10,000 products every app starts each run with, the same on every machine:
// a seeded generator, so the ids, names and prices never change between runs.
//
//   node seed/make.mjs   writes seed/products.sql and seed/ids.json
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROWS = 10_000;
const SHOWN = 500;

// mulberry32: small, and the same everywhere. Math.random() can't be seeded.
let state = 0x6e65766c;
function random() {
  state = (state + 0x6d2b79f5) | 0;
  let t = Math.imul(state ^ (state >>> 15), 1 | state);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const pick = (list) => list[Math.floor(random() * list.length)];

function uuid() {
  const bytes = Array.from({ length: 16 }, () => Math.floor(random() * 256));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

const ADJECTIVES = ['Compact', 'Classic', 'Everyday', 'Heavy-duty', 'Light', 'Smart', 'Solid', 'Travel', 'Wireless', 'Pro'];
const NOUNS = ['Backpack', 'Blender', 'Desk lamp', 'Headphones', 'Kettle', 'Notebook', 'Phone case', 'Speaker', 'Water bottle', 'Watch'];
const DESCRIPTIONS = [
  'Made to last, and easy to look after.',
  'A favourite with customers who want something simple that works.',
  'Comes in a recyclable box with everything needed to start.',
  'Tested for a year of daily use before it went on sale.',
  null,
];

const start = Date.UTC(2026, 0, 1);
const lines = [];
const ids = [];
for (let i = 0; i < ROWS; i++) {
  const id = uuid();
  const name = `${pick(ADJECTIVES)} ${pick(NOUNS)} ${i + 1}`;
  const sku = `SKU-${String(i + 1).padStart(6, '0')}`;
  const description = pick(DESCRIPTIONS);
  const price = (Math.floor(random() * 50000) + 100) / 100;
  const stock = Math.floor(random() * 500);
  const active = random() < 0.8 ? 't' : 'f';
  const created = new Date(start + i * 60_000).toISOString().slice(0, 19).replace('T', ' ');
  lines.push([id, name, sku, description ?? '\\N', price.toFixed(2), stock, active, created, created, '\\N'].join('\t'));
  if (ids.length < SHOWN && i % (ROWS / SHOWN) === 0) ids.push(id);
}

const sql = [
  'COPY products (id, name, sku, description, price, stock, active, created_at, updated_at, deleted_at) FROM stdin;',
  ...lines,
  '\\.',
  '',
].join('\n');

fs.writeFileSync(path.join(here, 'products.sql'), sql);
fs.writeFileSync(path.join(here, 'ids.json'), `${JSON.stringify(ids)}\n`);
console.log(`seed: ${ROWS} products, ${ids.length} ids for the show scenario`);
