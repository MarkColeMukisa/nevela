// `nevela update`: the nevela command updating itself, from any folder.
//
// Two different things get newer, and they have two different commands, as in Grit:
//
//   nevela update     the `nevela` command on this computer
//   nevela upgrade    the app you are in: its Nevela package and its dashboard
//
// Updating the command means asking the package manager that installed it to install the
// latest. Which one that was is read from where this file is running from.

/** The command that installs the latest create-nevela globally, for each package manager. */
const INSTALL = {
  npm: ['npm', 'install', '-g', 'create-nevela@latest'],
  pnpm: ['pnpm', 'add', '-g', 'create-nevela@latest'],
  yarn: ['yarn', 'global', 'add', 'create-nevela@latest'],
  bun: ['bun', 'add', '-g', 'create-nevela@latest'],
};

/**
 * How the running copy was installed, from the folder it is in.
 *
 * Returns the package manager and the command that updates it, or null when this copy
 * isn't an installed one: it was fetched for a single run (npx, pnpm dlx, a self-update),
 * or it is the repository itself. There is nothing to update in those cases.
 */
export function globalInstall(dir) {
  const where = dir.replace(/\\/g, '/').toLowerCase();

  // Fetched for one run and thrown away afterwards.
  if (/\/_npx\/|\/dlx[-/]|\/\.?bunx-|\/xfs-[0-9a-f]+\/|\/create-nevela-\d[^/]*\/package$/.test(where)) return null;
  // Installed, as opposed to checked out: it sits in somebody's node_modules.
  if (!/\/node_modules\/create-nevela$/.test(where)) return null;

  const manager = /\/pnpm\/(global|store)\/|\/\.pnpm\//.test(where) ? 'pnpm'
    : /\/\.bun\/install\/global\//.test(where) ? 'bun'
      : /\/yarn\/(data\/)?global\/|\/\.config\/yarn\/global\//.test(where) ? 'yarn'
        : 'npm';
  return { manager, command: INSTALL[manager] };
}

/** What to type to get the `nevela` command, for someone who doesn't have it yet. */
export const INSTALL_COMMAND = INSTALL.npm.join(' ').replace('@latest', '');
