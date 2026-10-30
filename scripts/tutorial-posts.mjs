// The tutorials, as the sample posts a new app's blog starts with.
//
// apps/docs/src/tutorials.ts is where the tutorials are listed for the docs. This copies
// the ones that are out into the Laravel package, packages/laravel/resources/tutorials/:
// their words in tutorials.json, and each cover made small enough to ship in every app
// (about 800 pixels wide, 60 KB at most). `nevela blog --sample` makes a post of each.
//
//   node scripts/tutorial-posts.mjs        after a tutorial is added or changed
//
// scripts/tutorials.test.mjs fails while the package's copy is behind the docs. Making a
// cover smaller needs PHP with GD: PHP=php.bat where php is a .bat, as with Herd in Git Bash.

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const list = path.join(root, 'apps', 'docs', 'src', 'tutorials.ts');
export const target = path.join(root, 'packages', 'laravel', 'resources', 'tutorials');
/** The most a cover may weigh in the package. */
export const MAX_COVER_BYTES = 60 * 1024;

/**
 * The tutorials that are out, as the docs list them: their words, and the cover each
 * imports. Read from the file's text, since it imports pictures, which only the docs' build can.
 *
 * @returns {{ slug: string, title: string, summary: string, level: string, minutes: number, topics: string[], cover: string | null }[]}
 */
export function readTutorials() {
  const source = fs.readFileSync(list, 'utf8');
  const covers = Object.fromEntries([...source.matchAll(/^import (\w+) from "\.\/(assets\/[^"]+)";$/gm)].map(([, name, file]) => [name, file]));
  const start = source.indexOf('export const tutorials: Tutorial[] = [');
  const end = source.indexOf('\n];', start);
  if (start < 0 || end < 0) throw new Error(`${path.relative(root, list)} has no "export const tutorials: Tutorial[] = [ … ];" to read.`);
  // Its entries are plain object literals; a cover is the name of an import, made a string here.
  const entries = source.slice(source.indexOf('[', start), end + 2).replace(/cover: (\w+),/g, 'cover: "$1",');
  const tutorials = new Function(`return ${entries}`)();
  return tutorials
    .filter((tutorial) => tutorial.out)
    .map(({ slug, title, summary, level, minutes, topics, cover }) => ({
      slug,
      title,
      summary,
      level,
      minutes,
      topics,
      cover: cover && covers[cover] ? path.join(root, 'apps', 'docs', 'src', covers[cover]) : null,
    }));
}

/** What goes in tutorials.json: the words, and the name of each cover in the package. */
export function postsData(tutorials) {
  return tutorials.map(({ cover, ...words }) => ({ ...words, cover: cover ? `${words.slug}.webp` : null }));
}

function shrink(from, to) {
  const php = process.env.PHP || 'php';
  const script = path.join(root, 'scripts', 'tutorial-cover.php');
  const args = [script, from, to, '800', String(MAX_COVER_BYTES)];
  // A .bat (Herd's php on Windows) runs through cmd.
  const result = php.endsWith('.bat') ? spawnSync('cmd.exe', ['/d', '/c', php, ...args], { encoding: 'utf8' }) : spawnSync(php, args, { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`Couldn't make ${path.basename(to)} smaller: ${result.stderr || result.stdout || result.error}`);
  return result.stdout.trim();
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const tutorials = readTutorials();
  fs.mkdirSync(target, { recursive: true });
  for (const tutorial of tutorials) {
    if (tutorial.cover) console.log(`  ${tutorial.slug}.webp  ${shrink(tutorial.cover, path.join(target, `${tutorial.slug}.webp`))}`);
  }
  // A cover of a tutorial no longer listed goes.
  const kept = new Set(tutorials.filter((tutorial) => tutorial.cover).map((tutorial) => `${tutorial.slug}.webp`));
  for (const file of fs.readdirSync(target)) {
    if (file.endsWith('.webp') && !kept.has(file)) fs.rmSync(path.join(target, file));
  }
  fs.writeFileSync(path.join(target, 'tutorials.json'), `${JSON.stringify(postsData(tutorials), null, 2)}\n`);
  console.log(`  tutorials.json  ${tutorials.length} tutorials`);
}
