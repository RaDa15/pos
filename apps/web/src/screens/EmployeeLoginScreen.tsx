import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.js';
import { ApiError } from '../api/client.js';

export function EmployeeLoginScreen() {
  const navigate = useNavigate();
  const { deviceBusiness, checkDevice, employeeLogin, forgetDevice, subscription } = useAuth();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
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

      // Role-based home routing (v1 change from 08-APP-FLOW.md §2)
      if (emp.role === 'Cashier' || emp.role === 'Waiter') {
        navigate('/app/pos');
      } else if (emp.role === 'Kitchen Staff') {
        navigate('/app/kitchen');
      } else {
        navigate('/app');
      }
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === 'ACCOUNT_LOCKED' || err.status === 423) {
          setError('Too many attempts. Try again in 15 minutes.');
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
      <div style={{ maxWidth: '440px', margin: '4rem auto', textAlign: 'center', fontFamily: 'system-ui, sans-serif' }}>
        <p>Loading company details...</p>
      </div>
    );
  }

  const isExpired = subscription?.effectiveStatus === 'expired';

  return (
    <div style={{ maxWidth: '440px', margin: '3rem auto', padding: '2rem', fontFamily: 'system-ui, sans-serif' }}>
      <header style={{ textAlign: 'center', marginBottom: '2rem' }}>
        <h2 style={{ margin: '0 0 0.25rem 0' }}>{deviceBusiness.name}</h2>
        <span style={{ display: 'inline-block', fontSize: '0.85rem', color: '#666', background: '#f1f5f9', padding: '2px 8px', borderRadius: '4px', marginBottom: '0.75rem' }}>
          {deviceBusiness.businessCode}
        </span>
        <p style={{ color: '#666', margin: 0, fontSize: '0.95rem' }}>
          Employee Sign-in · Stage 2 of 2
        </p>
      </header>

      {isExpired && (
        <div style={{ padding: '0.75rem 1rem', background: '#fef2f2', color: '#b91c1c', borderRadius: '6px', marginBottom: '1.5rem', border: '1px solid #f87171' }}>
          <strong>Subscription is Expired.</strong>
          <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.85rem' }}>
            Please sign in as Administrator to reactivate your subscription.
          </p>
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
            Username
          </label>
          <input
            type="text"
            required
            autoFocus
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Enter your username"
            style={{ width: '100%', padding: '0.75rem', borderRadius: '6px', border: '1px solid #ccc', boxSizing: 'border-box' }}
          />
        </div>

        <div>
          <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.25rem' }}>
            Password
          </label>
          <div style={{ position: 'relative' }}>
            <input
              type={showPassword ? 'text' : 'password'}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
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
          {isLoading ? 'Signing in...' : 'Sign in →'}
        </button>

        <div style={{ display: 'flex', justifyContent: 'center', marginTop: '1rem' }}>
          <button
            type="button"
            onClick={handleForgetDevice}
            style={{
              background: 'none',
              border: 'none',
              color: '#0969da',
              cursor: 'pointer',
              fontSize: '0.9rem',
              padding: 0,
            }}
          >
            ← Different company
          </button>
        </div>
      </form>
    </div>
  );
}
