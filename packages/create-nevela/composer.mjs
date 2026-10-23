/**
 * When a `composer install` that failed is worth running again.
 *
 * On Windows the first files Composer writes into a new vendor folder can be refused
 * ("could not be written … Permission denied"), most likely while antivirus looks at
 * them. The same install a moment later goes through, and so does a dropped download.
 * A real problem, a version that can't be had or a PHP extension that is missing, fails
 * the same way every time, so it is reported at once.
 */

/** How many times the install is tried in all. */
export const ATTEMPTS = 3;

const PASSING = [
  /could not be written to/i,
  /Permission denied/i,
  /Failed to download [^\s]+ from dist/i,
  /curl error \d+/i,
  /Connection (timed out|reset|refused)/i,
  /Could not resolve host/i,
  /SSL connection|SSL_ERROR_SYSCALL/i,
  /is not a valid zip archive|The archive may contain|Failed to extract/i,
  /checksum/i,
  /The process .* exceeded the timeout/i,
];

// Checked first: a download that failed for one of these fails the same way again.
const LASTING = [
  // A certificate PHP can't check: the CA setup needs fixing, and Composer's own message says how.
  /curl error 60\b|SSL certificate problem|certificate verify failed|unable to get local issuer certificate/i,
  /Your requirements could not be resolved/i,
  /requires (php|ext-)/i,
  /could not find (a matching version|package)/i,
  /composer\.json" (does not contain valid JSON|is invalid)/i,
];

/** Whether Composer's output says it failed for a reason that passes. */
export function worthRetrying(output) {
  const text = String(output ?? '');
  if (LASTING.some((pattern) => pattern.test(text))) return false;
  return PASSING.some((pattern) => pattern.test(text));
}
