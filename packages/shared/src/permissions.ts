/**
 * Role-Based Access Control and Permission Matrix
 * Reference: docs/05-SECURITY-ACCESS.md §3.
 */

import { EmployeeRole } from './enums.js';

export const PERMISSION_KEYS = [
  'dashboard.view',
  'pos.sell',
  'kitchen.view',
  'kitchen.create',
  'kitchen.update',
  'sales.view',
  'sales.void',
  'products.view',
  'products.manage',
  'products.import_export',
  'inventory.view',
  'inventory.adjust',
  'purchases.manage',
  'suppliers.view',
  'suppliers.manage',
  'customers.view',
  'customers.manage',
  'customers.settle',
  'payments.view',
  'reports.gst',
  'reports.sales',
  'expenses.view',
  'expenses.manage',
  'employees.manage',
  'settings.manage',
  'subscription.manage',
  'audit.view',
  'data.export_import',
  'me.manage',
] as const;

export type PermissionKey = (typeof PERMISSION_KEYS)[number];

export const PLATFORM_PERMISSION_KEYS = [
  'platform.businesses.view',
  'platform.subscriptions.manage',
  'platform.businesses.reset_password',
  'platform.admins.manage',
] as const;

export type PlatformPermissionKey = (typeof PLATFORM_PERMISSION_KEYS)[number];

/**
 * Exact Role-Permission mapping from docs/05-SECURITY-ACCESS.md §3.
 */
export const ROLE_PERMISSIONS: Record<EmployeeRole, readonly PermissionKey[]> = {
  admin: PERMISSION_KEYS, // Adm has access to all business permissions
  manager: [
    'dashboard.view',
    'pos.sell',
    'kitchen.view',
    'kitchen.create',
    'kitchen.update',
    'sales.view',
    'sales.void',
    'products.view',
    'products.manage',
    'products.import_export',
    'inventory.view',
    'inventory.adjust',
    'purchases.manage',
    'suppliers.view',
    'suppliers.manage',
    'customers.view',
    'customers.manage',
    'customers.settle',
    'payments.view',
    'reports.gst',
    'reports.sales',
    'expenses.view',
    'expenses.manage',
    'me.manage',
  ],
  cashier: [
    'dashboard.view',
    'pos.sell',
    'kitchen.view',
    'kitchen.create',
    'kitchen.update',
    'sales.view',
    'customers.view',
    'customers.manage',
    'customers.settle',
    'me.manage',
  ],
  accountant: [
    'dashboard.view',
    'sales.view',
    'suppliers.view',
    'customers.view',
    'customers.settle',
    'payments.view',
    'reports.gst',
    'reports.sales',
    'expenses.view',
    'expenses.manage',
    'me.manage',
  ],
  inventory_officer: [
    'dashboard.view',
    'products.view',
    'products.manage',
    'products.import_export',
    'inventory.view',
    'inventory.adjust',
    'purchases.manage',
    'suppliers.view',
    'me.manage',
  ],
  storekeeper: [
    'dashboard.view',
    'products.view',
    'products.manage',
    'products.import_export',
    'inventory.view',
    'inventory.adjust',
    'purchases.manage',
    'suppliers.view',
    'me.manage',
  ],
  waiter: [
    'dashboard.view',
    'pos.sell',
    'kitchen.view',
    'kitchen.create',
    'kitchen.update',
    'sales.view', // Note: Waiter's view is limited to own sales in API handler
    'me.manage',
  ],
  kitchen_staff: [
    'dashboard.view',
    'kitchen.view',
    'kitchen.update',
    'me.manage',
  ],
};

/**
 * Checks whether an employee role has the specified permission.
 */
export function hasPermission(role: EmployeeRole, permission: PermissionKey): boolean {
  const allowed = ROLE_PERMISSIONS[role];
  return allowed ? allowed.includes(permission) : false;
}
