#!/usr/bin/env node
// Create a new Nevela app: a Laravel API and a Next.js dashboard, side by side.
//
//   pnpm create nevela my-app
//   npm create nevela@latest my-app
//
// No dependencies on purpose: this runs before anything is installed.

import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import { isNewer, onPackagist } from './packagist.mjs';
import { copyLaravelPackage, copyWebTemplate } from './template.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const VERSION = JSON.parse(fs.readFileSync(path.join(here, 'package.json'), 'utf8')).version;
const DOCS = 'https://nevela-docs.vercel.app';
const windows = process.platform === 'win32';

/**
 * The account every new app starts with, so there is something to sign in as straight
 * away. It is created in the app's local database, never in code or a migration, so it
 * does not follow the app to a server.
 */
const ADMIN = { name: 'Admin', email: 'admin@example.com', password: 'password' };

const colour = (code) => (text) => (process.stdout.isTTY ? `\x1b[${code}m${text}\x1b[0m` : text);
const bold = colour(1);
const dim = colour(2);
const green = colour(32);
const red = colour(31);
const indigo = colour('38;5;99');

const HELP = `
  ${bold('create-nevela')} ${dim(`v${VERSION}`)}

  Create a new Nevela app: a Laravel API and a Next.js dashboard.

  ${bold('Usage')}
    pnpm create nevela <name> [options]
    npm create nevela@latest <name> -- [options]

  ${bold('Options')}
    --pm <pnpm|npm|yarn|bun>   Package manager for the dashboard. Default: the one you ran this with.
    --no-install               Don't install the dashboard's dependencies.
    --no-user                  Don't create the starter admin account.
    --no-git                   Don't run git init.
    --bundled-package          Use the copy of nevela/laravel that ships with this installer
                               instead of the release on Packagist.
    -y, --yes                  Ask nothing. (Only the app name is ever asked for.)
    -h, --help                 Show this.
    -v, --version              Show the version.

  ${bold('Needs')}  PHP 8.3+, Composer, Node.js 20+
  ${bold('Docs')}   ${DOCS}
`;

function fail(message, detail) {
  console.error(`\n  ${red('✖')} ${message}`);
  if (detail) console.error(`\n${detail.trim().split('\n').map((line) => `    ${line}`).join('\n')}`);
  console.error('');
  process.exit(1);
}

/** Run a command. Quiet unless it fails, when its output is the error message. */
function run(command, args, { cwd, interactive = false, allowFailure = false } = {}) {
  const result = spawnCommand(command, args, { cwd, stdio: interactive ? 'inherit' : 'pipe', encoding: 'utf8' });
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  if (result.error || result.status !== 0) {
    if (allowFailure) return { ok: false, output };
    fail(`\`${command} ${args.join(' ')}\` failed.`, output || String(result.error ?? ''));
  }
  return { ok: true, output };
}

/**
 * .bat and .cmd shims (composer, pnpm, Herd's php) only resolve through a shell on
 * Windows. A shell takes one command string, so arguments are quoted here; none of them
 * come from anywhere but this file and the validated app name.
 */
function spawnCommand(command, args, options) {
  if (!windows) return spawnSync(command, args, options);
  return spawnSync(shellLine(command, args), { ...options, shell: true });
}

// `^` is not in the safe list on purpose: unquoted, cmd.exe treats it as an escape
// character and drops it, which turned the constraint "^0.1" into an exact "0.1".
const quote = (arg) => (/^[\w./:=@,-]+$/.test(arg) ? arg : `"${arg.replace(/"/g, '\\"')}"`);
const shellLine = (command, args) => [command, ...args.map(quote)].join(' ');

/**
 * Start a command and carry on. Its output goes to a file rather than a pipe: the steps
 * that follow block this process for minutes, and a pipe nobody is reading fills up and
 * stalls the command.
 */
function start(command, args, { cwd }) {
  const log = path.join(os.tmpdir(), `create-nevela-${process.pid}-${command}.log`);
  const out = fs.openSync(log, 'w');
  const started = Date.now();
  const child = windows
    ? spawn(shellLine(command, args), { cwd, shell: true, stdio: ['ignore', out, out] })
    : spawn(command, args, { cwd, stdio: ['ignore', out, out] });
  const done = new Promise((resolve) => {
    const finish = (ok) => {
      fs.closeSync(out);
      const output = fs.readFileSync(log, 'utf8');
      // This process hears about the exit only once the blocking steps let it. The log's
      // last write is when the command really finished.
      const ended = Math.max(started, Math.min(Date.now(), fs.statSync(log).mtimeMs));
      fs.rmSync(log, { force: true });
      resolve({ ok, output, seconds: (ended - started) / 1000 });
    };
    child.on('error', () => finish(false));
    child.on('close', (code) => finish(code === 0));
  });
  return { done };
}

function available(command, args = ['--version']) {
  const result = spawnCommand(command, args, { stdio: 'pipe', encoding: 'utf8' });
  return result.status === 0 ? `${result.stdout}${result.stderr}` : null;
}

const duration = (seconds) => (seconds >= 60 ? `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s` : `${seconds.toFixed(1)}s`);

async function step(label, work) {
  const started = Date.now();
  // The "in progress" line is rewritten in place when the step ends. That only works if
  // it fits on one line; in a narrow terminal it would wrap and be left behind.
  const inPlace = process.stdout.isTTY && label.length + 16 < (process.stdout.columns ?? 80);
  if (inPlace) process.stdout.write(`  ${dim('◇')} ${label}…`);
  const result = await work();
  const seconds = result?.seconds ?? (Date.now() - started) / 1000;
  const took = seconds >= 1 ? dim(` (${duration(seconds)})`) : '';
  process.stdout.write(`${inPlace ? '\r' : ''}  ${green('✔')} ${label}${took}   \n`);
  return result;
}

function parseArgs(argv) {
  const options = { name: undefined, pm: undefined, install: true, user: true, git: true, yes: false, bundledPackage: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '-h' || arg === '--help') {
      console.log(HELP);
      process.exit(0);
    } else if (arg === '-v' || arg === '--version') {
      console.log(VERSION);
      process.exit(0);
    } else if (arg === '-y' || arg === '--yes') options.yes = true;
    else if (arg === '--no-install') options.install = false;
    else if (arg === '--no-user') options.user = false;
    else if (arg === '--no-git') options.git = false;
    else if (arg === '--bundled-package') options.bundledPackage = true;
    else if (arg === '--pm') options.pm = argv[++i];
    else if (arg.startsWith('--pm=')) options.pm = arg.slice(5);
    else if (arg.startsWith('-')) fail(`Unknown option ${arg}. Run with --help to see the options.`);
    else if (options.name === undefined) options.name = arg;
    else fail(`Unexpected argument "${arg}". The app name is "${options.name}".`);
  }
  return options;
}

/** "my-shop" → "My Shop", for the dashboard's title. */
const titleCase = (slug) => slug.split(/[-_]+/).filter(Boolean).map((word) => word[0].toUpperCase() + word.slice(1)).join(' ');

/** The newest create-nevela on npm, when it is newer than this one. */
async function newerVersion() {
  try {
    const response = await fetch('https://registry.npmjs.org/create-nevela/latest', { signal: AbortSignal.timeout(4000) });
    const latest = (await response.json()).version;
    return isNewer(latest, VERSION) ? latest : null;
  } catch {
    return null;
  }
}

function detectPackageManager(requested) {
  const known = ['pnpm', 'npm', 'yarn', 'bun'];
  if (requested) {
    if (!known.includes(requested)) fail(`--pm must be one of: ${known.join(', ')}.`);
    if (!available(requested)) fail(`${requested} isn't installed, or isn't on your PATH.`);
    return requested;
  }
  // "pnpm/10.1.0 npm/? node/v22…" when run through `pnpm create`.
  const agent = (process.env.npm_config_user_agent ?? '').split('/')[0];
  if (known.includes(agent)) return agent;
  return available('pnpm') ? 'pnpm' : 'npm';
}

function checkRequirements() {
  const node = process.versions.node.split('.').map(Number);
  if (node[0] < 20) fail(`Nevela needs Node.js 20 or newer. You have ${process.versions.node}.`);

  const php = available('php', ['-v']);
  if (!php) fail('PHP isn\'t installed, or isn\'t on your PATH. Nevela needs PHP 8.3 or newer: https://www.php.net/downloads');
  const version = /PHP (\d+)\.(\d+)/.exec(php);
  if (!version || Number(version[1]) < 8 || (Number(version[1]) === 8 && Number(version[2]) < 3)) {
    fail(`Nevela needs PHP 8.3 or newer. You have ${version ? `${version[1]}.${version[2]}` : 'a version I can\'t read'}.`);
  }

  if (!available('composer')) fail('Composer isn\'t installed, or isn\'t on your PATH: https://getcomposer.org/download/');
}

/** Sanctum's trait on the User model. `install:api` asks for this by hand; do it for them. */
function addApiTokens(userModel) {
  let source = fs.readFileSync(userModel, 'utf8');
  if (source.includes('HasApiTokens')) return true;
  const withImport = source.replace(/^(use Illuminate\\Notifications\\Notifiable;)$/m, '$1\nuse Laravel\\Sanctum\\HasApiTokens;');
  const withTrait = withImport.replace(/^(\s+use )(HasFactory, Notifiable;)$/m, '$1HasApiTokens, $2');
  if (withImport === source || withTrait === withImport) return false;
  fs.writeFileSync(userModel, withTrait);
  return true;
}

function write(file, contents) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, contents);
}

function writeRootFiles(root, { name, title, pm, admin }) {
  write(path.join(root, 'package.json'), `${JSON.stringify({
    name,
    version: '0.1.0',
    private: true,
    type: 'module',
    scripts: {
      dev: 'php nevela dev',
      nevela: 'php nevela',
      'dev:api': 'cd apps/api && php artisan serve',
      'dev:web': `cd apps/web && ${pm} run dev`,
    },
  }, null, 2)}\n`);

  write(path.join(root, '.gitignore'), 'node_modules/\nvendor/\n.env\n.env.*\n!.env.example\n.next/\n*.tsbuildinfo\nnext-env.d.ts\n');

  write(path.join(root, 'README.md'), `# ${title}

A [Nevela](${DOCS}) app: a Laravel API in \`apps/api\` and a Next.js dashboard in \`apps/web\`.

## Run it

\`\`\`sh
php nevela dev
\`\`\`

That starts the Laravel API and the dashboard together and prints where each is: normally http://127.0.0.1:8000 and http://localhost:3000. If another program already has a port, it uses the next free one. Sign in at http://localhost:3000/sign-in.

To check the app at any time (versions, migrations, users, and whether the dashboard is reaching this API):

\`\`\`sh
php nevela status
\`\`\`
${admin ? `
The app starts with one account, in your local database only:

| | |
|---|---|
| Email | \`${admin.email}\` |
| Password | \`${admin.password}\` |
` : ''}
Everything else runs from this folder too, with \`php nevela\`:

\`\`\`sh
php nevela user        # add someone who can sign in
php nevela status      # versions, migrations, users, and what the dashboard is talking to
php nevela update      # update Nevela and the dashboard
php nevela             # everything it can do
\`\`\`

## Add a resource

\`\`\`sh
php nevela resource Product --fields="name:string, sku:string!, price:money, notes:text?"
\`\`\`

That creates the table as well. Reload the dashboard: Products is in the sidebar. Fill it with \`php nevela seed Product\`.

## Before real use

Every policy in \`apps/api/app/Policies\` starts by allowing any signed-in user. Write your rules there.

Docs: ${DOCS}
`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  console.log(`\n  ${indigo(bold('Nevela'))} ${dim(`v${VERSION}`)}\n`);

  // A package manager may serve an older installer than the newest one: pnpm holds back
  // versions published in the last day, and both pnpm and npm cache. Say so, with the fix.
  const newer = await newerVersion();
  const outdated = newer
    ? `  ${red('!')} create-nevela ${bold(newer)} is out, and this is ${VERSION}. To use it: ${bold(`pnpm create nevela@${newer} ${options.name ?? 'my-app'}`)}\n`
    : null;
  if (outdated) console.log(outdated);

  let name = options.name;
  if (!name) {
    // The only question this ever asks, and only when the name was left off.
    if (options.yes || !process.stdin.isTTY) fail('Give the app a name: pnpm create nevela my-app');
    const prompt = readline.createInterface({ input: process.stdin, output: process.stdout });
    name = (await prompt.question('  What is the app called? ')).trim();
    prompt.close();
  }
  if (!/^[a-z0-9][a-z0-9-_]*$/.test(name)) {
    fail(`"${name}" can't be used as a name. Use lowercase letters, numbers and dashes, for example my-app.`);
  }

  const root = path.resolve(process.cwd(), name);
  if (fs.existsSync(root) && fs.readdirSync(root).length > 0) fail(`${root} already exists and isn't empty.`);

  checkRequirements();
  const pm = detectPackageManager(options.pm);
  const title = titleCase(name);
  const api = path.join(root, 'apps', 'api');
  const web = path.join(root, 'apps', 'web');
  const began = Date.now();
  fs.mkdirSync(path.join(root, 'apps'), { recursive: true });

  // The dashboard first, so its packages can download while Composer works on Laravel.
  // The two don't touch each other, and Composer is the long part.
  copyWebTemplate(web, { name, title });
  write(path.join(web, '.env.local'), '# Where the Laravel API is, including its prefix.\nNEVELA_API_URL=http://127.0.0.1:8000/api\n');
  if (pm === 'pnpm') {
    // Its own workspace file: lets sharp build, and keeps pnpm from adopting a workspace further up.
    write(path.join(web, 'pnpm-workspace.yaml'), 'allowBuilds:\n  sharp: true\n');
  }
  // Which dashboard this app started from: `php artisan nevela:update` compares against it
  // to tell the files you changed from the ones you didn't.
  write(path.join(web, '.nevela.json'), `${JSON.stringify({ template: VERSION }, null, 2)}\n`);
  writeRootFiles(root, { name, title, pm, admin: options.user ? ADMIN : null });
  const packages = options.install ? start(pm, ['install'], { cwd: web }) : null;

  await step('Creating the Laravel app', () => {
    run('composer', ['create-project', 'laravel/laravel', 'apps/api', '--no-interaction', '--no-progress', '--prefer-dist'], { cwd: root });
  });

  const tokens = await step('Installing Nevela and token sign-in', async () => {
    const wanted = VERSION.split('.').slice(0, 2).map(Number);
    let nevela = `nevela/laravel:^${wanted.join('.')}`;
    if (options.bundledPackage || !(await onPackagist(wanted))) {
      // No matching release on Packagist (or --bundled-package): the copy that travels with
      // this installer is placed in the app and installed by path.
      copyLaravelPackage(path.join(root, 'packages', 'nevela-laravel'));
      run('composer', ['config', 'repositories.nevela', 'path', '../../packages/nevela-laravel'], { cwd: api });
      nevela = 'nevela/laravel:@dev';
    }
    // One Composer run for both. `php artisan install:api` would add Sanctum in a run of
    // its own, plus a routes/api.php this app doesn't use: Nevela registers its routes itself.
    run('composer', ['require', 'laravel/sanctum', nevela, '--no-interaction', '--no-progress'], { cwd: api });
    run('php', ['artisan', 'vendor:publish', '--tag=sanctum-migrations', '--no-interaction'], { cwd: api });
    return addApiTokens(path.join(api, 'app', 'Models', 'User.php'));
  });

  let admin = false;
  await step('Setting up the database', () => {
    // Writes routes/nevela.php and the dashboard's (empty) resource registry.
    run('php', ['artisan', 'nevela:generate'], { cwd: api });
    run('php', ['artisan', 'migrate', '--force', '--no-interaction'], { cwd: api });
    if (options.user && tokens) {
      admin = run('php', ['artisan', 'nevela:user', `--name=${ADMIN.name}`, `--email=${ADMIN.email}`, `--password=${ADMIN.password}`], { cwd: api, allowFailure: true }).ok;
    }
  });

  let installed = false;
  if (packages) {
    // Usually finished long before Composer; the time shown is how long it took, not how long we waited here.
    installed = (await step(`Installing dashboard packages (${pm})`, () => packages.done)).ok;
  }

  if (options.git && available('git') && !run('git', ['rev-parse', '--is-inside-work-tree'], { cwd: root, allowFailure: true }).ok) {
    run('git', ['init', '--quiet'], { cwd: root, allowFailure: true });
  }

  console.log(`\n  ${green('✔')} ${bold(`Created ${name}`)} ${dim(`in ${duration((Date.now() - began) / 1000)}`)}\n`);
  if (!tokens) {
    console.log(`  ${red('!')} I couldn't add Sanctum's trait to apps/api/app/Models/User.php. Add it by hand:`);
    console.log(`    ${dim('use Laravel\\Sanctum\\HasApiTokens;  and  use HasApiTokens;  inside the class')}\n`);
  }
  if (packages && !installed) {
    console.log(`  ${red('!')} The dashboard's packages didn't install. Run it yourself to see why: cd ${name}/apps/web && ${pm} install\n`);
  }
  console.log('  Next:\n');
  console.log(`    cd ${name}`);
  if (!options.install) console.log(`    cd apps/web && ${pm} install && cd ../..`);
  if (!admin) console.log(`    php nevela user   ${dim('# someone to sign in as')}`);
  console.log('    php nevela dev\n');
  console.log(`  Then open ${indigo('http://localhost:3000/sign-in')}${admin ? ' and sign in with:' : ''}`);
  if (admin) {
    console.log(`\n    Email      ${bold(ADMIN.email)}`);
    console.log(`    Password   ${bold(ADMIN.password)}\n`);
    console.log(`  ${dim('That account is in this app\'s local database only. Add your own: php nevela user')}`);
  }
  console.log(`\n  Add your first resource: ${dim('php nevela resource Product --fields="name:string, price:money"')}`);
  console.log(`  Check the app any time: ${dim('php nevela status')}   Everything else: ${dim('php nevela')}`);
  console.log(`  Docs: ${DOCS}/start/quickstart/\n`);
  if (outdated) console.log(outdated);
}

main().catch((error) => fail(error?.message ?? String(error)));
