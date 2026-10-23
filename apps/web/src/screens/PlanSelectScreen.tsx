import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { api, ApiError } from '../api/client.js';
import { AuthLayout } from '../components/layout/AuthLayout.js';
import { Button } from '../components/ui/Button.js';
import { AlertBanner } from '../components/ui/AlertBanner.js';
import { Pill } from '../components/ui/Pill.js';

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
      const bizCode = res.data.business.businessCode;
      navigate(`/login?biz=${encodeURIComponent(bizCode)}&registered=1`);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Registration failed. Please try again.';
      setError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const plans = [
    {
      code: 'starter' as const,
      name: 'Starter',
      price: 'Nu. 800',
      period: '/month',
      desc: '1 employee, manual inventory & billing',
      features: ['POS billing & held orders', '1 employee account', 'Inventory tracking', 'Receipt printing'],
    },
    {
      code: 'professional' as const,
      name: 'Professional',
      price: 'Nu. 2,200',
      period: '/month',
      desc: 'Up to 10 employees, GST & reports',
      popular: true,
      features: [
        'Everything in Starter',
        'Up to 10 employees',
        'GST & tax reports',
        'Customers & supplier credit',
        'CSV Import / Export',
      ],
    },
    {
      code: 'enterprise' as const,
      name: 'Enterprise',
      price: 'Nu. 4,500',
      period: '/month',
      desc: 'Unlimited staff & priority support',
      features: [
        'Everything in Professional',
        'Unlimited employees',
        'Multi-register POS',
        'Audit logs & analytics',
        'Dedicated support',
      ],
    },
  ];

  return (
    <AuthLayout
      title="Choose Plan"
      subtitle="Step 2 of 2: All plans include 14-day free trial. No card required."
      progressStep={2}
      totalSteps={2}
      maxWidth={680}
      footer={
        <div>
          <Link to="/register" style={{ color: 'var(--muted)', textDecoration: 'none' }}>
            ← Back to Business Details
          </Link>
        </div>
      }
    >
      {error && <AlertBanner variant="danger" message={error} />}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: '14px',
          marginBottom: '24px',
        }}
      >
        {plans.map((p) => {
          const isSelected = selectedPlan === p.code;
          return (
            <div
              key={p.code}
              onClick={() => setSelectedPlan(p.code)}
              style={{
                border: isSelected ? '2px solid var(--teal)' : '1px solid var(--line)',
                borderRadius: 'var(--radius-md)',
                padding: '16px 14px',
                backgroundColor: isSelected ? 'var(--teal-wash)' : '#FFFFFF',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                transition: 'all 0.15s ease',
                position: 'relative',
              }}
            >
              {p.popular && (
                <div style={{ position: 'absolute', top: '-10px', right: '12px' }}>
                  <Pill variant="success">POPULAR</Pill>
                </div>
              )}
              <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--ink)' }}>
                {p.name}
              </div>
              <div style={{ marginTop: '8px', marginBottom: '8px' }}>
                <span className="mono" style={{ fontSize: '19px', fontWeight: 700, color: 'var(--ink)' }}>
                  {p.price}
                </span>
                <span style={{ fontSize: '11px', color: 'var(--muted)' }}>{p.period}</span>
              </div>
              <div style={{ fontSize: '11.5px', color: 'var(--muted)', marginBottom: '12px', lineHeight: 1.3 }}>
                {p.desc}
              </div>
              <ul
                style={{
                  margin: 'auto 0 0 0',
                  padding: 0,
                  listStyle: 'none',
                  fontSize: '11px',
                  color: 'var(--ink)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '4px',
                }}
              >
                {p.features.map((feat, idx) => (
                  <li key={idx} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ color: 'var(--teal-dark)', fontWeight: 700 }}>✓</span>
                    <span>{feat}</span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <Button
          variant="primary"
          size="lg"
          loading={isSubmitting}
          onClick={handleSubmit}
          style={{ width: '100%', justifyContent: 'center' }}
        >
          Start 14-Day Free Trial →
        </Button>
      </div>
    </AuthLayout>
  );
}
