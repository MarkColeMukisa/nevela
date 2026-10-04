// Running other programs, the same way on every platform.

import { spawnSync } from 'node:child_process';

export const windows = process.platform === 'win32';

// `^` is not in the safe list on purpose: unquoted, cmd.exe treats it as an escape
// character and drops it, which turned the constraint "^0.1" into an exact "0.1".
export const quote = (arg) => (/^[\w./:=@,-]+$/.test(arg) ? arg : `"${arg.replace(/"/g, '\\"')}"`);
export const shellLine = (command, args) => [command, ...args.map(quote)].join(' ');

/**
 * .bat and .cmd shims (composer, pnpm, Herd's php) only resolve through a shell on
 * Windows. That is also why `php` can be "not found" in Git Bash while this still finds
 * it: Git Bash doesn't run php.bat for the bare name, and cmd.exe does. A shell takes one
 * command string, so every argument is quoted here.
 */
export function spawnCommand(command, args, options) {
  if (!windows) return spawnSync(command, args, options);
  return spawnSync(shellLine(command, args), { ...options, shell: true });
}
