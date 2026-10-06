import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';
import { banner, ROWS, TAGLINE, WIDTH } from './banner.mjs';
import { get } from './net.mjs';
import { artisanArguments, COMMANDS, findProject, repairManifest, repairScripts } from './project.mjs';
import { untar } from './selfupdate.mjs';
import { quote } from './shell.mjs';
import { copiesOnPath, globalInstall, removeCommand } from './tool.mjs';

const scratch = () => fs.mkdtempSync(path.join(os.tmpdir(), 'nevela-test-'));

test('the installed nevela command knows how it was installed, and a fetched one knows it was not', () => {
  const installed = {
    'C:\\Users\\ada\\AppData\\Roaming\\npm\\node_modules\\create-nevela': 'npm',
    '/usr/local/lib/node_modules/create-nevela': 'npm',
    '/home/ada/.nvm/versions/node/v22.4.0/lib/node_modules/create-nevela': 'npm',
    'C:\\Users\\ada\\AppData\\Local\\pnpm\\global\\5\\.pnpm\\create-nevela@0.3.0\\node_modules\\create-nevela': 'pnpm',
    '/home/ada/.local/share/pnpm/global/5/.pnpm/create-nevela@0.3.0/node_modules/create-nevela': 'pnpm',
    '/home/ada/.bun/install/global/node_modules/create-nevela': 'bun',
    '/home/ada/.config/yarn/global/node_modules/create-nevela': 'yarn',
    'C:\\Users\\ada\\AppData\\Local\\Yarn\\Data\\global\\node_modules\\create-nevela': 'yarn',
  };
  const noProjectHere = () => false;
  for (const [dir, manager] of Object.entries(installed)) {
    const install = globalInstall(dir, noProjectHere);
    assert.equal(install?.manager, manager, dir);
    assert.equal(install.command.at(-1), 'create-nevela@latest');
  }
  assert.deepEqual(globalInstall('/usr/local/lib/node_modules/create-nevela', noProjectHere).command, ['npm', 'install', '-g', 'create-nevela@latest']);

  // Fetched for one run, or the repository itself: nothing installed to update.
  for (const dir of [
    'C:\\Users\\ada\\AppData\\Local\\npm-cache\\_npx\\3f2a9c\\node_modules\\create-nevela',
    '/home/ada/.npm/_npx/3f2a9c/node_modules/create-nevela',
    '/home/ada/.cache/pnpm/dlx/abc123/node_modules/.pnpm/create-nevela@0.3.0/node_modules/create-nevela',
    'C:\\Users\\ada\\AppData\\Local\\pnpm-cache\\dlx-1234\\node_modules\\create-nevela',
    'C:\\Users\\ada\\AppData\\Local\\Temp\\create-nevela-0.3.0-4242\\package',
    '/tmp/create-nevela-0.3.0-4242/package',
    'D:\\nevela\\packages\\create-nevela',
  ]) {
    assert.equal(globalInstall(dir, noProjectHere), null, dir);
  }

  // A copy in a project's own node_modules is not the global command: updating the global
  // one would not change the copy that is running.
  const projects = ['/home/ada/shop/package.json', 'C:/Users/ada/shop/package.json'];
  const inAProject = (file) => projects.includes(file);
  assert.equal(globalInstall('/home/ada/shop/node_modules/create-nevela', inAProject), null);
  assert.equal(globalInstall('C:\\Users\\ada\\shop\\node_modules\\create-nevela', inAProject), null);
  // pnpm's store inside a project, and a dependency of a dependency.
  assert.equal(globalInstall('/home/ada/shop/node_modules/.pnpm/create-nevela@0.3.0/node_modules/create-nevela', noProjectHere), null);
  assert.equal(globalInstall('/usr/local/lib/node_modules/some-tool/node_modules/create-nevela', noProjectHere), null);
});

test('the name is drawn large in a terminal, in colours it can show, and plainly anywhere else', () => {
  // Six rows of one width, or the letters lean.
  assert.equal(ROWS.length, 6);
  for (const row of ROWS) assert.equal([...row].length, WIDTH);

  const escapes = (text) => [...text.matchAll(/\x1b\[([0-9;]+)m/g)].map((match) => match[1]).filter((code) => code !== '0');
  const full = banner({ version: '1.2.3', depth: 24, columns: 120 });
  assert.ok(full.includes(ROWS[0]) && full.includes(ROWS[5]) && full.includes(`${TAGLINE} v1.2.3`));
  // A colour to a row: the gradient.
  assert.equal(new Set(escapes(full).filter((code) => code.startsWith('38;2;'))).size, 6);
  // 256 colours, and 16: still drawn, in codes those terminals understand.
  assert.equal(new Set(escapes(banner({ version: '1.2.3', depth: 8, columns: 120 })).filter((code) => code.startsWith('38;5;'))).size, 6);
  assert.deepEqual([...new Set(escapes(banner({ version: '1.2.3', depth: 4, columns: 120 })))], ['94', '95', '2']);
  // A terminal with colour switched off (NO_COLOR): the letters, no codes.
  const plain = banner({ version: '1.2.3', depth: 1, columns: 120 });
  assert.ok(plain.includes(ROWS[2]) && !plain.includes('\x1b'));

  // Into a pipe or a file, in a narrow terminal, or after a handover: one line.
  assert.equal(banner({ version: '1.2.3', depth: 0, columns: 120 }), '\n  Nevela v1.2.3\n');
  for (const small of [banner({ version: '1.2.3', depth: 24, columns: WIDTH + 3 }), banner({ version: '1.2.3', depth: 24, columns: 120, compact: true })]) {
    assert.ok(!small.includes('█') && small.includes('Nevela') && small.includes('v1.2.3'));
  }
});

test('a second copy of the nevela command on the PATH is found, and the same copy is not counted twice', () => {
  const windowsFiles = [
    'C:\\Users\\ada\\AppData\\Local\\pnpm\\bin\\nevela.cmd',
    'C:\\Users\\ada\\AppData\\Roaming\\npm\\nevela.cmd',
    'C:\\Users\\ada\\AppData\\Roaming\\npm\\nevela',
  ];
  const onWindows = { exists: (file) => windowsFiles.includes(file), real: (file) => file, windows: true };
  const path = 'C:\\Windows;"C:\\Users\\ada\\AppData\\Local\\pnpm\\bin";C:\\Users\\ada\\AppData\\Roaming\\npm\\;c:\\users\\ada\\appdata\\roaming\\npm;;';
  assert.deepEqual(copiesOnPath({ Path: path }, onWindows), ['C:\\Users\\ada\\AppData\\Local\\pnpm\\bin', 'C:\\Users\\ada\\AppData\\Roaming\\npm']);
  assert.deepEqual(copiesOnPath({ PATH: 'C:\\Windows;C:\\Users\\ada\\AppData\\Roaming\\npm' }, onWindows), ['C:\\Users\\ada\\AppData\\Roaming\\npm']);
  assert.deepEqual(copiesOnPath({}, onWindows), []);

  // /bin is a link to /usr/bin on most Linux systems: one copy, seen through two names.
  const links = { '/bin/nevela': '/usr/lib/node_modules/create-nevela/nevela.mjs', '/usr/bin/nevela': '/usr/lib/node_modules/create-nevela/nevela.mjs', '/home/ada/.local/share/pnpm/nevela': '/home/ada/.local/share/pnpm/nevela' };
  const onLinux = { exists: (file) => file in links, real: (file) => links[file], windows: false };
  assert.deepEqual(copiesOnPath({ PATH: '/home/ada/.local/share/pnpm:/usr/local/bin:/bin:/usr/bin' }, onLinux), ['/home/ada/.local/share/pnpm', '/bin']);

  assert.equal(removeCommand('C:\\Users\\ada\\AppData\\Local\\pnpm\\bin'), 'pnpm remove -g create-nevela');
  assert.equal(removeCommand('/home/ada/.local/share/pnpm'), 'pnpm remove -g create-nevela');
  assert.equal(removeCommand('C:\\Users\\ada\\AppData\\Roaming\\npm'), 'npm uninstall -g create-nevela');
  assert.equal(removeCommand('/usr/local/bin'), 'npm uninstall -g create-nevela');
  assert.equal(removeCommand('/home/ada/.bun/bin'), 'bun remove -g create-nevela');
  assert.equal(removeCommand('/home/ada/.yarn/bin'), 'yarn global remove create-nevela');
});

test('every file the program is made of is published with it', () => {
  // A file left out of "files" works here and is missing for everyone who installs it.
  const here = path.dirname(fileURLToPath(import.meta.url));
  const manifest = JSON.parse(fs.readFileSync(path.join(here, 'package.json'), 'utf8'));
  const published = new Set(manifest.files);
  const seen = new Set();
  const follow = (file) => {
    if (seen.has(file)) return;
    seen.add(file);
    assert.ok(published.has(file), `${file} is imported but is not in package.json "files"`);
    const source = fs.readFileSync(path.join(here, file), 'utf8');
    for (const match of source.matchAll(/(?:from|import\()\s*'\.\/([^']+)'/g)) follow(match[1]);
  };
  for (const entry of Object.values(manifest.bin)) follow(entry);
  assert.ok(seen.has('banner.mjs') && seen.has('net.mjs') && seen.has('index.mjs'));
});

test('a request that cannot be made is an answer of null, not an error', async () => {
  assert.equal(await get('not a url', 1000), null);
  assert.equal(await get('http://example.com/', 1000), null); // https only
});

test('commands map onto artisan the way the php launcher maps them', () => {
  assert.deepEqual(artisanArguments('upgrade', ['--check']), ['nevela:upgrade', '--check']);
  assert.ok(COMMANDS.includes('upgrade') && !COMMANDS.includes('update'), 'update is the nevela command updating itself, handled before these');
  assert.deepEqual(artisanArguments('update', ['--check']), ['nevela:update', '--check']);
  assert.deepEqual(artisanArguments('resource', ['Product', '--fields=name:string']), ['nevela:resource', 'Product', '--fields=name:string', '--migrate']);
  assert.deepEqual(artisanArguments('resource', ['Product', '--no-migrate']), ['nevela:resource', 'Product']);
  assert.deepEqual(artisanArguments('migrate', ['--force']), ['migrate', '--force']);
  assert.deepEqual(artisanArguments('artisan', ['route:list', '--path=api']), ['route:list', '--path=api']);
});

test('an app is found from any folder inside it', () => {
  const root = scratch();
  fs.mkdirSync(path.join(root, 'apps', 'api'), { recursive: true });
  fs.mkdirSync(path.join(root, 'apps', 'web', 'lib'), { recursive: true });
  fs.writeFileSync(path.join(root, 'apps', 'api', 'artisan'), '');

  assert.equal(findProject(root).root, root);
  assert.equal(findProject(path.join(root, 'apps', 'web', 'lib')).api, path.join(root, 'apps', 'api'));
  assert.equal(findProject(os.tmpdir()), null);
});

test('a version pinned by the Windows bug gets its caret back', () => {
  const manifest = { require: { 'nevela/laravel': '0.1' } };
  const repairs = repairManifest(manifest, '0.1.4');
  assert.equal(manifest.require['nevela/laravel'], '^0.1');
  assert.equal(repairs.length, 1);

  const fine = { require: { 'nevela/laravel': '^0.1' } };
  assert.deepEqual(repairManifest(fine, '0.1.4'), []);
  assert.equal(fine.require['nevela/laravel'], '^0.1');
});

test('a range that stops short of the newest release is moved to the one that has it', () => {
  // Below 1.0, ^0.1 means 0.1.x only: without this an update to 0.2.0 changes nothing.
  const manifest = { require: { 'nevela/laravel': '^0.1' } };
  const repairs = repairManifest(manifest, '0.2.0');
  assert.equal(manifest.require['nevela/laravel'], '^0.2');
  assert.match(repairs[0], /doesn't reach 0\.2\.0/);

  // A caret with a patch number is moved the same way.
  const patched = { require: { 'nevela/laravel': '^0.1.3' } };
  repairManifest(patched, '0.2.1');
  assert.equal(patched.require['nevela/laravel'], '^0.2');

  // Already wide enough (~0.1 reaches every 0.x), or deliberately something else: left alone.
  for (const [before, latest] of [['^0.2', '0.2.3'], ['^1.2', '1.4.0'], ['^0.3', '0.2.9'], ['~0.1', '0.2.0'], ['dev-main', '0.2.0'], ['>=0.1 <0.2', '0.2.0'], ['@dev', '0.2.0']]) {
    const kept = { require: { 'nevela/laravel': before } };
    assert.deepEqual(repairManifest(kept, latest), [], before);
    assert.equal(kept.require['nevela/laravel'], before);
  }
});

test('an app installed from its own packages folder moves to Packagist', () => {
  const manifest = {
    require: { 'nevela/laravel': '@dev' },
    repositories: [{ type: 'path', url: '../../packages/nevela-laravel' }, { type: 'vcs', url: 'https://example.test/other.git' }],
  };
  const repairs = repairManifest(manifest, '0.1.4');
  assert.equal(manifest.require['nevela/laravel'], '^0.1');
  assert.deepEqual(manifest.repositories, [{ type: 'vcs', url: 'https://example.test/other.git' }]);
  assert.match(repairs[0], /Packagist/);

  // With Packagist unreachable there is no version to move to, so nothing is changed.
  const offline = { require: { 'nevela/laravel': '@dev' }, repositories: [{ type: 'path', url: '../../packages/nevela-laravel' }] };
  assert.deepEqual(repairManifest(offline, null), []);
  assert.equal(offline.repositories.length, 1);
});

test('an older app gains the nevela script and a port-safe dev, and nothing else changes', () => {
  const root = scratch();
  const file = path.join(root, 'package.json');
  fs.writeFileSync(file, JSON.stringify({ name: 'shop', scripts: { dev: 'node scripts/dev.mjs', lint: 'eslint .' } }));

  assert.equal(repairScripts(root).length, 2);
  const after = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.deepEqual(after.scripts, { dev: 'php nevela dev', lint: 'eslint .', nevela: 'php nevela' });
  assert.deepEqual(repairScripts(root), []);

  // A dev script someone wrote themselves is theirs.
  fs.writeFileSync(file, JSON.stringify({ scripts: { dev: 'turbo dev', nevela: 'php nevela' } }));
  assert.deepEqual(repairScripts(root), []);
});

test('arguments survive the Windows shell', () => {
  assert.equal(quote('--force'), '--force');
  assert.equal(quote('nevela/laravel:^0.1'), '"nevela/laravel:^0.1"'); // ^ is cmd.exe's escape character
  assert.equal(quote('--fields=name:string, kind:enum(a|b)!'), '"--fields=name:string, kind:enum(a|b)!"');
});

test('an npm tarball unpacks, long paths included, and nothing escapes the folder', () => {
  const source = scratch();
  const deep = path.join(source, 'package', 'template', 'web', 'app', 'dashboard', 'a-rather-long-folder-name-for-a-resource', '[id]', 'edit');
  fs.mkdirSync(deep, { recursive: true });
  fs.writeFileSync(path.join(source, 'package', 'index.mjs'), 'console.log("hello");\n');
  fs.writeFileSync(path.join(deep, 'a-page-with-a-long-name-too-so-the-path-passes-one-hundred-characters.tsx'), 'export default 1;\n');

  // Relative paths only: GNU tar reads "C:\…" as a remote host.
  execFileSync('tar', ['-cf', 'package.tar', 'package'], { cwd: source });
  const archive = path.join(source, 'package.tar');
  const target = scratch();
  untar(fs.readFileSync(archive), target);

  assert.equal(fs.readFileSync(path.join(target, 'package', 'index.mjs'), 'utf8'), 'console.log("hello");\n');
  const unpacked = path.join(target, path.relative(source, deep), 'a-page-with-a-long-name-too-so-the-path-passes-one-hundred-characters.tsx');
  assert.equal(fs.readFileSync(unpacked, 'utf8'), 'export default 1;\n');

  // The same bytes gzipped, as npm serves them.
  const again = scratch();
  untar(zlib.gunzipSync(zlib.gzipSync(fs.readFileSync(archive))), again);
  assert.ok(fs.existsSync(path.join(again, 'package', 'index.mjs')));
});
