/**
 * System Enums and Labels
 * Reference: docs/06-BACKEND-SCHEMA.md §4.
 *
 * All database enum types and their human-readable English UI labels.
 */

export const BUSINESS_TYPES = ['grocery', 'restaurant'] as const;
export type BusinessType = (typeof BUSINESS_TYPES)[number];
export const BUSINESS_TYPE_LABELS: Record<BusinessType, string> = {
  grocery: 'Grocery / Retail Store',
  restaurant: 'Restaurant / Café',
};

export const PLAN_CODES = ['starter', 'professional', 'enterprise'] as const;
export type PlanCode = (typeof PLAN_CODES)[number];
export const PLAN_CODE_LABELS: Record<PlanCode, string> = {
  starter: 'Starter',
  professional: 'Professional',
  enterprise: 'Enterprise',
};

export const SUBSCRIPTION_STATUSES = ['trial', 'active', 'suspended', 'cancelled'] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];
export type EffectiveSubscriptionStatus = SubscriptionStatus | 'expired';
export const SUBSCRIPTION_STATUS_LABELS: Record<EffectiveSubscriptionStatus, string> = {
  trial: 'Trial',
  active: 'Active',
  suspended: 'Suspended',
  cancelled: 'Cancelled',
  expired: 'Expired',
};

export const SUBSCRIPTION_EVENT_TYPES = [
  'registered',
  'plan_changed',
  'payment_submitted',
  'payment_verified',
  'payment_rejected',
  'cancelled',
  'extended',
  'suspended',
  'reactivated',
] as const;
export type SubscriptionEventType = (typeof SUBSCRIPTION_EVENT_TYPES)[number];

export const SUBSCRIPTION_PAYMENT_METHODS = [
  'bank_transfer',
  'mbob',
  'mpay',
  'tpay',
  'dk_bank',
  'other_wallet',
] as const;
export type SubscriptionPaymentMethod = (typeof SUBSCRIPTION_PAYMENT_METHODS)[number];
export const SUBSCRIPTION_PAYMENT_METHOD_LABELS: Record<SubscriptionPaymentMethod, string> = {
  bank_transfer: 'Bank Transfer',
  mbob: 'mBoB',
  mpay: 'mPay',
  tpay: 'TPay',
  dk_bank: 'DK Bank',
  other_wallet: 'Other Wallet',
};

export const SUBSCRIPTION_PAYMENT_STATUSES = ['pending', 'verified', 'rejected'] as const;
export type SubscriptionPaymentStatus = (typeof SUBSCRIPTION_PAYMENT_STATUSES)[number];
export const SUBSCRIPTION_PAYMENT_STATUS_LABELS: Record<SubscriptionPaymentStatus, string> = {
  pending: 'Pending Verification',
  verified: 'Verified',
  rejected: 'Rejected',
};

export const EMPLOYEE_ROLES = [
  'admin',
  'manager',
  'cashier',
  'accountant',
  'inventory_officer',
  'storekeeper',
  'waiter',
  'kitchen_staff',
] as const;
export type EmployeeRole = (typeof EMPLOYEE_ROLES)[number];
export const EMPLOYEE_ROLE_LABELS: Record<EmployeeRole, string> = {
  admin: 'Admin',
  manager: 'Manager',
  cashier: 'Cashier',
  accountant: 'Accountant',
  inventory_officer: 'Inventory Officer',
  storekeeper: 'Storekeeper',
  waiter: 'Waiter',
  kitchen_staff: 'Kitchen Staff',
};

export const UI_LANGUAGES = ['en', 'dz'] as const;
export type UILanguage = (typeof UI_LANGUAGES)[number];
export const UI_LANGUAGE_LABELS: Record<UILanguage, string> = {
  en: 'English',
  dz: 'རྫོང་ཁ (Dzongkha)',
};

export const TAX_MODES = ['exclusive', 'inclusive'] as const;
export type TaxMode = (typeof TAX_MODES)[number];
export const TAX_MODE_LABELS: Record<TaxMode, string> = {
  exclusive: 'Exclusive (GST added on top)',
  inclusive: 'Inclusive (GST included in price)',
};

export const TAX_CATEGORIES = ['standard', 'zero_rated', 'exempt'] as const;
export type TaxCategory = (typeof TAX_CATEGORIES)[number];
export const TAX_CATEGORY_LABELS: Record<TaxCategory, string> = {
  standard: 'Standard Rated',
  zero_rated: 'Zero Rated (0%)',
  exempt: 'Exempt (Non-taxable)',
};

export const PRODUCT_UNITS = ['pc', 'kg', 'g', 'l', 'ml', 'plate', 'box'] as const;
export type ProductUnit = (typeof PRODUCT_UNITS)[number];
export const PRODUCT_UNIT_LABELS: Record<ProductUnit, string> = {
  pc: 'Piece (pc)',
  kg: 'Kilogram (kg)',
  g: 'Gram (g)',
  l: 'Litre (l)',
  ml: 'Millilitre (ml)',
  plate: 'Plate',
  box: 'Box',
};

export const MOVEMENT_TYPES = [
  'opening_stock',
  'purchase',
  'stock_in',
  'stock_out',
  'adjustment',
  'sale',
  'void_restock',
] as const;
export type MovementType = (typeof MOVEMENT_TYPES)[number];
export const MOVEMENT_TYPE_LABELS: Record<MovementType, string> = {
  opening_stock: 'Opening Stock',
  purchase: 'Supplier Purchase',
  stock_in: 'Stock In',
  stock_out: 'Stock Out',
  adjustment: 'Stock Adjustment',
  sale: 'Sale Checkout',
  void_restock: 'Sale Void Restock',
};

export const CUSTOMER_TYPES = [
  'regular',
  'vip',
  'corporate',
  'wholesale',
  'retail',
  'credit',
  'government_institutional',
  'online',
  'delivery',
] as const;
export type CustomerType = (typeof CUSTOMER_TYPES)[number];
export const CUSTOMER_TYPE_LABELS: Record<CustomerType, string> = {
  regular: 'Regular Customer',
  vip: 'VIP Customer',
  corporate: 'Corporate Customer',
  wholesale: 'Wholesale Customer',
  retail: 'Retail Customer',
  credit: 'Credit Customer',
  government_institutional: 'Government / Institutional Customer',
  online: 'Online Customer',
  delivery: 'Delivery Customer',
};

export const ORDER_TYPES = [
  'walk_in',
  'dine_in',
  'takeaway',
  'delivery',
  'pre_ordered',
  'pre_booked',
] as const;
export type OrderType = (typeof ORDER_TYPES)[number];
export const ORDER_TYPE_LABELS: Record<OrderType, string> = {
  walk_in: 'Walk-in',
  dine_in: 'Dine-in',
  takeaway: 'Takeaway',
  delivery: 'Delivery',
  pre_ordered: 'Pre-ordered',
  pre_booked: 'Pre-booked',
};

export const KITCHEN_STATUSES = [
  'new',
  'accepted',
  'preparing',
  'ready',
  'served',
  'cancelled',
] as const;
export type KitchenStatus = (typeof KITCHEN_STATUSES)[number];
export const KITCHEN_STATUS_LABELS: Record<KitchenStatus, string> = {
  new: 'New',
  accepted: 'Accepted',
  preparing: 'Preparing',
  ready: 'Ready',
  served: 'Served',
  cancelled: 'Cancelled',
};

export const SALE_STATUSES = ['completed', 'voided'] as const;
export type SaleStatus = (typeof SALE_STATUSES)[number];
export const SALE_STATUS_LABELS: Record<SaleStatus, string> = {
  completed: 'Completed',
  voided: 'Voided',
};

export const BILL_DISCOUNT_TYPES = ['percent', 'amount'] as const;
export type BillDiscountType = (typeof BILL_DISCOUNT_TYPES)[number];

export const PAYMENT_METHODS = [
  'cash',
  'card',
  'mbob',
  'mpay',
  'dk_bank',
  'tpay',
  'other_wallet',
  'bank',
  'credit',
] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: 'Cash',
  card: 'Card',
  mbob: 'mBoB',
  mpay: 'mPay',
  dk_bank: 'DK Bank',
  tpay: 'TPay',
  other_wallet: 'Other Wallet',
  bank: 'Bank Transfer',
  credit: 'On Credit',
};

export const PAYMENT_KINDS = ['sale', 'credit_settlement'] as const;
export type PaymentKind = (typeof PAYMENT_KINDS)[number];

export const PAYMENT_STATUSES = ['completed', 'voided'] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const EXPENSE_CATEGORIES = [
  'rent',
  'utilities',
  'salaries',
  'supplies',
  'maintenance',
  'marketing',
  'other',
] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];
export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  rent: 'Rent',
  utilities: 'Utilities (Electricity, Water, Internet)',
  salaries: 'Salaries & Wages',
  supplies: 'Operating Supplies',
  maintenance: 'Repairs & Maintenance',
  marketing: 'Marketing & Advertising',
  other: 'Other Operating Expenses',
};

export const EXPENSE_PAYMENT_METHODS = [
  'cash',
  'card',
  'bank_transfer',
  'mobile_wallet',
  'other',
] as const;
export type ExpensePaymentMethod = (typeof EXPENSE_PAYMENT_METHODS)[number];
export const EXPENSE_PAYMENT_METHOD_LABELS: Record<ExpensePaymentMethod, string> = {
  cash: 'Cash',
  card: 'Credit / Debit Card',
  bank_transfer: 'Bank Transfer',
  mobile_wallet: 'Mobile Wallet (mBoB, mPay, TPay)',
  other: 'Other',
};

export const COUNTER_NAMES = ['invoice', 'kot', 'credit_settlement', 'purchase'] as const;
export type CounterName = (typeof COUNTER_NAMES)[number];

export const BHUTAN_BANKS = [
  'Bank of Bhutan',
  'Bhutan National Bank',
  'Bhutan Development Bank',
  'Druk PNB Bank',
  'T Bank',
  'DK Bank',
] as const;
export type BhutanBank = (typeof BHUTAN_BANKS)[number];
