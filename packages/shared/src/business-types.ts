/**
 * Business Type Configurations
 * Reference: docs/02-BUSINESS-RULES.md §3.5, BR-09, BR-35.
 *
 * Specific customer types, order types, screens, and defaults per business type.
 */

import { BusinessType, CustomerType, OrderType, ProductUnit } from './enums.js';

export interface BusinessTypeConfig {
  type: BusinessType;
  allowedCustomerTypes: CustomerType[];
  allowedOrderTypes: OrderType[];
  defaultOrderType: OrderType;
  kitchenOrderTypes: OrderType[];
  navigationScreens: string[];
  defaultTrackStock: (unit: ProductUnit) => boolean;
}

export const GROCERY_CONFIG: BusinessTypeConfig = {
  type: 'grocery',
  allowedCustomerTypes: [
    'regular',
    'vip',
    'corporate',
    'wholesale',
    'retail',
    'credit',
    'government_institutional',
    'online',
  ],
  allowedOrderTypes: ['walk_in', 'pre_ordered', 'pre_booked', 'takeaway'],
  defaultOrderType: 'walk_in',
  kitchenOrderTypes: [],
  navigationScreens: ['products', 'purchases'],
  defaultTrackStock: () => true,
};

export const RESTAURANT_CONFIG: BusinessTypeConfig = {
  type: 'restaurant',
  allowedCustomerTypes: [
    'regular',
    'vip',
    'corporate',
    'credit',
    'government_institutional',
    'online',
    'delivery',
  ],
  allowedOrderTypes: ['dine_in', 'takeaway', 'delivery', 'pre_ordered', 'walk_in'],
  defaultOrderType: 'dine_in',
  kitchenOrderTypes: ['dine_in', 'takeaway', 'delivery', 'pre_ordered'],
  navigationScreens: ['kitchen_orders', 'menu'],
  // BR-09: Defaults: grocery -> true; restaurant -> false for unit 'plate', true otherwise
  defaultTrackStock: (unit: ProductUnit) => unit !== 'plate',
};

export const BUSINESS_TYPE_CONFIGS: Record<BusinessType, BusinessTypeConfig> = {
  grocery: GROCERY_CONFIG,
  restaurant: RESTAURANT_CONFIG,
};

/**
 * Gets configuration for a given business type.
 */
export function getBusinessTypeConfig(type: BusinessType): BusinessTypeConfig {
  return BUSINESS_TYPE_CONFIGS[type] ?? GROCERY_CONFIG;
}

/**
 * Checks whether an order type is valid for a business type.
 */
export function isOrderTypeAllowed(businessType: BusinessType, orderType: OrderType): boolean {
  return getBusinessTypeConfig(businessType).allowedOrderTypes.includes(orderType);
}

/**
 * Checks whether a customer type is valid for a business type.
 */
export function isCustomerTypeAllowed(businessType: BusinessType, customerType: CustomerType): boolean {
  return getBusinessTypeConfig(businessType).allowedCustomerTypes.includes(customerType);
}

/**
 * Determines default stock tracking setting when creating a new product (BR-09).
 */
export function getDefaultTrackStock(businessType: BusinessType, unit: ProductUnit): boolean {
  return getBusinessTypeConfig(businessType).defaultTrackStock(unit);
}
