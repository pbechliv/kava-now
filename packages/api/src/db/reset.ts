import "../load-env";
import postgres from "postgres";

const connectionString =
  process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/kavanow";

async function main() {
  // Connect to the default 'postgres' database to drop/create kavanow
  const baseUrl = connectionString.replace(/\/[^/]+$/, "/postgres");
  const sql = postgres(baseUrl, { max: 1 });

  console.log("Dropping database kavanow...");
  await sql.unsafe("DROP DATABASE IF EXISTS kavanow");

  console.log("Creating database kavanow...");
  await sql.unsafe("CREATE DATABASE kavanow");

  await sql.end();
  console.log("Database reset. Run db:migrate and db:seed next.");
}

main().catch((err) => {
  console.error("Reset failed:", err);
  process.exit(1);
});
