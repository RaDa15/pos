-- Enable Extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- CreateEnum
CREATE TYPE "business_type" AS ENUM ('grocery', 'restaurant');


-- CreateEnum
CREATE TYPE "plan_code" AS ENUM ('starter', 'professional', 'enterprise');

-- CreateEnum
CREATE TYPE "subscription_status" AS ENUM ('trial', 'active', 'suspended', 'cancelled');

-- CreateEnum
CREATE TYPE "subscription_event_type" AS ENUM ('registered', 'plan_changed', 'payment_submitted', 'payment_verified', 'payment_rejected', 'cancelled', 'extended', 'suspended', 'reactivated');

-- CreateEnum
CREATE TYPE "subscription_payment_method" AS ENUM ('bank_transfer', 'mbob', 'mpay', 'tpay', 'dk_bank', 'other_wallet');

-- CreateEnum
CREATE TYPE "subscription_payment_status" AS ENUM ('pending', 'verified', 'rejected');

-- CreateEnum
CREATE TYPE "employee_role" AS ENUM ('admin', 'manager', 'cashier', 'accountant', 'inventory_officer', 'storekeeper', 'waiter', 'kitchen_staff');

-- CreateEnum
CREATE TYPE "ui_language" AS ENUM ('en', 'dz');

-- CreateEnum
CREATE TYPE "tax_mode" AS ENUM ('exclusive', 'inclusive');

-- CreateEnum
CREATE TYPE "tax_category" AS ENUM ('standard', 'zero_rated', 'exempt');

-- CreateEnum
CREATE TYPE "product_unit" AS ENUM ('pc', 'kg', 'g', 'l', 'ml', 'plate', 'box');

-- CreateEnum
CREATE TYPE "movement_type" AS ENUM ('opening_stock', 'purchase', 'stock_in', 'stock_out', 'adjustment', 'sale', 'void_restock');

-- CreateEnum
CREATE TYPE "customer_type" AS ENUM ('regular', 'vip', 'corporate', 'wholesale', 'retail', 'credit', 'government_institutional', 'online', 'delivery');

-- CreateEnum
CREATE TYPE "order_type" AS ENUM ('walk_in', 'dine_in', 'takeaway', 'delivery', 'pre_ordered', 'pre_booked');

-- CreateEnum
CREATE TYPE "kitchen_status" AS ENUM ('new', 'accepted', 'preparing', 'ready', 'served', 'cancelled');

-- CreateEnum
CREATE TYPE "sale_status" AS ENUM ('completed', 'voided');

-- CreateEnum
CREATE TYPE "bill_discount_type" AS ENUM ('percent', 'amount');

-- CreateEnum
CREATE TYPE "payment_method" AS ENUM ('cash', 'card', 'mbob', 'mpay', 'dk_bank', 'tpay', 'other_wallet', 'bank', 'credit');

-- CreateEnum
CREATE TYPE "payment_kind" AS ENUM ('sale', 'credit_settlement');

-- CreateEnum
CREATE TYPE "payment_status" AS ENUM ('completed', 'voided');

-- CreateEnum
CREATE TYPE "expense_category" AS ENUM ('rent', 'utilities', 'salaries', 'supplies', 'maintenance', 'marketing', 'other');

-- CreateEnum
CREATE TYPE "expense_payment_method" AS ENUM ('cash', 'card', 'bank_transfer', 'mobile_wallet', 'other');

-- CreateEnum
CREATE TYPE "counter_name" AS ENUM ('invoice', 'kot', 'credit_settlement', 'purchase');

-- CreateTable
CREATE TABLE "platform_admins" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "totp_secret_enc" TEXT,
    "totp_enabled" BOOLEAN NOT NULL DEFAULT false,
    "must_change_password" BOOLEAN NOT NULL DEFAULT true,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "last_login_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "platform_admins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "businesses" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "business_code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "name_key" TEXT NOT NULL,
    "type" "business_type" NOT NULL,
    "owner_name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "address" TEXT,
    "gst_no" TEXT,
    "gst_registered" BOOLEAN NOT NULL DEFAULT false,
    "logo_path" TEXT,
    "password_hash" TEXT NOT NULL,
    "must_change_password" BOOLEAN NOT NULL DEFAULT false,
    "is_demo" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "businesses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "business_id" UUID NOT NULL,
    "plan" "plan_code" NOT NULL,
    "status" "subscription_status" NOT NULL DEFAULT 'trial',
    "started_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "business_id" UUID NOT NULL,
    "event" "subscription_event_type" NOT NULL,
    "plan" "plan_code",
    "amount" DECIMAL(12,2),
    "detail" TEXT,
    "actor_employee_id" UUID,
    "actor_platform_admin_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscription_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription_payments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "business_id" UUID NOT NULL,
    "plan" "plan_code" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "method" "subscription_payment_method" NOT NULL,
    "bank_name" TEXT,
    "reference" TEXT NOT NULL,
    "paid_on" DATE NOT NULL,
    "status" "subscription_payment_status" NOT NULL DEFAULT 'pending',
    "submitted_by" UUID NOT NULL,
    "reviewed_by" UUID,
    "reviewed_at" TIMESTAMPTZ,
    "reject_reason" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscription_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employees" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "business_id" UUID NOT NULL,
    "username" TEXT NOT NULL,
    "username_key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "employee_role" NOT NULL,
    "password_hash" TEXT NOT NULL,
    "must_change_password" BOOLEAN NOT NULL DEFAULT false,
    "language" "ui_language" NOT NULL DEFAULT 'en',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "failed_login_count" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMPTZ,
    "last_login_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "employees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tax_rates" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "business_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "rate" DECIMAL(5,2) NOT NULL,
    "mode" "tax_mode" NOT NULL DEFAULT 'exclusive',
    "category" "tax_category" NOT NULL DEFAULT 'standard',
    "effective_date" DATE NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "tax_rates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "business_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'Uncategorized',
    "barcode" TEXT NOT NULL,
    "image_path" TEXT,
    "purchase_price" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "sell_price" DECIMAL(12,2) NOT NULL,
    "tax_rate_id" UUID NOT NULL,
    "unit" "product_unit" NOT NULL DEFAULT 'pc',
    "track_stock" BOOLEAN NOT NULL DEFAULT true,
    "stock" INTEGER NOT NULL DEFAULT 0,
    "min_stock" INTEGER NOT NULL DEFAULT 0,
    "supplier_id" UUID,
    "batch_no" TEXT,
    "expiry_date" DATE,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_movements" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "business_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "type" "movement_type" NOT NULL,
    "qty" INTEGER NOT NULL,
    "stock_after" INTEGER NOT NULL,
    "reason" TEXT,
    "sale_id" UUID,
    "purchase_id" UUID,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "suppliers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "business_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "notes" TEXT,
    "opening_paid" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "opening_outstanding" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchases" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "business_id" UUID NOT NULL,
    "purchase_no" TEXT NOT NULL,
    "supplier_id" UUID NOT NULL,
    "purchase_date" DATE NOT NULL,
    "total" DECIMAL(12,2) NOT NULL,
    "amount_paid" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "note" TEXT,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "purchases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "purchase_id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "qty" INTEGER NOT NULL,
    "unit_cost" DECIMAL(12,2) NOT NULL,
    "line_total" DECIMAL(12,2) NOT NULL,
    "batch_no" TEXT,
    "expiry_date" DATE,

    CONSTRAINT "purchase_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "business_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "type" "customer_type" NOT NULL DEFAULT 'regular',
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "gst_id" TEXT,
    "credit_limit" DECIMAL(12,2),
    "total_spent" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "outstanding_balance" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_type_discounts" (
    "business_id" UUID NOT NULL,
    "customer_type" "customer_type" NOT NULL,
    "discount_pct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_type_discounts_pkey" PRIMARY KEY ("business_id","customer_type")
);

-- CreateTable
CREATE TABLE "sales" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "business_id" UUID NOT NULL,
    "invoice_no" TEXT NOT NULL,
    "invoice_year" INTEGER NOT NULL,
    "invoice_seq" INTEGER NOT NULL,
    "status" "sale_status" NOT NULL DEFAULT 'completed',
    "completed_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "business_date" DATE NOT NULL,
    "cashier_id" UUID NOT NULL,
    "customer_id" UUID,
    "customer_type" "customer_type",
    "order_type" "order_type" NOT NULL,
    "table_no" TEXT,
    "kitchen_order_id" UUID,
    "gst_registered" BOOLEAN NOT NULL,
    "subtotal" DECIMAL(12,2) NOT NULL,
    "discount_total" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "customer_type_pct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "customer_type_amt" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "bill_discount_type" "bill_discount_type",
    "bill_discount_value" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "bill_discount_amt" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "taxable_amount" DECIMAL(12,2) NOT NULL,
    "tax_amount" DECIMAL(12,2) NOT NULL,
    "charges" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(12,2) NOT NULL,
    "amount_paid" DECIMAL(12,2) NOT NULL,
    "credit_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "payment_summary" TEXT NOT NULL,
    "voided_at" TIMESTAMPTZ,
    "voided_by" UUID,
    "void_reason" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "sale_id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "line_no" INTEGER NOT NULL,
    "product_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "barcode" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "unit_price" DECIMAL(12,2) NOT NULL,
    "qty" INTEGER NOT NULL,
    "line_discount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "allocated_discount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "tax_rate" DECIMAL(5,2) NOT NULL,
    "tax_mode" "tax_mode" NOT NULL,
    "tax_category" "tax_category" NOT NULL,
    "taxable" DECIMAL(12,2) NOT NULL,
    "tax" DECIMAL(12,2) NOT NULL,
    "total" DECIMAL(12,2) NOT NULL,
    "unit_cost" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "track_stock" BOOLEAN NOT NULL,

    CONSTRAINT "sale_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "business_id" UUID NOT NULL,
    "kind" "payment_kind" NOT NULL,
    "sale_id" UUID,
    "receipt_no" TEXT,
    "customer_id" UUID,
    "method" "payment_method" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "cash_received" DECIMAL(12,2),
    "change_given" DECIMAL(12,2),
    "fee" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "bank_name" TEXT,
    "journal_no" TEXT,
    "remarks" TEXT,
    "status" "payment_status" NOT NULL DEFAULT 'completed',
    "business_date" DATE NOT NULL,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "voided_at" TIMESTAMPTZ,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "counters" (
    "business_id" UUID NOT NULL,
    "name" "counter_name" NOT NULL,
    "year" INTEGER NOT NULL DEFAULT 0,
    "value" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "counters_pkey" PRIMARY KEY ("business_id","name","year")
);

-- CreateTable
CREATE TABLE "kitchen_orders" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "business_id" UUID NOT NULL,
    "order_no" TEXT NOT NULL,
    "order_type" "order_type" NOT NULL,
    "table_no" TEXT,
    "note" TEXT,
    "status" "kitchen_status" NOT NULL DEFAULT 'new',
    "billed" BOOLEAN NOT NULL DEFAULT false,
    "sale_id" UUID,
    "customer_id" UUID,
    "created_by" UUID NOT NULL,
    "status_changed_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "kitchen_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kitchen_order_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "kitchen_order_id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "qty" INTEGER NOT NULL,

    CONSTRAINT "kitchen_order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "held_orders" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "business_id" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "held_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expenses" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "business_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "category" "expense_category" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "business_date" DATE NOT NULL,
    "payment_method" "expense_payment_method" NOT NULL DEFAULT 'cash',
    "description" TEXT,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "expenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "business_id" UUID,
    "actor_employee_id" UUID,
    "actor_platform_admin_id" UUID,
    "actor_name" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entity_type" TEXT,
    "entity_id" TEXT,
    "detail" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "idempotency_keys" (
    "business_id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "employee_id" UUID NOT NULL,
    "route" TEXT NOT NULL,
    "status_code" INTEGER NOT NULL,
    "response" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "idempotency_keys_pkey" PRIMARY KEY ("business_id","key")
);

-- CreateIndex
CREATE UNIQUE INDEX "platform_admins_email_key" ON "platform_admins"("email");

-- CreateIndex
CREATE UNIQUE INDEX "businesses_business_code_key" ON "businesses"("business_code");

-- CreateIndex
CREATE UNIQUE INDEX "businesses_name_key_key" ON "businesses"("name_key");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_business_id_key" ON "subscriptions"("business_id");

-- CreateIndex
CREATE INDEX "subscription_events_business_id_created_at_idx" ON "subscription_events"("business_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "subscription_payments_status_created_at_idx" ON "subscription_payments"("status", "created_at");

-- CreateIndex
CREATE INDEX "subscription_payments_business_id_created_at_idx" ON "subscription_payments"("business_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "employees_business_id_role_active_idx" ON "employees"("business_id", "role", "active");

-- CreateIndex
CREATE UNIQUE INDEX "employees_business_id_username_key_key" ON "employees"("business_id", "username_key");

-- CreateIndex
CREATE INDEX "tax_rates_business_id_active_idx" ON "tax_rates"("business_id", "active");

-- CreateIndex
CREATE INDEX "products_business_id_active_name_idx" ON "products"("business_id", "active", "name");

-- CreateIndex
CREATE INDEX "products_business_id_category_idx" ON "products"("business_id", "category");

-- CreateIndex
CREATE UNIQUE INDEX "products_business_id_barcode_key" ON "products"("business_id", "barcode");

-- CreateIndex
CREATE INDEX "stock_movements_business_id_product_id_created_at_idx" ON "stock_movements"("business_id", "product_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "stock_movements_business_id_created_at_idx" ON "stock_movements"("business_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "purchases_business_id_supplier_id_purchase_date_idx" ON "purchases"("business_id", "supplier_id", "purchase_date" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "purchases_business_id_purchase_no_key" ON "purchases"("business_id", "purchase_no");

-- CreateIndex
CREATE INDEX "purchase_items_purchase_id_idx" ON "purchase_items"("purchase_id");

-- CreateIndex
CREATE INDEX "purchase_items_business_id_product_id_idx" ON "purchase_items"("business_id", "product_id");

-- CreateIndex
CREATE INDEX "customers_business_id_active_name_idx" ON "customers"("business_id", "active", "name");

-- CreateIndex
CREATE INDEX "customers_business_id_phone_idx" ON "customers"("business_id", "phone");

-- CreateIndex
CREATE UNIQUE INDEX "sales_kitchen_order_id_key" ON "sales"("kitchen_order_id");

-- CreateIndex
CREATE INDEX "sales_business_id_business_date_idx" ON "sales"("business_id", "business_date");

-- CreateIndex
CREATE INDEX "sales_business_id_status_completed_at_idx" ON "sales"("business_id", "status", "completed_at");

-- CreateIndex
CREATE INDEX "sales_business_id_customer_id_completed_at_idx" ON "sales"("business_id", "customer_id", "completed_at" DESC);

-- CreateIndex
CREATE INDEX "sales_business_id_cashier_id_business_date_idx" ON "sales"("business_id", "cashier_id", "business_date");

-- CreateIndex
CREATE UNIQUE INDEX "sales_business_id_invoice_no_key" ON "sales"("business_id", "invoice_no");

-- CreateIndex
CREATE UNIQUE INDEX "sales_business_id_invoice_year_invoice_seq_key" ON "sales"("business_id", "invoice_year", "invoice_seq");

-- CreateIndex
CREATE INDEX "sale_items_business_id_product_id_idx" ON "sale_items"("business_id", "product_id");

-- CreateIndex
CREATE UNIQUE INDEX "sale_items_sale_id_line_no_key" ON "sale_items"("sale_id", "line_no");

-- CreateIndex
CREATE INDEX "payments_business_id_business_date_status_idx" ON "payments"("business_id", "business_date", "status");

-- CreateIndex
CREATE INDEX "payments_business_id_sale_id_idx" ON "payments"("business_id", "sale_id");

-- CreateIndex
CREATE INDEX "payments_business_id_customer_id_kind_idx" ON "payments"("business_id", "customer_id", "kind");

-- CreateIndex
CREATE INDEX "kitchen_orders_business_id_status_created_at_idx" ON "kitchen_orders"("business_id", "status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "kitchen_orders_business_id_order_no_key" ON "kitchen_orders"("business_id", "order_no");

-- CreateIndex
CREATE INDEX "kitchen_order_items_kitchen_order_id_idx" ON "kitchen_order_items"("kitchen_order_id");

-- CreateIndex
CREATE INDEX "kitchen_order_items_business_id_product_id_idx" ON "kitchen_order_items"("business_id", "product_id");

-- CreateIndex
CREATE INDEX "held_orders_business_id_created_at_idx" ON "held_orders"("business_id", "created_at");

-- CreateIndex
CREATE INDEX "expenses_business_id_business_date_idx" ON "expenses"("business_id", "business_date");

-- CreateIndex
CREATE INDEX "audit_logs_business_id_created_at_idx" ON "audit_logs"("business_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "audit_logs_business_id_action_created_at_idx" ON "audit_logs"("business_id", "action", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_events" ADD CONSTRAINT "subscription_events_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_events" ADD CONSTRAINT "subscription_events_actor_employee_id_fkey" FOREIGN KEY ("actor_employee_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_events" ADD CONSTRAINT "subscription_events_actor_platform_admin_id_fkey" FOREIGN KEY ("actor_platform_admin_id") REFERENCES "platform_admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_payments" ADD CONSTRAINT "subscription_payments_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_payments" ADD CONSTRAINT "subscription_payments_submitted_by_fkey" FOREIGN KEY ("submitted_by") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_payments" ADD CONSTRAINT "subscription_payments_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "platform_admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tax_rates" ADD CONSTRAINT "tax_rates_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_tax_rate_id_fkey" FOREIGN KEY ("tax_rate_id") REFERENCES "tax_rates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_purchase_id_fkey" FOREIGN KEY ("purchase_id") REFERENCES "purchases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_items" ADD CONSTRAINT "purchase_items_purchase_id_fkey" FOREIGN KEY ("purchase_id") REFERENCES "purchases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_items" ADD CONSTRAINT "purchase_items_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_items" ADD CONSTRAINT "purchase_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_type_discounts" ADD CONSTRAINT "customer_type_discounts_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_cashier_id_fkey" FOREIGN KEY ("cashier_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_kitchen_order_id_fkey" FOREIGN KEY ("kitchen_order_id") REFERENCES "kitchen_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_voided_by_fkey" FOREIGN KEY ("voided_by") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "counters" ADD CONSTRAINT "counters_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kitchen_orders" ADD CONSTRAINT "kitchen_orders_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kitchen_orders" ADD CONSTRAINT "kitchen_orders_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kitchen_orders" ADD CONSTRAINT "kitchen_orders_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kitchen_orders" ADD CONSTRAINT "kitchen_orders_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kitchen_order_items" ADD CONSTRAINT "kitchen_order_items_kitchen_order_id_fkey" FOREIGN KEY ("kitchen_order_id") REFERENCES "kitchen_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kitchen_order_items" ADD CONSTRAINT "kitchen_order_items_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kitchen_order_items" ADD CONSTRAINT "kitchen_order_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "held_orders" ADD CONSTRAINT "held_orders_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "held_orders" ADD CONSTRAINT "held_orders_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_employee_id_fkey" FOREIGN KEY ("actor_employee_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_platform_admin_id_fkey" FOREIGN KEY ("actor_platform_admin_id") REFERENCES "platform_admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Raw SQL additions: sessions table, partial unique indexes, trigram index, check constraints
-- ---------------------------------------------------------------------------

-- 1. Sessions table (connect-pg-simple)
CREATE TABLE IF NOT EXISTS "sessions" (
  "sid" varchar NOT NULL COLLATE "default",
  "sess" json NOT NULL,
  "expire" timestamp(6) NOT NULL,
  CONSTRAINT "session_pkey" PRIMARY KEY ("sid")
);
CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "sessions" ("expire");

-- 2. Partial unique index on tax_rates (only one default rate per business)
CREATE UNIQUE INDEX IF NOT EXISTS "idx_tax_rates_business_default" ON "tax_rates" ("business_id") WHERE "is_default" = true;

-- 3. Partial unique index on payments (receipt_no unique per business when not null)
CREATE UNIQUE INDEX IF NOT EXISTS "idx_payments_business_receipt_no" ON "payments" ("business_id", "receipt_no") WHERE "receipt_no" IS NOT NULL;

-- 4. Trigram index on products.name for search
CREATE INDEX IF NOT EXISTS "idx_products_name_trgm" ON "products" USING gin ("name" gin_trgm_ops);

-- 5. Check constraints
ALTER TABLE "products" ADD CONSTRAINT "chk_products_stock" CHECK ("stock" >= 0);
ALTER TABLE "products" ADD CONSTRAINT "chk_products_sell_price" CHECK ("sell_price" > 0);
ALTER TABLE "products" ADD CONSTRAINT "chk_products_purchase_price" CHECK ("purchase_price" >= 0);

ALTER TABLE "customers" ADD CONSTRAINT "chk_customers_balance" CHECK ("outstanding_balance" >= 0);

ALTER TABLE "sales" ADD CONSTRAINT "chk_sales_total_payment" CHECK ("amount_paid" + "credit_amount" = "total");
ALTER TABLE "sales" ADD CONSTRAINT "chk_sales_total_taxable" CHECK ("taxable_amount" + "tax_amount" + "charges" = "total");

