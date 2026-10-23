import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.js';
import { ApiError } from '../api/client.js';
import { AuthLayout } from '../components/layout/AuthLayout.js';
import { Field } from '../components/ui/Field.js';
import { Input } from '../components/ui/Input.js';
import { Button } from '../components/ui/Button.js';
import { AlertBanner } from '../components/ui/AlertBanner.js';

export function CompanyLoginScreen() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { companyLogin } = useAuth();

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [rememberDevice, setRememberDevice] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [registeredMsg, setRegisteredMsg] = useState(false);

  useEffect(() => {
    const bizParam = searchParams.get('biz');
    if (bizParam) {
      setIdentifier(bizParam);
    }
    if (searchParams.get('registered') === '1') {
      setRegisteredMsg(true);
    }
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      await companyLogin(identifier.trim(), password, rememberDevice);
      navigate('/login/employee');
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === 'ACCOUNT_LOCKED' || err.status === 429) {
          setError('Too many attempts. Try again in 15 minutes.');
        } else if (err.code === 'INVALID_CREDENTIALS' || err.status === 401) {
          setError('Business not found or incorrect master password.');
        } else {
          setError(err.message || 'Company sign-in failed.');
        }
      } else {
        setError('An unexpected error occurred.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthLayout
      title="Company Sign-in"
      subtitle="Stage 1 of 2: Device Authorization"
      progressStep={1}
      totalSteps={2}
      maxWidth={440}
      footer={
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12.5px' }}>
          <Link to="/register" style={{ color: 'var(--teal-dark)', fontWeight: 600, textDecoration: 'none' }}>
            Register new business
          </Link>
          <Link to="/" style={{ color: 'var(--muted)', textDecoration: 'none' }}>
            ← Back to Home
          </Link>
        </div>
      }
    >
      {registeredMsg && (
        <AlertBanner
          variant="warning"
          message="Your 14-day trial has started. Sign in to authorize this device."
        />
      )}

      {error && <AlertBanner variant="danger" message={error} />}

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <Field label="Business Name or Business ID" required>
          <Input
            type="text"
            required
            autoFocus
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            placeholder="e.g. BIZ-XXXXX or Pema Store"
          />
        </Field>

        <Field label="Company Master Password" required>
          <Input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter master password"
          />
        </Field>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: '4px 0 16px 0' }}>
          <input
            type="checkbox"
            id="rememberDevice"
            checked={rememberDevice}
            onChange={(e) => setRememberDevice(e.target.checked)}
            style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: 'var(--teal)' }}
          />
          <label htmlFor="rememberDevice" style={{ fontSize: '13px', color: 'var(--ink)', cursor: 'pointer', margin: 0 }}>
            Remember this device for 30 days
          </label>
        </div>

        <Button
          type="submit"
          variant="primary"
          size="lg"
          loading={isLoading}
          style={{ width: '100%', justifyContent: 'center' }}
        >
          Continue securely →
        </Button>
      </form>
    </AuthLayout>
  );
}
