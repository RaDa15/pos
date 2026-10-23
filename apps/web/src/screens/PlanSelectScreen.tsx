import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { api, ApiError } from '../api/client.js';

interface DraftRegistration {
  business: {
    name: string;
    type: 'grocery' | 'restaurant';
    ownerName: string;
    phone: string;
    email: string;
    gstNo?: string | null;
    address?: string | null;
  };
  password: string;
}

export function PlanSelectScreen() {
  const navigate = useNavigate();
  const [draft, setDraft] = useState<DraftRegistration | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<'starter' | 'professional' | 'enterprise'>('professional');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const saved = sessionStorage.getItem('draft_registration');
    if (!saved) {
      navigate('/register');
      return;
    }
    try {
      setDraft(JSON.parse(saved));
    } catch {
      navigate('/register');
    }
  }, [navigate]);

  if (!draft) {
    return null;
  }

  const handleSubmit = async () => {
    setIsSubmitting(true);
    setError(null);

    try {
      const res = await api.post<{
        data: {
          business: {
            id: string;
            businessCode: string;
            name: string;
          };
          employee: {
            id: string;
            username: string;
          };
        };
      }>('/api/v1/register', {
        business: draft.business,
        password: draft.password,
        plan: selectedPlan,
      });

      sessionStorage.removeItem('draft_registration');
      // Navigate to company login with business ID prefilled
      const bizCode = res.data.business.businessCode;
      navigate(`/login?biz=${encodeURIComponent(bizCode)}&registered=1`);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Registration failed. Please try again.';
      setError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div style={{ maxWidth: '720px', margin: '2rem auto', padding: '2rem', fontFamily: 'system-ui, sans-serif' }}>
      <header style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
        <h2 style={{ margin: '0 0 0.5rem 0' }}>Choose your Plan</h2>
        <p style={{ color: '#666', margin: 0 }}>
          Step 2 of 2: All plans include a 14-day free trial. No card required.
        </p>
      </header>

      {error && (
        <div style={{ padding: '0.75rem 1rem', background: '#ffebe9', color: '#cf222e', borderRadius: '6px', marginBottom: '1.5rem', border: '1px solid #ff8182' }}>
          {error}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.25rem', marginBottom: '2rem' }}>
        {/* Starter Plan */}
        <div
          onClick={() => setSelectedPlan('starter')}
          style={{
            border: selectedPlan === 'starter' ? '2px solid #0969da' : '1px solid #d0d7de',
            borderRadius: '8px',
            padding: '1.5rem',
            background: selectedPlan === 'starter' ? '#f6f8fa' : 'white',
            cursor: 'pointer',
            position: 'relative',
          }}
        >
          <h3 style={{ margin: '0 0 0.5rem 0' }}>Starter</h3>
          <p style={{ fontSize: '1.3rem', fontWeight: 'bold', margin: '0 0 1rem 0' }}>
            Nu. 500 <span style={{ fontSize: '0.9rem', fontWeight: 'normal', color: '#666' }}>/ month</span>
          </p>
          <ul style={{ paddingLeft: '1.2rem', margin: 0, fontSize: '0.9rem', color: '#444', lineHeight: '1.6' }}>
            <li>1 Active Employee</li>
            <li>Up to 500 products</li>
            <li>Standard POS & Receipts</li>
            <li>Basic daily summaries</li>
          </ul>
        </div>

        {/* Professional Plan */}
        <div
          onClick={() => setSelectedPlan('professional')}
          style={{
            border: selectedPlan === 'professional' ? '2px solid #0969da' : '1px solid #d0d7de',
            borderRadius: '8px',
            padding: '1.5rem',
            background: selectedPlan === 'professional' ? '#f0f7ff' : 'white',
            cursor: 'pointer',
            position: 'relative',
          }}
        >
          <div
            style={{
              position: 'absolute',
              top: '-10px',
              right: '12px',
              background: '#0969da',
              color: 'white',
              fontSize: '0.75rem',
              fontWeight: 600,
              padding: '2px 8px',
              borderRadius: '12px',
            }}
          >
            POPULAR
          </div>
          <h3 style={{ margin: '0 0 0.5rem 0' }}>Professional</h3>
          <p style={{ fontSize: '1.3rem', fontWeight: 'bold', margin: '0 0 1rem 0' }}>
            Nu. 1,200 <span style={{ fontSize: '0.9rem', fontWeight: 'normal', color: '#666' }}>/ month</span>
          </p>
          <ul style={{ paddingLeft: '1.2rem', margin: 0, fontSize: '0.9rem', color: '#444', lineHeight: '1.6' }}>
            <li>Up to 10 Employees</li>
            <li>Unlimited products</li>
            <li>CSV Catalog Import/Export</li>
            <li>GST Reports & Kitchen Board</li>
            <li>Customer Credit Ledger</li>
          </ul>
        </div>

        {/* Enterprise Plan */}
        <div
          onClick={() => setSelectedPlan('enterprise')}
          style={{
            border: selectedPlan === 'enterprise' ? '2px solid #0969da' : '1px solid #d0d7de',
            borderRadius: '8px',
            padding: '1.5rem',
            background: selectedPlan === 'enterprise' ? '#f6f8fa' : 'white',
            cursor: 'pointer',
            position: 'relative',
          }}
        >
          <h3 style={{ margin: '0 0 0.5rem 0' }}>Enterprise</h3>
          <p style={{ fontSize: '1.3rem', fontWeight: 'bold', margin: '0 0 1rem 0' }}>
            Nu. 3,000 <span style={{ fontSize: '0.9rem', fontWeight: 'normal', color: '#666' }}>/ month</span>
          </p>
          <ul style={{ paddingLeft: '1.2rem', margin: 0, fontSize: '0.9rem', color: '#444', lineHeight: '1.6' }}>
            <li>Unlimited Employees</li>
            <li>Unlimited products</li>
            <li>All modules & features</li>
            <li>Dedicated Priority Support</li>
          </ul>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', alignItems: 'center' }}>
        <button
          onClick={handleSubmit}
          disabled={isSubmitting}
          style={{
            width: '100%',
            maxWidth: '360px',
            padding: '1rem 2rem',
            background: '#0969da',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            fontSize: '1.1rem',
            fontWeight: 600,
            cursor: isSubmitting ? 'not-allowed' : 'pointer',
            opacity: isSubmitting ? 0.7 : 1,
          }}
        >
          {isSubmitting ? 'Creating Business...' : 'Start 14-day Free Trial'}
        </button>

        <Link to="/register" style={{ color: '#666', textDecoration: 'none', fontSize: '0.9rem' }}>
          ← Back to business details
        </Link>
      </div>
    </div>
  );
}
