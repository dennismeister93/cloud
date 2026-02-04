import { NextResponse } from 'next/server';
import { withAuthenticatedAdminApiRoutes } from './middleware/withAuthenticatedAdminApiRoutes';
import { withKiloEditorCookie } from './middleware/withKiloEditorCookie';

export function defaultMiddleware() {
  return NextResponse.next();
}

export default withAuthenticatedAdminApiRoutes(withKiloEditorCookie(defaultMiddleware));

export const config = {
  /*
   * Match all request paths except for the ones starting with:
   * - api routes that don't need middleware
   * - _next/static (static files)
   * - _next/image (image optimization files)
   * - favicon.ico (favicon file)
   * - public folder
   */
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
