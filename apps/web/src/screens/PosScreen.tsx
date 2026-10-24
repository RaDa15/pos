import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { apiGet, apiPost } from '../api/client';
import {
  useCartStore,
  CartProduct,
  CustomerOption,
} from '../stores/cartStore';
import { PaymentModal } from '../components/pos/PaymentModal';
import { HeldOrdersModal } from '../components/pos/HeldOrdersModal';
import { ReceiptModal, ReceiptSaleData } from '../components/pos/ReceiptModal';
import { SendToKitchenModal } from '../components/pos/SendToKitchenModal';
import { BillKitchenOrderModal } from '../components/pos/BillKitchenOrderModal';

export const PosScreen: React.FC = () => {
  const { business } = useAuth();
  const scanInputRef = useRef<HTMLInputElement>(null);

  // Cart Zustand Store
  const {
    lines,
    customer,
    billDiscount,
    charges,
    orderType,
    tableNo,
    kitchenOrderId,
    heldOrderId,
    addItem,
    updateQty,
    updateLineDiscount,
    removeLine,
    clearCart,
    setCustomer,
    setBillDiscount,
    setCharges,
    setOrderType,
    setTableNo,
    setKitchenOrderId,
    setGstRegistered,
    getTotals,
  } = useCartStore();

  // State
  const [products, setProducts] = useState<CartProduct[]>([]);
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [barcodeInput, setBarcodeInput] = useState('');
  const [barcodeLoading, setBarcodeLoading] = useState(false);
  const [heldOrdersCount, setHeldOrdersCount] = useState(0);
  const [billableOrdersCount, setBillableOrdersCount] = useState(0);

  // Modals
  const [isPaymentOpen, setIsPaymentOpen] = useState(false);
  const [isHeldOpen, setIsHeldOpen] = useState(false);
  const [isKitchenSendOpen, setIsKitchenSendOpen] = useState(false);
  const [isBillKitchenOpen, setIsBillKitchenOpen] = useState(false);
  const [completedSale, setCompletedSale] = useState<ReceiptSaleData | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [isSubmittingSale, setIsSubmittingSale] = useState(false);
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Sync gstRegistered with store
  useEffect(() => {
    if (business) {
      setGstRegistered(business.gstRegistered);
    }
  }, [business, setGstRegistered]);

  // Keep barcode scan input focused (AC-26)
  useEffect(() => {
    const focusScanner = () => {
      // Don't steal focus if an input or modal is open
      const activeEl = document.activeElement;
      const isInput =
        activeEl?.tagName === 'INPUT' ||
        activeEl?.tagName === 'SELECT' ||
        activeEl?.tagName === 'TEXTAREA';
      if (!isInput && !isPaymentOpen && !isHeldOpen && !isKitchenSendOpen && !isBillKitchenOpen && !completedSale) {
        scanInputRef.current?.focus();
      }
    };

    focusScanner();
    const interval = setInterval(focusScanner, 2000);
    return () => clearInterval(interval);
  }, [isPaymentOpen, isHeldOpen, isKitchenSendOpen, isBillKitchenOpen, completedSale]);

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 3000);
  };

  // Fetch products
  const fetchProducts = async () => {
    try {
      const res = await apiGet<{ data: CartProduct[] }>('/api/v1/pos/products');
      if (res && res.data) {
        setProducts(res.data);
        const distinctCats = Array.from(new Set(res.data.map((p) => p.category))).filter(Boolean);
        setCategories(['All', ...distinctCats]);
      }
    } catch (err) {
      console.error('Failed to fetch POS products:', err);
    }
  };

  // Fetch customers
  const fetchCustomers = async () => {
    try {
      const res = await apiGet<{ data: CustomerOption[] }>('/api/v1/pos/customers');
      if (res && res.data) {
        setCustomers(res.data);
      }
    } catch (err) {
      console.error('Failed to fetch POS customers:', err);
    }
  };

  // Fetch held orders count
  const fetchHeldOrdersCount = async () => {
    try {
      const res = await apiGet<{ data: unknown[] }>('/api/v1/held-orders');
      if (res && res.data) {
        setHeldOrdersCount(res.data.length);
      }
    } catch {
      // Ignore
    }
  };

  // Fetch billable kitchen orders count for restaurants
  const fetchBillableOrdersCount = async () => {
    if (business?.type !== 'restaurant') return;
    try {
      const res = await apiGet<{ data: unknown[] }>('/api/v1/kitchen-orders/billable');
      if (res && res.data) {
        setBillableOrdersCount(res.data.length);
      }
    } catch {
      // Ignore
    }
  };

  useEffect(() => {
    fetchProducts();
    fetchCustomers();
    fetchHeldOrdersCount();
    fetchBillableOrdersCount();
  }, [business?.type]);

  // Barcode Scanner submission handler (AC-26)
  const handleBarcodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = barcodeInput.trim();
    if (!code) return;

    setBarcodeLoading(true);
    try {
      const res = await apiGet<{ data: CartProduct }>(`/api/v1/pos/products/by-barcode/${code}`);
      if (res && res.data) {
        const result = addItem(res.data, 1);
        if (result.success) {
          showToast(`Added ${res.data.name} to cart`, 'success');
        } else {
          showToast(result.reason || 'Cannot add item', 'error');
        }
      }
      setBarcodeInput('');
    } catch (err: unknown) {
      const errMsg = (err as { message?: string }).message || `No product matches "${code}"`;
      showToast(errMsg, 'error');
      setBarcodeInput('');
    } finally {
      setBarcodeLoading(false);
      scanInputRef.current?.focus();
    }
  };

  // Handle Hold Current Order (BR-29)
  const handleHoldOrder = async () => {
    if (lines.length === 0) {
      showToast('Cart is empty, cannot hold order', 'error');
      return;
    }

    try {
      const payload = {
        lines,
        customer,
        billDiscount,
        charges,
        orderType,
        tableNo,
        expectedTotal: totals.total,
      };

      await apiPost('/api/v1/held-orders', { payload });
      clearCart();
      fetchHeldOrdersCount();
      showToast('Order held successfully', 'success');
    } catch (err) {
      console.error('Failed to hold order:', err);
      showToast('Failed to hold order', 'error');
    }
  };

  // Handle Sale Completion
  const handleCompleteSale = async (paymentLines: Array<{ method: string; amount: number; cashReceived?: number | null; journalNo?: string | null; bankName?: string | null }>) => {
    setIsSubmittingSale(true);
    setCheckoutError(null);

    const idempotencyKey = `sale-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

    try {
      const res = await apiPost<{ data: ReceiptSaleData; warnings: string[] }>(
        '/api/v1/sales',
        {
          orderType,
          tableNo: orderType === 'dine_in' ? tableNo : null,
          customerId: customer?.id || null,
          kitchenOrderId: kitchenOrderId || null,
          heldOrderId: heldOrderId || null,
          lines: lines.map((l) => ({
            productId: l.productId,
            qty: l.qty,
            unitPrice: l.unitPrice,
            lineDiscount: l.lineDiscount,
          })),
          billDiscount: billDiscount
            ? {
                type: billDiscount.type,
                value: billDiscount.value,
              }
            : null,
          charges,
          payments: paymentLines.map((p) => ({
            method: p.method,
            amount: p.amount,
            cashReceived: p.cashReceived,
            journalNo: p.journalNo,
            bankName: p.bankName,
          })),
          expectedTotal: totals.total,
        },
        { 'Idempotency-Key': idempotencyKey }
      );

      if (res && res.data) {
        setIsPaymentOpen(false);
        setCompletedSale(res.data);
        clearCart();
        fetchProducts(); // Refresh stock
        fetchHeldOrdersCount();
        fetchBillableOrdersCount();
      }
    } catch (err: unknown) {
      const errorObj = err as { code?: string; message?: string; details?: { newPrice?: number; name?: string } };
      if (errorObj.code === 'PRICE_CHANGED') {
        setCheckoutError('Product price has changed. Please review updated cart prices.');
        fetchProducts();
      } else {
        setCheckoutError(errorObj.message || 'Sale checkout failed');
      }
    } finally {
      setIsSubmittingSale(false);
    }
  };

  // Filter products by category and search
  const filteredProducts = products.filter((p) => {
    const matchesCategory = selectedCategory === 'All' || p.category === selectedCategory;
    const matchesSearch =
      searchQuery.trim() === '' ||
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.barcode.includes(searchQuery);
    return matchesCategory && matchesSearch;
  });

  const totals = getTotals();

  return (
    <div className="h-[calc(100vh-64px)] flex flex-col lg:flex-row overflow-hidden bg-gray-100">
      {/* Toast Alert */}
      {toastMessage && (
        <div
          className={`fixed top-18 right-6 z-50 px-4 py-2.5 rounded-xl text-xs font-semibold shadow-xl border flex items-center gap-2 animate-bounce transition ${
            toastMessage.type === 'success'
              ? 'bg-emerald-600 text-white border-emerald-500'
              : 'bg-rose-600 text-white border-rose-500'
          }`}
        >
          <span>{toastMessage.type === 'success' ? '✓' : '⚠️'}</span>
          <span>{toastMessage.text}</span>
        </div>
      )}

      {/* LEFT COLUMN: Scan Box + Catalog Search + Grid */}
      <div className="flex-1 flex flex-col overflow-hidden border-r border-gray-200 bg-white">
        {/* Top Control Bar: Scan Box & Search */}
        <div className="p-4 border-b border-gray-200 bg-gray-50/50 space-y-3">
          <div className="flex flex-col sm:flex-row gap-3">
            {/* Barcode Scanner Box (AC-26) */}
            <form onSubmit={handleBarcodeSubmit} className="flex-1 relative">
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-emerald-600 font-bold text-sm">
                  ⚡
                </span>
                <input
                  ref={scanInputRef}
                  type="text"
                  value={barcodeInput}
                  onChange={(e) => setBarcodeInput(e.target.value)}
                  placeholder="Scan or enter barcode (Press Enter)..."
                  className="w-full pl-9 pr-20 py-2.5 text-xs font-mono font-medium rounded-xl border border-emerald-400 bg-emerald-50/40 focus:bg-white focus:border-emerald-600 focus:ring-2 focus:ring-emerald-200 shadow-sm transition"
                  disabled={barcodeLoading}
                />
                <button
                  type="submit"
                  disabled={barcodeLoading || !barcodeInput.trim()}
                  className="absolute inset-y-1 right-1 px-3 bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-semibold rounded-lg shadow-sm transition disabled:opacity-40"
                >
                  {barcodeLoading ? 'Scanning...' : 'Scan'}
                </button>
              </div>
            </form>

            {/* Catalog Filter / Search */}
            <div className="w-full sm:w-64 relative">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400 text-xs">
                🔍
              </span>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search products..."
                className="w-full pl-8 pr-3 py-2.5 text-xs rounded-xl border border-gray-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 shadow-sm transition"
              />
            </div>
          </div>

          {/* Category Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
            {categories.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition ${
                  selectedCategory === cat
                    ? 'bg-gray-900 text-white shadow-sm'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Product Grid */}
        <div className="flex-1 overflow-y-auto p-4">
          {filteredProducts.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-gray-400 text-sm">
              <span className="text-4xl mb-2">📦</span>
              <p>No products found matching your search</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {filteredProducts.map((p) => {
                const isOutOfStock = p.trackStock && p.stock <= 0;
                const isLowStock = p.trackStock && p.stock > 0 && p.stock <= p.minStock;

                return (
                  <button
                    key={p.id}
                    type="button"
                    disabled={isOutOfStock}
                    onClick={() => {
                      const res = addItem(p, 1);
                      if (!res.success) {
                        showToast(res.reason || 'Cannot add', 'error');
                      } else {
                        showToast(`Added ${p.name}`, 'success');
                      }
                      scanInputRef.current?.focus();
                    }}
                    className={`p-3 rounded-xl border text-left flex flex-col justify-between transition group relative ${
                      isOutOfStock
                        ? 'bg-gray-100/70 border-gray-200 opacity-60 cursor-not-allowed'
                        : 'bg-white hover:bg-emerald-50/30 border-gray-200 hover:border-emerald-300 shadow-sm hover:shadow-md'
                    }`}
                  >
                    <div>
                      <div className="flex items-start justify-between gap-1 mb-1">
                        <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                          {p.category}
                        </span>
                        {p.trackStock ? (
                          <span
                            className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                              isOutOfStock
                                ? 'bg-rose-100 text-rose-700'
                                : isLowStock
                                ? 'bg-amber-100 text-amber-700'
                                : 'bg-emerald-100 text-emerald-700'
                            }`}
                          >
                            {isOutOfStock ? 'Out of stock' : `Stock: ${p.stock}`}
                          </span>
                        ) : (
                          <span className="text-[9px] font-medium text-gray-400">Untracked</span>
                        )}
                      </div>
                      <h4 className="font-semibold text-gray-900 text-xs line-clamp-2 group-hover:text-emerald-700 transition">
                        {p.name}
                      </h4>
                    </div>

                    <div className="mt-3 flex items-center justify-between">
                      <span className="font-bold text-gray-900 text-sm">
                        Nu. {p.sellPrice.toFixed(2)}
                      </span>
                      <span className="text-[10px] font-mono text-gray-400">{p.unit}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* RIGHT COLUMN: Cart & Checkout Summary */}
      <div className="w-full lg:w-[440px] flex flex-col bg-white border-l border-gray-200 shadow-lg">
        {/* Cart Top Settings (Customer & Order Type) */}
        <div className="p-4 border-b border-gray-200 bg-gray-50/70 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="font-bold text-gray-900 text-sm">Active Cart</span>
              <span className="bg-gray-200 text-gray-700 text-xs px-2 py-0.5 rounded-full font-medium">
                {lines.length} {lines.length === 1 ? 'item' : 'items'}
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              {business?.type === 'restaurant' && (
                <button
                  type="button"
                  onClick={() => setIsBillKitchenOpen(true)}
                  className="text-xs font-semibold text-emerald-800 hover:text-emerald-950 flex items-center gap-1 px-2.5 py-1 bg-emerald-50 border border-emerald-300 rounded-lg shadow-sm hover:bg-emerald-100 transition"
                  title="Bill a ready or served kitchen order"
                >
                  <span>📋 Bill KOT</span>
                  {billableOrdersCount > 0 && (
                    <span className="bg-emerald-600 text-white text-[10px] font-bold px-1.5 py-0.2 rounded-full">
                      {billableOrdersCount}
                    </span>
                  )}
                </button>
              )}

              {/* Held Orders Trigger */}
              <button
                type="button"
                onClick={() => setIsHeldOpen(true)}
                className="text-xs font-medium text-gray-600 hover:text-gray-900 flex items-center gap-1.5 px-2.5 py-1 bg-white border border-gray-300 rounded-lg shadow-sm hover:bg-gray-50 transition"
              >
                <span>📥 Held Orders</span>
                {heldOrdersCount > 0 && (
                  <span className="bg-amber-500 text-white text-[10px] font-bold px-1.5 py-0.2 rounded-full">
                    {heldOrdersCount}
                  </span>
                )}
              </button>
            </div>
          </div>

          {/* Active Kitchen Order Linked Banner */}
          {kitchenOrderId && (
            <div className="flex items-center justify-between px-3 py-1.5 bg-amber-50 border border-amber-300 rounded-lg text-xs text-amber-900 shadow-sm animate-fade-in">
              <span className="font-bold flex items-center gap-1.5">
                <span>🍳</span> Billing Kitchen Order (Completing will close KOT)
              </span>
              <button
                type="button"
                onClick={() => setKitchenOrderId(null)}
                className="text-[11px] font-bold text-amber-700 hover:text-rose-600 underline ml-2"
                title="Unlink kitchen order from current cart"
              >
                Unlink ✕
              </button>
            </div>
          )}

          {/* Customer Dropdown */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <label className="block text-[11px] font-medium text-gray-600 mb-0.5">Customer</label>
              <select
                value={customer?.id || ''}
                onChange={(e) => {
                  const sel = customers.find((c) => c.id === e.target.value) || null;
                  setCustomer(sel);
                }}
                className="w-full text-xs rounded-lg border-gray-300 shadow-sm focus:border-emerald-500 focus:ring-emerald-500 py-1.5 px-2 bg-white"
              >
                <option value="">Walk-in (No Customer)</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.type.toUpperCase()}{c.discountPct > 0 ? ` -${c.discountPct}%` : ''})
                  </option>
                ))}
              </select>
            </div>

            {/* Order Type & Table */}
            <div>
              <label className="block text-[11px] font-medium text-gray-600 mb-0.5">Order Type</label>
              <div className="flex gap-1.5">
                <select
                  value={orderType}
                  onChange={(e) => setOrderType(e.target.value)}
                  className="w-full text-xs rounded-lg border-gray-300 shadow-sm focus:border-emerald-500 focus:ring-emerald-500 py-1.5 px-2 bg-white"
                >
                  <option value="walk_in">Walk-in</option>
                  <option value="dine_in">Dine-in</option>
                  <option value="takeaway">Takeaway</option>
                  <option value="delivery">Delivery</option>
                  <option value="pre_ordered">Pre-ordered</option>
                </select>
                {orderType === 'dine_in' && (
                  <input
                    type="text"
                    value={tableNo || ''}
                    onChange={(e) => setTableNo(e.target.value)}
                    placeholder="Tbl"
                    className="w-14 text-xs text-center rounded-lg border-gray-300 shadow-sm focus:border-emerald-500 focus:ring-emerald-500 py-1.5 px-1 font-bold"
                  />
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Cart Items List */}
        <div className="flex-1 overflow-y-auto divide-y divide-gray-100 p-3">
          {lines.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-gray-400 text-xs py-10">
              <span className="text-3xl mb-1.5">🛒</span>
              <p>Cart is currently empty</p>
              <p className="text-[11px] text-gray-400">Scan barcode or pick from catalog</p>
            </div>
          ) : (
            lines.map((item) => (
              <div key={item.productId} className="py-2.5 flex items-center justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-gray-900 text-xs truncate">{item.name}</div>
                  <div className="text-[11px] text-gray-500 flex items-center gap-2 mt-0.5">
                    <span>Nu. {item.unitPrice.toFixed(2)}</span>
                    <span>•</span>
                    <span>GST {item.taxRate}%</span>
                  </div>
                </div>

                {/* Qty Controls */}
                <div className="flex items-center border border-gray-300 rounded-lg bg-gray-50 shadow-sm">
                  <button
                    type="button"
                    onClick={() => {
                      if (item.qty <= 1) {
                        removeLine(item.productId);
                      } else {
                        updateQty(item.productId, item.qty - 1);
                      }
                    }}
                    className="px-2 py-1 text-xs text-gray-600 hover:text-black font-bold transition"
                  >
                    -
                  </button>
                  <span className="w-7 text-center text-xs font-semibold">{item.qty}</span>
                  <button
                    type="button"
                    onClick={() => {
                      const res = updateQty(item.productId, item.qty + 1);
                      if (!res.success) showToast(res.reason || 'Limit reached', 'error');
                    }}
                    className="px-2 py-1 text-xs text-gray-600 hover:text-black font-bold transition"
                  >
                    +
                  </button>
                </div>

                {/* Line Discount Input */}
                <div className="w-16">
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    max={item.unitPrice * item.qty}
                    value={item.lineDiscount || ''}
                    onChange={(e) => updateLineDiscount(item.productId, parseFloat(e.target.value) || 0)}
                    placeholder="Disc"
                    title="Line discount in Nu."
                    className="w-full text-[11px] text-right py-1 px-1.5 rounded-md border-gray-300 focus:border-amber-500 focus:ring-1 focus:ring-amber-400"
                  />
                </div>

                {/* Line Total */}
                <div className="w-20 text-right">
                  <div className="font-bold text-gray-900 text-xs">
                    Nu. {(item.unitPrice * item.qty - item.lineDiscount).toFixed(2)}
                  </div>
                  <button
                    type="button"
                    onClick={() => removeLine(item.productId)}
                    className="text-[10px] text-gray-400 hover:text-rose-600 transition"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Bill Discount & Charges Expanders */}
        <div className="px-4 py-2.5 bg-gray-50 border-t border-gray-200 grid grid-cols-2 gap-3 text-xs">
          <div>
            <label className="block text-[11px] font-medium text-gray-600 mb-0.5">Bill Discount</label>
            <div className="flex gap-1">
              <select
                value={billDiscount?.type || 'percent'}
                onChange={(e) =>
                  setBillDiscount({
                    type: e.target.value as 'percent' | 'amount',
                    value: billDiscount?.value || 0,
                  })
                }
                className="w-14 text-[11px] py-1 px-1 rounded border-gray-300"
              >
                <option value="percent">%</option>
                <option value="amount">Nu.</option>
              </select>
              <input
                type="number"
                step="0.5"
                min="0"
                value={billDiscount?.value || ''}
                onChange={(e) => {
                  const val = parseFloat(e.target.value) || 0;
                  setBillDiscount(val > 0 ? { type: billDiscount?.type || 'percent', value: val } : null);
                }}
                placeholder="0"
                className="w-full text-xs py-1 px-2 rounded border-gray-300 font-medium"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-medium text-gray-600 mb-0.5">Charges (Nu.)</label>
            <input
              type="number"
              step="0.5"
              min="0"
              value={charges || ''}
              onChange={(e) => setCharges(parseFloat(e.target.value) || 0)}
              placeholder="0.00"
              className="w-full text-xs py-1 px-2 rounded border-gray-300 font-medium"
            />
          </div>
        </div>

        {/* Financial Summary & Checkout Action */}
        <div className="p-4 bg-white border-t border-gray-200 space-y-2">
          <div className="space-y-1 text-xs text-gray-600">
            <div className="flex justify-between">
              <span>Subtotal:</span>
              <span className="font-medium text-gray-900">Nu. {totals.subtotal.toFixed(2)}</span>
            </div>
            {totals.customerTypeDiscount > 0 && (
              <div className="flex justify-between text-emerald-600">
                <span>Customer Discount ({customer?.discountPct}%):</span>
                <span>-Nu. {totals.customerTypeDiscount.toFixed(2)}</span>
              </div>
            )}
            {totals.billDiscount > 0 && (
              <div className="flex justify-between text-emerald-600">
                <span>Bill Discount:</span>
                <span>-Nu. {totals.billDiscount.toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span>Taxable Amount:</span>
              <span>Nu. {totals.taxableAmount.toFixed(2)}</span>
            </div>
            {totals.taxBreakdown.map((t, idx) => (
              <div key={idx} className="flex justify-between">
                <span>GST ({t.rate}% {t.category}):</span>
                <span>Nu. {t.tax.toFixed(2)}</span>
              </div>
            ))}
            {totals.charges > 0 && (
              <div className="flex justify-between">
                <span>Charges:</span>
                <span>Nu. {totals.charges.toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between items-baseline pt-2 border-t border-gray-200">
              <span className="text-sm font-bold text-gray-900">Total:</span>
              <span className="text-2xl font-black text-gray-900">Nu. {totals.total.toFixed(2)}</span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="pt-2 flex gap-1.5 flex-wrap">
            <button
              type="button"
              onClick={handleHoldOrder}
              disabled={lines.length === 0}
              className="flex-1 py-2.5 px-2.5 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-xl text-xs font-semibold shadow-sm transition disabled:opacity-40"
              title="Hold current cart order"
            >
              📥 Hold
            </button>
            {business?.type === 'restaurant' && (
              <button
                type="button"
                onClick={() => setIsKitchenSendOpen(true)}
                disabled={lines.length === 0}
                className="flex-1 py-2.5 px-2 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 rounded-xl text-xs font-bold shadow-sm transition disabled:opacity-40 flex items-center justify-center gap-1"
                title="Send dishes to kitchen without billing yet"
              >
                <span>🍳</span> Kitchen
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                if (confirm('Clear the current cart?')) clearCart();
              }}
              disabled={lines.length === 0}
              className="py-2.5 px-3 bg-gray-100 hover:bg-rose-50 hover:text-rose-600 text-gray-600 rounded-xl text-xs font-semibold transition disabled:opacity-40"
              title="Clear all cart lines"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={() => setIsPaymentOpen(true)}
              disabled={lines.length === 0}
              className="flex-[2] min-w-[140px] py-2.5 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs sm:text-sm font-bold shadow-md hover:shadow-lg transition flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <span>💳</span> Pay Nu. {totals.total.toFixed(2)}
            </button>
          </div>
        </div>
      </div>

      {/* Payment Modal */}
      {isPaymentOpen && (
        <PaymentModal
          isOpen={isPaymentOpen}
          onClose={() => setIsPaymentOpen(false)}
          total={totals.total}
          customer={customer}
          onCompleteSale={handleCompleteSale}
          isSubmitting={isSubmittingSale}
          error={checkoutError}
        />
      )}

      {/* Held Orders Modal */}
      {isHeldOpen && (
        <HeldOrdersModal
          isOpen={isHeldOpen}
          onClose={() => setIsHeldOpen(false)}
          onOrderResumed={() => {
            fetchHeldOrdersCount();
            showToast('Order restored into cart', 'success');
          }}
        />
      )}

      {/* Send to Kitchen Modal */}
      {isKitchenSendOpen && (
        <SendToKitchenModal
          isOpen={isKitchenSendOpen}
          onClose={() => setIsKitchenSendOpen(false)}
          onOrderSent={(orderNo) => {
            fetchBillableOrdersCount();
            showToast(`${orderNo} sent to kitchen.`, 'success');
          }}
        />
      )}

      {/* Bill Kitchen Order Modal */}
      {isBillKitchenOpen && (
        <BillKitchenOrderModal
          isOpen={isBillKitchenOpen}
          onClose={() => setIsBillKitchenOpen(false)}
          onOrderSelected={(orderNo) => {
            showToast(`Loaded ${orderNo} into cart for billing`, 'success');
          }}
        />
      )}

      {/* Receipt Modal (SCR-09) */}
      {completedSale && (
        <ReceiptModal
          sale={completedSale}
          business={business || undefined}
          isOpen={Boolean(completedSale)}
          onClose={() => setCompletedSale(null)}
          onNewSale={() => {
            setCompletedSale(null);
            clearCart();
            scanInputRef.current?.focus();
          }}
        />
      )}
    </div>
  );
};
