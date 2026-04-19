import "../load-env";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { eq } from "drizzle-orm";
import { seedProducts } from "./schema/seed-products.js";
import { users } from "./schema/index.js";
import { auth } from "../auth/index.js";

const connectionString =
  process.env.DATABASE_URL ||
  "postgresql://postgres:postgres@localhost:5432/kavanow";

const SEED_DATA = [
  // Κρασιά (Wines)
  { name: "Αγιωργίτικο", brand: "Νεμέα Σκούρας", categoryName: "Κρασιά", description: "Ερυθρό ξηρό κρασί ΠΟΠ Νεμέα", volumeMl: 750, alcoholPct: "13.0", unit: "bottle" as const },
  { name: "Ασύρτικο", brand: "Σιγάλας", categoryName: "Κρασιά", description: "Λευκό ξηρό κρασί Σαντορίνης", volumeMl: 750, alcoholPct: "13.5", unit: "bottle" as const },
  { name: "Μοσχοφίλερο", brand: "Μπουτάρη", categoryName: "Κρασιά", description: "Λευκό ξηρό κρασί Μαντινείας", volumeMl: 750, alcoholPct: "12.0", unit: "bottle" as const },
  { name: "Ξινόμαυρο", brand: "Κυρ-Γιάννη", categoryName: "Κρασιά", description: "Ερυθρό ξηρό κρασί Νάουσας", volumeMl: 750, alcoholPct: "13.5", unit: "bottle" as const },
  { name: "Ρετσίνα", brand: "Μαλαματίνα", categoryName: "Κρασιά", description: "Λευκό ρητινίτης οίνος", volumeMl: 500, alcoholPct: "11.5", unit: "bottle" as const },
  { name: "Ροζέ", brand: "Λαζαρίδη", categoryName: "Κρασιά", description: "Ροζέ ξηρό κρασί Δράμας", volumeMl: 750, alcoholPct: "12.5", unit: "bottle" as const },

  // Μπύρες (Beers)
  { name: "Μύθος", brand: "Olympic Brewery", categoryName: "Μπύρες", description: "Ελληνική lager μπύρα", volumeMl: 330, alcoholPct: "5.0", unit: "bottle" as const },
  { name: "Fix Hellas", brand: "Olympic Brewery", categoryName: "Μπύρες", description: "Premium lager μπύρα", volumeMl: 330, alcoholPct: "5.0", unit: "bottle" as const },
  { name: "Άλφα", brand: "Athenian Brewery", categoryName: "Μπύρες", description: "Ελληνική lager μπύρα", volumeMl: 330, alcoholPct: "5.0", unit: "bottle" as const },
  { name: "Βεργίνα", brand: "Μακεδονική Θράκης", categoryName: "Μπύρες", description: "Premium lager μπύρα", volumeMl: 330, alcoholPct: "5.0", unit: "bottle" as const },
  { name: "Νήσος", brand: "Νήσος", categoryName: "Μπύρες", description: "Craft pilsner Τήνου", volumeMl: 330, alcoholPct: "5.0", unit: "bottle" as const },
  { name: "Septem Μέρες", brand: "Septem", categoryName: "Μπύρες", description: "Craft pilsner Εύβοιας", volumeMl: 330, alcoholPct: "5.0", unit: "bottle" as const },

  // Αποστάγματα (Spirits)
  { name: "Ούζο 12", brand: "Ούζο 12", categoryName: "Αποστάγματα", description: "Κλασικό ελληνικό ούζο", volumeMl: 700, alcoholPct: "40.0", unit: "bottle" as const },
  { name: "Ούζο Πλωμαρίου", brand: "Βαρβαγιάννη", categoryName: "Αποστάγματα", description: "Ούζο Λέσβου", volumeMl: 700, alcoholPct: "40.0", unit: "bottle" as const },
  { name: "Τσίπουρο", brand: "Τσιλιλή", categoryName: "Αποστάγματα", description: "Τσίπουρο Τυρνάβου χωρίς γλυκάνισο", volumeMl: 700, alcoholPct: "40.0", unit: "bottle" as const },
  { name: "Τσίπουρο με γλυκάνισο", brand: "Τσιλιλή", categoryName: "Αποστάγματα", description: "Τσίπουρο Τυρνάβου με γλυκάνισο", volumeMl: 700, alcoholPct: "42.0", unit: "bottle" as const },
  { name: "Μεταξά 5*", brand: "Μεταξά", categoryName: "Αποστάγματα", description: "Ελληνικό brandy 5 αστέρων", volumeMl: 700, alcoholPct: "38.0", unit: "bottle" as const },
  { name: "Μεταξά 7*", brand: "Μεταξά", categoryName: "Αποστάγματα", description: "Ελληνικό brandy 7 αστέρων", volumeMl: 700, alcoholPct: "40.0", unit: "bottle" as const },

  // Λικέρ (Liqueurs)
  { name: "Μαστίχα Χίου", brand: "Σκίνος", categoryName: "Λικέρ", description: "Λικέρ μαστίχας Χίου", volumeMl: 700, alcoholPct: "30.0", unit: "bottle" as const },
  { name: "Τεντούρα", brand: "Αχάϊα", categoryName: "Λικέρ", description: "Παραδοσιακό λικέρ Πάτρας", volumeMl: 500, alcoholPct: "25.0", unit: "bottle" as const },
  { name: "Κίτρο Νάξου", brand: "Βαλλίνδρα", categoryName: "Λικέρ", description: "Λικέρ κίτρου Νάξου", volumeMl: 500, alcoholPct: "36.0", unit: "bottle" as const },
  { name: "Ρακόμελο", brand: "Κρητικό", categoryName: "Λικέρ", description: "Ρακί με μέλι Κρήτης", volumeMl: 500, alcoholPct: "25.0", unit: "bottle" as const },

  // Αναψυκτικά (Soft Drinks)
  { name: "Coca-Cola", brand: "Coca-Cola", categoryName: "Αναψυκτικά", description: "Κλασική Coca-Cola", volumeMl: 330, alcoholPct: null, unit: "bottle" as const },
  { name: "Coca-Cola Zero", brand: "Coca-Cola", categoryName: "Αναψυκτικά", description: "Coca-Cola χωρίς ζάχαρη", volumeMl: 330, alcoholPct: null, unit: "bottle" as const },
  { name: "Sprite", brand: "Coca-Cola", categoryName: "Αναψυκτικά", description: "Ανθρακούχο λεμόνι", volumeMl: 330, alcoholPct: null, unit: "bottle" as const },
  { name: "Fanta Πορτοκάλι", brand: "Coca-Cola", categoryName: "Αναψυκτικά", description: "Ανθρακούχο πορτοκάλι", volumeMl: 330, alcoholPct: null, unit: "bottle" as const },
  { name: "Schweppes Tonic", brand: "Schweppes", categoryName: "Αναψυκτικά", description: "Τόνικ γουότερ", volumeMl: 330, alcoholPct: null, unit: "bottle" as const },
  { name: "Schweppes Σόδα", brand: "Schweppes", categoryName: "Αναψυκτικά", description: "Σόδα", volumeMl: 330, alcoholPct: null, unit: "bottle" as const },
  { name: "Λεμονίτα Λουξ", brand: "Λουξ", categoryName: "Αναψυκτικά", description: "Ελληνική λεμονάδα", volumeMl: 330, alcoholPct: null, unit: "bottle" as const },

  // Νερά (Water)
  { name: "Ζαγόρι", brand: "Ζαγόρι", categoryName: "Νερά", description: "Φυσικό μεταλλικό νερό", volumeMl: 500, alcoholPct: null, unit: "bottle" as const },
  { name: "Ζαγόρι Ανθρακούχο", brand: "Ζαγόρι", categoryName: "Νερά", description: "Φυσικό ανθρακούχο νερό", volumeMl: 750, alcoholPct: null, unit: "bottle" as const },
  { name: "Βίκος", brand: "Βίκος", categoryName: "Νερά", description: "Φυσικό μεταλλικό νερό", volumeMl: 500, alcoholPct: null, unit: "bottle" as const },
  { name: "ΑΥΡΑ", brand: "ΑΥΡΑ", categoryName: "Νερά", description: "Φυσικό μεταλλικό νερό", volumeMl: 500, alcoholPct: null, unit: "bottle" as const },

  // Χυμοί (Juices)
  { name: "Πορτοκάλι", brand: "Λακωνία", categoryName: "Χυμοί", description: "Φυσικός χυμός πορτοκάλι", volumeMl: 250, alcoholPct: null, unit: "bottle" as const },
  { name: "Ροδάκινο", brand: "Λακωνία", categoryName: "Χυμοί", description: "Νέκταρ ροδάκινο", volumeMl: 250, alcoholPct: null, unit: "bottle" as const },
  { name: "Βύσσινο", brand: "Λακωνία", categoryName: "Χυμοί", description: "Νέκταρ βύσσινο", volumeMl: 250, alcoholPct: null, unit: "bottle" as const },
  { name: "Λεμόνι", brand: "Λακωνία", categoryName: "Χυμοί", description: "Φυσικός χυμός λεμόνι", volumeMl: 250, alcoholPct: null, unit: "bottle" as const },
];

async function main() {
  const sql = postgres(connectionString, { max: 1 });
  const db = drizzle(sql);

  console.log("Seeding seed_products...");
  await db.insert(seedProducts).values(SEED_DATA).onConflictDoNothing();
  console.log(`Seeded ${SEED_DATA.length} products.`);

  // Seed superadmin via better-auth so they get a usable credential account.
  // Default dev password is logged below; reset via /forgot-password in prod.
  console.log("Seeding superadmin user...");
  const superadminEmail = "panos.bechlivanos@gmail.com";
  const superadminPassword = "supersecret";

  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, superadminEmail))
    .limit(1);

  if (!existing) {
    // Superadmin has no kava, so email == realEmail (no slug encoding).
    await auth.api.signUpEmail({
      body: {
        email: superadminEmail,
        password: superadminPassword,
        name: "Super Admin",
        realEmail: superadminEmail,
      },
    });
    // Promote role (signUpEmail defaults to "customer")
    await db
      .update(users)
      .set({ role: "superadmin", emailVerified: true })
      .where(eq(users.email, superadminEmail));
  }
  console.log(`Superadmin: ${superadminEmail} / ${superadminPassword}`);

  await sql.end();
  console.log("Seed complete.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  });
