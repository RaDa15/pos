import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.js';
import { ApiError } from '../api/client.js';
import { AuthLayout } from '../components/layout/AuthLayout.js';
import { Field } from '../components/ui/Field.js';
import { Input } from '../components/ui/Input.js';
import { Button } from '../components/ui/Button.js';
import { AlertBanner } from '../components/ui/AlertBanner.js';

export function EmployeeLoginScreen() {
  const navigate = useNavigate();
  const { deviceBusiness, checkDevice, employeeLogin, forgetDevice, subscription } = useAuth();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    checkDevice().then((biz) => {
      if (!biz) {
        navigate('/login');
      }
    });
  }, [checkDevice, navigate]);

  const handleForgetDevice = async () => {
    await forgetDevice();
    navigate('/login');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const emp = await employeeLogin(username.trim(), password);

      if (emp.mustChangePassword) {
        navigate('/change-password');
        return;
      }

      // Role-based home routing (08-APP-FLOW.md §2)
      const r = emp.role.toLowerCase();
      if (r === 'cashier' || r === 'waiter') {
        navigate('/app/pos');
      } else if (r === 'kitchen_staff') {
        navigate('/app/kitchen');
      } else {
        navigate('/app');
      }
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === 'ACCOUNT_LOCKED' || err.status === 423) {
          setError('Too many attempts. Account locked. Try again in 15 minutes.');
        } else if (err.code === 'INVALID_CREDENTIALS' || err.status === 401) {
          setError('Incorrect username or password.');
        } else {
          setError(err.message || 'Sign in failed.');
        }
      } else {
        setError('An unexpected error occurred.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  if (!deviceBusiness) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: 'var(--muted)' }}>Loading business authorization...</p>
      </div>
    );
  }

  const isExpired = subscription?.effectiveStatus === 'expired';

  return (
    <AuthLayout
      title={deviceBusiness.name}
      subtitle={`${deviceBusiness.businessCode} · Employee Sign-in · Stage 2 of 2`}
      progressStep={2}
      totalSteps={2}
      maxWidth={440}
      footer={
        <div>
          <button
            type="button"
            onClick={handleForgetDevice}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--muted)',
              cursor: 'pointer',
              fontSize: '12.5px',
              padding: 0,
            }}
          >
            ← Different company
          </button>
        </div>
      }
    >
      {isExpired && (
        <AlertBanner
          variant="danger"
          message="Subscription is Expired. Please sign in as Administrator to renew."
        />
      )}

      {error && <AlertBanner variant="danger" message={error} />}

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <Field label="Username" required>
          <Input
            type="text"
            required
            autoFocus
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="e.g. admin or cashier1"
          />
        </Field>

        <Field label="Password" required>
          <Input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter your employee password"
          />
        </Field>

        <div style={{ marginTop: '12px' }}>
          <Button
            type="submit"
            variant="primary"
            size="lg"
            loading={isLoading}
            style={{ width: '100%', justifyContent: 'center' }}
          >
            Sign in →
          </Button>
        </div>
      </form>
    </AuthLayout>
  );
}
