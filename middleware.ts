import { NextRequest, NextResponse } from 'next/server'

// Paths accessible without a session cookie
const PUBLIC_PREFIXES = ['/login', '/api/webhooks', '/api/auth', '/_next', '/favicon']

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  if (PUBLIC_PREFIXES.some(p => pathname.startsWith(p))) {
    return NextResponse.next()
  }

  const session = req.cookies.get('dialer_session')?.value
  if (!session) {
    return NextResponse.redirect(new URL('/login', req.url))
  }

  // Admin routes require the admin role cookie set at login time.
  // Individual admin API routes perform their own server-side role verification.
  if (pathname.startsWith('/admin')) {
    const role = req.cookies.get('dialer_role')?.value
    if (role !== 'admin') {
      return NextResponse.redirect(new URL('/dashboard', req.url))
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
