import "../load-env";
import postgres from "postgres";

const connectionString =
  process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/kavanow";

// Quote a Postgres identifier (DROP/CREATE DATABASE can't take parameters).
const quoteIdent = (name: string) => `"${name.replace(/"/g, '""')}"`;

async function main() {
  // Destructive: refuse to run against production unless explicitly forced.
  if (process.env.NODE_ENV === "production" && !process.argv.includes("--force")) {
    console.error(
      "Refusing to reset the database with NODE_ENV=production. Pass --force if you really mean it.",
    );
    process.exit(1);
  }

  // Drop/recreate the database named in DATABASE_URL (not a hardcoded name),
  // connecting via the maintenance 'postgres' database.
  const url = new URL(connectionString);
  const dbName = decodeURIComponent(url.pathname.replace(/^\//, ""));
  if (!dbName) {
    console.error("DATABASE_URL has no database name — nothing to reset.");
    process.exit(1);
  }

  url.pathname = "/postgres";
  const sql = postgres(url.toString(), { max: 1 });

  console.log(`Dropping database ${dbName}...`);
  await sql.unsafe(`DROP DATABASE IF EXISTS ${quoteIdent(dbName)}`);

  console.log(`Creating database ${dbName}...`);
  await sql.unsafe(`CREATE DATABASE ${quoteIdent(dbName)}`);

  await sql.end();
  console.log("Database reset. Run db:migrate and db:seed next.");
}

main().catch((err) => {
  console.error("Reset failed:", err);
  process.exit(1);
});
