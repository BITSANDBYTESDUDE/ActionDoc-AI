import { NextResponse, type NextRequest } from 'next/server';

/**
 * Routes that are reachable without a session. Everything else is protected by
 * the middleware redirect, and again server-side in every route handler.
 */
const PUBLIC_PATHS = ['/login', '/register', '/api/auth', '/api/health'];

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/**
 * Lightweight edge middleware.
 *
 * It performs a presence check of the Auth.js session cookie purely to improve
 * UX (redirect instead of rendering an empty shell). It is NOT the
 * authorization boundary - every page and route handler re-validates the
 * session and organization membership on the server.
 */
export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (isPublic(pathname)) return NextResponse.next();

  const hasSession =
    request.cookies.has('authjs.session-token') ||
    request.cookies.has('__Secure-authjs.session-token') ||
    request.cookies.has('next-auth.session-token') ||
    request.cookies.has('__Secure-next-auth.session-token');

  if (!hasSession) {
    const loginUrl = new URL('/login', request.url);
    if (pathname !== '/') loginUrl.searchParams.set('next', `${pathname}${search}`);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'],
};