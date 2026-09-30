import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/** Routes that are fully public — no auth required */
const PUBLIC_ROUTES = new Set([
  "/",
  "/login",
  "/signup",
  "/forgot-password",
  "/update-password",
]);

/** Prefixes that are always public (static assets handled by matcher below) */
const PUBLIC_PREFIXES = ["/_next", "/api/health", "/favicon"];

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  // The visual foundation is deliberately usable before a Supabase project exists.
  if (!supabaseUrl || !publishableKey) return response;

  const supabase = createServerClient(supabaseUrl, publishableKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(items) {
        items.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        items.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  // getUser validates the bearer token with the Supabase SDK.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  // Always allow public prefixes
  if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) {
    return response;
  }

  // Redirect authenticated users away from auth pages
  const authOnlyPaths = ["/login", "/signup"];
  if (user && authOnlyPaths.includes(pathname)) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/dashboard";
    return NextResponse.redirect(redirectUrl);
  }

  // Allow public routes through without auth
  if (PUBLIC_ROUTES.has(pathname)) {
    return response;
  }

  // All other routes require authentication
  if (!user) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return response;
}
