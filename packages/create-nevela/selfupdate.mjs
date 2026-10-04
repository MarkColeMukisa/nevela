// Always run the newest installer, whatever version the package manager handed over.
//
// pnpm skips versions published in the last few hours, and both pnpm and npm cache what
// `create` resolved to. Left alone, `pnpm create nevela` runs a stale installer for a while
// after every release. So the first thing any installer does is ask npm what the newest
// version is, and if that isn't this one, download it and hand over.

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { isNewer } from './packagist.mjs';

const REGISTRY = 'https://registry.npmjs.org/create-nevela';

/** The newest create-nevela on npm, or null when npm couldn't be asked. Never throws. */
export async function latestVersion() {
  try {
    const response = await fetch(`${REGISTRY}/latest`, { signal: AbortSignal.timeout(4000) });
    const latest = (await response.json()).version;
    return typeof latest === 'string' && /^\d+\.\d+\.\d+$/.test(latest) ? latest : null;
  } catch {
    return null;
  }
}

/**
 * The newest create-nevela on npm when it is newer than `current`, else null. Never throws.
 * Null also when npm couldn't be asked: callers that only want to run the newest carry on
 * with what they have.
 */
export async function newerVersion(current) {
  const latest = await latestVersion();
  return latest !== null && isNewer(latest, current) ? latest : null;
}

/**
 * Unpack a .tar (already gunzipped) into `dir`. Enough of the format for an npm tarball:
 * regular files and directories, with the long-name extensions npm uses.
 */
export function untar(buffer, dir) {
  const text = (start, length) => buffer.toString('utf8', start, start + length).replace(/\0.*$/s, '');
  let offset = 0;
  let longName = null;
  while (offset + 512 <= buffer.length) {
    const name = text(offset, 100);
    if (name === '') break; // two empty blocks end the archive
    const size = parseInt(text(offset + 124, 12).trim() || '0', 8);
    const type = text(offset + 156, 1) || '0';
    const prefix = text(offset + 345, 155);
    const body = buffer.subarray(offset + 512, offset + 512 + size);
    offset += 512 + Math.ceil(size / 512) * 512;

    if (type === 'x') {
      // pax header: "<length> path=<name>\n"
      const match = /\d+ path=([^\n]*)\n/.exec(body.toString('utf8'));
      if (match) longName = match[1];
      continue;
    }
    if (type === 'L') {
      longName = body.toString('utf8').replace(/\0.*$/s, '');
      continue;
    }
    if (type === 'g') continue;

    const entry = longName ?? (prefix ? `${prefix}/${name}` : name);
    longName = null;
    const target = path.resolve(dir, entry);
    // Nothing in the archive may land outside the folder it is unpacked into.
    if (target !== path.resolve(dir) && !target.startsWith(path.resolve(dir) + path.sep)) continue;
    if (type === '5') fs.mkdirSync(target, { recursive: true });
    else if (type === '0' || type === '') {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, body);
    }
  }
}

/**
 * Download `version` from npm and run it with the same arguments. Returns its exit code,
 * or null when it couldn't be fetched, in which case the caller carries on itself.
 */
export async function runVersion(version, args) {
  const dir = path.join(os.tmpdir(), `create-nevela-${version}-${process.pid}`);
  try {
    const response = await fetch(`${REGISTRY}/-/create-nevela-${version}.tgz`, { signal: AbortSignal.timeout(30000) });
    if (!response.ok) return null;
    untar(zlib.gunzipSync(Buffer.from(await response.arrayBuffer())), dir);
    const entry = path.join(dir, 'package', 'index.mjs');
    if (!fs.existsSync(entry)) return null;

    const result = spawnSync(process.execPath, [entry, ...args], {
      stdio: 'inherit',
      // The newer one must not go looking for a newer one in turn.
      env: { ...process.env, NEVELA_NO_SELF_UPDATE: '1' },
    });
    return result.status ?? 1;
  } catch {
    return null;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
