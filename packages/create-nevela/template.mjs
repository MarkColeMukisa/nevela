// Where the new app's files come from.
//
// Published to npm, this package carries a `template/` folder built by build-template.mjs.
// Run from the repository, it reads apps/web and packages/laravel directly, so there is
// one source for the dashboard and nothing to keep in sync by hand.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const bundled = path.join(here, 'template');
// In a checkout the dashboard two folders up is the source, even when a template/ folder
// is lying around from an earlier `npm pack`: that copy may be stale.
const fromRepo = fs.existsSync(path.resolve(here, '..', '..', 'apps', 'web', 'package.json')) || !fs.existsSync(bundled);

/** True when this is a checkout of the repository rather than the package from npm. */
export const fromRepository = fromRepo;

export const sources = {
  web: fromRepo ? path.resolve(here, '..', '..', 'apps', 'web') : path.join(bundled, 'web'),
  laravel: fromRepo ? path.resolve(here, '..', 'laravel') : path.join(bundled, 'laravel'),
  mobile: fromRepo ? path.resolve(here, '..', '..', 'apps', 'mobile') : path.join(bundled, 'mobile'),
};

/** Never part of a new app: build output, installs and local settings. */
const NEVER = new Set(['node_modules', '.next', '.env.local', 'tsconfig.tsbuildinfo', 'next-env.d.ts', 'AGENTS.md', 'CLAUDE.md', 'vendor', '.phpunit.result.cache', '.phpunit.cache', 'composer.lock']);

function copyTree(from, to, skip = () => false, relative = '') {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const inside = relative ? `${relative}/${entry.name}` : entry.name;
    if (NEVER.has(entry.name) || skip(inside, entry)) continue;
    const source = path.join(from, entry.name);
    // npm leaves .gitignore files out of a published package, so the bundled template
    // carries them as _gitignore (see buildTemplate) and they get their name back here.
    const target = path.join(to, entry.name === '_gitignore' ? '.gitignore' : entry.name);
    if (entry.isDirectory()) copyTree(source, target, skip, inside);
    else if (entry.isFile()) fs.copyFileSync(source, target);
  }
}

/**
 * What belongs to the framework repository's own example resources, not to a new app:
 * their descriptors, the registry that lists them, the home page's link to a blog it has not got,
 * and their dashboard pages. A new app's `nevela generate` writes its own.
 */
export function exampleResourceFilter(webRoot) {
  const resources = path.join(webRoot, 'resources');
  const slugs = new Set();
  if (fs.existsSync(resources)) {
    for (const file of fs.readdirSync(resources)) {
      if (!file.endsWith('.resource.ts')) continue;
      const slug = /slug:\s*"([^"]+)"/.exec(fs.readFileSync(path.join(resources, file), 'utf8'));
      if (slug) slugs.add(slug[1]);
    }
  }
  return (inside) =>
    /^resources\/[^/]+\.resource\.ts$/.test(inside)
    || inside === 'resources/index.ts'
    || inside === 'resources/latest-posts.tsx'
    || [...slugs].some((slug) => inside === `app/dashboard/${slug}`);
}

/** The dashboard, without the repository's example resources, named for the new app. */
export function copyWebTemplate(to, { name, title }) {
  copyTree(sources.web, to, exampleResourceFilter(sources.web));

  const packageFile = path.join(to, 'package.json');
  const manifest = JSON.parse(fs.readFileSync(packageFile, 'utf8'));
  manifest.name = `${name}-web`;
  fs.writeFileSync(packageFile, `${JSON.stringify(manifest, null, 2)}\n`);

  const siteFile = path.join(to, 'lib', 'site.ts');
  const site = fs.readFileSync(siteFile, 'utf8')
    .replace('name: "Nevela"', `name: ${JSON.stringify(title)}`)
    .replace('description: "Nevela keeps', `description: "${title.replace(/"/g, '')} keeps`);
  fs.writeFileSync(siteFile, site);

  // The generator fills this in; it has to exist for the first build.
  fs.mkdirSync(path.join(to, 'resources'), { recursive: true });
}

/**
 * A fingerprint of every template file, and the template's dependencies: what the app
 * records in .nevela.json so that `nevela upgrade` can tell, later and exactly, which
 * files the developer changed. The same fingerprint the Laravel package computes: SHA-1
 * with line endings ignored.
 */
export function templateRecord(version) {
  const skip = exampleResourceFilter(sources.web);
  const files = {};
  const walk = (dir, relative = '') => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const inside = relative ? `${relative}/${entry.name}` : entry.name;
      if (NEVER.has(entry.name) || skip(inside, entry)) continue;
      if (entry.isDirectory()) walk(path.join(dir, entry.name), inside);
      else if (entry.isFile()) {
        const bytes = fs.readFileSync(path.join(dir, entry.name)).toString('latin1').replace(/\r\n/g, '\n');
        files[inside.replace(/(^|\/)_gitignore$/, '$1.gitignore')] = crypto.createHash('sha1').update(bytes, 'latin1').digest('hex');
      }
    }
  };
  walk(sources.web);
  const manifest = JSON.parse(fs.readFileSync(path.join(sources.web, 'package.json'), 'utf8'));
  const dependencies = {};
  for (const section of ['dependencies', 'devDependencies']) if (manifest[section]) dependencies[section] = manifest[section];
  return { template: version, files: Object.fromEntries(Object.entries(files).sort(([a], [b]) => a.localeCompare(b))), dependencies };
}

/** Never part of a new mobile app: what Expo builds, and the lock file of whoever installed it here. */
const MOBILE_NEVER = new Set(['.expo', 'dist', 'expo-env.d.ts', 'package-lock.json', 'pnpm-lock.yaml', 'yarn.lock', 'bun.lock', 'ios', 'android']);
const skipMobile = (inside) => MOBILE_NEVER.has(inside.split('/')[0]);

/**
 * What a phone may call the app in a link (nevela://…): lowercase letters, digits and
 * hyphens, starting with a letter. An app name is nearly that already.
 */
export function mobileScheme(name) {
  const scheme = name.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^[^a-z]+|-+$/g, '');
  return scheme || 'app';
}

/** The Expo app, named for the new app. */
export function copyMobileTemplate(to, { name, title }) {
  copyTree(sources.mobile, to, skipMobile);

  const packageFile = path.join(to, 'package.json');
  const manifest = JSON.parse(fs.readFileSync(packageFile, 'utf8'));
  manifest.name = `${name}-mobile`;
  fs.writeFileSync(packageFile, `${JSON.stringify(manifest, null, 2)}\n`);

  // What the phone shows under the icon, and the name Expo knows the project by.
  const appFile = path.join(to, 'app.json');
  const app = JSON.parse(fs.readFileSync(appFile, 'utf8'));
  app.expo.name = title;
  app.expo.slug = mobileScheme(name);
  app.expo.scheme = mobileScheme(name);
  fs.writeFileSync(appFile, `${JSON.stringify(app, null, 2)}\n`);

  const siteFile = path.join(to, 'src', 'lib', 'site.ts');
  fs.writeFileSync(siteFile, fs.readFileSync(siteFile, 'utf8').replace('name: "Nevela"', `name: ${JSON.stringify(title)}`));
}

/** The Laravel package, for installing by path until it is on Packagist. */
export function copyLaravelPackage(to) {
  copyTree(sources.laravel, to, (inside) => inside === 'tests' || inside === 'phpunit.xml');
}

/** Used by build-template.mjs: the same filtered copies, into this package's template/. */
export function buildTemplate(to) {
  copyTree(sources.web, path.join(to, 'web'), exampleResourceFilter(sources.web));
  copyLaravelPackage(path.join(to, 'laravel'));
  copyTree(sources.mobile, path.join(to, 'mobile'), skipMobile);
  hideGitignores(to);
}

function hideGitignores(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) hideGitignores(full);
    else if (entry.name === '.gitignore') fs.renameSync(full, path.join(dir, '_gitignore'));
  }
}
