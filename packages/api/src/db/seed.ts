import "../load-env";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { eq } from "drizzle-orm";
import { seedProducts } from "./schema/seed-products.js";
import { users } from "./schema/index.js";
import { auth } from "../auth/index.js";
import {
  SEED_PRODUCTS,
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

  console.log("Seeding seed_products...");
  await db.insert(seedProducts).values(SEED_PRODUCTS).onConflictDoNothing();
  console.log(`Seeded ${SEED_PRODUCTS.length} products.`);

  // Seed superadmin via better-auth so they get a usable credential account.
  // Default dev password is logged below; reset via /forgot-password in prod.
  console.log("Seeding superadmin user...");

  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, SUPERADMIN_EMAIL))
    .limit(1);

  if (!existing) {
    // Superadmin has no kava, so email == realEmail (no slug encoding).
    await auth.api.signUpEmail({
      body: {
        email: SUPERADMIN_EMAIL,
        password: SUPERADMIN_PASSWORD,
        name: SUPERADMIN_NAME,
        realEmail: SUPERADMIN_EMAIL,
      },
    });
    // Promote role (signUpEmail defaults to "customer")
    await db
      .update(users)
      .set({ role: "superadmin", emailVerified: true })
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
