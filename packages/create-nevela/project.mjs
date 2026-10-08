// `nevela <command>` inside an existing app.
//
// The same commands as the app's own `php nevela`, but started from Node. That matters in
// shells where typing `php` doesn't work (Git Bash with Laravel Herd, where PHP is
// php.bat), and for `upgrade`, which has to work on an app of any age, including one from
// before the app had a launcher at all.

import fs from 'node:fs';
import path from 'node:path';
import { isNewer, satisfiesCaret } from './packagist.mjs';
import { spawnCommand } from './shell.mjs';

/** What `nevela <name>` runs: these go to `php artisan nevela:<name>`. */
const NEVELA = ['upgrade', 'dev', 'status', 'version', 'resource', 'generate', 'seed', 'user', 'trash'];
/** These go to the artisan command of the same name. */
const ARTISAN = ['migrate', 'tinker', 'test', 'serve'];

export const COMMANDS = [...NEVELA, ...ARTISAN, 'artisan'];

/** The app this folder belongs to: the nearest parent holding apps/api/artisan. */
export function findProject(from) {
  let dir = path.resolve(from);
  for (;;) {
    if (fs.existsSync(path.join(dir, 'apps', 'api', 'artisan'))) {
      return { root: dir, api: path.join(dir, 'apps', 'api'), web: path.join(dir, 'apps', 'web') };
    }
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/** The artisan arguments for `nevela <name> …args`. */
export function artisanArguments(name, args) {
  if (name === 'artisan') return args;
  if (ARTISAN.includes(name)) return [name, ...args];
  // A new resource is no use until its table exists, so make it in the same step.
  const rest = args.filter((arg) => arg !== '--no-migrate');
  if (name === 'resource' && !args.includes('--no-migrate')) rest.push('--migrate');
  return [`nevela:${name}`, ...rest];
}

/**
 * What stops Composer from updating nevela/laravel, repaired in composer.json.
 * Returns a line describing each repair, for the user to see.
 */
export function repairManifest(manifest, latest) {
  const repairs = [];
  const current = manifest.require?.['nevela/laravel'];
  const caret = latest ? `^${latest.split('.').slice(0, 2).join('.')}` : null;

  // Installed from a folder in the app, from before the package was on Packagist.
  const repositories = Array.isArray(manifest.repositories) ? manifest.repositories : Object.values(manifest.repositories ?? {});
  const bundled = repositories.filter((repo) => repo?.type === 'path' && /nevela-laravel\/?$/.test(String(repo.url).replace(/\\/g, '/')));
  if (bundled.length && caret) {
    const kept = repositories.filter((repo) => !bundled.includes(repo));
    if (kept.length) manifest.repositories = kept;
    else delete manifest.repositories;
    manifest.require['nevela/laravel'] = caret;
    repairs.push(`nevela/laravel now comes from Packagist (${caret}) instead of the packages/nevela-laravel folder, which you can delete`);
    return repairs;
  }

  // Windows installs from create-nevela 0.1.0 dropped the caret: "0.1" pins one exact version.
  if (typeof current === 'string' && /^\d+\.\d+(\.\d+)?$/.test(current)) {
    manifest.require['nevela/laravel'] = caret ?? `^${current.split('.').slice(0, 2).join('.')}`;
    repairs.push(`"nevela/laravel": "${current}" pinned one exact version; it is now "${manifest.require['nevela/laravel']}"`);
    return repairs;
  }

  // Below 1.0 a caret holds the minor version: "^0.1" never reaches 0.2.0, so an update
  // would finish having changed nothing. Updating is asking for the newest, so the range
  // is moved to the one that has it.
  const range = typeof current === 'string' ? /^\^(\d+)\.(\d+)(?:\.\d+)?$/.exec(current) : null;
  if (range && caret && caret !== current && !satisfiesCaret(latest, [Number(range[1]), Number(range[2])]) && isNewer(latest, `${range[1]}.${range[2]}.0`)) {
    manifest.require['nevela/laravel'] = caret;
    repairs.push(`"nevela/laravel": "${current}" doesn't reach ${latest}; it is now "${caret}"`);
  }
  return repairs;
}

/** Make sure `pnpm nevela …` and a port-safe `dev` exist in the app's root package.json. */
export function repairScripts(root) {
  const file = path.join(root, 'package.json');
  if (!fs.existsSync(file)) return [];
  const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
  const repairs = [];
  manifest.scripts ??= {};
  if (!manifest.scripts.nevela) {
    manifest.scripts.nevela = 'php nevela';
    repairs.push('added the "nevela" script: pnpm nevela <command>');
  }
  if (manifest.scripts.dev === 'node scripts/dev.mjs') {
    manifest.scripts.dev = 'php nevela dev';
    repairs.push('"dev" now runs php nevela dev, which picks a free port');
  }
  if (repairs.length) fs.writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`);
  return repairs;
}

/** Run a command in the app's Laravel folder, attached to this terminal. Returns its exit code. */
function inApp(project, command, args) {
  const result = spawnCommand(command, args, { cwd: project.api, stdio: 'inherit' });
  if (result.error) {
    console.error(`\n  Couldn't run ${command}: ${result.error.message}\n`);
    return 1;
  }
  return result.status ?? 1;
}

/**
 * `nevela upgrade`: bring an app of any age to the latest Nevela.
 *
 * The artisan command is called by its older name, nevela:update, which every version of
 * the package answers to (from 0.3.0 it is an alias of nevela:upgrade).
 */
export async function upgrade(project, args, { latest, say }) {
  const check = args.includes('--check');
  const manifestFile = path.join(project.api, 'composer.json');
  const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
  const before = JSON.stringify(manifest);
  const repairs = repairManifest(manifest, latest);

  if (!check) {
    if (JSON.stringify(manifest) !== before) fs.writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 4)}\n`);
    repairs.push(...repairScripts(project.root));
    for (const repair of repairs) say(repair);

    // Composer first, from here: an app from before 0.1.2 has no update command of its own yet.
    const status = inApp(project, 'composer', ['update', 'nevela/laravel', '--no-interaction', '--no-progress']);
    if (status !== 0) return status;
    return inApp(project, 'php', ['artisan', 'nevela:update', '--skip-package', ...args]);
  }

  for (const repair of repairs) say(`would fix: ${repair}`);
  return inApp(project, 'php', ['artisan', 'nevela:update', ...args]);
}

/** Any other command: hand it to artisan in the app. */
export function forward(project, name, args) {
  return inApp(project, 'php', ['artisan', ...artisanArguments(name, args)]);
}
