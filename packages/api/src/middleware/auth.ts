import { createMiddleware } from "hono/factory";
import { lucia } from "../auth/lucia";
import type { AppEnv } from "../types";

export const authMiddleware = createMiddleware<AppEnv>(async (c, next) => {
  const cookieName = lucia.sessionCookieName;
  const sessionId = c.req.raw.headers.get("cookie")
    ?.split(";")
    .find((c) => c.trim().startsWith(`${cookieName}=`))
    ?.split("=")[1]
    ?.trim() ?? null;

  if (!sessionId) {
    c.set("user", null);
    c.set("sessionId", null);
    return next();
  }

  const { session, user } = await lucia.validateSession(sessionId);

  if (session?.fresh) {
    const cookie = lucia.createSessionCookie(session.id);
    c.header("Set-Cookie", cookie.serialize(), { append: true });
  }

  if (!session) {
    const cookie = lucia.createBlankSessionCookie();
    c.header("Set-Cookie", cookie.serialize(), { append: true });
    c.set("user", null);
    c.set("sessionId", null);
    return next();
  }

  c.set("user", {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role as "owner" | "staff" | "customer" | "superadmin",
    kavaId: user.kavaId,
    customerId: user.customerId,
    passwordHash: null,
    createdAt: new Date(),
  });
  c.set("sessionId", session.id);

  return next();
});
