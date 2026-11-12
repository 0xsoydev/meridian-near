import { cookies } from "next/headers";
import { fail } from "../../../../../lib/errors.ts";
import { cookieName, isOAuthRail, startOAuth } from "../../../../../lib/oauth.ts";

export async function GET(request: Request): Promise<Response> {
  const rail = new URL(request.url).searchParams.get("rail") ?? "";
  if (!isOAuthRail(rail)) return fail(400, "invalid_request", "invalid connection request");

  const { url, sealed } = startOAuth(rail);
  (await cookies()).set(cookieName(rail), sealed, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  return Response.redirect(url, 302);
}
