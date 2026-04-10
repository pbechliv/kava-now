import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { db } from "../../db/connection";
import { customers } from "../../db/schema/index";
import type { AppEnv } from "../../types";

const profileRouter = new Hono<AppEnv>();

// GET / — return customer record for authenticated user
profileRouter.get("/", async (c) => {
  const user = c.get("user")!;
  const customerId = user.customerId;

  if (!customerId) {
    return c.json({ error: "Δεν βρέθηκε λογαριασμός πελάτη" }, 400);
  }

  const [customer] = await db
    .select()
    .from(customers)
    .where(eq(customers.id, customerId))
    .limit(1);

  if (!customer) {
    return c.json({ error: "Ο πελάτης δεν βρέθηκε" }, 404);
  }

  return c.json(customer);
});

export { profileRouter };
