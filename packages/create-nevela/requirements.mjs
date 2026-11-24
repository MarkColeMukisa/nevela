// What a Nevela app needs on the computer, in one place: the installer checks it before
// creating an app, and `nevela upgrade` before moving an app to a release that needs more.

/** Nevela runs on the latest PHP. A new app's composer.json asks for it too. */
export const PHP_MINIMUM = [8, 5];

/** "8.5", for messages and for composer.json's `^8.5`. */
export const PHP_LINE = PHP_MINIMUM.join('.');

/**
 * The PHP version in `php -v`'s answer ("PHP 8.5.12 (cli) …"), as [major, minor], or null when
 * it can't be read.
 */
export function phpVersionOf(output) {
  const found = /PHP (\d+)\.(\d+)/.exec(output ?? '');
  return found ? [Number(found[1]), Number(found[2])] : null;
}

/** Whether a [major, minor] is at least the minimum. */
export function phpIsRecentEnough(version) {
  if (!version) return false;
  const [major, minor] = version;
  return major > PHP_MINIMUM[0] || (major === PHP_MINIMUM[0] && minor >= PHP_MINIMUM[1]);
}
