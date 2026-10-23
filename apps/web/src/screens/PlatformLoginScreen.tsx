import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { api, ApiError } from '../api/client.js';
import { AuthLayout } from '../components/layout/AuthLayout.js';
import { Field } from '../components/ui/Field.js';
import { Input } from '../components/ui/Input.js';
import { Button } from '../components/ui/Button.js';
import { AlertBanner } from '../components/ui/AlertBanner.js';

export function PlatformLoginScreen() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [totpToken, setTotpToken] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      await api.post('/api/v1/platform/login', {
        email: email.trim(),
        password,
        totpToken: totpToken.trim() || undefined,
      });
      navigate('/platform');
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message || 'Platform sign-in failed.');
      } else {
        setError('An unexpected error occurred.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthLayout
      title="Platform Admin"
      subtitle="SCR-25: SaaS Operations & Business Management"
      maxWidth={440}
      footer={
        <div>
          <Link to="/" style={{ color: 'var(--muted)', textDecoration: 'none' }}>
            ← Back to Public Home
          </Link>
        </div>
      }
    >
      {error && <AlertBanner variant="danger" message={error} />}

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <Field label="Platform Admin Email" required>
          <Input
            type="email"
            required
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="admin@pos.bt"
          />
        </Field>

        <Field label="Password" required>
          <Input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter master password"
          />
        </Field>

        <Field label="TOTP Authenticator Code (6 digits)">
          <Input
            type="text"
            value={totpToken}
            onChange={(e) => setTotpToken(e.target.value)}
            placeholder="e.g. 123456"
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
            Sign into Platform →
          </Button>
        </div>
      </form>
    </AuthLayout>
  );
}
