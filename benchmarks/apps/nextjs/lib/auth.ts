/*
 * Added for Nevela's rally: every products route asks for a signed-in caller, as Grit's and
 * Nevela's generated routes do. The same check as the Bun and Rust apps: a JWT (HS256) signed
 * with BENCH_JWT_SECRET, not expired. It reads no database.
 */

import { createHmac, timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'

const secret = process.env.BENCH_JWT_SECRET || ''

export function signedIn(req: Request): boolean {
  const header = req.headers.get('authorization') ?? ''
  if (!header.startsWith('Bearer ')) return false
  const [head, body, signature] = header.slice(7).split('.')
  if (!head || !body || !signature) return false
  const expected = createHmac('sha256', secret).update(`${head}.${body}`).digest()
  const given = Buffer.from(signature, 'base64url')
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return false
  try {
    const claims = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
    return typeof claims.exp === 'number' && claims.exp * 1000 > Date.now()
  } catch {
    return false
  }
}

export const unauthorized = () =>
  NextResponse.json({ error: { code: 'UNAUTHORIZED', message: 'Sign in first' } }, { status: 401 })
