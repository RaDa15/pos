import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.js';
import { ApiError } from '../api/client.js';

export function CompanyLoginScreen() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { companyLogin } = useAuth();

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [rememberDevice, setRememberDevice] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
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
          setError('Business not found or incorrect password.');
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
    <div style={{ maxWidth: '440px', margin: '3rem auto', padding: '2rem', fontFamily: 'system-ui, sans-serif' }}>
      <header style={{ textAlign: 'center', marginBottom: '2rem' }}>
        <h2 style={{ margin: '0 0 0.5rem 0' }}>Company Sign-in</h2>
        <p style={{ color: '#666', margin: 0, fontSize: '0.95rem' }}>Stage 1 of 2: Device Authorization</p>
      </header>

      {registeredMsg && (
        <div style={{ padding: '0.75rem 1rem', background: '#dcfce7', color: '#166534', borderRadius: '6px', marginBottom: '1.5rem', border: '1px solid #86efac' }}>
          Your trial has started. Sign in to continue.
        </div>
      )}

      {error && (
        <div style={{ padding: '0.75rem 1rem', background: '#ffebe9', color: '#cf222e', borderRadius: '6px', marginBottom: '1.5rem', border: '1px solid #ff8182' }}>
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        <div>
          <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.25rem' }}>
            Company Name or Business ID
          </label>
          <input
            type="text"
            required
            autoFocus
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            placeholder="e.g. BIZ-XXXXX or Pema Store"
            style={{ width: '100%', padding: '0.75rem', borderRadius: '6px', border: '1px solid #ccc', boxSizing: 'border-box' }}
          />
        </div>

        <div>
          <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.25rem' }}>
            Company Master Password
          </label>
          <div style={{ position: 'relative' }}>
            <input
              type={showPassword ? 'text' : 'password'}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter company password"
              style={{ width: '100%', padding: '0.75rem', borderRadius: '6px', border: '1px solid #ccc', boxSizing: 'border-box' }}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              style={{
                position: 'absolute',
                right: '8px',
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: '#666',
                fontSize: '0.85rem',
              }}
            >
              {showPassword ? 'Hide' : 'Show'}
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <input
            type="checkbox"
            id="rememberDevice"
            checked={rememberDevice}
            onChange={(e) => setRememberDevice(e.target.checked)}
          />
          <label htmlFor="rememberDevice" style={{ fontSize: '0.9rem', color: '#444', cursor: 'pointer' }}>
            Remember this device for 30 days
          </label>
        </div>

        <button
          type="submit"
          disabled={isLoading}
          style={{
            marginTop: '0.5rem',
            padding: '0.85rem',
            background: '#0969da',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            fontSize: '1rem',
            fontWeight: 600,
            cursor: isLoading ? 'not-allowed' : 'pointer',
            opacity: isLoading ? 0.7 : 1,
          }}
        >
          {isLoading ? 'Authorizing...' : 'Continue securely →'}
        </button>

        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '1rem', fontSize: '0.9rem' }}>
          <Link to="/register" style={{ color: '#0969da', textDecoration: 'none' }}>
            Create an account
          </Link>
          <Link to="/" style={{ color: '#666', textDecoration: 'none' }}>
            ← Back to Home
          </Link>
        </div>
      </form>
    </div>
  );
}
