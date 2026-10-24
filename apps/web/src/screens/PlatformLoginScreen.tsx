import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { api, ApiError } from '../api/client.js';
import { AuthLayout } from '../components/layout/AuthLayout.js';
import { Field } from '../components/ui/Field.js';
import { Input } from '../components/ui/Input.js';
import { Button } from '../components/ui/Button.js';
import { AlertBanner } from '../components/ui/AlertBanner.js';

interface LoginResponse {
  message: string;
  admin: {
    id: string;
    email: string;
    name: string;
    totpEnabled: boolean;
    mustChangePassword: boolean;
  };
}

export function PlatformLoginScreen() {
  const navigate = useNavigate();
  const [step, setStep] = useState<'login' | 'totp-setup'>('login');

  // Credentials
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [totpToken, setTotpToken] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Setup TOTP state
  const [totpSecret, setTotpSecret] = useState('');
  const [qrUri, setQrUri] = useState('');
  const [verifyCode, setVerifyCode] = useState('');
  const [setupLoading, setSetupLoading] = useState(false);
  const [setupSuccess, setSetupSuccess] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const res = await api.post<LoginResponse>('/api/v1/platform/auth/login', {
        email: email.trim(),
        password,
        totpToken: totpToken.trim() || undefined,
      });

      // If TOTP is not enabled yet, transition to TOTP setup flow (AC-57)
      if (!res.admin.totpEnabled) {
        // Call setup to generate secret
        const setupRes = await api.post<{ secret: string; qrUri: string }>('/api/v1/platform/auth/totp/setup');
        setTotpSecret(setupRes.secret);
        setQrUri(setupRes.qrUri);
        setStep('totp-setup');
      } else {
        navigate('/platform');
      }
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

  const handleVerifySetup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSetupLoading(true);

    try {
      await api.post('/api/v1/platform/auth/totp/verify', {
        code: verifyCode.trim(),
      });
      setSetupSuccess(true);
      setTimeout(() => {
        navigate('/platform');
      }, 1200);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message || 'Invalid 6-digit verification code.');
      } else {
        setError('Verification failed. Try again.');
      }
    } finally {
      setSetupLoading(false);
    }
  };

  return (
    <AuthLayout
      title="Platform Admin"
      subtitle={
        step === 'login'
          ? 'SCR-25: Platform Operator & Multi-Tenant Management'
          : 'Enrol Two-Factor Authenticator (RFC 6238 TOTP)'
      }
      maxWidth={460}
      footer={
        <div>
          <Link to="/" style={{ color: 'var(--muted)', textDecoration: 'none', fontSize: '13px' }}>
            ← Back to Public Home
          </Link>
        </div>
      }
    >
      {error && <AlertBanner variant="danger" message={error} />}

      {step === 'login' ? (
        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
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

          <Field label="Master Password" required>
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
              maxLength={6}
              value={totpToken}
              onChange={(e) => setTotpToken(e.target.value)}
              placeholder="Leave blank on first login to enrol"
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
      ) : (
        <form onSubmit={handleVerifySetup} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {setupSuccess ? (
            <div style={{ textAlign: 'center', padding: '16px 0', color: 'var(--teal)' }}>
              <div style={{ fontSize: '36px', marginBottom: '8px' }}>✓</div>
              <div style={{ fontWeight: 700, fontSize: '16px' }}>Two-Factor Authentication Enrolled!</div>
              <div style={{ fontSize: '13px', color: 'var(--muted)', marginTop: '4px' }}>
                Redirecting to Platform Directory...
              </div>
            </div>
          ) : (
            <>
              <div
                style={{
                  backgroundColor: 'var(--paper)',
                  padding: '14px',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--line)',
                  fontSize: '12.5px',
                  color: 'var(--ink)',
                  lineHeight: 1.5,
                }}
              >
                <div style={{ fontWeight: 700, marginBottom: '4px' }}>Security Requirement (AC-57):</div>
                Platform Administrators must enrol a two-factor authenticator app (e.g. Google Authenticator, Authy, 1Password) before accessing sensitive tenant records.
              </div>

              <div
                style={{
                  backgroundColor: '#FFFFFF',
                  padding: '16px',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--line)',
                  textAlign: 'center',
                }}
              >
                <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: '8px' }}>
                  Secret Key for Manual Entry
                </div>
                <code
                  style={{
                    fontSize: '15px',
                    fontWeight: 700,
                    letterSpacing: '0.1em',
                    backgroundColor: 'var(--paper)',
                    padding: '6px 12px',
                    borderRadius: '4px',
                    display: 'inline-block',
                    userSelect: 'all',
                  }}
                >
                  {totpSecret}
                </code>
                {qrUri && (
                  <div style={{ marginTop: '12px', fontSize: '11.5px', color: 'var(--muted)' }}>
                    Add this account into your mobile authenticator app.
                  </div>
                )}
              </div>

              <Field label="Enter 6-Digit Code from Authenticator" required>
                <Input
                  required
                  autoFocus
                  maxLength={6}
                  value={verifyCode}
                  onChange={(e) => setVerifyCode(e.target.value)}
                  placeholder="e.g. 123456"
                />
              </Field>

              <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setStep('login')}
                  style={{ flex: 1, justifyContent: 'center' }}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  loading={setupLoading}
                  style={{ flex: 2, justifyContent: 'center' }}
                >
                  Verify & Complete Enrolment
                </Button>
              </div>
            </>
          )}
        </form>
      )}
    </AuthLayout>
  );
}
