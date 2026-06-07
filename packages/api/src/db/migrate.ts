import "../load-env";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const connectionString =
  process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/kavanow";

async function main() {
  const sql = postgres(connectionString, { max: 1 });
  const db = drizzle(sql);

  // RLS policies live in the migration graph (see drizzle/0000_init.sql);
  // new tenant-scoped tables must ship their policy as a custom migration.
  console.log("Running Drizzle migrations...");
  await migrate(db, { migrationsFolder: join(__dirname, "../../drizzle") });
  console.log("Drizzle migrations complete.");

  await provisionAppRole(sql);

  await sql.end();
  console.log("Migration complete.");
}

/**
 * Create (idempotently) the dedicated NOSUPERUSER application role that the
 * running server connects as, and grant it table/sequence DML. RLS is only
 * enforced for non-superusers, so the app must NOT use the bootstrap/owner
 * role. Migrations run as the privileged role and provision this one.
 */
async function provisionAppRole(sql: postgres.Sql) {
  const role = process.env.APP_DB_ROLE || "kavanow_app";
  if (!/^[a-z_][a-z0-9_]*$/.test(role)) {
    throw new Error(`Invalid APP_DB_ROLE "${role}" — must match /^[a-z_][a-z0-9_]*$/`);
  }

  const isProd = process.env.NODE_ENV === "production";
  const password = process.env.APP_DB_PASSWORD || (isProd ? undefined : role);
  if (!password) {
    throw new Error(
      "APP_DB_PASSWORD is required to provision the application DB role in production",
    );
  }

  console.log(`Provisioning application role "${role}"...`);

  // Quote identifier/literal server-side to avoid any injection via env values.
  const [meta] = await sql<{ ident: string; lit: string; exists: boolean }[]>`
    select quote_ident(${role}) as ident,
           quote_literal(${password}) as lit,
           exists(select 1 from pg_roles where rolname = ${role}) as exists`;
  if (!meta) throw new Error("Failed to read application role metadata");
  const { ident, lit, exists } = meta;

  if (!exists) {
    await sql.unsafe(`create role ${ident} with login nosuperuser nocreatedb nocreaterole`);
  }
  await sql.unsafe(`alter role ${ident} with login password ${lit}`);

  await sql.unsafe(`grant usage on schema public to ${ident}`);
  await sql.unsafe(
    `grant select, insert, update, delete on all tables in schema public to ${ident}`,
  );
  await sql.unsafe(`grant usage, select on all sequences in schema public to ${ident}`);
  // Future tables/sequences created by this (owner) role inherit the grants.
  await sql.unsafe(
    `alter default privileges in schema public grant select, insert, update, delete on tables to ${ident}`,
  );
  await sql.unsafe(
    `alter default privileges in schema public grant usage, select on sequences to ${ident}`,
  );

  console.log(`Application role "${role}" provisioned.`);
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
