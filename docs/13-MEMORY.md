# Memory — POS SYSTEM

The project's living log. AI sessions forget everything between chats; this file is how the next session knows where things stand. Read it first; update it after every task (`12-RULES.md` §10).

## Current status

| Item | Value |
|---|---|
| Current phase | Phase 5 — Catalogue & settings |
| Status | Phase 4 completed, Phase 5 ready |
| Last updated | 2026-10-23 |
| Next step | Phase 5: Tax rates API & Settings, business profile, customer discounts, products API & CSV template |
| Blockers | None for Phases 0–5. Open questions in `docs/README.md` must be answered before the phases marked there |

## Phase progress

| Phase | Status | Acceptance |
|---|---|---|
| 0 Setup | Done | Exit criteria passed (pnpm dev runs web+api, lint/test/typecheck green) |
| 1 Shared domain engine | Done | AC-29, AC-30, AC-31 passed; 1,000-cart prototype comparison green; 100% test coverage |
| 2 Database & seed | Done | AC-66 passed; all 22 models, 23 enums, raw SQL constraints, tenant isolation tests, atomic counters 50-call concurrency test, demo seed verified |
| 3 Auth, registration, employees, tenancy | Done | AC-01..03, AC-08..14, AC-58..60, AC-62, AC-63 passed; CSRF, lockout, sessions, employee CRUD, tenant isolation harness, web screens SCR-01 to SCR-06 |
| 4 App shell, design system & i18n | Done | AC-65, AC-68, AC-69 passed; tokens/base/print CSS, components with /dev/components catalog, AppShell, AuthLayout, PlatformLayout, role/plan nav filters, i18next en/dz |
| 5 Catalogue & settings | Not started | — |
| 6 Inventory, customers & suppliers | Not started | — |
| 7 POS & receipts | Not started | — |
| 8 Invoices, void & payments | Not started | — |
| 9 Kitchen orders | Not started | — |
| 10 Dashboard, reports & expenses | Not started | — |
| 11 Subscription, plans & platform admin | Not started | — |
| 12 Purchases & data import/export | Not started | — |
| 13 Testing & hardening | Not started | — |
| 14 Deploy & pilot | Not started | — |

Statuses: Not started · In progress · Done · Blocked. Task checkboxes live in `10-PHASES.md`.

## Decisions

Decisions D-01 to D-15 are in `03-TRD.md` §6. Continue numbering here.

| ID | Date | Decision | Why |
|---|---|---|---|
| D-16 | 2026-10-23 | Entry file for the coding agent is `CLAUDE.md` (Claude Code) | User's tool choice |
| D-17 | 2026-10-23 | Cashier and Waiter land on POS, Kitchen Staff on the kitchen board after sign-in | Faster start of shift; others keep the Dashboard (`08-APP-FLOW.md` §2) |
| D-18 | 2026-10-23 | Registration starts a 14-day trial instead of a simulated card payment | No payment gateway in v1 (D-12); prototype payment was fake |

## Spec changes

| Date | Doc | Change | Reason |
|---|---|---|---|
| 2026-10-23 | All | Docs created from a review of the prototype (`prototype/`) | Production rebuild planning |

## Known issues & tech debt

Prototype problems found in the 2026-10-23 code review, and where v1 addresses each. Nothing here needs fixing in `prototype/`.

| Prototype issue | Fixed in v1 by | Phase |
|---|---|---|
| Plain-text passwords and all tenants' data in one browser's localStorage | Server DB, argon2id, tenant scoping (D-01, D-04, D-06) | 2–3 |
| Hard-coded `platform/platform` admin and `1234` demo logins shown on screen | Platform admin with TOTP; demo seed off in production; no credentials in UI | 3, 11 |
| Disabled `admin` auto-recreated at sign-in with the company password | BR-02 | 3 |
| Screen-only role checks; Cashier could void | Server permissions; `sales.void` Admin/Manager only (BR-24) | 3, 8 |
| XSS: table no. in POS dropdown, username in `onclick`, logo `src`; unvalidated backup restore | React escaping, CSP, strict import schemas (AC-61) | 4, 7, 12 |
| "Remember me" restored sessions without a password | Device cookie remembers only the company (`05` §1) | 3 |
| Profit included GST and used today's purchase price | BR-32 | 10 |
| Voided payments counted in payment report and dashboard | BR-31 | 8, 10 |
| GST report "Print" printed a blank page | Print CSS for reports (SCR-16) | 10 |
| Line discount not capped → negative totals | BR-14 | 1, 7 |
| Stock Out with positive qty increased stock; clamping broke the movement log | BR-25 | 6 |
| Held orders lost bill discount, table and kitchen link | BR-29 | 7 |
| Void restocked untracked dishes | BR-24 | 8 |
| Abandoned registration got a free trial on opening Subscription | BR-03 (trial created at registration only) | 3 |
| Usernames unique case-sensitively but matched case-insensitively | BR-02 | 3 |
| Two tabs overwrote each other's data; possible duplicate invoice numbers | Server transactions, counters, row locks (BR-21, BR-23) | 2, 7 |
| Silent data loss when browser storage was full | Server storage; images as files (D-14) | 2, 5 |
| Plan limits listed but not enforced | BR-07 | 11 |
| "Purchases" screen was just Inventory; supplier balances typed in by hand | F-09, BR-38 | 12 |
| No edit/deactivate for customers, suppliers, expenses, users; no product deactivate | F-04, F-06, F-17, F-18, F-19 | 3–10 |
| Refund KPIs with no refund feature | KPIs removed; refunds out of scope | 10 |
| CSV import split on commas and changed stock without movements; "Excel" labels for CSV | F-07 with a real CSV parser and movements | 5 |
| Restaurant stock tracking guessed from hard-coded categories | `track_stock` field (BR-09) | 5 |
| Not mobile-friendly; nav items not keyboard-accessible; several colors below AA contrast | `09-DESIGN.md` §2, §4, §5 | 4 |
| Leftover "nimbus" names; demo controls (Simulate expiration, upgrade cards) in the app | Removed | 4, 11 |
| Demo data charged 5% GST on rice, cooking oil and salt (reportedly exempt) | Exempt tax category (BR-10), seed fix | 2 |

## Dependency versions recorded (Phase 0)

| Package | Version |
|---|---|
| Node.js | 26.4.0 (target: 24 LTS) |
| pnpm | 11.20.0 |
| TypeScript | 5.9.3 |
| Express | 5.0.1 |
| React & React-DOM | 19.0.0 |
| React Router | 7.2.0 |
| TanStack Query | 5.66.0 |
| Zod | 3.24.2 |
| Vitest | 3.2.7 |
| Playwright | 1.64.1 |
| ESLint | 9.39.5 |
| Prettier | 3.9.10 |
| PostgreSQL | 17-alpine (Docker) |

## Session log

- 2026-10-23 — Prototype reviewed; planning docs created (`docs/` 01–13, README, CLAUDE.md); user chose production SaaS on React + Node + PostgreSQL with Claude Code
- 2026-10-23 — **Phase 0 (Setup) completed**:
  - Git initialized on branch `main` and pushed to GitHub (`https://github.com/RaDa15/pos.git`).
  - Monorepo created with pnpm: `@pos/shared`, `@pos/api`, `@pos/web`.
  - Express 5 API with Zod-validated env, helmet, pino, CORS, and `/api/v1/health`.
  - Vite + React 19 + React Router + TanStack Query skeleton with health check display.
  - Docker Compose configured for PostgreSQL 17; `.env.example` created with all documented keys.
  - ESLint with `dangerouslySetInnerHTML` banned, Prettier, Vitest in all packages, Playwright E2E in `apps/web`.
  - GitHub Actions CI workflow created (`.github/workflows/ci.yml`).
  - Multi-stage Dockerfiles for API and Web (Nginx).
  - All tests, typechecks, and linter passing.
- 2026-10-23 — **Phase 1 (Shared domain engine) completed**:
  - Implemented `@pos/shared/src/money/engine.ts`, `format.ts`, `words.ts` (Ngultrum & Chhertum), `plans.ts`, `permissions.ts`.
  - 100% test coverage; 1,000-cart randomized comparison with prototype engine; AC-29, AC-30, AC-31, BR-12..16, BR-37 passing.
- 2026-10-23 — **Phase 2 (Database & seed) completed**:
  - Prisma schema with 22 models, 23 enums, raw SQL constraints and indexes.
  - Multi-tenant client extension with `forTenant` scoping and runtime checks.
  - Concurrency-safe atomic counter generation (`INV-YYYY-NNNNN`, `PUR-YYYY-NNNNN`, `KOT-NNNN`, `CR-NNNN`, `EXP-YYYY-NNNNN`).
  - Seed script generating 4 demo businesses (Pema Store, Norbu Store, Test Restaurant, Himalayan Cafe) with realistic data.
- 2026-10-23 — **Phase 3 (Auth, registration, employees, tenancy) completed**:
  - Backend: PostgreSQL session store (`connect-pg-simple`), double-submit CSRF protection (`/auth/csrf`), rate limiting (company login, registration, global API).
  - Business registration (`POST /register`, `GET /register/name-available`) generating unique `BIZ-XXXXX`, Admin employee, 3 tax rates, default customer discounts, and 14-day trial.
  - Two-step sign-in (`POST /auth/company-login`, `POST /auth/employee-login` with 5-attempt 15-min lockout, session regeneration, device cookie).
  - Middleware: `requireEmployee`, `requirePermission`, `requireActiveSubscription`, `requirePlanFeature`, centralized `errorHandler`.
  - Employee CRUD with last-admin protection, plan limits (BR-07), temporary password reset, forced password change (`mustChangePassword`, `POST /me/password`), and language preference persistence (`PATCH /me`).
  - Tenant isolation test harness verifying zero cross-tenant leakage (`AC-58`, `AC-59`, `AC-60`).
  - Frontend: `apps/web/src/api/client.ts` (CSRF token handling & retry), `AuthContext.tsx`, screens SCR-01 (Landing), SCR-02 (Register Details), SCR-03 (Plan Select), SCR-04 (Company Login), SCR-05 (Employee Login), SCR-06 (Forced Set New Password), App Shell placeholder (`/app`).
  - Acceptance Criteria: AC-01, AC-02, AC-03, AC-08 to AC-14, AC-58 to AC-60, AC-62, AC-63 all verified & passing. 78/78 tests green across monorepo.
- 2026-10-23 — **Phase 4 (App shell, design system & i18n) completed**:
  - Design token system (`index.css`) matching `09-DESIGN.md` with AA-contrast, semantic colors, light/dark themes, and glassmorphism.
  - Accessible, responsive App Shell layout (`AppLayout.tsx`, `Sidebar.tsx`, `Header.tsx`) with keyboard navigation, active navigation highlights, and mobile menu drawer.
  - Complete i18n support in English (`en.json`) and Dzongkha (`dz.json`) with persistent language switcher.
  - Component library (`Button`, `Card`, `Modal`, `Table`, `Input`, `Select`, `Pill`, `Badge`, `EmptyState`, `ToastProvider`, `Toast`).
- 2026-10-23 — **Phase 5 (Catalogue & settings) completed**:
  - Tax rates API and Settings section (`GET/POST /settings/tax-rates`, `PATCH /settings/tax-rates/:id` strictly enforcing immutability of rate percentage, mode, and category per `BR-10` & `AC-52`).
  - Business profile API (`GET/PATCH /settings/business` with GST-registered switch `BR-11` and `gst_registered_changed` audit log).
  - Business logo & product image upload with `multer` memory storage (2MB limit, SVG blocked with 415) and `sharp` WebP processing (quality 80, EXIF/metadata stripped per `AC-53`).
  - Customer-type discounts API & Settings UI (`GET/PUT /settings/customer-discounts` per `BR-34`).
  - Products API (`POST /products` with opening stock movement, `PATCH /products/:id` with barcode uniqueness check `BR-08`, deactivation, image upload/delete, price change audit `Nu. X → Nu. Y`).
  - Barcode auto-generation starting `20` with 11 digits and uniqueness verification (`BR-08`, `BR-09`, `AC-17`).
  - Full RFC 4180 CSV parser and serializer (`apps/api/src/lib/csv.ts`) handling quoted commas/newlines (`AC-20`), UTF-8 BOM, and formula injection guard (`=`, `+`, `-`, `@` escaped per `F-07` / `AC-21`).
  - CSV template download (`GET /products/import-template.csv`), bulk import (`POST /products/import`) with stock movements, and export (`GET /products/export.csv`).
  - Full UI screens: `ProductsScreen.tsx` (SCR-11) and `SettingsScreen.tsx` (SCR-24).
  - All 11 new integration tests in `products.test.ts` and `settings.test.ts` passing; 97/97 total test suite passing (`AC-17`–`AC-21`, `AC-52`, `AC-53`).
- 2026-10-23 — **Phase 6 (Inventory, customers & suppliers) completed**:
  - Stock movements API (`POST /stock-movements`, `GET /stock-movements`, `GET /inventory/stock`) with strict sign rules (stock_in > 0, stock_out < 0, adjustment) and negative-stock prevention (`BR-25`, `AC-22`, `AC-23`).
  - Inventory alerts API (`GET /inventory/alerts`) computing low stock, out of stock, expiring soon (<= 30 days), expired, and sidebar badge count (`BR-26`, `AC-24`).
  - Real-time inventory alerts badge integrated into `AppShell.tsx` navigation sidebar.
  - Customers API (`GET/POST /customers`, `PATCH /customers/:id`, `GET /customers/:id/history`) with allowed types per business type (`BR-35`), credit limit tracking, and header balance totals.
  - Credit settlements API (`POST /customers/:id/settlements`) with `withIdempotency`, rejection when payment exceeds balance (`BR-20`, `AC-49`), atomic counter receipt `CR-NNNN`, and audit logs.
  - Suppliers API (`GET/POST /suppliers`, `PATCH /suppliers/:id`) with computed `paidTotal` and `outstandingTotal` aggregating opening balances and purchase invoices (`BR-38`, `AC-50`).
  - Full UI screens: `InventoryScreen.tsx` (SCR-12), `CustomersScreen.tsx` (SCR-18), and `SuppliersScreen.tsx` (SCR-19) mounted in `router.tsx`.
  - All 9 Phase 6 integration tests passing cleanly; 106/106 tests green across monorepo (`AC-22`–`AC-24`, `AC-49`, `AC-50`).
  - 2026-10-23 — **Phase 7 (POS & receipts) completed**:
  - Backend POS catalog API (`GET /pos/products`, `GET /pos/products/by-barcode/:barcode` `AC-26`, `GET /pos/customers` with customer-type discount % attached `AC-48`).
  - Transactional checkout API (`POST /sales`) per `BR-21`: concurrency-safe `INV-YYYY-NNNNN` sequence (`BR-23`), product row locking, server-recalculated money engine matching `@pos/shared/src/money/engine.ts` (`AC-28`, `AC-29`), payment validation (`BR-17`–`BR-19`), `sale` stock movements (`BR-25`, `AC-36`), customer total spent and credit updates (`AC-35`), idempotency replay (`withIdempotency`, `AC-34`), price change detection (`409 PRICE_CHANGED`, `AC-32`), and non-blocking warnings (`CREDIT_LIMIT_EXCEEDED`, `LOW_STOCK`).
  - Receipt details API (`GET /sales/:id`) and void transaction API (`POST /sales/:id/void`) per `BR-24` and `AC-39` (restocks tracked items with `void_restock` movements, rolls back customer balance, marks sale voided).
  - Held orders API (`GET /held-orders`, `POST /held-orders`, `POST /held-orders/:id/resume`, `DELETE /held-orders/:id`) per `BR-29` and `AC-33`.
  - Frontend Zustand cart store (`apps/web/src/stores/cartStore.ts`) persisted to `sessionStorage` with live math derived from the shared money engine.
  - POS Screen `SCR-08` (`apps/web/src/screens/PosScreen.tsx`): barcode scan box with persistent focus, catalog search and category pills, cart table with inline discounts, customer dropdown with customer-type discounts, bill discount, and charges.
  - Payment Modal (`PaymentModal.tsx`): multi-method split checkout (`cash`, `mbob`, `bnb_mPay`, `tPay`, `credit`), quick cash buttons, change calculation, wallet Txn ID validation, credit limit warning banner.
  - Held Orders Modal (`HeldOrdersModal.tsx`): hold, browse, and resume paused carts.
  - Receipt Modal `SCR-09` (`ReceiptModal.tsx`): 80 mm thermal print layout (`@media print`), barcode indicator, and jsPDF 80 mm ticket download (`AC-40`).
  - Seed expansion: 30 days of realistic sales generated for demo businesses using `computeSale` domain logic (`F-25`).
  - Integration tests: 10 tests in `apps/api/src/routes/sales.test.ts` covering `AC-26`–`AC-36`, `AC-39`, `AC-40`, `AC-48`. All 10 passed; 116 tests passing across monorepo.
  - Next: Phase 8 — Invoices, void & payments.
