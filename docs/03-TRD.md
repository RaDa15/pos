# TRD — POS SYSTEM

## 1. Tech stack

### 1.1 Current prototype (reference only — `prototype/`)

| Layer | What it uses |
|---|---|
| UI | One `index.html`, vanilla JavaScript (`script.js`, ~2,900 lines), string-template rendering into `#app`, inline `onclick` handlers |
| Styling | `style.css` with CSS custom properties (tokens in `09-DESIGN.md`) |
| Data | Browser `window.storage` if present, else `localStorage` with prefix `nimbus_pos:`; whole collections saved as JSON per key `biz:<businessId>:<collection>` |
| Auth | Plain-text passwords compared in the browser; hard-coded platform admin `platform/platform` |
| PDF | jsPDF 2.5.1 from cdnjs |
| Fonts | Google Fonts: Manrope, IBM Plex Mono, Noto Sans Tibetan |
| Logo | Base64 PNG embedded in `logo.js` (`LOGO_DATA_URI`) |
| Build | None |

The prototype is kept read-only as the behavior reference. Nothing from it is deployed.

### 1.2 v1 target

| Layer | Choice | Version | Why |
|---|---|---|---|
| Language | TypeScript (strict) everywhere | 5.x | One language front to back; shared types for API and money logic |
| Repo | pnpm workspaces monorepo: `apps/web`, `apps/api`, `packages/shared` | pnpm 9+ | POS preview and server use the same calculation code (D-02) |
| Frontend | React + Vite | React 19, Vite latest stable | Component model fits the prototype's screen-per-function structure; fast dev server |
| Routing | React Router | 7.x | URL per screen (prototype had none) |
| Server state | TanStack Query | 5.x | Caching, refetch after mutations, loading/error states |
| Forms & validation | React Hook Form + Zod (schemas from `packages/shared`) | latest | Same validation rules on client and server |
| POS cart state | Zustand store, persisted to `sessionStorage` | 5.x | Cart survives an accidental refresh but not a closed tab; no business data in `localStorage` |
| Styling | Plain CSS with custom properties ported from `prototype/style.css` + CSS Modules per component | — | Keeps the existing look with no new framework (D-09) |
| i18n | i18next + react-i18next, `en` and `dz` JSON | latest | Replaces the prototype's partial `I18N` map (D-10) |
| Charts | Hand-built CSS bar and donut charts ported from the prototype | — | Small, no library needed for v1 |
| PDF | jsPDF in the browser | 2.5.x | Same 80 mm receipt layout as the prototype (D-08) |
| Backend | Node.js + Express | Node 24 LTS, Express 5 | Familiar to the team (MERN background); simple REST |
| ORM & migrations | Prisma | latest stable | Typed queries, migration files, seed script (D-03) |
| Database | PostgreSQL | 17 | Transactions and row locks for invoice numbers and stock; numeric money (D-03) |
| Sessions | `express-session` + `connect-pg-simple` (sessions table) | latest | Revocable server sessions in httpOnly cookies (D-05) |
| Password hashing | argon2 (argon2id) | latest | D-06 |
| Platform admin 2FA | otplib (TOTP) | latest | Platform Admins control every business (`05-SECURITY-ACCESS.md` §1.2) |
| Images | `multer` upload + `sharp` resize, stored on a disk volume | latest | D-14 |
| Security middleware | helmet, express-rate-limit, CSRF token (double-submit) | latest | See `05-SECURITY-ACCESS.md` |
| Logging | pino (JSON logs) | latest | |
| Testing | Vitest (unit, shared + api), Supertest (API), Playwright (E2E) | latest | |
| Container | Docker + Docker Compose | — | Same setup locally and on the server (D-15) |

Pin exact versions in `package.json` during Phase 0 and record them in `13-MEMORY.md`.

## 2. Integrations

| Service | Purpose | How | If it fails |
|---|---|---|---|
| USB / Bluetooth barcode scanner | Add items at POS | Scanner types the code + Enter into the focused scan box (keyboard wedge), as in prototype | Cashier types or searches the product |
| 80 mm thermal receipt printer | Print tax invoice | Browser print dialog on the receipt page with `@media print` CSS | Download PDF instead |
| jsPDF (bundled, not CDN) | Receipt PDF | Generated in the browser | Show "PDF unavailable — use Print" |
| Google Fonts | Manrope, IBM Plex Mono, Noto Sans Tibetan | Self-hosted font files in `apps/web/public/fonts` (prototype loaded from Google) | N/A once self-hosted |
| Mobile wallets / banks (mBoB, mPay, TPay, DK Bank, banks) | Customer payments | **No API in v1.** Cashier records method + transaction ID | N/A |
| Subscription payments | Businesses pay Yuevaán | **No gateway in v1.** Admin submits method + reference; Platform Admin verifies (D-12) | N/A |
| Email / SMS | — | Not in v1 | — |

## 3. Non-functional requirements

| Area | Requirement |
|---|---|
| Performance — POS | Adding an item updates the cart and totals in < 100 ms (computed client-side with the shared engine). `POST /sales` responds in < 500 ms p95 with 30 lines. Product search returns in < 300 ms for 10,000 products. |
| Performance — reports | GST, sales and payment reports for one month (up to 20,000 sales) load in < 2 s. |
| Performance — first load | Signed-in POS screen interactive in < 3 s on a mid-range Android tablet over 4G. |
| Availability | 99.5% monthly during 08:00–22:00 BTT. |
| Offline | Not supported in v1 (D-11). When the network drops, show a red "Offline — sales can't be completed" bar and disable "Complete sale"; the cart stays. |
| Concurrency | Several employees of one business use it at once on different devices; invoice numbers and stock stay correct (BR-21, BR-23). |
| Scale (first year) | 100 businesses, 25 employees each, 20,000 sales per business per year, 5,000 products per business. |
| Devices & browsers | Chrome and Edge (last 2 versions) on Windows 10+, Android 10+ tablets; Safari on iPad (last 2 versions). Widths 360–1920 px. |
| Accessibility | WCAG 2.1 AA for colors, focus and keyboard use (`09-DESIGN.md` §5). |
| Localization | English and Dzongkha UI; currency "Nu." with Indian digit grouping (1,23,456.00) as in prototype; dates DD/MM/YYYY; time zone Asia/Thimphu. |
| Data retention | Sales, payments and audit logs kept at least 7 years; nothing financial is hard-deleted. **Assumption** — confirm the legal period with DRC. |
| Backups | Nightly `pg_dump` kept 30 days off-server; restore tested monthly. |
| Security | `05-SECURITY-ACCESS.md`. |

## 4. Environments

| Env | URL | Purpose | Data |
|---|---|---|---|
| Local | `http://localhost:5173` (web), `http://localhost:4000` (api) | Development | Seed: 4 demo businesses (F-25) |
| Staging | `https://staging.<domain>` | Testing and client demos | Seed demo businesses + test data |
| Production | `https://app.<domain>` | Live | Real; demo businesses never seeded |

Domain: see Open questions.

**Environment variables** (names only; values in `.env`, never committed):

| Name | Used by | Description |
|---|---|---|
| `NODE_ENV` | api | `development`, `staging`, `production` |
| `PORT` | api | API port (default 4000) |
| `DATABASE_URL` | api | PostgreSQL connection string |
| `SESSION_SECRET` | api | Signs session cookies (≥ 32 random bytes) |
| `SESSION_TTL_HOURS` | api | Normal session lifetime (default 12) |
| `REMEMBER_DEVICE_DAYS` | api | Company-remembered device lifetime (default 30) |
| `CORS_ORIGIN` | api | Web app origin |
| `UPLOAD_DIR` | api | Folder for product images and logos |
| `PUBLIC_UPLOAD_BASE_URL` | api | URL prefix that serves `UPLOAD_DIR` |
| `TOTP_ENCRYPTION_KEY` | api | Encrypts Platform Admin TOTP secrets at rest (32 bytes, base64) |
| `PLATFORM_ADMIN_EMAIL` | api (seed only) | First platform admin created by the seed script |
| `PLATFORM_ADMIN_INITIAL_PASSWORD` | api (seed only) | Must be changed at first sign-in |
| `SEED_DEMO_BUSINESSES` | api (seed only) | `true` on local/staging only |
| `SEED_DEMO_PASSWORD` | api (seed only) | Company and employee password for demo businesses (min 8 chars) |
| `VITE_API_BASE_URL` | web | API base URL, e.g. `/api/v1` |

## 5. Deployment

- **Build:** `pnpm build` builds `packages/shared`, then `apps/api` (tsc) and `apps/web` (Vite static files).
- **Run:** Docker Compose on one Linux VPS: `nginx` (TLS, serves web static files, proxies `/api` and `/uploads` to the API), `api` (Node), `postgres` (with a named volume), `uploads` volume.
- **Migrations:** `prisma migrate deploy` runs on API container start before it accepts traffic.
- **CI (GitHub Actions):** on every PR, run lint, type-check, unit tests, API tests against a Postgres service container, and Playwright smoke tests. Deploy to staging on merge to `main`; production by tagged release.
- **Rollback:** redeploy the previous image tag; migrations are written to be backward-compatible for one release.
- **Backups:** nightly cron container runs `pg_dump`, encrypts it, copies it off-server; uploads volume synced daily.

## 6. Technical decisions

| ID | Decision | Alternatives considered | Reason |
|---|---|---|---|
| D-01 | Rebuild as a production SaaS on React + Node + PostgreSQL; keep the prototype only as reference | Harden the browser-only prototype | Real multi-tenancy, hashed passwords and shared data across devices are impossible in browser storage (user decision, 2026-10-23) |
| D-02 | pnpm monorepo with `packages/shared` for money engine, enums, labels and Zod schemas | Separate repos; duplicate logic | POS preview totals and server totals must be identical (BR-16) |
| D-03 | PostgreSQL 17 + Prisma | MongoDB; raw SQL | Sales need multi-row transactions, row locks and exact numeric money |
| D-04 | Shared database, `business_id` on every tenant table, enforced by a tenant-scoped data layer; Postgres row-level security deferred to v2 | Database per tenant; RLS now | Simple to run for 100 businesses; isolation tested by AC-58 to AC-60 |
| D-05 | Server-side sessions in Postgres with httpOnly cookies | JWT in localStorage | Disabling an employee or suspending a business takes effect immediately; no token in JS |
| D-06 | argon2id for all passwords | bcrypt | Current recommended password hash |
| D-07 | Money: `numeric(12,2)` in the database; integer chhertum inside the shared engine; JSON numbers with 2 decimals | Floats (prototype); decimal strings in JSON | Exact sums without making API payloads awkward |
| D-08 | Keep jsPDF client-side for receipt PDFs, bundled with the app | Server-side PDF | Same output as prototype; no server load |
| D-09 | Plain CSS + CSS Modules with the prototype's tokens | Tailwind | Reuses the approved prototype design directly |
| D-10 | i18next with `en.json` and `dz.json`; missing Dzongkha keys fall back to English | Keep prototype's map | Proper fallback and pluralization; translators edit JSON |
| D-11 | v1 is online-only | Offline queue with sync | Offline invoice numbering and stock conflicts are complex; revisit in v2 after pilot feedback. **Assumption** — see Open questions |
| D-12 | Subscription payments verified manually by a Platform Admin | Payment gateway | No gateway contract yet; matches how Bhutanese businesses pay (bank transfer, mBoB) |
| D-13 | Invoice sequence per business per calendar year, allocated in the sale transaction | Global sequence; never reset (prototype) | Serially numbered tax invoices that are readable by year (BR-23) |
| D-14 | Images on a disk volume, resized to max 400 px (products) / 300 px (logos), stored as WebP | Base64 in DB (prototype stored data URLs); S3 | Small, fast, no third-party account in v1 |
| D-15 | Docker Compose on one VPS with nightly off-server backups | PaaS | Low cost; hosting provider still to be chosen (Open questions) |

## 7. Technical constraints

- No paid third-party services required to run v1 (beyond hosting and a domain).
- Must work on low-end Android tablets: keep the POS bundle under 300 KB gzipped (excluding fonts), no heavy UI libraries.
- Everything must work with a keyboard-wedge barcode scanner: the scan box keeps focus on the POS screen (as prototype).
- Business data must never be stored in `localStorage` or `IndexedDB`. Allowed client storage: the language preference before sign-in (`localStorage`) and the current cart (`sessionStorage`). The remembered device is an httpOnly cookie (`05-SECURITY-ACCESS.md` §1).
- The prototype's backup JSON format (`app: "POS SYSTEM"`, `version: 1`, `collections`) must stay importable (F-21).
