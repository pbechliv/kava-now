import { eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { encodeAuthEmail } from "@kava-now/shared";
import { auth } from "../../auth/index.js";
import {
  categories,
  customerBrandPricing,
  customers,
  kavas,
  orderItems,
  orders,
  products,
  seedProducts,
  users,
} from "../schema/index.js";
import { DEFAULT_CATEGORIES } from "./categories.js";

const DEMO_SLUG = "demo";

// Base price per category (€). Snapshotted into products.basePrice; order items
// snapshot this again into unit_price at order time.
const BASE_PRICE_BY_CATEGORY: Record<string, number> = {
  Κρασιά: 12.0,
  Μπύρες: 1.8,
  Αποστάγματα: 22.0,
  Λικέρ: 18.0,
  Αναψυκτικά: 1.2,
  Νερά: 0.7,
  Χυμοί: 1.5,
};

const DEMO_CUSTOMERS = [
  {
    name: "Ταβέρνα Ο Νίκος",
    email: "orders@niko-taverna.gr",
    phone: "+30 210 3210101",
    address: "Αδριανού 88, Πλάκα, Αθήνα",
    contactPerson: "Νίκος Παπαδόπουλος",
    notes: "Παράδοση Δευτέρα & Πέμπτη πρωί",
  },
  {
    name: "Εστιατόριο Διόνυσος",
    email: "purchasing@dionysos.gr",
    phone: "+30 210 7234567",
    address: "Σκουφά 21, Κολωνάκι, Αθήνα",
    contactPerson: "Μαρία Αντωνίου",
    notes: "Premium προμηθευτής — άριστη πιστωτική γραμμή",
  },
  {
    name: "Καφέ Αγορά",
    email: "kafeagora@gmail.com",
    phone: "+30 210 3245678",
    address: "Πανδρόσου 14, Μοναστηράκι, Αθήνα",
    contactPerson: "Γιώργος Δημητρίου",
    notes: null,
  },
  {
    name: "Μπαρ Στοά Μύλος",
    email: "stoa.mylos@hotmail.com",
    phone: "+30 211 4456789",
    address: "Μιαούλη 17, Ψυρρή, Αθήνα",
    contactPerson: "Έλενα Σταυρίδη",
    notes: "Παραγγελίες κάθε δεύτερη Τετάρτη",
  },
  {
    name: "Πιτσαρία Bella Napoli",
    email: "info@bellanapoli.gr",
    phone: "+30 210 3823456",
    address: "Θεμιστοκλέους 65, Εξάρχεια, Αθήνα",
    contactPerson: "Stefano Conti",
    notes: null,
  },
] as const;

type DemoCustomerName = (typeof DEMO_CUSTOMERS)[number]["name"];

const DEMO_BRAND_PRICING: ReadonlyArray<{
  customerName: DemoCustomerName;
  brand: string;
  discountPct: string;
}> = [
  { customerName: "Ταβέρνα Ο Νίκος", brand: "Olympic Brewery", discountPct: "10.00" },
  { customerName: "Ταβέρνα Ο Νίκος", brand: "Coca-Cola", discountPct: "5.00" },
  { customerName: "Εστιατόριο Διόνυσος", brand: "Νεμέα Σκούρας", discountPct: "15.00" },
  { customerName: "Εστιατόριο Διόνυσος", brand: "Μεταξά", discountPct: "12.00" },
  { customerName: "Καφέ Αγορά", brand: "Coca-Cola", discountPct: "8.00" },
  { customerName: "Μπαρ Στοά Μύλος", brand: "Septem", discountPct: "15.00" },
  { customerName: "Μπαρ Στοά Μύλος", brand: "Athenian Brewery", discountPct: "10.00" },
  { customerName: "Πιτσαρία Bella Napoli", brand: "Olympic Brewery", discountPct: "12.00" },
];

type OrderStatus = "pending" | "confirmed" | "shipped" | "delivered" | "cancelled";

interface DemoOrderItem {
  productName: string;
  brand: string;
  quantity: number;
}

interface DemoOrder {
  customerName: DemoCustomerName;
  status: OrderStatus;
  notes: string | null;
  items: DemoOrderItem[];
}

const DEMO_ORDERS: DemoOrder[] = [
  {
    customerName: "Ταβέρνα Ο Νίκος",
    status: "delivered",
    notes: "Παραδόθηκε χωρίς ζημιές",
    items: [
      { productName: "Μύθος", brand: "Olympic Brewery", quantity: 48 },
      { productName: "Fix Hellas", brand: "Olympic Brewery", quantity: 24 },
      { productName: "Ρετσίνα", brand: "Μαλαματίνα", quantity: 12 },
      { productName: "Ζαγόρι", brand: "Ζαγόρι", quantity: 24 },
    ],
  },
  {
    customerName: "Εστιατόριο Διόνυσος",
    status: "delivered",
    notes: null,
    items: [
      { productName: "Αγιωργίτικο", brand: "Νεμέα Σκούρας", quantity: 12 },
      { productName: "Ασύρτικο", brand: "Σιγάλας", quantity: 6 },
      { productName: "Μεταξά 7*", brand: "Μεταξά", quantity: 3 },
    ],
  },
  {
    customerName: "Καφέ Αγορά",
    status: "shipped",
    notes: "Αναμένεται παράδοση αύριο 09:00",
    items: [
      { productName: "Coca-Cola", brand: "Coca-Cola", quantity: 96 },
      { productName: "Coca-Cola Zero", brand: "Coca-Cola", quantity: 48 },
      { productName: "Sprite", brand: "Coca-Cola", quantity: 48 },
      { productName: "Schweppes Tonic", brand: "Schweppes", quantity: 24 },
    ],
  },
  {
    customerName: "Μπαρ Στοά Μύλος",
    status: "confirmed",
    notes: "Φόρτωση Παρασκευή",
    items: [
      { productName: "Septem Μέρες", brand: "Septem", quantity: 36 },
      { productName: "Άλφα", brand: "Athenian Brewery", quantity: 48 },
      { productName: "Ούζο Πλωμαρίου", brand: "Βαρβαγιάννη", quantity: 6 },
      { productName: "Τσίπουρο", brand: "Τσιλιλή", quantity: 6 },
    ],
  },
  {
    customerName: "Πιτσαρία Bella Napoli",
    status: "confirmed",
    notes: null,
    items: [
      { productName: "Μύθος", brand: "Olympic Brewery", quantity: 72 },
      { productName: "Coca-Cola", brand: "Coca-Cola", quantity: 48 },
      { productName: "Fanta Πορτοκάλι", brand: "Coca-Cola", quantity: 24 },
    ],
  },
  {
    customerName: "Ταβέρνα Ο Νίκος",
    status: "pending",
    notes: "Περιμένει επιβεβαίωση πελάτη",
    items: [
      { productName: "Ούζο 12", brand: "Ούζο 12", quantity: 6 },
      { productName: "Ρακόμελο", brand: "Κρητικό", quantity: 6 },
      { productName: "Πορτοκάλι", brand: "Λακωνία", quantity: 12 },
    ],
  },
  {
    customerName: "Καφέ Αγορά",
    status: "pending",
    notes: null,
    items: [
      { productName: "Λεμονίτα Λουξ", brand: "Λουξ", quantity: 24 },
      { productName: "Βίκος", brand: "Βίκος", quantity: 36 },
      { productName: "Λεμόνι", brand: "Λακωνία", quantity: 12 },
    ],
  },
  {
    customerName: "Εστιατόριο Διόνυσος",
    status: "cancelled",
    notes: "Ακύρωση από πελάτη — προμήθεια εκτός season",
    items: [
      { productName: "Ξινόμαυρο", brand: "Κυρ-Γιάννη", quantity: 6 },
      { productName: "Ροζέ", brand: "Λαζαρίδη", quantity: 6 },
    ],
  },
];

function priceForCategory(categoryName: string): string {
  return (BASE_PRICE_BY_CATEGORY[categoryName] ?? 5.0).toFixed(2);
}

export async function seedDemoTenant(db: PostgresJsDatabase): Promise<void> {
  const [existing] = await db
    .select({ id: kavas.id })
    .from(kavas)
    .where(eq(kavas.slug, DEMO_SLUG))
    .limit(1);

  if (existing) {
    console.log(`Demo kava "${DEMO_SLUG}" already exists — skipping demo seed.`);
    return;
  }

  console.log("Seeding demo tenant...");

  const [demoKava] = await db
    .insert(kavas)
    .values({
      name: "Demo Κάβα Αθηνών",
      slug: DEMO_SLUG,
      email: "demo@kavanow.gr",
      phone: "+30 210 1234567",
      address: "Πανεπιστημίου 42, Αθήνα",
    })
    .returning();

  if (!demoKava) throw new Error("Failed to create demo kava");

  const ownerRealEmail = process.env.DEMO_OWNER_EMAIL ?? "owner@demo.kavanow.gr";
  const ownerPassword = process.env.DEMO_OWNER_PASSWORD ?? "demopass";
  const ownerAuthEmail = encodeAuthEmail(ownerRealEmail, DEMO_SLUG);

  await auth.api.signUpEmail({
    body: {
      email: ownerAuthEmail,
      password: ownerPassword,
      name: "Demo Owner",
      realEmail: ownerRealEmail,
    },
  });
  await db
    .update(users)
    .set({ role: "owner", kavaId: demoKava.id, emailVerified: true })
    .where(eq(users.email, ownerAuthEmail));

  const insertedCategories = await db
    .insert(categories)
    .values(
      DEFAULT_CATEGORIES.map((name, index) => ({
        kavaId: demoKava.id,
        name,
        sortOrder: index,
      })),
    )
    .returning({ id: categories.id, name: categories.name });

  const categoryByName = new Map(insertedCategories.map((c) => [c.name, c.id]));

  const allSeedProducts = await db.select().from(seedProducts);
  const insertedProducts = await db
    .insert(products)
    .values(
      allSeedProducts.map((sp) => ({
        kavaId: demoKava.id,
        name: sp.name,
        brand: sp.brand ?? sp.name,
        categoryId: categoryByName.get(sp.categoryName) ?? null,
        description: sp.description,
        imageUrl: sp.imageUrl,
        basePrice: priceForCategory(sp.categoryName),
        unit: sp.unit,
        volumeMl: sp.volumeMl,
        alcoholPct: sp.alcoholPct,
        active: true,
      })),
    )
    .returning({
      id: products.id,
      name: products.name,
      brand: products.brand,
      basePrice: products.basePrice,
    });

  const productByNameBrand = new Map(insertedProducts.map((p) => [`${p.name}|${p.brand}`, p]));

  const insertedCustomers = await db
    .insert(customers)
    .values(DEMO_CUSTOMERS.map((c) => ({ kavaId: demoKava.id, ...c })))
    .returning({ id: customers.id, name: customers.name });

  const customerByName = new Map(insertedCustomers.map((c) => [c.name, c.id]));

  await db.insert(customerBrandPricing).values(
    DEMO_BRAND_PRICING.map((bp) => {
      const customerId = customerByName.get(bp.customerName);
      if (!customerId) throw new Error(`Demo customer missing: ${bp.customerName}`);
      return { customerId, brand: bp.brand, discountPct: bp.discountPct };
    }),
  );

  for (const order of DEMO_ORDERS) {
    const customerId = customerByName.get(order.customerName);
    if (!customerId) throw new Error(`Demo customer missing: ${order.customerName}`);

    const [createdOrder] = await db
      .insert(orders)
      .values({
        kavaId: demoKava.id,
        customerId,
        status: order.status,
        notes: order.notes,
      })
      .returning({ id: orders.id });

    if (!createdOrder) throw new Error("Failed to create demo order");

    await db.insert(orderItems).values(
      order.items.map((item) => {
        const product = productByNameBrand.get(`${item.productName}|${item.brand}`);
        if (!product) {
          throw new Error(`Demo product missing: ${item.productName} / ${item.brand}`);
        }
        return {
          orderId: createdOrder.id,
          productId: product.id,
          quantity: item.quantity,
          unitPrice: product.basePrice,
          productName: item.productName,
        };
      }),
    );
  }

  console.log(
    `Demo tenant seeded: kava "${DEMO_SLUG}" + ${DEMO_CUSTOMERS.length} customers + ${DEMO_ORDERS.length} orders. ` +
      `Owner login: ${ownerRealEmail} / ${ownerPassword} at demo.lvh.me:5173`,
  );
}
