#!/usr/bin/env node
// Create a new Nevela app: a Laravel API and a Next.js dashboard, side by side.
//
//   pnpm create nevela my-app
//   npm create nevela@latest my-app
//
// No dependencies on purpose: this runs before anything is installed.

import { spawn, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import { banner } from './banner.mjs';
import { isNewer, latestRelease, onPackagist } from './packagist.mjs';
import { COMMANDS, findProject, forward, upgrade } from './project.mjs';
import { shellLine, spawnCommand, windows } from './shell.mjs';
import { latestVersion, newerVersion, runVersion } from './selfupdate.mjs';
import { copiesOnPath, globalInstall, INSTALL_COMMAND, removeCommand } from './tool.mjs';
import { copyLaravelPackage, copyWebTemplate, fromRepository, templateRecord } from './template.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const VERSION = JSON.parse(fs.readFileSync(path.join(here, 'package.json'), 'utf8')).version;
const DOCS = 'https://nevela-docs.vercel.app';

/**
 * The account every new app starts with, so there is something to sign in as straight
 * away. It is created in the app's local database, never in code or a migration, so it
 * does not follow the app to a server.
 *
 * It is the app's administrator. Ten sample users are made beside it, with the same
 * password: two editors and eight users, so the Users screen, the roles and what each
 * of them is allowed to see have something to show on the first run.
 */
const ADMIN = { name: 'Admin', email: 'admin@example.com', password: 'password' };

/** Bits of colour the terminal has: 24, 8, 4, 1 for none, and 0 when this isn't going to a terminal. */
const depth = process.stdout.isTTY ? process.stdout.getColorDepth() : 0;
const colour = (code) => (text) => (depth > 1 ? `\x1b[${code}m${text}\x1b[0m` : text);
const bold = colour(1);
const dim = colour(2);
const green = colour(32);
const red = colour(31);
// Indigo where there are 256 colours to pick it from; magenta where there are 16.
const indigo = colour(depth >= 8 ? '38;5;99' : '95');

/**
 * Whether `nevela` was typed, as opposed to create-nevela (`pnpm create nevela`). Kept in
 * the environment so a newer installer this one hands over to knows it too.
 */
const startedAsNevela = /^nevela(\.mjs)?$/.test(path.basename(process.argv[1] ?? ''));
const typedNevela = startedAsNevela || process.env.NEVELA_TYPED === 'nevela';
if (typedNevela) process.env.NEVELA_TYPED = 'nevela';

/** The name, large. Once per run: an installer that handed over to a newer one has shown it. */
function showTitle() {
  console.log(banner({ version: VERSION, depth, columns: process.stdout.columns ?? 80, compact: Boolean(process.env.NEVELA_HANDED_OVER) }));
}

const HELP = `  Create a new Nevela app: a Laravel API and a Next.js dashboard.

  ${bold('Get the nevela command')}  (once; everything below is then this short)
    npm install -g create-nevela

  ${bold('Anywhere')}
    nevela new [name] [options]   Create an app. It asks for the name if you leave it off.
                                  Without the command: pnpm create nevela <name>
    nevela update                 Update the nevela command itself to the latest version
    nevela --version              Which version the nevela command is, and this app when in one

  ${bold('Inside an app')}
    nevela upgrade             Bring this app to the latest Nevela: the package and the dashboard
    nevela dev                 Run the API and the dashboard
    nevela status              Check versions, migrations, users and the dashboard
    nevela resource <Name> --fields="…" [--seed]
    nevela seed | user | generate | migrate | artisan <command>

  ${bold('Options')}
    --pm <pnpm|npm|yarn|bun>   Package manager for the dashboard. Default: the one you ran this with.
    --no-install               Don't install the dashboard's dependencies.
    --no-user                  Don't create the starter admin account, or the sample users.
    --no-sample-users          Create the admin only, without the ten sample users.
    --fast                     Leave out PHPUnit, Pint and Laravel's other development packages.
                               About a third quicker. Add them later: cd apps/api && composer install
    --no-git                   Don't run git init.
    --bundled-package          Use the copy of nevela/laravel that ships with this installer
                               instead of the release on Packagist.
    -y, --yes                  Ask nothing. (Only the app name is ever asked for.)
    -h, --help                 Show this.
    -v, --version              Show the version. Piped or captured, the number alone.

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
    if (allowFailure) return { ok: false, output, status: result.status };
    fail(`\`${command} ${args.join(' ')}\` failed.`, output || String(result.error ?? ''));
  }
  return { ok: true, output, status: 0 };
}

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

/**
 * Run a command without blocking, handing each line of its output to `onLine`. For the one
 * long step, so there is something to show while it works. Fails like run() does.
 */
function runLive(command, args, { cwd, onLine }) {
  return new Promise((resolve) => {
    const child = windows
      ? spawn(shellLine(command, args), { cwd, shell: true, stdio: ['ignore', 'pipe', 'pipe'] })
      : spawn(command, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    let rest = '';
    const read = (chunk) => {
      output += chunk;
      const lines = (rest + chunk).split(/\r?\n/);
      rest = lines.pop();
      for (const line of lines) onLine?.(line);
    };
    child.stdout.setEncoding('utf8').on('data', read);
    child.stderr.setEncoding('utf8').on('data', read);
    child.on('error', (error) => fail(`\`${command} ${args.join(' ')}\` failed.`, String(error)));
    child.on('close', (code) => {
      if (code !== 0) fail(`\`${command} ${args.join(' ')}\` failed.`, output);
      resolve(output);
    });
  });
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
  const inPlace = process.stdout.isTTY && label.length + 30 < (process.stdout.columns ?? 80);
  if (inPlace) process.stdout.write(`  ${dim('◇')} ${label}…`);
  // A step may say how far along it is; shown beside the label, rewritten in place.
  const progress = (text) => {
    if (inPlace) process.stdout.write(`\r  ${dim('◇')} ${label}… ${dim(text)}   `);
  };
  const result = await work(progress);
  const seconds = result?.seconds ?? (Date.now() - started) / 1000;
  const took = seconds >= 1 ? dim(` (${duration(seconds)})`) : '';
  process.stdout.write(`${inPlace ? '\r' : ''}  ${green('✔')} ${label}${took}${' '.repeat(24)}\n`);
  return result;
}

function parseArgs(argv) {
  const options = { name: undefined, pm: undefined, install: true, user: true, samples: true, git: true, yes: false, bundledPackage: false, devTools: true };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '-h' || arg === '--help') {
      showTitle();
      console.log(HELP);
      process.exit(0);
    } else if (arg === '-v' || arg === '--version') {
      console.log(VERSION);
      process.exit(0);
    } else if (arg === '-y' || arg === '--yes') options.yes = true;
    else if (arg === '--no-install') options.install = false;
    else if (arg === '--no-user') options.user = false;
    else if (arg === '--no-sample-users') options.samples = false;
    else if (arg === '--no-git') options.git = false;
    else if (arg === '--no-dev-tools' || arg === '--fast') options.devTools = false;
    else if (arg === '--bundled-package') options.bundledPackage = true;
    else if (arg === '--pm') options.pm = argv[++i];
    else if (arg.startsWith('--pm=')) options.pm = arg.slice(5);
    else if (arg.startsWith('-')) fail(`Unknown option ${arg}. Run with --help to see the options.`);
    else if (options.name === undefined) options.name = arg;
    else fail(`Unexpected argument "${arg}". The app name is "${options.name}".`);
  }
  return options;
}

/**
 * Whether typing `php` works in the shell this was started from. In Git Bash it doesn't
 * when PHP is a php.bat (Laravel Herd): bash won't run a .bat for the bare name. Windows'
 * own shells do, and so does this installer, which is why it got this far.
 */
function phpIsTypeable() {
  if (!windows || !process.env.MSYSTEM) return true;
  const found = spawnCommand('where', ['php'], { stdio: 'pipe', encoding: 'utf8' });
  const first = `${found.stdout ?? ''}`.split(/\r?\n/)[0].trim().toLowerCase();
  return first.endsWith('.exe');
}

/** `nevela <command>` as someone should type it here: through PHP, or through the package manager. */
function nevelaCommand(pm) {
  // Typed as `nevela`, so the command is installed, and it is the shortest of the three.
  if (typedNevela) return 'nevela';
  if (phpIsTypeable()) return 'php nevela';
  return { pnpm: 'pnpm nevela', yarn: 'yarn nevela', bun: 'bun run nevela' }[pm] ?? 'npm run nevela';
}

/** "my-shop" → "My Shop", for the dashboard's title. */
const titleCase = (slug) => slug.split(/[-_]+/).filter(Boolean).map((word) => word[0].toUpperCase() + word.slice(1)).join(' ');

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

function writeRootFiles(root, { name, title, pm, admin, samples }) {
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
The app starts with an administrator, in your local database only:

| | |
|---|---|
| Email | \`${admin.email}\` |
| Password | \`${admin.password}\` |
${samples ? `
Ten sample users are there as well, with the same password: two editors and eight users, one of them switched off. They are under **Users** in the dashboard, and what each role may do is under **Roles**. Delete them before real use.
` : ''}` : ''}
Everything else runs from this folder too, with \`php nevela\`:

\`\`\`sh
php nevela user        # add someone who can sign in
php nevela status      # versions, migrations, users, and what the dashboard is talking to
php nevela upgrade     # bring this app to the latest Nevela
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

/** `nevela <command>` inside an existing app. Never returns. */
async function inProject(name, args) {
  const project = findProject(process.cwd());
  if (!project) {
    fail(`"${name}" runs inside a Nevela app, and this folder isn't in one.`, `To create an app:  ${typedNevela ? 'nevela new my-app' : 'pnpm create nevela my-app'}`);
  }
  if (name !== 'upgrade') process.exit(forward(project, name, args));

  // The name first, before anything that waits on the network. A newer installer this
  // one hands over to knows it has been shown, and prints one line in its place.
  showTitle();

  // Upgrading is the one command that must not run on stale code itself: it is the newest
  // installer that knows what an older app needs repaired. So even a nevela command that
  // hasn't been updated in a while upgrades an app correctly.
  if (!process.env.NEVELA_NO_SELF_UPDATE && !fromRepository) {
    const newer = await newerVersion(VERSION);
    if (newer) {
      const status = await runVersion(newer, ['upgrade', ...args]);
      if (status !== null) process.exit(status);
    }
  }
  const before = appVersion(project);
  const looking = args.includes('--check') ? ' (checking only: nothing will be changed)' : '';
  console.log(`  ${indigo(`Nevela upgrade — this app: ${before ? `v${before}` : 'Nevela not installed in it yet'}`)}${dim(looking)}\n`);
  const releases = await latestRelease();
  const status = await upgrade(project, args, { latest: releases, say: (line) => console.log(`  ${green('✔')} ${line}`) });
  // Where it ended up, read from the app itself and not from what was asked for.
  if (status === 0 && !args.includes('--check') && !args.includes('--undo')) {
    const now = appVersion(project);
    if (now) {
      console.log(`\n  ${green(`✔ ${now === before ? `This app is on Nevela v${now}, the version it was on.` : `This app is now on Nevela v${now}.`}`)}\n`);
    }
  }
  process.exit(status);
}

/**
 * How the copy that is running was installed, or null when it isn't the installed command.
 * The folder it was started through is passed as well as the one its files are in: under
 * pnpm 11 only the first says it is pnpm's.
 */
function installed() {
  if (fromRepository) return null;
  const startedFrom = process.argv[1] ? path.dirname(path.resolve(process.argv[1])) : here;
  return globalInstall(here, fs.existsSync, startedFrom);
}

/** What typing `nevela` runs now, as "x.y.z", or null when that can't be found out. */
function versionOnPath() {
  const answer = spawnCommand('nevela', ['--version'], { stdio: 'pipe', encoding: 'utf8' });
  return /^\d+\.\d+\.\d+$/m.exec(`${answer.stdout ?? ''}`)?.[0] ?? null;
}

/** The launcher of the nevela command in `dir`: the file the shell runs. */
const launcherIn = (dir) => path.join(dir, windows ? 'nevela.cmd' : 'nevela');

/** The version of the nevela command in `dir`, as "x.y.z", or null when it won't say. */
function copyVersion(dir) {
  const file = launcherIn(dir);
  const answer = windows
    ? spawnSync(`"${file}" --version`, { shell: true, stdio: 'pipe', encoding: 'utf8' })
    : spawnSync(file, ['--version'], { stdio: 'pipe', encoding: 'utf8' });
  return /^\d+\.\d+\.\d+$/m.exec(`${answer.stdout ?? ''}`)?.[0] ?? null;
}

/**
 * Say so when the nevela command is installed more than once. Only the first on the PATH
 * ever runs, so an update to one of the others looks like an update that did nothing.
 * The one to keep is the newest, which is not always the one that runs.
 */
function otherCopies() {
  const copies = copiesOnPath().map((dir) => ({ dir, version: copyVersion(dir) }));
  if (copies.length < 2) return;
  let keep = copies[0];
  for (const copy of copies) {
    if (copy.version && (!keep.version || isNewer(copy.version, keep.version))) keep = copy;
  }
  const width = Math.max(...copies.map((copy) => copy.dir.length));
  console.log(`\n  ${red('!')} The nevela command is installed ${copies.length} times. Typing ${bold('nevela')} runs the first of these:`);
  for (const copy of copies) console.log(`      ${copy.dir.padEnd(width)}  ${copy.version ? `v${copy.version}` : ''}`);
  console.log(keep === copies[0]
    ? `    Keep that one and remove the rest, so there is one to keep up to date:`
    : `    The one that runs is not the newest. Remove the others, and ${bold(`v${keep.version}`)} is what ${bold('nevela')} runs:`);
  const launcher = (dir) => {
    try {
      return fs.readFileSync(launcherIn(dir), 'utf8').slice(0, 4000);
    } catch {
      return '';
    }
  };
  const removals = new Set(copies.filter((copy) => copy !== keep).map((copy) => removeCommand(copy.dir, launcher(copy.dir))));
  for (const removal of removals) console.log(`      ${bold(removal)}`);
}

/** The version of Nevela an app has installed, read from the package, or null. */
function appVersion(project) {
  try {
    const source = fs.readFileSync(path.join(project.api, 'vendor', 'nevela', 'laravel', 'src', 'Nevela.php'), 'utf8');
    return /const VERSION = '([^']+)'/.exec(source)?.[1] ?? null;
  } catch {
    return null;
  }
}

/**
 * `nevela --version`, from anywhere: the command's version, and the app's when in one.
 * `nevela version` is the same thing by its older name.
 */
function showVersion() {
  const project = findProject(process.cwd());
  const install = installed();
  console.log(`\n  ${indigo(bold('Nevela command'))}   ${bold(`v${VERSION}`)}${install ? `  ${dim(`installed with ${install.manager}`)}` : ''}`);
  if (project) {
    const app = appVersion(project);
    if (app === null) {
      console.log(`  ${indigo(bold('This app'))}         ${dim("Nevela isn't installed in it yet. Run: cd apps/api && composer install")}`);
    } else {
      const behind = isNewer(VERSION, app);
      console.log(`  ${indigo(bold('This app'))}         ${bold(`v${app}`)}${behind ? `  ${dim('To bring it to the latest:')} ${bold('nevela upgrade')}` : ''}`);
    }
  }
  otherCopies();
  console.log('');
}

/**
 * Why `name` can't be the new app's name, or null when it can.
 */
function nameProblem(name) {
  if (name === '') return 'Type a name, for example my-app.';
  if (!/^[a-z0-9][a-z0-9-_]*$/.test(name)) {
    return `"${name}" can't be used as a name. Use lowercase letters, numbers and dashes, for example my-app.`;
  }
  const root = path.resolve(process.cwd(), name);
  if (fs.existsSync(root) && fs.readdirSync(root).length > 0) return `${root} already exists and isn't empty.`;
  return null;
}

/**
 * Ask what the app is called, until the answer is a name that can be used. The only
 * question this ever asks, and only when the name was left off.
 */
async function askName() {
  const prompt = readline.createInterface({ input: process.stdin, output: process.stdout });
  // Ctrl+C or the end of input, at the question: leave, having created nothing.
  const closed = new Promise((resolve) => prompt.once('close', () => resolve(null)));
  prompt.on('SIGINT', () => prompt.close());
  try {
    for (;;) {
      const answer = await Promise.race([prompt.question(`  ${green('What is the name of your app?')} `).catch(() => null), closed]);
      if (answer === null) {
        console.log('\n');
        process.exit(130);
      }
      const problem = nameProblem(answer.trim());
      if (problem === null) return answer.trim();
      console.log(`  ${red('✖')} ${problem}\n`);
    }
  } finally {
    prompt.close();
  }
}

/**
 * `nevela update`, from anywhere: update the nevela command itself.
 *
 * As in Grit, updating the tool and upgrading an app are two commands. This one doesn't
 * touch any app; it ends by saying how to upgrade the one you are in, if you are in one.
 *
 * It returns instead of calling process.exit(): on Windows, exiting in the same moment a
 * fetch() has just finished trips an assertion inside Node and prints a crash.
 */
async function updateTool(args) {
  const project = findProject(process.cwd());
  const install = installed();

  if (!install) {
    // Run through npx or `pnpm dlx`, which fetch the latest every time, started by an
    // older nevela command that fetched this one to do its work, or a copy in a project's
    // own node_modules. There is no installed command to update. Inside an app, "update" used to mean "upgrade this app", and
    // instructions saying so are still around, so that is what it does.
    if (project) {
      console.log(`\n  ${dim(`"update" now updates the nevela command, and an app is brought up to date with "upgrade". Upgrading this app.`)}`);
      await inProject('upgrade', args);
    }
    showTitle();
    console.log(`  The nevela command isn't installed on this computer, so there is nothing to update.`);
    console.log(`  To install it:  ${bold(INSTALL_COMMAND)}`);
    console.log(`  Then, anywhere: ${bold('nevela new my-app')}   and inside an app: ${bold('nevela upgrade')}, ${bold('nevela dev')}\n`);
    return;
  }

  showTitle();
  console.log(`  ${indigo(`Nevela self-update — current: v${VERSION}`)}\n`);
  console.log(`  ${dim('→ Checking npm for the latest release…')}\n`);
  const latest = await latestVersion();
  const newer = latest !== null && isNewer(latest, VERSION) ? latest : null;
  if (latest === null) {
    // Not the same as being up to date, so it isn't reported as that.
    console.log(`  ${red('!')} Couldn't reach npm to see whether there is a newer nevela than ${bold(VERSION)}. Nothing was changed.`);
    console.log(`    Try again when you are online, or run:  ${install.command().join(' ')}`);
    process.exitCode = 1;
  } else if (!newer) {
    console.log(`  ${green(`✔ Already on the latest version (v${VERSION}). Nothing to do.`)}`);
  } else {
    // The version by number, not "latest": pnpm holds "latest" back for a day.
    const [command, ...rest] = install.command(newer);
    console.log(`  Updating v${VERSION} → ${bold(`v${newer}`)} ${dim(`(${[command, ...rest].join(' ')})`)}\n`);
    const result = spawnCommand(command, rest, { stdio: 'inherit' });
    if (result.error || result.status !== 0) {
      fail(`Couldn't update the nevela command.`, `Run it yourself to see why:  ${[command, ...rest].join(' ')}`);
    }
    // The package manager saying so isn't the same as the command being newer: ask it.
    const now = versionOnPath();
    if (now === newer || now === null) {
      console.log(`\n  ${green(`✔ Updated to v${newer}.`)} ${dim('Every nevela command, and every app you create from now on, uses it.')}`);
    } else {
      console.log(`\n  ${red('!')} ${install.manager} installed ${bold(`v${newer}`)}, but typing ${bold('nevela')} still runs ${bold(`v${now}`)}.`);
      if (copiesOnPath().length < 2) {
        console.log(`    Open a new terminal and run ${bold('nevela version')}. If it still says v${now}, the copy that runs was installed another way.`);
      }
      process.exitCode = 1;
    }
  }
  otherCopies();
  if (project) {
    console.log(`  ${dim('This app is not changed by that. To bring it to the latest Nevela:')} ${bold('nevela upgrade')}`);
  }
  console.log('');
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv[0] === 'new') argv.shift();
  else if (argv[0] === 'update') return updateTool(argv.slice(1));
  else if (argv[0] === 'version') return showVersion();
  else if ((argv[0] === '--version' || argv[0] === '-v') && argv.length === 1) {
    // To a person, the whole answer. To a script (and to `nevela update`, which asks
    // this of the installed command to check its work), the number and nothing else.
    if (process.stdout.isTTY) return showVersion();
    console.log(VERSION);
    return;
  }
  else if (COMMANDS.includes(argv[0])) await inProject(argv[0], argv.slice(1));
  else if (argv[0] === 'help' || (startedAsNevela && argv.length === 0)) {
    // `nevela` on its own says what it can do. `pnpm create nevela` on its own starts an
    // app, and so does a newer installer that an older `nevela new` handed over to.
    showTitle();
    console.log(HELP);
    return;
  }
  const options = parseArgs(argv);

  showTitle();

  // A package manager may hand over an older installer than the newest: pnpm skips versions
  // published in the last few hours, and both pnpm and npm cache. Fetch the newest and let
  // it do the work. Skipped when running from the repository, which is always its own version.
  let outdated = null;
  if (!process.env.NEVELA_NO_SELF_UPDATE && !fromRepository) {
    const newer = await newerVersion(VERSION);
    if (newer) {
      console.log(`  ${dim(`Your package manager served ${VERSION}. Fetching ${newer}, the latest…`)}`);
      const status = await runVersion(newer, argv);
      if (status !== null) process.exit(status);
      outdated = `  ${red('!')} Couldn't fetch create-nevela ${bold(newer)}, so this is ${VERSION}. To get it: ${bold(`npm create nevela@latest ${options.name ?? 'my-app'}`)}\n`;
      console.log(outdated);
    }
  }

  let name = options.name;
  if (name === undefined) {
    // Nobody to ask: say what to type instead.
    if (options.yes || !process.stdin.isTTY) fail(`Give the app a name: ${typedNevela ? 'nevela new my-app' : 'pnpm create nevela my-app'}`);
    name = await askName();
    console.log('');
  } else {
    const problem = nameProblem(name);
    if (problem) fail(problem);
  }

  const root = path.resolve(process.cwd(), name);

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
  // Shared by the dashboard and the API, so the API can believe what the dashboard tells it
  // about a person's browser (for the list of devices signed in to an account). Made here,
  // per app, and never the same twice.
  const proxySecret = crypto.randomBytes(24).toString('hex');
  write(
    path.join(web, '.env.local'),
    `# Where the Laravel API is, including its prefix.\nNEVELA_API_URL=http://127.0.0.1:8000/api\n\n# The same value as in apps/api/.env. It lets the API trust this app's word on a visitor's browser.\nNEVELA_PROXY_SECRET=${proxySecret}\n`,
  );
  if (pm === 'pnpm') {
    // Its own workspace file: lets sharp build, and keeps pnpm from adopting a workspace further up.
    write(path.join(web, 'pnpm-workspace.yaml'), 'allowBuilds:\n  sharp: true\n');
  }
  // Which dashboard this app started from, with a fingerprint of every file in it.
  // `nevela upgrade` compares against these to tell the files you changed from the ones
  // you didn't, so an update never overwrites your work.
  write(path.join(web, '.nevela.json'), `${JSON.stringify(templateRecord(VERSION), null, 4)}\n`);
  writeRootFiles(root, { name, title, pm, admin: options.user ? ADMIN : null, samples: options.user && options.samples });
  const packages = options.install ? start(pm, ['install'], { cwd: web }) : null;

  const tokens = await step('Creating the Laravel app', async (progress) => {
    // The skeleton only. Its packages are installed below, once, together with Nevela's.
    run('composer', ['create-project', 'laravel/laravel', 'apps/api', '--no-install', '--no-scripts', '--no-interaction', '--no-progress', '--prefer-dist'], { cwd: root });

    const wanted = VERSION.split('.').slice(0, 2).map(Number);
    let nevela = `^${wanted.join('.')}`;
    const manifestFile = path.join(api, 'composer.json');
    const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
    // Laravel asks Composer for an "optimized" autoloader, which means reading every file
    // of every package to index it. On a fresh install each of those ~9,000 files is being
    // read for the first time, and antivirus software scans each one: that single step
    // took over five minutes on Windows. An app in development doesn't need the index.
    // Production gets it with `composer install --no-dev --optimize-autoloader`.
    manifest.config = { ...manifest.config, 'optimize-autoloader': false };
    if (options.bundledPackage || !(await onPackagist(wanted))) {
      // No matching release on Packagist (or --bundled-package): the copy that travels with
      // this installer is placed in the app and installed by path.
      copyLaravelPackage(path.join(root, 'packages', 'nevela-laravel'));
      manifest.repositories = [...(manifest.repositories ?? []), { type: 'path', url: '../../packages/nevela-laravel' }];
      nevela = '@dev';
    }
    // Sanctum and Nevela go into composer.json here, so the one install below does
    // everything. (`php artisan install:api` would add Sanctum in a Composer run of its own,
    // plus a routes/api.php this app doesn't use: Nevela registers its routes itself.)
    manifest.require = { ...manifest.require, 'laravel/sanctum': '^4.0', 'nevela/laravel': nevela };
    fs.writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 4)}\n`);

    let total = 0;
    let done = 0;
    await runLive('composer', ['install', '--no-interaction', '--no-progress', '--no-scripts', ...(options.devTools ? [] : ['--no-dev'])], {
      cwd: api,
      onLine: (line) => {
        const operations = /Package operations: (\d+) installs?/.exec(line);
        if (operations) total = Number(operations[1]);
        if (/- Installing .*Extracting archive|- Installing .*Symlinking|- Installing .*Junctioning/.test(line)) done++;
        if (total) progress(`${Math.min(done, total)}/${total} packages`);
      },
    });

    // What Composer's create-project scripts would have done, without starting Composer
    // again for each: the .env file, the SQLite database and the app key. The first
    // artisan command is slow for the same reason the index was: files read for the first time.
    const env = path.join(api, '.env');
    if (!fs.existsSync(env) && fs.existsSync(`${env}.example`)) fs.copyFileSync(`${env}.example`, env);
    if (fs.existsSync(env) && !/^NEVELA_PROXY_SECRET=/m.test(fs.readFileSync(env, 'utf8'))) {
      fs.appendFileSync(env, `\n# The same value as in apps/web/.env.local.\nNEVELA_PROXY_SECRET=${proxySecret}\n`);
    }
    const sqlite = path.join(api, 'database', 'database.sqlite');
    if (/^DB_CONNECTION=sqlite\s*$/m.test(fs.readFileSync(env, 'utf8')) && !fs.existsSync(sqlite)) fs.writeFileSync(sqlite, '');
    return addApiTokens(path.join(api, 'app', 'Models', 'User.php'));
  });

  let admin = false;
  let samples = false;
  await step('Setting up the database', () => {
    // One artisan process for the app key, Sanctum's migration, the generated files, the
    // migrations, the starter account and the sample users: each separate call would
    // start Laravel again.
    const account = options.user && tokens ? [`--name=${ADMIN.name}`, `--email=${ADMIN.email}`, `--password=${ADMIN.password}`, ...(options.samples ? [] : ['--no-sample-users'])] : [];
    const setup = run('php', ['artisan', 'nevela:setup', ...account], { cwd: api, allowFailure: true });
    if (setup.ok) {
      admin = account.length > 0;
      samples = admin && options.samples;
      return;
    }
    // 2: the app is set up and only the starter account could not be created.
    if (setup.status === 2) return;
    if (!/"nevela:setup" is not defined/.test(setup.output)) fail('Setting up the database failed.', setup.output);

    // A nevela/laravel from before `nevela:setup` existed: the same steps, one at a time.
    run('php', ['artisan', 'key:generate', '--force', '--no-interaction'], { cwd: api });
    run('php', ['artisan', 'vendor:publish', '--tag=sanctum-migrations', '--no-interaction'], { cwd: api });
    run('php', ['artisan', 'nevela:generate'], { cwd: api });
    run('php', ['artisan', 'migrate', '--force', '--no-interaction'], { cwd: api });
    if (account.length) admin = run('php', ['artisan', 'nevela:user', ...account.filter((arg) => arg !== '--no-sample-users')], { cwd: api, allowFailure: true }).ok;
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
  if (!options.devTools) {
    console.log(`  ${dim('PHPUnit, Pint and the other development packages were left out. Add them: cd apps/api && composer install')}\n`);
  }
  if (packages && !installed) {
    console.log(`  ${red('!')} The dashboard's packages didn't install. Run it yourself to see why: cd ${name}/apps/web && ${pm} install\n`);
  }
  console.log('  Next:\n');
  console.log(`    cd ${name}`);
  if (!options.install) console.log(`    cd apps/web && ${pm} install && cd ../..`);
  const nevela = nevelaCommand(pm);
  if (!admin) console.log(`    ${nevela} user   ${dim('# someone to sign in as')}`);
  console.log(`    ${nevela} dev\n`);
  console.log(`  Then open ${indigo('http://localhost:3000/sign-in')}${admin ? ' and sign in with:' : ''}`);
  if (admin) {
    console.log(`\n    Email      ${bold(ADMIN.email)}`);
    console.log(`    Password   ${bold(ADMIN.password)}\n`);
    console.log(`  ${dim(`That account is the administrator, and is in this app's local database only. Add your own: ${nevela} user`)}`);
    if (samples) {
      console.log(`  ${dim(`Ten sample users are there too, with the same password: 2 editors and 8 users. See them under Users, and what each may do under Roles.`)}`);
    }
  }
  console.log(`\n  Add your first resource: ${dim(`${nevela} resource Product --fields="name:string, price:money"`)}`);
  console.log(`  Check the app: ${dim(`${nevela} status`)}   Upgrade it later: ${dim(`${nevela} upgrade`)}   Everything: ${dim(nevela)}`);
  if (nevela !== 'php nevela' && nevela !== 'nevela') {
    console.log(`\n  ${dim(`In this shell "php" isn't a command (your PHP is php.bat), so use ${nevela}. In PowerShell, php nevela works too.`)}`);
  }
  console.log(`  Docs: ${DOCS}/start/quickstart/\n`);
  if (outdated) console.log(outdated);
}

main().catch((error) => fail(error?.message ?? String(error)));
