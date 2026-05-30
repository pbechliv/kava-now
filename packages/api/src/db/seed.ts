import "../load-env";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { eq } from "drizzle-orm";
import { hashPassword } from "better-auth/crypto";
import { accounts, users } from "./schema/index.js";
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

  // Direct drizzle inserts bypass better-auth's signup path, which is locked
  // down by the invite-only `databaseHooks.user.create.before` guard.
  console.log("Seeding superadmin user...");

  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, SUPERADMIN_EMAIL))
    .limit(1);

  if (!existing) {
    const [createdUser] = await db
      .insert(users)
      .values({
        email: SUPERADMIN_EMAIL,
        name: SUPERADMIN_NAME,
        isSuperAdmin: true,
        emailVerified: true,
      })
      .returning({ id: users.id });
    if (!createdUser) throw new Error("Failed to insert superadmin user");

    await db.insert(accounts).values({
      accountId: createdUser.id,
      providerId: "credential",
      userId: createdUser.id,
      password: await hashPassword(SUPERADMIN_PASSWORD),
    });
  }
  if (process.env.NODE_ENV !== "production") {
    console.log(`Superadmin: ${SUPERADMIN_EMAIL} / ${SUPERADMIN_PASSWORD}`);
  } else {
    console.log(`Superadmin seeded: ${SUPERADMIN_EMAIL}`);
  }

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
