# Security & Access — POS SYSTEM

This doc is the single source of truth for who can do what. `packages/shared/src/permissions.ts` implements §3 exactly; the API enforces it on every route, and the web uses it only to hide things.

## 1. Authentication

### 1.1 Business app (two steps, as in prototype)

| Item | Decision |
|---|---|
| Step 1 — company | Business name or Business ID + **company password**. On success the API sets a signed, httpOnly `device` cookie holding the business ID. It lasts 12 hours, or 30 days (`REMEMBER_DEVICE_DAYS`) if "Remember this device" is ticked. |
| Step 2 — employee | Username + employee password, checked only within the business in the `device` cookie. Creates a server session (`sid` cookie, httpOnly, Secure, SameSite=Lax). |
| Session lifetime | 12 hours absolute (`SESSION_TTL_HOURS`), 2 hours idle. After expiry the employee signs in again; the device stays remembered. |
| Session storage | `sessions` table (connect-pg-simple). Session ID regenerated on every sign-in. |
| Sign out | Ends the employee session and returns to employee sign-in. "Use a different company" also clears the `device` cookie. |
| **Removed from prototype** | Remembered employee login with no password (`session:remember`); admin auto-created at sign-in; demo credentials shown on screen. |
| Password hashing | argon2id (memory 19 MiB, iterations 2, parallelism 1, or the library's current recommended defaults). Plain-text passwords are never stored, logged or returned. |
| Password policy | Minimum 8 characters, maximum 128, not equal to the username or business name, not in a list of the 10,000 most common passwords (bundled file). Applies to company, employee and platform admin passwords. **(Prototype: minimum 4.)** |
| Lockout | 5 wrong passwords for one username within 15 minutes → that username is locked for 15 minutes ("Too many attempts. Try again in 15 minutes."). Company step: 10 attempts per IP per 15 minutes. Errors never reveal whether the business or username exists. |
| Password change | Any employee can change their own password (current password required). Admin can reset an employee's password to a temporary one; the employee must set a new password at next sign-in. |
| Forgotten company password | The owner contacts Yuevaán; a Platform Admin verifies identity offline and sets a temporary company password (must be changed at next company sign-in). No email reset in v1. |
| Disable / role change / suspension | Takes effect on the employee's next request: every request reloads employee `active`, `role` and the business's subscription status from the database. |

### 1.2 Platform admin

| Item | Decision |
|---|---|
| Sign-in | Email + password + 6-digit TOTP code (authenticator app), at `/platform/login`. Separate `psid` session cookie; a platform session can't call business routes and vice versa. |
| Accounts | Created by the seed script (`PLATFORM_ADMIN_EMAIL`) or by another Platform Admin. Initial password must be changed and TOTP enrolled at first sign-in. **(Prototype: hard-coded `platform/platform`.)** |
| Session lifetime | 8 hours absolute, 30 minutes idle. |

## 2. Roles

| Role | Code | Description | How assigned |
|---|---|---|---|
| Admin | `admin` | Full control of one business | First Admin created at registration; others by an Admin |
| Manager | `manager` | Daily operations, voids, reports | By Admin |
| Cashier | `cashier` | POS, invoices, customers | By Admin |
| Accountant | `accountant` | Reports, payments, expenses | By Admin |
| Inventory Officer | `inventory_officer` | Products, stock, purchases | By Admin |
| Storekeeper | `storekeeper` | Same permissions as Inventory Officer in v1 | By Admin |
| Waiter | `waiter` | POS and kitchen orders | By Admin |
| Kitchen Staff | `kitchen_staff` | Kitchen board | By Admin |
| Platform Admin | `platform_admin` | Runs the SaaS; no access to any business's operational data | By seed or another Platform Admin |

## 3. Permission matrix

✅ allowed · ❌ denied · 🔸 limited (explained in §4). Each row's permission key is what the code checks. Columns: **Adm** Admin, **Mgr** Manager, **Csh** Cashier, **Acc** Accountant, **Inv** Inventory Officer, **Stk** Storekeeper, **Wtr** Waiter, **Kit** Kitchen Staff.

| Permission key | What it allows | Adm | Mgr | Csh | Acc | Inv | Stk | Wtr | Kit |
|---|---|---|---|---|---|---|---|---|---|
| `dashboard.view` | Dashboard (lens per §4) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `pos.sell` | POS screen, product lookup, customer lookup, complete sale, hold/resume/cancel, credit payment lines | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ |
| `kitchen.view` | Kitchen board | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ | ✅ |
| `kitchen.create` | Send cart to kitchen | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ |
| `kitchen.update` | Move status, cancel ticket | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ | ✅ |
| `sales.view` | Invoices list, view and reprint any receipt | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | 🔸 | ❌ |
| `sales.void` | Void an invoice (BR-24) | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `products.view` | Products / Menu screen | ✅ | ✅ | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ |
| `products.manage` | Create, edit, deactivate products; upload photos | ✅ | ✅ | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ |
| `products.import_export` | CSV template, import, export (plan-gated) | ✅ | ✅ | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ |
| `inventory.view` | Inventory screen, movements, alerts | ✅ | ✅ | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ |
| `inventory.adjust` | Stock in / out / adjustment | ✅ | ✅ | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ |
| `purchases.manage` | Record and view supplier purchases | ✅ | ✅ | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ |
| `suppliers.view` | Supplier list and balances | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ | ❌ | ❌ |
| `suppliers.manage` | Create and edit suppliers | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `customers.view` | Customer list, history, balances | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| `customers.manage` | Create, edit, deactivate customers | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `customers.settle` | Receive payment against credit (BR-20) | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| `payments.view` | Payment report and export | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ |
| `reports.gst` | GST report and exports | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ |
| `reports.sales` | Sales and profit report | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ |
| `expenses.view` | Expenses list | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ |
| `expenses.manage` | Create, edit, delete expenses | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ |
| `employees.manage` | Users screen: add, edit, disable, reset password | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `settings.manage` | Tax rates, GST-registered flag, customer-type discounts, business profile, logo | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `subscription.manage` | Subscription screen, submit payment, change plan, cancel | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `audit.view` | Audit log | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `data.export_import` | JSON export, prototype import (F-21) | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `me.manage` | Change own password and language | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

### Changes from the prototype's `ROLE_SCREENS`

- `sales.void` is limited to Admin and Manager (prototype: anyone with Invoices, including Cashier and Accountant).
- Manager gets `payments.view` (prototype: no Payments screen for Manager).
- Accountant gets `customers.view` and `customers.settle`, and Inventory Officer, Storekeeper and Accountant get `suppliers.view` — the first so credit settlements can be recorded by the bookkeeper, the second so purchases can pick a supplier.
- Waiter's receipt access is limited to their own sales (prototype: any receipt via URL state).
- Restaurant-only (`kitchen.*`) and grocery-only (Purchases screen) permissions also require the matching business type.

### Platform Admin permissions

| Permission key | What it allows |
|---|---|
| `platform.businesses.view` | List businesses: name, type, Business ID, owner, phone, email, plan, effective status, expiry, active employee count, created date |
| `platform.subscriptions.manage` | Verify or reject submitted payments, extend 14 days, suspend, reactivate |
| `platform.businesses.reset_password` | Set a temporary company password |
| `platform.admins.manage` | Create and disable Platform Admin accounts |

Platform Admins can't see a business's sales, customers, products, payments, employees' details or audit log, and can't sign in as a business.

## 4. Data ownership & visibility

- **Tenant isolation:** every business record has `business_id`; the API takes it only from the session (`04-ARCHITECTURE.md` §5). A request for another business's record returns `404 NOT_FOUND`, never `403`, so IDs can't be probed.
- 🔸 **Waiter — `sales.view`:** only sales where `cashier_id` is the waiter, and only the receipt page (no Invoices list).
- **Dashboard lens by role** (as prototype `DASHBOARD_ROLE_VIEW`):

| Lens | Roles | Shows |
|---|---|---|
| full | Admin, Manager | Everything in `08-APP-FLOW.md` SCR-07 |
| finance | Accountant | Sales KPIs, profit, GST, expenses, charts, payment breakdown, recent invoices |
| sales | Cashier | Low-stock banner, today's sales and orders, pending kitchen orders, customer count, recent invoices |
| inventory | Inventory Officer, Storekeeper | Product and customer counts, stock KPIs, low-stock list, grocery snapshot / restaurant floor |
| floor | Waiter, Kitchen Staff | Restaurant floor KPIs and open kitchen tickets |

- The API returns only the data for the caller's lens (it doesn't send profit to a Cashier and hide it in the UI).

## 5. Data protection

| Data | Sensitivity | Protection |
|---|---|---|
| Passwords (company, employee, platform) | High | argon2id hash only; never logged, returned or exported |
| TOTP secrets | High | Encrypted at rest with a key from env; never returned after enrolment |
| Session IDs, CSRF tokens | High | httpOnly cookies / header only; not logged |
| Customer name, phone, email, address, TPN | Medium (personal data) | Visible only with `customers.view`; excluded from logs; included in the Admin's JSON export |
| Payment journal / transaction IDs, bank names | Medium | Visible with `payments.view`, `sales.view` |
| Subscription payment references | Medium | Visible to the business Admin and Platform Admins |
| Card numbers / CVV | Not collected | v1 never asks for card details **(prototype: subscription checkout asked for card number and CVV)** |
| Business TPN, address, phone | Low (printed on invoices) | — |

- **Retention:** sales, payments, stock movements and audit logs are never hard-deleted (7 years minimum, **Assumption**). Products, customers, suppliers and employees are deactivated, not deleted. Expenses can be deleted (audit-logged).
- **Business closure:** data stays while the account exists. Deletion happens only on the owner's written request, done by a Platform Admin after giving the owner a JSON export.
- **Transport:** HTTPS only (HSTS); cookies `Secure`.

## 6. Threats & mitigations

| Threat | Mitigation |
|---|---|
| SQL injection | Prisma queries only; `$queryRaw` only with tagged-template parameters, never string concatenation |
| XSS | React escaping; `dangerouslySetInnerHTML` is banned (lint rule); image `src` values come only from our `/uploads/` paths; CSP `default-src 'self'; img-src 'self' data:; style-src 'self'; font-src 'self'; frame-ancestors 'none'`. **(Prototype had unescaped table no., username in `onclick`, and logo `src`.)** |
| Malicious import file (F-07, F-21) | Parse with strict Zod schemas; reject unknown fields; max 10 MB; never trust IDs, roles or passwords from the file (imported employees get new random passwords and must be reset) |
| CSRF | SameSite=Lax cookies + double-submit token: API sets `csrf` cookie, web sends `X-CSRF-Token` on every non-GET request |
| IDOR / cross-tenant access | Tenant-scoped data layer (D-04); `404` for other tenants' IDs; automated isolation tests (AC-58 to AC-60) |
| Price / total tampering | Server recomputes all totals from product data with the shared engine (BR-21); client totals are only compared |
| Duplicate submissions | `Idempotency-Key` header on `POST /sales`, `POST /customers/:id/settlements`, `POST /purchases` (keys kept 24 h) |
| Brute force | Lockout and rate limits (§1); global API limit 300 requests/min per session |
| Session fixation / theft | Regenerate session ID on sign-in; httpOnly + Secure + SameSite; idle and absolute timeouts |
| File uploads | Images only (JPEG, PNG, WebP), max 2 MB, decoded and re-encoded to WebP by sharp (strips metadata, rejects non-images), random file names, served as `image/webp`; SVG not accepted |
| CSV formula injection | In exports, prefix any cell starting with `=`, `+`, `-`, `@` with `'` |
| Mass assignment | Zod `.strict()` schemas; services pick fields explicitly; never pass `req.body` straight to Prisma |
| Clickjacking | `frame-ancestors 'none'`, `X-Frame-Options: DENY` |
| Vulnerable dependencies | `pnpm audit --prod` in CI fails on high/critical |
| Demo data in production | Seeding demo businesses is impossible when `NODE_ENV=production` (seed script refuses) |

## 7. Audit logging

Recorded in `audit_logs` in the same transaction as the change: who (employee or platform admin), business, action, entity, short detail, time. Admin views it on the Audit Log screen (latest first, filter by action, employee and date). Entries can't be edited or deleted.

| Area | Actions logged |
|---|---|
| Auth | Login, Logout, Login failed (username only), Password changed, Password reset by Admin |
| Sales | Sale completed, Invoice voided (with reason), Order cancelled at POS, Order held |
| Kitchen | Kitchen order created, status changed, cancelled |
| Products | Product created, Product changed, Price changed (old → new), Product deactivated, Products imported (counts) |
| Inventory | Stock movement (type, qty, reason), Purchase recorded |
| Customers | Customer created/changed, Credit payment received |
| Expenses | Expense recorded, changed, deleted |
| Employees | Employee created, role changed, disabled/enabled |
| Settings | Tax rate added/changed, GST-registered changed, customer-type discount changed, business profile/logo changed |
| Subscription | Plan changed, payment submitted, payment verified/rejected, cancelled, extended, suspended, reactivated (platform actions are logged with the platform admin's email) |
| Data | Data exported, prototype data imported (counts) |

## 8. Secrets management

- Secrets only in environment variables; `.env` is in `.gitignore`; `.env.example` lists every name from `03-TRD.md` §4 with empty values.
- `SESSION_SECRET` and the TOTP encryption key are generated per environment (≥ 32 random bytes) and rotated if leaked (all sessions end).
- Database credentials are different per environment; production DB isn't reachable from the internet (Docker network only).
