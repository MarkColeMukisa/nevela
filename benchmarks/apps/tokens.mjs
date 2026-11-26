// The sign-in tokens run.sh hands k6, for the contenders that aren't Laravel.
//
//   node apps/tokens.mjs grit < login-answer.json    Grit's access token, from its sign-in's answer
//   node apps/tokens.mjs bun <secret>                a JWT (HS256) Bun, Rust and Next.js check, a day long
import crypto from 'node:crypto';

const [kind, secret] = process.argv.slice(2);

if (kind === 'grit') {
  let text = '';
  process.stdin.on('data', (chunk) => (text += chunk)).on('end', () => {
    const token = JSON.parse(text)?.data?.tokens?.access_token;
    if (!token) {
      console.error(`Grit's sign-in answered without a token: ${text.slice(0, 300)}`);
      process.exit(1);
    }
    process.stdout.write(token);
  });
} else if (kind === 'bun' && secret) {
  const part = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const body = `${part({ alg: 'HS256', typ: 'JWT' })}.${part({ sub: 'bench', exp: Math.floor(Date.now() / 1000) + 86400 })}`;
  process.stdout.write(`${body}.${crypto.createHmac('sha256', secret).update(body).digest('base64url')}`);
} else {
  console.error('usage: node apps/tokens.mjs grit < answer.json | node apps/tokens.mjs bun <secret>');
  process.exit(2);
}
