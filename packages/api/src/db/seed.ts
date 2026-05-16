import "../load-env";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { eq } from "drizzle-orm";
import { users } from "./schema/index.js";
import { auth } from "../auth/index.js";
import {
  SUPERADMIN_EMAIL,
  SUPERADMIN_NAME,
  SUPERADMIN_PASSWORD,
  seedDemoTenant,
} from "./seeds/index.js";

const connectionString =
  process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/kavanow";

async function main() {
  const sql = postgres(connectionString, { max: 1 });
  const db = drizzle(sql);

  // Seed superadmin via better-auth so they get a usable credential account.
  // Default dev password is logged below; reset via /forgot-password in prod.
  console.log("Seeding superadmin user...");

  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, SUPERADMIN_EMAIL))
    .limit(1);

  if (!existing) {
    await auth.api.signUpEmail({
      body: { email: SUPERADMIN_EMAIL, password: SUPERADMIN_PASSWORD, name: SUPERADMIN_NAME },
    });
    await db
      .update(users)
      .set({ isSuperAdmin: true, emailVerified: true })
      .where(eq(users.email, SUPERADMIN_EMAIL));
  }
  console.log(`Superadmin: ${SUPERADMIN_EMAIL} / ${SUPERADMIN_PASSWORD}`);

  if (process.env.SEED_DEMO !== "false") {
    await seedDemoTenant(db);
  } else {
    console.log("SEED_DEMO=false — skipping demo tenant.");
  }

  await sql.end();
  console.log("Seed complete.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  });
