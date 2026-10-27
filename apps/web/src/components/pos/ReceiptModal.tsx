import React, { useRef, useState, useEffect } from 'react';
import { jsPDF } from 'jspdf';
import { useAuth } from '../../context/AuthContext.js';
import { apiPost } from '../../api/client.js';

export interface ReceiptSaleItem {
  lineNo: number;
  productId: string;
  name: string;
  unitPrice: number;
  qty: number;
  lineDiscount: number;
  allocatedDiscount: number;
  taxRate: number;
  taxMode: string;
  taxCategory: string;
  taxable: number;
  tax: number;
  total: number;
}

export interface ReceiptPayment {
  method: string;
  amount: number;
  cashReceived: number | null;
  changeGiven: number | null;
  bankName: string | null;
  journalNo: string | null;
  status: string;
}

export interface ReceiptSaleData {
  id: string;
  invoiceNo: string;
  status: string;
  completedAt: string;
  businessDate: string;
  cashier: { id: string; name: string };
  customer: {
    id: string;
    name: string;
    phone: string | null;
    type: string;
    gstId: string | null;
  } | null;
  orderType: string;
  tableNo: string | null;
  kitchenOrderId: string | null;
  gstRegistered: boolean;
  subtotal: number;
  discountTotal: number;
  customerTypePct: number;
  customerTypeAmt: number;
  billDiscount: {
    type: string;
    value: number;
    amount: number;
  } | null;
  taxableAmount: number;
  taxAmount: number;
  gstByRate: Array<{
    rate: number;
    category: string;
    taxable: number;
    tax: number;
  }>;
  charges: number;
  total: number;
  amountPaid: number;
  creditAmount: number;
  paymentSummary: string;
  amountInWords: string;
  items: ReceiptSaleItem[];
  payments: ReceiptPayment[];
  voided: {
    at: string;
    by: { id: string; name: string } | null;
    reason: string | null;
  } | null;
}

export interface BusinessProfile {
  name: string;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  gstNo?: string | null;
  gstRegistered: boolean;
}

interface ReceiptModalProps {
  sale: ReceiptSaleData;
  business?: BusinessProfile;
  isOpen: boolean;
  onClose: () => void;
  onNewSale?: () => void;
  onVoidSuccess?: (updatedSale: ReceiptSaleData) => void;
  initialOpenVoidModal?: boolean;
}

export const ReceiptModal: React.FC<ReceiptModalProps> = ({
  sale,
  business,
  isOpen,
  onClose,
  onNewSale,
  onVoidSuccess,
  initialOpenVoidModal = false,
}) => {
  const { employee, permissions } = useAuth();
  const receiptRef = useRef<HTMLDivElement>(null);

  const [activeSale, setActiveSale] = useState<ReceiptSaleData>(sale);
  const [isVoidModalOpen, setIsVoidModalOpen] = useState(false);
  const [voidReason, setVoidReason] = useState('');
  const [isVoiding, setIsVoiding] = useState(false);
  const [voidError, setVoidError] = useState<string | null>(null);

  // Sync state when sale prop updates
  useEffect(() => {
    setActiveSale(sale);
  }, [sale]);

  useEffect(() => {
    if (isOpen && initialOpenVoidModal && activeSale.status === 'completed') {
      setIsVoidModalOpen(true);
    }
  }, [isOpen, initialOpenVoidModal, activeSale.status]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isVoidModalOpen) {
          setIsVoidModalOpen(false);
        } else {
          onClose();
        }
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isVoidModalOpen, onClose]);

  if (!isOpen) return null;

  const canVoid =
    permissions.includes('sales.void') ||
    employee?.role === 'admin' ||
    employee?.role === 'manager';

  const bizName = business?.name || 'Pema Store';
  const bizAddress = business?.address || 'Changzamtok, Thimphu, Bhutan';
  const bizPhone = business?.phone || '+975 17123450';
  const bizEmail = business?.email || 'contact@pos.bt';
  const bizGst = business?.gstNo || (activeSale.gstRegistered ? 'GST-100223344' : null);
  const invoiceTitle = activeSale.gstRegistered ? 'TAX INVOICE' : 'INVOICE';

  const handlePrint = () => {
    window.print();
  };

  const handleVoidSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!voidReason.trim()) {
      setVoidError('Please provide a reason for voiding this invoice.');
      return;
    }

    setIsVoiding(true);
    setVoidError(null);

    try {
      const res = await apiPost<{ data: ReceiptSaleData; warnings: string[] }>(
        `/sales/${activeSale.id}/void`,
        { reason: voidReason.trim() }
      );
      setActiveSale(res.data);
      setIsVoidModalOpen(false);
      setVoidReason('');
      if (onVoidSuccess) {
        onVoidSuccess(res.data);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to void invoice';
      setVoidError(message);
    } finally {
      setIsVoiding(false);
    }
  };

  const handleDownloadPdf = () => {
    // 80mm thermal receipt in jsPDF (width: 80 mm, dynamic height)
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: [80, 220 + activeSale.items.length * 8],
    });

    let y = 10;

    if (activeSale.voided) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(14);
      doc.setTextColor(220, 38, 38);
      doc.text('*** VOIDED INVOICE ***', 40, y, { align: 'center' });
      y += 6;
      doc.setTextColor(0, 0, 0);
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text(bizName, 40, y, { align: 'center' });
    y += 5;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    if (bizAddress) {
      doc.text(bizAddress, 40, y, { align: 'center' });
      y += 4;
    }
    doc.text(`Phone: ${bizPhone} | Email: ${bizEmail}`, 40, y, { align: 'center' });
    y += 4;
    if (bizGst) {
      doc.text(`TPN / GST: ${bizGst}`, 40, y, { align: 'center' });
      y += 4;
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text(invoiceTitle, 40, y + 2, { align: 'center' });
    y += 7;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.line(5, y, 75, y);
    y += 4;

    doc.text(`Invoice: ${activeSale.invoiceNo}`, 5, y);
    doc.text(`Date: ${new Date(activeSale.completedAt).toLocaleString()}`, 5, y + 4);
    doc.text(`Cashier: ${activeSale.cashier.name}`, 5, y + 8);
    y += 12;

    if (activeSale.customer) {
      doc.text(`Customer: ${activeSale.customer.name} (${activeSale.customer.type})`, 5, y);
      if (activeSale.customer.phone) doc.text(`Phone: ${activeSale.customer.phone}`, 5, y + 4);
      y += 8;
    }

    if (activeSale.tableNo) {
      doc.text(`Table: ${activeSale.tableNo} (${activeSale.orderType})`, 5, y);
      y += 5;
    }

    if (activeSale.voided) {
      doc.setFont('helvetica', 'italic');
      doc.text(`Voided: ${new Date(activeSale.voided.at).toLocaleString()}`, 5, y);
      doc.text(`By: ${activeSale.voided.by?.name || 'Staff'}`, 5, y + 4);
      doc.text(`Reason: ${activeSale.voided.reason || 'N/A'}`, 5, y + 8);
      y += 12;
      doc.setFont('helvetica', 'normal');
    }

    doc.line(5, y, 75, y);
    y += 4;

    // Items header
    doc.setFont('helvetica', 'bold');
    doc.text('Item', 5, y);
    doc.text('Qty', 42, y);
    doc.text('Price', 54, y);
    doc.text('Total', 75, y, { align: 'right' });
    y += 3;
    doc.line(5, y, 75, y);
    y += 4;

    doc.setFont('helvetica', 'normal');
    for (const item of activeSale.items) {
      doc.text(item.name.length > 20 ? item.name.substring(0, 19) + '…' : item.name, 5, y);
      doc.text(String(item.qty), 44, y);
      doc.text(item.unitPrice.toFixed(2), 54, y);
      doc.text(item.total.toFixed(2), 75, y, { align: 'right' });
      y += 4;
    }

    doc.line(5, y, 75, y);
    y += 4;

    // Totals
    doc.text(`Subtotal:`, 40, y);
    doc.text(`Nu. ${activeSale.subtotal.toFixed(2)}`, 75, y, { align: 'right' });
    y += 4;

    if (activeSale.discountTotal > 0) {
      doc.text(`Discount:`, 40, y);
      doc.text(`- Nu. ${activeSale.discountTotal.toFixed(2)}`, 75, y, { align: 'right' });
      y += 4;
    }

    doc.text(`Taxable:`, 40, y);
    doc.text(`Nu. ${activeSale.taxableAmount.toFixed(2)}`, 75, y, { align: 'right' });
    y += 4;

    for (const gst of activeSale.gstByRate) {
      doc.text(`GST (${gst.rate}%):`, 40, y);
      doc.text(`Nu. ${gst.tax.toFixed(2)}`, 75, y, { align: 'right' });
      y += 4;
    }

    if (activeSale.charges > 0) {
      doc.text(`Charges:`, 40, y);
      doc.text(`Nu. ${activeSale.charges.toFixed(2)}`, 75, y, { align: 'right' });
      y += 4;
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text(`Grand Total:`, 40, y);
    doc.text(`Nu. ${activeSale.total.toFixed(2)}`, 75, y, { align: 'right' });
    y += 6;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.text(doc.splitTextToSize(`Amount in words: ${activeSale.amountInWords}`, 70), 5, y);
    y += 8;

    doc.line(5, y, 75, y);
    y += 4;

    // Payments
    doc.setFont('helvetica', 'bold');
    doc.text('Payments:', 5, y);
    y += 4;
    doc.setFont('helvetica', 'normal');
    for (const pay of activeSale.payments) {
      const details = pay.journalNo ? ` (Txn: ${pay.journalNo})` : '';
      doc.text(`${pay.method.toUpperCase()}${details}:`, 5, y);
      doc.text(`Nu. ${pay.amount.toFixed(2)}`, 75, y, { align: 'right' });
      y += 4;
      if (pay.cashReceived) {
        doc.text(`  Cash Received: Nu. ${pay.cashReceived.toFixed(2)}`, 5, y);
        doc.text(`  Change: Nu. ${(pay.changeGiven || 0).toFixed(2)}`, 75, y, { align: 'right' });
        y += 4;
      }
    }

    doc.line(5, y, 75, y);
    y += 6;

    doc.setFontSize(7);
    doc.text('Thank you — please come again.', 40, y, { align: 'center' });
    y += 4;
    doc.text('Prices in Bhutanese Ngultrum (Nu.)', 40, y, { align: 'center' });
    y += 4;
    doc.text('Powered by Yuevaan Consultancy · Thimphu, Bhutan', 40, y, { align: 'center' });

    doc.save(`${activeSale.invoiceNo}.pdf`);
  };

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
        <div className="bg-white text-gray-900 rounded-xl shadow-2xl max-w-md w-full overflow-hidden flex flex-col max-h-[92vh]">
          {/* Modal Header */}
          <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 bg-gray-50">
            <div className="flex items-center gap-2">
              <span
                className={`w-3 h-3 rounded-full ${
                  activeSale.status === 'voided' ? 'bg-red-500' : 'bg-emerald-500 animate-pulse'
                }`}
              ></span>
              <h3 className="font-semibold text-gray-800 text-sm">
                {activeSale.status === 'voided' ? 'Invoice Voided' : 'Sale Completed'} · {activeSale.invoiceNo}
              </h3>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 rounded-lg p-1 transition"
            >
              ✕
            </button>
          </div>

          {/* Receipt Container Preview (80mm width) */}
          <div className="flex-1 overflow-y-auto p-4 bg-gray-100 flex justify-center">
            <div
              ref={receiptRef}
              id="printable-receipt"
              className="bg-white border border-gray-300 shadow-sm p-5 w-full max-w-[340px] text-xs font-mono text-gray-800 rounded relative"
              style={{ minHeight: '480px' }}
            >
              {activeSale.status === 'voided' && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-25">
                  <span className="text-red-600 font-extrabold text-7xl tracking-widest -rotate-45 border-4 border-red-600 p-3 select-none">
                    VOID
                  </span>
                </div>
              )}

              {/* Void details banner */}
              {activeSale.voided && (
                <div className="mb-3 p-2 bg-red-50 border border-red-200 rounded text-red-800 text-[11px] font-sans">
                  <div className="font-bold flex items-center gap-1 text-xs text-red-700">
                    <span>⚠️</span> INVOICE VOIDED
                  </div>
                  <div className="mt-0.5">
                    Voided {new Date(activeSale.voided.at).toLocaleString()} by{' '}
                    <span className="font-semibold">{activeSale.voided.by?.name || 'Authorized Staff'}</span>
                  </div>
                  {activeSale.voided.reason && (
                    <div className="text-gray-600 italic mt-0.5">"{activeSale.voided.reason}"</div>
                  )}
                </div>
              )}

              {/* Business Header */}
              <div className="text-center space-y-1 mb-3">
                <h2 className="font-bold text-sm uppercase tracking-wide">{bizName}</h2>
                {bizAddress && <p className="text-[11px] text-gray-600">{bizAddress}</p>}
                <p className="text-[11px] text-gray-600">Ph: {bizPhone}</p>
                {bizEmail && <p className="text-[11px] text-gray-600">{bizEmail}</p>}
                {bizGst && <p className="text-[11px] font-semibold text-gray-700">TPN/GST: {bizGst}</p>}
                <div className="pt-2 font-bold text-xs uppercase tracking-wider border-b border-dashed border-gray-400 pb-2">
                  {invoiceTitle}
                </div>
              </div>

              {/* Metadata */}
              <div className="space-y-1 mb-3 text-[11px] border-b border-dashed border-gray-300 pb-2">
                <div className="flex justify-between">
                  <span className="text-gray-500">Invoice:</span>
                  <span className="font-bold">{activeSale.invoiceNo}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Date/Time:</span>
                  <span>{new Date(activeSale.completedAt).toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Cashier:</span>
                  <span>{activeSale.cashier.name}</span>
                </div>
                {activeSale.customer && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Customer:</span>
                    <span className="font-semibold">
                      {activeSale.customer.name} ({activeSale.customer.type})
                    </span>
                  </div>
                )}
                {activeSale.tableNo && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Table:</span>
                    <span>
                      {activeSale.tableNo} ({activeSale.orderType})
                    </span>
                  </div>
                )}
              </div>

              {/* Line Items Table */}
              <div className="mb-3 border-b border-dashed border-gray-300 pb-2">
                <table className="w-full text-left text-[11px]">
                  <thead>
                    <tr className="border-b border-gray-200 text-gray-600">
                      <th className="py-1">Item</th>
                      <th className="py-1 text-center">Qty</th>
                      <th className="py-1 text-right">Price</th>
                      <th className="py-1 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeSale.items.map((item) => (
                      <tr key={item.lineNo} className="border-b border-gray-100 last:border-none">
                        <td className="py-1 font-medium pr-1">
                          <div>{item.name}</div>
                          {item.lineDiscount > 0 && (
                            <div className="text-[10px] text-emerald-600">
                              (Disc: -Nu. {item.lineDiscount.toFixed(2)})
                            </div>
                          )}
                        </td>
                        <td className="py-1 text-center font-mono">{item.qty}</td>
                        <td className="py-1 text-right font-mono">Nu. {item.unitPrice.toFixed(2)}</td>
                        <td className="py-1 text-right font-mono font-semibold">
                          Nu. {item.total.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Totals Section */}
              <div className="space-y-1 mb-3 text-[11px] border-b border-dashed border-gray-300 pb-2">
                <div className="flex justify-between">
                  <span className="text-gray-600">Subtotal:</span>
                  <span>Nu. {activeSale.subtotal.toFixed(2)}</span>
                </div>

                {activeSale.discountTotal > 0 && (
                  <div className="flex justify-between text-emerald-700 font-medium">
                    <span>Total Discount:</span>
                    <span>- Nu. {activeSale.discountTotal.toFixed(2)}</span>
                  </div>
                )}

                <div className="flex justify-between">
                  <span className="text-gray-600">Taxable Amount:</span>
                  <span>Nu. {activeSale.taxableAmount.toFixed(2)}</span>
                </div>

                {activeSale.gstByRate.map((gst) => (
                  <div key={`${gst.rate}_${gst.category}`} className="flex justify-between text-gray-600">
                    <span>
                      GST ({gst.rate}% {gst.category}):
                    </span>
                    <span>Nu. {gst.tax.toFixed(2)}</span>
                  </div>
                ))}

                {activeSale.charges > 0 && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">Charges:</span>
                    <span>Nu. {activeSale.charges.toFixed(2)}</span>
                  </div>
                )}

                <div className="flex justify-between font-bold text-sm text-gray-900 pt-1 border-t border-gray-300 mt-1">
                  <span>Grand Total:</span>
                  <span>Nu. {activeSale.total.toFixed(2)}</span>
                </div>
              </div>

              {/* Amount in words */}
              <div className="mb-3 text-[10px] italic text-gray-600 border-b border-dashed border-gray-300 pb-2">
                {activeSale.amountInWords}
              </div>

              {/* Payments Section */}
              <div className="space-y-1 mb-3 text-[11px] border-b border-dashed border-gray-300 pb-2">
                <div className="font-semibold text-gray-700 mb-1">Payment Breakdown:</div>
                {activeSale.payments.map((p, idx) => (
                  <div key={idx} className="flex justify-between">
                    <span className="capitalize">
                      {p.method}
                      {p.journalNo ? ` (${p.journalNo})` : ''}
                    </span>
                    <span className="font-medium">Nu. {p.amount.toFixed(2)}</span>
                  </div>
                ))}
                {activeSale.payments.find((p) => p.cashReceived) && (
                  <div className="pt-1 flex justify-between text-emerald-700 font-medium">
                    <span>Change Given:</span>
                    <span>
                      Nu.{' '}
                      {activeSale.payments.find((p) => p.cashReceived)?.changeGiven?.toFixed(2) || '0.00'}
                    </span>
                  </div>
                )}
              </div>

              {/* Barcode & Footer */}
              <div className="text-center pt-2 space-y-1">
                <div className="font-mono text-xs tracking-widest font-bold py-1 bg-gray-50 border border-gray-200 rounded">
                  * {activeSale.invoiceNo} *
                </div>
                <p className="text-[10px] font-medium text-gray-700 pt-1">
                  Thank you — please come again.
                </p>
                <p className="text-[9px] text-gray-500">Prices in Bhutanese Ngultrum (Nu.)</p>
                <p className="text-[8px] text-gray-400">
                  Powered by Yuevaan Consultancy · Thimphu, Bhutan
                </p>
              </div>
            </div>
          </div>

          {/* Modal Action Buttons */}
          <div className="p-4 bg-white border-t border-gray-200 flex flex-wrap items-center justify-between gap-2">
            <div>
              {canVoid && activeSale.status === 'completed' && (
                <button
                  onClick={() => {
                    setVoidError(null);
                    setVoidReason('');
                    setIsVoidModalOpen(true);
                  }}
                  className="px-3 py-2 bg-red-50 text-red-700 border border-red-300 rounded-lg text-xs font-semibold hover:bg-red-100 transition flex items-center gap-1.5"
                >
                  <span>🚫</span> Void Invoice
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handlePrint}
                className="px-3.5 py-2 bg-gray-800 text-white rounded-lg text-xs font-semibold hover:bg-gray-900 transition flex items-center gap-1.5 shadow-sm"
              >
                <span>🖨️</span> Print
              </button>
              <button
                onClick={handleDownloadPdf}
                className="px-3.5 py-2 bg-indigo-600 text-white rounded-lg text-xs font-semibold hover:bg-indigo-700 transition flex items-center gap-1.5 shadow-sm"
              >
                <span>📥</span> PDF
              </button>
              {onNewSale && (
                <button
                  onClick={() => {
                    onClose();
                    onNewSale();
                  }}
                  className="px-3.5 py-2 bg-emerald-600 text-white rounded-lg text-xs font-semibold hover:bg-emerald-700 transition flex items-center gap-1.5 shadow-sm"
                >
                  <span>✨</span> New Sale
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Media print stylesheet for 80mm thermal receipt */}
        <style>{`
          @media print {
            body * {
              visibility: hidden;
            }
            #printable-receipt, #printable-receipt * {
              visibility: visible;
            }
            #printable-receipt {
              position: absolute;
              left: 0;
              top: 0;
              width: 80mm;
              margin: 0;
              padding: 4mm;
              border: none;
              box-shadow: none;
            }
          }
        `}</style>
      </div>

      {/* Void Invoice Confirmation Modal */}
      {isVoidModalOpen && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-sm w-full p-5 border border-red-200 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-2.5 text-red-600 font-bold text-base mb-2">
              <span className="text-xl">⚠️</span>
              <h4>Void Invoice {activeSale.invoiceNo}</h4>
            </div>

            <p className="text-xs text-gray-600 mb-4 leading-relaxed">
              Voiding this invoice will immediately restock all tracked items with{' '}
              <code className="bg-gray-100 text-gray-800 px-1 py-0.5 rounded">void_restock</code>{' '}
              movements, mark associated payments voided, and adjust customer credit balances. This
              action is permanent.
            </p>

            {voidError && (
              <div className="mb-3 p-2 bg-red-50 border border-red-200 text-red-700 text-xs rounded">
                {voidError}
              </div>
            )}

            <form onSubmit={handleVoidSubmit}>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Void Reason <span className="text-red-500">*</span>
              </label>
              <textarea
                value={voidReason}
                onChange={(e) => setVoidReason(e.target.value)}
                placeholder="e.g. Scanned wrong item, customer cancellation, incorrect billing table"
                rows={3}
                required
                className="w-full text-xs p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:outline-none mb-4"
              />

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  disabled={isVoiding}
                  onClick={() => setIsVoidModalOpen(false)}
                  className="px-3.5 py-1.5 text-xs text-gray-600 hover:bg-gray-100 rounded-lg transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isVoiding}
                  className="px-4 py-1.5 text-xs font-semibold bg-red-600 text-white rounded-lg hover:bg-red-700 transition flex items-center gap-1.5 shadow-sm disabled:opacity-50"
                >
                  {isVoiding ? 'Voiding…' : 'Confirm Void'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
};
