# API Spec — POS SYSTEM

REST API served by `apps/api`. Field names match `06-BACKEND-SCHEMA.md` in camelCase. Request bodies are validated with the Zod schemas in `packages/shared/src/schemas` (same names as the route, e.g. `CreateSaleRequest`).

## 1. Conventions

| Item | Decision |
|---|---|
| Style | REST over HTTPS, JSON |
| Base URL | `/api/v1` (platform routes under `/api/v1/platform`) |
| Auth | Session cookie `sid` (business) or `psid` (platform); see `05-SECURITY-ACCESS.md` §1. No bearer tokens. |
| CSRF | Every non-GET request sends header `X-CSRF-Token` matching the `csrf` cookie. Get one from `GET /auth/csrf`. |
| Format | camelCase keys; `null` for empty values (never omitted in responses) |
| Money | JSON numbers with at most 2 decimals (`376.43`); computed per `02-BUSINESS-RULES.md` §3 |
| Dates | Business days as `YYYY-MM-DD`; date-times in requests as `YYYY-MM-DDTHH:mm` meaning Asia/Thimphu local; timestamps in responses as ISO 8601 UTC (`2026-11-03T08:12:45.120Z`) |
| Success shape | `{ "data": … }`; lists `{ "data": [ … ], "meta": { "page": 1, "limit": 50, "total": 812 } }`; optional `"warnings": [ { "code", "message" } ]` |
| Error shape | `{ "error": { "code": "INSUFFICIENT_STOCK", "message": "Not enough stock for Sugar 1kg. Available: 1", "details": { … }, "requestId": "…" } }` |
| Pagination | `?page=1&limit=50` (max 200); default sort newest first |
| Idempotency | `Idempotency-Key: <uuid>` required on `POST /sales`, `POST /customers/:id/settlements`, `POST /purchases`; a repeat returns the first response (`06-BACKEND-SCHEMA.md` → `idempotency_keys`) |
| Files | Uploads as `multipart/form-data` field `file`; CSV downloads as `text/csv; charset=utf-8` with BOM (opens correctly in Excel) |
| Gating | Routes marked **Sub** need an active subscription (BR-05). Routes marked **Plan: X** need that plan or higher (BR-07). |
| Permissions | The **Permission** column uses the keys in `05-SECURITY-ACCESS.md` §3. "Employee" = any signed-in employee. |

## 2. Error codes

| HTTP | Code | When |
|---|---|---|
| 400 | VALIDATION_ERROR | Body or query fails its Zod schema or a rule in `02-BUSINESS-RULES.md` §5; `details.fields` maps field → message |
| 401 | UNAUTHENTICATED | No session, or it expired |
| 401 | INVALID_CREDENTIALS | Wrong business, username or password (same message for all) |
| 403 | FORBIDDEN | Permission missing for the role (`05` §3), or wrong business type |
| 403 | CSRF_INVALID | Missing or wrong `X-CSRF-Token` |
| 403 | PASSWORD_CHANGE_REQUIRED | `mustChangePassword` is true; only `POST /me/password` allowed |
| 403 | SUBSCRIPTION_INACTIVE | Effective status Expired, Suspended or Cancelled on a **Sub** route (BR-05) |
| 403 | PLAN_LIMIT | Plan doesn't include the feature, or employee limit reached (BR-07) |
| 404 | NOT_FOUND | No such record in this business (also used for other businesses' IDs) |
| 409 | BUSINESS_NAME_TAKEN | BR-01 |
| 409 | USERNAME_TAKEN | BR-02 |
| 409 | LAST_ADMIN | Would leave no active Admin (BR-02) |
| 409 | BARCODE_TAKEN | BR-08 |
| 409 | INSUFFICIENT_STOCK | BR-22, BR-25; `details.items: [{ productId, name, available, requested }]` |
| 409 | PRICE_CHANGED | Cart unit price ≠ current price; `details.items: [{ productId, oldPrice, newPrice }]` |
| 409 | PRODUCT_UNAVAILABLE | Product inactive or missing |
| 409 | INVALID_TRANSITION | Kitchen order or subscription change not allowed by `02` §4 |
| 409 | NOT_BILLABLE | Kitchen order isn't Ready/Served or is already billed (BR-27) |
| 409 | ALREADY_VOIDED | Sale isn't `completed` (BR-24) |
| 409 | IMPORT_NOT_ALLOWED | Prototype import into a business that already has sales |
| 409 | IDEMPOTENCY_IN_PROGRESS | Same key is still being processed |
| 413 | FILE_TOO_LARGE | Image > 2 MB, CSV or JSON > 10 MB |
| 415 | UNSUPPORTED_FILE | Not JPEG/PNG/WebP, CSV or JSON as required |
| 422 | PAYMENT_MISMATCH | Payments ≠ grand total (BR-17); `details: { total, allocated }` |
| 422 | PAYMENT_DETAILS_REQUIRED | Bank name / journal no. / Txn ID missing (BR-17) |
| 422 | CREDIT_REQUIRES_CUSTOMER | BR-19 |
| 422 | SETTLEMENT_EXCEEDS_BALANCE | BR-20 |
| 423 | ACCOUNT_LOCKED | Too many failed sign-ins (`05` §1) |
| 429 | RATE_LIMITED | Rate limit hit |
| 500 | INTERNAL_ERROR | Anything unexpected; `requestId` for support |

Warning codes (in `warnings`, request still succeeds): `CREDIT_LIMIT_EXCEEDED` (BR-19), `LOW_STOCK` (`details.items`), `SUBSCRIPTION_EXPIRING` (≤ 7 days left).

## 3. Endpoints

### 3.1 Auth & session (F-03)

| Method & path | Purpose | Permission | Notes |
|---|---|---|---|
| `GET /auth/csrf` | Issue CSRF token | Public | Sets `csrf` cookie, returns `{ token }` |
| `GET /auth/device` | Remembered company for this device | Public | `{ business: { name, businessCode, logoUrl } }` or `null` |
| `POST /auth/company-login` | Step 1 | Public | Below |
| `POST /auth/employee-login` | Step 2 | Device cookie | Below |
| `POST /auth/logout` | End employee session | Employee | Audit "Logout" |
| `POST /auth/forget-device` | Clear device cookie | Public | |
| `GET /auth/me` | Current employee, business, subscription, permissions | Employee | Shape below |
| `POST /me/password` | Change own password | `me.manage` | `{ currentPassword, newPassword }` |
| `PATCH /me` | Change own language | `me.manage` | `{ language: "en" \| "dz" }` |

#### `POST /auth/company-login`
- **Body:** `{ "identifier": "Pema Store" | "BIZ-7Q2KD", "password": "…", "rememberDevice": true }`
- **200:** `{ "data": { "business": { "name", "businessCode", "type", "logoUrl" }, "subscriptionBlocked": false } }`; sets `device` cookie.
- **Errors:** 400, 401 INVALID_CREDENTIALS, 429.

#### `POST /auth/employee-login`
- **Body:** `{ "username": "cashier1", "password": "…" }`
- **200:** same body as `GET /auth/me`; sets `sid`; regenerates session.
- **Errors:** 400, 401 UNAUTHENTICATED (no device cookie), 401 INVALID_CREDENTIALS, 423 ACCOUNT_LOCKED.

#### `GET /auth/me` → 200
```json
{ "data": {
  "employee": { "id": "uuid", "name": "Sample Cashier", "username": "cashier1", "role": "cashier", "language": "en", "mustChangePassword": false },
  "business": { "id": "uuid", "businessCode": "BIZ-7Q2KD", "name": "Pema Store", "type": "grocery", "gstRegistered": true, "gstNo": "GST-100223344", "address": "Changzamtok, Thimphu", "phone": "+975 17123450", "email": "pemastore.bt@gmail.com", "logoUrl": "/uploads/logo-…webp" },
  "subscription": { "plan": "professional", "status": "active", "effectiveStatus": "active", "expiresAt": "…", "daysLeft": 21 },
  "permissions": ["dashboard.view", "pos.sell", "kitchen.view", "sales.view", "customers.view", "customers.manage", "customers.settle", "me.manage"],
  "dashboardLens": "sales",
  "planFeatures": ["customers", "gst_reports", "import_export"]
} }
```

### 3.2 Registration (F-01)

| Method & path | Purpose | Permission | Notes |
|---|---|---|---|
| `GET /register/name-available?name=` | Live name check | Public | `{ available: true }` |
| `POST /register` | Create business | Public | Rate-limited 5/hour per IP |

#### `POST /register`
- **Body:** `{ "business": { "name", "type": "grocery"|"restaurant", "ownerName", "phone", "email", "gstNo": null, "address": null }, "password": "…", "plan": "professional" }`
- **Effects:** BR-03 (business, Admin `admin`, default tax rates, trial subscription), default customer-type discounts at 0%, audit and subscription event.
- **201:** `{ "data": { "businessCode": "BIZ-7Q2KD", "name": "…", "trialEndsAt": "…" } }`
- **Errors:** 400, 409 BUSINESS_NAME_TAKEN, 429.

### 3.3 Subscription (F-02)

| Method & path | Purpose | Permission | Notes |
|---|---|---|---|
| `GET /subscription` | Plan, status, days left, plan table, history, submitted payments | `subscription.manage` | |
| `POST /subscription/payments` | Submit a payment for verification | `subscription.manage` | `{ method, bankName, reference, paidOn }`; amount = current plan price; status `pending` |
| `POST /subscription/change-plan` | Switch plan | `subscription.manage` | `{ plan }`; 403 PLAN_LIMIT if over the lower plan's limits (BR-07); takes effect immediately, price applies from next payment |
| `POST /subscription/cancel` | Cancel | `subscription.manage` | 409 INVALID_TRANSITION if already cancelled |

### 3.4 Employees (F-04)

| Method & path | Purpose | Permission | Notes |
|---|---|---|---|
| `GET /employees` | List | `employees.manage` | |
| `POST /employees` | Add | `employees.manage` | `{ name, username, password, role }`; 409 USERNAME_TAKEN; 403 PLAN_LIMIT |
| `PATCH /employees/:id` | Edit name, role, active | `employees.manage` | 409 LAST_ADMIN; enabling checks plan limit |
| `POST /employees/:id/reset-password` | Set temporary password | `employees.manage` | `{ temporaryPassword }`; sets `mustChangePassword` |

### 3.5 Dashboard (F-05)

| Method & path | Purpose | Permission | Notes |
|---|---|---|---|
| `GET /dashboard` | Data for the caller's lens (`05` §4) | `dashboard.view` | Only the sections for that lens are present: `today { sales, orders, profit, gst, expenses }`, `counts { products, customers, pendingOrders, lowStock, outOfStock }`, `lowStockItems[]`, `grocery { inventoryValue, fastMovingToday, recentPurchases }` or `restaurant { activeTables, pendingKitchen, dineIn, takeaway }`, `salesLast7Days[]`, `paymentMixToday[]`, `topProducts[]`, `recentSales[]`, `openKitchenTickets[]` |

### 3.6 Products (F-06, F-07)

| Method & path | Purpose | Permission | Gating |
|---|---|---|---|
| `GET /products?search=&category=&active=&page=` | Catalogue list (grouped by category in UI) | `products.view` | |
| `GET /products/categories` | Distinct categories | `products.view` | |
| `POST /products` | Create | `products.manage` | |
| `PATCH /products/:id` | Edit (not stock) | `products.manage` | Price change audited |
| `POST /products/:id/image` / `DELETE /products/:id/image` | Photo | `products.manage` | 413, 415 |
| `GET /products/import-template.csv` | CSV template | `products.import_export` | Plan: Professional |
| `POST /products/import` | Import CSV | `products.import_export` | Plan: Professional |
| `GET /products/export.csv` | Export CSV | `products.import_export` | Plan: Professional |

- **Create body:** `{ name, category, barcode: null, purchasePrice, sellPrice, taxRateId, unit, trackStock, openingStock, minStock, supplierId, batchNo, expiryDate }`. Barcode generated if null (BR-08); `openingStock` > 0 creates an `opening_stock` movement.
- **CSV columns (template, as prototype):** `Product Name, Barcode, Category, Purchase Price, Selling Price, GST Rate, Unit, Opening Stock, Minimum Stock, Supplier`. Parsed with a real CSV parser (quoted commas allowed). Rows match existing products by barcode (update fields; stock difference becomes an `adjustment` movement with reason "CSV import"); GST Rate must match an active rate's % (else row skipped); Supplier matched by name. **Response:** `{ created, updated, skipped: [{ row, error }] }`.

### 3.7 Inventory & purchases (F-08, F-09)

| Method & path | Purpose | Permission | Notes |
|---|---|---|---|
| `GET /inventory/stock?status=low\|out\|ok&search=` | Current stock list | `inventory.view` | |
| `GET /inventory/alerts` | Low, out of stock, expiring/expired (BR-26) | `inventory.view` | |
| `GET /stock-movements?productId=&type=&from=&to=&page=` | Movement history | `inventory.view` | |
| `POST /stock-movements` | Stock in / out / adjustment | `inventory.adjust` | Below |
| `GET /purchases?supplierId=&from=&to=` | Purchase list | `purchases.manage` | Grocery only |
| `GET /purchases/:id` | Purchase detail | `purchases.manage` | |
| `POST /purchases` | Record purchase (BR-38) | `purchases.manage` | Idempotency-Key |

#### `POST /stock-movements`
- **Body:** `{ "productId", "type": "stock_in"|"stock_out"|"adjustment", "qty": 5, "direction": "increase"|"decrease" (adjustment only), "reason": "Damaged", "batchNo": null, "expiryDate": null }`
- **201:** `{ "data": { "movement": { …, "stockAfter": 12 }, "product": { "id", "stock": 12 } } }`
- **Errors:** 400, 404, 409 INSUFFICIENT_STOCK (BR-25), 409 PRODUCT_UNAVAILABLE (untracked product).

#### `POST /purchases`
- **Body:** `{ "supplierId", "purchaseDate": "2026-11-03", "amountPaid": 5000, "note": null, "items": [ { "productId", "qty": 10, "unitCost": 420, "batchNo": null, "expiryDate": null } ] }`
- **201:** purchase with `purchaseNo` (`PUR-2026-00012`) and items.

### 3.8 Suppliers (F-18)

| Method & path | Purpose | Permission |
|---|---|---|
| `GET /suppliers?search=&active=` | List with `paidTotal`, `outstandingTotal` (computed, `06` → suppliers) | `suppliers.view` |
| `POST /suppliers` | Create `{ name, phone, email, address, notes }` | `suppliers.manage` |
| `PATCH /suppliers/:id` | Edit, deactivate | `suppliers.manage` |

Plan: Professional for all supplier routes.

### 3.9 Customers & credit (F-17)

| Method & path | Purpose | Permission | Gating |
|---|---|---|---|
| `GET /customers?search=&type=&active=` | List with balances; header totals `{ outstandingTotal, customersWithBalance }` | `customers.view` | Plan: Professional |
| `POST /customers` | Create | `customers.manage` | Plan: Professional |
| `PATCH /customers/:id` | Edit, deactivate | `customers.manage` | Plan: Professional |
| `GET /customers/:id/history` | Sales and settlements | `customers.view` | Plan: Professional |
| `POST /customers/:id/settlements` | Receive credit payment (BR-20) | `customers.settle` | Plan: Professional, Idempotency-Key |

#### `POST /customers/:id/settlements`
- **Body:** `{ "amount": 1000, "method": "mpay", "bankName": null, "journalNo": "MP77812345", "remarks": null }`
- **201:** `{ "data": { "payment": { "receiptNo": "CR-0007", … }, "customer": { "outstandingBalance": 2200 } } }`
- **Errors:** 400, 404, 422 SETTLEMENT_EXCEEDS_BALANCE, 422 PAYMENT_DETAILS_REQUIRED.

### 3.10 POS, sales & held orders (F-10, F-12, F-13)

| Method & path | Purpose | Permission | Gating |
|---|---|---|---|
| `GET /pos/products?search=` | Active products for the POS: id, name, barcode, category, sellPrice, stock, trackStock, taxRate { rate, mode, category }, imageUrl | `pos.sell` | Sub |
| `GET /pos/products/by-barcode/:barcode` | Exact barcode lookup for the scanner | `pos.sell` | Sub |
| `GET /pos/customers?search=` | Active customers: id, name, phone, type, creditLimit, outstandingBalance, discountPct | `pos.sell` | Sub, Plan: Professional (Starter POS is Walk-in only, so no credit sales) |
| `POST /sales` | Complete a sale (BR-21) | `pos.sell` | Sub, Idempotency-Key |
| `GET /sales?from=&to=&q=&status=&page=` | Invoices list (q matches invoice no. or customer name) | `sales.view` | Sub |
| `GET /sales/:id` | Full sale for receipt | `sales.view` (Waiter: own only) | Sub |
| `POST /sales/:id/void` | Void (BR-24) | `sales.void` | Sub |
| `GET /held-orders` | List held orders | `pos.sell` | Sub |
| `POST /held-orders` | Hold `{ payload }` (`HeldOrderPayload`, BR-29) | `pos.sell` | Sub |
| `POST /held-orders/:id/resume` | Returns payload and deletes it | `pos.sell` | Sub |
| `DELETE /held-orders/:id` | Delete | `pos.sell` | Sub |

#### `POST /sales`
- **Headers:** `Idempotency-Key: <uuid>` (generated when the cart is first paid; reused on retry).
- **Body:**
```json
{
  "orderType": "walk_in",
  "tableNo": null,
  "customerId": "uuid-of-VIP-customer",
  "kitchenOrderId": null,
  "heldOrderId": null,
  "lines": [
    { "productId": "uuid-tea", "qty": 2, "unitPrice": 135.00, "lineDiscount": 0 },
    { "productId": "uuid-detergent", "qty": 1, "unitPrice": 170.00, "lineDiscount": 10.00 }
  ],
  "billDiscount": { "type": "amount", "value": 50.00 },
  "charges": 0,
  "payments": [
    { "method": "cash", "amount": 200.00, "cashReceived": 500.00, "fee": 0, "bankName": null, "journalNo": null, "remarks": null },
    { "method": "mbob", "amount": 176.43, "cashReceived": null, "fee": 0, "bankName": null, "journalNo": "48211904", "remarks": null }
  ],
  "expectedTotal": 376.43
}
```
- **Server steps:** BR-21 in order. `unitPrice` must equal the current price (else 409 PRICE_CHANGED); the customer's current discount % is used; totals come from the shared engine; `expectedTotal` must equal the server total (else 409 PRICE_CHANGED with the recomputed totals); a `heldOrderId` is deleted on success.
- **201:** `{ "data": <Sale>, "warnings": [] }`, where `<Sale>` is:
```json
{
  "id": "uuid", "invoiceNo": "INV-2026-00042", "status": "completed",
  "completedAt": "2026-11-03T05:12:45.120Z", "businessDate": "2026-11-03",
  "cashier": { "id": "uuid", "name": "Sample Cashier" },
  "customer": { "id": "uuid", "name": "Karma Wangchuk", "phone": "+975 17234567", "type": "vip", "gstId": null },
  "orderType": "walk_in", "tableNo": null, "kitchenOrderId": null, "gstRegistered": true,
  "subtotal": 440.00, "discountTotal": 81.50,
  "customerTypePct": 5, "customerTypeAmt": 21.50,
  "billDiscount": { "type": "amount", "value": 50.00, "amount": 50.00 },
  "taxableAmount": 358.50, "taxAmount": 17.93,
  "gstByRate": [ { "rate": 5, "category": "standard", "taxable": 358.50, "tax": 17.93 } ],
  "charges": 0, "total": 376.43, "amountPaid": 376.43, "creditAmount": 0,
  "paymentSummary": "Split", "amountInWords": "Three Hundred Seventy-Six Ngultrum and Forty-Three Chhertum only",
  "items": [
    { "lineNo": 1, "productId": "uuid-tea", "name": "Red Label Tea 250g", "unitPrice": 135.00, "qty": 2, "lineDiscount": 0, "allocatedDiscount": 44.90, "taxRate": 5, "taxMode": "exclusive", "taxable": 225.10, "tax": 11.26, "total": 236.36 },
    { "lineNo": 2, "productId": "uuid-detergent", "name": "Detergent Powder 1kg", "unitPrice": 170.00, "qty": 1, "lineDiscount": 10.00, "allocatedDiscount": 26.60, "taxRate": 5, "taxMode": "exclusive", "taxable": 133.40, "tax": 6.67, "total": 140.07 }
  ],
  "payments": [
    { "method": "cash", "amount": 200.00, "cashReceived": 500.00, "changeGiven": 300.00, "bankName": null, "journalNo": null, "status": "completed" },
    { "method": "mbob", "amount": 176.43, "cashReceived": null, "changeGiven": null, "bankName": null, "journalNo": "48211904", "status": "completed" }
  ],
  "voided": null
}
```
- **Errors:** 400, 403 SUBSCRIPTION_INACTIVE, 404 (customer, kitchen order), 409 INSUFFICIENT_STOCK, 409 PRICE_CHANGED, 409 PRODUCT_UNAVAILABLE, 409 NOT_BILLABLE, 422 PAYMENT_MISMATCH, 422 PAYMENT_DETAILS_REQUIRED, 422 CREDIT_REQUIRES_CUSTOMER.
- **Warnings:** `CREDIT_LIMIT_EXCEEDED`, `LOW_STOCK`.

#### `POST /sales/:id/void`
- **Body:** `{ "reason": "Scanned wrong item" }`
- **200:** the `<Sale>` with `status: "voided"` and `voided: { "at", "by": { "id", "name" }, "reason" }`; warnings may include `CUSTOMER_BALANCE_ALREADY_SETTLED`.
- **Errors:** 400, 403 FORBIDDEN, 404, 409 ALREADY_VOIDED.

### 3.11 Kitchen orders (F-11)

| Method & path | Purpose | Permission | Gating |
|---|---|---|---|
| `GET /kitchen-orders?status=&from=` | Board data (default: open orders + served/cancelled from today) | `kitchen.view` | Sub, restaurant |
| `GET /kitchen-orders/billable` | Ready/Served and not billed | `pos.sell` | Sub, restaurant |
| `POST /kitchen-orders` | Send to kitchen `{ orderType, tableNo, note, customerId, items: [{ productId, qty }] }` → `KOT-NNNN` | `kitchen.create` | Sub, restaurant |
| `POST /kitchen-orders/:id/status` | `{ status }`, one step forward or `cancelled` (`02` §4.1) | `kitchen.update` | Sub, restaurant; 409 INVALID_TRANSITION |

### 3.12 Payments & reports (F-14, F-15, F-16)

| Method & path | Purpose | Permission | Gating |
|---|---|---|---|
| `GET /payments?from=&to=&method=&kind=&page=` | `{ totalsByMethod: [{ method, amount, count }], onCredit, settlementsTotal, records: [...] }` — completed only (BR-31) | `payments.view` | Sub, Plan: Professional |
| `GET /payments/export.csv?from=&to=` | Columns: Date, Time, Invoice/Receipt, Method, Amount, Fee, Bank, JournalNo, Remarks, CreatedBy, Status | `payments.view` | Sub, Plan: Professional |
| `GET /reports/gst?from=&to=` | Below | `reports.gst` | Sub, Plan: Professional |
| `GET /reports/gst/export.csv?kind=daily\|rate\|sales&from=&to=` | CSV for each table | `reports.gst` | Sub, Plan: Professional |
| `GET /reports/sales?from=&to=` | `{ grossSales, count, averageSale, estimatedProfit, revenueByDay[], profitByDay[], byCategory[], byCashier[] }` (BR-32, last 10 days for charts) | `reports.sales` | Sub; Starter gets totals and tables only |

#### `GET /reports/gst?from=2026-11-01T00:00&to=2026-11-30T23:59`
```json
{ "data": {
  "range": { "from": "2026-11-01T00:00", "to": "2026-11-30T23:59" },
  "gstRegistered": true,
  "summary": { "totalSales": 152096.70, "taxableSales": 145086.19, "gst": 7010.51, "discounts": 3120.00, "transactions": 418, "voided": 3, "netSales": 152096.70 },
  "daily": [ { "date": "2026-11-01", "sales": 4820.00, "taxable": 4590.48, "gst": 229.52, "transactions": 14 } ],
  "byRate": [ { "rate": 5, "category": "standard", "taxable": 140210.19, "gst": 7010.51 }, { "rate": 0, "category": "exempt", "taxable": 4876.00, "gst": 0 } ],
  "sales": [ { "id", "invoiceNo", "completedAt", "taxable", "gst", "total", "status" } ]
} }
```

### 3.13 Expenses (F-19)

| Method & path | Purpose | Permission |
|---|---|---|
| `GET /expenses?from=&to=&category=` | List + `totalInRange` | `expenses.view` |
| `POST /expenses` | `{ name, category, amount, businessDate, paymentMethod, description }` | `expenses.manage` |
| `PATCH /expenses/:id` | Edit | `expenses.manage` |
| `DELETE /expenses/:id` | Delete (audited) | `expenses.manage` |

### 3.14 Settings & business profile (F-20)

| Method & path | Purpose | Permission |
|---|---|---|
| `GET /settings/tax-rates` | List | `settings.manage` (also returned in `GET /pos/products` per product) |
| `POST /settings/tax-rates` | `{ name, rate, mode, category, effectiveDate, isDefault }` | `settings.manage` |
| `PATCH /settings/tax-rates/:id` | `{ name, effectiveDate, active, isDefault }` only (BR-10) | `settings.manage` |
| `GET /settings/customer-discounts` | `[{ customerType, discountPct }]` for this business type | `settings.manage` |
| `PUT /settings/customer-discounts` | Replace all `{ items: [...] }` (BR-34) | `settings.manage` |
| `GET /business` | Profile | `settings.manage` |
| `PATCH /business` | `{ ownerName, phone, email, address, gstNo, gstRegistered }` (name and type can't change in v1) | `settings.manage` |
| `POST /business/logo` / `DELETE /business/logo` | Receipt logo (delete = default logo) | `settings.manage` |

### 3.15 Audit & data (F-21, F-22)

| Method & path | Purpose | Permission | Gating |
|---|---|---|---|
| `GET /audit-logs?action=&employeeId=&from=&to=&page=` | Audit log | `audit.view` | |
| `GET /data/export` | JSON download of all business data (no password hashes) | `data.export_import` | |
| `POST /data/import-prototype` | Upload prototype backup JSON; mapping in `06-BACKEND-SCHEMA.md` §8 | `data.export_import` | 409 IMPORT_NOT_ALLOWED; returns counts per table and the list of imported usernames needing password reset |

### 3.16 Platform admin (F-23)

All under `/api/v1/platform`, platform session (`psid`) required except login.

| Method & path | Purpose | Permission |
|---|---|---|
| `POST /platform/auth/login` | `{ email, password, totp }` | Public (rate-limited) |
| `POST /platform/auth/logout` | | Platform Admin |
| `GET /platform/auth/me` | | Platform Admin |
| `POST /platform/auth/password` | Change password (required at first sign-in) | Platform Admin |
| `POST /platform/auth/totp/enroll` → `{ otpauthUrl }`; `POST /platform/auth/totp/verify` `{ code }` | TOTP setup | Platform Admin |
| `GET /platform/businesses?search=&status=` | List (`05` §3 Platform) | `platform.businesses.view` |
| `GET /platform/businesses/:id` | Detail + subscription history + payments | `platform.businesses.view` |
| `GET /platform/subscription-payments?status=pending` | Verification queue | `platform.subscriptions.manage` |
| `POST /platform/subscription-payments/:id/verify` | BR-06 | `platform.subscriptions.manage` |
| `POST /platform/subscription-payments/:id/reject` | `{ reason }` | `platform.subscriptions.manage` |
| `POST /platform/businesses/:id/extend` | +14 days | `platform.subscriptions.manage` |
| `POST /platform/businesses/:id/suspend` | | `platform.subscriptions.manage` |
| `POST /platform/businesses/:id/reactivate` | now + 30 days | `platform.subscriptions.manage` |
| `POST /platform/businesses/:id/reset-password` | `{ temporaryPassword }` | `platform.businesses.reset_password` |
| `GET /platform/admins`, `POST /platform/admins`, `PATCH /platform/admins/:id` | Manage platform admins | `platform.admins.manage` |

## 4. Webhooks & events

N/A — v1 has no payment gateway or external integrations (D-12), and no websockets (polling per `04-ARCHITECTURE.md` §7).
