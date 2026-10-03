// Deciding where a new app gets nevela/laravel from.

/** Whether `candidate` is a stable release Composer's `^major.minor` would accept. */
export function satisfiesCaret(candidate, [major, minor]) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(candidate);
  if (!match) return false;
  const [theirMajor, theirMinor] = match.slice(1).map(Number);
  // Below 1.0 a caret holds the minor version too: ^0.1 means 0.1.x only.
  return major === 0 ? theirMajor === 0 && theirMinor === minor : theirMajor === major && theirMinor >= minor;
}

/**
 * Whether Packagist has a release of nevela/laravel that goes with this installer. Being
 * listed isn't enough: with no tagged release yet, `composer require` would fail.
 */
export async function onPackagist(wanted) {
  try {
    const response = await fetch('https://repo.packagist.org/p2/nevela/laravel.json', { signal: AbortSignal.timeout(8000) });
    if (!response.ok) return false;
    const releases = (await response.json()).packages?.['nevela/laravel'] ?? [];
    return releases.some((release) => satisfiesCaret(release.version, wanted));
  } catch {
    return false;
  }
}
