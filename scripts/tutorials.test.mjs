// Each tutorial says what its script in examples/ does: every `nevela …` command the
// script runs before its `# Checks` line, and every file it puts in the app, is on the tutorial's page as it is.
// CI runs the scripts on a new app, so a tutorial that drifts from them fails here.

import assert from 'node:assert/strict';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const examples = path.join(root, 'examples');
const pages = path.join(root, 'apps', 'docs', 'src', 'content', 'docs', 'tutorials');
const lf = (text) => text.replace(/\r\n/g, '\n');

for (const name of readdirSync(examples, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name)) {
  test(`the ${name} tutorial shows what its script does`, () => {
    const page = path.join(pages, `${name}.md`);
    assert.ok(existsSync(page), `examples/${name} has no tutorial at ${path.relative(root, page)}`);
    const text = lf(readFileSync(page, 'utf8'));
    const lines = new Set(text.split('\n').map((line) => line.trim()));

    // The steps: what comes before the line that starts the script's own checks.
    const commands = lf(readFileSync(path.join(examples, name, 'steps.sh'), 'utf8'))
      .split(/^# Checks/m)[0]
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.startsWith('nevela '));
    assert.ok(commands.length > 0, `examples/${name}/steps.sh runs no nevela commands`);
    for (const command of commands) {
      assert.ok(lines.has(command), `examples/${name}/steps.sh runs \`${command}\`, which the tutorial doesn't show`);
    }

    const files = path.join(examples, name, 'files');
    const pageLines = text.split('\n').map((line) => line.trim());
    for (const file of existsSync(files) ? readdirSync(files) : []) {
      const content = lf(readFileSync(path.join(files, file), 'utf8')).trim();
      if (!file.endsWith('.json')) {
        assert.ok(text.includes(content), `examples/${name}/files/${file} isn't on the tutorial's page as it is`);
        continue;
      }
      // JSON is shown where it goes in the descriptor, so at that depth, and without the
      // braces around it that the file needs: its lines, in order, whatever their indent.
      const inner = content.split('\n').slice(1, -1).map((line) => line.trim());
      const at = pageLines.findIndex((_, start) => inner.every((line, offset) => pageLines[start + offset] === line));
      assert.ok(at >= 0, `examples/${name}/files/${file} isn't on the tutorial's page, line for line`);
    }
  });
}
