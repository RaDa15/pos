/* ============================================================
   POS SYSTEM — Multi-tenant POS + GST SaaS Prototype
   Single-file vanilla JS app. Persists via window.storage.
   NOTE: this is a browser-only prototype. "Multi-tenant" is
   simulated by namespacing every record with a business_id;
   there is no real server, so isolation is enforced by key
   scoping rather than a network boundary. Passwords are stored
   in plain text in this storage layer — fine for a prototype,
   never do this in production.
   ============================================================ */

const DB_SHARED = false; // single-browser demo; flip to true for a shared multi-user demo

const db = {
  async get(key, fallback) {
    // First use the ChatGPT/browser host storage when available.
    try {
      if (window.storage && typeof window.storage.get === 'function') {
        const r = await window.storage.get(key, DB_SHARED);
        if (r && r.value !== undefined && r.value !== null) return JSON.parse(r.value);
      }
    } catch (e) { console.warn('host storage read failed; using browser storage', e); }

    // Fallback for normal Chrome/Edge/Firefox opened from VS Code or file://.
    try {
      const raw = window.localStorage.getItem('nimbus_pos:' + key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch (e) { return fallback; }
  },
  async set(key, value) {
    const serialized = JSON.stringify(value);
    try {
      if (window.storage && typeof window.storage.set === 'function') {
        await window.storage.set(key, serialized, DB_SHARED);
      }
    } catch (e) { console.warn('host storage write failed; using browser storage', e); }

    try {
      const storageKey = 'nimbus_pos:' + key;
      if (value === null || value === undefined) window.localStorage.removeItem(storageKey);
      else window.localStorage.setItem(storageKey, serialized);
    } catch (e) { console.error('browser storage set failed', key, e); }
  }
};

const uid = (p = '') => p + Math.random().toString(36).slice(2, 9);
const pad = (n, l = 4) => String(n).padStart(l, '0');
const money = (n) => 'Nu. ' + (Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const toLocalISO = (d = new Date()) => {
  const dt = d instanceof Date ? d : new Date(d);
  const year = dt.getFullYear();
  const month = String(dt.getMonth() + 1).padStart(2, '0');
  const day = String(dt.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};
const todayISO = () => toLocalISO(new Date());
const nowTime = () => new Date().toTimeString().slice(0, 5);
const fmtDate = (iso) => { if (!iso) return '—'; const d = new Date(iso); return isNaN(d) ? String(iso) : d.toLocaleDateString('en-GB'); };
const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const PLANS = {
  Starter:      { price: 800,  features: ['POS + basic inventory', '1 employee account', 'Manual product entry', 'Basic sales summary'] },
  Professional: { price: 2200, features: ['Everything in Starter', 'GST reports & filters', 'Excel import/export', 'Up to 10 employees', 'Customer & supplier management'] },
  Enterprise:   { price: 4500, features: ['Everything in Professional', 'Unlimited employees', 'Advanced permissions', 'Priority support', 'Future integrations'] }
};

const ROLES = ['Admin', 'Manager', 'Cashier', 'Accountant', 'Inventory Officer', 'Storekeeper', 'Waiter', 'Kitchen Staff'];

// Role -> screens allowed. Admin implicitly has everything. Checked both in the sidebar (hide)
// and in go() (redirect) so it's not just a hidden-button illusion.
const ROLE_SCREENS = {
  Admin: null, // null = full access
  Manager: ['dashboard','pos','orders','products','menu','purchases','inventory','invoices','customers','suppliers','expenses','gst','reports'],
  Cashier: ['dashboard','pos','orders','invoices','customers'],
  Accountant: ['dashboard','expenses','gst','reports','payments','invoices'],
  'Inventory Officer': ['dashboard','products','menu','purchases','inventory'],
  Storekeeper: ['dashboard','products','menu','purchases','inventory'],
  Waiter: ['dashboard','orders','pos'],
  'Kitchen Staff': ['dashboard','orders']
};
function roleCanAccess(role, screen) {
  const allowed = ROLE_SCREENS[role];
  if (allowed === null || allowed === undefined) return true;
  const alwaysOpen = ['receipt','renew','subscription','users','settings','audit'];
  if (alwaysOpen.includes(screen)) return role === 'Admin' ? true : (screen === 'receipt');
  return allowed.includes(screen);
}

const KITCHEN_STATUSES = ['New', 'Accepted', 'Preparing', 'Ready', 'Served', 'Cancelled'];
// Payment methods. Mobile wallets are the everyday Bhutan options; each takes a transaction/reference ID.
const MOBILE_WALLETS = ['mBoB', 'mPay', 'DK Bank', 'TPay', 'Other wallet'];
const PAYMENT_METHOD_TYPES = ['Cash', 'Card', ...MOBILE_WALLETS, 'Bank', 'Credit'];
const isMobileWallet = (m) => MOBILE_WALLETS.includes(m);
const BHUTAN_BANKS = ['Bank of Bhutan', 'Bhutan National Bank', 'Bhutan Development Bank', 'Druk PNB Bank', 'T Bank', 'DK Bank'];
// Every per-company collection (used by backup & restore)
const TENANT_COLLECTIONS = ['subscription', 'taxrates', 'users', 'products', 'inventory', 'customers', 'suppliers', 'expenses', 'transactions', 'counters', 'payments', 'orders', 'auditLogs', 'heldOrders', 'pricing'];

/* ---------------- Language (English / Dzongkha) ----------------
   Dzongkha labels are a best-effort first draft — have a native Dzongkha speaker review/edit
   them before a client presentation. Anything not listed here simply stays in English.
   Lower-confidence terms are shown as "Dzongkha · English" so the meaning is never lost. */
const I18N = { dz: {
  'Dashboard': 'གཙོ་ངོས། · Dashboard', 'POS': 'ཚོང་འབྲེལ། · POS', 'Kitchen Orders': 'ཐབ་ཚང་། · Kitchen',
  'Menu': 'ཟས་ཐོ།', 'Products': 'ཐོན་རྫས།', 'Purchases': 'ཉོ་ཚོང་། · Purchases', 'Inventory': 'གསོག་འཇོག · Inventory',
  'Invoices': 'རྩིས་ཐོ། · Invoices', 'Payments': 'དངུལ་སྤྲོད། · Payments', 'Customers': 'ཉོ་མི།',
  'Suppliers': 'ཚོང་སྤྲོད་པ། · Suppliers', 'Expenses': 'འགྲོ་སྐྱོད།', 'GST / Tax': 'ཁྲལ། · GST / Tax',
  'Reports': 'སྙན་ཞུ།', 'Users': 'ལག་ལེན་པ། · Users', 'Audit Log': 'Audit Log', 'Subscription': 'Subscription',
  'Settings': 'སྒྲིག་བཀོད། · Settings', 'Log out': 'ཕྱིར་ཐོན། · Log out',
  'Point of Sale': 'ཚོང་འབྲེལ། · Point of Sale', 'Users & Roles': 'ལག་ལེན་པ། · Users & Roles',
  'Sales Reports': 'ཚོང་སྙན་ཞུ། · Sales Reports', 'Tax Settings': 'ཁྲལ་སྒྲིག་བཀོད། · Tax Settings',
  "Today's Sales": 'དེ་རིང་གི་ཚོང་འབྲེལ། · Today\'s Sales', "Today's Orders": "Today's Orders",
  'Billing': 'རྩིས་ཐོ། · Billing', 'Subtotal': 'ཡོངས་བསྡོམས་ཆུང་། · Subtotal', 'Discount': 'རིན་ཕབ། · Discount',
  'Grand total': 'བསྡོམས། · Grand total', 'Price': 'རིན་ཐང་།', 'Cash': 'ཕྱག་དངུལ།', 'Customer': 'ཉོ་མི།',
  'Payments ': 'དངུལ་སྤྲོད། · Payments', 'Complete sale': 'Complete sale'
} };
function t(key) { return (S.lang === 'dz' && I18N.dz[key]) ? I18N.dz[key] : key; }
function langToggleHTML() {
  return `<div class="lang-toggle"><button class="${S.lang !== 'dz' ? 'on' : ''}" onclick="setLang('en')">English</button><button class="${S.lang === 'dz' ? 'on' : ''}" onclick="setLang('dz')">རྫོང་ཁ</button></div>`;
}
async function setLang(l) { S.lang = l; await db.set('pref:lang', l); render(); }


// Customer types differ by business — grocery stores deal in wholesale/retail/institutional
// buyers, while restaurants & cafés deal in dine-in/delivery patrons instead.
const CUSTOMER_TYPES = {
  Grocery: ['Walk-in', 'Regular Customer', 'VIP Customer', 'Corporate Customer', 'Wholesale Customer', 'Retail Customer', 'Credit Customer', 'Government/Institutional Customer', 'Online Customer'],
  Restaurant: ['Walk-in', 'Regular Customer', 'VIP Customer', 'Corporate Customer', 'Credit Customer', 'Government/Institutional Customer', 'Online Customer', 'Delivery Customer']
};
function customerTypesFor(business) {
  return CUSTOMER_TYPES[(business && business.type) || 'Grocery'] || CUSTOMER_TYPES.Grocery;
}

/* ---------------- Global in-memory state ---------------- */
const S = {
  lang: 'en',
  screen: 'landing',
  businessesIndex: [],   // [{businessId, name, type, ownerName, password, gstNo, phone, email, address}]
  session: null,         // { businessId, employee: {username, role, name} }
  cur: null,             // loaded tenant bundle when logged into a company
  ui: {},                // scratch state for the active screen (cart, filters, modal, etc.)
  toastMsg: null
};

function toast(msg) {
  S.toastMsg = msg;
  render();
  setTimeout(() => { S.toastMsg = null; renderToastOnly(); }, 2600);
}
function renderToastOnly() {
  const el = document.getElementById('toast-slot');
  if (el) el.outerHTML = toastHTML();
}
function toastHTML() {
  return `<div id="toast-slot">${S.toastMsg ? `<div class="toast">${escapeHtml(S.toastMsg)}</div>` : ''}</div>`;
}

function go(screen, uiPatch = {}) {
  if (S.session && !roleCanAccess(S.session.employee.role, screen)) {
    S.screen = 'dashboard'; S.ui = {};
    render();
    toast(`Your role (${S.session.employee.role}) does not have access to that screen.`);
    return;
  }
  S.screen = screen;
  S.ui = { ...uiPatch };
  render();
}

/* ---------------- Demo/presentation companies ----------------
   Two ready-to-log-in companies for demoing to the client:
   "Pema Store" (Grocery) and "Test Restaurant" (Restaurant & Café).
   Company login AND admin employee login both use password 1234.
   Created once (skipped if a company with that name already exists),
   with an active subscription and a full set of sample customers
   covering every customer type. All figures are placeholder/demo data. */
async function ensureDemoBusinesses() {
  const DEMO_SEED_VERSION = 'v8-features-history';
  const demos = [
    { name: 'Pema Store', type: 'Grocery', ownerName: 'Pema Yangzom', phone: '+975 17123450', email: 'pemastore.bt@gmail.com', address: 'Changzamtok, Thimphu', gstNo: 'GST-100223344' },
    { name: 'Test Restaurant', type: 'Restaurant', ownerName: 'Sonam Dorji', phone: '+975 17998877', email: 'testrestaurant.bt@gmail.com', address: 'Norzin Lam, Thimphu', gstNo: 'GST-100556677' },
    { name: 'Norbu General Store', type: 'Grocery', ownerName: 'Norbu Wangdi', phone: '+975 17887766', email: 'norbugeneralstore.bt@gmail.com', address: 'Olakha, Thimphu', gstNo: 'GST-100998877' },
    { name: 'Menjong Kitchen', type: 'Restaurant', ownerName: 'Deki Choden', phone: '+975 17776655', email: 'menjongkitchen.bt@gmail.com', address: 'Chubachu, Thimphu', gstNo: 'GST-100887766' }
  ];
  let indexChanged = false;
  for (const d of demos) {
    const old = S.businessesIndex.find(b => b.name.toLowerCase() === d.name.toLowerCase());

    // If an old/empty copy exists from before seeding existed, or from an older seed
    // version, drop it from the index and create a brand-new company in its place
    // (fresh businessId, so old storage keys are simply orphaned, not touched).
    if (old && old.demoSeed === DEMO_SEED_VERSION) continue; // already a fresh, fully-seeded copy — leave as-is
    if (old) {
      S.businessesIndex = S.businessesIndex.filter(b => b !== old);
      indexChanged = true;
    }

    const businessId = 'BIZ-' + d.name.replace(/[^A-Za-z]/g, '').slice(0, 4).toUpperCase() + Math.random().toString(36).slice(2, 5).toUpperCase();
    const biz = {
      businessId, name: d.name, type: d.type, ownerName: d.ownerName,
      phone: d.phone, email: d.email, address: d.address, gstNo: d.gstNo,
      password: '1234', demoSeed: DEMO_SEED_VERSION, createdAt: new Date(Date.now() - 90 * 86400000).toISOString()
    };
    S.businessesIndex.push(biz);
    indexChanged = true;

    const startedAt = new Date(Date.now() - 60 * 86400000);
    const lastRenewedAt = new Date(Date.now() - 30 * 86400000);
    const expiresAt = new Date(Date.now() + 30 * 86400000);
    const sub = {
      plan: 'Professional', status: 'Active',
      activatedAt: startedAt.toISOString(), startedAt: startedAt.toISOString(), expiresAt: expiresAt.toISOString(),
      history: [
        { event: `Subscribed to Professional`, at: startedAt.toISOString(), amount: PLANS.Professional.price },
        { event: `Renewed 30 days`, at: lastRenewedAt.toISOString(), amount: PLANS.Professional.price }
      ]
    };
    await db.set(`biz:${businessId}:subscription`, sub);
    const gstTaxId = uid('tax_');
    await db.set(`biz:${businessId}:taxrates`, [
      { id: gstTaxId, name: 'GST Standard', rate: 5, mode: 'exclusive', active: true, isDefault: true, effectiveDate: todayISO() },
      { id: uid('tax_'), name: 'GST Zero-rated', rate: 0, mode: 'exclusive', active: true, isDefault: false, effectiveDate: todayISO() }
    ]);
    await db.set(`biz:${businessId}:users`, [
      { username: 'admin', password: '1234', role: 'Admin', name: d.ownerName, active: true },
      { username: 'manager1', password: '1234', role: 'Manager', name: 'Sample Manager', active: true },
      { username: 'cashier1', password: '1234', role: 'Cashier', name: 'Sample Cashier', active: true },
      { username: 'accountant1', password: '1234', role: 'Accountant', name: 'Sample Accountant', active: true },
      { username: 'inventoryofficer1', password: '1234', role: 'Inventory Officer', name: 'Sample Inventory Officer', active: true },
      { username: 'storekeeper1', password: '1234', role: 'Storekeeper', name: 'Sample Storekeeper', active: true },
      { username: 'waiter1', password: '1234', role: 'Waiter', name: 'Sample Waiter', active: true },
      { username: 'kitchenstaff1', password: '1234', role: 'Kitchen Staff', name: 'Sample Kitchen Staff', active: true }
    ]);
    const seededCustomers = demoCustomersFor(d.type);
    await db.set(`biz:${businessId}:customers`, seededCustomers);
    const seededProducts = demoProductsFor(d.type, gstTaxId);
    await db.set(`biz:${businessId}:products`, seededProducts);
    await db.set(`biz:${businessId}:inventory`, demoInventoryFor(seededProducts));
    await db.set(`biz:${businessId}:suppliers`, demoSuppliersFor(d.type));
    await db.set(`biz:${businessId}:expenses`, demoExpensesFor(d.type));
    const history = demoSalesHistory(d.type, seededProducts, 5, seededCustomers, businessId);
    await db.set(`biz:${businessId}:transactions`, history.transactions);
    await db.set(`biz:${businessId}:payments`, history.payments);
    await db.set(`biz:${businessId}:counters`, { invoice: history.lastInvoice });
    await db.set(`biz:${businessId}:pricing`, demoPricingFor(d.type));
  }
  if (indexChanged) await saveBusinessesIndex();
}
// Local barcode generator for seed data — mirrors generateProductBarcode()'s format
// but doesn't depend on S.cur (which isn't loaded yet at boot time).
function seedBarcode(used) {
  let code;
  do { code = '20' + String(Math.floor(100000000 + Math.random() * 900000000)); } while (used.has(code));
  used.add(code);
  return code;
}
function demoProductsFor(type, taxId) {
  const used = new Set();
  const mk = (o) => ({ id: uid('prod_'), taxId, manualGstRate: 5, active: true, purchasePrice: 0, barcode: seedBarcode(used), ...o });
  if (type === 'Grocery') {
    return [
      mk({ name: 'Basmati Rice 5kg', category: 'Staples', purchasePrice: 420, sellPrice: 480, unit: 'box', stock: 40, minStock: 10 }),
      mk({ name: 'Red Rice 5kg (local)', category: 'Staples', purchasePrice: 380, sellPrice: 440, unit: 'box', stock: 30, minStock: 8 }),
      mk({ name: 'Mustard Oil 1L', category: 'Cooking Oil', purchasePrice: 180, sellPrice: 210, unit: 'l', stock: 60, minStock: 15 }),
      mk({ name: 'Sunflower Oil 1L', category: 'Cooking Oil', purchasePrice: 165, sellPrice: 195, unit: 'l', stock: 55, minStock: 15 }),
      mk({ name: 'Sugar 1kg', category: 'Staples', purchasePrice: 55, sellPrice: 68, unit: 'kg', stock: 100, minStock: 20 }),
      mk({ name: 'Iodised Salt 1kg', category: 'Staples', purchasePrice: 18, sellPrice: 25, unit: 'kg', stock: 90, minStock: 20 }),
      mk({ name: 'Red Lentils (Masoor Dal) 1kg', category: 'Staples', purchasePrice: 95, sellPrice: 120, unit: 'kg', stock: 70, minStock: 15 }),
      mk({ name: 'Milk Powder 400g', category: 'Dairy', purchasePrice: 260, sellPrice: 310, unit: 'box', stock: 35, minStock: 10 }),
      mk({ name: 'Fresh Datse (Cheese) 250g', category: 'Dairy', purchasePrice: 90, sellPrice: 120, unit: 'pc', stock: 30, minStock: 8 }),
      mk({ name: 'Farm Eggs (tray of 30)', category: 'Dairy & Eggs', purchasePrice: 260, sellPrice: 300, unit: 'box', stock: 25, minStock: 8 }),
      mk({ name: 'Marie Biscuits (pack)', category: 'Snacks', purchasePrice: 20, sellPrice: 30, unit: 'pc', stock: 150, minStock: 30 }),
      mk({ name: 'Potato Chips (large)', category: 'Snacks', purchasePrice: 45, sellPrice: 65, unit: 'pc', stock: 80, minStock: 20 }),
      mk({ name: 'Bottled Water 1L', category: 'Beverages', purchasePrice: 12, sellPrice: 20, unit: 'pc', stock: 200, minStock: 40 }),
      mk({ name: 'Coca-Cola 600ml', category: 'Beverages', purchasePrice: 25, sellPrice: 35, unit: 'pc', stock: 120, minStock: 30 }),
      mk({ name: 'Red Label Tea 250g', category: 'Beverages', purchasePrice: 110, sellPrice: 135, unit: 'box', stock: 40, minStock: 10 }),
      mk({ name: 'Fresh Potatoes', category: 'Vegetables', purchasePrice: 25, sellPrice: 35, unit: 'kg', stock: 80, minStock: 20 }),
      mk({ name: 'Onions', category: 'Vegetables', purchasePrice: 30, sellPrice: 42, unit: 'kg', stock: 70, minStock: 20 }),
      mk({ name: 'Detergent Powder 1kg', category: 'Household', purchasePrice: 140, sellPrice: 170, unit: 'kg', stock: 45, minStock: 10 }),
      mk({ name: 'Dish Wash Bar', category: 'Household', purchasePrice: 15, sellPrice: 22, unit: 'pc', stock: 100, minStock: 20 }),
      mk({ name: 'Colgate Toothpaste 150g', category: 'Personal Care', purchasePrice: 60, sellPrice: 80, unit: 'pc', stock: 60, minStock: 15 })
    ];
  }
  return [
    mk({ name: 'Ema Datshi', category: 'Main Course', sellPrice: 180, unit: 'plate', stock: 999, minStock: 0 }),
    mk({ name: 'Kewa Datshi (Potato & Cheese)', category: 'Main Course', sellPrice: 170, unit: 'plate', stock: 999, minStock: 0 }),
    mk({ name: 'Shamu Datshi (Mushroom & Cheese)', category: 'Main Course', sellPrice: 190, unit: 'plate', stock: 999, minStock: 0 }),
    mk({ name: 'Phaksha Paa (Pork with Radish)', category: 'Main Course', sellPrice: 260, unit: 'plate', stock: 999, minStock: 0 }),
    mk({ name: 'Chicken Curry', category: 'Main Course', sellPrice: 250, unit: 'plate', stock: 999, minStock: 0 }),
    mk({ name: 'Red Rice (bowl)', category: 'Sides', sellPrice: 60, unit: 'plate', stock: 999, minStock: 0 }),
    mk({ name: 'Pork Momos (plate of 8)', category: 'Momos', sellPrice: 220, unit: 'plate', stock: 999, minStock: 0 }),
    mk({ name: 'Veg Momos (plate of 8)', category: 'Momos', sellPrice: 190, unit: 'plate', stock: 999, minStock: 0 }),
    mk({ name: 'Chicken Momos (plate of 8)', category: 'Momos', sellPrice: 210, unit: 'plate', stock: 999, minStock: 0 }),
    mk({ name: 'Fried Rice with Egg', category: 'Rice & Noodles', sellPrice: 200, unit: 'plate', stock: 999, minStock: 0 }),
    mk({ name: 'Chow Mein (Chicken)', category: 'Rice & Noodles', sellPrice: 210, unit: 'plate', stock: 999, minStock: 0 }),
    mk({ name: 'Thukpa (Noodle Soup)', category: 'Rice & Noodles', sellPrice: 160, unit: 'plate', stock: 999, minStock: 0 }),
    mk({ name: 'Suja (Butter Tea)', category: 'Beverages', sellPrice: 50, unit: 'pc', stock: 999, minStock: 0 }),
    mk({ name: 'Ngaja (Milk Tea)', category: 'Beverages', sellPrice: 40, unit: 'pc', stock: 999, minStock: 0 }),
    mk({ name: 'Fresh Lime Soda', category: 'Beverages', sellPrice: 70, unit: 'pc', stock: 999, minStock: 0 }),
    mk({ name: 'Mineral Water 600ml', category: 'Beverages', purchasePrice: 15, sellPrice: 30, unit: 'pc', stock: 60, minStock: 15 }),
    mk({ name: 'Coca-Cola 300ml', category: 'Beverages', purchasePrice: 20, sellPrice: 40, unit: 'pc', stock: 60, minStock: 15 }),
    mk({ name: 'Zow Shungo (Rice & Vegetable Mix)', category: 'Sides', sellPrice: 90, unit: 'plate', stock: 999, minStock: 0 }),
    mk({ name: 'Khapse (Fried Pastry, 6pc)', category: 'Desserts', sellPrice: 80, unit: 'plate', stock: 999, minStock: 0 })
  ];
}
function demoInventoryFor(products) {
  const now = Date.now();
  return products.slice(0, 10).map((p, i) => ({
    id: uid('mv_'), productId: p.id, type: 'Opening Stock',
    qty: Number(p.stock) || 0,
    note: 'Demo opening stock',
    at: new Date(now - (i + 1) * 86400000).toISOString()
  })).concat(products.slice(0, 4).map((p, i) => ({
    id: uid('mv_'), productId: p.id, type: 'Purchase',
    qty: 10 + i * 5,
    note: 'Demo supplier purchase',
    at: new Date(now - (i + 1) * 172800000).toISOString()
  })), products.slice(0, 5).map((p, i) => ({
    id: uid('mv_'), productId: p.id, type: 'Sale',
    qty: -(2 + i),
    note: `INV-DEMO-${1001 + i}`,
    at: new Date(now - (i + 1) * 43200000).toISOString()
  })));
}
function demoSuppliersFor(type) {
  return type === 'Grocery' ? [
    { id: uid('sup_'), name: 'Bhutan Food Distributors', phone: '+975 2 323210', email: 'sales@demofood.bt', address: 'Olakha, Thimphu', active: true },
    { id: uid('sup_'), name: 'Druk Wholesale Supply', phone: '+975 17112299', email: 'orders@drukwholesale.bt', address: 'Babesa, Thimphu', active: true },
    { id: uid('sup_'), name: 'Thimphu Beverage Traders', phone: '+975 17667788', email: 'info@thimphubeverage.bt', address: 'Changzamtok, Thimphu', active: true }
  ] : [
    { id: uid('sup_'), name: 'Bhutan Fresh Foods', phone: '+975 17334455', email: 'orders@bhutanfresh.bt', address: 'Olakha, Thimphu', active: true },
    { id: uid('sup_'), name: 'Druk Beverage Supply', phone: '+975 17778899', email: 'sales@drukbeverage.bt', address: 'Babesa, Thimphu', active: true },
    { id: uid('sup_'), name: 'Local Produce Cooperative', phone: '+975 17221100', email: 'produce@localcoop.bt', address: 'Thimphu', active: true }
  ];
}
function demoExpensesFor(type) {
  const now = Date.now();
  return [
    { id: uid('exp_'), category: 'Rent', amount: 18000, date: new Date(now - 20*86400000).toISOString().slice(0,10), note: 'Demo monthly rent' },
    { id: uid('exp_'), category: 'Utilities', amount: 4200, date: new Date(now - 12*86400000).toISOString().slice(0,10), note: 'Demo electricity and internet' },
    { id: uid('exp_'), category: type === 'Restaurant' ? 'Kitchen supplies' : 'Store supplies', amount: 5600, date: new Date(now - 6*86400000).toISOString().slice(0,10), note: 'Demo operating expense' }
  ];
}
function demoPaymentsFor(type) {
  const now = Date.now();
  return [
    { id: uid('pay_'), amount: 4800, method: 'Cash', reference: 'DEMO-CASH-01', at: new Date(now - 3*86400000).toISOString() },
    { id: uid('pay_'), amount: 7350, method: 'Card', reference: 'DEMO-CARD-01', at: new Date(now - 2*86400000).toISOString() },
    { id: uid('pay_'), amount: 6200, method: 'Mobile Payment', reference: 'DEMO-MPAY-01', at: new Date(now - 86400000).toISOString() }
  ];
}

function demoPricingFor(type) {
  return type === 'Grocery'
    ? { 'Regular Customer': 2, 'VIP Customer': 5, 'Corporate Customer': 5, 'Wholesale Customer': 10, 'Retail Customer': 3, 'Credit Customer': 0, 'Government/Institutional Customer': 3, 'Online Customer': 0 }
    : { 'Regular Customer': 3, 'VIP Customer': 10, 'Corporate Customer': 5, 'Credit Customer': 0, 'Government/Institutional Customer': 5, 'Online Customer': 0, 'Delivery Customer': 0 };
}
// 30 days of believable sales so dashboards, GST and payment reports have data on first load.
function demoSalesHistory(type, products, taxRate, customers, businessId) {
  let seed = 7; for (const ch of businessId) seed = (Math.imul(seed, 31) + ch.charCodeAt(0)) >>> 0;
  let x = seed || 1;
  const rnd = () => { x = (Math.imul(x, 1664525) + 1013904223) >>> 0; return x / 4294967296; };
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  const sellable = products.filter(p => p.active !== false && p.sellPrice > 0);
  const buyers = customers.filter(c => c.type !== 'Walk-in');
  const methods = ['Cash', 'Cash', 'Cash', 'mBoB', 'mBoB', 'mPay', 'TPay', 'DK Bank', 'Card', 'Bank'];
  const orderTypes = type === 'Restaurant' ? ['Walk-in', 'Walk-in', 'Take out', 'Pre-ordered'] : ['Walk-in', 'Walk-in', 'Walk-in', 'Pre-ordered'];
  const nowHour = new Date().getHours();
  const txns = [], pays = [];
  let counter = 0;
  for (let d = 29; d >= 0; d--) {
    const day = new Date(Date.now() - d * 86400000);
    const date = day.toISOString().slice(0, 10);
    const weekend = [0, 6].includes(day.getDay());
    const n = 3 + Math.floor(rnd() * 4) + (weekend ? 2 : 0);
    const slots = [];
    for (let i = 0; i < n; i++) {
      let hh = 9 + Math.floor(rnd() * 11);
      if (d === 0) hh = Math.min(hh, Math.max(7, nowHour));
      slots.push([hh, Math.floor(rnd() * 60)]);
    }
    slots.sort((a, b) => a[0] * 60 + a[1] - (b[0] * 60 + b[1]));
    for (const [hh, mm] of slots) {
      const time = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
      const chosen = new Set(); const k = 1 + Math.floor(rnd() * 4);
      while (chosen.size < Math.min(k, sellable.length)) chosen.add(pick(sellable));
      const items = [...chosen].map(p => {
        const qty = 1 + Math.floor(rnd() * 3);
        const discount = rnd() < 0.12 ? round2(p.sellPrice * qty * 0.05) : 0;
        const r = computeLineTax(p.sellPrice, qty, discount, taxRate, false);
        return { productId: p.id, name: p.name, price: p.sellPrice, qty, discount, taxRate, inclusive: false, ...r };
      });
      const total = round2(items.reduce((s, i) => s + i.total, 0));
      const cust = rnd() < 0.45 && buyers.length ? pick(buyers) : null;
      const onCredit = cust && cust.type === 'Credit Customer' && rnd() < 0.5;
      const method = onCredit ? 'Credit' : pick(methods);
      const journalNo = ['Cash', 'Card', 'Credit'].includes(method) ? '' : (method === 'Bank' ? 'JRN' : 'TXN') + String(10000000 + Math.floor(rnd() * 89999999));
      const bankName = method === 'Bank' ? pick(BHUTAN_BANKS) : '';
      counter++;
      const invoiceNo = `INV-${date.slice(0, 4)}-${pad(counter, 5)}`;
      const txnId = uid('txn_');
      const cashier = 'Sample Cashier';
      txns.push({
        id: txnId, invoiceNo, date, time, createdAt: `${date}T${time}:00.000Z`,
        cashier, customerId: cust ? cust.id : null, orderType: pick(orderTypes), tableNo: '',
        items, subtotal: round2(items.reduce((s, i) => s + i.price * i.qty, 0)),
        discountTotal: round2(items.reduce((s, i) => s + i.discount, 0)),
        taxableAmount: round2(items.reduce((s, i) => s + i.taxable, 0)), taxAmount: round2(items.reduce((s, i) => s + i.tax, 0)),
        charges: 0, total,
        payments: [{ method, amount: total, bankName, journalNo, remarks: '' }], paymentMethod: method,
        amountPaid: onCredit ? 0 : total, creditAmount: onCredit ? total : 0, status: 'Completed'
      });
      pays.push({ id: uid('pay_'), invoiceId: invoiceNo, txnId, businessId, customerId: cust ? cust.id : null, method, amount: total, charges: 0, bankName, journalNo, remarks: '', date, time, createdBy: cashier, status: 'Completed' });
    }
  }
  return { transactions: txns, payments: pays, lastInvoice: counter };
}

function demoCustomersFor(type) {
  const mk = (o) => ({ id: uid('cus_'), totalSpent: 0, outstandingBalance: 0, active: true, ...o });
  if (type === 'Grocery') {
    return [
      mk({ name: 'Walk-in Customer', type: 'Walk-in', phone: '—', notes: 'Generic record for untracked walk-in customers.' }),
      mk({ name: 'Tshering Dema', type: 'Regular Customer', phone: '+975 17123456', address: 'Changzamtok, Thimphu', totalSpent: 18500, notes: 'Buys groceries weekly.' }),
      mk({ name: 'Karma Wangchuk', type: 'VIP Customer', phone: '+975 17234567', address: 'Motithang, Thimphu', totalSpent: 96200, creditLimit: 20000, notes: 'High-value repeat customer — priority service.' }),
      mk({ name: 'Druk Holdings Ltd', type: 'Corporate Customer', phone: '+975 2 322345', email: 'accounts@drukholdings.bt', address: 'Norzin Lam, Thimphu', gstId: 'GST-100234567', creditLimit: 50000, totalSpent: 142000, notes: 'Monthly office pantry supplies, invoiced.' }),
      mk({ name: 'Sonam General Wholesalers', type: 'Wholesale Customer', phone: '+975 17345678', address: 'Olakha Industrial Area, Thimphu', gstId: 'GST-100345678', creditLimit: 150000, totalSpent: 410000, notes: 'Bulk purchase, resells in Paro.' }),
      mk({ name: "Pema's Mini Mart", type: 'Retail Customer', phone: '+975 17456789', address: 'Babesa, Thimphu', totalSpent: 65000, notes: 'Small retail shop owner, buys in moderate volumes.' }),
      mk({ name: 'Dorji Tshering', type: 'Credit Customer', phone: '+975 17567890', address: 'Hejo, Thimphu', creditLimit: 10000, outstandingBalance: 3200, totalSpent: 27800, notes: 'Settles credit account monthly.' }),
      mk({ name: 'Thimphu Thromde Office', type: 'Government/Institutional Customer', phone: '+975 2 323456', address: 'Thromde Office, Thimphu', gstId: 'GST-100456789', creditLimit: 80000, totalSpent: 210000, notes: 'Institutional supply contract, billed quarterly.' }),
      mk({ name: 'Yeshi Lhamo', type: 'Online Customer', phone: '+975 77678901', email: 'yeshi.lhamo@gmail.com', address: 'Babesa, Thimphu (home delivery)', totalSpent: 9400, notes: 'Orders via phone/Facebook page, delivered to door.' })
    ];
  }
  return [
    mk({ name: 'Walk-in Customer', type: 'Walk-in', phone: '—', notes: 'Generic record for untracked walk-in customers.' }),
    mk({ name: 'Ugyen Norbu', type: 'Regular Customer', phone: '+975 17112233', address: 'Changangkha, Thimphu', totalSpent: 22500, notes: 'Weekday lunch regular.' }),
    mk({ name: 'Jigme Namgyel', type: 'VIP Customer', phone: '+975 17223344', address: 'Motithang, Thimphu', totalSpent: 88000, creditLimit: 15000, notes: 'Frequent large group bookings.' }),
    mk({ name: 'Bhutan Telecom Ltd', type: 'Corporate Customer', phone: '+975 2 335566', email: 'events@bt.bt', address: 'Thori Lam, Thimphu', gstId: 'GST-100667788', creditLimit: 40000, totalSpent: 96000, notes: 'Monthly corporate lunch meetings, invoiced.' }),
    mk({ name: 'Tandin Wangmo', type: 'Credit Customer', phone: '+975 17334455', address: 'Hejo, Thimphu', creditLimit: 8000, outstandingBalance: 2100, totalSpent: 19600, notes: 'Running tab, settled monthly.' }),
    mk({ name: 'Royal Institute of Management', type: 'Government/Institutional Customer', phone: '+975 2 341234', address: 'Semtokha, Thimphu', gstId: 'GST-100778899', creditLimit: 60000, totalSpent: 130000, notes: 'Catering for institutional events.' }),
    mk({ name: 'Sangay Choden', type: 'Online Customer', phone: '+975 77445566', email: 'sangay.choden@gmail.com', totalSpent: 5200, notes: 'Orders by phone/app for pickup.' }),
    mk({ name: 'Pelden Dorji', type: 'Delivery Customer', phone: '+975 77556677', address: 'Babesa, Thimphu', totalSpent: 12300, notes: 'Regular home-delivery orders.' })
  ];
}

/* ---------------- Bootstrap ---------------- */
async function boot() {
  S.businessesIndex = await db.get('index:businesses', []);
  S.lang = await db.get('pref:lang', 'en');
  await ensureDemoBusinesses();

  // Try to restore a remembered session (persisted per-browser via window.storage).
  const remembered = await db.get('session:remember', null);
  if (remembered && remembered.businessId && remembered.username) {
    const biz = S.businessesIndex.find(b => b.businessId === remembered.businessId);
    if (biz) {
      await loadTenant(biz.businessId);
      const u = (S.cur.users || []).find(x => String(x.username || '').trim().toLowerCase() === remembered.username.toLowerCase() && x.active !== false);
      if (u && subAllowsAccess(S.cur.subscription)) {
        S.session = { businessId: biz.businessId, employee: u };
        S.screen = 'dashboard';
        render();
        return;
      }
    }
    // Stale / invalid remembered session — clear it and fall through to a normal boot.
    await db.set('session:remember', null);
    S.cur = null;
  }
  render();
}

/* ---------------- Tenant data bundle ---------------- */
async function loadTenant(businessId) {
  const [subscription, taxrates, users, products, inventory, customers, suppliers, expenses, transactions, counters, payments, orders, auditLogs, heldOrders, pricing] = await Promise.all([
    db.get(`biz:${businessId}:subscription`, null),
    db.get(`biz:${businessId}:taxrates`, []),
    db.get(`biz:${businessId}:users`, []),
    db.get(`biz:${businessId}:products`, []),
    db.get(`biz:${businessId}:inventory`, []),
    db.get(`biz:${businessId}:customers`, []),
    db.get(`biz:${businessId}:suppliers`, []),
    db.get(`biz:${businessId}:expenses`, []),
    db.get(`biz:${businessId}:transactions`, []),
    db.get(`biz:${businessId}:counters`, { invoice: 0 }),
    db.get(`biz:${businessId}:payments`, []),
    db.get(`biz:${businessId}:orders`, []),
    db.get(`biz:${businessId}:auditLogs`, []),
    db.get(`biz:${businessId}:heldOrders`, []),
    db.get(`biz:${businessId}:pricing`, {})
  ]);
  const business = S.businessesIndex.find(b => b.businessId === businessId);
  products.forEach(p => {
    if (!p.barcode) p.barcode = '20' + String(Math.floor(100000000 + Math.random() * 900000000));
    delete p.sku;
  });
  S.cur = { business, subscription, taxrates, users, products, inventory, customers, suppliers, expenses, transactions, counters, payments, orders, auditLogs, heldOrders, pricing: pricing || {} };
}

async function saveTenant(fields) {
  const id = S.cur.business.businessId;
  const jobs = [];
  for (const f of fields) jobs.push(db.set(`biz:${id}:${f}`, S.cur[f === 'taxrates' ? 'taxrates' : f]));
  await Promise.all(jobs);
}
// simpler single-collection save
async function saveCollection(name) {
  await db.set(`biz:${S.cur.business.businessId}:${name}`, S.cur[name]);
}
async function saveBusinessesIndex() { await db.set('index:businesses', S.businessesIndex); }

/* ---------------- GST engine ---------------- */
function computeLineTax(price, qty, discount, taxRate, inclusive) {
  const gross = price * qty - (discount || 0);
  if (inclusive) {
    const taxable = gross / (1 + taxRate / 100);
    return { taxable: round2(taxable), tax: round2(gross - taxable), total: round2(gross) };
  } else {
    const tax = gross * (taxRate / 100);
    return { taxable: round2(gross), tax: round2(tax), total: round2(gross + tax) };
  }
}
const round2 = (n) => Math.round(n * 100) / 100;

function activeTaxRates() {
  return (S.cur.taxrates || []).filter(t => t.active);
}
function defaultTaxRate() {
  const list = activeTaxRates();
  return list.find(t => t.isDefault) || list[0] || null;
}

/* ---------------- Subscription helpers ---------------- */
function subStatusOf(sub) {
  if (!sub) return 'Expired';
  if (sub.status === 'Cancelled' || sub.status === 'Suspended') return sub.status;
  const exp = sub.expiresAt ? new Date(sub.expiresAt) : (sub.startedAt ? new Date(new Date(sub.startedAt).getTime() + 14 * 86400000) : null);
  if (exp && exp < new Date()) return 'Expired';
  return sub.status || 'Trial';
}
function subAllowsAccess(sub) {
  const st = subStatusOf(sub);
  return st === 'Active' || st === 'Trial';
}

/* ---------------- Generic modal form ---------------- */
function openFormModal(title, fields, onSave, initial = {}, wide = false) {
  S.modal = { title, fields, onSave, values: { ...initial }, wide };
  renderModal();
}
function closeModal() { S.modal = null; S.subscriptionPayment = null; renderModal(); }

function renderModal() {
  const slot = document.getElementById('modal-slot');
  if (!slot) return;
  if (!S.modal) { slot.innerHTML = ''; return; }
  const m = S.modal;
  if (m.subscriptionPayment) {
    slot.innerHTML = `
    <div class="modal-backdrop" onmousedown="if(event.target===this) closeModal()">
      <div class="modal wide">
        <button class="modal-close" onclick="closeModal()">&times;</button>
        <h2>${escapeHtml(m.title)}</h2>
        <p style="margin-top:-8px;color:var(--muted);font-size:12.5px;">Choose a payment method to reactivate your account for 30 days.</p>
        <div id="subscription-pay-body" class="subscription-pay">Loading payment options…</div>
        <div class="row" style="margin-top:16px;justify-content:flex-end;">
          <button type="button" class="btn outline" onclick="closeModal()">Cancel</button>
          <button type="button" class="btn primary" onclick="submitSubscriptionPayment()">Pay & reactivate</button>
        </div>
      </div>
    </div>`;
    return;
  }
  slot.innerHTML = `
  <div class="modal-backdrop" onmousedown="if(event.target===this) closeModal()">
    <div class="modal ${m.wide ? 'wide' : ''}">
      <button class="modal-close" onclick="closeModal()">&times;</button>
      <h2>${escapeHtml(m.title)}</h2>
      <form id="dynform" onsubmit="return submitModalForm(event)">
        <div class="grid ${m.wide ? 'cols-2' : 'cols-1'}">
        ${m.fields.map(f => fieldHTML(f, m.values[f.name])).join('')}
        </div>
        <div class="row" style="margin-top:16px;justify-content:flex-end;">
          <button type="button" class="btn outline" onclick="closeModal()">Cancel</button>
          <button type="submit" class="btn primary">Save</button>
        </div>
      </form>
    </div>
  </div>`;
}
function fieldHTML(f, val) {
  val = val ?? f.default ?? '';
  if (f.type === 'select') {
    return `<div class="field"><label>${escapeHtml(f.label)}</label>
      <select name="${f.name}">${f.options.map(o => {
        const [ov, ol] = Array.isArray(o) ? o : [o, o];
        return `<option value="${escapeHtml(ov)}" ${String(ov) === String(val) ? 'selected' : ''}>${escapeHtml(ol)}</option>`;
      }).join('')}</select></div>`;
  }
  if (f.type === 'checkbox') {
    return `<div class="field row"><label style="margin:0;"><input type="checkbox" name="${f.name}" ${val ? 'checked' : ''} style="width:auto;margin-right:6px;">${escapeHtml(f.label)}</label></div>`;
  }
  if (f.type === 'textarea') {
    return `<div class="field"><label>${escapeHtml(f.label)}</label><textarea name="${f.name}" rows="3">${escapeHtml(val)}</textarea></div>`;
  }
  if (f.type === 'image') {
    const preview = val ? `<img src="${escapeHtml(val)}" style="width:64px;height:64px;object-fit:cover;border-radius:8px;border:1px solid var(--line);">` : `<div style="width:64px;height:64px;border-radius:8px;border:1px dashed var(--line);display:flex;align-items:center;justify-content:center;font-size:11px;color:var(--muted);text-align:center;">No photo</div>`;
    return `<div class="field">
      <label>${escapeHtml(f.label)}</label>
      <div class="row" style="align-items:center;gap:10px;">
        <div id="imgprev_${f.name}">${preview}</div>
        <div>
          <input type="file" accept="image/*" onchange="handleImageFieldChange(event,'${f.name}')">
          <div class="hint" style="margin-top:4px;">Optional — photo is resized automatically.</div>
        </div>
      </div>
      <input type="hidden" name="${f.name}" id="imgval_${f.name}" value="${escapeHtml(val)}">
    </div>`;
  }
  return `<div class="field"><label>${escapeHtml(f.label)}</label>
    <input type="${f.type || 'text'}" name="${f.name}" value="${escapeHtml(val)}" ${f.step ? `step="${f.step}"` : ''} ${f.required !== false ? 'required' : ''} placeholder="${escapeHtml(f.placeholder || '')}">
  </div>`;
}
// Reads a chosen photo, downsizes it to a small thumbnail (keeps localStorage light),
// and writes the result into the field's hidden input + live preview.
function handleImageFieldChange(e, fieldName) {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function (ev) {
    const img = new Image();
    img.onload = function () {
      const maxDim = 220;
      let w = img.width, h = img.height;
      if (w > h) { if (w > maxDim) { h = Math.round(h * maxDim / w); w = maxDim; } }
      else { if (h > maxDim) { w = Math.round(w * maxDim / h); h = maxDim; } }
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
      const hidden = document.getElementById('imgval_' + fieldName);
      if (hidden) hidden.value = dataUrl;
      const prev = document.getElementById('imgprev_' + fieldName);
      if (prev) prev.innerHTML = `<img src="${dataUrl}" style="width:64px;height:64px;object-fit:cover;border-radius:8px;border:1px solid var(--line);">`;
    };
    img.src = ev.target.result;
  };
  reader.readAsDataURL(file);
}
function submitModalForm(e) {
  e.preventDefault();
  const fd = new FormData(e.target);
  const out = {};
  for (const f of S.modal.fields) {
    if (f.type === 'checkbox') out[f.name] = fd.has(f.name);
    else if (f.type === 'number') out[f.name] = Number(fd.get(f.name) || 0);
    else out[f.name] = fd.get(f.name) || '';
  }
  const cb = S.modal.onSave;
  closeModal();
  cb(out);
  return false;
}

/* ============================================================
   AUTH / ONBOARDING SCREENS
   ============================================================ */
function screenLanding() {
  return `
  <div class="auth-wrap">
    <div class="auth-card">
      <div class="auth-logo"><img src="${brandLogo()}" alt="Yuevaan Consultancy logo"></div>
      <div class="auth-brand">POS SYSTEM</div>
      <div class="auth-sub">Smart POS & GST platform for restaurants, cafés and grocery stores.</div>
      <div class="field" style="display:flex;flex-direction:column;gap:10px;">
        <button class="btn primary" style="width:100%;justify-content:center;" onclick="go('register')">Register a new business</button>
        <button class="btn outline" style="width:100%;justify-content:center;" onclick="go('company-login')">Company login</button>
        <button class="btn outline" style="width:100%;justify-content:center;" onclick="go('saas-admin-login')">SaaS admin panel</button>
      </div>
      <div style="margin-top:18px;font-size:12px;color:var(--muted);">Prototype build — subscription payments are simulated.</div>
      ${langToggleHTML()}
      <div style="margin-top:10px;font-size:11.5px;color:var(--muted);border-top:1px solid var(--line);padding-top:10px;">Demo companies for presentation — Company login with name <b>Pema Store</b>, <b>Norbu General Store</b> (Grocery), <b>Test Restaurant</b> or <b>Menjong Kitchen</b> (Restaurant &amp; Café), password <b>1234</b> for both the company and the admin login.</div>
    </div>
  </div>`;
}

function screenRegister() {
  const v = S.ui.values || {};
  return `
  <div class="auth-wrap"><div class="auth-card wide">
    <div class="auth-brand">Register your business</div>
    <div class="stepper"><div class="step done"></div><div class="step"></div><div class="step"></div></div>
    <form onsubmit="return handleRegisterSubmit(event)">
      <div class="grid cols-2">
        <div class="field"><label>Business / Company name</label><input required name="name" placeholder="e.g. Thimphu Grill House"></div>
        <div class="field"><label>Business type</label>
          <select name="type"><option value="Restaurant">Restaurant &amp; Café</option><option value="Grocery">Grocery Store</option></select>
        </div>
        <div class="field"><label>Owner / Administrator name</label><input required name="ownerName"></div>
        <div class="field"><label>Phone</label><input required name="phone"></div>
        <div class="field"><label>Email</label><input required type="email" name="email"></div>
        <div class="field"><label>Tax / GST registration no.</label><input name="gstNo" placeholder="optional at trial stage"></div>
        <div class="field" style="grid-column:1/-1;"><label>Address</label><input name="address"></div>
        <div class="field"><label>Password</label><input required type="password" name="password" minlength="4"></div>
        <div class="field"><label>Confirm password</label><input required type="password" name="password2" minlength="4"></div>
      </div>
      <div id="reg-error" style="color:var(--red);font-size:12.5px;margin-bottom:8px;"></div>
      <button class="btn primary" style="width:100%;justify-content:center;" type="submit">Continue to subscription</button>
    </form>
    <div style="margin-top:14px;font-size:12.5px;">Already registered? <button class="link-btn" onclick="go('company-login')">Log in</button></div>
  </div></div>`;
}
async function handleRegisterSubmit(e) {
  e.preventDefault();
  const fd = new FormData(e.target);
  const data = Object.fromEntries(fd.entries());
  const errorEl = document.getElementById('reg-error');
  if (data.password !== data.password2) {
    if (errorEl) errorEl.textContent = 'Passwords do not match.';
    return false;
  }
  const cleanName = String(data.name || '').trim();
  if (S.businessesIndex.some(b => (b.name || '').trim().toLowerCase() === cleanName.toLowerCase())) {
    if (errorEl) errorEl.textContent = `A business with the name "${cleanName}" is already registered. Please choose another name or log in.`;
    return false;
  }
  const businessId = 'BIZ-' + Math.random().toString(36).slice(2, 7).toUpperCase();
  const business = {
    businessId, name: cleanName, type: data.type, ownerName: data.ownerName,
    phone: data.phone, email: data.email, address: data.address, gstNo: data.gstNo,
    password: data.password, createdAt: new Date().toISOString()
  };
  S.businessesIndex.push(business);
  await saveBusinessesIndex();
  S.pendingBusiness = business;
  go('subscribe');
  return false;
}

function screenSubscribe() {
  const chosen = S.ui.plan || 'Professional';
  return `
  <div class="auth-wrap"><div class="auth-card wide">
    <div class="auth-brand">Choose a subscription plan</div>
    <div class="stepper"><div class="step done"></div><div class="step done"></div><div class="step"></div></div>
    <div class="grid cols-3">
      ${Object.entries(PLANS).map(([name, p]) => `
        <div class="plan-card ${chosen === name ? 'selected' : ''}" onclick="go('subscribe',{plan:'${name}'})">
          <h3>${name}</h3>
          <div class="price mono">${money(p.price)}<span style="font-size:11px;color:var(--muted);font-weight:500;">/mo</span></div>
          <ul>${p.features.map(f => `<li>${escapeHtml(f)}</li>`).join('')}</ul>
        </div>`).join('')}
    </div>
    <button class="btn primary" style="width:100%;justify-content:center;margin-top:18px;" onclick="go('checkout',{plan:'${chosen}'})">Continue with ${chosen}</button>
  </div></div>`;
}

function screenCheckout() {
  const plan = S.ui.plan;
  const p = PLANS[plan];
  return `
  <div class="auth-wrap"><div class="auth-card">
    <div class="auth-brand">Prototype Payment</div>
    <div class="stepper"><div class="step done"></div><div class="step done"></div><div class="step done"></div></div>
    <div class="card" style="margin-bottom:16px;">
      <div class="row between"><b>${plan} plan</b><span class="mono">${money(p.price)}/mo</span></div>
    </div>
    <div class="field"><label>Card number (simulated — not processed)</label><input placeholder="4242 4242 4242 4242"></div>
    <div class="row"><div class="field" style="flex:1;"><label>Expiry</label><input placeholder="MM/YY"></div><div class="field" style="flex:1;"><label>CVC</label><input placeholder="123"></div></div>
    <button class="btn primary" style="width:100%;justify-content:center;" onclick="activateSubscription('${plan}')">Pay &amp; activate subscription</button>
    <div style="margin-top:10px;font-size:11.5px;color:var(--muted);text-align:center;">No real payment is processed in this prototype. A live gateway can be wired in behind this same flow later.</div>
  </div></div>`;
}
async function activateSubscription(plan) {
  const biz = S.pendingBusiness;
  const now = new Date();
  const expires = new Date(now); expires.setDate(expires.getDate() + 30);
  const sub = {
    plan, status: 'Active', activatedAt: now.toISOString(), startedAt: now.toISOString(), expiresAt: expires.toISOString(),
    history: [{ event: `Subscribed to ${plan}`, at: now.toISOString(), amount: PLANS[plan].price }]
  };
  await db.set(`biz:${biz.businessId}:subscription`, sub);
  await db.set(`biz:${biz.businessId}:taxrates`, [
    { id: uid('tax_'), name: 'GST Standard', rate: 5, mode: 'exclusive', active: true, isDefault: true, effectiveDate: todayISO() },
    { id: uid('tax_'), name: 'GST Zero-rated', rate: 0, mode: 'exclusive', active: true, isDefault: false, effectiveDate: todayISO() }
  ]);
  await db.set(`biz:${biz.businessId}:users`, [
    { username: 'admin', password: biz.password, role: 'Admin', name: biz.ownerName, active: true }
  ]);
  toast('Subscription activated. You can now log in.');
  go('company-login', { businessId: biz.businessId });
}

function screenCompanyLogin() {
  return `
  <div class="auth-wrap">
    <div class="auth-card" style="max-width:440px;">
      <div class="auth-logo"><img src="${brandLogo()}" alt="Yuevaan Consultancy logo"></div>
      <div class="auth-brand">Welcome back</div>
      <div class="auth-sub">Sign in to your POS SYSTEM business account.</div>
      <div class="auth-progress"><span></span></div>
      <form onsubmit="return handleCompanyLogin(event)">
        <div class="field">
          <label>Company name or Business ID</label>
          <input required name="idOrName" autocomplete="organization" autofocus value="${escapeHtml(S.ui.businessId || '')}" placeholder="e.g. BIZ-ABC12">
        </div>
        <div class="field">
          <label>Password</label>
          <div class="password-wrap">
            <input required id="company-password" type="password" name="password" autocomplete="current-password" placeholder="Enter your password">
            <button type="button" class="password-toggle" onclick="togglePassword('company-password',this)">Show</button>
          </div>
        </div>
        <div id="login-error" style="color:var(--red);font-size:12.5px;min-height:18px;margin-bottom:8px;"></div>
        <button class="btn primary" style="width:100%;justify-content:center;padding:11px;" type="submit">Continue securely →</button>
      </form>
      <div class="auth-note">🔒 Your company login takes you to employee sign-in.</div>
      <div style="margin-top:16px;font-size:12.5px;text-align:center;">New business? <button class="link-btn" onclick="go('register')">Create an account</button></div>
      <div style="text-align:center;"><button class="link-btn" style="margin-top:8px;" onclick="go('landing')">&larr; Back</button></div>
    </div>
  </div>`;
}
async function handleCompanyLogin(e) {
  e.preventDefault();
  const fd = new FormData(e.target);
  const idOrName = fd.get('idOrName').trim().toLowerCase();
  const password = fd.get('password');
  const biz = S.businessesIndex.find(b => b.businessId.toLowerCase() === idOrName || b.name.toLowerCase() === idOrName);
  if (!biz || biz.password !== password) {
    document.getElementById('login-error').textContent = 'Business not found or incorrect password.';
    return false;
  }
  await loadTenant(biz.businessId);
  if (!subAllowsAccess(S.cur.subscription)) {
    go('employee-login', { businessId: biz.businessId, blocked: true });
    return false;
  }
  go('employee-login', { businessId: biz.businessId });
  return false;
}

function screenEmployeeLogin() {
  const blocked = S.ui.blocked;
  return `
  <div class="auth-wrap">
    <div class="auth-card" style="max-width:440px;">
      <div class="auth-logo"><img src="${brandLogo()}" alt="Yuevaan Consultancy logo"></div>
      <div class="auth-brand">${escapeHtml(S.cur.business.name)}</div>
      <div class="auth-sub">Employee sign-in · Stage 2 of 2</div>
      <div class="auth-progress"><span></span></div>
      ${blocked ? `<div class="card" style="border-color:#EAC3B8;background:#FBE7E2;color:var(--red);margin-bottom:14px;font-size:13px;">Subscription is <b>${subStatusOf(S.cur.subscription)}</b>. <button class="link-btn" onclick="go('renew')">Reactivate account</button></div>` : ''}
      <form onsubmit="return handleEmployeeLogin(event)">
        <div class="field">
          <label>Employee ID / Username</label>
          <input required name="username" autocomplete="username" value="admin" autofocus placeholder="admin">
        </div>
        <div class="field">
          <label>Password</label>
          <div class="password-wrap">
            <input required id="employee-password" type="password" name="password" autocomplete="current-password" placeholder="Enter password">
            <button type="button" class="password-toggle" onclick="togglePassword('employee-password',this)">Show</button>
          </div>
        </div>
        <div id="emp-error" style="color:var(--red);font-size:12.5px;min-height:18px;margin-bottom:8px;"></div>
        <label style="display:flex;align-items:center;gap:7px;font-weight:500;font-size:12.5px;margin-bottom:12px;cursor:pointer;">
          <input type="checkbox" name="remember" style="width:auto;margin:0;" checked> Remember me on this device
        </label>
        <button class="btn primary" style="width:100%;justify-content:center;padding:11px;" type="submit">Sign in to POS SYSTEM →</button>
      </form>
      <div class="auth-note">Tip: the default administrator ID is <b>admin</b>.</div>
      <button class="link-btn" style="margin-top:12px;" onclick="go('company-login')">&larr; Different company</button>
    </div>
  </div>`;
}
async function handleEmployeeLogin(e) {
  e.preventDefault();
  const fd = new FormData(e.target);
  const username = String(fd.get('username') || '').trim();
  const password = String(fd.get('password') || '');
  const error = document.getElementById('emp-error');

  if (!S.cur || !S.cur.business) {
    if (error) error.textContent = 'Company session is missing. Please log in to the company again.';
    go('company-login');
    return false;
  }

  // Make sure the default company administrator always exists.
  // The admin password is the same password used for the company login.
  let users = Array.isArray(S.cur.users) ? S.cur.users : [];
  let u = users.find(x => String(x.username || '').trim().toLowerCase() === username.toLowerCase() && x.active !== false);

  if (!u && username.toLowerCase() === 'admin') {
    u = {
      username: 'admin',
      password: S.cur.business.password,
      role: 'Admin',
      name: S.cur.business.ownerName || 'Administrator',
      active: true
    };
    users.push(u);
    S.cur.users = users;
    await saveCollection('users');
  }

  if (!u || String(u.password) !== password) {
    if (error) error.textContent = 'Incorrect employee ID or password. Use Employee ID: admin and the same password as the company login.';
    return false;
  }

  S.session = { businessId: S.cur.business.businessId, employee: u };
  logAudit('Login', `${u.name || u.username} (${u.role}) signed in`);
  const remember = fd.get('remember');
  if (remember) {
    await db.set('session:remember', { businessId: S.cur.business.businessId, username: u.username });
  } else {
    await db.set('session:remember', null);
  }
  go('dashboard');
  return false;
}
function logout() {
  if (S.session) logAudit('Logout', `${S.session.employee.name || S.session.employee.username} signed out`);
  db.set('session:remember', null);
  S.session = null; S.cur = null; go('landing');
}

function togglePassword(id, btn) {
  const input = document.getElementById(id);
  if (!input) return;
  const hidden = input.type === 'password';
  input.type = hidden ? 'text' : 'password';
  btn.textContent = hidden ? 'Hide' : 'Show';
}

/* ---- SaaS admin (separate platform-level login) ---- */
function screenSaasAdminLogin() {
  return `
  <div class="auth-wrap"><div class="auth-card">
    <div class="auth-brand">SaaS Admin Panel</div>
    <div class="auth-sub">Platform-level access — not a business account.</div>
    <form onsubmit="return handleSaasAdminLogin(event)">
      <div class="field"><label>Admin username</label><input required name="u" value="platform"></div>
      <div class="field"><label>Password</label><input required type="password" name="p" value=""></div>
      <div style="font-size:11.5px;color:var(--muted);margin-bottom:10px;">Prototype credentials: <span class="mono">platform / platform</span></div>
      <div id="saas-error" style="color:var(--red);font-size:12.5px;"></div>
      <button class="btn primary" style="width:100%;justify-content:center;" type="submit">Enter admin panel</button>
    </form>
    <button class="link-btn" style="margin-top:10px;" onclick="go('landing')">&larr; Back</button>
  </div></div>`;
}
function handleSaasAdminLogin(e) {
  e.preventDefault();
  const fd = new FormData(e.target);
  if (fd.get('u') === 'platform' && fd.get('p') === 'platform') { go('saas-admin'); }
  else document.getElementById('saas-error').textContent = 'Invalid admin credentials.';
  return false;
}

/* ============================================================
   APP SHELL (sidebar + topbar) for logged-in screens
   ============================================================ */
function navConfig(type) {
  const common = [
    { s: 'dashboard', label: 'Dashboard' },
    { s: 'pos', label: 'POS' },
  ];
  const restaurantOnly = [{ s: 'orders', label: 'Kitchen Orders' }, { s: 'menu', label: 'Menu' }];
  const groceryOnly = [{ s: 'products', label: 'Products' }, { s: 'purchases', label: 'Purchases' }];
  const rest = [
    { s: 'inventory', label: 'Inventory' },
    { s: 'invoices', label: 'Invoices' },
    { s: 'payments', label: 'Payments' },
    { s: 'customers', label: 'Customers' },
    { s: 'suppliers', label: 'Suppliers' },
    { s: 'expenses', label: 'Expenses' },
    { s: 'gst', label: 'GST / Tax' },
    { s: 'reports', label: 'Reports' },
    { s: 'users', label: 'Users' },
    { s: 'audit', label: 'Audit Log' },
    { s: 'subscription', label: 'Subscription' },
    { s: 'settings', label: 'Settings' },
  ];
  const all = [...common, ...(type === 'Restaurant' ? restaurantOnly : groceryOnly), ...rest];
  const role = S.session.employee.role;
  return all.filter(n => roleCanAccess(role, n.s));
}
function productTracksStock(p) {
  if (!p) return false;
  if (p.trackStock === false) return false;
  if (S.cur && S.cur.business && S.cur.business.type === 'Restaurant') {
    if (p.unit === 'plate' || ['Main Course', 'Momos', 'Rice & Noodles', 'Sides', 'Desserts'].includes(p.category)) {
      return false;
    }
  }
  return true;
}
function lowStockItems() {
  return (S.cur.products || []).filter(p => p.active !== false && productTracksStock(p) && Number(p.stock) <= Number(p.minStock || 0));
}

function shell(innerHTML) {
  const biz = S.cur.business;
  const sub = S.cur.subscription;
  const st = subStatusOf(sub);
  const nav = navConfig(biz.type);
  return `
  <div id="app-shell" style="display:flex;min-height:100vh;">
    <div class="sidebar">
      <div class="brand"><div class="mark">POS SYSTEM</div><div class="sub">${escapeHtml(biz.name)}</div></div>
      ${nav.map(n => `<div class="nav-item ${S.screen === n.s ? 'active' : ''}" onclick="go('${n.s}')">${t(n.label)}${n.s === 'inventory' && lowStockItems().length ? `<span class="nav-badge" title="Low-stock items">${lowStockItems().length}</span>` : ''}</div>`).join('')}
      <div class="sidebar-foot">
        <div class="who">${escapeHtml(S.session.employee.name || S.session.employee.username)}</div>
        <div class="role">${escapeHtml(S.session.employee.role)}</div>
        <div class="logout" onclick="logout()">${t('Log out')}</div>
        ${langToggleHTML()}
      </div>
    </div>
    <div class="main">
      <div class="topbar">
        <div><h1>${screenTitle()}</h1><div class="meta">${biz.type} · ${biz.businessId}</div></div>
        <div class="row"><span class="sub-badge ${st.toLowerCase()}">${st}</span></div>
      </div>
      <div class="content">${innerHTML}</div>
    </div>
  </div>`;
}
function screenTitle() {
  const map = { dashboard: 'Dashboard', pos: 'Point of Sale', products: 'Products', menu: 'Menu',
    inventory: 'Inventory', invoices: 'Invoices', customers: 'Customers', suppliers: 'Suppliers',
    expenses: 'Expenses', gst: 'GST / Tax Reports', reports: 'Sales Reports', users: 'Users & Roles',
    subscription: 'Subscription', settings: 'Tax Settings', purchases: 'Purchases',
    orders: 'Kitchen Orders', payments: 'Payment Reports', receipt: 'Receipt', audit: 'Audit Log' };
  return t(map[S.screen] || '');
}

function requiresActiveSub() {
  const st = subStatusOf(S.cur.subscription);
  const restricted = ['pos', 'invoices', 'gst', 'reports', 'orders', 'payments'];
  return restricted.includes(S.screen) && st !== 'Active' && st !== 'Trial';
}
function blockedScreen() {
  return `<div class="card" style="max-width:520px;margin:40px auto;text-align:center;">
    <h2 style="margin-top:0;">Subscription ${subStatusOf(S.cur.subscription)}</h2>
    <p style="color:var(--muted);">This feature is restricted while your subscription is inactive.</p>
    <button class="btn primary" onclick="go('renew')">Renew or upgrade</button>
  </div>`;
}

/* ============================================================
   DASHBOARD
   ============================================================ */
// Which dashboard "lens" each role sees. Admin/Manager get everything (unchanged
// behaviour); other roles get a smaller, relevant-to-their-job subset instead of
// the full financial + inventory + floor picture.
const DASHBOARD_ROLE_VIEW = {
  Admin: 'full', Manager: 'full',
  Accountant: 'finance',
  Cashier: 'sales',
  'Inventory Officer': 'inventory', Storekeeper: 'inventory',
  Waiter: 'floor', 'Kitchen Staff': 'floor'
};
function dashboardViewFor() {
  const role = S.session && S.session.employee ? S.session.employee.role : 'Admin';
  return DASHBOARD_ROLE_VIEW[role] || 'full';
}
function screenDashboard() {
  const view = dashboardViewFor();
  const role = S.session && S.session.employee ? S.session.employee.role : 'Admin';
  const txns = S.cur.transactions.filter(t => t.date === todayISO() && t.status === 'Completed');
  const todaySales = txns.reduce((s, t) => s + t.total, 0);
  const todayGst = txns.reduce((s, t) => s + t.taxAmount, 0);
  const todayExpenses = S.cur.expenses.filter(e => e.date === todayISO()).reduce((s, e) => s + e.amount, 0);
  const todayProfit = estimatedProfitFor(txns, todayISO(), todayISO());
  const lowStock = S.cur.products.filter(p => p.stock <= p.minStock && p.active !== false);
  const outStock = S.cur.products.filter(p => p.stock <= 0);
  const totalProducts = S.cur.products.filter(p => p.active !== false).length;
  const totalCustomers = S.cur.customers.filter(c => c.active !== false).length;
  const pendingOrders = (S.cur.orders || []).filter(o => !['Served', 'Cancelled'].includes(o.status)).length;
  const byProduct = {};
  S.cur.transactions.filter(t => t.status === 'Completed').forEach(t => t.items.forEach(i => {
    byProduct[i.name] = (byProduct[i.name] || 0) + i.qty;
  }));
  const top = Object.entries(byProduct).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const byPay = {};
  (S.cur.payments || []).filter(p => p.date === todayISO()).forEach(p => { byPay[p.method] = (byPay[p.method] || 0) + Number(p.amount); });
  const recent = [...S.cur.transactions].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 6);

  const salesKpis = `
  <div class="grid cols-4">
    <div class="card kpi"><div class="label">${t("Today's Sales")}</div><div class="value">${money(todaySales)}</div></div>
    <div class="card kpi"><div class="label">${t("Today's Orders")}</div><div class="value">${txns.length}</div></div>
    ${view === 'full' || view === 'finance' ? `<div class="card kpi"><div class="label">Today's Profit</div><div class="value good">${money(todayProfit)}</div></div>
    <div class="card kpi"><div class="label">GST Collected Today</div><div class="value">${money(todayGst)}</div></div>` : `
    <div class="card kpi"><div class="label">Pending Orders</div><div class="value ${pendingOrders ? 'warn' : 'good'}">${pendingOrders}</div></div>
    <div class="card kpi"><div class="label">Total Customers</div><div class="value">${totalCustomers}</div></div>`}
  </div>`;

  const financeExtraKpis = `
  <div class="grid cols-4" style="margin-top:16px;">
    <div class="card kpi"><div class="label">Total Products</div><div class="value">${totalProducts}</div></div>
    <div class="card kpi"><div class="label">Total Customers</div><div class="value">${totalCustomers}</div></div>
    <div class="card kpi"><div class="label">Pending Orders</div><div class="value ${pendingOrders ? 'warn' : 'good'}">${pendingOrders}</div></div>
    <div class="card kpi"><div class="label">Today's Expenses</div><div class="value warn">${money(todayExpenses)}</div></div>
  </div>`;

  const stockKpis = `
  <div class="grid cols-2" style="margin-top:16px;">
    <div class="card kpi"><div class="label">Low Stock Items</div><div class="value ${lowStock.length ? 'warn' : 'good'}">${lowStock.length}</div></div>
    <div class="card kpi"><div class="label">Out-of-Stock Items</div><div class="value ${outStock.length ? 'warn' : 'good'}">${outStock.length}</div></div>
  </div>`;

  const businessExtra = S.cur.business.type === 'Restaurant' ? restaurantDashboardExtra() : groceryDashboardExtra();

  const topProductsTable = `
  <div class="section-title">Top-selling products</div>
  <div class="table-wrap"><table><thead><tr><th>Product</th><th>Units sold</th></tr></thead><tbody>
    ${top.length ? top.map(([n, q]) => `<tr><td>${escapeHtml(n)}</td><td class="mono">${q}</td></tr>`).join('') : `<tr><td colspan="2" class="empty-state">No sales recorded yet.</td></tr>`}
  </tbody></table></div>`;

  const paymentBreakdownTable = `
  <div class="section-title">Payment method breakdown (today)</div>
  <div class="table-wrap"><table><thead><tr><th>Method</th><th>Amount</th></tr></thead><tbody>
    ${Object.keys(byPay).length ? Object.entries(byPay).map(([m, a]) => `<tr><td>${escapeHtml(m)}</td><td class="mono">${money(a)}</td></tr>`).join('') : `<tr><td colspan="2" class="empty-state">No payments today.</td></tr>`}
  </tbody></table></div>`;

  const recentTransactionsTable = `
  <div class="section-title">Recent transactions <span class="hint"><button class="link-btn" onclick="go('invoices')">View all</button></span></div>
  <div class="table-wrap"><table><thead><tr><th>Invoice</th><th>Date</th><th>Customer</th><th>Total</th><th>Status</th></tr></thead><tbody>
    ${recent.length ? recent.map(t => `<tr><td class="mono">${t.invoiceNo}</td><td>${fmtDate(t.date)}</td><td>${escapeHtml(customerName(t.customerId))}</td><td class="mono">${money(t.total)}</td><td><span class="pill status-${t.status.replace(' ', '')}">${t.status}</span></td></tr>`).join('') : `<tr><td colspan="5" class="empty-state">No transactions yet — go to POS to record your first sale.</td></tr>`}
  </tbody></table></div>`;

  const pendingKitchenList = (() => {
    const q = (S.cur.orders || []).filter(o => ['New', 'Accepted', 'Preparing', 'Ready'].includes(o.status)).slice(0, 8);
    return `
    <div class="section-title">Open kitchen tickets <span class="hint"><button class="link-btn" onclick="go('orders')">View all</button></span></div>
    <div class="table-wrap"><table><thead><tr><th>Ticket</th><th>Type</th><th>Status</th><th>Items</th></tr></thead><tbody>
      ${q.length ? q.map(o => `<tr><td class="mono">${escapeHtml(o.kot || o.id)}</td><td>${escapeHtml(o.orderType || '—')}${o.table ? ' · ' + escapeHtml(o.table) : ''}</td><td><span class="pill">${escapeHtml(o.status)}</span></td><td>${(o.items || []).map(i => `${i.qty}× ${escapeHtml(i.name)}`).join(', ')}</td></tr>`).join('') : `<tr><td colspan="4" class="empty-state">No open kitchen tickets right now.</td></tr>`}
    </tbody></table></div>`;
  })();

  const lowList = lowStockItems().sort((a, b) => a.stock - b.stock).slice(0, 8);
  const lowStockPanel = lowList.length ? `
  <div class="section-title">⚠ Low-stock alert <span class="hint"><button class="link-btn" onclick="go('inventory')">Open inventory</button></span></div>
  <div class="table-wrap"><table><thead><tr><th>Item</th><th>Category</th><th>In stock</th><th>Minimum</th></tr></thead><tbody>
    ${lowList.map(p => `<tr><td>${escapeHtml(p.name)}</td><td>${escapeHtml(p.category || '')}</td><td class="mono" style="color:var(--red);font-weight:700;">${p.stock} ${escapeHtml(p.unit || '')}</td><td class="mono">${p.minStock || 0}</td></tr>`).join('')}
  </tbody></table></div>` : '';
  const lowBanner = lowStockItems().length ? `<div class="alert-banner">⚠ <b>${lowStockItems().length} item(s) low on stock</b> — let the manager know.</div>` : '';
  const roleBanner = view === 'full' ? '' : `<div class="hint" style="margin-bottom:12px;">Showing a ${escapeHtml(role)}-focused view of the dashboard.</div>`;

  let sections = '';
  if (view === 'full') {
    sections = `${salesKpis}${financeExtraKpis}${stockKpis}${lowStockPanel}${businessExtra}${dashboardCharts()}${topProductsTable}${paymentBreakdownTable}${recentTransactionsTable}`;
  } else if (view === 'finance') {
    sections = `${salesKpis}${financeExtraKpis}${dashboardCharts()}${paymentBreakdownTable}${recentTransactionsTable}`;
  } else if (view === 'sales') {
    sections = `${lowBanner}${salesKpis}${recentTransactionsTable}`;
  } else if (view === 'inventory') {
    sections = `${financeExtraKpis}${stockKpis}${lowStockPanel}${businessExtra}`;
  } else if (view === 'floor') {
    sections = `${businessExtra}${pendingKitchenList}`;
  } else {
    sections = `${salesKpis}${financeExtraKpis}${stockKpis}${lowStockPanel}${businessExtra}${dashboardCharts()}${topProductsTable}${paymentBreakdownTable}${recentTransactionsTable}`;
  }

  return `${roleBanner}${sections}`;
}
function customerName(id) {
  if (!id) return 'Walk-in';
  const list = (S.cur && S.cur.customers) ? S.cur.customers : [];
  const c = list.find(c => c.id === id);
  return c ? c.name : 'Walk-in';
}

function dashboardCharts() {
  const completed = S.cur.transactions.filter(t => t.status === 'Completed');
  const daily = {};
  completed.forEach(t => daily[t.date] = (daily[t.date] || 0) + Number(t.total || 0));
  const days = Object.entries(daily).sort((a,b)=>a[0].localeCompare(b[0])).slice(-7);
  const max = Math.max(...days.map(x=>x[1]), 1);
  const byPay = {};
  (S.cur.payments || []).filter(p => p.date === todayISO()).forEach(p => byPay[p.method] = (byPay[p.method] || 0) + Number(p.amount || 0));
  const payTotal = Object.values(byPay).reduce((a,b)=>a+b,0) || 1;
  let angle = 0;
  const seg = Object.entries(byPay).map(([method,amount],idx) => {
    const next = angle + amount/payTotal*360;
    const s = `${idx%2===0?'var(--teal)':'#D98E22'} ${angle}deg ${next}deg`;
    angle = next;
    return s;
  }).join(',');
  return `
  <div class="chart-grid">
    <div class="chart-card">
      <div class="chart-title">Sales trend — last 7 recorded days</div>
      ${days.length ? `<div class="chart">
        ${days.map(([d,v])=>`<div class="chart-bar" style="height:${Math.max(8,(v/max)*180)}px"><span>${money(v)}</span></div>`).join('')}
      </div><div class="chart-labels">${days.map(([d])=>`<span>${fmtDate(d).slice(0,5)}</span>`).join('')}</div>` :
      `<div class="empty-state">Sales charts will appear after transactions are recorded.</div>`}
    </div>
    <div class="chart-card">
      <div class="chart-title">Payment mix — today</div>
      ${Object.keys(byPay).length ? `<div class="donut-wrap">
        <div class="donut" style="background:conic-gradient(${seg})"><strong>${money(payTotal)}</strong></div>
        <div class="legend">${Object.entries(byPay).map(([m,v],i)=>`<div><i style="background:${i%2===0?'var(--teal)':'var(--amber)'}"></i>${escapeHtml(m)} — ${money(v)}</div>`).join('')}</div>
      </div>` : `<div class="empty-state">Payment chart will appear after payments are recorded.</div>`}
    </div>
  </div>`;
}

function restaurantDashboardExtra() {
  const orders = S.cur.orders || [];
  const active = orders.filter(o => o.status !== 'Served' && o.status !== 'Cancelled');
  const activeTables = new Set(active.filter(o => o.orderType === 'Dine-in' && o.table).map(o => o.table));
  const pendingKitchen = orders.filter(o => ['New', 'Accepted', 'Preparing'].includes(o.status));
  const dineIn = active.filter(o => o.orderType === 'Dine-in').length;
  const takeaway = active.filter(o => o.orderType === 'Takeaway').length;
  return `
  <div class="section-title" style="margin-bottom:12px;">Restaurant floor</div>
  <div class="grid cols-4">
    <div class="card kpi"><div class="label">Active Tables</div><div class="value">${activeTables.size}</div></div>
    <div class="card kpi"><div class="label">Pending Kitchen Orders</div><div class="value ${pendingKitchen.length?'warn':'good'}">${pendingKitchen.length}</div></div>
    <div class="card kpi"><div class="label">Dine-in Orders</div><div class="value">${dineIn}</div></div>
    <div class="card kpi"><div class="label">Takeaway Orders</div><div class="value">${takeaway}</div></div>
  </div>`;
}
function groceryDashboardExtra() {
  const invValue = S.cur.products.reduce((s, p) => s + (p.purchasePrice || 0) * (p.stock || 0), 0);
  const byProduct = {};
  S.cur.transactions.filter(t => t.status === 'Completed' && t.date === todayISO()).forEach(t => t.items.forEach(i => { byProduct[i.name] = (byProduct[i.name] || 0) + i.qty; }));
  const fastMoving = Object.entries(byProduct).sort((a, b) => b[1] - a[1])[0];
  const recentPurchases = (S.cur.inventory || []).filter(m => m.type === 'Purchase').slice(-5).reverse();
  return `
  <div class="section-title" style="margin-bottom:12px;">Grocery snapshot</div>
  <div class="grid cols-4">
    <div class="card kpi"><div class="label">Inventory Value</div><div class="value">${money(invValue)}</div></div>
    <div class="card kpi"><div class="label">Fast-Moving Today</div><div class="value" style="font-size:15px;">${fastMoving ? escapeHtml(fastMoving[0]) : '—'}</div></div>
    <div class="card kpi"><div class="label">Recent Purchases</div><div class="value">${recentPurchases.length}</div></div>
    <div class="card kpi"><div class="label">Low Stock</div><div class="value ${lowStockCount()?'warn':'good'}">${lowStockCount()}</div></div>
  </div>`;
}
function lowStockCount() { return S.cur.products.filter(p => p.stock <= p.minStock && p.active !== false).length; }

/* ============================================================
   PRODUCTS / MENU + EXCEL-STYLE IMPORT
   ============================================================ */
function productFields() {
  const taxOpts = activeTaxRates().map(t => [t.id, `${t.name} (${t.rate}%)`]);
  return [
    { name: 'name', label: 'Product name' },
    { name: 'image', label: 'Photo', type: 'image', required: false },
    { name: 'barcode', label: 'Barcode', required: false, placeholder: 'Auto-generated if left blank' },
    { name: 'category', label: 'Category' },
    { name: 'purchasePrice', label: 'Purchase price', type: 'number', step: '0.01' },
    { name: 'sellPrice', label: 'Selling price', type: 'number', step: '0.01' },
    { name: 'manualGstRate', label: 'GST rate (%) — enter manually', type: 'number', step: '0.01', default: 0, required: false },
    { name: 'unit', label: 'Unit', type: 'select', options: ['pc', 'kg', 'g', 'l', 'ml', 'plate', 'box'] },
    { name: 'stock', label: 'Opening stock', type: 'number' },
    { name: 'minStock', label: 'Minimum stock', type: 'number' },
    { name: 'supplierId', label: 'Supplier', type: 'select', options: [['', 'None'], ...S.cur.suppliers.map(s => [s.id, s.name])] },
    { name: 'batchNo', label: 'Batch number', required: false },
    { name: 'expiryDate', label: 'Expiry date', type: 'date', required: false },
  ];
}
function screenProducts() {
  const p = S.cur.products;
  const isRestaurant = S.cur.business.type === 'Restaurant';
  return `
  <div class="row between" style="margin-bottom:14px;">
    <input placeholder="Search by name or barcode…" style="max-width:280px;" oninput="S.ui.q=this.value;renderProductsTable()">
    <div class="row">
      <button class="btn outline" onclick="downloadTemplate()">Download Excel template</button>
      <label class="btn outline" style="margin:0;">Import from Excel<input type="file" accept=".csv" style="display:none;" onchange="handleImportFile(event)"></label>
      <button class="btn outline" onclick="exportCollectionCsv('products')">Export to Excel</button>
      <button class="btn primary" onclick="openProductModal()">+ Add ${isRestaurant ? 'menu item' : 'product'}</button>
    </div>
  </div>
  <div id="import-summary"></div>
  <div class="table-wrap" id="products-table">${productsTableHTML(p)}</div>
  `;
}
function productsTableHTML(list) {
  const q = (S.ui.q || '').toLowerCase();
  const filtered = q ? list.filter(x => (x.name + ' ' + (x.barcode || '')).toLowerCase().includes(q)) : list;
  const isRestaurant = S.cur.business.type === 'Restaurant';
  const noun = isRestaurant ? 'menu item' : 'product';
  if (!filtered.length) return `<div class="empty-state">No ${noun}s yet. Add one manually or import from Excel.</div>`;
  const groups = {};
  filtered.forEach(x => { const cat = (x.category || '').trim() || 'Uncategorized'; (groups[cat] = groups[cat] || []).push(x); });
  const catNames = Object.keys(groups).sort((a, b) => a.localeCompare(b));
  return catNames.map(cat => `
    <div class="section-title" style="margin-top:18px;">${escapeHtml(cat)} <span class="hint">(${groups[cat].length})</span></div>
    <table><thead><tr>
      <th></th><th>Name</th><th>Barcode</th><th>Purchase price</th><th>Selling price</th><th>GST</th><th>Stock</th><th></th>
    </tr></thead><tbody>
      ${groups[cat].map(x => `<tr>
        <td>${x.image ? `<img src="${escapeHtml(x.image)}" style="width:36px;height:36px;object-fit:cover;border-radius:6px;">` : `<div style="width:36px;height:36px;border-radius:6px;background:var(--paper);display:flex;align-items:center;justify-content:center;font-size:14px;color:var(--muted);border:1px solid var(--line);">${escapeHtml((x.name || '?').charAt(0).toUpperCase())}</div>`}</td>
        <td>${escapeHtml(x.name)}${x.active === false ? ' <span class="pill">inactive</span>' : ''}</td>
        <td class="mono">${escapeHtml(x.barcode || '—')}</td>
        <td class="mono">${money(x.purchasePrice || 0)}</td>
        <td class="mono">${money(x.sellPrice)}</td>
        <td>${taxLabel(x.taxId)}</td>
        <td class="mono ${x.stock <= x.minStock ? 'warn' : ''}" style="color:${x.stock <= x.minStock ? 'var(--red)' : ''}">${x.stock} ${escapeHtml(x.unit)}</td>
        <td><button class="btn sm outline" onclick="openProductModal('${x.id}')">Edit</button></td>
      </tr>`).join('')}
    </tbody></table>`).join('');
}
function renderProductsTable() {
  const el = document.getElementById('products-table');
  if (el) el.innerHTML = productsTableHTML(S.cur.products);
}
function taxLabel(id) { const t = S.cur.taxrates.find(t => t.id === id); return t ? `${t.rate}%` : '—'; }
function openProductModal(id) {
  const existing = id ? S.cur.products.find(p => p.id === id) : {};
  const prevPrice = existing.sellPrice;
  const productInitial = id ? { ...existing, manualGstRate: existing.manualGstRate ?? ((S.cur.taxrates.find(t=>t.id===existing.taxId)||{}).rate || 0) } : { manualGstRate: 0 };
  openFormModal(id ? 'Edit product' : 'Add product', productFields(), async (vals) => {
    const manualRate = Number(vals.manualGstRate || 0);
    let tax = S.cur.taxrates.find(t => Number(t.rate) === manualRate);
    if (!tax) {
      tax = { id: uid('tax_'), name: `Manual GST ${manualRate}%`, rate: manualRate, mode: 'exclusive', active: true, isDefault: false, effectiveDate: todayISO() };
      S.cur.taxrates.push(tax);
      await saveCollection('taxrates');
    }
    vals.taxId = tax.id;
    vals.manualGstRate = manualRate;
    if (id) {
      Object.assign(existing, vals);
      if (prevPrice !== undefined && Number(prevPrice) !== Number(vals.sellPrice)) logAudit('Price changed', `${vals.name}: ${money(prevPrice)} → ${money(vals.sellPrice)}`);
      else logAudit('Product changed', vals.name);
    } else {
      vals.barcode = vals.barcode || generateProductBarcode();
      if (S.cur.products.some(p => p.barcode === vals.barcode)) { toast('A product with this barcode already exists.'); return; }
      S.cur.products.push({ id: uid('prod_'), active: true, ...vals });
      logAudit('Product created', `${vals.name} — Barcode ${vals.barcode}`);
    }
    await saveCollection('products');
    render();
    toast('Product saved.');
  }, productInitial, true);
}
function downloadTemplate() {
  const header = 'Product Name,Barcode,Category,Purchase Price,Selling Price,GST Rate,Unit,Opening Stock,Minimum Stock,Supplier\n';
  downloadBlob(header, 'nimbus-product-template.csv');
}
function downloadBlob(content, filename, mime) {
  const blob = new Blob([content], { type: mime || 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}
function handleImportFile(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async () => {
    const rows = String(reader.result).split(/\r?\n/).filter(r => r.trim());
    const header = rows.shift();
    let created = 0, updated = 0, errors = [];
    for (const [i, r] of rows.entries()) {
      const cols = r.split(',');
      if (cols.length < 5) { errors.push(`Row ${i + 2}: not enough columns`); continue; }
      const [name, barcode, category, purchasePrice, sellPrice, taxRate, unit, stock, minStock, supplier] = cols;
      if (!name) { errors.push(`Row ${i + 2}: missing product name`); continue; }
      const tax = S.cur.taxrates.find(t => Number(t.rate) === Number(taxRate)) || defaultTaxRate();
      const generatedBarcode = (barcode || '').trim() || generateProductBarcode();
      const existing = S.cur.products.find(p => p.barcode === generatedBarcode);
      const rec = {
        name: name.trim(), barcode: generatedBarcode, category: (category || '').trim(),
        purchasePrice: Number(purchasePrice) || 0, sellPrice: Number(sellPrice) || 0, taxId: tax ? tax.id : '',
        unit: (unit || 'pc').trim(), stock: Number(stock) || 0, minStock: Number(minStock) || 0, active: true
      };
      if (existing) { Object.assign(existing, rec); updated++; }
      else { S.cur.products.push({ id: uid('prod_'), ...rec }); created++; }
    }
    await saveCollection('products');
    document.getElementById('import-summary').innerHTML = `<div class="card" style="border-color:#BFE3D3;background:#F1FAF6;margin-bottom:12px;font-size:13px;">
      Import complete — ${created} created, ${updated} updated${errors.length ? `, ${errors.length} rows skipped` : ''}.
      ${errors.length ? `<ul style="margin:6px 0 0;">${errors.slice(0,5).map(x=>`<li>${escapeHtml(x)}</li>`).join('')}</ul>` : ''}
    </div>`;
    e.target.value = '';
    renderProductsTable();
  };
  reader.readAsText(file);
}
function exportCollectionCsv(name) {
  const rows = { products: S.cur.products, customers: S.cur.customers, suppliers: S.cur.suppliers, expenses: S.cur.expenses };
  const data = rows[name] || [];
  if (!data.length) { toast('Nothing to export yet.'); return; }
  const keys = Object.keys(data[0]);
  const csv = [keys.join(','), ...data.map(r => keys.map(k => JSON.stringify(r[k] ?? '')).join(','))].join('\n');
  downloadBlob(csv, `${name}.csv`);
}

/* ============================================================
   INVENTORY
   ============================================================ */
function screenInventory() {
  const moves = [...S.cur.inventory].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 100);
  const in30 = new Date(); in30.setDate(in30.getDate() + 30);
  const expiring = S.cur.products.filter(p => p.expiryDate && p.active !== false && new Date(p.expiryDate) <= in30).sort((a,b)=>a.expiryDate.localeCompare(b.expiryDate));
  return `
  <div class="row between" style="margin-bottom:14px;">
    <div></div>
    <button class="btn primary" onclick="openStockModal()">+ Stock in / adjust</button>
  </div>
  ${expiring.length ? `
  <div class="section-title">Expiring soon (within 30 days)</div>
  <div class="table-wrap"><table><thead><tr><th>Product</th><th>Batch</th><th>Expiry date</th><th>Stock</th></tr></thead><tbody>
    ${expiring.map(p => `<tr><td>${escapeHtml(p.name)}</td><td class="mono">${escapeHtml(p.batchNo||'—')}</td>
      <td class="mono" style="color:${new Date(p.expiryDate) < new Date() ? 'var(--red)' : 'var(--amber)'}">${fmtDate(p.expiryDate)}${new Date(p.expiryDate) < new Date() ? ' (expired)' : ''}</td>
      <td class="mono">${p.stock} ${escapeHtml(p.unit)}</td></tr>`).join('')}
  </tbody></table></div>` : ''}
  <div class="section-title">Current stock</div>
  <div class="table-wrap"><table><thead><tr><th>Product</th><th>Stock</th><th>Min</th><th>Batch</th><th>Expiry</th><th>Status</th></tr></thead><tbody>
    ${S.cur.products.map(p => `<tr><td>${escapeHtml(p.name)}</td><td class="mono">${p.stock} ${escapeHtml(p.unit)}</td><td class="mono">${p.minStock}</td>
      <td class="mono">${escapeHtml(p.batchNo||'—')}</td><td class="mono">${p.expiryDate ? fmtDate(p.expiryDate) : '—'}</td>
      <td>${p.stock <= 0 ? '<span class="pill status-Refunded">Out of stock</span>' : p.stock <= p.minStock ? '<span class="pill status-Partially">Low stock</span>' : '<span class="pill status-Completed">OK</span>'}</td></tr>`).join('') || `<tr><td colspan="6" class="empty-state">No products yet.</td></tr>`}
  </tbody></table></div>

  <div class="section-title">Stock movement history</div>
  <div class="table-wrap"><table><thead><tr><th>Date</th><th>Product</th><th>Type</th><th>Qty</th><th>Note</th></tr></thead><tbody>
    ${moves.length ? moves.map(m => `<tr><td>${fmtDate(m.at)}</td><td>${escapeHtml(productName(m.productId))}</td><td>${m.type}</td><td class="mono">${m.qty > 0 ? '+' : ''}${m.qty}</td><td>${escapeHtml(m.note || '')}</td></tr>`).join('') : `<tr><td colspan="5" class="empty-state">No stock movements recorded yet.</td></tr>`}
  </tbody></table></div>
  `;
}
function productName(id) { const p = S.cur.products.find(p => p.id === id); return p ? p.name : '—'; }
function openStockModal() {
  const opts = S.cur.products.map(p => [p.id, p.name]);
  openFormModal('Stock in / adjustment', [
    { name: 'productId', label: 'Product', type: 'select', options: opts.length ? opts : [['', 'Add a product first']] },
    { name: 'type', label: 'Movement type', type: 'select', options: ['Stock In', 'Stock Out', 'Adjustment', 'Purchase', 'Transfer'] },
    { name: 'qty', label: 'Quantity (use negative for stock out)', type: 'number' },
    { name: 'batchNo', label: 'Batch number (Stock In / Purchase — updates product record)', required: false },
    { name: 'expiryDate', label: 'Expiry date (Stock In / Purchase — updates product record)', type: 'date', required: false },
    { name: 'note', label: 'Note', required: false },
  ], async (vals) => {
    const prod = S.cur.products.find(p => p.id === vals.productId);
    if (!prod) { toast('Select a product.'); return; }
    prod.stock = Math.max(0, prod.stock + Number(vals.qty));
    if (['Stock In', 'Purchase'].includes(vals.type)) {
      if (vals.batchNo) prod.batchNo = vals.batchNo;
      if (vals.expiryDate) prod.expiryDate = vals.expiryDate;
    }
    S.cur.inventory.push({ id: uid('mv_'), productId: vals.productId, type: vals.type, qty: Number(vals.qty), note: vals.note, at: new Date().toISOString() });
    logAudit('Inventory adjustment', `${prod.name}: ${vals.type} ${vals.qty}`);
    await Promise.all([saveCollection('products'), saveCollection('inventory')]);
    render(); toast('Inventory updated.');
  });
}

/* ============================================================
   POS
   ============================================================ */
function ensurePosState() {
  if (!S.ui.cart) S.ui.cart = [];
  if (!S.ui.charges) S.ui.charges = 0;
  if (!S.ui.payLines) S.ui.payLines = [];
  if (!S.ui.orderType) S.ui.orderType = S.cur.business.type === 'Restaurant' ? 'Dine-in' : 'Walk-in';
  if (!S.ui.posQ) S.ui.posQ = '';
}
function readyKitchenOrders() {
  return (S.cur.orders || []).filter(o => o.status === 'Ready' || o.status === 'Served');
}
function screenPos() {
  ensurePosState();
  const cart = S.ui.cart;
  const totals = cartTotals(cart, true);
  const adj = computeBillAdjust(cart);
  const low = lowStockItems();
  const charges = Number(S.ui.charges) || 0;
  const grandTotal = round2(totals.total + charges);
  const paid = S.ui.payLines.filter(p => p.method !== 'Credit').reduce((s, p) => s + Number(p.amount), 0);
  const credit = S.ui.payLines.filter(p => p.method === 'Credit').reduce((s, p) => s + Number(p.amount), 0);
  const allocated = round2(paid + credit);
  const remaining = round2(grandTotal - allocated);
  const readyOrders = readyKitchenOrders();
  const bd = S.ui.billDiscount || { type: 'percent', value: 0 };
  return `
  ${low.length ? `<div class="alert-banner">⚠ <b>${low.length} item(s) low on stock:</b> ${low.slice(0, 6).map(p => `${escapeHtml(p.name)} (${p.stock} ${escapeHtml(p.unit || '')})`).join(', ')}${low.length > 6 ? ` and ${low.length - 6} more` : ''} <button class="link-btn" onclick="go('inventory')">View inventory →</button></div>` : ''}
  <div class="grid cols-2" style="align-items:flex-start;grid-template-columns:1.3fr 1fr;">
    <div>
      <div class="row" style="margin-bottom:12px;gap:8px;">
        <input id="scan-input" placeholder="Scan or type barcode, press Enter…" style="flex:1;" autofocus
          onkeydown="if(event.key==='Enter'){event.preventDefault();scanAdd(this.value);this.value='';}">
        <input id="pos-search" placeholder="Search products… (Enter adds a single match)" style="flex:1;" value="${escapeHtml(S.ui.posQ||'')}" oninput="S.ui.posQ=this.value;renderPosProductsTable()"
          onkeydown="if(event.key==='Enter'){event.preventDefault();searchEnter();}">
      </div>
      ${S.cur.business.type === 'Restaurant' ? `
      <div class="card" style="margin-bottom:12px;">
        <div class="row between"><b style="font-size:13px;">Bill a kitchen order</b><button class="link-btn" onclick="go('orders')">Manage kitchen orders →</button></div>
        <select style="margin-top:8px;" onchange="loadKitchenOrderIntoCart(this.value)">
          <option value="">Ad-hoc sale (no kitchen order)</option>
          ${readyOrders.map(o => `<option value="${o.id}">${o.orderType}${o.table?(' — Table '+o.table):''} · ${o.items.length} item(s) · ${o.status}</option>`).join('')}
        </select>
      </div>` : ''}
      ${S.cur.heldOrders && S.cur.heldOrders.length ? `
      <div class="card" style="margin-bottom:12px;">
        <div class="row between"><b style="font-size:13px;">Held orders (${S.cur.heldOrders.length})</b></div>
        ${S.cur.heldOrders.map(h => `<div class="row between" style="margin-top:6px;font-size:12.5px;">
          <span>${escapeHtml(h.label)} · ${h.cart.length} item(s) · ${money(cartTotals(h.cart).total)}</span>
          <span><button class="btn sm outline" onclick="resumeHeldOrder('${h.id}')">Resume</button> <button class="btn sm danger" onclick="deleteHeldOrder('${h.id}')">Delete</button></span>
        </div>`).join('')}
      </div>` : ''}
      <div class="table-wrap" id="pos-products-table">${posProductsTableHTML()}</div>
    </div>
    <div class="card">
      <div class="section-title" style="margin-top:0;">${t('Billing')}</div>
      ${cart.length ? `<table><thead><tr><th>Item</th><th>Qty</th><th>Disc</th><th>Total</th><th></th></tr></thead><tbody>
        ${cart.map((c, idx) => `<tr>
          <td>${escapeHtml(c.name)}</td>
          <td><div class="row" style="gap:4px;align-items:center;flex-wrap:nowrap;">
            <button class="btn sm outline" style="padding:2px 8px;" onclick="stepCartQty(${idx},-1)">−</button>
            <input type="number" min="1" value="${c.qty}" style="width:44px;text-align:center;" onchange="setCartQty(${idx},this.value)">
            <button class="btn sm outline" style="padding:2px 8px;" onclick="stepCartQty(${idx},1)">+</button>
          </div></td>
          <td><input type="number" min="0" value="${c.discount}" style="width:56px;" onchange="setCartDiscount(${idx},this.value)"></td>
          <td class="mono">${money(lineTotal(c))}</td>
          <td><button class="btn sm danger" onclick="removeCartLine(${idx})">✕</button></td>
        </tr>`).join('')}</tbody></table>` : `<div class="empty-state">Cart is empty.</div>`}
      <hr style="border:none;border-top:1px solid var(--line);margin:12px 0;">
      <div class="row between mono" style="font-size:13px;"><span>${t('Subtotal')}</span><span>${money(cart.reduce((s,c)=>s+c.price*c.qty,0))}</span></div>
      <div class="row between mono" style="font-size:13px;"><span>Item discounts</span><span>${money(cart.reduce((s,c)=>s+Number(c.discount||0),0))}</span></div>
      ${adj.tierAmt > 0 ? `<div class="row between mono" style="font-size:13px;color:var(--teal-dark);"><span>${escapeHtml(adj.custType)} pricing (${adj.tierPct}%)</span><span>− ${money(adj.tierAmt)}</span></div>` : ''}
      <div class="row between" style="font-size:13px;align-items:center;gap:6px;"><span>${t('Discount')}</span>
        <span class="row" style="gap:4px;flex-wrap:nowrap;">
          <select style="width:64px;" onchange="setBillDiscount('type',this.value)"><option value="percent" ${bd.type==='percent'?'selected':''}>%</option><option value="amount" ${bd.type==='amount'?'selected':''}>Nu.</option></select>
          <input type="number" min="0" step="0.01" value="${bd.value || 0}" style="width:70px;" onchange="setBillDiscount('value',this.value)">
        </span></div>
      ${adj.manualAmt > 0 ? `<div class="row between mono" style="font-size:12px;color:var(--teal-dark);"><span>Bill discount applied</span><span>− ${money(adj.manualAmt)}</span></div>` : ''}
      <div class="row between mono" style="font-size:13px;"><span>Taxable amount</span><span>${money(totals.taxable)}</span></div>
      <div class="row between mono" style="font-size:13px;"><span>GST</span><span>${money(totals.tax)}</span></div>
      <div class="row between" style="font-size:13px;align-items:center;"><span>Charges</span><input type="number" min="0" step="0.01" value="${charges}" style="width:90px;" onchange="S.ui.charges=Number(this.value)||0;render()"></div>
      <div class="row between" style="font-weight:800;font-size:17px;margin-top:4px;"><span>${t('Grand total')}</span><span class="mono">${money(grandTotal)}</span></div>

      <div class="field" style="margin-top:14px;"><label>Order type</label>
        <div class="row" style="gap:8px;">
          <select style="flex:1;" onchange="S.ui.orderType=this.value;render()">
            ${(S.cur.business.type === 'Restaurant' ? ['Dine-in','Takeaway','Delivery','Pre-ordered','Walk-in'] : ['Walk-in','Pre-ordered','Pre-booked','Take out']).map(v => `<option value="${v}" ${S.ui.orderType===v?'selected':''}>${v}</option>`).join('')}
          </select>
          ${S.cur.business.type === 'Restaurant' && S.ui.orderType === 'Dine-in' ? `<input placeholder="Table #" value="${escapeHtml(S.ui.tableNo || '')}" style="width:85px;" oninput="S.ui.tableNo=this.value">` : ''}
        </div>
      </div>

      <div class="field" style="margin-top:14px;"><label>${t('Customer')}</label>
        <select id="pos-customer" onchange="S.ui.customerId=this.value;render()">
          <option value="">Walk-in</option>${S.cur.customers.filter(c=>c.active!==false).map(c=>`<option value="${c.id}" ${S.ui.customerId===c.id?'selected':''}>${escapeHtml(c.name)} · ${escapeHtml(c.phone)}</option>`).join('')}
        </select>
      </div>

      <div class="section-title" style="font-size:13px;">Payments <span class="hint"><button class="link-btn" onclick="openAddPaymentLine()">+ Add payment</button></span></div>
      ${S.ui.payLines.length ? `<table><thead><tr><th>Method</th><th>Amount</th><th>Detail</th><th></th></tr></thead><tbody>
        ${S.ui.payLines.map((p, idx) => `<tr><td>${p.method}</td><td class="mono">${money(p.amount)}</td>
          <td style="font-size:11.5px;color:var(--muted);">${(p.method==='Bank' || isMobileWallet(p.method)) ? escapeHtml(p.bankName||'')+(p.journalNo?(' · '+escapeHtml(p.journalNo)):'') : p.changeGiven ? `Cash received ${money(Number(p.cashReceived)||0)} · Change ${money(p.changeGiven)}` : escapeHtml(p.remarks||'')}</td>
          <td><button class="btn sm danger" onclick="removePayLine(${idx})">✕</button></td></tr>`).join('')}
      </tbody></table>` : `<div class="empty-state" style="padding:14px;">No payment lines added yet.</div>`}
      <div class="row between mono" style="font-size:12.5px;margin-top:8px;"><span>Paid (cash/bank)</span><span>${money(paid)}</span></div>
      ${credit>0 ? `<div class="row between mono" style="font-size:12.5px;"><span>Credit / outstanding</span><span>${money(credit)}</span></div>` : ''}
      <div class="row between" style="font-weight:700;font-size:13.5px;color:${remaining===0?'var(--teal-dark)':'var(--red)'};margin-top:2px;"><span>${remaining>0?'Balance due':remaining<0?'Overpaid':'Balance'}</span><span class="mono">${money(Math.abs(remaining))}</span></div>

      ${S.cur.business.type === 'Restaurant' && !S.ui.activeOrderId ? `
        <button class="btn outline" style="width:100%;justify-content:center;margin-top:10px;" ${cart.length?'':'disabled'} onclick="openSendToKitchenModal()">Send to kitchen (no bill yet)</button>` : ''}
      <div class="row" style="gap:8px;margin-top:8px;">
        <button class="btn outline" style="flex:1;justify-content:center;" ${cart.length?'':'disabled'} onclick="holdOrder()">Hold order</button>
        <button class="btn danger" style="flex:1;justify-content:center;" ${cart.length||S.ui.payLines.length?'':'disabled'} onclick="cancelOrder()">Cancel order</button>
      </div>
      <button class="btn primary" style="width:100%;justify-content:center;margin-top:8px;" ${cart.length && remaining===0 ? '' : 'disabled'} onclick="completeSale()">Complete sale</button>
      ${cart.length && remaining!==0 ? `<div style="font-size:11.5px;color:var(--muted);margin-top:6px;">Payments must add up exactly to the grand total before completing the sale.</div>` : ''}
    </div>
  </div>`;
}
function posProductsTableHTML() {
  const q = (S.ui.posQ || '').toLowerCase();
  const list = S.cur.products.filter(p => p.active !== false && (!q || (p.name + ' ' + (p.barcode || '') + ' ' + (p.category || '')).toLowerCase().includes(q)));
  return `<table><thead><tr><th>Product</th><th>Barcode</th><th>Price</th><th>Stock</th><th></th></tr></thead><tbody>
    ${list.map(p => `<tr>
      <td>${escapeHtml(p.name)}</td><td class="mono">${escapeHtml(p.barcode||'—')}</td>
      <td class="mono">${money(p.sellPrice)}</td><td class="mono" style="${p.stock<=Number(p.minStock||0)?'color:var(--red);font-weight:700;':''}">${p.stock}${p.stock<=Number(p.minStock||0)?' ⚠':''}</td>
      <td><button class="btn sm outline" ${p.stock<=0?'disabled':''} onclick="addToCart('${p.id}')">Add</button></td>
    </tr>`).join('') || `<tr><td colspan="5" class="empty-state">${q ? 'No products match your search.' : 'No products yet — add products first.'}</td></tr>`}
  </tbody></table>`;
}
function renderPosProductsTable() {
  const el = document.getElementById('pos-products-table');
  if (el) el.innerHTML = posProductsTableHTML();
}
function openSendToKitchenModal() {
  openFormModal('Send order to kitchen', [
    { name: 'orderType', label: 'Order type', type: 'select', options: ['Dine-in', 'Takeaway', 'Delivery', 'Pre-order'], default: S.ui.orderType || 'Dine-in' },
    { name: 'table', label: 'Table number (dine-in)', required: false },
    { name: 'note', label: 'Kitchen note', type: 'textarea', required: false },
  ], async (v) => {
    const order = {
      id: uid('ord_'), orderNo: 'KOT-' + pad((S.cur.orders.length + 1), 4),
      orderType: v.orderType, table: v.table, note: v.note, status: 'New', billed: false,
      customerId: S.ui.customerId || null, createdBy: S.session.employee.name || S.session.employee.username,
      items: S.ui.cart.map(c => ({ productId: c.productId, name: c.name, qty: c.qty })),
      createdAt: new Date().toISOString()
    };
    S.cur.orders.push(order);
    await saveCollection('orders');
    logAudit('Kitchen order created', `${order.orderNo} — ${order.orderType}${order.table?(' Table '+order.table):''}`);
    S.ui.cart = []; S.ui.payLines = []; S.ui.charges = 0; S.ui.billDiscount = null;
    go('orders');
    toast(`${order.orderNo} sent to kitchen.`);
  });
}

/* ============================================================
   RESTAURANT — KITCHEN ORDERS BOARD
   ============================================================ */
function screenOrders() {
  const orders = [...S.cur.orders].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const groups = KITCHEN_STATUSES.map(st => ({ st, list: orders.filter(o => o.status === st) }));
  return `
  <div class="grid" style="grid-template-columns:repeat(6,1fr);gap:12px;">
    ${groups.map(g => `
    <div>
      <div style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.04em;color:var(--muted);margin-bottom:8px;">${g.st} (${g.list.length})</div>
      ${g.list.length ? g.list.map(o => `
        <div class="card" style="margin-bottom:10px;padding:12px;">
          <div class="row between"><b style="font-size:12.5px;">${o.orderNo}</b><span class="pill">${o.orderType}${o.table?(' · T'+escapeHtml(o.table)):''}</span></div>
          <div style="font-size:12px;color:var(--muted);margin:6px 0;">${o.items.map(i=>`${i.qty}× ${escapeHtml(i.name)}`).join('<br>')}</div>
          ${o.note ? `<div style="font-size:11px;color:var(--amber);">${escapeHtml(o.note)}</div>` : ''}
          <div class="row wrap" style="margin-top:8px;gap:6px;">
            ${nextKitchenAction(o)}
          </div>
        </div>`).join('') : `<div class="empty-state" style="padding:14px;font-size:12px;">—</div>`}
    </div>`).join('')}
  </div>`;
}
function nextKitchenAction(o) {
  const idx = KITCHEN_STATUSES.indexOf(o.status);
  const btns = [];
  if (o.status !== 'Served' && o.status !== 'Cancelled') {
    const next = KITCHEN_STATUSES[idx + 1];
    if (next && next !== 'Cancelled') btns.push(`<button class="btn sm outline" onclick="setOrderStatus('${o.id}','${next}')">→ ${next}</button>`);
    btns.push(`<button class="btn sm danger" onclick="setOrderStatus('${o.id}','Cancelled')">Cancel</button>`);
  }
  if ((o.status === 'Ready' || o.status === 'Served') && !o.billed) {
    btns.push(`<button class="btn sm primary" onclick="go('pos');loadKitchenOrderIntoCart('${o.id}')">Bill this order</button>`);
  }
  return btns.join('');
}
async function setOrderStatus(id, status) {
  const o = S.cur.orders.find(o => o.id === id);
  if (!o) return;
  o.status = status;
  await saveCollection('orders');
  logAudit('Kitchen order status changed', `${o.orderNo} → ${status}`);
  render();
}

/* ============================================================
   PAYMENTS REPORT
   ============================================================ */
function screenPayments() {
  ensureGstFilter();
  const all = (S.cur.payments || []).filter(p => {
    const at = new Date(`${p.date}T${p.time}:00`);
    const from = new Date(`${S.ui.from}T${S.ui.fromTime}:00`);
    const to = new Date(`${S.ui.to}T${S.ui.toTime}:59`);
    return at >= from && at <= to;
  });
  const byMethod = {};
  all.forEach(p => { byMethod[p.method] = byMethod[p.method] || { amount: 0, count: 0, charges: 0 }; byMethod[p.method].amount += Number(p.amount); byMethod[p.method].count++; byMethod[p.method].charges += Number(p.charges || 0); });
  return `
  <div class="card" style="margin-bottom:16px;">
    <div class="row wrap">
      ${['today','yesterday','week','month','year'].map(k => `<button class="btn sm outline" onclick="quickRange('${k}')">${k[0].toUpperCase()+k.slice(1)}</button>`).join('')}
      <div class="field" style="margin:0;"><label>From</label><input type="date" value="${S.ui.from}" onchange="S.ui.from=this.value;render()"></div>
      <div class="field" style="margin:0;"><label>To</label><input type="date" value="${S.ui.to}" onchange="S.ui.to=this.value;render()"></div>
    </div>
  </div>
  <div class="grid cols-4">
    ${PAYMENT_METHOD_TYPES.map(m => `<div class="card kpi"><div class="label">${m}</div><div class="value">${money((byMethod[m]||{amount:0}).amount)}</div></div>`).join('')}
  </div>
  <div class="section-title">Payment records <span class="hint"><button class="link-btn" onclick="exportPaymentsCsv()">Export CSV</button></span></div>
  <div class="table-wrap"><table><thead><tr><th>Date</th><th>Invoice</th><th>Method</th><th>Amount</th><th>Bank / Journal</th><th>Remarks</th><th>By</th></tr></thead><tbody>
    ${all.length ? all.slice().sort((a,b)=>b.date.localeCompare(a.date)).map(p => `<tr><td>${fmtDate(p.date)} ${p.time}</td><td class="mono">${p.invoiceId}</td><td>${p.method}</td><td class="mono">${money(p.amount)}</td>
      <td style="font-size:11.5px;">${p.bankName ? escapeHtml(p.bankName) : ''}${p.journalNo ? ' · '+escapeHtml(p.journalNo) : ''}</td><td style="font-size:11.5px;">${escapeHtml(p.remarks||'')}</td><td>${escapeHtml(p.createdBy)}</td></tr>`).join('') : `<tr><td colspan="7" class="empty-state">No payments in this range.</td></tr>`}
  </tbody></table></div>`;
}
function exportPaymentsCsv() {
  const all = S.cur.payments || [];
  const csv = 'Date,Time,Invoice,Method,Amount,Charges,Bank,JournalNo,Remarks,CreatedBy\n' +
    all.map(p => [p.date,p.time,p.invoiceId,p.method,p.amount,p.charges,p.bankName,p.journalNo,p.remarks,p.createdBy].map(x=>JSON.stringify(x??'')).join(',')).join('\n');
  downloadBlob(csv, `payments-${S.ui.from}_to_${S.ui.to}.csv`);
}

/* ============================================================
   AUDIT LOG
   ============================================================ */
function logAudit(action, detail) {
  if (!S.cur.auditLogs) S.cur.auditLogs = [];
  S.cur.auditLogs.push({ id: uid('log_'), at: new Date().toISOString(), by: S.session ? (S.session.employee.name || S.session.employee.username) : 'system', action, detail });
  saveCollection('auditLogs');
}
function screenAudit() {
  const logs = [...(S.cur.auditLogs || [])].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 200);
  return `<div class="table-wrap"><table><thead><tr><th>When</th><th>By</th><th>Action</th><th>Detail</th></tr></thead><tbody>
    ${logs.length ? logs.map(l => `<tr><td class="mono" style="font-size:11.5px;">${new Date(l.at).toLocaleString('en-GB')}</td><td>${escapeHtml(l.by)}</td><td>${escapeHtml(l.action)}</td><td style="font-size:12.5px;color:var(--muted);">${escapeHtml(l.detail||'')}</td></tr>`).join('') : `<tr><td colspan="4" class="empty-state">No activity recorded yet.</td></tr>`}
  </tbody></table></div>`;
}
function openAddPaymentLine() {
  const remaining = round2(cartTotals(S.ui.cart, true).total + (Number(S.ui.charges)||0) - S.ui.payLines.reduce((s,p)=>s+Number(p.amount),0));
  openFormModal('Add payment', [
    { name: 'method', label: 'Payment method', type: 'select', options: PAYMENT_METHOD_TYPES },
    { name: 'amount', label: 'Amount (owed for this line)', type: 'number', step: '0.01', default: remaining > 0 ? remaining : 0 },
    { name: 'cashReceived', label: 'Cash received from customer (Cash only — leave blank for exact amount)', type: 'number', step: '0.01', required: false },
    { name: 'chargesFee', label: 'Charges (cash handling fee, if any)', type: 'number', step: '0.01', required: false },
    { name: 'bankName', label: 'Bank name (bank payments only, e.g. Bank of Bhutan)', required: false },
    { name: 'journalNo', label: 'Journal No. / Transaction ID (bank & mobile wallet payments — mBoB, mPay, DK Bank, TPay)', required: false },
    { name: 'remarks', label: 'Remarks', type: 'textarea', required: false },
  ], (v) => {
    if (v.method === 'Credit' && !S.ui.customerId) { toast('Select a customer before adding a credit payment.'); return; }
    const amount = Number(v.amount) || 0;
    let changeGiven = 0;
    if (v.method === 'Cash' && v.cashReceived) {
      const received = Number(v.cashReceived) || 0;
      changeGiven = round2(received - amount);
      if (changeGiven < 0) { toast('Cash received is less than the amount owed.'); return; }
    }
    S.ui.payLines.push({ ...v, amount, changeGiven });
    render();
    if (changeGiven > 0) toast(`Change to return: ${money(changeGiven)}`);
  }, {}, true);
}
function removePayLine(idx) { S.ui.payLines.splice(idx, 1); render(); }
function loadKitchenOrderIntoCart(orderId) {
  if (!orderId) return;
  const o = S.cur.orders.find(o => o.id === orderId);
  if (!o) return;
  S.ui.cart = o.items.map(i => {
    const p = S.cur.products.find(p => p.id === i.productId);
    const tax = p ? S.cur.taxrates.find(t => t.id === p.taxId) : null;
    return { productId: i.productId, name: i.name, price: p ? p.sellPrice : 0, qty: i.qty, discount: 0, taxRate: tax ? tax.rate : 0, inclusive: tax ? tax.mode === 'inclusive' : false };
  });
  S.ui.activeOrderId = orderId;
  if (o.customerId) S.ui.customerId = o.customerId;
  render();
}
function lineTotal(c) {
  const r = computeLineTax(c.price, c.qty, c.discount, c.taxRate, c.inclusive);
  return r.total;
}
// Customer-type pricing + optional bill-level discount are spread across the cart lines
// (proportionally) so GST is always calculated on the discounted amount.
function computeBillAdjust(cart) {
  const base = round2(cart.reduce((s, c) => s + Math.max(0, c.price * c.qty - Number(c.discount || 0)), 0));
  const cust = (S.cur.customers || []).find(c => c.id === S.ui.customerId);
  const tierPct = cust ? Number((S.cur.pricing || {})[cust.type] || 0) : 0;
  const tierAmt = round2(base * tierPct / 100);
  const bd = S.ui.billDiscount || { type: 'percent', value: 0 };
  const remain = Math.max(0, base - tierAmt);
  let manualAmt = bd.type === 'percent' ? remain * Math.min(100, Number(bd.value) || 0) / 100 : Math.min(remain, Number(bd.value) || 0);
  manualAmt = round2(Math.max(0, manualAmt));
  return { base, tierPct, tierAmt, manualAmt, extra: round2(tierAmt + manualAmt), custType: cust ? cust.type : '', manualType: bd.type, manualValue: Number(bd.value) || 0 };
}
function effectiveCart(cart) {
  const adj = computeBillAdjust(cart);
  if (!adj.extra || !cart.length || !adj.base) return { lines: cart, adj };
  let allocated = 0;
  const lines = cart.map((c, i) => {
    const gross = Math.max(0, c.price * c.qty - Number(c.discount || 0));
    let share = i === cart.length - 1 ? round2(adj.extra - allocated) : round2(adj.extra * gross / adj.base);
    share = Math.max(0, Math.min(share, gross));
    allocated = round2(allocated + share);
    return { ...c, discount: round2(Number(c.discount || 0) + share) };
  });
  return { lines, adj };
}
function setBillDiscount(field, v) {
  const bd = S.ui.billDiscount || { type: 'percent', value: 0 };
  bd[field] = field === 'value' ? Math.max(0, Number(v) || 0) : v;
  S.ui.billDiscount = bd; render();
}
function setTierPct(type, v) {
  S.cur.pricing = S.cur.pricing || {};
  S.cur.pricing[type] = Math.min(100, Math.max(0, Number(v) || 0));
  saveCollection('pricing'); toast(`${type}: ${S.cur.pricing[type]}% automatic discount saved.`);
}
function cartTotals(cart, withBill) {
  if (withBill) cart = effectiveCart(cart).lines;
  let taxable = 0, tax = 0, total = 0;
  cart.forEach(c => { const r = computeLineTax(c.price, c.qty, c.discount, c.taxRate, c.inclusive); taxable += r.taxable; tax += r.tax; total += r.total; });
  return { taxable: round2(taxable), tax: round2(tax), total: round2(total) };
}
function scanAdd(value) {
  const v = value.trim().toLowerCase();
  if (!v) return;
  const p = S.cur.products.find(p => String(p.barcode || '').toLowerCase() === v || p.name.toLowerCase() === v);
  if (!p) { toast('No product matches "' + value + '".'); return; }
  addToCart(p.id);
}
// Enter in the product search box: exact barcode/name match, or the only remaining result, goes to the cart.
function searchEnter() {
  const q = (S.ui.posQ || '').trim().toLowerCase();
  if (!q) return;
  const active = S.cur.products.filter(p => p.active !== false);
  let hit = active.find(p => String(p.barcode || '').toLowerCase() === q || p.name.toLowerCase() === q);
  if (!hit) {
    const matches = active.filter(p => (p.name + ' ' + (p.barcode || '') + ' ' + (p.category || '')).toLowerCase().includes(q));
    if (matches.length === 1) hit = matches[0];
    else { toast(matches.length ? `${matches.length} products match — refine the search or click Add.` : 'No product matches.'); return; }
  }
  S.ui.posQ = '';
  addToCart(hit.id);
}
function addToCart(productId) {
  ensurePosState();
  const p = S.cur.products.find(p => p.id === productId);
  if (!p) return;
  if (productTracksStock(p) && p.stock <= 0) { toast('Out of stock.'); return; }
  const tax = S.cur.taxrates.find(t => t.id === p.taxId);
  const existing = S.ui.cart.find(c => c.productId === productId);
  if (existing) existing.qty += 1;
  else S.ui.cart.push({ productId, name: p.name, price: p.sellPrice, qty: 1, discount: 0, taxRate: tax ? tax.rate : 0, inclusive: tax ? tax.mode === 'inclusive' : false });
  render();
}
function setCartQty(idx, v) { S.ui.cart[idx].qty = Math.max(1, Number(v)); render(); }
function stepCartQty(idx, delta) { S.ui.cart[idx].qty = Math.max(1, (Number(S.ui.cart[idx].qty)||1) + delta); render(); }
function setCartDiscount(idx, v) { S.ui.cart[idx].discount = Math.max(0, Number(v)); render(); }
function removeCartLine(idx) { S.ui.cart.splice(idx, 1); render(); }

function holdOrder() {
  if (!S.ui.cart.length) return;
  if (!S.cur.heldOrders) S.cur.heldOrders = [];
  S.cur.heldOrders.push({
    id: uid('hold_'), label: `Held ${new Date().toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})}`,
    cart: S.ui.cart, payLines: S.ui.payLines, charges: S.ui.charges, orderType: S.ui.orderType, customerId: S.ui.customerId || null
  });
  saveCollection('heldOrders');
  logAudit('Order held', `${S.ui.cart.length} item(s) parked`);
  S.ui.cart = []; S.ui.payLines = []; S.ui.charges = 0; S.ui.billDiscount = null; S.ui.customerId = null;
  render(); toast('Order held. Resume it any time from the POS screen.');
}
function resumeHeldOrder(id) {
  const h = (S.cur.heldOrders || []).find(h => h.id === id);
  if (!h) return;
  S.ui.cart = h.cart; S.ui.payLines = h.payLines; S.ui.charges = h.charges; S.ui.orderType = h.orderType; S.ui.customerId = h.customerId;
  S.cur.heldOrders = S.cur.heldOrders.filter(x => x.id !== id);
  saveCollection('heldOrders');
  render(); toast('Held order resumed.');
}
function deleteHeldOrder(id) {
  S.cur.heldOrders = (S.cur.heldOrders || []).filter(x => x.id !== id);
  saveCollection('heldOrders');
  render();
}
function cancelOrder() {
  if (!S.ui.cart.length && !S.ui.payLines.length) return;
  logAudit('Order cancelled at POS', `${S.ui.cart.length} item(s) cleared`);
  S.ui.cart = []; S.ui.payLines = []; S.ui.charges = 0; S.ui.billDiscount = null; S.ui.activeOrderId = null;
  render(); toast('Order cancelled.');
}

async function completeSale() {
  const cart = S.ui.cart;
  if (!cart.length) return;
  const charges = round2(Number(S.ui.charges) || 0);
  const eff = effectiveCart(cart);
  const totals = cartTotals(cart, true);
  const grandTotal = round2(totals.total + charges);
  const payLines = S.ui.payLines || [];
  const paid = round2(payLines.filter(p => p.method !== 'Credit').reduce((s, p) => s + Number(p.amount), 0));
  const creditAmount = round2(payLines.filter(p => p.method === 'Credit').reduce((s, p) => s + Number(p.amount), 0));
  const allocated = round2(paid + creditAmount);
  if (!payLines.length || allocated !== grandTotal) { toast('Payments must add up exactly to the grand total.'); return; }
  for (const c of cart) {
    const p = S.cur.products.find(p => p.id === c.productId);
    if (!p) { toast(`Product ${c.name} no longer exists.`); return; }
    if (productTracksStock(p) && p.stock < c.qty) { toast(`Not enough stock for ${c.name}. Available: ${p.stock}`); return; }
  }
  const customerId = S.ui.customerId || (document.getElementById('pos-customer') || {}).value || null;
  if (creditAmount > 0 && !customerId) { toast('Select a customer for a credit sale.'); return; }
  let creditWarning = '';
  if (creditAmount > 0 && customerId) {
    const cu = S.cur.customers.find(c => c.id === customerId);
    if (cu && cu.creditLimit && (cu.outstandingBalance || 0) + creditAmount > cu.creditLimit) {
      creditWarning = `Note: this sale pushes ${cu.name} over their credit limit of ${money(cu.creditLimit)}.`;
    }
  }
  S.cur.counters.invoice = (S.cur.counters.invoice || 0) + 1;
  const invoiceNo = `INV-${new Date().getFullYear()}-${pad(S.cur.counters.invoice, 5)}`;
  const cashier = S.session.employee.name || S.session.employee.username;
  const date = todayISO(), time = nowTime(), now = new Date().toISOString();
  const txnId = uid('txn_');

  const paymentRecords = payLines.map(p => ({
    id: uid('pay_'), invoiceId: invoiceNo, txnId, businessId: S.cur.business.businessId,
    customerId, method: p.method, amount: Number(p.amount), charges: Number(p.chargesFee) || 0,
    bankName: p.bankName || '', journalNo: p.journalNo || '', remarks: p.remarks || '',
    date, time, createdBy: cashier, status: 'Completed'
  }));

  const txn = {
    id: txnId, invoiceNo, date, time, createdAt: now,
    cashier, customerId, orderType: S.ui.orderType || '', tableNo: S.ui.tableNo || '',
    items: eff.lines.map(c => ({ ...c, ...computeLineTax(c.price, c.qty, c.discount, c.taxRate, c.inclusive) })),
    subtotal: round2(cart.reduce((s, c) => s + c.price * c.qty, 0)),
    discountTotal: round2(eff.lines.reduce((s, c) => s + Number(c.discount || 0), 0)),
    billAdjust: { custType: eff.adj.custType, tierPct: eff.adj.tierPct, tierAmt: eff.adj.tierAmt, manualType: eff.adj.manualType, manualValue: eff.adj.manualValue, manualAmt: eff.adj.manualAmt },
    taxableAmount: totals.taxable, taxAmount: totals.tax, charges, total: grandTotal,
    payments: payLines.map(p => ({ method: p.method, amount: Number(p.amount), bankName: p.bankName || '', journalNo: p.journalNo || '', remarks: p.remarks || '' })),
    paymentMethod: payLines.length === 1 ? payLines[0].method : 'Split',
    amountPaid: paid, creditAmount, status: 'Completed'
  };
  S.cur.transactions.push(txn);
  S.cur.payments.push(...paymentRecords);
  cart.forEach(c => {
    const p = S.cur.products.find(p => p.id === c.productId);
    if (p && productTracksStock(p)) {
      p.stock -= c.qty;
      S.cur.inventory.push({ id: uid('mv_'), productId: c.productId, type: 'Sale', qty: -c.qty, note: invoiceNo, at: now });
    }
  });
  if (customerId) {
    const cu = S.cur.customers.find(c => c.id === customerId);
    if (cu) { cu.totalSpent = round2((cu.totalSpent || 0) + txn.total); cu.outstandingBalance = round2((cu.outstandingBalance || 0) + creditAmount); }
  }
  if (S.ui.activeOrderId) {
    const o = S.cur.orders.find(o => o.id === S.ui.activeOrderId);
    if (o) { o.status = 'Served'; o.billed = true; o.invoiceNo = invoiceNo; }
  }
  logAudit('Sale completed', `${invoiceNo} — ${money(grandTotal)} (${txn.paymentMethod})`);
  await Promise.all([saveCollection('transactions'), saveCollection('payments'), saveCollection('products'), saveCollection('inventory'), saveCollection('customers'), saveCollection('orders'), saveTenant(['counters'])]);
  S.ui.cart = []; S.ui.payLines = []; S.ui.charges = 0; S.ui.billDiscount = null; S.ui.activeOrderId = null; S.ui.customerId = null; S.ui.tableNo = '';
  const nowLow = cart.map(c => S.cur.products.find(p => p.id === c.productId)).filter(p => p && productTracksStock(p) && p.stock <= Number(p.minStock || 0));
  const lowNote = nowLow.length ? `Low stock: ${nowLow.map(p => `${p.name} (${p.stock} left)`).join(', ')}.` : '';
  if (creditWarning || lowNote) toast([creditWarning, lowNote].filter(Boolean).join(' '));
  go('receipt', { invoiceNo: txn.id });
}

/* ---------------- Receipt / Invoice with barcode ---------------- */
function generateProductBarcode() {
  let code;
  do {
    code = '20' + String(Math.floor(100000000 + Math.random() * 900000000));
  } while (S.cur.products.some(p => String(p.barcode || '') === code));
  return code;
}

function barcodeBarsHTML(code) {
  let bars = '';
  for (let i = 0; i < code.length; i++) {
    const c = code.charCodeAt(i);
    for (let b = 0; b < 4; b++) {
      const h = 14 + ((c >> (b * 2)) & 3) * 9;
      bars += `<div style="height:${h}px;"></div>`;
    }
  }
  return `<div class="barcode-bars">${bars}</div><div class="center mono" style="font-size:11px;letter-spacing:2px;">${escapeHtml(code)}</div>`;
}
function brandLogo() { return (typeof LOGO_DATA_URI !== 'undefined') ? LOGO_DATA_URI : ''; }
function numberToWords(n) {
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const below1000 = (x) => {
    let out = '';
    if (x >= 100) { out += ones[Math.floor(x / 100)] + ' Hundred'; x %= 100; if (x) out += ' '; }
    if (x >= 20) { out += tens[Math.floor(x / 10)]; if (x % 10) out += '-' + ones[x % 10]; }
    else if (x > 0) out += ones[x];
    return out;
  };
  if (n === 0) return 'Zero';
  const units = [[1e9, 'Billion'], [1e6, 'Million'], [1e3, 'Thousand']];
  let out = '';
  for (const [v, name] of units) { if (n >= v) { out += (out ? ' ' : '') + below1000(Math.floor(n / v)) + ' ' + name; n %= v; } }
  if (n > 0) out += (out ? ' ' : '') + below1000(n);
  return out;
}
function amountInWords(amount) {
  const nu = Math.floor(amount + 1e-9), ch = Math.round((amount - nu) * 100);
  return `${numberToWords(nu)} Ngultrum${ch ? ' and ' + numberToWords(ch) + ' Chhertum' : ''} only`;
}
function gstBreakdown(tx) {
  const byRate = {};
  (tx.items || []).forEach(i => { const r = Number(i.taxRate || 0); byRate[r] = byRate[r] || { taxable: 0, tax: 0 }; byRate[r].taxable += Number(i.taxable || 0); byRate[r].tax += Number(i.tax || 0); });
  return Object.entries(byRate).sort((x, y) => Number(x[0]) - Number(y[0])).map(([rate, v]) => ({ rate: Number(rate), taxable: round2(v.taxable), tax: round2(v.tax) }));
}
function screenReceipt() {
  const tx = S.cur.transactions.find(x => x.id === S.ui.invoiceNo);
  if (!tx) return `<div class="empty-state">Transaction not found.</div>`;
  const biz = S.cur.business;
  const cust = S.cur.customers.find(c => c.id === tx.customerId);
  const payments = tx.payments && tx.payments.length ? tx.payments : (tx.paymentMethod ? [{ method: tx.paymentMethod, amount: tx.total }] : []);
  const logo = biz.logo || brandLogo();
  const ba = tx.billAdjust || {};
  const itemDisc = round2((tx.discountTotal || 0) - (ba.tierAmt || 0) - (ba.manualAmt || 0));
  return `
  <div class="row" style="justify-content:center;gap:10px;margin-bottom:16px;">
    <button class="btn outline" onclick="window.print()">Print receipt</button>
    <button class="btn outline" onclick="downloadReceiptPdf('${tx.id}')">Download PDF</button>
    <button class="btn outline" onclick="go('invoices')">Back to invoices</button>
    <button class="btn primary" onclick="go('pos')">New sale</button>
  </div>
  <div id="print-area">
  <div class="receipt">
    ${logo ? `<img class="logo" src="${logo}" alt="logo">` : ''}
    <h3>${escapeHtml(biz.name)}</h3>
    <div class="center">${escapeHtml(biz.address || '')}</div>
    <div class="center">${escapeHtml(biz.phone || '')}${biz.email ? ' · ' + escapeHtml(biz.email) : ''}</div>
    <div class="center">GST / TPN No: <b>${escapeHtml(biz.gstNo || '—')}</b></div>
    <div class="inv-title">TAX INVOICE</div>
    <hr>
    <div>Invoice: <b>${tx.invoiceNo}</b></div>
    <div>Date: ${fmtDate(tx.date)} ${tx.time}</div>
    <div>Cashier: ${escapeHtml(tx.cashier)}</div>
    <div>Customer: ${escapeHtml(customerName(tx.customerId))}${cust && cust.phone && cust.phone !== '—' ? ' · ' + escapeHtml(cust.phone) : ''}</div>
    ${cust && cust.gstId ? `<div>Customer GST/TPN: ${escapeHtml(cust.gstId)}</div>` : ''}
    ${tx.orderType ? `<div>Order: ${escapeHtml(tx.orderType)}${tx.tableNo ? ' — Table ' + escapeHtml(tx.tableNo) : ''}</div>` : ''}
    <hr>
    <table style="width:100%;"><thead><tr><th style="text-align:left;">Item</th><th>Qty</th><th>Price</th><th>GST</th><th>Total</th></tr></thead><tbody>
      ${tx.items.map(i => `<tr><td>${escapeHtml(i.name)}</td><td style="text-align:center;">${i.qty}</td><td style="text-align:right;">${Number(i.price).toFixed(2)}</td><td style="text-align:center;">${Number(i.taxRate || 0)}%</td><td style="text-align:right;">${Number(i.total).toFixed(2)}</td></tr>`).join('')}
    </tbody></table>
    <hr>
    <div class="row between"><span>Subtotal</span><span>${(tx.subtotal || 0).toFixed(2)}</span></div>
    ${itemDisc > 0 ? `<div class="row between"><span>Item discounts</span><span>− ${itemDisc.toFixed(2)}</span></div>` : ''}
    ${ba.tierAmt > 0 ? `<div class="row between"><span>${escapeHtml(ba.custType)} pricing (${ba.tierPct}%)</span><span>− ${ba.tierAmt.toFixed(2)}</span></div>` : ''}
    ${ba.manualAmt > 0 ? `<div class="row between"><span>Discount${ba.manualType === 'percent' ? ' (' + ba.manualValue + '%)' : ''}</span><span>− ${ba.manualAmt.toFixed(2)}</span></div>` : ''}
    ${!tx.billAdjust && tx.discountTotal ? `<div class="row between"><span>Discount</span><span>− ${(tx.discountTotal || 0).toFixed(2)}</span></div>` : ''}
    <div class="row between"><span>Taxable amount</span><span>${tx.taxableAmount.toFixed(2)}</span></div>
    ${gstBreakdown(tx).map(g => `<div class="row between"><span>GST @ ${g.rate}%</span><span>${g.tax.toFixed(2)}</span></div>`).join('')}
    ${tx.charges ? `<div class="row between"><span>Charges</span><span>${tx.charges.toFixed(2)}</span></div>` : ''}
    <div class="row between" style="font-weight:700;font-size:13.5px;"><span>Grand total (Nu.)</span><span>${tx.total.toFixed(2)}</span></div>
    <div style="font-size:10.5px;color:#666;margin-top:2px;">${amountInWords(tx.total)}</div>
    <hr>
    ${payments.map(p => `<div class="row between"><span>${escapeHtml(p.method)}${p.bankName ? ' — ' + escapeHtml(p.bankName) : ''}</span><span>${Number(p.amount).toFixed(2)}</span></div>${p.journalNo ? `<div style="font-size:10.5px;color:#888;">${isMobileWallet(p.method) ? 'Txn ID' : 'Journal No.'}: ${escapeHtml(p.journalNo)}</div>` : ''}${p.changeGiven ? `<div class="row between" style="font-size:11px;color:#888;"><span>Cash received</span><span>${Number(p.cashReceived || 0).toFixed(2)}</span></div><div class="row between" style="font-size:11px;color:#888;"><span>Change</span><span>${Number(p.changeGiven).toFixed(2)}</span></div>` : ''}`).join('')}
    ${tx.creditAmount ? `<div class="row between" style="font-weight:700;color:#B3452C;"><span>Outstanding (credit)</span><span>${tx.creditAmount.toFixed(2)}</span></div>` : ''}
    <hr>
    ${barcodeBarsHTML(tx.invoiceNo)}
    <div class="center" style="margin-top:8px;">Thank you — please come again.</div>
    <div class="center" style="margin-top:6px;font-size:10px;color:#888;">Prices in Bhutanese Ngultrum (Nu.) · GST as applicable</div>
    <div class="center" style="margin-top:8px;font-size:10px;color:#888;">Powered by Yuevaan Consultancy · Thimphu, Bhutan</div>
  </div>
  </div>`;
}

function downloadReceiptPdf(txnId) {
  const tx = S.cur.transactions.find(x => x.id === txnId);
  if (!tx) return;
  if (!window.jspdf) { toast('PDF library did not load — use Print receipt instead.'); return; }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: [80, 230 + tx.items.length * 6] });
  const biz = S.cur.business;
  const cust = S.cur.customers.find(c => c.id === tx.customerId);
  let y = 8;
  const logo = biz.logo || brandLogo();
  if (logo) { try { doc.addImage(logo, logo.includes('image/png') ? 'PNG' : 'JPEG', 30, y, 20, 20); y += 23; } catch (e) { /* logo is optional */ } }
  const line = (txt, size = 9, bold = false, center = true) => {
    doc.setFontSize(size); doc.setFont(undefined, bold ? 'bold' : 'normal');
    if (center) doc.text(String(txt), 40, y, { align: 'center' }); else doc.text(String(txt), 5, y);
    y += size * 0.5 + 2;
  };
  const row = (l, r, bold = false, size = 8) => {
    doc.setFontSize(size); doc.setFont(undefined, bold ? 'bold' : 'normal');
    doc.text(String(l), 5, y); doc.text(String(r), 75, y, { align: 'right' }); y += size * 0.5 + 2;
  };
  line(biz.name, 12, true);
  if (biz.address) line(biz.address, 8);
  if (biz.phone) line(biz.phone, 8);
  line(`GST / TPN No: ${biz.gstNo || '—'}`, 8);
  line('TAX INVOICE', 10, true);
  y += 1;
  line(`Invoice: ${tx.invoiceNo}`, 8, false, false);
  line(`Date: ${fmtDate(tx.date)} ${tx.time}`, 8, false, false);
  line(`Cashier: ${tx.cashier}`, 8, false, false);
  line(`Customer: ${customerName(tx.customerId)}`, 8, false, false);
  if (cust && cust.gstId) line(`Customer GST/TPN: ${cust.gstId}`, 8, false, false);
  y += 2;
  tx.items.forEach(i => { row(`${i.qty} x ${i.name} (GST ${Number(i.taxRate || 0)}%)`.slice(0, 40), Number(i.total).toFixed(2)); });
  y += 2;
  const ba = tx.billAdjust || {};
  row('Subtotal', (tx.subtotal || 0).toFixed(2));
  if (tx.discountTotal) row('Discounts', '- ' + (tx.discountTotal || 0).toFixed(2));
  row('Taxable amount', tx.taxableAmount.toFixed(2));
  gstBreakdown(tx).forEach(g => row(`GST @ ${g.rate}%`, g.tax.toFixed(2)));
  if (tx.charges) row('Charges', tx.charges.toFixed(2));
  row('Grand total (Nu.)', tx.total.toFixed(2), true, 10);
  doc.setFontSize(7); doc.setFont(undefined, 'normal');
  const words = doc.splitTextToSize(amountInWords(tx.total), 70); doc.text(words, 5, y); y += words.length * 3.5 + 2;
  (tx.payments || []).forEach(p => row(`${p.method}${p.journalNo ? ' (' + p.journalNo + ')' : ''}`.slice(0, 40), Number(p.amount).toFixed(2)));
  y += 4;
  line('Thank you — please come again.', 8);
  line('Powered by Yuevaan Consultancy · Thimphu, Bhutan', 6);
  doc.save(`${tx.invoiceNo}.pdf`);
}

function screenInvoices() {
  const list = [...S.cur.transactions].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return `
  <div class="row" style="margin-bottom:14px;">
    <input placeholder="Search invoice no., customer…" style="max-width:280px;" oninput="S.ui.q=this.value;renderInvoicesTable()">
  </div>
  <div class="table-wrap" id="invoices-table">${invoicesTableHTML(list)}</div>`;
}
function invoicesTableHTML(list) {
  const q = (S.ui.q || '').toLowerCase();
  const filtered = q ? list.filter(t => (t.invoiceNo + customerName(t.customerId)).toLowerCase().includes(q)) : list;
  return `<table><thead><tr><th>Invoice</th><th>Date</th><th>Customer</th><th>Total</th><th>GST</th><th>Status</th><th></th></tr></thead><tbody>
    ${filtered.length ? filtered.map(t => `<tr>
      <td class="mono">${t.invoiceNo}</td><td>${fmtDate(t.date)} ${t.time}</td><td>${escapeHtml(customerName(t.customerId))}</td>
      <td class="mono">${money(t.total)}</td><td class="mono">${money(t.taxAmount)}</td>
      <td><span class="pill status-${t.status.replace(' ','')}">${t.status}</span></td>
      <td class="row">
        <button class="btn sm outline" onclick="go('receipt',{invoiceNo:'${t.id}'})">View</button>
        ${t.status === 'Completed' ? `<button class="btn sm danger" onclick="voidTxn('${t.id}')">Void</button>` : ''}
      </td>
    </tr>`).join('') : `<tr><td colspan="7" class="empty-state">No invoices yet.</td></tr>`}
  </tbody></table>`;
}
function renderInvoicesTable(){ const el=document.getElementById('invoices-table'); if(el) el.innerHTML = invoicesTableHTML([...S.cur.transactions].sort((a,b)=>b.createdAt.localeCompare(a.createdAt))); }
async function voidTxn(id) {
  const t = S.cur.transactions.find(x => x.id === id);
  if (!t || t.status !== 'Completed') return;
  if (!confirm(`Void invoice ${t.invoiceNo}? This restores stock, cancels payments, updates customer credit balance, and marks the invoice as Voided.`)) return;
  t.status = 'Voided';

  // Restore inventory
  (t.items || []).forEach(i => {
    const p = S.cur.products.find(p => p.id === i.productId);
    if (p && p.stock !== undefined) {
      p.stock += i.qty;
      S.cur.inventory.push({ id: uid('mv_'), productId: i.productId, type: 'Void restock', qty: i.qty, note: t.invoiceNo, at: new Date().toISOString() });
    }
  });

  // Void payment records associated with this transaction
  (S.cur.payments || []).forEach(p => {
    if (p.txnId === t.id || p.invoiceId === t.invoiceNo) {
      p.status = 'Voided';
    }
  });

  // Reverse customer spending and credit balance
  if (t.customerId) {
    const cu = (S.cur.customers || []).find(c => c.id === t.customerId);
    if (cu) {
      cu.totalSpent = round2(Math.max(0, (cu.totalSpent || 0) - (t.total || 0)));
      if (t.creditAmount) {
        cu.outstandingBalance = round2(Math.max(0, (cu.outstandingBalance || 0) - (t.creditAmount || 0)));
      }
    }
  }

  // If a kitchen order was tied to this invoice, unmark billed
  if (S.cur.orders) {
    const o = S.cur.orders.find(ord => ord.invoiceNo === t.invoiceNo);
    if (o) { o.billed = false; }
  }

  logAudit('Invoice voided', `${t.invoiceNo} — ${money(t.total)} (reverted payments & balances)`);
  await Promise.all([
    saveCollection('transactions'),
    saveCollection('products'),
    saveCollection('inventory'),
    saveCollection('payments'),
    saveCollection('customers'),
    saveCollection('orders')
  ]);
  render(); toast(`Invoice ${t.invoiceNo} voided. Stock & accounts adjusted.`);
}

/* ============================================================
   GST / TAX REPORTS — flexible date-time filtering
   ============================================================ */
function ensureGstFilter() {
  if (!S.ui.from) S.ui.from = todayISO();
  if (!S.ui.to) S.ui.to = todayISO();
  if (!S.ui.fromTime) S.ui.fromTime = '00:00';
  if (!S.ui.toTime) S.ui.toTime = '23:59';
}
function inRange(t) {
  const from = new Date(`${S.ui.from}T${S.ui.fromTime || '00:00'}:00`);
  const to = new Date(`${S.ui.to}T${S.ui.toTime || '23:59'}:59`);
  const at = new Date(`${t.date}T${t.time || '00:00'}:00`);
  return at >= from && at <= to;
}
function quickRange(kind) {
  const d = new Date();
  let from = new Date(d), to = new Date(d);
  if (kind === 'today') { /* defaults */ }
  else if (kind === 'yesterday') { from.setDate(d.getDate() - 1); to.setDate(d.getDate() - 1); }
  else if (kind === 'week') { const day = d.getDay() || 7; from.setDate(d.getDate() - day + 1); }
  else if (kind === 'lastweek') { const day = d.getDay() || 7; from.setDate(d.getDate() - day - 6); to.setDate(d.getDate() - day); }
  else if (kind === 'month') { from = new Date(d.getFullYear(), d.getMonth(), 1); to = new Date(d.getFullYear(), d.getMonth() + 1, 0); }
  else if (kind === 'lastmonth') { from = new Date(d.getFullYear(), d.getMonth() - 1, 1); to = new Date(d.getFullYear(), d.getMonth(), 0); }
  else if (kind === 'year') { from = new Date(d.getFullYear(), 0, 1); to = new Date(d.getFullYear(), 11, 31); }
  S.ui.from = toLocalISO(from); S.ui.to = toLocalISO(to); S.ui.fromTime = '00:00'; S.ui.toTime = '23:59';
  render();
}
function screenGst() {
  ensureGstFilter();
  const all = S.cur.transactions;
  const filtered = all.filter(t => inRange(t));
  const completed = filtered.filter(t => t.status === 'Completed');
  const refunded = filtered.filter(t => t.status === 'Refunded' || t.status === 'Partially Refunded');
  const voided = filtered.filter(t => t.status === 'Voided' || t.status === 'Cancelled');
  const grossSales = completed.reduce((s, t) => s + t.total, 0);
  const taxable = completed.reduce((s, t) => s + t.taxableAmount, 0);
  const gst = completed.reduce((s, t) => s + t.taxAmount, 0);
  const discounts = completed.reduce((s, t) => s + t.discountTotal, 0);
  const netSales = grossSales - refunded.reduce((s, t) => s + t.total, 0);

  const byDay = {};
  completed.forEach(t => {
    byDay[t.date] = byDay[t.date] || { sales: 0, taxable: 0, gst: 0, count: 0 };
    byDay[t.date].sales += t.total; byDay[t.date].taxable += t.taxableAmount; byDay[t.date].gst += t.taxAmount; byDay[t.date].count++;
  });
  const byRate = {};
  completed.forEach(t => t.items.forEach(i => {
    const key = i.taxRate + '%';
    byRate[key] = byRate[key] || { taxable: 0, gst: 0 };
    byRate[key].taxable += i.taxable; byRate[key].gst += i.tax;
  }));

  return `
  <div class="card" style="margin-bottom:16px;">
    <div class="row wrap" style="margin-bottom:10px;">
      ${['today','yesterday','week','lastweek','month','lastmonth','year'].map(k => `<button class="btn sm outline" onclick="quickRange('${k}')">${k.replace('last','Last ').replace(/^(.)/, m=>m.toUpperCase())}</button>`).join('')}
    </div>
    <div class="row wrap">
      <div class="field" style="margin:0;"><label>From date</label><input type="date" value="${S.ui.from}" onchange="S.ui.from=this.value;render()"></div>
      <div class="field" style="margin:0;"><label>From time</label><input type="time" value="${S.ui.fromTime}" onchange="S.ui.fromTime=this.value;render()"></div>
      <div class="field" style="margin:0;"><label>To date</label><input type="date" value="${S.ui.to}" onchange="S.ui.to=this.value;render()"></div>
      <div class="field" style="margin:0;"><label>To time</label><input type="time" value="${S.ui.toTime}" onchange="S.ui.toTime=this.value;render()"></div>
      <div class="field" style="margin:0;align-self:flex-end;"><button class="btn outline" onclick="S.ui.from=todayISO();S.ui.to=todayISO();S.ui.fromTime='00:00';S.ui.toTime='23:59';render()">Clear filter</button></div>
    </div>
  </div>

  <div class="grid cols-4">
    <div class="card kpi"><div class="label">Total Sales</div><div class="value">${money(grossSales)}</div></div>
    <div class="card kpi"><div class="label">Taxable Sales</div><div class="value">${money(taxable)}</div></div>
    <div class="card kpi"><div class="label">GST Collected</div><div class="value good">${money(gst)}</div></div>
    <div class="card kpi"><div class="label">Transactions</div><div class="value">${completed.length}</div></div>
  </div>
  <div class="grid cols-4" style="margin-top:16px;">
    <div class="card kpi"><div class="label">Discounts</div><div class="value">${money(discounts)}</div></div>
    <div class="card kpi"><div class="label">Refunds</div><div class="value warn">${money(refunded.reduce((s,t)=>s+t.total,0))}</div></div>
    <div class="card kpi"><div class="label">Voided</div><div class="value">${voided.length}</div></div>
    <div class="card kpi"><div class="label">Net Sales</div><div class="value good">${money(netSales)}</div></div>
  </div>

  <div class="section-title">Daily breakdown <span class="hint"><button class="link-btn" onclick="exportGstCsv('daily')">Export CSV</button></span></div>
  <div class="table-wrap"><table><thead><tr><th>Date</th><th>Sales</th><th>Taxable</th><th>GST</th><th>Transactions</th></tr></thead><tbody>
    ${Object.keys(byDay).length ? Object.entries(byDay).sort((a,b)=>a[0].localeCompare(b[0])).map(([d, v]) => `<tr><td>${fmtDate(d)}</td><td class="mono">${money(v.sales)}</td><td class="mono">${money(v.taxable)}</td><td class="mono">${money(v.gst)}</td><td class="mono">${v.count}</td></tr>`).join('') : `<tr><td colspan="5" class="empty-state">No transactions in this range.</td></tr>`}
  </tbody></table></div>

  <div class="section-title">GST rate breakdown <span class="hint"><button class="link-btn" onclick="exportGstCsv('rate')">Export CSV</button></span></div>
  <div class="table-wrap"><table><thead><tr><th>Rate</th><th>Taxable amount</th><th>GST amount</th></tr></thead><tbody>
    ${Object.keys(byRate).length ? Object.entries(byRate).map(([r, v]) => `<tr><td>${r}</td><td class="mono">${money(v.taxable)}</td><td class="mono">${money(v.gst)}</td></tr>`).join('') : `<tr><td colspan="3" class="empty-state">No transactions in this range.</td></tr>`}
  </tbody></table></div>

  <div class="section-title">Transactions in range <span class="hint"><button class="link-btn" onclick="exportGstCsv('txns')">Export CSV</button> · <button class="link-btn" onclick="window.print()">Print</button></span></div>
  <div class="table-wrap"><table><thead><tr><th>Invoice</th><th>Date</th><th>Time</th><th>Taxable</th><th>GST</th><th>Total</th><th>Status</th></tr></thead><tbody>
    ${filtered.length ? filtered.map(t => `<tr><td class="mono">${t.invoiceNo}</td><td>${fmtDate(t.date)}</td><td>${t.time}</td><td class="mono">${money(t.taxableAmount)}</td><td class="mono">${money(t.taxAmount)}</td><td class="mono">${money(t.total)}</td><td><span class="pill status-${t.status.replace(' ','')}">${t.status}</span></td></tr>`).join('') : `<tr><td colspan="7" class="empty-state">No transactions in this range.</td></tr>`}
  </tbody></table></div>
  <div style="font-size:11.5px;color:var(--muted);margin-top:10px;">GST rates are locked to the rate active at the time of sale — changing a rate in Settings never recalculates historical transactions.</div>
  `;
}
function exportGstCsv(kind) {
  const all = S.cur.transactions.filter(t => inRange(t));
  let csv = '';
  if (kind === 'txns') {
    csv = 'Invoice,Date,Time,Taxable,GST,Total,Status\n' + all.map(t => `${t.invoiceNo},${t.date},${t.time},${t.taxableAmount},${t.taxAmount},${t.total},${t.status}`).join('\n');
  } else if (kind === 'daily') {
    const byDay = {};
    all.filter(t=>t.status==='Completed').forEach(t => { byDay[t.date] = byDay[t.date] || {sales:0,taxable:0,gst:0,count:0}; byDay[t.date].sales+=t.total; byDay[t.date].taxable+=t.taxableAmount; byDay[t.date].gst+=t.taxAmount; byDay[t.date].count++; });
    csv = 'Date,Sales,Taxable,GST,Transactions\n' + Object.entries(byDay).map(([d,v])=>`${d},${v.sales},${v.taxable},${v.gst},${v.count}`).join('\n');
  } else {
    const byRate = {};
    all.filter(t=>t.status==='Completed').forEach(t => t.items.forEach(i => { const k=i.taxRate+'%'; byRate[k]=byRate[k]||{taxable:0,gst:0}; byRate[k].taxable+=i.taxable; byRate[k].gst+=i.tax; }));
    csv = 'Rate,Taxable,GST\n' + Object.entries(byRate).map(([r,v])=>`${r},${v.taxable},${v.gst}`).join('\n');
  }
  downloadBlob(csv, `gst-${kind}-${S.ui.from}_to_${S.ui.to}.csv`);
}

/* ============================================================
   SALES REPORTS
   ============================================================ */
function reportsCharts(filtered, byCategory) {
  const daily = {};
  filtered.forEach(t => daily[t.date] = (daily[t.date] || 0) + Number(t.total || 0));
  const days = Object.entries(daily).sort((a,b)=>a[0].localeCompare(b[0])).slice(-10);
  const max = Math.max(...days.map(x=>x[1]), 1);
  const cats = Object.entries(byCategory).sort((a,b)=>b[1]-a[1]).slice(0,6);
  const cmax = Math.max(...cats.map(x=>x[1]),1);
  // Profit trend: same date buckets as revenue, profit per day = revenue - cogs (expenses not split by day, so shown at day level using date-scoped expenses)
  const profitByDay = days.map(([d]) => {
    const dayTxns = filtered.filter(t => t.date === d);
    return [d, estimatedProfitFor(dayTxns, d, d)];
  });
  const pmax = Math.max(...profitByDay.map(x=>Math.abs(x[1])), 1);
  return `
  <div class="chart-grid">
    <div class="chart-card">
      <div class="chart-title">Revenue by date</div>
      ${days.length ? `<div class="chart">
        ${days.map(([d,v])=>`<div class="chart-bar" style="height:${Math.max(8,(v/max)*180)}px"><span>${money(v)}</span></div>`).join('')}
      </div><div class="chart-labels">${days.map(([d])=>`<span>${fmtDate(d).slice(0,5)}</span>`).join('')}</div>` :
      `<div class="empty-state">No report data for the selected range.</div>`}
    </div>
    <div class="chart-card">
      <div class="chart-title">Sales by category</div>
      ${cats.length ? `<div class="chart" style="align-items:flex-end">
        ${cats.map(([c,v])=>`<div class="chart-bar" style="height:${Math.max(8,(v/cmax)*180)}px"><span>${money(v)}</span></div>`).join('')}
      </div><div class="chart-labels">${cats.map(([c])=>`<span title="${escapeHtml(c)}">${escapeHtml(c)}</span>`).join('')}</div>` :
      `<div class="empty-state">Category chart will appear after sales are recorded.</div>`}
    </div>
    <div class="chart-card">
      <div class="chart-title">Profit trend</div>
      ${profitByDay.length ? `<div class="chart">
        ${profitByDay.map(([d,v])=>`<div class="chart-bar" style="height:${Math.max(8,(Math.abs(v)/pmax)*180)}px;background:${v<0?'var(--red)':'var(--teal)'}"><span>${money(v)}</span></div>`).join('')}
      </div><div class="chart-labels">${profitByDay.map(([d])=>`<span>${fmtDate(d).slice(0,5)}</span>`).join('')}</div>` :
      `<div class="empty-state">Profit trend will appear after sales are recorded.</div>`}
    </div>
  </div>`;
}

function screenReports() {
  ensureGstFilter();
  const filtered = S.cur.transactions.filter(t => inRange(t) && t.status === 'Completed');
  const byCashier = {}; const byCategory = {};
  filtered.forEach(t => {
    byCashier[t.cashier] = (byCashier[t.cashier] || 0) + t.total;
    t.items.forEach(i => { const p = S.cur.products.find(p=>p.id===i.productId); const cat = p ? p.category : 'Uncategorised'; byCategory[cat] = (byCategory[cat]||0) + i.total; });
  });
  const avg = filtered.length ? filtered.reduce((s,t)=>s+t.total,0)/filtered.length : 0;
  return `
  <div class="card" style="margin-bottom:16px;">
    <div class="row wrap">
      <div class="field" style="margin:0;"><label>From</label><input type="date" value="${S.ui.from}" onchange="S.ui.from=this.value;render()"></div>
      <div class="field" style="margin:0;"><label>To</label><input type="date" value="${S.ui.to}" onchange="S.ui.to=this.value;render()"></div>
    </div>
  </div>
  <div class="grid cols-4">
    <div class="card kpi"><div class="label">Gross Sales</div><div class="value">${money(filtered.reduce((s,t)=>s+t.total,0))}</div></div>
    <div class="card kpi"><div class="label">Transactions</div><div class="value">${filtered.length}</div></div>
    <div class="card kpi"><div class="label">Avg. Transaction</div><div class="value">${money(avg)}</div></div>
    <div class="card kpi"><div class="label">Estimated Profit</div><div class="value good">${money(estimatedProfit(filtered))}</div></div>
  </div>
  <div style="font-size:11.5px;color:var(--muted);margin-top:6px;">Estimated profit = revenue − cost of goods sold (from purchase price) − expenses in range. Figures are estimates.</div>
  ${reportsCharts(filtered, byCategory)}

  <div class="section-title">Sales by employee / cashier</div>
  <div class="table-wrap"><table><thead><tr><th>Cashier</th><th>Sales</th></tr></thead><tbody>
    ${Object.keys(byCashier).length ? Object.entries(byCashier).map(([c,a])=>`<tr><td>${escapeHtml(c)}</td><td class="mono">${money(a)}</td></tr>`).join('') : `<tr><td colspan="2" class="empty-state">No sales in range.</td></tr>`}
  </tbody></table></div>

  <div class="section-title">Sales by category</div>
  <div class="table-wrap"><table><thead><tr><th>Category</th><th>Sales</th></tr></thead><tbody>
    ${Object.keys(byCategory).length ? Object.entries(byCategory).map(([c,a])=>`<tr><td>${escapeHtml(c||'Uncategorised')}</td><td class="mono">${money(a)}</td></tr>`).join('') : `<tr><td colspan="2" class="empty-state">No sales in range.</td></tr>`}
  </tbody></table></div>
  `;
}
function estimatedProfit(txns) {
  return estimatedProfitFor(txns, S.ui.from, S.ui.to);
}
function estimatedProfitFor(txns, from, to) {
  const revenue = txns.reduce((s,t)=>s+t.total,0);
  const cogs = txns.reduce((s,t)=>s+t.items.reduce((ss,i)=>{ const p=S.cur.products.find(p=>p.id===i.productId); return ss+(p?p.purchasePrice*i.qty:0); },0),0);
  const expenses = S.cur.expenses.filter(e=>e.date>=from && e.date<=to).reduce((s,e)=>s+e.amount,0);
  return round2(revenue - cogs - expenses);
}

/* ============================================================
   CUSTOMERS / SUPPLIERS / EXPENSES (generic CRUD pattern)
   ============================================================ */
function screenCustomers() {
  const list = S.cur.customers;
  return `
  <div class="row between" style="margin-bottom:14px;">
    <button class="btn primary" onclick="openCustomerModal()">+ Add customer</button>
    <div class="card" style="padding:8px 14px;font-size:13px;">Total credit outstanding: <b class="mono" style="color:var(--red);">${money(list.reduce((s, c) => s + (Number(c.outstandingBalance) || 0), 0))}</b> across ${list.filter(c => (c.outstandingBalance || 0) > 0).length} customer(s)</div>
  </div>
  <div class="table-wrap"><table><thead><tr><th>Name</th><th>Type</th><th>Phone</th><th>Total spent</th><th>Credit limit</th><th>Outstanding</th><th></th></tr></thead><tbody>
    ${list.length ? list.map(c => `<tr><td>${escapeHtml(c.name)}${c.active===false?' <span class="pill">inactive</span>':''}</td><td>${escapeHtml(c.type||'Walk-in')}</td><td class="mono">${escapeHtml(c.phone)}</td><td class="mono">${money(c.totalSpent||0)}</td><td class="mono">${money(c.creditLimit||0)}</td><td class="mono" style="color:${(c.outstandingBalance||0)>0?'var(--red)':''}">${money(c.outstandingBalance||0)}</td>
      <td style="white-space:nowrap;"><button class="btn sm outline" onclick="viewCustomerHistory('${c.id}')">History</button> ${(c.outstandingBalance||0)>0 ? `<button class="btn sm primary" onclick="openReceivePaymentModal('${c.id}')">Receive payment</button>` : ''}</td></tr>`).join('') : `<tr><td colspan="7" class="empty-state">No customers yet.</td></tr>`}
  </tbody></table></div>
  <div id="customer-history"></div>`;
}
function customerFields() {
  return [
    { name: 'name', label: 'Full name' },
    { name: 'type', label: 'Customer type', type: 'select', options: customerTypesFor(S.cur.business) },
    { name: 'phone', label: 'Contact number' },
    { name: 'email', label: 'Email', required: false },
    { name: 'address', label: 'Address', required: false },
    { name: 'gstId', label: 'Tax / GST ID (if business)', required: false },
    { name: 'creditLimit', label: 'Credit limit', type: 'number', step: '0.01', required: false },
    { name: 'notes', label: 'Notes / remarks', type: 'textarea', required: false },
  ];
}
function openCustomerModal() {
  openFormModal('Add customer', customerFields(), async (v) => {
    S.cur.customers.push({ id: uid('cus_'), totalSpent: 0, outstandingBalance: 0, active: true, ...v });
    await saveCollection('customers'); render(); toast('Customer added.');
  }, {}, true);
}
// Credit ledger: customer pays off (part of) their outstanding balance.
function openReceivePaymentModal(id) {
  const c = S.cur.customers.find(c => c.id === id);
  if (!c) return;
  const due = round2(c.outstandingBalance || 0);
  openFormModal(`Receive payment — ${c.name}`, [
    { name: 'amount', label: `Amount received (outstanding ${money(due)})`, type: 'number', step: '0.01', default: due },
    { name: 'method', label: 'Payment method', type: 'select', options: PAYMENT_METHOD_TYPES.filter(m => m !== 'Credit') },
    { name: 'bankName', label: 'Bank name (bank payments only)', required: false },
    { name: 'journalNo', label: 'Journal No. / Transaction ID (bank & mobile wallet)', required: false },
    { name: 'remarks', label: 'Remarks', type: 'textarea', required: false },
  ], async (v) => {
    const amount = round2(Number(v.amount) || 0);
    if (amount <= 0) { toast('Enter an amount greater than zero.'); return; }
    if (amount > due) { toast(`Amount is more than the outstanding balance (${money(due)}).`); return; }
    c.outstandingBalance = round2(due - amount);
    S.cur.counters.settlement = (S.cur.counters.settlement || 0) + 1;
    S.cur.payments.push({
      id: uid('pay_'), invoiceId: `CR-${pad(S.cur.counters.settlement, 4)}`, txnId: null, businessId: S.cur.business.businessId,
      customerId: id, method: v.method, amount, charges: 0, bankName: v.bankName || '', journalNo: v.journalNo || '',
      remarks: v.remarks || 'Credit balance payment', kind: 'Credit settlement',
      date: todayISO(), time: nowTime(), createdBy: S.session.employee.name || S.session.employee.username, status: 'Completed'
    });
    logAudit('Credit payment received', `${c.name}: ${money(amount)} via ${v.method} — balance now ${money(c.outstandingBalance)}`);
    await Promise.all([saveCollection('customers'), saveCollection('payments'), saveTenant(['counters'])]);
    render(); toast(`${money(amount)} received from ${c.name}. Balance: ${money(c.outstandingBalance)}.`);
    viewCustomerHistory(id);
  }, {}, true);
}
function viewCustomerHistory(id) {
  const c = S.cur.customers.find(c => c.id === id);
  const txns = S.cur.transactions.filter(t => t.customerId === id).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
  const settlements = S.cur.payments.filter(p => p.customerId === id && p.kind === 'Credit settlement').sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));
  document.getElementById('customer-history').innerHTML = `
  <div class="section-title">History — ${escapeHtml(c.name)}</div>
  <div class="grid cols-3" style="margin-bottom:12px;">
    <div class="card kpi"><div class="label">Total spending</div><div class="value">${money(c.totalSpent||0)}</div></div>
    <div class="card kpi"><div class="label">Outstanding credit</div><div class="value warn">${money(c.outstandingBalance||0)}</div></div>
    <div class="card kpi"><div class="label">Credit limit</div><div class="value">${money(c.creditLimit||0)}</div></div>
  </div>
  <div class="table-wrap"><table><thead><tr><th>Invoice</th><th>Date</th><th>Total</th><th>Paid</th><th>Credit</th><th>Status</th></tr></thead><tbody>
    ${txns.length ? txns.map(t => `<tr><td class="mono">${t.invoiceNo}</td><td>${fmtDate(t.date)}</td><td class="mono">${money(t.total)}</td><td class="mono">${money(t.amountPaid||0)}</td><td class="mono">${money(t.creditAmount||0)}</td><td><span class="pill status-${t.status.replace(' ','')}">${t.status}</span></td></tr>`).join('') : `<tr><td colspan="6" class="empty-state">No purchases yet.</td></tr>`}
  </tbody></table></div>
  <div class="section-title">Payments received against credit</div>
  <div class="table-wrap"><table><thead><tr><th>Date</th><th>Ref</th><th>Method</th><th>Amount</th><th>Details</th></tr></thead><tbody>
    ${settlements.length ? settlements.map(p => `<tr><td>${fmtDate(p.date)} ${p.time}</td><td class="mono">${escapeHtml(p.invoiceId)}</td><td>${escapeHtml(p.method)}</td><td class="mono">${money(p.amount)}</td><td style="font-size:11.5px;">${escapeHtml(p.journalNo || '')} ${escapeHtml(p.remarks || '')}</td></tr>`).join('') : `<tr><td colspan="5" class="empty-state">No balance payments recorded yet.</td></tr>`}
  </tbody></table></div>`;
}

function screenSuppliers() {
  const list = S.cur.suppliers;
  return `
  <div class="row" style="margin-bottom:14px;"><button class="btn primary" onclick="openSupplierModal()">+ Add supplier</button></div>
  <div class="table-wrap"><table><thead><tr><th>Name</th><th>Contact</th><th>Paid</th><th>Outstanding</th></tr></thead><tbody>
    ${list.length ? list.map(s => {
      const contact = s.contact || [s.phone, s.email].filter(Boolean).join(' · ') || s.address || '—';
      return `<tr><td>${escapeHtml(s.name)}</td><td>${escapeHtml(contact)}</td><td class="mono">${money(s.amountPaid||0)}</td><td class="mono">${money(s.amountOutstanding||0)}</td></tr>`;
    }).join('') : `<tr><td colspan="4" class="empty-state">No suppliers yet.</td></tr>`}
  </tbody></table></div>`;
}
function openSupplierModal() {
  openFormModal('Add supplier', [
    { name: 'name', label: 'Name' }, { name: 'contact', label: 'Contact (phone/email)' },
    { name: 'amountPaid', label: 'Amount paid so far', type: 'number', required: false },
    { name: 'amountOutstanding', label: 'Amount outstanding', type: 'number', required: false },
  ], async (v) => { S.cur.suppliers.push({ id: uid('sup_'), ...v }); await saveCollection('suppliers'); render(); toast('Supplier added.'); });
}

function screenExpenses() {
  const list = [...S.cur.expenses].sort((a,b)=>b.date.localeCompare(a.date));
  const total = list.reduce((s,e)=>s+e.amount,0);
  return `
  <div class="row between" style="margin-bottom:14px;">
    <div class="kpi"><div class="label">Total (all time)</div><div class="value">${money(total)}</div></div>
    <button class="btn primary" onclick="openExpenseModal()">+ Record expense</button>
  </div>
  <div class="table-wrap"><table><thead><tr><th>Date</th><th>Name / Note</th><th>Category</th><th>Amount</th><th>Payment</th><th>By</th></tr></thead><tbody>
    ${list.length ? list.map(e => `<tr><td>${fmtDate(e.date)}</td><td>${escapeHtml(e.name || e.note || e.category || 'Expense')}</td><td>${escapeHtml(e.category)}</td><td class="mono">${money(e.amount)}</td><td>${escapeHtml(e.paymentMethod || 'Cash')}</td><td>${escapeHtml(e.employee || 'Admin')}</td></tr>`).join('') : `<tr><td colspan="6" class="empty-state">No expenses recorded yet.</td></tr>`}
  </tbody></table></div>`;
}
function openExpenseModal() {
  openFormModal('Record expense', [
    { name: 'name', label: 'Expense name' },
    { name: 'category', label: 'Category', type: 'select', options: ['Rent','Utilities','Salaries','Supplies','Maintenance','Marketing','Other'] },
    { name: 'amount', label: 'Amount', type: 'number', step: '0.01' },
    { name: 'date', label: 'Date', type: 'date', default: todayISO() },
    { name: 'paymentMethod', label: 'Payment method', type: 'select', options: ['Cash','Card','Bank Transfer','Other'] },
    { name: 'description', label: 'Description', type: 'textarea', required: false },
  ], async (v) => {
    S.cur.expenses.push({ id: uid('exp_'), employee: S.session.employee.name || S.session.employee.username, status: 'Recorded', ...v });
    await saveCollection('expenses'); render(); toast('Expense recorded.');
  });
}

/* ============================================================
   USERS & ROLES
   ============================================================ */
function screenUsers() {
  const list = S.cur.users;
  return `
  <div class="row" style="margin-bottom:14px;"><button class="btn primary" onclick="openUserModal()">+ Add employee</button></div>
  <div class="table-wrap"><table><thead><tr><th>Name</th><th>Username</th><th>Role</th><th>Status</th><th></th></tr></thead><tbody>
    ${list.map(u => `<tr><td>${escapeHtml(u.name)}</td><td class="mono">${escapeHtml(u.username)}</td><td>${escapeHtml(u.role)}</td>
      <td>${u.active !== false ? '<span class="pill status-Completed">Active</span>' : '<span class="pill status-Refunded">Disabled</span>'}</td>
      <td><button class="btn sm outline" onclick="toggleUser('${u.username}')">${u.active !== false ? 'Disable' : 'Enable'}</button></td>
    </tr>`).join('')}
  </tbody></table></div>`;
}
function openUserModal() {
  openFormModal('Add employee', [
    { name: 'name', label: 'Full name' }, { name: 'username', label: 'Employee ID / Username' },
    { name: 'password', label: 'Password', type: 'password' },
    { name: 'role', label: 'Role', type: 'select', options: ROLES },
  ], async (v) => {
    if (S.cur.users.some(u => u.username === v.username)) { toast('Username already exists.'); return; }
    S.cur.users.push({ ...v, active: true });
    logAudit('User created', `${v.name} (${v.role})`);
    await saveCollection('users'); render(); toast('Employee added.');
  });
}
async function toggleUser(username) {
  const u = S.cur.users.find(u => u.username === username);
  u.active = u.active === false ? true : false;
  logAudit('User changed', `${u.username} ${u.active ? 'enabled' : 'disabled'}`);
  await saveCollection('users'); render();
}

/* ============================================================
   TAX SETTINGS
   ============================================================ */
function screenSettings() {
  const list = S.cur.taxrates;
  return `
  <div class="row" style="margin-bottom:14px;"><button class="btn primary" onclick="openTaxModal()">+ Add tax rate</button></div>
  <div class="table-wrap"><table><thead><tr><th>Name</th><th>Rate</th><th>Mode</th><th>Default</th><th>Effective from</th><th>Status</th><th></th></tr></thead><tbody>
    ${list.map(t => `<tr><td>${escapeHtml(t.name)}</td><td class="mono">${t.rate}%</td><td>${t.mode}</td><td>${t.isDefault?'★':''}</td><td>${fmtDate(t.effectiveDate)}</td>
      <td>${t.active ? '<span class="pill status-Completed">Active</span>' : '<span class="pill status-Refunded">Inactive</span>'}</td>
      <td><button class="btn sm outline" onclick="toggleTax('${t.id}')">${t.active?'Deactivate':'Activate'}</button></td>
    </tr>`).join('')}
  </tbody></table></div>
  <div style="font-size:11.5px;color:var(--muted);margin-top:10px;">Changing or deactivating a rate here only affects future sales — every past transaction keeps the rate that was active when it was recorded.</div>
  <div class="section-title">Customer-type pricing (automatic discount at POS)</div>
  <div class="table-wrap"><table><thead><tr><th>Customer type</th><th>Automatic discount</th></tr></thead><tbody>
    ${customerTypesFor(S.cur.business).filter(x => x !== 'Walk-in').map(ty => `<tr><td>${escapeHtml(ty)}</td><td><input type="number" min="0" max="100" step="0.5" style="width:80px;" value="${(S.cur.pricing || {})[ty] || 0}" onchange="setTierPct('${ty}',this.value)"> %</td></tr>`).join('')}
  </tbody></table></div>
  <div style="font-size:11.5px;color:var(--muted);margin-top:8px;">When a customer of that type is selected at the POS, this discount is applied to the bill automatically (GST is calculated on the discounted price).</div>
  <div class="section-title">Business logo</div>
  <div class="card row" style="gap:14px;align-items:center;">
    <img src="${S.cur.business.logo || brandLogo()}" style="width:56px;height:56px;object-fit:contain;border-radius:8px;border:1px solid var(--line);background:#fff;">
    <div style="flex:1;font-size:12.5px;color:var(--muted);">Shown at the top of receipts and tax invoices.</div>
    <button class="btn outline" onclick="openLogoModal()">Change logo</button>
    ${S.cur.business.logo ? `<button class="btn outline" onclick="resetLogo()">Use default</button>` : ''}
  </div>
  <div class="section-title">Backup &amp; restore</div>
  <div class="card row" style="gap:10px;align-items:center;flex-wrap:wrap;">
    <div style="flex:1;min-width:240px;font-size:12.5px;color:var(--muted);">Data is stored in this browser only. Download a backup file regularly, and restore it here (or on another computer) if browser data is ever cleared.</div>
    <button class="btn primary" onclick="downloadBackup()">Download backup</button>
    <label class="btn outline" style="margin:0;">Restore from backup<input type="file" accept=".json,application/json" style="display:none;" onchange="handleRestoreFile(event)"></label>
  </div>`;
}
function openLogoModal() {
  openFormModal('Business logo', [{ name: 'logo', label: 'Logo (shown on receipts)', type: 'image', required: false }], async (v) => {
    S.cur.business.logo = v.logo || '';
    await saveBusinessesIndex(); render(); toast('Logo updated.');
  }, { logo: S.cur.business.logo || '' });
}
async function resetLogo() { S.cur.business.logo = ''; await saveBusinessesIndex(); render(); toast('Default logo restored.'); }
function downloadBackup() {
  const b = S.cur.business;
  const data = { app: 'POS SYSTEM', version: 1, exportedAt: new Date().toISOString(), business: { name: b.name, type: b.type, gstNo: b.gstNo, address: b.address, phone: b.phone, email: b.email, logo: b.logo || '' }, collections: {} };
  TENANT_COLLECTIONS.forEach(k => { data.collections[k] = S.cur[k]; });
  downloadBlob(JSON.stringify(data), `${b.name.replace(/[^A-Za-z0-9]+/g, '-')}-backup-${todayISO()}.json`, 'application/json');
  logAudit('Backup downloaded', 'Full company data exported');
  toast('Backup downloaded.');
}
async function restoreFromBackupObject(data) {
  if (!data || data.app !== 'POS SYSTEM' || !data.collections) throw new Error('This is not a POS SYSTEM backup file.');
  const id = S.cur.business.businessId;
  for (const k of TENANT_COLLECTIONS) {
    if (data.collections[k] !== undefined) await db.set(`biz:${id}:${k}`, data.collections[k]);
  }
  if (data.business && data.business.logo !== undefined) { S.cur.business.logo = data.business.logo; await saveBusinessesIndex(); }
  await loadTenant(id);
  const me = S.cur.users.find(u => u.username === S.session.employee.username);
  if (me) S.session.employee = me;
}
function handleRestoreFile(e) {
  const f = e.target.files && e.target.files[0];
  if (!f) return;
  const reader = new FileReader();
  reader.onload = async () => {
    try {
      const data = JSON.parse(reader.result);
      const when = data.exportedAt ? new Date(data.exportedAt).toLocaleString('en-GB') : 'unknown date';
      if (!confirm(`Restore backup of "${(data.business && data.business.name) || 'company'}" from ${when}?\n\nThis REPLACES all current data for ${S.cur.business.name}.`)) return;
      await restoreFromBackupObject(data);
      render(); toast('Backup restored.');
    } catch (err) { toast('Restore failed: ' + err.message); }
  };
  reader.readAsText(f);
  e.target.value = '';
}
function openTaxModal() {
  openFormModal('Add tax rate', [
    { name: 'name', label: 'Tax name' }, { name: 'rate', label: 'Rate (%)', type: 'number', step: '0.01' },
    { name: 'mode', label: 'Mode', type: 'select', options: [['exclusive','Tax exclusive (price + GST)'],['inclusive','Tax inclusive (GST included in price)']] },
    { name: 'effectiveDate', label: 'Effective date', type: 'date', default: todayISO() },
    { name: 'isDefault', label: 'Set as default rate for new products', type: 'checkbox' },
  ], async (v) => {
    if (v.isDefault) S.cur.taxrates.forEach(t => t.isDefault = false);
    S.cur.taxrates.push({ id: uid('tax_'), active: true, ...v });
    logAudit('GST rate added', `${v.name} — ${v.rate}%`);
    await saveCollection('taxrates'); render(); toast('Tax rate added.');
  });
}
async function toggleTax(id) { const t = S.cur.taxrates.find(t=>t.id===id); t.active = !t.active; logAudit('GST rate changed', `${t.name} ${t.active?'activated':'deactivated'}`); await saveCollection('taxrates'); render(); }

/* ============================================================
   SUBSCRIPTION MANAGEMENT (business-side)
   ============================================================ */
// Some businesses (e.g. registered but never finished the checkout step) may have
// no subscription record saved at all — db.get(...,null) returns null for those.
// Reading sub.plan / sub.history on null used to throw and silently blank the
// screen. This self-heals by giving them a default Trial record instead.
function ensureSubscription() {
  if (!S.cur.subscription) {
    const now = new Date();
    const trialExp = new Date(now.getTime() + 14 * 86400000);
    S.cur.subscription = {
      plan: 'Starter',
      status: 'Trial',
      activatedAt: now.toISOString(),
      startedAt: now.toISOString(),
      expiresAt: trialExp.toISOString(),
      history: [{ event: '14-day trial started', at: now.toISOString() }]
    };
  }
  if (!Array.isArray(S.cur.subscription.history)) S.cur.subscription.history = [];
  if (!PLANS[S.cur.subscription.plan]) S.cur.subscription.plan = 'Starter';
  return S.cur.subscription;
}
function screenSubscription() {
  const sub = ensureSubscription(); const st = subStatusOf(sub);
  const planFeatures = (PLANS[sub.plan] || {features:[]}).features;
  const started = sub.activatedAt || sub.startedAt;
  const daysRemaining = sub.expiresAt ? Math.ceil((new Date(sub.expiresAt) - new Date()) / 86400000) : null;
  return `
  ${daysRemaining !== null && daysRemaining <= 7 && daysRemaining >= 0 ? `<div class="card" style="border-color:#EAC3B8;background:#FDF1DD;color:#8A5A0E;margin-bottom:16px;font-size:13.5px;font-weight:600;">⚠ Your subscription expires in ${daysRemaining} day${daysRemaining===1?'':'s'}. <button class="link-btn" onclick="renewSubscription()">Renew now</button></div>` : ''}
  ${daysRemaining !== null && daysRemaining < 0 ? `<div class="card" style="border-color:#EAC3B8;background:#FBE7E2;color:var(--red);margin-bottom:16px;font-size:13.5px;font-weight:600;">⚠ Your subscription expired ${Math.abs(daysRemaining)} day${Math.abs(daysRemaining)===1?'':'s'} ago. <button class="link-btn" onclick="renewSubscription()">Renew now</button></div>` : ''}
  <div class="grid cols-4">
    <div class="card"><div class="label" style="font-size:12px;color:var(--muted);">Plan</div><div style="font-size:19px;font-weight:800;">${escapeHtml(sub.plan || '—')}</div></div>
    <div class="card"><div class="label" style="font-size:12px;color:var(--muted);">Status</div><div><span class="sub-badge ${st.toLowerCase()}">${st}</span></div></div>
    <div class="card"><div class="label" style="font-size:12px;color:var(--muted);">Subscription started</div><div style="font-size:14px;font-weight:700;">${started ? fmtDate(started) : '—'}</div></div>
    <div class="card"><div class="label" style="font-size:12px;color:var(--muted);">Subscription ends</div><div style="font-size:14px;font-weight:700;">${sub.expiresAt ? fmtDate(sub.expiresAt) : '—'}${daysRemaining !== null ? ` <span style="font-weight:500;color:var(--muted);font-size:11.5px;">(${daysRemaining >= 0 ? daysRemaining+' days left' : 'expired'})</span>` : ''}</div></div>
  </div>
  <div class="section-title">Benefits you're currently availing (${escapeHtml(sub.plan || '—')} plan)</div>
  <div class="card">
    <div class="grid cols-2">
      ${planFeatures.map(f => `<div style="padding:10px 12px;border:1px solid var(--line);border-radius:8px;">✓ ${escapeHtml(f)}</div>`).join('')}
    </div>
  </div>
  <div class="section-title">Change plan</div>
  <div class="grid cols-3">
    ${Object.entries(PLANS).map(([name,p]) => `<div class="plan-card ${sub.plan===name?'selected':''}">
      <h3>${name}</h3><div class="price mono">${money(p.price)}/mo</div>
      <ul>${p.features.map(f=>`<li>${escapeHtml(f)}</li>`).join('')}</ul>
      ${sub.plan===name ? `<div class="pill status-Completed" style="margin-top:8px;">Current plan</div>` : `<button class="btn outline sm" style="margin-top:8px;" onclick="changePlan('${name}')">Switch to ${name}</button>`}
    </div>`).join('')}
  </div>
  <div class="section-title">Recommended upgrades <span class="hint">Optional tools for growing businesses</span></div>
  <div class="grid cols-3">
    <div class="card"><div style="font-weight:800;font-size:14px;">Smart Inventory</div><div style="font-size:12px;color:var(--muted);margin:5px 0 10px;">Low-stock alerts, stock movement history and reorder planning.</div><button class="btn outline sm" onclick="toast('Smart Inventory upgrade selected for demo.')">Explore upgrade</button></div>
    <div class="card"><div style="font-weight:800;font-size:14px;">Advanced Analytics</div><div style="font-size:12px;color:var(--muted);margin:5px 0 10px;">Sales trends, product performance and expense insights.</div><button class="btn outline sm" onclick="toast('Advanced Analytics upgrade selected for demo.')">Explore upgrade</button></div>
    <div class="card"><div style="font-weight:800;font-size:14px;">Multi-branch Ready</div><div style="font-size:12px;color:var(--muted);margin:5px 0 10px;">Prepare separate locations, stock and staff for future expansion.</div><button class="btn outline sm" onclick="toast('Multi-branch upgrade selected for demo.')">Explore upgrade</button></div>
  </div>
  <div class="section-title">Actions</div>
  <div class="row">
    <button class="btn ${st === 'Active' ? 'outline' : 'primary'}" onclick="renewSubscription()">${st === 'Active' ? 'Renew 30 days' : 'Reactivate account (30 days)'}</button>
    <button class="btn outline" onclick="simulateExpire()">Simulate expiration</button>
    ${st !== 'Cancelled' ? `<button class="btn danger" onclick="cancelSubscription()">Cancel subscription</button>` : ''}
  </div>
  <div class="section-title">History</div>
  <div class="table-wrap"><table><thead><tr><th>Event</th><th>Date</th><th>Amount</th></tr></thead><tbody>
    ${sub.history.slice().reverse().map(h => `<tr><td>${escapeHtml(h.event)}</td><td>${fmtDate(h.at)}</td><td class="mono">${h.amount?money(h.amount):'—'}</td></tr>`).join('')}
  </tbody></table></div>`;
}
async function changePlan(name) {
  const sub = ensureSubscription();
  sub.plan = name;
  sub.history.push({ event: `Switched to ${name}`, at: new Date().toISOString(), amount: PLANS[name].price });
  logAudit('Subscription changed', `Plan switched to ${name}`);
  await saveTenant(['subscription']); render(); toast(`Plan changed to ${name}.`);
}
function openSubscriptionPayment() {
  const sub = ensureSubscription();
  const amount = PLANS[sub.plan].price;
  S.subscriptionPayment = { method: 'Card', bank: 'Bank of Bhutan', values: { cardName:'', cardNumber:'', expiry:'', cvv:'', bankAccountName:'', bankAccountNumber:'', transferReference:'' } };
  const renderPay = () => {
    const p = S.subscriptionPayment;
    const card = p.method === 'Card';
    document.getElementById('subscription-pay-body').innerHTML = `
      <div class="pay-tabs">
        <button class="pay-tab ${card?'active':''}" onclick="setSubscriptionPayMethod('Card')">💳 Card payment</button>
        <button class="pay-tab ${!card?'active':''}" onclick="setSubscriptionPayMethod('Bank')">🏦 Bank transfer</button>
      </div>
      <div class="pay-panel">
        ${card ? `
          <div class="grid cols-2">
            <div class="field"><label>Name on card</label><input id="pay-cardName" value="${escapeHtml(p.values.cardName)}" placeholder="Cardholder name"></div>
            <div class="field"><label>Card number</label><input id="pay-cardNumber" inputmode="numeric" value="${escapeHtml(p.values.cardNumber)}" placeholder="0000 0000 0000 0000"></div>
            <div class="field"><label>Expiry</label><input id="pay-expiry" value="${escapeHtml(p.values.expiry)}" placeholder="MM/YY"></div>
            <div class="field"><label>CVV</label><input id="pay-cvv" type="password" inputmode="numeric" value="${escapeHtml(p.values.cvv)}" placeholder="123"></div>
          </div>
          <div class="pay-help">For this prototype, card details are not sent to a payment gateway. Use dummy details only.</div>
        ` : `
          <div class="field"><label>Choose your Bhutan bank</label><select id="pay-bank">${['Bank of Bhutan','Bhutan National Bank','Bhutan Development Bank','Druk PNB Bank','T Bank'].map(b=>`<option ${p.bank===b?'selected':''}>${b}</option>`).join('')}</select></div>
          <div class="grid cols-2">
            <div class="field"><label>Account holder name</label><input id="pay-bankAccountName" value="${escapeHtml(p.values.bankAccountName)}" placeholder="Account holder"></div>
            <div class="field"><label>Account number</label><input id="pay-bankAccountNumber" value="${escapeHtml(p.values.bankAccountNumber)}" placeholder="Account number"></div>
          </div>
          <div class="field"><label>Transfer/reference number</label><input id="pay-transferReference" value="${escapeHtml(p.values.transferReference)}" placeholder="Reference number"></div>
          <div class="pay-help">Select your bank, enter the transfer details, and submit the reference. A real implementation should verify the transfer with the bank/payment gateway before activating the subscription.</div>
        `}
        <div class="demo-payment-note">Demo payment: this button simulates successful payment. No real money is moved and no banking credentials are verified.</div>
      </div>`;
  };
  S.subscriptionPayment.renderPay = renderPay;
  S.modal = { title: `Reactivate ${sub.plan} — ${money(amount)}`, subscriptionPayment: true };
  renderModal();
  setTimeout(renderPay, 0);
}
function setSubscriptionPayMethod(method) {
  if (!S.subscriptionPayment) return;
  S.subscriptionPayment.method = method;
  S.subscriptionPayment.renderPay();
}
async function submitSubscriptionPayment() {
  const p = S.subscriptionPayment;
  if (!p) return;
  if (p.method === 'Card') {
    p.values.cardName = document.getElementById('pay-cardName').value.trim();
    p.values.cardNumber = document.getElementById('pay-cardNumber').value.trim();
    p.values.expiry = document.getElementById('pay-expiry').value.trim();
    p.values.cvv = document.getElementById('pay-cvv').value.trim();
    if (!p.values.cardName || !p.values.cardNumber || !p.values.expiry || !p.values.cvv) { toast('Please complete all card fields.'); return; }
  } else {
    p.bank = document.getElementById('pay-bank').value;
    p.values.bankAccountName = document.getElementById('pay-bankAccountName').value.trim();
    p.values.bankAccountNumber = document.getElementById('pay-bankAccountNumber').value.trim();
    p.values.transferReference = document.getElementById('pay-transferReference').value.trim();
    if (!p.values.bankAccountName || !p.values.bankAccountNumber || !p.values.transferReference) { toast('Please complete the bank transfer fields.'); return; }
  }
  const sub = ensureSubscription();
  const exp = new Date(); exp.setDate(exp.getDate() + 30);
  sub.status = 'Active'; sub.expiresAt = exp.toISOString();
  sub.history.push({ event: `Paid by ${p.method}${p.method === 'Bank' ? ` — ${p.bank}` : ''} and reactivated 30 days`, at: new Date().toISOString(), amount: PLANS[sub.plan].price });
  logAudit('Subscription payment', `Demo ${p.method} payment completed and account reactivated for 30 days`);
  await saveTenant(['subscription']);
  S.subscriptionPayment = null;
  closeModal(); render(); toast('Payment recorded. Subscription reactivated for 30 days.');
}
async function renewSubscription() { openSubscriptionPayment(); }
async function simulateExpire() {
  const sub = ensureSubscription(); sub.expiresAt = new Date(Date.now() - 86400000).toISOString();
  sub.history.push({ event: 'Manually expired (demo)', at: new Date().toISOString() });
  logAudit('Subscription changed', 'Manually expired (demo)');
  await saveTenant(['subscription']); render(); toast('Subscription set to expired for demonstration.');
}
async function cancelSubscription() {
  if (!confirm('Cancel this subscription?')) return;
  const sub = ensureSubscription();
  sub.status = 'Cancelled';
  sub.history.push({ event: 'Cancelled', at: new Date().toISOString() });
  logAudit('Subscription changed', 'Cancelled');
  await saveTenant(['subscription']); render(); toast('Subscription cancelled.');
}
function screenRenew() { go('subscription'); return ''; }

/* ============================================================
   SAAS ADMIN PANEL
   ============================================================ */
function screenSaasAdmin() {
  const rows = S.businessesIndex;
  return `
  <div style="max-width:1100px;">
  <div class="row between"><h1 style="font-size:19px;">SaaS Admin — Registered businesses</h1><button class="btn outline" onclick="go('landing')">Exit admin</button></div>
  <div class="table-wrap" style="margin-top:14px;">
  <table><thead><tr><th>Business</th><th>Type</th><th>Business ID</th><th>Owner</th><th></th></tr></thead><tbody>
  ${rows.length ? rows.map(b => `<tr><td>${escapeHtml(b.name)}</td><td>${b.type}</td><td class="mono">${b.businessId}</td><td>${escapeHtml(b.ownerName)}</td>
    <td><button class="btn sm outline" onclick="viewBizAdmin('${b.businessId}')">View subscription</button></td></tr>`).join('') : `<tr><td colspan="5" class="empty-state">No businesses registered yet.</td></tr>`}
  </tbody></table></div>
  <div id="biz-admin-detail" style="margin-top:20px;"></div>
  </div>`;
}
async function viewBizAdmin(businessId) {
  const sub = await db.get(`biz:${businessId}:subscription`, null);
  const users = await db.get(`biz:${businessId}:users`, []);
  const st = subStatusOf(sub);
  document.getElementById('biz-admin-detail').innerHTML = `
    <div class="card">
      <div class="row between"><b>${escapeHtml(businessId)}</b><span class="sub-badge ${st.toLowerCase()}">${st}</span></div>
      <div style="margin-top:8px;font-size:13.5px;">Plan: <b>${sub?.plan||'—'}</b> · Users: ${users.length} · Expires: ${sub?sfmtDate(sub.expiresAt):'—'}</div>
      <div class="row" style="margin-top:12px;">
        <button class="btn sm outline" onclick="adminExtendTrial('${businessId}')">Extend 14 days</button>
        <button class="btn sm outline" onclick="adminSuspend('${businessId}')">Suspend</button>
        <button class="btn sm outline" onclick="adminReactivate('${businessId}')">Reactivate</button>
      </div>
    </div>`;
}
function sfmtDate(iso){ return iso? new Date(iso).toLocaleDateString('en-GB') : '—'; }
async function adminExtendTrial(id) {
  const sub = await db.get(`biz:${id}:subscription`, null); if (!sub) return;
  const exp = new Date(sub.expiresAt || Date.now()); exp.setDate(exp.getDate() + 14);
  sub.expiresAt = exp.toISOString(); sub.status = 'Active';
  sub.history.push({ event: 'Platform admin extended 14 days', at: new Date().toISOString() });
  await db.set(`biz:${id}:subscription`, sub); viewBizAdmin(id); toast('Trial extended.');
}
async function adminSuspend(id) {
  const sub = await db.get(`biz:${id}:subscription`, null); if (!sub) return;
  sub.status = 'Suspended'; sub.history.push({ event: 'Platform admin suspended business', at: new Date().toISOString() });
  await db.set(`biz:${id}:subscription`, sub); viewBizAdmin(id); toast('Business suspended.');
}
async function adminReactivate(id) {
  const sub = await db.get(`biz:${id}:subscription`, null); if (!sub) return;
  const exp = new Date(); exp.setDate(exp.getDate() + 30);
  sub.status = 'Active'; sub.expiresAt = exp.toISOString();
  sub.history.push({ event: 'Platform admin reactivated business', at: new Date().toISOString() });
  await db.set(`biz:${id}:subscription`, sub); viewBizAdmin(id); toast('Business reactivated.');
}

/* ============================================================
   ROUTER
   ============================================================ */
function render() {
  const el = document.getElementById('app');
  let html;
  if (!S.session) {
    switch (S.screen) {
      case 'register': html = screenRegister(); break;
      case 'subscribe': html = screenSubscribe(); break;
      case 'checkout': html = screenCheckout(); break;
      case 'company-login': html = screenCompanyLogin(); break;
      case 'employee-login': html = screenEmployeeLogin(); break;
      case 'saas-admin-login': html = screenSaasAdminLogin(); break;
      case 'saas-admin': html = screenSaasAdmin(); break;
      default: html = screenLanding();
    }
  } else {
    let inner;
    try {
      if (requiresActiveSub()) inner = blockedScreen();
      else switch (S.screen) {
        case 'dashboard': inner = screenDashboard(); break;
        case 'pos': inner = screenPos(); break;
        case 'receipt': inner = screenReceipt(); break;
        case 'products': case 'menu': inner = screenProducts(); break;
        case 'purchases': inner = screenInventory(); break;
        case 'inventory': inner = screenInventory(); break;
        case 'invoices': inner = screenInvoices(); break;
        case 'orders': inner = screenOrders(); break;
        case 'payments': inner = screenPayments(); break;
        case 'customers': inner = screenCustomers(); break;
        case 'suppliers': inner = screenSuppliers(); break;
        case 'expenses': inner = screenExpenses(); break;
        case 'gst': inner = screenGst(); break;
        case 'reports': inner = screenReports(); break;
        case 'users': inner = screenUsers(); break;
        case 'audit': inner = screenAudit(); break;
        case 'subscription': case 'renew': inner = screenSubscription(); break;
        case 'settings': inner = screenSettings(); break;
        default: inner = screenDashboard();
      }
    } catch (err) {
      console.error('Render error on screen', S.screen, err);
      inner = `<div class="card" style="max-width:560px;margin:40px auto;text-align:center;">
        <h2 style="margin-top:0;color:var(--red);">Something went wrong loading this page</h2>
        <p style="color:var(--muted);font-size:13px;">${escapeHtml(err && err.message || String(err))}</p>
        <button class="btn primary" onclick="go('dashboard')">Back to dashboard</button>
      </div>`;
    }
    html = shell(inner);
  }
  el.innerHTML = html + `<div id="modal-slot"></div>` + toastHTML();
  renderModal();
  // POS: keep the barcode box focused so a hardware scanner can keep scanning
  try {
    if (S.session && S.screen === 'pos' && !S.modal) {
      const si = document.getElementById('scan-input');
      if (si && typeof si.focus === 'function') si.focus();
    }
  } catch (e) { /* focus is a nicety only */ }
}

boot();

