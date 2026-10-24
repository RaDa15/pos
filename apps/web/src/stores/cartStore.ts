import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import {
  computeSale,
  nuToChhertum,
  chhertumToNu,
  TaxMode,
  TaxCategory,
  BillDiscountType,
} from '@pos/shared';

export interface CartProduct {
  id: string;
  name: string;
  barcode: string;
  category: string;
  unit: string;
  sellPrice: number;
  stock: number;
  trackStock: boolean;
  minStock: number;
  imagePath?: string | null;
  taxRate: {
    id: string;
    rate: number;
    mode: TaxMode;
    category: TaxCategory;
  };
}

export interface CartLine {
  productId: string;
  name: string;
  barcode: string;
  unit: string;
  unitPrice: number;
  qty: number;
  lineDiscount: number;
  taxRate: number;
  taxMode: TaxMode;
  taxCategory: TaxCategory;
  stock: number;
  trackStock: boolean;
}

export interface CustomerOption {
  id: string;
  name: string;
  phone: string | null;
  type: string;
  creditLimit: number | null;
  outstandingBalance: number;
  discountPct: number;
  gstId: string | null;
}

export interface BillDiscountState {
  type: BillDiscountType;
  value: number;
}

export interface PaymentLineState {
  method: string;
  amount: number;
  cashReceived?: number | null;
  fee?: number;
  bankName?: string | null;
  journalNo?: string | null;
  remarks?: string | null;
}

export interface CartTotals {
  subtotal: number;
  discountTotal: number;
  customerTypeDiscount: number;
  billDiscount: number;
  taxableAmount: number;
  taxAmount: number;
  charges: number;
  total: number;
  taxBreakdown: Array<{
    rate: number;
    category: TaxCategory;
    taxable: number;
    tax: number;
  }>;
}

interface CartStoreState {
  lines: CartLine[];
  customer: CustomerOption | null;
  billDiscount: BillDiscountState | null;
  charges: number;
  orderType: string;
  tableNo: string | null;
  kitchenOrderId: string | null;
  heldOrderId: string | null;
  gstRegistered: boolean;

  // Actions
  addItem: (product: CartProduct, qty?: number) => { success: boolean; reason?: string };
  updateQty: (productId: string, qty: number) => { success: boolean; reason?: string };
  updateLineDiscount: (productId: string, discount: number) => void;
  removeLine: (productId: string) => void;
  clearCart: () => void;
  setCustomer: (customer: CustomerOption | null) => void;
  setBillDiscount: (billDiscount: BillDiscountState | null) => void;
  setCharges: (charges: number) => void;
  setOrderType: (orderType: string) => void;
  setTableNo: (tableNo: string | null) => void;
  setKitchenOrderId: (id: string | null) => void;
  setHeldOrderId: (id: string | null) => void;
  setGstRegistered: (registered: boolean) => void;
  restoreFromHeldOrder: (payload: {
    lines: Array<{
      productId: string;
      name?: string;
      barcode?: string;
      unit?: string;
      unitPrice: number;
      qty: number;
      lineDiscount?: number;
      taxRate?: number;
      taxMode?: TaxMode;
      taxCategory?: TaxCategory;
      stock?: number;
      trackStock?: boolean;
    }>;
    customer?: CustomerOption | null;
    billDiscount?: BillDiscountState | null;
    charges?: number;
    orderType?: string;
    tableNo?: string | null;
    kitchenOrderId?: string | null;
  }, heldOrderId?: string) => void;
  loadKitchenOrder: (order: {
    id: string;
    orderType: string;
    tableNo: string | null;
    customer?: CustomerOption | null;
    items: Array<{
      product: CartProduct;
      qty: number;
    }>;
  }) => void;

  // Selectors
  getTotals: () => CartTotals;
}

export const useCartStore = create<CartStoreState>()(
  persist(
    (set, get) => ({
      lines: [],
      customer: null,
      billDiscount: null,
      charges: 0,
      orderType: 'walk_in',
      tableNo: null,
      kitchenOrderId: null,
      heldOrderId: null,
      gstRegistered: true,

      addItem: (product, qty = 1) => {
        const currentLines = get().lines;
        const existing = currentLines.find((l) => l.productId === product.id);
        const newQty = existing ? existing.qty + qty : qty;

        // BR-22: For tracked products, reject if exceeds stock
        if (product.trackStock && newQty > product.stock) {
          return {
            success: false,
            reason: `Only ${product.stock} in stock for "${product.name}".`,
          };
        }

        if (existing) {
          set({
            lines: currentLines.map((l) =>
              l.productId === product.id ? { ...l, qty: newQty } : l
            ),
          });
        } else {
          set({
            lines: [
              ...currentLines,
              {
                productId: product.id,
                name: product.name,
                barcode: product.barcode,
                unit: product.unit,
                unitPrice: product.sellPrice,
                qty: Math.max(1, qty),
                lineDiscount: 0,
                taxRate: product.taxRate.rate,
                taxMode: product.taxRate.mode,
                taxCategory: product.taxRate.category,
                stock: product.stock,
                trackStock: product.trackStock,
              },
            ],
          });
        }

        return { success: true };
      },

      updateQty: (productId, qty) => {
        const safeQty = Math.max(1, Math.floor(qty));
        const line = get().lines.find((l) => l.productId === productId);
        if (!line) return { success: false, reason: 'Item not in cart' };

        if (line.trackStock && safeQty > line.stock) {
          return {
            success: false,
            reason: `Only ${line.stock} in stock for "${line.name}".`,
          };
        }

        set({
          lines: get().lines.map((l) => (l.productId === productId ? { ...l, qty: safeQty } : l)),
        });
        return { success: true };
      },

      updateLineDiscount: (productId, discount) => {
        set({
          lines: get().lines.map((l) =>
            l.productId === productId
              ? { ...l, lineDiscount: Math.max(0, discount) }
              : l
          ),
        });
      },

      removeLine: (productId) => {
        set({
          lines: get().lines.filter((l) => l.productId !== productId),
        });
      },

      clearCart: () => {
        set({
          lines: [],
          customer: null,
          billDiscount: null,
          charges: 0,
          tableNo: null,
          kitchenOrderId: null,
          heldOrderId: null,
        });
      },

      setCustomer: (customer) => {
        set({ customer });
      },

      setBillDiscount: (billDiscount) => {
        set({ billDiscount });
      },

      setCharges: (charges) => {
        set({ charges: Math.max(0, charges) });
      },

      setOrderType: (orderType) => {
        set({ orderType });
      },

      setTableNo: (tableNo) => {
        set({ tableNo });
      },

      setKitchenOrderId: (kitchenOrderId) => {
        set({ kitchenOrderId });
      },

      setHeldOrderId: (heldOrderId) => {
        set({ heldOrderId });
      },

      setGstRegistered: (gstRegistered) => {
        set({ gstRegistered });
      },

      restoreFromHeldOrder: (payload, heldOrderId) => {
        set({
          lines: payload.lines.map((l) => ({
            productId: l.productId,
            name: l.name || 'Item',
            barcode: l.barcode || '',
            unit: l.unit || 'pc',
            unitPrice: l.unitPrice,
            qty: l.qty,
            lineDiscount: l.lineDiscount || 0,
            taxRate: l.taxRate ?? 5,
            taxMode: l.taxMode ?? 'exclusive',
            taxCategory: l.taxCategory ?? 'standard',
            stock: l.stock ?? 999,
            trackStock: l.trackStock ?? false,
          })),
          customer: payload.customer || null,
          billDiscount: payload.billDiscount || null,
          charges: payload.charges || 0,
          orderType: payload.orderType || 'walk_in',
          tableNo: payload.tableNo || null,
          kitchenOrderId: payload.kitchenOrderId || null,
          heldOrderId: heldOrderId || null,
        });
      },

      loadKitchenOrder: (order) => {
        set({
          lines: order.items.map((i) => ({
            productId: i.product.id,
            name: i.product.name,
            barcode: i.product.barcode,
            unit: i.product.unit,
            unitPrice: i.product.sellPrice,
            qty: i.qty,
            lineDiscount: 0,
            taxRate: i.product.taxRate.rate,
            taxMode: i.product.taxRate.mode,
            taxCategory: i.product.taxRate.category,
            stock: i.product.stock,
            trackStock: i.product.trackStock,
          })),
          customer: order.customer || null,
          orderType: order.orderType,
          tableNo: order.tableNo,
          kitchenOrderId: order.id,
          heldOrderId: null,
        });
      },

      getTotals: () => {
        const state = get();
        if (state.lines.length === 0) {
          return {
            subtotal: 0,
            discountTotal: 0,
            customerTypeDiscount: 0,
            billDiscount: 0,
            taxableAmount: 0,
            taxAmount: 0,
            charges: state.charges,
            total: state.charges,
            taxBreakdown: [],
          };
        }

        const customerTypePct = state.customer?.discountPct || 0;

        const saleResult = computeSale({
          lines: state.lines.map((l) => ({
            unitPrice: nuToChhertum(l.unitPrice),
            qty: l.qty,
            lineDiscount: nuToChhertum(l.lineDiscount || 0),
            taxRate: l.taxRate,
            taxMode: l.taxMode,
            taxCategory: l.taxCategory,
          })),
          customerTypePct,
          billDiscount: state.billDiscount
            ? {
                type: state.billDiscount.type,
                value:
                  state.billDiscount.type === 'amount'
                    ? nuToChhertum(state.billDiscount.value)
                    : state.billDiscount.value,
              }
            : undefined,
          charges: nuToChhertum(state.charges || 0),
          gstRegistered: state.gstRegistered,
        });

        return {
          subtotal: chhertumToNu(saleResult.subtotal),
          discountTotal: chhertumToNu(saleResult.discountTotal),
          customerTypeDiscount: chhertumToNu(saleResult.customerTypeDiscount),
          billDiscount: chhertumToNu(saleResult.billDiscount),
          taxableAmount: chhertumToNu(saleResult.taxableAmount),
          taxAmount: chhertumToNu(saleResult.taxAmount),
          charges: chhertumToNu(saleResult.charges),
          total: chhertumToNu(saleResult.total),
          taxBreakdown: saleResult.taxBreakdown.map((t) => ({
            rate: t.rate,
            category: t.category,
            taxable: chhertumToNu(t.taxable),
            tax: chhertumToNu(t.tax),
          })),
        };
      },
    }),
    {
      name: 'pos_cart_session',
      storage: createJSONStorage(() => sessionStorage),
      partialize: (state) => ({
        lines: state.lines,
        customer: state.customer,
        billDiscount: state.billDiscount,
        charges: state.charges,
        orderType: state.orderType,
        tableNo: state.tableNo,
        kitchenOrderId: state.kitchenOrderId,
        heldOrderId: state.heldOrderId,
      }),
    }
  )
);
