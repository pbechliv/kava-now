import "../load-env";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const connectionString =
  process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/kavanow";

async function main() {
  const sql = postgres(connectionString, { max: 1 });
  const db = drizzle(sql);

  console.log("Running Drizzle migrations...");
  await migrate(db, { migrationsFolder: join(__dirname, "../../drizzle") });
  console.log("Drizzle migrations complete.");

  console.log("Applying RLS policies...");
  const rlsSql = readFileSync(join(__dirname, "rls.sql"), "utf-8");
  await sql.unsafe(rlsSql);
  console.log("RLS policies applied.");

  await sql.end();
  console.log("Migration complete.");
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
