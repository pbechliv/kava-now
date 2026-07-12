# KavaNow marketing landing page + move app to app.kavanow.gr

Status: **planned, not implemented** (2026-07-11).

## Context

KavaNow is live at https://kavanow.gr, but `/` renders the login page — there is no public marketing presence, no SEO meta, no robots.txt. Decisions made:

- **Apex `kavanow.gr` becomes a static Greek marketing landing page** (plain HTML+CSS, no build step, mailto CTA — signup is invite-only, so no self-serve signup CTA).
- **The app (SPA + API) moves to `app.kavanow.gr`.** Old apex app URLs 301/308 to the new host.
- Served by the existing single Caddy container as two site blocks; ships atomically with the normal image deploy (the Caddyfile is baked into the caddy image at `Dockerfile:124` — the scp'd copy in `deploy.yml:98` is unused/vestigial).

Consequences accepted: all users re-login (host-only cookies), push subscriptions reset, Google OAuth console update, Origin CA cert must cover `app.kavanow.gr`.

---

## Part 1 — Landing page content (Greek)

New top-level `landing/` directory (NOT under `packages/` — it's not a workspace package): `index.html`, `styles.css`, `robots.txt`, `sitemap.xml`, `og-image.png` (1200×630), `sw.js` (kill-switch, see Part 2). Brand: amber-600 `#d97706` primary, amphora logo (reuse `packages/web/public/favicon.svg` + icons via Dockerfile COPY), system font stack, light theme. CSP-compliant: no inline scripts/styles.

Copy structure (full text authored during implementation):

- **Hero**: «Η πλατφόρμα παραγγελιών B2B για την κάβα σας» — υπότιτλος: οι πελάτες σας (εστιατόρια, καφέ, μπαρ) παραγγέλνουν online 24/7 από τον δικό σας τιμοκατάλογο· εσείς διαχειρίζεστε τα πάντα από ένα σημείο. CTA: «Ζητήστε παρουσίαση» (mailto) + δευτερεύον link «Σύνδεση» → https://app.kavanow.gr/login.
- **Features (6 κάρτες)**:
  1. Ψηφιακός κατάλογος — κατηγορίες, μάρκες, συσκευασίες (φιάλη/κιβώτιο/βαρέλι)
  2. Τιμολόγηση ανά πελάτη — εκπτώσεις ανά μάρκα και πελάτη
  3. Διαχείριση παραγγελιών — ροή εκκρεμής → επιβεβαιωμένη → απεστάλη → παραδόθηκε, ακυρώσεις/αντικαταστάσεις με πλήρες ιστορικό
  4. Διαβίβαση σε ERP & ΑΑΔΕ — καταχώριση MARK, myDATA-ready
  5. Εισαγωγή τιμοκαταλόγων — Excel/CSV με αποθηκευμένες αντιστοιχίσεις στηλών
  6. Ειδοποιήσεις — email & push στους υπεύθυνους κάθε πελάτη για νέες παραγγελίες
- **How it works (3 βήματα)**: Στήνουμε τον κατάλογό σας → Προσκαλείτε τους πελάτες σας → Λαμβάνετε παραγγελίες.
- **Footer**: επικοινωνία (mailto), «Σύνδεση», © KavaNow.
- **SEO/meta**: `lang="el"`, title «KavaNow — Η πλατφόρμα παραγγελιών B2B για κάβες», meta description, OG + twitter card tags, canonical `https://kavanow.gr/`, theme-color `#d97706`.

**CTA address**: `hello@kavanow.gr` via Cloudflare Email Routing (free; zone already on CF) forwarding to the superadmin gmail — one manual dashboard step (or terraform `cloudflare_email_routing_*`). Fallback if skipped: `ops@kavanow.gr`.

## Part 2 — Repo changes

### Caddyfile (two site blocks, shared global options)

- **`app.kavanow.gr`**: current `kavanow.gr` block verbatim (API proxy, `/assets/*` immutable caching, SPA try_files, current strict CSP, HSTS). Add `X-Robots-Tag: noindex, nofollow` header.
- **`kavanow.gr`** (new): same TLS lines;
  - `handle /api/health` → `reverse_proxy api:3000` (keeps existing Better Stack monitor + `infra/backup/README.md` curl working; monitor migration becomes non-urgent)
  - `handle /api/*` → `redir https://app.kavanow.gr{uri} 308` (method-preserving; `{uri}` keeps query strings — critical for old emailed better-auth token links)
  - `@app path /k/* /login /admin /admin/* /auth/* /assets/* /welcome` → `redir https://app.kavanow.gr{uri} 301`
  - default handle: `root * /srv/landing`, `file_server`; html `Cache-Control: public, max-age=300, must-revalidate`, other assets `max-age=3600`; **`/sw.js` must be no-cache** (kill-switch update checks)
  - Tight landing CSP: `default-src 'none'; style-src 'self'; img-src 'self' data:; font-src 'self'; base-uri 'self'; form-action 'none'; frame-ancestors 'none'; object-src 'none'`; same HSTS header as app block.

### Service worker kill-switch (`landing/sw.js`)

Without this, the old app SW stays registered on the apex forever (a 301 on `/sw.js` fails the browser's SW update check) and keeps intercepting apex navigations:

```js
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", async () => {
  await self.registration.unregister();
  const clients = await self.clients.matchAll({ type: "window" });
  clients.forEach((c) => c.navigate(c.url));
});
```

### Dockerfile (caddy target, ~line 123)

```dockerfile
COPY landing/ /srv/landing/
COPY packages/web/public/favicon.ico packages/web/public/favicon.svg packages/web/public/apple-touch-icon.png /srv/landing/
```

`build-images.yml` needs no change (context is repo root, target `caddy`).

### API

- `packages/api/src/auth/index.ts:98`: `trustedOrigins: [config.appOrigin, "https://kavanow.gr"]` — **required, not optional**: old invite/reset emails (72h token life, `AUTH_RESET_TOKEN_EXPIRES_IN_HOURS`) carry absolute apex `callbackURL`s built in `services/invite-user.ts:177`; after the 308 redirect better-auth validates that apex callbackURL against trustedOrigins and silently rejects it otherwise. Keep permanently (own host, zero risk). Implement as optional `LEGACY_ORIGINS` env parsed in `config.ts` (spread into the array) so dev/tests are unaffected.
- `APP_ORIGIN` flip is env-only (`.env.production` on the VM + `provision.yml:178` → `https://app.kavanow.gr`). It feeds better-auth baseURL, CORS, all email URLs. Passes `config.ts` prod validation.
- Cosmetic: example URL in `config.ts:69`; PreviewProps in `emails/MembershipAddedEmail.tsx:64`, `emails/SetPasswordEmail.tsx:94`.
- One-off at cutover: `DELETE FROM push_subscriptions;` (psql into the postgres container). Old-origin endpoints would otherwise keep receiving pushes whose clicks open apex URLs; the existing 404/410 auto-prune (`services/push.ts:48-55`) is not deterministic enough. Users re-opt-in organically on the new origin (`lib/push.ts` + `public/sw.js` are fully origin-relative — no code change needed).

### Web SPA

- `auth-client.ts` uses `window.location.origin` — no change.
- `packages/web/public/robots.txt`: `User-agent: *` / `Disallow: /` (belt-and-braces with the X-Robots-Tag header).
- `pages/superadmin/new-tenant-page.tsx:77`: displayed URL → `app.kavanow.gr/k/{slug}`.
- PWA installs from the apex will open the landing post-cutover — mention "reinstall from app.kavanow.gr" in user comms; not fixable server-side.

### Workflows

- `smoke-test.yml`: `host` input default → `app.kavanow.gr` (`--resolve` already sends correct SNI/Host for origin-direct probing past Bot Fight Mode). Add apex checks with `--resolve kavanow.gr:443:$ORIGIN_IP`: `GET /` → 200 + landing marker; `GET /login` → 301 `Location: https://app.kavanow.gr/login`; `GET /api/health` → 200. TLS-expiry step: `-servername app.kavanow.gr` (implicitly validates the new SAN).
- `provision.yml:178`: `APP_ORIGIN=https://app.kavanow.gr` (+ `LEGACY_ORIGINS` if added).
- `deploy.yml`: optionally drop the vestigial Caddyfile scp (line 98) — the image copy is the live one.
- `infra/backup/README.md:41`: update health-check example.

## Part 3 — Terraform / manual infra

- **`dns.tf`**: add `app` A/AAAA proxied records mirroring the apex ones (Hetzner IPs from `hcloud_server` outputs). Cloudflare Universal SSL edge cert covers first-level `*.kavanow.gr` — no edge-cert work. Apply days ahead (harmless: Caddy won't answer the vhost until the cutover image ships).
- **`cache.tf`**: host-scope the rules — keep `/api/*` bypass (path-only, both hosts); SPA-shell 60s rule → `http.host eq "app.kavanow.gr"`; new apex rule `http.host eq "kavanow.gr" and not /api/*` → cache, edge TTL 1h. **Apply the apex rule only after cutover** + purge zone cache, so a cached old SPA shell can't linger on the apex.
- **`waf.tf`**: no change (skip rule is path-only; `/api/health` + `/` already cover both hosts).
- **Origin CA cert**: verify first — `ssh deploy@VM 'sudo openssl x509 -in /etc/kavanow/tls/origin.pem -noout -ext subjectAltName'`. CF dashboard default issues `kavanow.gr, *.kavanow.gr`, so it may already cover app. If not: reissue in CF dashboard with both names → `gh secret set CF_ORIGIN_CERT` / `CF_ORIGIN_KEY` → `provision.yml action=bootstrap` (installs cert; also rewrites `.env.production` from current main = still old origin pre-cutover, which is correct) → caddy picks it up at next restart/deploy.
- **Google OAuth console** (manual, days ahead): ADD `https://app.kavanow.gr/api/auth/callback/google` redirect URI + `https://app.kavanow.gr` JS origin alongside the existing apex entries; remove apex entries a week+ later.
- **Cloudflare Email Routing**: create `hello@kavanow.gr` forward.

## Part 4 — Cutover runbook

**Phase 0 (days ahead, no live impact)**: verify/reissue Origin CA cert; Google console additions; terraform apply DNS records; set up hello@ routing.

**Phase 1 (single deploy = atomic flip)**:

1. Send yourself a fresh invite/reset email BEFORE cutover (test artifact for step 6).
2. Notify users: new URL, everyone re-logs-in, notifications need re-enabling, PWA reinstall.
3. Merge the cutover commit (landing/, Caddyfile, Dockerfile, trustedOrigins, workflows, web fixes). Deploy parks at the `production` approval gate — **do not approve yet**.
4. While parked, flip env on the VM: `ssh deploy@VM "sed -i 's#^APP_ORIGIN=.*#APP_ORIGIN=https://app.kavanow.gr#' /srv/kavanow/.env.production"` (manual, NOT provision bootstrap — bootstrap shares the `deploy-prod` concurrency group and would deadlock behind the parked run).
5. Approve. `up -d api caddy` recreates both containers together: api boots with new APP_ORIGIN as the new caddy starts serving both vhosts. Smoke runs automatically against the new host + apex.
6. Purge push subscriptions (one-off psql).

**Phase 2 (right after)**: Better Stack monitor → `app.kavanow.gr/api/health`, add apex landing monitor; terraform apply apex cache rule + purge CF zone cache. Manual validation:

- app.kavanow.gr: email+password AND Google login, tenant flows under `/k/<slug>`
- apex: landing renders; `/login`, `/k/demo`, `/admin` → 301 with path+query intact; `/api/health` 200; `/api/x` 308
- fresh invite email → link lands on app host and works
- **the pre-cutover email link** → redirect chain completes the token flow (this is the trustedOrigins test)
- re-enable push on one device → trigger an order notification
- browser that had the old SW: DevTools shows kill-switch unregistered it
- robots.txt: apex Allow, app Disallow

**Phase 3 (a week later)**: remove old Google console apex entries; Google Search Console: add both properties, submit apex sitemap.

## Key risks

| Risk | Mitigation |
|---|---|
| Old email callbackURL silently rejected by better-auth post-redirect | apex in trustedOrigins + pre-cutover-link test |
| Old SW immortal on apex (301'd /sw.js never updates) | kill-switch sw.js served 200 no-cache |
| Deploy approved before env flip → app host redirected while api trusts only apex | runbook ordering; approval gate makes it safe |
| Origin CA missing `*.kavanow.gr` SAN → CF 526 on app host | verify-first; smoke TLS step with new servername |
| Stale SPA shell edge-cached on apex | apex cache rule applied post-cutover + zone purge |

## Verification (implementation-time)

- Locally: `docker build --target caddy` + run the container, exercise both vhosts with `curl --resolve` (or hosts-file entries for `kavanow.gr` / `app.kavanow.gr`) before shipping.
- `pnpm typecheck && pnpm lint && pnpm fmt:check && pnpm test` for API/web changes.
- Landing HTML: render in browser preview, confirm zero CSP console violations, check meta/OG tags.
