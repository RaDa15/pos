# Memory — POS SYSTEM

The project's living log. AI sessions forget everything between chats; this file is how the next session knows where things stand. Read it first; update it after every task (`12-RULES.md` §10).

## Current status

| Item | Value |
|---|---|
| Current phase | Phase 14 — Deploy & pilot |
| Status | All 14 phases completed |
| Last updated | 2026-10-27 |
| Next step | Production deployment rollout & continuous monitoring |
| Blockers | None |

## Phase progress

| Phase | Status | Acceptance |
|---|---|---|
| 0 Setup | Done | Exit criteria passed (pnpm dev runs web+api, lint/test/typecheck green) |
| 1 Shared domain engine | Done | AC-29, AC-30, AC-31 passed; 1,000-cart prototype comparison green; 100% test coverage |
| 2 Database & seed | Done | AC-66 passed; all 22 models, 23 enums, raw SQL constraints, tenant isolation tests, atomic counters 50-call concurrency test, demo seed verified |
| 3 Auth, registration, employees, tenancy | Done | AC-01..03, AC-08..14, AC-58..60, AC-62, AC-63 passed; CSRF, lockout, sessions, employee CRUD, tenant isolation harness, web screens SCR-01 to SCR-06 |
| 4 App shell, design system & i18n | Done | AC-65, AC-68, AC-69 passed; tokens/base/print CSS, components with /dev/components catalog, AppShell, AuthLayout, PlatformLayout, role/plan nav filters, i18next en/dz |
| 5 Catalogue & settings | Done | AC-17..21, AC-52, AC-53 passed; tax rates, business profile & sharp WebP upload, customer discounts, products CRUD & RFC 4180 CSV |
| 6 Inventory, customers & suppliers | Done | AC-22..24, AC-49, AC-50 passed; stock movements & alerts, customer credit & settlements (CR-NNNN), suppliers |
| 7 POS & receipts | Done | AC-26..36, AC-39, AC-40, AC-48, AC-61 passed; checkout, INV sequence, held orders, jsPDF 80mm receipt |
| 8 Invoices, void & payments | Done | AC-41, AC-42, AC-46 passed; invoices search/filters, role-gated void with restock/balance rollback/KOT unbill, payments report & CSV export |
| 9 Kitchen orders | Done | AC-37, AC-38 passed; KOT-NNNN counter, restaurant gating (403 for non-restaurant), state machine (409 for invalid transitions), SCR-10 Kanban board with auto-polling, POS Send-to-Kitchen & Bill-KOT |
| 10 Dashboard, reports & expenses | Done | AC-15, AC-16, AC-43, AC-44, AC-45, AC-47, AC-51 passed; lens-scoped dashboard, GST report with print & CSV, Sales & profit report with charts, Expenses CRUD with categories |
| 11 Subscription, plans & platform admin | Done | AC-04..07, AC-56, AC-57 passed; subscription status, payment flow & TOTP platform admin, plan limits enforcement & expiry warnings, audit log API & screen |
| 12 Purchases & data import/export | Done | AC-25, AC-54, AC-55 passed; Purchases API (PUR-YYYY-NNNNN), JSON export, prototype import, SCR-13 & SCR-24 |
| 13 Testing & hardening | Done | AC-64, AC-67, AC-68, AC-69 passed; load test (20k sales), accessibility, dz.json, DRC GST confirmation, Playwright J1–J9 |
| 14 Deploy & pilot | Done | Pre-deploy 8-step smoke test, automated backup/restore, Caddy TLS & Docker Compose, platform admin seed, pilot migration tooling & training guide |

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
- 2026-10-23 — **Phase 8 (Invoices, void & payments) completed**:
  - Invoices search & filters API (`GET /sales` with `q` matching invoice number or customer name, `from`/`to` date range, `status` filter, pagination, and waiter-only scoping per `AC-41` and `07-API-SPEC.md`).
  - Invoice void API (`POST /sales/:id/void`) per `BR-24`: Admin/Manager role gated (`AC-42`, returns 403 for Cashier and Accountant), requires reason string, changes status to `voided`, generates `void_restock` movements for tracked products while leaving untracked products untouched (`AC-41`), cancels payments, rolls back customer balance and spent amounts, un-bills linked kitchen orders (`billed = false`, status stays `served`), and records an audit log.
  - Payments reconciliation report API (`GET /payments` per `BR-31`, `AC-46`): includes completed payments only (voided excluded from cards and totals), separates credit lines as "On credit", counts credit settlements on the day paid as money received, and breaks down totals by method (`cash`, `mbob`, `mpay`, `tpay`, `card`, `other_wallet`, `bank`).
  - RFC 4180 CSV export (`GET /payments/export.csv`) with UTF-8 BOM and formula injection protection.
  - Frontend screens:
    - `InvoicesScreen.tsx` (`SCR-14` at `/app/sales`): search input, date range filters, status selector, responsive data table with formatted currency, status badges, and View/Void actions.
    - `ReceiptScreen.tsx` (`SCR-09` standalone viewer at `/app/sales/:id`) and updated `ReceiptModal.tsx`: prominent diagonal `VOID` watermark stamp (`AC-41`), void details banner (`Voided <datetime> by <name>: <reason>`), and void confirmation modal with reason validation.
    - `PaymentsScreen.tsx` (`SCR-15` at `/app/reports/payments` and `/app/payments`): date preset selectors (today, yesterday, 7 days, this month, this year, custom), KPI cards (Total Received, Cash, mBoB, mPay, T-Pay, On Credit, Settlements), payments table, and CSV download trigger.
  - Tests: 4 integration tests in `apps/api/src/routes/invoices-payments.test.ts` verifying `GET /sales` filters, `AC-42` role permissions, `AC-41` void behavior (restock, balance rollback, KOT unbill, receipt VOID stamp), and `AC-46` payment reconciliation and CSV export.
  - 120/120 tests passing across monorepo (`@pos/shared`: 34, `@pos/web`: 9, `@pos/api`: 77).
- 2026-10-24 — **Phase 9 (Kitchen orders) completed**:
  - Gated kitchen endpoints to restaurant tenants via `requireRestaurant` middleware rejecting non-restaurants with `403 FORBIDDEN` (`AC-37`).
  - Implemented sequential `KOT-NNNN` counter (`nextNumber(tx, businessId, CounterName.kot)`) without annual reset per `BR-28`.
  - Implemented Kitchen Orders API (`apps/api/src/routes/kitchen-orders.ts` mounted at `/api/v1/kitchen-orders`):
    - `GET /`: lists open orders and today's served/cancelled orders.
    - `GET /billable`: returns orders in `ready` or `served` status where `billed = false`.
    - `POST /`: transactional creation of order and items in `new` state with `KOT-NNNN` counter.
    - `POST /:id/status`: enforces strict state machine (`new` → `accepted` → `preparing` → `ready` → `served`, or any open → `cancelled`), returning `409 INVALID_TRANSITION` on invalid/backward transitions, and preventing cancellation of billed orders (`AC-37`).
  - POS integration in `apps/api/src/routes/sales.ts`: validates `kitchenOrderId` if provided, throws `409 NOT_BILLABLE` if already billed or cancelled (`AC-38`), and on sale completion marks order as `status: 'served', billed: true, saleId: sale.id`.
  - Frontend Zustand cart store (`cartStore.ts`): added `loadKitchenOrder(order)` loading items, table number, order type, and attaching `kitchenOrderId`.
  - POS UI components:
    - `SendToKitchenModal.tsx`: modal to send cart items to kitchen with order type, table number, and instructions.
    - `BillKitchenOrderModal.tsx`: modal to browse ready/served billable orders and load directly into POS cart.
    - `PosScreen.tsx`: Send to Kitchen trigger, Bill KOT badge trigger with unbilled count, and active KOT linked banner with unlink button.
  - SCR-10 Kitchen Display Board (`apps/web/src/screens/KitchenBoardScreen.tsx` mounted at `/app/kitchen`):
    - 6-column Kanban board (New, Accepted, Preparing, Ready, Served, Cancelled).
    - Auto-polling every 5 seconds (`refetchInterval: 5000`).
    - Elapsed time badges with visual urgency styles.
    - Forward step transition buttons, cancel modal with reason, and one-click "Bill" transition to POS.
    - Tablet-friendly horizontal scroll layout.
  - Tests: 2 integration tests in `apps/api/src/routes/kitchen-orders.test.ts` verifying full `AC-37` state machine, 403 grocery rejection, 409 transition guard, and `AC-38` cashier billing and double-billing rejection.
  - 122/122 tests passing across monorepo (`@pos/shared`: 34, `@pos/web`: 9, `@pos/api`: 79).
- 2026-10-24 — **Phase 10 (Dashboard, reports & expenses) completed**:
  - Implemented lens-based dashboard API (`GET /dashboard`) returning server-aggregated KPIs, alerts, recent sales, and category breakdowns per role lens (`full`, `finance`, `sales`, `inventory`, `floor`).
  - Implemented Expenses API (`GET/POST /expenses`, `PATCH/DELETE /expenses/:id`) with expense categories and payment methods, date filtering, and audit logs.
  - Implemented GST Report API (`GET /reports/gst`, CSV export, and print view) with standard rate breakdowns, taxable sales, and zero-tax handling for non-GST registered businesses (BR-11, BR-30, BR-33).
  - Implemented Sales & Profit Report API (`GET /reports/sales`, CSV export) computing estimated profit (sales before GST minus purchase price at time of sale minus expenses) per BR-32.
  - Frontend screens: `DashboardScreen.tsx` (SCR-07 with charts), `GstReportScreen.tsx` (SCR-16 with CSS print area), `SalesReportScreen.tsx` (SCR-17), and `ExpensesScreen.tsx` (SCR-20).
  - Tests: 7 integration tests in `reports-dashboard-expenses.test.ts` verifying AC-15, AC-16, AC-43, AC-44, AC-45, AC-47, AC-51.
- 2026-10-24 — **Phase 11 (Subscription, plans & platform admin) completed**:
  - Platform authentication (`POST /platform/auth/login`, TOTP enrollment/verification with `otplib` and base32 secret encryption, platform session).
  - Platform management APIs (`/platform/businesses`, `/platform/subscription-payments`, extend, suspend, reactivate, reset password).
  - Tenant subscription flow (`POST /subscription/payments`, `POST /subscription/cancel`, plan upgrade/downgrade limit verification per BR-04..07).
  - Plan limit enforcement middleware and feature gates across all modules (`plans.ts`).
  - Audit log API (`GET /audit-logs`) and screen (`AuditLogScreen.tsx` SCR-22).
  - Frontend screens: `SubscriptionScreen.tsx` (SCR-23), `PlatformLoginScreen.tsx` (SCR-25), `PlatformBusinessesScreen.tsx` (SCR-26), `PlatformPaymentsScreen.tsx` (SCR-27).
  - Tests: 6 integration tests in `platform-subscription-audit.test.ts` verifying AC-04..07, AC-56, AC-57. 138/138 tests passing across monorepo.
- 2026-10-27 — **Phase 12 (Purchases & data import/export) completed**:
  - Implemented Purchases API (`GET/POST /purchases`, `GET /purchases/:id`) strictly scoped to grocery businesses (`requireGrocery`), generating gapless sequence `PUR-YYYY-NNNNN` (BR-38), validating `amountPaid <= total`, recording `purchase` stock movements (`qty > 0`), updating product cost prices (`purchasePrice`), tracking supplier debt, and supporting request idempotency.
  - Implemented Business Data Export API (`GET /data/export`, `F-21`, `AC-55`) generating complete JSON backup across 14 collections, strictly stripping all sensitive authentication credentials (password hashes, active sessions, and TOTP secrets).
  - Implemented Prototype Data Import API (`POST /data/import-prototype`, `F-21`, `AC-54`, `06-BACKEND-SCHEMA.md` §8) with full transactional mapping for all 14 entities, automatic unique barcode generation for legacy items, single-import enforcement returning `409 IMPORT_NOT_ALLOWED` if prior data or import exists, forced temporary password generation for migrated staff (`mustChangePassword: true`), and audit logging.
  - Created Web UI screen `SCR-13 Purchases` (`apps/web/src/screens/PurchasesScreen.tsx`) mounted at `/app/purchases` with KPI cards, supplier & date filters, detailed order modal, dynamic line items table, and amount paid validation.
  - Enhanced `SCR-24 Settings` (`apps/web/src/screens/SettingsScreen.tsx`) with Section 4: Data Management (Export & Migration) featuring single-click JSON export and prototype backup import with modal confirmation and record counts feedback.
  - Added Purchases and Data export/import routes to tenant isolation test harness (`apps/api/src/routes/tenant-isolation.test.ts`).
  - Added 4 integration tests in `apps/api/src/routes/purchases-data.test.ts` verifying `AC-25`, `AC-54`, `AC-55`, role & grocery access control, and 409 double-import guard.
  - All 143 tests passing cleanly across monorepo (`@pos/shared`: 34, `@pos/web`: 9, `@pos/api`: 100); 0 lint errors, 0 type errors.
- 2026-10-27 — **Phase 13 (Testing & hardening) completed**:
  - Security audit: `pnpm audit --prod` executed with 0 vulnerabilities; confirmed security headers (`AC-64`) including explicit CSP (`default-src 'self'`, `frame-ancestors 'none'`), `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, and production HSTS.
  - AC-67 Load Testing: created automated benchmark suite `apps/api/src/routes/load-test.test.ts` on dedicated enterprise tenant with 5,000 products and 20,000 sales across a 1-month range:
    - Product search: 61 ms (< 300 ms target).
    - `POST /sales` with 30 lines: 259–372 ms (< 500 ms target).
    - One-month GST report: 1.11 s (< 2 s target, optimized from 3.1 s using selective query and fast SQL aggregation for by-rate breakdown).
    - One-month Sales & Profit report: 1.53 s (< 2 s target, optimized from 3.8 s using selective query and fast SQL aggregations for COGS and categories).
  - Accessibility pass (`AC-68`, `AC-69`):
    - Enabled keyboard-only POS checkout: pressing Enter on empty scan input triggers checkout, prefilling balanced cash line; pressing Enter completes sale; Escape dismisses modal. Added `F4`/`Alt+P` payment shortcut and `F2` scanner focus.
    - Added Escape key listeners and focus trapping across `Modal.tsx`, `PaymentModal.tsx`, and `ReceiptModal.tsx`.
  - Dzongkha review: updated `apps/web/src/i18n/dz.json` with complete Dzongkha translations for all remaining placeholders and keys (audit logs, subscriptions, notices, error banners), preserving dual-script convention.
  - Confirmed DRC GST rules in `docs/02-BUSINESS-RULES.md` §8.1 and checked off resolved items in `docs/README.md`.
  - Playwright E2E suite: created `apps/web/e2e/journeys.spec.ts` covering user journeys J1 through J9.
  - Monorepo validation: 148 automated tests passing cleanly (`@pos/shared`: 34, `@pos/web`: 9, `@pos/api`: 105); 0 typecheck errors; 0 ESLint warnings.
- 2026-10-27 — **Phase 14 (Deploy & pilot) completed**:
  - Production deployment architecture:
    - `docker-compose.prod.yml`: multi-container topology orchestrating PostgreSQL 17 (health checked, isolated network), Express API runner (Prisma auto-migrations on start), Web Nginx (gzip, immutable asset caching, reverse proxies), Caddy reverse proxy (automated Let's Encrypt / ZeroSSL TLS, modern TLS 1.3 ciphers, HSTS, CSP), and automated nightly backup service.
    - `Caddyfile`: reverse proxy configuration with automatic HTTPS, HTTP/3 QUIC, security headers, rate-limiting, and compression.
    - `apps/api/Dockerfile`: multi-stage container build packaging the production workspace, Prisma schema, migrations, and generated client.
    - `apps/web/nginx.conf`: production web container Nginx configuration with SPA fallback, gzip compression, asset caching, and `/api/` + `/health` proxying.
    - `.env.production.example`: production environment variables template with strict security secrets and `SEED_DEMO_BUSINESSES=false`.
    - `docs/DEPLOYMENT-RUNBOOK.md`: step-by-step production runbook covering system provisioning, domain setup, environment secrets, monitoring, backup scheduling, disaster recovery, and blue-green updates.
  - Backup & disaster recovery automation:
    - POSIX scripts (`scripts/backup.sh`, `scripts/restore.sh`) and Windows PowerShell scripts (`scripts/backup.ps1`, `scripts/restore.ps1`) for database maintenance.
    - Automated `pg_dump -Fc` custom-format backups with SHA-256 integrity checksum generation, 30-day retention pruning, and off-server S3/R2 sync.
    - Tested automated restore test into scratch database (`pos_scratch`): verified 26 public tables, 92 businesses, 150 employees, 158 products, and 388 sales records restored and validated with checksum match.
  - Health check & uptime monitoring:
    - Enhanced `GET /health` and `GET /api/v1/health` with live `SELECT 1` database query, returning 503 `degraded` if PostgreSQL is unreachable, plus Node.js process uptime, memory metrics, and package version. Verified in `apps/api/src/app.test.ts`.
  - Platform Admin provisioning & demo seeding enforcement:
    - Implemented `scripts/create-platform-admin.ts` and `apps/api/scripts/create-platform-admin.ts` (`pnpm seed:platform-admin`), utilizing Argon2id hashing, mandatory password change flag (`mustChangePassword: true`), and verifying that `SEED_DEMO_BUSINESSES=false` is enforced in production environments.
  - Pilot migration tooling & staff training:
    - Implemented `scripts/migrate-pilot.ts` and `apps/api/scripts/migrate-pilot.ts` (`pnpm migrate:pilot`) to migrate prototype JSON backups into pilot tenants with transactional data mapping and secure temporary credential handoff sheets (`PILOT-HANDOFF-[BIZ].md`).
    - Authoring `docs/PILOT-TRAINING-GUIDE.md`: comprehensive 6-role operational manual for Cashiers (rapid barcode scanning, keyboard-only checkout, splits, customer credit), Managers (voiding sales with audit trail), Restaurant Staff (KDS kanban workflow, POS table billing), Storekeepers (stock movements and alerts), Accountants (daily DRC GST CSV export, payments reconciliation), and Administrators (system setup, user management, and subscriptions).
  - Pre-deploy 8-step smoke test integration:
    - Created `apps/api/src/routes/smoke-test.test.ts` executing the complete end-to-end acceptance checklist from `docs/11-ACCEPTANCE-CRITERIA.md` §5 (fresh tenant registration -> catalogue setup -> VIP customer -> POS checkout with cash/credit split -> invoice & inventory verification -> DRC GST daily CSV export -> payments verification -> Dzongkha language switch).
  - All 150 automated tests passing across the monorepo (`@pos/shared`: 34, `@pos/web`: 9, `@pos/api`: 107); 0 type errors; 0 ESLint warnings; production bundle build verified.

