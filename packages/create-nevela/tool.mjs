// `nevela update`: the nevela command updating itself, from any folder.
//
// Two different things get newer, and they have two different commands, as in Grit:
//
//   nevela update     the `nevela` command on this computer
//   nevela upgrade    the app you are in: its Nevela package and its dashboard
//
// Updating the command means asking the package manager that installed it to install the
// newest version. Which one that was is read from where this file is running from.

import fs from 'node:fs';

/**
 * The command that installs create-nevela globally, for each package manager.
 *
 * `nevela update` names the exact version it found on npm, not "latest": pnpm holds a
 * version back for a day after it is published, so `pnpm add -g create-nevela@latest`
 * installs yesterday's. Asked for a version by number, it installs that one.
 */
const INSTALL = {
  npm: (version) => ['npm', 'install', '-g', `create-nevela@${version}`],
  pnpm: (version) => ['pnpm', 'add', '-g', `create-nevela@${version}`],
  yarn: (version) => ['yarn', 'global', 'add', `create-nevela@${version}`],
  bun: (version) => ['bun', 'add', '-g', `create-nevela@${version}`],
};

/**
 * How the running copy was installed, from the folder it is in and the folder it was
 * started through.
 *
 * Those two differ under pnpm 11, which keeps the files of every package in its store and
 * leaves a link to them in its global folder. Node reports the store; the command was
 * started through the global folder. Going by the store alone, a pnpm install looked like
 * an npm one, and `nevela update` updated a copy that was not the one running.
 *
 * Returns the package manager and `command(version)`, which updates it, or null when this copy
 * isn't the installed command: it was fetched for a single run (npx, pnpm dlx, a
 * self-update), it is the repository itself, or it is a dependency in some project's own
 * node_modules. Updating the global command would not change the copy that is running in
 * any of those cases.
 *
 * @param {string} dir     The folder this package's files are in
 * @param {(file: string) => boolean} exists  Whether a file exists; replaceable in tests
 * @param {string} startedFrom  The folder it was started through, when that is another
 */
export function globalInstall(dir, exists = fs.existsSync, startedFrom = dir) {
  const tidy = (folder) => folder.replace(/\\/g, '/').replace(/\/+$/, '');
  const plain = tidy(dir);
  const where = plain.toLowerCase();
  const started = tidy(startedFrom).toLowerCase();
  const found = (manager) => ({ manager, command: (version = 'latest') => INSTALL[manager](version) });

  // Fetched for one run and thrown away afterwards.
  if ([where, started].some((folder) => /\/_npx\/|\/dlx[-/]|\/\.?bunx-|\/xfs-[0-9a-f]+\/|\/create-nevela-\d[^/]*\/package$/.test(folder))) return null;
  // Installed, as opposed to checked out: it sits in somebody's node_modules.
  if (!/\/node_modules\/create-nevela$/.test(where)) return null;

  // pnpm, yarn and bun each keep global packages in a folder of their own.
  for (const folder of [started, where]) {
    if (!/\/node_modules\/create-nevela$/.test(folder)) continue;
    if (/\/pnpm\/global\/|\/global\/v?\d+\/([^/]+\/)?node_modules\/create-nevela$/.test(folder)) return found('pnpm');
    if (/\/\.bun\/install\/global\//.test(folder)) return found('bun');
    if (/\/yarn\/(data\/)?global\/|\/\.config\/yarn\/global\//.test(folder)) return found('yarn');
  }
  // In pnpm's store, and not reached through its global folder: a project's dependency.
  if (/\/store\/v?\d+\/links\//.test(where)) return null;

  // npm's global folder is a plain node_modules, like a project's. Two things tell them
  // apart: a project has a package.json beside its node_modules, and a dependency of a
  // dependency (or pnpm's local store) sits in a node_modules inside another.
  if (where.split('/node_modules/').length !== 2) return null;
  const owner = plain.slice(0, where.lastIndexOf('/node_modules/'));
  if (exists(`${owner}/package.json`)) return null;

  return found('npm');
}

/**
 * Every folder on the PATH that holds a nevela command, in the order the shell looks.
 *
 * More than one means it was installed more than once, say with npm and with pnpm. The
 * shell runs the first and never mentions the rest, so updating one of the others changes
 * nothing you can see: `npm install -g create-nevela@latest` succeeds and `nevela` is
 * still the old one.
 *
 * @param {Record<string, string | undefined>} env
 * @param {object} [system]  Replaceable in tests
 */
export function copiesOnPath(env = process.env, { exists = fs.existsSync, real = fs.realpathSync, windows = process.platform === 'win32' } = {}) {
  const names = windows ? ['nevela.cmd', 'nevela.exe', 'nevela.ps1', 'nevela'] : ['nevela'];
  const separator = windows ? '\\' : '/';
  const found = [];
  const seen = new Set();
  for (const entry of String(env.PATH ?? env.Path ?? '').split(windows ? ';' : ':')) {
    const dir = entry.trim().replace(/^"|"$/g, '').replace(/[\\/]+$/, '');
    if (!dir) continue;
    const file = names.map((name) => `${dir}${separator}${name}`).find((candidate) => exists(candidate));
    if (!file) continue;
    // The same folder listed twice, or two names for one folder (/bin and /usr/bin), is one copy.
    let target = file;
    try {
      target = real(file);
    } catch {
      // Left as it is.
    }
    const key = windows ? target.toLowerCase() : target;
    if (seen.has(key)) continue;
    seen.add(key);
    found.push(dir);
  }
  return found;
}

/**
 * What removes the copy whose command is in `dir`, judged by the folder and by the
 * launcher in it: a small script that names the folder the package itself is in.
 */
export function removeCommand(dir, launcher = '') {
  const where = dir.replace(/\\/g, '/').toLowerCase();
  const points = launcher.replace(/\\/g, '/').toLowerCase();
  if (/\/pnpm(\/|$)/.test(where) || /\/global\/v?\d+\/([^/]+\/)?node_modules\/create-nevela\//.test(points)) return 'pnpm remove -g create-nevela';
  if (/\/\.bun\//.test(where)) return 'bun remove -g create-nevela';
  if (/\/yarn\/|\/\.yarn\//.test(where)) return 'yarn global remove create-nevela';
  return 'npm uninstall -g create-nevela';
}

/** What to type to get the `nevela` command, for someone who doesn't have it yet. */
export const INSTALL_COMMAND = 'npm install -g create-nevela';
