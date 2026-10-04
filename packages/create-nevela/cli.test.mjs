import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import zlib from 'node:zlib';
import { artisanArguments, findProject, repairManifest, repairScripts } from './project.mjs';
import { untar } from './selfupdate.mjs';
import { quote } from './shell.mjs';

const scratch = () => fs.mkdtempSync(path.join(os.tmpdir(), 'nevela-test-'));

test('commands map onto artisan the way the php launcher maps them', () => {
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
