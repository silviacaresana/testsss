import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE = "vl_session";
const CSRF_COOKIE = "vl_csrf";

export function middleware(request: NextRequest) {
  const response = NextResponse.next();
  const session = request.cookies.get(SESSION_COOKIE)?.value;
  const csrf = request.cookies.get(CSRF_COOKIE)?.value;

  if (session && !csrf) {
    response.cookies.set(CSRF_COOKIE, crypto.randomUUID(), {
      httpOnly: false,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });
  }

  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "SAMEORIGIN");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|ico|webp|woff2?)$).*)"],
};
