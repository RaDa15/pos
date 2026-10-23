import { describe, expect, it } from 'vitest';
import { EMPLOYEE_ROLES, type EmployeeRole } from './enums.js';
import {
  hasPermission,
  PERMISSION_KEYS,
} from './permissions.js';

describe('Permissions Matrix (05-SECURITY-ACCESS.md §3)', () => {
  it('snapshots the complete role-permission matrix', () => {
    const matrix: Record<string, Record<string, boolean>> = {};

    for (const role of EMPLOYEE_ROLES) {
      matrix[role] = {};
      for (const perm of PERMISSION_KEYS) {
        matrix[role][perm] = hasPermission(role, perm);
      }
    }

    expect(matrix).toMatchSnapshot();
  });

  it('verifies explicit permissions for Admin', () => {
    for (const perm of PERMISSION_KEYS) {
      expect(hasPermission('admin', perm)).toBe(true);
    }
  });

  it('verifies void permission is restricted to admin and manager only', () => {
    expect(hasPermission('admin', 'sales.void')).toBe(true);
    expect(hasPermission('manager', 'sales.void')).toBe(true);
    expect(hasPermission('cashier', 'sales.void')).toBe(false);
    expect(hasPermission('accountant', 'sales.void')).toBe(false);
    expect(hasPermission('inventory_officer', 'sales.void')).toBe(false);
    expect(hasPermission('storekeeper', 'sales.void')).toBe(false);
    expect(hasPermission('waiter', 'sales.void')).toBe(false);
    expect(hasPermission('kitchen_staff', 'sales.void')).toBe(false);
  });

  it('returns false for unknown role', () => {
    expect(hasPermission('unknown' as unknown as EmployeeRole, 'dashboard.view')).toBe(false);
  });
});
