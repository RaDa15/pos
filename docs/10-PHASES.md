# Phases — POS SYSTEM

Build order for the v1 production rebuild. Each phase leaves the app running, builds only on finished phases, and ends with the checks listed under **Acceptance** (from `11-ACCEPTANCE-CRITERIA.md`). Tick tasks here as they're done and mirror the phase status in `13-MEMORY.md`. Keep each task small enough for one Claude Code session.

## Overview

| Phase | Name | Goal | Features | Exit criteria |
|---|---|---|---|---|
| 0 | Setup | Monorepo, tooling, Docker Postgres, CI, staging "hello world" | — | `pnpm dev` runs web + api; CI green; staging serves the web app and `/api/v1/health` |
| 1 | Shared domain engine | Money engine, words, enums, permissions, plans in `packages/shared` with tests | — (BR-12 to BR-16, BR-32, BR-37) | AC-29, AC-30, AC-31 pass as unit tests; 100% branch coverage on `money/` |
| 2 | Database & seed | Full Prisma schema, raw SQL migrations, seed script | F-25 | Migrations apply on an empty DB; seed creates platform admin and demo businesses; AC-66 |
| 3 | Auth, registration, employees, tenancy | Sign-in, sessions, CSRF, registration, employees, permission and tenant middleware, audit helper | F-01, F-03, F-04, F-22 | AC-01 to AC-03, AC-08 to AC-14, AC-58 to AC-60, AC-62, AC-63 |
| 4 | App shell, design system & i18n | Tokens, components, layouts, navigation by role/type/plan, language toggle, blocked screen | F-24 | AC-65, AC-68, AC-69; every route renders its loading, empty and error states |
| 5 | Catalogue & settings | Products/menu, images, tax rates, GST-registered flag, customer-type discounts, business profile and logo, CSV import/export | F-06, F-20, F-07 | AC-17 to AC-21, AC-52, AC-53 |
| 6 | Inventory, customers & suppliers | Stock movements and alerts, customers with credit ledger, suppliers | F-08, F-17, F-18 | AC-22 to AC-24, AC-49, AC-50 |
| 7 | POS & receipts | POS screen, cart store, checkout endpoint, held orders, receipt print and PDF | F-10, F-12 | AC-26 to AC-36, AC-39, AC-40, AC-48, AC-61 |
| 8 | Invoices, void & payments | Invoices list, void, payments report | F-13, F-15 | AC-41, AC-42, AC-46 |
| 9 | Kitchen orders | Send to kitchen, kitchen board, bill an order | F-11 | AC-37, AC-38 |
| 10 | Dashboard, reports & expenses | Role dashboards, GST report, sales report, expenses | F-05, F-14, F-16, F-19 | AC-15, AC-16, AC-43 to AC-45, AC-47, AC-51 |
| 11 | Subscription, plans & platform admin | Subscription screen, payment submission, plan limits, platform admin with TOTP, audit log screen | F-02, F-23, F-22 | AC-04 to AC-07, AC-56, AC-57 |
| 12 | Purchases & data import/export | Supplier purchases, JSON export, prototype backup import | F-09, F-21 | AC-25, AC-54, AC-55 |
| 13 | Testing & hardening | Full regression, security review, performance, accessibility, Dzongkha review | — | All AC pass; AC-64, AC-67; smoke test passes on staging |
| 14 | Deploy & pilot | Production, backups, monitoring, pilot businesses migrated | — | Live on production; first backup restored successfully; pilot smoke test done |

## Phase 0 — Setup

- **Depends on:** nothing
- **Tasks:**
  - [x] Initialise git; confirm `pos/` (original files + `README.md`) is committed unchanged as the read-only reference
  - [x] Create the pnpm workspace: `packages/shared`, `apps/api`, `apps/web` with TypeScript strict configs and path aliases
  - [x] `apps/web`: Vite + React 19 + React Router + TanStack Query skeleton with one page "POS SYSTEM"
  - [x] `apps/api`: Express 5 app with helmet, pino, Zod-validated env (`03-TRD.md` §4), `GET /api/v1/health`
  - [x] `docker-compose.yml` with PostgreSQL 17 for local dev; `.env.example` with every variable name
  - [x] ESLint (incl. a rule banning `dangerouslySetInnerHTML`) + Prettier; Vitest in all three packages; Playwright in `apps/web`
  - [x] GitHub Actions CI: install, lint, type-check, unit tests, `pnpm audit --prod`
  - [x] Production Dockerfiles (api, web via nginx) and staging deploy of the skeleton
  - [x] Record exact dependency versions in `13-MEMORY.md`
- **Deliverables:** running skeleton locally and on staging.
- **Acceptance:** exit criteria in the overview (passed).

## Phase 1 — Shared domain engine

- **Depends on:** Phase 0
- **Tasks:**
  - [x] `money/engine.ts`: `computeLine`, `allocateDiscounts`, `computeSale` in integer chhertum per `02-BUSINESS-RULES.md` §3.1–3.2, including caps (BR-14) and the GST-registered switch (BR-11)
  - [x] `money/words.ts`: `amountInWords` (BR-37); `money/format.ts`: `formatMoney` (Nu., Indian grouping)
  - [x] Golden tests: the §3.3 worked example; inclusive 105.00; discount caps; a 30-line cart; zero-rate and exempt lines; percent bill discount at 100%
  - [x] Comparison test that runs the prototype's `computeLineTax`/`effectiveCart` (copied into the test folder) on 1,000 random carts and asserts v1 results differ by at most Nu. 0.01 per line
  - [x] `enums.ts` + English labels; `business-types.ts` (§3.5); `plans.ts` (§3.6); `permissions.ts` (`05-SECURITY-ACCESS.md` §3) with a test that snapshots the matrix
  - [x] Zod schemas for every request body in `07-API-SPEC.md` (can be filled in per phase; create the folder and naming now)
- **Deliverables:** `packages/shared` published to the workspace with tests.
- **Acceptance:** AC-29, AC-30, AC-31.

## Phase 2 — Database & seed

- **Depends on:** Phase 1
- **Tasks:**
  - [x] `schema.prisma` with every table, enum, index and relation in `06-BACKEND-SCHEMA.md`
  - [x] Raw SQL migrations: extensions, `sessions` table, partial unique indexes, check constraints
  - [x] `db/tenant.ts` Prisma extension that enforces `businessId` (`04-ARCHITECTURE.md` §5) with tests
  - [x] `lib/counters.ts` `nextNumber` with a concurrency test (50 parallel calls → 50 distinct, gapless numbers)
  - [x] `seed.ts`: platform admin; demo businesses when `SEED_DEMO_BUSINESSES=true` and not production; rice/oil/salt exempt; plate items untracked. For now seed only catalogue, customers, suppliers and expenses; 30 days of sales history is added in Phase 7 once `completeSale` exists
- **Deliverables:** migrations + seed.
- **Acceptance:** AC-66 (catalogue part).

## Phase 3 — Auth, registration, employees, tenancy

- **Depends on:** Phase 2
- **Tasks:**
  - [x] Session middleware (connect-pg-simple), CSRF double-submit, rate limiters
  - [x] `POST /register`, `GET /register/name-available` (BR-01, BR-03)
  - [x] Company sign-in + device cookie; employee sign-in with lockout; logout; forget device; `GET /auth/me`; `GET /auth/csrf`; `GET /auth/device`
  - [x] Middleware: `requireEmployee` (reloads employee and subscription each request), `requirePermission`, `requireActiveSubscription`, `requirePlanFeature`, `errorHandler` with the codes in `07-API-SPEC.md` §2
  - [x] Employees CRUD, reset password, `POST /me/password`, `PATCH /me` (BR-02, plan limit check stubbed to read `plans.ts`)
  - [x] `lib/audit.ts` and audit calls for every auth and employee action (`05` §7)
  - [x] Web: SCR-01 to SCR-06 (unstyled is fine; styled in Phase 4)
  - [x] Tenant-isolation test harness: create two businesses, call every list and detail route as each (extended as routes are added)
- **Deliverables:** a business can register, sign in and manage employees.
- **Acceptance:** AC-01, AC-02, AC-03, AC-08 to AC-14, AC-58 to AC-60, AC-62, AC-63.

## Phase 4 — App shell, design system & i18n

- **Depends on:** Phase 3
- **Tasks:**
  - [x] `tokens.css`, `base.css`, `print.css` from `09-DESIGN.md` §2 (with the v1 contrast fixes); self-hosted fonts
  - [x] Components in `09-DESIGN.md` §3 with Storybook-free demo page at `/dev/components` (dev only)
  - [x] `AuthLayout`, `AppShell` (sidebar, top bar, drawer on mobile), `PlatformLayout`
  - [x] Navigation filtered by permission, business type and plan; role home redirects; no-access toast; blocked-subscription card (BR-05)
  - [x] i18next with `en.json` and `dz.json` seeded from the prototype `I18N` map; toggle in auth screens and sidebar; saved via `PATCH /me`
  - [x] Style SCR-01 to SCR-06 to match the prototype
  - [x] Offline bar (`useNetworkStatus`) and session-expiry handling in the API client
- **Deliverables:** navigable app with empty screens for every route in `08-APP-FLOW.md` §1.
- **Acceptance:** AC-65, AC-68, AC-69.

## Phase 5 — Catalogue & settings

- **Depends on:** Phase 4
- **Tasks:**
  - [x] Tax rates API and Settings section (BR-10, immutable rate/mode/category)
  - [x] Business profile, GST-registered switch (BR-11), logo upload with sharp
  - [x] Customer-type discounts API and Settings section (BR-34)
  - [x] Products API (create with opening stock movement, edit, deactivate, image upload, barcode generation and uniqueness — BR-08, BR-09) and SCR-11
  - [x] CSV template, import (real CSV parser, movements for stock changes), export with formula-injection guard (F-07)
  - [x] Audit entries for every settings and product change
- **Deliverables:** catalogue and settings fully working.
- **Acceptance:** AC-17 to AC-21, AC-52, AC-53.

## Phase 6 — Inventory, customers & suppliers

- **Depends on:** Phase 5
- **Tasks:**
  - [x] Stock movements API with sign rules and negative-stock rejection (BR-25); `stock_after`
  - [x] Inventory alerts (BR-26), sidebar badge, SCR-12
  - [x] Customers API (types per business type, credit limit), history, settlements with `CR-NNNN` (BR-20), SCR-18
  - [x] Suppliers API with computed totals, SCR-19
- **Deliverables:** stock control and customer/supplier records.
- **Acceptance:** AC-22, AC-23, AC-24, AC-49, AC-50.

## Phase 7 — POS & receipts

- **Depends on:** Phase 6
- **Tasks:**
  - [x] `GET /pos/products`, `/pos/products/by-barcode/:barcode`, `/pos/customers`
  - [x] Zustand cart store (sessionStorage) using the shared engine for live totals
  - [x] SCR-08 left column: scan box with persistent focus, search with Enter behavior, product table, low-stock banner
  - [x] SCR-08 billing card: cart editing, customer select with automatic discount, bill discount, charges, order type and table, add-payment modal with validation (BR-17, BR-18, BR-19)
  - [x] `POST /sales` per BR-21 with row locks, `PRICE_CHANGED`, `INSUFFICIENT_STOCK`, idempotency, warnings
  - [x] Held orders API and UI (BR-29)
  - [x] SCR-09 receipt (BR-36), barcode component, print CSS, jsPDF 80 mm PDF
  - [x] Seed: generate 30 days of demo sales through `completeSale` (completes F-25 seed)
- **Deliverables:** end-to-end selling with receipts.
- **Acceptance:** AC-26 to AC-36, AC-39, AC-40, AC-48, AC-61.

## Phase 8 — Invoices, void & payments

- **Depends on:** Phase 7
- **Tasks:**
  - [x] `GET /sales` with search and filters; SCR-14
  - [x] `POST /sales/:id/void` per BR-24; void modal and VOID stamp on SCR-09
  - [x] Payments report API (completed only, credit separate — BR-31), CSV export, SCR-15
- **Deliverables:** invoice management and payment reconciliation.
- **Acceptance:** AC-41, AC-42, AC-46.

## Phase 9 — Kitchen orders

- **Depends on:** Phase 7
- **Tasks:**
  - [x] Kitchen orders API with `KOT-NNNN`, state machine (`02` §4.1), billable list
  - [x] SCR-10 board with polling and horizontal scroll on tablets
  - [x] POS: "Send to kitchen" modal, "Bill a kitchen order" dropdown, link sale ↔ order on completion
- **Deliverables:** restaurant flow J4 works end to end.
- **Acceptance:** AC-37, AC-38.

## Phase 10 — Dashboard, reports & expenses

- **Depends on:** Phases 8 and 9
- **Tasks:**
  - [x] Expenses API and SCR-20 (BR-39)
  - [x] `GET /dashboard` per lens (server returns only the lens's data) and SCR-07 with charts
  - [x] GST report API, CSV exports, SCR-16 with working print (BR-30, BR-33)
  - [x] Sales report API with estimated profit (BR-32) and SCR-17
- **Deliverables:** all reporting.
- **Acceptance:** AC-15, AC-16, AC-43, AC-44, AC-45, AC-47, AC-51.

## Phase 11 — Subscription, plans & platform admin

- **Depends on:** Phase 10
- **Tasks:**
  - [x] Subscription API: status, payment submission, change plan with limit checks, cancel (BR-04 to BR-07)
  - [x] Enforce plan limits and feature gates everywhere (`plans.ts`), including navigation
  - [x] SCR-23 (without the prototype's simulate/upgrade sections), expiry warning in the top bar
  - [x] Platform auth with TOTP enrolment, platform session, SCR-25 to SCR-27, verify/reject/extend/suspend/reactivate/reset password
  - [x] Audit log API with filters and SCR-22
- **Deliverables:** the SaaS can be sold and administered.
- **Acceptance:** AC-04 to AC-07, AC-56, AC-57.

## Phase 12 — Purchases & data import/export

- **Depends on:** Phase 11
- **Tasks:**
  - [x] Purchases API with `PUR-YYYY-NNNNN` and stock movements (BR-38); SCR-13
  - [x] `GET /data/export` JSON (no password hashes)
  - [x] `POST /data/import-prototype` per the mapping in `06-BACKEND-SCHEMA.md` §8, tested with a real prototype backup exported from each demo company
- **Deliverables:** pilot businesses can move from the prototype.
- **Acceptance:** AC-25, AC-54, AC-55.

## Phase 13 — Testing & hardening

- **Depends on:** Phase 12
- **Tasks:**
  - [ ] Run every AC; fix failures; Playwright suite for journeys J1–J9 (`08-APP-FLOW.md` §3)
  - [ ] Security review against `05-SECURITY-ACCESS.md` §6 (headers, CSP, uploads, CSV, rate limits); `pnpm audit`
  - [ ] Load test: 20,000 sales in one business → report and checkout timings (AC-67)
  - [ ] Accessibility pass (keyboard-only POS sale, screen reader labels, contrast)
  - [ ] Dzongkha review by a native speaker; update `dz.json`
  - [ ] Confirm GST rules with DRC (Open questions) and update `02-BUSINESS-RULES.md` if needed
- **Deliverables:** release candidate.
- **Acceptance:** all AC; AC-64; AC-67; smoke test on staging.

## Phase 14 — Deploy & pilot

- **Depends on:** Phase 13
- **Tasks:**
  - [ ] Production server, domain, TLS, Docker Compose, env secrets
  - [ ] Nightly backup + off-server copy; restore test into a scratch database
  - [ ] Uptime monitoring and error alerting
  - [ ] Create the first Platform Admin; confirm demo seeding is off
  - [ ] Migrate pilot businesses with the prototype import; train staff
- **Deliverables:** live product with pilot customers.
- **Acceptance:** smoke test (`11-ACCEPTANCE-CRITERIA.md` §5) on production with a pilot business.

## Definition of done (every phase)

- [ ] All tasks ticked and the phase's acceptance criteria pass
- [ ] No type or lint errors; `pnpm build` succeeds; CI green
- [ ] No console errors on the phase's screens
- [ ] New routes added to the tenant-isolation test (AC-58)
- [ ] Docs updated if anything changed; `13-MEMORY.md` updated
- [ ] Committed with a clear message (`12-RULES.md` §9)
