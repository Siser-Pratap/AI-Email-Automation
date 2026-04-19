import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  
  // Define protected routes
  const isProtected = path.startsWith('/dashboard') || path.startsWith('/templates') || path.startsWith('/logs');
  
  if (isProtected) {
    const token = request.cookies.get('admin_token')?.value;
    const validPin = process.env.NEXT_PUBLIC_ADMIN_PIN || '171020';
    
    // Check if the token matches the fixed 6-digit PIN
    if (token !== validPin) {
      return NextResponse.redirect(new URL('/login', request.url));
    }
  }
  
  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*', '/templates/:path*', '/logs/:path*'],
};
