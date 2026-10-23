import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { apiGet } from '../api/client.js';
import { useAuth } from '../context/AuthContext.js';
import { ReceiptModal, ReceiptSaleData } from '../components/pos/ReceiptModal.js';

export const ReceiptScreen: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { business } = useAuth();

  const [sale, setSale] = useState<ReceiptSaleData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    apiGet<{ data: ReceiptSaleData }>(`/sales/${id}`)
      .then((res) => {
        setSale(res.data);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Invoice not found');
      })
      .finally(() => {
        setLoading(false);
      });
  }, [id]);

  if (loading) {
    return (
      <div className="p-12 text-center text-sm text-gray-500">
        Loading receipt details…
      </div>
    );
  }

  if (error || !sale) {
    return (
      <div className="p-12 max-w-md mx-auto text-center space-y-4">
        <div className="text-4xl">❌</div>
        <h2 className="text-lg font-bold text-gray-800">Invoice Not Found</h2>
        <p className="text-xs text-gray-500">
          The requested invoice ID could not be found or belongs to another business.
        </p>
        <button
          onClick={() => navigate('/app/sales')}
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-xs font-semibold hover:bg-indigo-700 transition"
        >
          ← Back to Invoices
        </button>
      </div>
    );
  }

  return (
    <div className="p-6">
      <ReceiptModal
        sale={sale}
        business={business || undefined}
        isOpen={true}
        onClose={() => navigate('/app/sales')}
        onVoidSuccess={(updatedSale) => setSale(updatedSale)}
      />
    </div>
  );
};
