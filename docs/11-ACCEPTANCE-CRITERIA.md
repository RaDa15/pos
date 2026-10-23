# Acceptance Criteria — POS SYSTEM

## How to use

- At the end of each phase in `10-PHASES.md`, run that phase's AC items. A phase is done only when they all pass. Record results in `13-MEMORY.md`.
- **Automate where marked:** `[unit]` Vitest in `packages/shared`; `[api]` Vitest + Supertest against a test database; `[e2e]` Playwright against the running app; `[manual]` a person checks it.
- Test data: the demo businesses from the seed (F-25) unless the AC says otherwise. "Grocery A" = Pema Store, "Grocery B" = Norbu General Store, "Restaurant A" = Test Restaurant.

## 1. Feature criteria

### F-01 Business registration

| ID | Given | When | Then |
|---|---|---|---|
| AC-01 | No business named "Thimphu Grill House" | Someone registers it as Restaurant with plan Professional `[api][e2e]` | 201; Business ID matches `BIZ-[A-Z0-9]{5}`; one Admin employee `admin`; three tax rates (GST Standard 5% exclusive default, Zero-rated 0%, Exempt 0%); subscription `trial` on Professional expiring 14 days later; user lands on SCR-04 with the Business ID prefilled |
| AC-02 | "Pema Store" exists | Someone registers "  pema STORE " `[api]` | 409 BUSINESS_NAME_TAKEN; nothing created |
| AC-03 | Registration without a TPN | Business is created `[api]` | `gstRegistered = false` |

### F-02 Subscription & plans

| ID | Given | When | Then |
|---|---|---|---|
| AC-04 | Grocery A with `expires_at` yesterday | A Cashier signs in and opens POS; `POST /sales` is called `[api][e2e]` | Sign-in works; POS shows the blocked card; API returns 403 SUBSCRIPTION_INACTIVE; Admin can still open Dashboard, Subscription and Settings |
| AC-05 | Active subscription expiring in 5 days | Admin submits an mBoB payment and a Platform Admin verifies it `[api]` | Payment `verified`; status `active`; new `expires_at` = old `expires_at` + 30 days; history has `payment_submitted` and `payment_verified` |
| AC-06 | Business on Starter with 1 active non-Admin employee | Admin adds another employee; Accountant opens GST report `[api][e2e]` | 403 PLAN_LIMIT "Your plan allows 1 employee…"; GST nav item hidden and `GET /reports/gst` returns 403 PLAN_LIMIT |
| AC-07 | Professional business with 4 active non-Admin employees | Admin switches to Starter `[api]` | 403 PLAN_LIMIT; plan unchanged |

### F-03 Two-step sign-in

| ID | Given | When | Then |
|---|---|---|---|
| AC-08 | Grocery A, employee `cashier1` | Company step with "pema store" + company password, then `cashier1` + password `[e2e]` | Lands on POS; top bar shows "Grocery · BIZ-…" and status badge; audit has "Login" |
| AC-09 | Employee `cashier1` | Wrong password 5 times within 15 minutes, then the right one `[api]` | First 5: 401 INVALID_CREDENTIALS with the same message as an unknown user; 6th: 423 ACCOUNT_LOCKED; works again after 15 minutes |
| AC-10 | Company sign-in with "Remember this device" ticked | Browser is closed and reopened next day `[e2e]` | SCR-05 shows Pema Store; employee password still required; no session restored without a password |
| AC-11 | `cashier1` signed in | Admin disables `cashier1` `[api][e2e]` | `cashier1`'s next request returns 401; web shows "Your account was disabled." |

### F-04 Employees & roles

| ID | Given | When | Then |
|---|---|---|---|
| AC-12 | Employee `cashier1` exists | Admin adds `Cashier1` `[api]` | 409 USERNAME_TAKEN |
| AC-13 | One active Admin `admin` | Admin tries to disable themself or change their role; then someone tries to sign in as `admin` after the Admin was renamed `owner` `[api]` | 409 LAST_ADMIN for both changes; signing in as a non-existent `admin` returns 401 and creates no employee |
| AC-14 | Employee `waiter1` | Admin resets the password to a temporary one `[api][e2e]` | `waiter1` signs in with it, is sent to SCR-06, can't call any other route (403 PASSWORD_CHANGE_REQUIRED) until a new password is set |

### F-05 Role-based dashboard

| ID | Given | When | Then |
|---|---|---|---|
| AC-15 | Grocery A with 5 completed and 1 voided sale today | Admin opens Dashboard; Cashier calls `GET /dashboard` `[api][e2e]` | Admin: Today's Sales = sum of the 5 completed totals; Today's Orders = 5. Cashier's response has no `profit`, `gst` or `expenses` fields |
| AC-16 | Restaurant A with 3 open kitchen orders | Kitchen Staff signs in `[e2e]` | Lands on the kitchen board; dashboard (if opened) shows the floor lens with the 3 open tickets |

### F-06 Products / menu catalogue

| ID | Given | When | Then |
|---|---|---|---|
| AC-17 | Grocery A | A product is created with a blank barcode; then another product is edited to use that barcode `[api]` | First gets an 11-digit barcode starting `20`; the edit returns 409 BARCODE_TAKEN |
| AC-18 | Restaurant A | A menu item with unit `plate` is created `[api][e2e]` | `trackStock = false` by default; it never appears in low/out-of-stock lists; it can be sold with stock 0 |
| AC-19 | Product price 135.00 | Inventory Officer changes it to 140.00 `[api]` | Audit row "Price changed" with "Nu. 135.00 → Nu. 140.00" and the employee's name |

### F-07 Product import / export

| ID | Given | When | Then |
|---|---|---|---|
| AC-20 | Grocery A on Professional | Import a CSV with: a new product whose name contains a quoted comma (`"Rice, Red 5kg"`); an existing barcode with stock changed from 40 to 45; a row with GST Rate 12 `[api]` | Result `{ created: 1, updated: 1, skipped: [{ row: 4, error: "GST rate 12% doesn't match an active tax rate" }] }`; the new name keeps its comma; an `adjustment` movement of +5 with reason "CSV import" exists |
| AC-21 | A product named `=SUM(A1)` | Export products CSV `[api]` | Cell value is `'=SUM(A1)`; file opens in Excel with correct columns and Dzongkha characters intact (BOM) |

### F-08 Inventory & stock movements

| ID | Given | When | Then |
|---|---|---|---|
| AC-22 | Sugar 1kg with stock 5 | Stock out 7 `[api]` | 409 INSUFFICIENT_STOCK "Only 5 in stock."; stock still 5; no movement created |
| AC-23 | Any business after the full test suite | Run the consistency query `[api]` | For every tracked product, `products.stock` = latest movement's `stock_after` = sum of all movement `qty` |
| AC-24 | Products: A stock 3 min 5; B stock 0 min 2; C expiry in 10 days; D expiry yesterday; E untracked stock 0 | Open Inventory `[e2e]` | A in Low stock; B in Out of stock; C in Expiring soon (amber); D shows "(expired)" in red; E shows "Not tracked"; sidebar badge = 2 (A and B — B also satisfies stock ≤ min) |

### F-09 Supplier purchases

| ID | Given | When | Then |
|---|---|---|---|
| AC-25 | Supplier "Druk Wholesale Supply" with no purchases, product stock 10 | Record a purchase of 20 units at 400.00, amount paid 5,000.00 `[api][e2e]` | Purchase number `PUR-YYYY-00001`; stock 30; a `purchase` movement +20; product purchase price 400.00; supplier outstanding = 3,000.00 |

### F-10 POS checkout

| ID | Given | When | Then |
|---|---|---|---|
| AC-26 | POS open, product barcode `20481736205` | Scan it twice; scan `999` `[e2e]` | One cart line with qty 2; toast `No product matches "999".`; focus stays in the scan box |
| AC-27 | Cart total 376.43, payment lines 300.00 | Look at the button; call `POST /sales` anyway `[e2e][api]` | "Complete sale" disabled with the hint; API returns 422 PAYMENT_MISMATCH with `{ total: 376.43, allocated: 300.00 }` |
| AC-28 | Cart total 376.43 | Add cash 200.00 with cash received 500.00, and mBoB 176.43 without a Txn ID, then with one `[e2e][api]` | Without Txn ID: "Enter the transaction ID." (API: 422 PAYMENT_DETAILS_REQUIRED). With it: sale completes; receipt shows Cash 200.00, received 500.00, change 300.00, and mBoB 176.43 with "Txn ID" |
| AC-29 | The worked example in `02-BUSINESS-RULES.md` §3.3 | Engine computes it; then the sale is completed through the API `[unit][api]` | Line allocations 44.90 / 26.60; GST 11.26 / 6.67; subtotal 440.00; discount_total 81.50; taxable 358.50; GST 17.93; total 376.43; words "Three Hundred Seventy-Six Ngultrum and Forty-Three Chhertum only" |
| AC-30 | Product 105.00 with a 5% inclusive rate | Sell 1 `[unit]` | taxable 100.00, GST 5.00, total 105.00 |
| AC-31 | 1 × 65.00 | Line discount 80.00; separately, bill discount 150% `[unit][e2e]` | Line discount capped to 65.00, line total 0.00; bill % capped to 100; no negative values anywhere |
| AC-32 | Customer "Dorji Tshering", credit limit 10,000.00, outstanding 9,500.00 | Credit payment without a customer; then a credit sale of 800.00 for Dorji `[api][e2e]` | First: "Select a customer before adding a credit payment." (422 CREDIT_REQUIRES_CUSTOMER). Second: 201 with warning CREDIT_LIMIT_EXCEEDED; outstanding 10,300.00 |
| AC-33 | Cart with 3 lines, VIP customer, bill discount 10%, Dine-in table 4, a cash line, loaded from KOT-0042 | Hold, then resume `[e2e]` | Everything is restored exactly; the held order is gone from the list |
| AC-34 | Product stock 1, two cashiers with it in their carts | Both complete at the same moment `[api]` | One 201, one 409 INSUFFICIENT_STOCK; stock 0, never negative; invoice numbers have no gap |
| AC-35 | A sale request | Sent 3 times with the same Idempotency-Key (simulated timeouts) `[api]` | Exactly one sale; all three responses carry the same invoice number |
| AC-36 | Product in cart at 135.00; Manager changes the price to 140.00 | Cashier completes `[api][e2e]` | 409 PRICE_CHANGED; POS updates the line to 140.00 and shows "Prices changed for 1 item. Check the new total."; payments not lost |

### F-11 Kitchen orders

| ID | Given | When | Then |
|---|---|---|---|
| AC-37 | Restaurant A | Waiter sends 2 dishes for table 4; Kitchen Staff moves it New → Accepted → Preparing → Ready; someone tries Ready → New `[api][e2e]` | `KOT-NNNN` created in New; each step works; the backwards move returns 409 INVALID_TRANSITION; grocery businesses get 403 on every kitchen route |
| AC-38 | KOT ready | Cashier clicks "Bill this order", pays and completes; then tries to bill it again `[e2e][api]` | Cart contains the order's items at current prices with table 4; after completion the order is Served, billed and linked to the invoice; second attempt 409 NOT_BILLABLE |

### F-12 Tax invoice / receipt

| ID | Given | When | Then |
|---|---|---|---|
| AC-39 | A completed sale for a corporate customer with a TPN; separately a sale in a business with `gstRegistered = false` | Open both receipts `[e2e]` | First shows every field in BR-36 including customer TPN, "TAX INVOICE" and GST per rate. Second shows "INVOICE", no GST rows, tax 0.00 |
| AC-40 | A receipt open | Print; Download PDF `[manual][e2e]` | Print preview shows only the receipt at 80 mm (no sidebar); PDF named `INV-YYYY-NNNNN.pdf` with the same totals |

### F-13 Invoices & void

| ID | Given | When | Then |
|---|---|---|---|
| AC-41 | Completed sale: 2 tracked items, 1 untracked dish, customer paid partly by credit 500.00 | Manager voids with reason "Wrong table" `[api][e2e]` | Status voided with time, Manager and reason; tracked items restocked with `void_restock` movements, untracked dish not; the sale's payments `voided`; customer total spent and outstanding reduced (outstanding by 500.00, not below 0); linked KOT `billed = false`; invoice number unchanged; receipt shows VOID |
| AC-42 | Cashier and Accountant signed in | They open a receipt and call `POST /sales/:id/void` `[api][e2e]` | No Void button; API 403 FORBIDDEN |

### F-14 GST reports

| ID | Given | When | Then |
|---|---|---|---|
| AC-43 | 200 random completed sales (mixed rates, inclusive and exclusive, discounts, charges) and 10 voided sales in a month | Request the GST report for the month `[api]` | Summary GST = Σ `sales.tax_amount` of completed sales = Σ of the by-rate GST = Σ of the daily GST, to the chhertum; voided count 10 and voided sales excluded from all sums (runs on every release) |
| AC-44 | A sale completed at 23:30 BTT on 3 Nov (17:30 UTC) | Report for 3 Nov 00:00–23:59 and for 4 Nov `[api]` | Included on 3 Nov, not on 4 Nov |
| AC-45 | GST report with data | Export each CSV; click Print `[e2e][manual]` | Three CSVs with headers and rows matching the tables; print preview shows the report (not a blank page) |

### F-15 Payment reports

| ID | Given | When | Then |
|---|---|---|---|
| AC-46 | Today: cash sale 100.00, mBoB sale 200.00 later voided, credit sale 300.00, settlement 150.00 by mPay | Open payments for today `[api][e2e]` | Cash 100.00; mBoB 0.00; On credit 300.00; mPay (settlements) 150.00; the voided payment isn't counted in any card |

### F-16 Sales & profit reports

| ID | Given | When | Then |
|---|---|---|---|
| AC-47 | One sale: taxable 358.50, GST 17.93, charges 20.00; lines' unit cost × qty = 250.00; one expense 50.00 the same day; product purchase price later changed | Sales report for that day `[unit][api]` | Estimated profit = 358.50 + 20.00 − 250.00 − 50.00 = 78.50 (GST excluded; old unit cost used) |

### F-17 Customers & credit ledger

| ID | Given | When | Then |
|---|---|---|---|
| AC-48 | VIP discount 5% in Settings | Cashier selects a VIP customer at POS `[e2e]` | Row "VIP Customer pricing (5%)" appears and totals match the shared engine; Walk-in shows no such row |
| AC-49 | Customer owes 3,200.00 | Settlement of 4,000.00; then 1,000.00 by mPay with Txn ID `[api][e2e]` | First: 422 SETTLEMENT_EXCEEDS_BALANCE. Second: receipt `CR-NNNN`, balance 2,200.00, shows in the customer's history and the payments report |

### F-18 Suppliers

| ID | Given | When | Then |
|---|---|---|---|
| AC-50 | Supplier with opening paid 1,000.00 and opening outstanding 2,000.00, plus AC-25's purchase | List suppliers `[api]` | Paid 6,000.00; outstanding 5,000.00 |

### F-19 Expenses

| ID | Given | When | Then |
|---|---|---|---|
| AC-51 | Accountant | Records rent 18,000.00 for today, edits it to 18,500.00, deletes another expense `[api][e2e]` | Totals update; three audit rows; today's dashboard expenses and profit reflect 18,500.00 |

### F-20 Business settings

| ID | Given | When | Then |
|---|---|---|---|
| AC-52 | "GST Standard 5%" used by products and past sales | Try to PATCH its rate to 7; create "GST 7%" and switch a product to it; sell it `[api]` | PATCH rate rejected (400); new sales use 7%; earlier invoices still show 5% |
| AC-53 | Business switches `gstRegistered` to false | Sell a 5% product at 100.00 `[api]` | Line rate 0, GST 0.00, total 100.00, receipt title INVOICE; switching back restores 5% for new sales only |

### F-21 Data export & prototype import

| ID | Given | When | Then |
|---|---|---|---|
| AC-54 | A backup JSON exported from the prototype's "Pema Store"; a fresh v1 business | Admin imports it; then imports again `[api]` | Counts per table returned; products, customers (minus Walk-in), suppliers, expenses, sales, payments, kitchen orders, audit logs present; employees created with `mustChangePassword` and no prototype passwords; second import 409 IMPORT_NOT_ALLOWED |
| AC-55 | Any business | Admin downloads the JSON export `[api]` | Contains all business collections; no `passwordHash`, session or TOTP data |

### F-22 Audit log

| ID | Given | When | Then |
|---|---|---|---|
| AC-56 | Each action listed in `05-SECURITY-ACCESS.md` §7 | Perform it `[api]` | One audit row with actor, action and detail, written in the same transaction (a failed action leaves no row); no API route can edit or delete audit rows |

### F-23 Platform admin panel

| ID | Given | When | Then |
|---|---|---|---|
| AC-57 | Platform Admin with TOTP | Sign in without a code, then with one; open a business; call `GET /sales` with the platform session `[api][e2e]` | Without code: 401. With code: business list shows plan, status, expiry, employee count; verify/suspend/reactivate work with history rows; `GET /sales` returns 401 (platform sessions can't use business routes) |

### F-24 English / Dzongkha

| ID | Given | When | Then |
|---|---|---|---|
| AC-65 | Waiter signed in | Switches to རྫོང་ཁ, signs out and in on another device `[e2e]` | Navigation shows Dzongkha labels (e.g. "ཚོང་འབྲེལ། · POS"); `<html lang="dz">`; preference kept on the other device; a key missing from `dz.json` shows English |

### F-25 Demo companies

| ID | Given | When | Then |
|---|---|---|---|
| AC-66 | Empty staging DB with `SEED_DEMO_BUSINESSES=true` | Run the seed; run it with `NODE_ENV=production` `[api]` | Four demo businesses with all roles, catalogue, customers, suppliers, expenses and (after Phase 7) 30 days of sales; rice, oil and salt use the Exempt rate; in production the seed refuses and creates nothing |

## 2. Business rule tests

| Rule | Test input | Expected output |
|---|---|---|
| BR-04 | status `active`, `expires_at` 1 s ago | Effective status Expired |
| BR-06 | expires 2026-12-10 10:00, verified 2026-12-05 | New expiry 2027-01-09 10:00 |
| BR-12 | 1 × 105.00 inclusive 5% | taxable 100.00, tax 5.00, total 105.00 (AC-30) |
| BR-13 | §3.3 worked example | 376.43 (AC-29) |
| BR-14 | line 65.00, discount 80.00 | discount 65.00, total 0.00 (AC-31) |
| BR-15 | taxable 100.00, GST 5.00, charges 20.00 | grand total 125.00 |
| BR-16 | 1,000 random carts | For every line and sale: taxable + tax = total exactly |
| BR-18 | owes 376.43, cash received 500.00 | change 123.57 |
| BR-20 | owes 3,200.00, pays 1,000.00 | balance 2,200.00 (AC-49) |
| BR-23 | last 2026 invoice INV-2026-04812; sale at 2027-01-01 00:00:05 BTT | INV-2027-00001 |
| BR-25 | stock 5, stock_out 7 | rejected, stock 5 (AC-22) |
| BR-28 | 10,000th kitchen order | KOT-10000 |
| BR-32 | AC-47 data | 78.50 |
| BR-33 | sale completed 2026-11-03T17:30:00Z (23:30 BTT) | business_date 2026-11-03 (AC-44) |
| BR-37 | 376.43; 1,000.00; 0.05 | "Three Hundred Seventy-Six Ngultrum and Forty-Three Chhertum only"; "One Thousand Ngultrum only"; "Zero Ngultrum and Five Chhertum only" |

## 3. Security checks

| ID | Check | How |
|---|---|---|
| AC-58 | Every list endpoint called as Grocery A never returns Grocery B's rows | `[api]` harness from Phase 3, extended each phase |
| AC-59 | Fetching, updating or voiding Grocery B's record by ID as Grocery A returns 404 | `[api]` for every `/:id` route |
| AC-60 | A `businessId` field in any request body is rejected by `.strict()` schemas or ignored; the session's business is always used | `[api]` |
| AC-61 | A product named `<img src=x onerror=alert(1)>`, table number `"><script>alert(1)</script>`, username `x');alert(1);//` and a crafted logo upload render as plain text / safe images on every screen and receipt | `[e2e]` (fixes prototype XSS) |
| AC-62 | Any non-GET request without a valid `X-CSRF-Token` returns 403 CSRF_INVALID | `[api]` |
| AC-63 | After the suite, a DB dump contains no plain-text passwords; all hashes start with `$argon2id$` | `[api]` |
| AC-64 | Responses include CSP, HSTS (production), `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`; cookies are httpOnly, Secure (staging/prod), SameSite=Lax; uploads reject SVG and files > 2 MB | `[api][manual]` |

## 4. Non-functional checks

| ID | Check | How |
|---|---|---|
| AC-67 | With 20,000 sales and 5,000 products in one business: product search < 300 ms; `POST /sales` (30 lines) < 500 ms p95; one-month GST and sales reports < 2 s | `[api]` load script on staging-sized hardware |
| AC-68 | At 360 px width every screen has no horizontal page scroll (tables scroll inside their card); POS is usable one-handed with the sticky pay bar; at 1280 px the layout matches the prototype | `[e2e]` screenshots + `[manual]` |
| AC-69 | A full cash sale can be done with keyboard only (scan box, Tab, Enter, Esc); all text meets the contrast ratios in `09-DESIGN.md` §2; modals trap and return focus | `[e2e]` + axe-core with no serious violations |

## 5. Smoke test (before every deploy)

1. Sign in to a grocery business as Admin (company + employee steps).
2. Add a product with a blank barcode; stock in 10 units.
3. As Cashier: scan it, select a VIP customer, pay with cash + mBoB (with Txn ID), complete, print the receipt.
4. Void that invoice as Manager; confirm stock is back to 10.
5. In a restaurant business: send an order to the kitchen, move it to Ready, bill it.
6. Open the GST report for today and export the daily CSV.
7. Open the payments report for today; voided payment not counted.
8. Switch to Dzongkha and back; sign out.
