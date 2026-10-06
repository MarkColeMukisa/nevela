// Deciding where a new app gets nevela/laravel from.

import { getJson } from './net.mjs';

const RELEASES = 'https://repo.packagist.org/p2/nevela/laravel.json';

/** Whether `candidate` is a stable release Composer's `^major.minor` would accept. */
export function satisfiesCaret(candidate, [major, minor]) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(candidate);
  if (!match) return false;
  const [theirMajor, theirMinor] = match.slice(1).map(Number);
  // Below 1.0 a caret holds the minor version too: ^0.1 means 0.1.x only.
  return major === 0 ? theirMajor === 0 && theirMinor === minor : theirMajor === major && theirMinor >= minor;
}

/** Whether stable version `a` is newer than `b`. Anything that isn't x.y.z is never newer. */
export function isNewer(a, b) {
  const parse = (version) => /^(\d+)\.(\d+)\.(\d+)$/.exec(String(version))?.slice(1).map(Number);
  const [left, right] = [parse(a), parse(b)];
  if (!left || !right) return false;
  for (let i = 0; i < 3; i++) if (left[i] !== right[i]) return left[i] > right[i];
  return false;
}

/**
 * Whether Packagist has a release of nevela/laravel that goes with this installer. Being
 * listed isn't enough: with no tagged release yet, `composer require` would fail.
 */
export async function onPackagist(wanted) {
  const releases = (await getJson(RELEASES, 8000))?.packages?.['nevela/laravel'];
  return Array.isArray(releases) && releases.some((release) => satisfiesCaret(release.version, wanted));
}

/** The newest stable nevela/laravel on Packagist, as "x.y.z", or null when it can't be reached. */
export async function latestRelease() {
  const releases = (await getJson(RELEASES, 8000))?.packages?.['nevela/laravel'];
  if (!Array.isArray(releases)) return null;
  let latest = null;
  for (const release of releases) {
    const version = /^v?(\d+\.\d+\.\d+)$/.exec(String(release?.version))?.[1];
    if (version && (latest === null || isNewer(version, latest))) latest = version;
  }
  return latest;
}
