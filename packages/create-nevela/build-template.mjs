// Runs before `npm pack` / `npm publish` (the "prepack" script): copies the dashboard and
// the Laravel package from the repository into template/, which is what ships to npm.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const target = path.join(here, 'template');

// Build from the repository, never from a previous template/.
fs.rmSync(target, { recursive: true, force: true });
const { buildTemplate } = await import('./template.mjs');
buildTemplate(target);

const count = (dir) => fs.readdirSync(dir, { withFileTypes: true }).reduce((total, entry) => total + (entry.isDirectory() ? count(path.join(dir, entry.name)) : 1), 0);
console.log(`template/ built: ${count(path.join(target, 'web'))} dashboard files, ${count(path.join(target, 'laravel'))} package files`);
