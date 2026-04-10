# KavaNow — B2B SaaS Design Spec

## Context

Greek κάβες (liquor/wine stores) sell drinks wholesale to bars, restaurants, and cafes. Currently, ordering is done via phone, Viber messages, or in person — disorganized and error-prone. KavaNow gives each kava a digital workspace where their customers can browse assigned products at negotiated prices and place orders online. No payment processing — invoicing happens offline.

This is a **multi-tenant platform**: any kava can sign up and create their own workspace.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Vite + React, React Router, TanStack Query, Zustand (cart), Tailwind CSS, React Hook Form + Zod |
| Backend | Hono (Node.js), Drizzle ORM, Lucia Auth |
| Database | PostgreSQL with Row-Level Security |
| Email | Nodemailer (SMTP) |
| Deployment | Docker + Docker Compose, Caddy (reverse proxy, auto SSL, wildcard subdomains), VPS (Hetzner/DigitalOcean) |
| Monorepo | pnpm workspaces |
| Shared | Zod schemas & TypeScript types shared between FE/BE |
| Language | Greek-only UI |

---

## Multi-Tenancy

**Approach:** Shared database with tenant column (`kava_id` on every table) + PostgreSQL Row-Level Security.

**Tenant resolution flow:**
1. Extract subdomain from `Host` header → `slug`
2. Lookup kava by slug → `kava_id`
3. Set PostgreSQL session variable: `SET app.current_kava_id = '{kava_id}'`
4. RLS policies filter all queries using `current_setting('app.current_kava_id')`

Each kava gets a subdomain: `{slug}.kavanow.gr`

---

## Data Model

### Core Entities

**KAVA** (Tenant)
- `id` (UUID, PK), `name`, `slug` (unique), `logo_url`, `address`, `phone`, `email`, `notification_emails` (text[]), `settings` (jsonb), `created_at`

**USER**
- `id` (UUID, PK), `email` (unique), `name`, `role` (enum: owner, staff, customer), `kava_id` (FK), `customer_id` (FK, nullable — links customer-role users to their CUSTOMER record), `created_at`

**CATEGORY**
- `id` (UUID, PK), `kava_id` (FK), `name`, `parent_id` (FK, self-ref for subcategories), `sort_order`, `created_at`
- Default categories seeded on kava creation: Κρασιά, Μπύρες, Αποστάγματα, Λικέρ, Αναψυκτικά, Νερά, Χυμοί

**PRODUCT**
- `id` (UUID, PK), `kava_id` (FK), `name`, `brand`, `category_id` (FK), `description`, `image_url`, `sku` (optional), `base_price` (decimal), `unit` (enum: bottle, case, keg), `volume_ml` (int, optional), `alcohol_pct` (decimal, optional), `active` (boolean), `created_at`

**PRICING_TIER**
- `id` (UUID, PK), `kava_id` (FK), `name` (e.g., "Χρυσός", "Ασημένιος"), `discount_pct` (decimal), `created_at`

**CUSTOMER** (Bar/Restaurant)
- `id` (UUID, PK), `kava_id` (FK), `name`, `address`, `phone`, `contact_person`, `pricing_tier_id` (FK, nullable), `notes`, `created_at`

**CUSTOMER_PRODUCT** (Assignment join table)
- `customer_id` (FK), `product_id` (FK), `custom_price` (decimal, nullable), `active` (boolean)
- PK: (customer_id, product_id)

**ORDER**
- `id` (UUID, PK), `kava_id` (FK), `customer_id` (FK), `status` (enum: pending, confirmed, shipped, delivered, cancelled), `notes` (text, optional), `created_at`

**ORDER_ITEM**
- `id` (UUID, PK), `order_id` (FK), `product_id` (FK), `quantity` (int), `unit_price` (decimal — snapshot at order time), `product_name` (text — snapshot)

### Seed Catalog

**SEED_PRODUCT** (No kava_id — platform-wide)
- `id` (UUID, PK), `name`, `brand`, `category_name`, `description`, `image_url`, `volume_ml`, `alcohol_pct`, `unit`
- Pre-populated with common Greek market drinks
- When a kava "imports" a seed product, it's cloned into their PRODUCT table with their own price

### Auth Tables (Lucia)

**SESSION**
- `id` (text, PK), `user_id` (FK), `expires_at` (timestamp)

**MAGIC_LINK_TOKEN**
- `id` (UUID, PK), `email`, `token` (text, unique), `kava_id` (FK), `expires_at` (timestamp), `used` (boolean)

### Price Resolution

When displaying a price to a customer, resolve in this order:
1. `CUSTOMER_PRODUCT.custom_price` (per-product override) — if set, use it
2. `PRODUCT.base_price * (1 - PRICING_TIER.discount_pct / 100)` — if customer has a tier
3. `PRODUCT.base_price` — fallback

---

## Authentication

**Method:** Passwordless magic links via email, self-hosted with Lucia.

**Flow:**
1. User enters email on `{slug}.kavanow.gr/login`
2. Backend creates a single-use token (stored in `MAGIC_LINK_TOKEN`, expires in 15 minutes)
3. Email sent with link: `https://{slug}.kavanow.gr/auth/verify?token=abc123`
4. User clicks → backend verifies token, creates session (HttpOnly cookie, SameSite=Lax)
5. Redirect based on role: `owner/staff` → `/admin/dashboard`, `customer` → `/catalog`

**Kava owner signup:**
- Registration form at `kavanow.gr/register` → creates kava + owner user → sends magic link to verify email

**Customer invitation:**
- Kava admin adds a customer with email → system sends magic link → customer clicks → account auto-created and linked to the customer record

---

## Application Structure

### Two Portals (same SPA, route-based)

**Kava Admin Portal** (`/admin/*`) — for kava owners and staff:
- **Dashboard** — order summary, recent orders, notifications
- **Προϊόντα (Products)** — CRUD, add from seed catalog
- **Κατηγορίες (Categories)** — manage product categories & subcategories
- **Πελάτες (Customers)** — manage bar/restaurant records
- **Ανάθεση Προϊόντων (Product Assignment)** — per-customer product selection with optional price overrides
- **Τιμολόγηση (Pricing)** — manage pricing tiers
- **Παραγγελίες (Orders)** — list, details, status management
- **Ρυθμίσεις (Settings)** — kava details, notification emails, staff management

**Customer Portal** (`/catalog`, `/cart`, `/orders`) — for bars/restaurants:
- **Κατάλογος (Catalog)** — browse assigned products by category with search/filter, quantity inputs
- **Καλάθι (Cart)** — review quantities, add notes, submit order
- **Ιστορικό (Order History)** — past orders with 1-click reorder
- **Προφίλ (Profile)** — business details

### URL Structure

```
# Platform
https://kavanow.gr/                         Landing page + signup
https://kavanow.gr/register                 Kava registration

# Per-tenant (subdomain)
https://{slug}.kavanow.gr/login             Magic link login
https://{slug}.kavanow.gr/auth/verify       Token verification

# Admin
https://{slug}.kavanow.gr/admin/dashboard
https://{slug}.kavanow.gr/admin/products
https://{slug}.kavanow.gr/admin/products/new
https://{slug}.kavanow.gr/admin/products/:id
https://{slug}.kavanow.gr/admin/categories
https://{slug}.kavanow.gr/admin/customers
https://{slug}.kavanow.gr/admin/customers/:id
https://{slug}.kavanow.gr/admin/customers/:id/products
https://{slug}.kavanow.gr/admin/pricing
https://{slug}.kavanow.gr/admin/orders
https://{slug}.kavanow.gr/admin/orders/:id
https://{slug}.kavanow.gr/admin/settings

# Customer
https://{slug}.kavanow.gr/catalog
https://{slug}.kavanow.gr/catalog/:category
https://{slug}.kavanow.gr/cart
https://{slug}.kavanow.gr/orders
https://{slug}.kavanow.gr/orders/:id
https://{slug}.kavanow.gr/profile
```

---

## API Design

All API routes prefixed with `/api`. Tenant resolved via subdomain middleware on every request.

### Platform (`/api/platform`) — served from main domain `kavanow.gr`

| Method | Path | Description |
|--------|------|-------------|
| POST | `/platform/register` | Kava signup (name, slug, email) → creates kava + owner, sends magic link |

### Auth (`/api/auth`) — served from tenant subdomain `{slug}.kavanow.gr`

| Method | Path | Description |
|--------|------|-------------|
| POST | `/auth/login` | Request magic link (email) |
| GET | `/auth/verify` | Verify magic link token, create session |
| POST | `/auth/logout` | Destroy session |
| GET | `/auth/me` | Current user + kava info |

### Admin (`/api/admin`) — requires role: owner or staff

| Method | Path | Description |
|--------|------|-------------|
| GET | `/admin/dashboard/stats` | Order counts, recent activity |
| GET/POST | `/admin/products` | List / create products |
| GET/PUT/DELETE | `/admin/products/:id` | Read / update / delete product |
| GET/POST | `/admin/categories` | List / create categories |
| PUT/DELETE | `/admin/categories/:id` | Update / delete category |
| GET/POST | `/admin/customers` | List / create customers (+ send invite) |
| GET/PUT/DELETE | `/admin/customers/:id` | Read / update / delete customer |
| GET/PUT | `/admin/customers/:id/products` | Get / update product assignments for customer |
| GET/POST | `/admin/pricing-tiers` | List / create pricing tiers |
| PUT/DELETE | `/admin/pricing-tiers/:id` | Update / delete tier |
| GET | `/admin/orders` | List orders (filterable by status, customer, date) |
| GET | `/admin/orders/:id` | Order details |
| PUT | `/admin/orders/:id/status` | Update order status |
| GET | `/admin/seed-catalog` | Browse seed product catalog |
| POST | `/admin/seed-catalog/import` | Clone seed product(s) into kava's products |
| GET/PUT | `/admin/settings` | Kava settings |

### Customer (`/api/customer`) — requires role: customer

| Method | Path | Description |
|--------|------|-------------|
| GET | `/customer/catalog` | Assigned products with resolved prices |
| GET | `/customer/catalog?category=:id` | Filter by category |
| POST | `/customer/orders` | Submit new order |
| GET | `/customer/orders` | Order history |
| GET | `/customer/orders/:id` | Order details |
| POST | `/customer/orders/:id/reorder` | Clone order items into a new order |
| GET | `/customer/profile` | Business profile |

---

## Notifications

**Order placed** (customer → kava):
- Email sent to all addresses in `kava.notification_emails`
- Contains: customer name, order items summary, total, link to order in admin
- Order appears in admin dashboard with "Νέα" badge

**Magic link** (system → user):
- Login/invitation email with verification link
- 15-minute expiry, single-use

**Order status change** (kava → customer):
- Email sent to customer's email when status changes (confirmed, shipped, delivered)

---

## Monorepo Structure

```
kava-now/
  packages/
    web/                    Vite + React SPA
      src/
        pages/
          admin/            Admin portal pages
          customer/         Customer portal pages
          auth/             Login, verify, register
        components/         Shared UI components
        lib/                API client, hooks, utils
    api/                    Hono API server
      src/
        routes/             Route handlers (admin, customer, auth)
        middleware/          Auth, tenant resolution, RLS setup
        db/                 Drizzle schema, migrations, seed data
        services/           Business logic (orders, email, pricing)
    shared/                 Shared Zod schemas, types, constants
  docker-compose.yml        PostgreSQL + API + Web + Caddy
  Caddyfile                 Wildcard subdomain config
  pnpm-workspace.yaml
```

---

## Deployment

- **Docker Compose** with 4 services: `postgres`, `api`, `web`, `caddy`
- **Caddy** handles wildcard `*.kavanow.gr` SSL + reverse proxy
- **VPS** on Hetzner or DigitalOcean
- **Dev environment**: `docker-compose.dev.yml` with hot reload for both web and api
- Domain `kavanow.gr` with wildcard DNS (`*.kavanow.gr` → VPS IP)

---

## MVP Scope Summary

**In scope:**
- Multi-tenant workspaces with subdomain routing
- Passwordless auth (magic links) via Lucia
- Product CRUD + seed catalog selection
- Categories with subcategories
- Customer management with product assignment
- Pricing tiers + per-customer price overrides
- Order placement (cart-based) with status tracking
- 1-click reorder from history
- Email notifications (order placed, status change, magic links)
- Product search and category filtering
- Greek-only UI, fully responsive
- Docker-based deployment with Caddy

**Out of scope (future):**
- Payment processing
- CSV/bulk product import
- Barcode scanning
- Analytics dashboard
- WhatsApp/Viber notifications
- Multi-language support (i18n)
- Mobile native app

---

## Verification Plan

1. **Kava signup flow**: Register a new kava → verify email → land on admin dashboard
2. **Product management**: Create categories → add products manually → add from seed catalog → verify in product list
3. **Customer setup**: Create customer → assign pricing tier → assign product subset with custom prices → send invite
4. **Customer ordering**: Login as customer → browse catalog (verify only assigned products show) → verify resolved prices → add to cart → submit order
5. **Order processing**: Verify kava receives email notification → order appears in admin → change status → verify customer receives status email
6. **Tenant isolation**: Create second kava → verify data is completely isolated
7. **Responsive**: Test admin and customer portals on mobile viewport
