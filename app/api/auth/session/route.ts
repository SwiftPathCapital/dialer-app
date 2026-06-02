import { NextRequest, NextResponse } from 'next/server'

const COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
  maxAge: 8 * 60 * 60, // 8 hours — matches localStorage expiry
}

// Called by the login page after successful Supabase auth to set HttpOnly session cookies
// that the middleware can read for route protection.
export async function POST(req: NextRequest) {
  const { access_token, role } = await req.json()
  if (!access_token) return NextResponse.json({ error: 'Missing access_token' }, { status: 400 })

  const res = NextResponse.json({ ok: true })
  res.cookies.set('dialer_session', access_token, COOKIE_OPTS)
  res.cookies.set('dialer_role', role || 'agent', COOKIE_OPTS)
  return res
}

// Called on logout to clear session cookies
export async function DELETE() {
  const res = NextResponse.json({ ok: true })
  res.cookies.set('dialer_session', '', { ...COOKIE_OPTS, maxAge: 0 })
  res.cookies.set('dialer_role', '', { ...COOKIE_OPTS, maxAge: 0 })
  return res
}
