// What `nevela new` asks after the name: which apps to make, and how mail is sent.
//
// Pure on purpose, so the tests can reach it: index.mjs runs as soon as it is loaded.

/**
 * Which apps a new project has. The API is in every one. The web side is two apps by
 * default, the triple tier: the public site and customer area (apps/web) and the staff's
 * admin (apps/admin), each on its own address.
 */
export const TIERS = {
  web: { label: 'Web', detail: 'a public site with a customer area, a staff admin (Next.js) and the API', site: true, admin: true, mobile: false },
  both: { label: 'Web and mobile', detail: 'the site, the admin, the API and a phone app (Expo)', site: true, admin: true, mobile: true },
  mobile: { label: 'Mobile', detail: 'the API and a phone app (Expo), with no web apps', site: false, admin: false, mobile: true },
  admin: { label: 'Admin only', detail: 'the API and a staff admin, for an internal tool with no public site', site: false, admin: true, mobile: false },
};

/** How the app sends email once it is on a server. Resend first: Laravel has a driver for it. */
export const MAILERS = {
  resend: { label: 'Resend', detail: 'resend.com: an API key, and Laravel has a driver for it' },
  brevo: { label: 'Brevo', detail: 'brevo.com, over SMTP: a login and an SMTP key' },
  smtp: { label: 'SMTP', detail: 'any other provider, by host, port, user and password' },
};

/** Why `value` isn't one of `choices` for `--flag`, or null when it is. */
export function choiceProblem(flag, value, choices) {
  if (value === undefined) return null;
  return Object.hasOwn(choices, value) ? null : `--${flag} must be one of: ${Object.keys(choices).join(', ')}. You gave "${value}".`;
}

/**
 * The tier and the mailer: as given by a flag, else as answered, else the first. `ask` is
 * only called when there is someone to ask, and for what wasn't given.
 *
 * @param {{ tier?: string, mail?: string, mobile?: boolean }} given
 * @param {null | ((question: string, choices: object) => Promise<string>)} ask
 */
export async function decide(given, ask) {
  // --mobile from before there were tiers: a phone app beside the dashboard.
  let tier = given.tier ?? (given.mobile ? 'both' : undefined);
  if (tier === undefined) tier = ask ? await ask('Which apps should it have?', TIERS) : 'web';
  const mail = given.mail ?? (ask ? await ask('How should it send email once it is on a server?', MAILERS) : 'resend');
  return { tier, mail };
}

/** `text` with KEY=value in place of KEY's line, or added at the end when it has none. */
export function setEnv(text, key, value) {
  const line = `${key}=${value}`;
  const pattern = new RegExp(`^${key}=.*$`, 'm');
  if (pattern.test(text)) return text.replace(pattern, line);
  return `${text.replace(/\n*$/, '\n')}${line}\n`;
}

/** The keys each mailer needs, blank for the developer to fill in. */
const KEYS = {
  resend: [['RESEND_API_KEY', '']],
  brevo: [['MAIL_HOST', 'smtp-relay.brevo.com'], ['MAIL_PORT', '587'], ['MAIL_USERNAME', ''], ['MAIL_PASSWORD', '']],
  smtp: [['MAIL_HOST', ''], ['MAIL_PORT', '587'], ['MAIL_USERNAME', ''], ['MAIL_PASSWORD', '']],
};

/**
 * An .env with the mailer chosen. On a server (`.env.example`, what a server's settings
 * start from) MAIL_MAILER names it. On this computer emails stay in the log, so signing up
 * works before there is a key: the codes are printed by `nevela dev` as well.
 */
export function withMail(text, mail, { server }) {
  const mailer = mail === 'resend' ? 'resend' : 'smtp';
  let out = setEnv(text, 'MAIL_MAILER', server ? mailer : 'log');
  // Laravel's own placeholder for a mail catcher on this computer: a real provider's comes in its place.
  if (mail !== 'resend') out = setEnv(setEnv(out, 'MAIL_USERNAME', ''), 'MAIL_PASSWORD', '');
  const extra = [];
  for (const [key, value] of KEYS[mail]) {
    if (new RegExp(`^${key}=`, 'm').test(out)) out = setEnv(out, key, value);
    else extra.push(`${key}=${value}`);
  }
  const how = {
    resend: 'Resend, with an API key from https://resend.com/api-keys',
    brevo: "Brevo, with the SMTP login and key from Brevo's SMTP & API settings",
    smtp: "SMTP, with your provider's host, port, user and password",
  }[mail];
  const note = server
    ? `# Mail is sent through ${how}. Set the values in the server's environment, never in this file: it is committed.`
    : `# On a server, mail is sent through ${how}. Here emails go to storage/logs/laravel.log; set MAIL_MAILER=${mailer} to send them.`;
  return `${out.replace(/\n*$/, '\n')}\n${note}\n${extra.map((line) => `${line}\n`).join('')}`;
}

/**
 * The package manager a new app installs with, when --pm doesn't say: the one the installer was
 * run through if that was pnpm, yarn or bun (`pnpm create nevela`); else Bun where it is
 * installed, which installs several times faster; else npm. Through npx the agent says npm,
 * which is only the way the installer was reached, so Bun still comes first then.
 *
 * @param {string | undefined} userAgent  npm_config_user_agent: "pnpm/10.1.0 npm/? node/v22…"
 * @param {(command: string) => boolean} has  whether a command is installed
 */
export function defaultPackageManager(userAgent, has) {
  const agent = (userAgent ?? '').split('/')[0];
  if (['pnpm', 'yarn', 'bun'].includes(agent)) return agent;
  return has('bun') ? 'bun' : 'npm';
}

/** A command a package brings ("expo start"), run the package manager's way: bunx, pnpm exec, yarn or npx. */
export function runBin(pm, command) {
  return { bun: `bunx ${command}`, pnpm: `pnpm exec ${command}`, yarn: `yarn ${command}` }[pm] ?? `npx ${command}`;
}
