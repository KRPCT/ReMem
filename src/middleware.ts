import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import authConfig from "../auth.config";

const { auth } = NextAuth(authConfig);

const PUBLIC_PREFIXES = [
  "/login",
  "/register",
  "/",
  "/manifest.webmanifest",
  "/sw.js",
  "/logo.png",
];
const PUBLIC_GLOBS = ["/icons/", "/api/auth/"];

export default auth((req) => {
  const { nextUrl } = req;
  const isLoggedIn = !!req.auth;
  const isPublic =
    PUBLIC_PREFIXES.includes(nextUrl.pathname) ||
    PUBLIC_GLOBS.some((p) => nextUrl.pathname.startsWith(p));

  if (!isLoggedIn && !isPublic) {
    const callbackUrl = nextUrl.pathname + nextUrl.search;
    const loginUrl = new URL("/login", nextUrl);
    loginUrl.searchParams.set("callbackUrl", callbackUrl);
    return NextResponse.redirect(loginUrl);
  }
  if (
    isLoggedIn &&
    (nextUrl.pathname === "/login" || nextUrl.pathname === "/register")
  ) {
    return NextResponse.redirect(new URL("/decks", nextUrl));
  }
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|card-import-sample.md).*)"],
};
