import { eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { hashPassword } from "better-auth/crypto";
import {
  accounts,
  categories,
  customerBrandPricing,
  customers,
  tenantMemberships,
  tenants,
  orderItems,
  orders,
  products,
  users,
} from "../schema/index.js";
import { DEMO_PRODUCTS } from "./demo-products.js";

const DEMO_SLUG = "demo";

const DEMO_CATEGORIES = [
  "Κρασιά",
  "Μπύρες",
  "Αποστάγματα",
  "Λικέρ",
  "Αναψυκτικά",
  "Νερά",
  "Χυμοί",
] as const;

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
    vatId: "099123456",
    taxOffice: "Α' Αθηνών",
    profession: "Ταβέρνα / Εστιατόριο",
    billingAddress: "Αδριανού 88, Πλάκα, 10558 Αθήνα",
    erpRef: "C-0001",
  },
  {
    name: "Εστιατόριο Διόνυσος",
    email: "purchasing@dionysos.gr",
    phone: "+30 210 7234567",
    address: "Σκουφά 21, Κολωνάκι, Αθήνα",
    contactPerson: "Μαρία Αντωνίου",
    notes: "Premium προμηθευτής — άριστη πιστωτική γραμμή",
    vatId: "099887766",
    taxOffice: "Δ' Αθηνών",
    profession: "Εστιατόριο",
    billingAddress: "Σκουφά 21, Κολωνάκι, 10673 Αθήνα",
    erpRef: "C-0002",
  },
  {
    name: "Καφέ Αγορά",
    email: "kafeagora@gmail.com",
    phone: "+30 210 3245678",
    address: "Πανδρόσου 14, Μοναστηράκι, Αθήνα",
    contactPerson: "Γιώργος Δημητρίου",
    notes: null,
    vatId: "099445522",
    taxOffice: "ΙΓ' Αθηνών",
    profession: "Καφετέρια",
    billingAddress: "Πανδρόσου 14, Μοναστηράκι, 10555 Αθήνα",
    erpRef: "C-0003",
  },
  {
    name: "Μπαρ Στοά Μύλος",
    email: "stoa.mylos@hotmail.com",
    phone: "+30 211 4456789",
    address: "Μιαούλη 17, Ψυρρή, Αθήνα",
    contactPerson: "Έλενα Σταυρίδη",
    notes: "Παραγγελίες κάθε δεύτερη Τετάρτη",
    vatId: "099334411",
    taxOffice: "ΙΕ' Αθηνών",
    profession: "Μπαρ",
    billingAddress: "Μιαούλη 17, Ψυρρή, 10554 Αθήνα",
    erpRef: "C-0004",
  },
  {
    name: "Πιτσαρία Bella Napoli",
    email: "info@bellanapoli.gr",
    phone: "+30 210 3823456",
    address: "Θεμιστοκλέους 65, Εξάρχεια, Αθήνα",
    contactPerson: "Stefano Conti",
    notes: null,
    vatId: "099556677",
    taxOffice: "Στ' Αθηνών",
    profession: "Πιτσαρία",
    billingAddress: "Θεμιστοκλέους 65, Εξάρχεια, 10683 Αθήνα",
    erpRef: "C-0005",
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

export async function seedDemoTenant(outerDb: PostgresJsDatabase): Promise<void> {
  const [existing] = await outerDb
    .select({ id: tenants.id })
    .from(tenants)
    .where(eq(tenants.slug, DEMO_SLUG))
    .limit(1);

  if (existing) {
    console.log(`Demo tenant "${DEMO_SLUG}" already exists — skipping demo seed.`);
    return;
  }

  console.log("Seeding demo tenant...");

  // One transaction for the whole seed: a mid-way failure (e.g. the demo
  // customer email colliding with an existing user) used to leave a
  // half-seeded tenant that the slug guard above then blocked from repair.
  await outerDb.transaction(async (db) => {
    const [demoTenant] = await db
      .insert(tenants)
      .values({
        name: "Demo Λογαριασμός Αθηνών",
        slug: DEMO_SLUG,
        email: "demo@kavanow.gr",
        phone: "+30 210 1234567",
        address: "Πανεπιστημίου 42, Αθήνα",
      })
      .returning();

    if (!demoTenant) throw new Error("Failed to create demo tenant");

    // The superadmin is the owner of the demo tenant — gives dev a single user to
    // log in as and use the in-app tenant switcher to enter the tenant context.
    const [superadminUser] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.isSuperAdmin, true))
      .limit(1);
    if (!superadminUser) throw new Error("Superadmin must be seeded before the demo tenant");

    await db
      .insert(tenantMemberships)
      .values({ userId: superadminUser.id, tenantId: demoTenant.id, role: "owner" });

    const insertedCategories = await db
      .insert(categories)
      .values(
        DEMO_CATEGORIES.map((name, index) => ({
          tenantId: demoTenant.id,
          name,
          sortOrder: index,
        })),
      )
      .returning({ id: categories.id, name: categories.name });

    const categoryByName = new Map(insertedCategories.map((c) => [c.name, c.id]));

    const insertedProducts = await db
      .insert(products)
      .values(
        DEMO_PRODUCTS.map((sp, index) => ({
          tenantId: demoTenant.id,
          name: sp.name,
          brand: sp.brand ?? sp.name,
          categoryId: categoryByName.get(sp.categoryName) ?? null,
          description: sp.description ?? null,
          imageUrl: sp.imageUrl ?? null,
          basePrice: priceForCategory(sp.categoryName),
          unit: sp.unit,
          volumeMl: sp.volumeMl ?? null,
          alcoholPct: sp.alcoholPct ?? null,
          erpRef: String(100001 + index),
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
      .values(DEMO_CUSTOMERS.map((c) => ({ tenantId: demoTenant.id, ...c })))
      .returning({ id: customers.id, name: customers.name });

    const customerByName = new Map(insertedCustomers.map((c) => [c.name, c.id]));

    // Customer user + membership linked to "Ταβέρνα Ο Νίκος" — dev only. In
    // production the superadmin is the only seeded user; customer logins are
    // created through the invite flow instead.
    let customerLoginHint = "";
    if (process.env.NODE_ENV !== "production") {
      const customerEmail = (
        process.env.DEMO_CUSTOMER_EMAIL ?? "customer@demo.kavanow.gr"
      ).toLowerCase();
      const customerPassword = process.env.DEMO_CUSTOMER_PASSWORD ?? "demopass";
      const linkedCustomerId = customerByName.get("Ταβέρνα Ο Νίκος");
      if (!linkedCustomerId) throw new Error("Demo customer org missing: Ταβέρνα Ο Νίκος");

      const [customerUser] = await db
        .insert(users)
        .values({
          email: customerEmail,
          name: "Demo Customer",
          emailVerified: true,
        })
        .returning({ id: users.id });
      if (!customerUser) throw new Error("Failed to create demo customer user");

      await db.insert(accounts).values({
        accountId: customerUser.id,
        providerId: "credential",
        userId: customerUser.id,
        password: await hashPassword(customerPassword),
      });

      await db.insert(tenantMemberships).values({
        userId: customerUser.id,
        tenantId: demoTenant.id,
        role: "customer",
        customerId: linkedCustomerId,
      });

      customerLoginHint = ` Customer login: ${customerEmail} / ${customerPassword} at localhost:3200/k/${DEMO_SLUG}/login`;
    } else {
      console.log(
        "Skipping demo customer user in production — superadmin is the only seeded user.",
      );
    }

    await db.insert(customerBrandPricing).values(
      DEMO_BRAND_PRICING.map((bp) => {
        const customerId = customerByName.get(bp.customerName);
        if (!customerId) throw new Error(`Demo customer missing: ${bp.customerName}`);
        return {
          tenantId: demoTenant.id,
          customerId,
          brand: bp.brand,
          discountPct: bp.discountPct,
        };
      }),
    );

    let transmittedSeq = 0;
    for (const order of DEMO_ORDERS) {
      const customerId = customerByName.get(order.customerName);
      if (!customerId) throw new Error(`Demo customer missing: ${order.customerName}`);

      // Demo: pre-mark delivered orders as already transmitted to the ERP so the
      // "transmitted" state is visible in the UI without manual setup.
      const isTransmitted = order.status === "delivered";
      if (isTransmitted) transmittedSeq++;

      const [createdOrder] = await db
        .insert(orders)
        .values({
          tenantId: demoTenant.id,
          customerId,
          status: order.status,
          notes: order.notes,
          erpStatus: isTransmitted ? "transmitted" : "pending",
          erpMark: isTransmitted ? `4000${String(transmittedSeq).padStart(4, "0")}` : null,
          erpTransmittedAt: isTransmitted ? new Date() : null,
          erpTransmittedBy: isTransmitted ? superadminUser.id : null,
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
            originalQuantity: item.quantity,
            unitPrice: product.basePrice,
            productName: item.productName,
          };
        }),
      );
    }

    console.log(
      `Demo tenant seeded: tenant "${DEMO_SLUG}" + ${DEMO_CUSTOMERS.length} customers + ${DEMO_ORDERS.length} orders. ` +
        `Owner: the superadmin (use /admin to switch into /k/${DEMO_SLUG}).` +
        customerLoginHint,
    );
  });
}
