import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import type { CookieOptions } from '@supabase/ssr';
import { getDashboardPathForRole, type UserRole } from '@/lib/auth/role-redirect';
import { shouldBypassMiddlewareForRequest } from '@/lib/auth/middleware-guards';

type CookieToSet = { name: string; value: string; options?: CookieOptions };

export async function middleware(request: NextRequest) {
  const response = NextResponse.next({ request });

  // Let Next.js server-action internals proceed without middleware side-effects.
  if (shouldBypassMiddlewareForRequest(request.headers)) {
    return response;
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        }
      }
    }
  );

  const {
    data: { user }
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isWorkshopRoute = path.startsWith('/workshop');
  const isCustomerRoute = path.startsWith('/customer');

  if ((isWorkshopRoute || isCustomerRoute) && !user) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  if (!user) {
    return response;
  }

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  const role = profile?.role as UserRole | undefined;

  const redirectIfDifferent = (targetPath: string) => {
    const targetUrl = new URL(targetPath, request.url);
    const isSamePath = targetUrl.pathname === path;
    const isSameSearch = targetUrl.search === request.nextUrl.search;

    if (isSamePath && isSameSearch) {
      return response;
    }

    return NextResponse.redirect(targetUrl);
  };

  if (role === 'inactive_technician' && path !== '/login') {
    return redirectIfDifferent('/login?error=inactive_technician');
  }

  if ((path === '/login' || path === '/signup') && role && role !== 'inactive_technician') {
    return redirectIfDifferent(getDashboardPathForRole(role));
  }

  const hasWorkshopAccess = role === 'admin' || role === 'technician';
  const hasCustomerAccess = role === 'customer';

  if (isWorkshopRoute && !hasWorkshopAccess) {
    return redirectIfDifferent(getDashboardPathForRole(role));
  }

  if (isCustomerRoute && !hasCustomerAccess) {
    return redirectIfDifferent(getDashboardPathForRole(role));
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)']
};
