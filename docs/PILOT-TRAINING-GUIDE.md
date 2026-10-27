# POS SYSTEM — Pilot Business Staff Training Guide

Welcome to the **POS SYSTEM**, the next-generation Point of Sale and retail management platform built specifically for businesses in Bhutan. This training guide covers end-to-end workflows for all staff roles, from rapid checkout at the counter to backend DRC GST tax compliance.

---

## 1. System Access & Hardware Setup

### Recommended Browsers & Devices
- **Desktop / Laptop / POS Terminal**: Google Chrome (v110+) or Microsoft Edge (v110+).
- **Tablets / Mobile**: Chrome on Android or Safari on iPad.
- **Hardware Compatibility**:
  - Standard USB and Bluetooth 1D/2D Barcode Scanners (configured in Keyboard Emulation mode).
  - 80mm and 58mm Thermal Receipt Printers (ESC/POS compatible or standard system print driver).
  - Standard Cash Drawers connected via RJ11 printer kick port.

### Network & Offline Resilience
The POS system is cloud-connected with local client-side resilience. If the internet drops momentarily, an amber banner appears at the top of the screen (`Offline Mode`). Scans and transactions continue to be cached, and the system reconnects automatically once connection is restored.

---

## 2. First-Time Sign-In & Security

### Step 1: Company Sign-In
1. Navigate to the POS application URL (e.g., `https://pos.yourdomain.bt`).
2. Enter your unique **Company Code** (e.g., `BIZ-PEMA1`).
3. Check **"Remember this device"** if you are using a dedicated business computer or register.
4. Click **Continue to Sign In**.

### Step 2: Employee Sign-In
1. Enter your assigned **Username** and **Temporary Password** provided on your Credential Handoff Sheet.
2. Click **Sign In**.

### Step 3: Mandatory Password Update (`mustChangePassword`)
Upon your first sign-in, you are prompted to set a new personal password:
- Minimum 8 characters.
- Must include a combination of letters and numbers.
- Once updated, you will be redirected to your role's dashboard or POS screen.

### Step 4: Language Toggle (English / རྫོང་ཁ)
At any time, you can toggle between English and Dzongkha:
- Click the language switcher button located in the sidebar or top navigation bar.
- Your language preference is automatically saved to your profile for future sessions.

---

## 3. Cashier & Front-Counter Operations

### The Fast POS Checkout Screen
The POS screen is optimized for maximum speed and can be operated **entirely via keyboard or barcode scanner**:

| Shortcut | Action | Description |
|---|---|---|
| **F2** | Focus Barcode Scanner | Jumps cursor immediately into the scan input box |
| **Enter** (in scan box) | Add Item / Open Payment | Scans product into cart; if cart has items and input is empty, opens Payment Modal |
| **F4** or **Alt + P** | Quick Checkout | Opens payment dialog directly |
| **Escape** | Dismiss / Clear | Closes modal or clears active product search |
| **Tab / Shift + Tab** | Trap Navigation | Cycles cleanly through action buttons without losing focus |

### Adding Items to the Cart
1. **Barcode Scanning**: Scan any physical product barcode. The item is instantly added with sound feedback.
2. **Search by Name**: Type 2 or more letters into the search box to filter products by name or category.
3. **Catalogue Grid**: Click or tap any product tile in the catalogue view.
4. **Quantity & Line Discounts**:
   - Click `+` or `-` to adjust quantity.
   - Enter a percentage or flat discount per line if authorized. Discounts cannot exceed the item value.

### Customer Selection & Customer Types
- **Walk-in Customer (Default)**: Standard retail pricing applies.
- **VIP Customer**: Automatically receives predefined VIP pricing and discounts.
- **Wholesale / Staff**: Automatic tiered rates per business profile.
- To select a customer, click the **Customer** dropdown and type the customer's name or mobile phone number.

### Split Payments & Digital Wallets (mBoB, BDBL, eTeeru)
Customers can pay using one or multiple payment methods:
1. **Cash**: Enter the cash amount tendered. The system instantly calculates and displays the exact change in Ngultrum.
2. **mBoB / Bhutan Pay / eTeeru**:
   - Customer scans the business Bhutan Financial Switch (BFS) QR code.
   - Cashier enters the received amount.
   - **Mandatory**: Enter the 6-to-12 digit **Transaction ID (Journal No.)** from the customer's banking screenshot.
3. **Credit / Khata**: For registered regular customers with approved credit limits.
4. Click **Complete Sale**.

### Printing Receipts
- Receipts print automatically on the connected thermal printer (80mm / 58mm).
- The receipt includes:
  - Official Business Name, Address, Phone, and GST Registration Number.
  - Tax invoice number: `INV-YYYY-NNNNN`.
  - Itemized breakdown with tax category tags (`S` for Standard 5%, `Z` for Zero 0%, `E` for Exempt).
  - Total amount formatted in standard Ngultrum notation and Bhutanese amount in words (e.g., *"Three Hundred Seventy-Six Ngultrum and Forty-Three Chhertum only"*).
  - Payment method breakdown and digital transaction references.

---

## 4. Manager & Supervisor Operations

### Voiding Invoices
If an invoice was entered in error or a customer returned items:
1. Navigate to **Invoices** from the sidebar.
2. Locate the invoice by number (`INV-2026-XXXXX`) or customer name.
3. Click **Void Invoice**.
4. Select or type a mandatory **Void Reason** (e.g., "Customer returned goods", "Cashier scanning error").
5. Confirm void. The system automatically:
   - Restores stock inventory for all tracked items.
   - Excludes the payment from the active payments report.
   - Records an immutable audit log entry with manager ID, timestamp, and explanation.

### Held Orders (Managing Queue Bursts)
- During busy hours, if a customer needs to pick an additional item, click **Hold Order**.
- A held order ticket is stored with a timestamp and note.
- The cashier can serve the next customer immediately.
- When the first customer returns, click **Held Orders** to restore their exact cart with one click.

---

## 5. Restaurant & Café Operations

### Creating Table & Dine-in Orders
1. From the POS screen, select **Dine-in** or **Takeaway**.
2. Select the **Table Number** (e.g., Table 4).
3. Add appetizers, mains, and beverages to the cart.

### Sending Orders to Kitchen (`KOT-NNNNN`)
1. Click **Send to Kitchen**.
2. The system assigns a sequential Kitchen Order Ticket (`KOT-XXXXX`).
3. The ticket immediately appears on the **Kitchen Display Board (KDS)**.

### Kitchen Display Screen (KDS)
- Kitchen staff view active tickets ordered by preparation time.
- Status buttons:
  - `Queued` → `Preparing` (Cook is working on the dish).
  - `Preparing` → `Ready` (Dish is plated and ready for server pickup).
  - `Ready` → `Served`.

### Billing Kitchen Orders
1. Waiter or Cashier navigates to **Kitchen Orders**.
2. Select Table 4.
3. Click **Generate Bill / Bill Order**.
4. The items load directly into the POS checkout screen for payment completion.

---

## 6. Inventory & Storekeeper Operations

### Stock In / Stock Out Adjustments
1. Navigate to **Inventory**.
2. Select a product.
3. Click **Adjust Stock**:
   - **Stock In**: Select reason (`Purchase delivery`, `Found stock`, `Return`).
   - **Stock Out**: Select reason (`Damage`, `Expiry`, `Internal consumption`, `Theft`).
4. Enter quantity and reference notes.
5. Stock ledger is immediately updated and balance is verified.

### Supplier Purchases (`PUR-YYYY-NNNNN`)
1. Navigate to **Purchases** → **New Purchase**.
2. Select or add a **Supplier**.
3. Enter the Supplier's delivery bill number and date.
4. Add products, purchased quantities, and cost prices.
5. Click **Record Purchase**. The inventory levels for all received products increment automatically.

---

## 7. Accountant & DRC GST Compliance

### Goods & Services Tax (GST) Overview in Bhutan
The system enforces Department of Revenue & Customs (DRC) rules:
- **Standard Rate (5%)**: Applied to taxable consumer products, packaged goods, and restaurant food/beverages.
- **Zero-Rated (0%)**: Exported goods and designated supplies.
- **Exempt (0%)**: Essential basic commodities including **Rice**, **Cooking Oil**, and **Salt**. No tax is charged or claimed.

### Daily & Monthly GST Reports
1. Navigate to **Reports** → **GST Report**.
2. Select the date range (Today, This Week, This Month, or Custom Date Range).
3. The report automatically summarizes:
   - Gross Sales.
   - Taxable Sales at Standard Rate (5%).
   - Total GST Collected.
   - Zero-Rated Sales.
   - Exempt Sales.
4. Click **Export CSV** to download the clean comma-separated file ready for upload or submission to the DRC tax portal.

### Daily Register & Payment Breakdown
1. Navigate to **Reports** → **Payments**.
2. Verify total collections broken down by:
   - Cash in Drawer.
   - Digital Transfers (mBoB / BDBL / eTeeru).
   - Credit Ledger balances.
3. Any voided transactions are highlighted and strictly excluded from net cash totals.

---

## 8. Business Administrator Operations

### Business Profile & Tax Settings
- Under **Settings** → **Business Profile**:
  - Update trade name, registered owner, phone, email, and location.
  - Set GST Number (`GST-XXXXXXXXX`) and enable GST registration switch.
  - Upload high-resolution business logo for receipt headers.

### Managing Staff Accounts
- Under **Settings** → **Employees**:
  - Add new staff members with designated roles (`Admin`, `Manager`, `Cashier`, `Storekeeper`, `Waiter`, `Kitchen Staff`, `Accountant`).
  - Reset forgotten employee passwords (marks account with `mustChangePassword`).
  - Deactivate departed employees without deleting their historic sales records.

### Complete Data Backup & Export
- Under **Settings** → **Data Management**:
  - Click **Download Complete JSON Backup** (`GET /data/export`) to save an encrypted, off-line snapshot of all business data, inventory, transactions, and settings.
  - No customer passwords or sensitive secrets are exposed in backup files.

---

## 9. Troubleshooting & Support

| Problem | Cause | Quick Solution |
|---|---|---|
| Scanner adds numbers but does not submit | Scanner suffix missing | Configure scanner to send `Enter` (CR/LF) after every barcode scan. |
| Orange "Offline" banner | Network connection lost | Continue scanning; orders will buffer locally. Do not clear browser cache. |
| "Invalid Credentials / Locked" | 5 consecutive wrong passwords | Wait 15 minutes or ask your Business Admin to reset your password. |
| Printer cuts receipt prematurely | Paper width setting mismatch | Select 80mm or 58mm printer profile in your browser print dialog. |

**Technical Support Hotline**:
- Yuevaan IT Technologies Technical Support: `+975 17 00 00 00` / `support@pos.bt`
- Operating Hours: Monday – Saturday, 8:30 AM to 8:00 PM BTT.
