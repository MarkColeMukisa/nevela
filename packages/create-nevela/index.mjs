#!/usr/bin/env node
// Create a new Nevela app: a Laravel API and a Next.js dashboard, side by side.
//
//   pnpm create nevela my-app
//   npm create nevela@latest my-app
//
// No dependencies on purpose: this runs before anything is installed.

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import { copyLaravelPackage, copyWebTemplate } from './template.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const VERSION = JSON.parse(fs.readFileSync(path.join(here, 'package.json'), 'utf8')).version;
const DOCS = 'https://nevela-docs.vercel.app';
const windows = process.platform === 'win32';

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
    --no-user                  Don't ask to create the first user.
    --no-git                   Don't run git init.
    -y, --yes                  Ask nothing; take the defaults.
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
  const quote = (arg) => (/^[\w./:=@^,-]+$/.test(arg) ? arg : `"${arg.replace(/"/g, '\\"')}"`);
  return spawnSync([command, ...args.map(quote)].join(' '), { ...options, shell: true });
}

function available(command, args = ['--version']) {
  const result = spawnCommand(command, args, { stdio: 'pipe', encoding: 'utf8' });
  return result.status === 0 ? `${result.stdout}${result.stderr}` : null;
}

async function step(label, work) {
  const started = Date.now();
  process.stdout.write(`  ${dim('◇')} ${label}…`);
  const result = await work();
  const seconds = (Date.now() - started) / 1000;
  const took = seconds >= 1 ? dim(` (${seconds >= 60 ? `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s` : `${seconds.toFixed(1)}s`})`) : '';
  process.stdout.write(`\r  ${green('✔')} ${label}${took}   \n`);
  return result;
}

function parseArgs(argv) {
  const options = { name: undefined, pm: undefined, install: true, user: true, git: true, yes: false };
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

/** Whether nevela/laravel can be installed from Packagist yet. */
async function onPackagist() {
  try {
    const response = await fetch('https://repo.packagist.org/p2/nevela/laravel.json', { signal: AbortSignal.timeout(8000) });
    return response.ok;
  } catch {
    return false;
  }
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

function writeRootFiles(root, { name, title, pm }) {
  write(path.join(root, 'package.json'), `${JSON.stringify({
    name,
    version: '0.1.0',
    private: true,
    type: 'module',
    scripts: {
      dev: 'node scripts/dev.mjs',
      'dev:api': 'cd apps/api && php artisan serve',
      'dev:web': `cd apps/web && ${pm} run dev`,
    },
  }, null, 2)}\n`);

  write(path.join(root, '.gitignore'), 'node_modules/\nvendor/\n.env\n.env.*\n!.env.example\n.next/\n*.tsbuildinfo\nnext-env.d.ts\n');

  write(path.join(root, 'scripts', 'dev.mjs'), `// Run the Laravel API and the Next.js dashboard together: \`${pm} run dev\`.
import { spawn } from 'node:child_process';

const shell = process.platform === 'win32';
const apps = [
  { name: 'api', colour: 35, command: 'php', args: ['artisan', 'serve'], cwd: 'apps/api' },
  { name: 'web', colour: 36, command: '${pm}', args: ['run', 'dev'], cwd: 'apps/web' },
];

const running = apps.map(({ name, colour, command, args, cwd }) => {
  // One string when going through a shell: Node warns about (and doesn't escape) separate args there.
  const child = shell
    ? spawn([command, ...args].join(' '), { cwd, shell, stdio: ['ignore', 'pipe', 'pipe'] })
    : spawn(command, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
  const prefix = \`\\x1b[\${colour}m\${name}\\x1b[0m │ \`;
  for (const stream of [child.stdout, child.stderr]) {
    let rest = '';
    stream.on('data', (chunk) => {
      const lines = (rest + chunk).split('\\n');
      rest = lines.pop();
      for (const line of lines) console.log(prefix + line);
    });
  }
  child.on('exit', (code) => {
    console.log(\`\${prefix}stopped\${code ? \` (exit \${code})\` : ''}\`);
    stop();
  });
  return child;
});

let stopping = false;
function stop() {
  if (stopping) return;
  stopping = true;
  for (const child of running) {
    // On Windows the child is a shell; killing it alone would leave php and node running.
    if (shell && child.pid) spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    else child.kill();
  }
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
`);

  write(path.join(root, 'README.md'), `# ${title}

A [Nevela](${DOCS}) app: a Laravel API in \`apps/api\` and a Next.js dashboard in \`apps/web\`.

## Run it

\`\`\`sh
${pm} run dev
\`\`\`

That starts Laravel on http://127.0.0.1:8000 and the dashboard on http://localhost:3000. Sign in at http://localhost:3000/sign-in.

To create someone who can sign in:

\`\`\`sh
cd apps/api
php artisan nevela:user
\`\`\`

## Add a resource

\`\`\`sh
cd apps/api
php artisan nevela:resource Product --fields="name:string, sku:string!, price:money, notes:text?"
php artisan migrate
\`\`\`

Reload the dashboard: Products is in the sidebar. Fill it with \`php artisan nevela:seed Product\`.

## Before real use

Every policy in \`apps/api/app/Policies\` starts by allowing any signed-in user. Write your rules there.

Docs: ${DOCS}
`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  console.log(`\n  ${indigo(bold('Nevela'))} ${dim(`v${VERSION}`)}\n`);

  let name = options.name;
  const interactive = !options.yes && process.stdin.isTTY;
  const prompt = interactive ? readline.createInterface({ input: process.stdin, output: process.stdout }) : null;
  if (!name) {
    if (!prompt) fail('Give the app a name: pnpm create nevela my-app');
    name = (await prompt.question('  What is the app called? ')).trim();
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
  fs.mkdirSync(path.join(root, 'apps'), { recursive: true });

  await step('Creating the Laravel app', () => {
    run('composer', ['create-project', 'laravel/laravel', 'apps/api', '--no-interaction', '--no-progress', '--prefer-dist'], { cwd: root });
  });

  const tokens = await step('Adding token sign-in (Sanctum)', () => {
    run('php', ['artisan', 'install:api', '--no-interaction'], { cwd: api });
    return addApiTokens(path.join(api, 'app', 'Models', 'User.php'));
  });

  await step('Installing Nevela', async () => {
    if (await onPackagist()) {
      run('composer', ['require', `nevela/laravel:^${VERSION.split('.').slice(0, 2).join('.')}`, '--no-interaction', '--no-progress'], { cwd: api });
    } else {
      // Not published yet: the package travels with this installer and is installed by path.
      copyLaravelPackage(path.join(root, 'packages', 'nevela-laravel'));
      run('composer', ['config', 'repositories.nevela', 'path', '../../packages/nevela-laravel'], { cwd: api });
      run('composer', ['require', 'nevela/laravel:@dev', '--no-interaction', '--no-progress'], { cwd: api });
    }
  });

  await step('Adding the dashboard', () => {
    copyWebTemplate(web, { name, title });
    write(path.join(web, '.env.local'), '# Where the Laravel API is, including its prefix.\nNEVELA_API_URL=http://127.0.0.1:8000/api\n');
    if (pm === 'pnpm') {
      // Its own workspace file: lets sharp build, and keeps pnpm from adopting a workspace further up.
      write(path.join(web, 'pnpm-workspace.yaml'), 'allowBuilds:\n  sharp: true\n');
    }
    writeRootFiles(root, { name, title, pm });
    // Writes routes/nevela.php and the dashboard's (empty) resource registry.
    run('php', ['artisan', 'nevela:generate'], { cwd: api });
    run('php', ['artisan', 'migrate', '--force', '--no-interaction'], { cwd: api });
  });

  if (options.install) {
    await step(`Installing the dashboard's dependencies with ${pm}`, () => {
      run(pm, ['install'], { cwd: web });
    });
  }

  if (options.git && available('git') && !run('git', ['rev-parse', '--is-inside-work-tree'], { cwd: root, allowFailure: true }).ok) {
    run('git', ['init', '--quiet'], { cwd: root, allowFailure: true });
  }

  let userCreated = false;
  if (options.user && prompt) {
    const answer = (await prompt.question(`\n  Create a user to sign in with now? ${dim('(Y/n)')} `)).trim().toLowerCase();
    prompt.close();
    if (answer === '' || answer === 'y' || answer === 'yes') {
      console.log('');
      userCreated = run('php', ['artisan', 'nevela:user'], { cwd: api, interactive: true, allowFailure: true }).ok;
    }
  } else {
    prompt?.close();
  }

  console.log(`\n  ${green('✔')} ${bold(`Created ${name}`)}\n`);
  if (!tokens) {
    console.log(`  ${red('!')} I couldn't add Sanctum's trait to apps/api/app/Models/User.php. Add it by hand:`);
    console.log(`    ${dim('use Laravel\\Sanctum\\HasApiTokens;  and  use HasApiTokens;  inside the class')}\n`);
  }
  console.log('  Next:\n');
  console.log(`    cd ${name}`);
  if (!options.install) console.log(`    cd apps/web && ${pm} install && cd ../..`);
  if (!userCreated) console.log(`    cd apps/api && php artisan nevela:user && cd ../..   ${dim('# someone to sign in as')}`);
  console.log(`    ${pm} run dev\n`);
  console.log(`  Then open ${indigo('http://localhost:3000/sign-in')}`);
  console.log(`  Add your first resource: ${dim('cd apps/api && php artisan nevela:resource Product --fields="name:string, price:money"')}`);
  console.log(`  Docs: ${DOCS}/start/quickstart/\n`);
}

main().catch((error) => fail(error?.message ?? String(error)));
