# PRD — POS SYSTEM

## 1. Overview

- **App name:** POS SYSTEM (working name; see Open questions in `README.md`)
- **One-liner:** A multi-tenant POS and GST SaaS for grocery stores, restaurants and cafés in Bhutan: billing, kitchen orders, inventory, customer credit, GST reports, and tax invoices in Ngultrum.
- **Built by:** Yuevaán IT Consultancy, Thimphu (receipts show "Powered by Yuevaan Consultancy").
- **Platform:** Responsive web app (desktop, laptop, Android/iPad tablets at the counter). Needs an internet connection in v1 (**Assumption:** see D-11 in `03-TRD.md`).
- **Vision:** Within a year, small and mid-size Bhutanese businesses run their daily sales, stock, credit and monthly GST filing from one subscription, using mobile-wallet payments (mBoB, mPay, TPay, DK Bank) as first-class methods.

### Where this project stands

A working **browser-only prototype** exists in `prototype/` (vanilla JS, data in the browser's localStorage). It was built for client demos and proves the feature set. **v1 is a production rebuild** on React + Node.js + PostgreSQL that keeps the prototype's behavior and screens, fixes its bugs, and adds real security, multi-tenancy and data storage. Where this PRD says "as in prototype", the function names in `prototype/script.js` are the behavioral reference.

## 2. Problem

Small Bhutanese shops and restaurants mostly bill on paper, Excel or single-machine POS software. Since GST replaced the old sales tax on 1 January 2026, they need serially numbered tax invoices and period GST totals, which paper and basic tools don't produce reliably.

- Daily sales, GST collected and payment-method totals (cash vs. mBoB vs. bank) are reconciled by hand at day end.
- Stock runs out unnoticed; expiry dates aren't tracked.
- Customers who buy on credit are tracked in notebooks; balances get disputed.
- Restaurants pass orders to the kitchen verbally or on paper slips, and bills miss items.
- Owners can't see sales, profit or staff activity unless they're at the counter.

## 3. Target users & roles

Role names below are used exactly in every other doc. The **code** is the value stored in the database and API.

| Role | Code | Who they are | Main goal in the app |
|---|---|---|---|
| Admin | `admin` | Business owner or the person they appoint | Full control: setup, staff, settings, subscription, all reports |
| Manager | `manager` | Shop or restaurant manager | Run daily operations, void mistakes, see reports |
| Cashier | `cashier` | Counter staff | Bill customers fast, take payments, print receipts |
| Accountant | `accountant` | Bookkeeper (often part-time) | GST, payment and sales reports, expenses |
| Inventory Officer | `inventory_officer` | Stock controller | Products, stock in/out, low stock, expiry |
| Storekeeper | `storekeeper` | Store-room staff | Same as Inventory Officer in v1 (see Open questions) |
| Waiter | `waiter` | Restaurant floor staff | Take orders, send to kitchen, bill tables |
| Kitchen Staff | `kitchen_staff` | Cooks | See kitchen tickets and move them through statuses |
| Platform Admin | `platform_admin` | Yuevaán staff running the SaaS | Manage subscribing businesses; never sees their sales data |

**Business types:** `grocery` (label "Grocery Store") and `restaurant` (label "Restaurant & Café"). The type changes navigation, order types, customer types and stock rules.

Permissions for each role are defined in `05-SECURITY-ACCESS.md`.

## 4. Features

Priority: **Must** = in the v1 launch (MVP). **Should** = in v1, built after the Must phases. **Could** = only if time allows.

| ID | Feature | Description | Priority | Roles |
|---|---|---|---|---|
| F-01 | Business registration | Register a business (name, type, owner, contact, TPN/GST no., password), pick a plan, start a 14-day trial | Must | Public |
| F-02 | Subscription & plans | Starter / Professional / Enterprise plans, status (Trial, Active, Expired, Suspended, Cancelled), renew by submitting a payment reference, change plan, plan limits, feature gating when inactive | Must | Admin |
| F-03 | Two-step sign-in | Company sign-in (name or Business ID + company password), then employee sign-in (username + password), "remember this device", sign-out | Must | All |
| F-04 | Employees & roles | Add, edit, disable employees; set role; reset passwords; server-side permission checks | Must | Admin |
| F-05 | Role-based dashboard | KPIs, charts and lists tailored per role (full, finance, sales, inventory, floor views) | Must | All |
| F-06 | Products / menu catalogue | Create and edit products or menu items: photo, barcode (auto-generated if blank), category, purchase and selling price, GST rate, unit, stock tracking, min stock, supplier, batch, expiry, active flag | Must | Admin, Manager, Inventory Officer, Storekeeper |
| F-07 | Product import / export | Download a CSV template, import products from CSV (create or update by barcode), export products to CSV | Should | Admin, Manager, Inventory Officer, Storekeeper |
| F-08 | Inventory & stock movements | Current stock, stock in / stock out / adjustment with reasons, movement history, low-stock and out-of-stock alerts, expiring-soon list | Must | Admin, Manager, Inventory Officer, Storekeeper |
| F-09 | Supplier purchases | Record purchases from a supplier (items, quantities, cost, amount paid); stock goes in automatically; supplier balances are calculated | Should | Admin, Manager, Inventory Officer, Storekeeper |
| F-10 | POS checkout | Barcode scan and search, cart with quantity and line discounts, customer-type pricing, bill discount, charges, order type and table, split payments across methods, credit sales, hold/resume, cancel, complete sale | Must | Admin, Manager, Cashier, Waiter |
| F-11 | Kitchen orders (KOT) | Restaurant only: send a cart to the kitchen as a ticket, kitchen board with statuses, bill a ready order at the POS | Must | Admin, Manager, Cashier, Waiter, Kitchen Staff |
| F-12 | Tax invoice / receipt | 80 mm tax invoice with business details, TPN, items, GST by rate, discounts, payments, amount in words, invoice barcode; print and PDF download | Must | Admin, Manager, Cashier, Waiter, Accountant |
| F-13 | Invoices & void | Search and view all invoices; void an invoice (reverses stock, payments and customer balances); voided invoices stay on record marked VOID | Must | View: see matrix; Void: Admin, Manager |
| F-14 | GST reports | Any date-time range with quick ranges; total, taxable, GST, discounts, voided count; daily breakdown; breakdown by GST rate; transaction list; CSV export and print | Must | Admin, Manager, Accountant |
| F-15 | Payment reports | Totals by payment method, payment records with bank and journal/transaction IDs, CSV export | Must | Admin, Manager, Accountant |
| F-16 | Sales & profit reports | Gross sales, transaction count, average sale, estimated profit; revenue, category and profit charts; sales by cashier and by category | Must | Admin, Manager, Accountant |
| F-17 | Customers & credit ledger | Customer records with business-specific types, credit limit, total spent, outstanding balance; purchase history; receive payments against credit | Must | Admin, Manager, Cashier, Accountant |
| F-18 | Suppliers | Supplier records (name, phone, email, address) with paid and outstanding totals | Must | Manage: Admin, Manager; view: Accountant, Inventory Officer, Storekeeper |
| F-19 | Expenses | Record, edit and delete expenses with category, date and payment method; totals feed profit | Must | Admin, Manager, Accountant |
| F-20 | Business settings | GST rates (rate, inclusive/exclusive, category, default), GST-registered flag, customer-type automatic discounts, business profile and receipt logo | Must | Admin |
| F-21 | Data export & prototype import | Download the business's data as JSON; one-time import of a prototype backup file to migrate pilot businesses | Should | Admin |
| F-22 | Audit log | Every sign-in, sale, void, price change, stock adjustment, permission and settings change is recorded and viewable | Must | Admin |
| F-23 | Platform admin panel | List businesses, see plan, status, expiry and user count; verify subscription payments; extend, suspend, reactivate | Must | Platform Admin |
| F-24 | English / Dzongkha | Switch the interface between English and Dzongkha per employee | Must | All |
| F-25 | Demo companies | Four seeded demo businesses (2 grocery, 2 restaurant) with 30 days of sample sales, available only in local and staging environments | Could | — |

## 5. User stories

### F-01 Business registration
- As a shop owner, I want to register my business and start a free trial so that I can try the system before paying.
- As a shop owner, I want my business name to be unique so that staff can sign in by typing it.

### F-02 Subscription & plans
- As an Admin, I want to see my plan, status and days left so that I renew before I'm locked out.
- As an Admin, I want to pay by bank transfer or mobile wallet and submit the reference so that my account is reactivated.
- As an Admin, I want the system to keep my data and let me sign in even when my subscription has lapsed so that I can renew.

### F-03 Two-step sign-in
- As a Cashier, I want to sign in with my own username so that my sales are recorded under my name.
- As an Admin, I want the till to remember the company on a trusted device so that staff only type their own login.

### F-04 Employees & roles
- As an Admin, I want to add staff with a role so that they see only what their job needs.
- As an Admin, I want to disable a leaving employee so that they can't sign in anymore, immediately.

### F-05 Role-based dashboard
- As an Admin, I want today's sales, profit, GST and stock alerts on one screen so that I know how the day is going.
- As Kitchen Staff, I want to see open tickets first so that I don't miss orders.

### F-06 Products / menu catalogue
- As an Inventory Officer, I want to add products with a barcode and GST rate so that cashiers can scan them.
- As a restaurant Manager, I want menu items that don't track stock so that dishes never show "out of stock".

### F-07 Product import / export
- As a new grocery Admin, I want to import my product list from a spreadsheet so that I don't type 500 items by hand.

### F-08 Inventory & stock movements
- As an Inventory Officer, I want to record stock in and stock out with a reason so that stock levels stay accurate and traceable.
- As a Manager, I want to see low-stock and expiring items so that I reorder or discount them in time.

### F-09 Supplier purchases
- As a Storekeeper, I want to record a supplier delivery once so that stock goes up and the supplier balance updates together.

### F-10 POS checkout
- As a Cashier, I want to scan items and see the total update instantly so that the queue moves fast.
- As a Cashier, I want to split a bill between cash and mBoB and record the transaction ID so that day-end reconciliation matches.
- As a Cashier, I want to put part of a bill on a known customer's credit so that regular customers can settle monthly.
- As a Cashier, I want to hold a bill and serve the next customer so that one slow customer doesn't block the line.

### F-11 Kitchen orders (KOT)
- As a Waiter, I want to send a table's order to the kitchen without billing it so that cooking starts right away.
- As Kitchen Staff, I want to move tickets from New to Ready so that waiters know when to serve.
- As a Cashier, I want to bill a ready kitchen order with one click so that nothing ordered is missed on the bill.

### F-12 Tax invoice / receipt
- As a Cashier, I want to print an 80 mm tax invoice so that the customer gets a valid GST receipt.
- As a corporate customer, I want my GST/TPN on the invoice so that I can claim input tax.

### F-13 Invoices & void
- As a Manager, I want to void a wrong invoice so that stock, payments and the customer's balance are corrected automatically.

### F-14 GST reports
- As an Accountant, I want GST collected for any period, split by rate, so that I can file the GST return.

### F-15 Payment reports
- As a Manager, I want totals per payment method with transaction IDs so that I can match them against bank and wallet statements.

### F-16 Sales & profit reports
- As an Admin, I want estimated profit after cost of goods and expenses so that I know if the business is making money.

### F-17 Customers & credit ledger
- As a Cashier, I want to record a credit customer's part-payment so that their balance is always current.
- As an Admin, I want to give VIP or wholesale customers an automatic discount so that pricing is consistent.

### F-18 Suppliers
- As a Manager, I want each supplier's contact details and outstanding amount in one place so that I can plan payments.

### F-19 Expenses
- As an Accountant, I want to record rent, utilities and salaries so that profit reports are realistic.

### F-20 Business settings
- As an Admin, I want to set GST rates once so that every product and invoice uses them consistently.
- As an Admin of a business not registered for GST, I want invoices without GST so that I don't charge tax I'm not allowed to collect.

### F-21 Data export & prototype import
- As a pilot customer on the prototype, I want to import my backup so that I keep my products, customers and sales history.

### F-22 Audit log
- As an Admin, I want to see who voided an invoice or changed a price so that I can investigate problems.

### F-23 Platform admin panel
- As a Platform Admin, I want to verify a submitted bank reference and reactivate the business so that paying customers aren't blocked.

### F-24 English / Dzongkha
- As a Waiter, I want the interface in Dzongkha so that I'm comfortable using it.

### F-25 Demo companies
- As a Yuevaán salesperson, I want ready-made demo businesses on staging so that I can show the product to clients.

## 6. MVP scope (v1)

- **Must (launch):** F-01, F-02, F-03, F-04, F-05, F-06, F-08, F-10, F-11, F-12, F-13, F-14, F-15, F-16, F-17, F-18, F-19, F-20, F-22, F-23, F-24
- **Should (v1, after Must phases):** F-07, F-09, F-21
- **Could:** F-25
- **Core loop:** sign in → scan or add items → take payment (any mix of methods, or credit) → print tax invoice → stock, customer balance, payment and GST reports update.
- **Restaurant loop:** take order → send to kitchen → kitchen marks Ready → bill the order at POS → print invoice.

## 7. Out of scope (v1)

- **Offline selling.** v1 needs internet; an offline queue that syncs later is a v2 candidate (D-11).
- **Online payment gateway for subscriptions.** v1 records a bank or wallet reference that a Platform Admin verifies (D-12).
- **Payment terminals or wallet APIs at POS.** Methods and transaction IDs are recorded manually.
- **Refunds, returns and credit notes.** v1 corrects mistakes by voiding the whole invoice (F-13).
- **Multiple branches or warehouses per business,** and stock transfers between them.
- **Weighed items** (fractional quantities such as 1.25 kg). v1 quantities are whole numbers.
- **Direct GST return filing** into the DRC's BITS portal. v1 produces the figures and CSVs.
- **Native mobile apps,** a customer-facing ordering site, loyalty points, table-map layouts, recipes or ingredient-level stock.
- **Email and SMS notifications,** including self-service password reset by email.
- **Advanced Analytics, Smart Inventory and Multi-branch "upgrades".** The prototype shows these as cards on the Subscription screen; v1 leaves them out.

## 8. Success metrics

| Metric | Target | How measured |
|---|---|---|
| Checkout speed | Median < 30 s from first scan to invoice for a 5-item cash sale | `sales.created_at` minus time of first cart add (client event) on pilot sites |
| Pilot adoption | 10 paying businesses within 3 months of launch | Active subscriptions in the platform panel |
| Data accuracy | 0 GST total mismatches between invoices and the GST report | Automated reconciliation test (AC-43) on every release |
| Reliability | 99.5% monthly uptime during business hours (08:00–22:00 BTT) | Uptime monitor |
| Day-end reconciliation | Payment report totals match the cash drawer and wallet statements on 95% of pilot days | Pilot feedback form |

## 9. Constraints & assumptions

- Prices and money are in Bhutanese Ngultrum (Nu.), with 2 decimals (chhertum). Time zone is Asia/Thimphu (UTC+6).
- GST is 5% standard from 1 January 2026; some goods are exempt or zero-rated. The rules the app follows are in `02-BUSINESS-RULES.md` §3, and their legal details are open questions to confirm with the DRC.
- Counter devices are often low-cost Android tablets or old Windows PCs running Chrome or Edge, with USB barcode scanners (keyboard input) and 80 mm thermal printers driven by the browser's print dialog.
- Pilot businesses may already have data in the prototype's backup format (F-21).
- **Assumption:** small team (1–2 developers using Claude Code), launch target about 4 months after Phase 0 starts.
- **Assumption:** existing plan prices from the prototype stay: Starter Nu. 800/month, Professional Nu. 2,200/month, Enterprise Nu. 4,500/month.
