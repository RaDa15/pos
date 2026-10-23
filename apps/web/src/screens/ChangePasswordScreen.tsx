import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.js';
import { ApiError } from '../api/client.js';

export function ChangePasswordScreen() {
  const navigate = useNavigate();
  const { employee, changePassword } = useAuth();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (newPassword.length < 8) {
      setError('New password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('New passwords do not match.');
      return;
    }

    setIsLoading(true);
    try {
      await changePassword(currentPassword, newPassword);

      // Redirect to role home
      if (employee?.role === 'Cashier' || employee?.role === 'Waiter') {
        navigate('/app/pos');
      } else if (employee?.role === 'Kitchen Staff') {
        navigate('/app/kitchen');
      } else {
        navigate('/app');
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message || 'Failed to update password.');
      } else {
        setError('An unexpected error occurred.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: '440px', margin: '4rem auto', padding: '2rem', fontFamily: 'system-ui, sans-serif' }}>
      <header style={{ textAlign: 'center', marginBottom: '2rem' }}>
        <h2 style={{ margin: '0 0 0.5rem 0' }}>Set New Password</h2>
        <p style={{ color: '#666', margin: 0, fontSize: '0.95rem' }}>
          You must change your temporary password before accessing the system.
        </p>
      </header>

      {error && (
        <div style={{ padding: '0.75rem 1rem', background: '#ffebe9', color: '#cf222e', borderRadius: '6px', marginBottom: '1.5rem', border: '1px solid #ff8182' }}>
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        <div>
          <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.25rem' }}>
            Current Temporary Password
          </label>
          <input
            type={showPassword ? 'text' : 'password'}
            required
            autoFocus
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            style={{ width: '100%', padding: '0.75rem', borderRadius: '6px', border: '1px solid #ccc', boxSizing: 'border-box' }}
          />
        </div>

        <div>
          <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.25rem' }}>
            New Password
          </label>
          <input
            type={showPassword ? 'text' : 'password'}
            required
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="Min 8 characters"
            style={{ width: '100%', padding: '0.75rem', borderRadius: '6px', border: '1px solid #ccc', boxSizing: 'border-box' }}
          />
        </div>

        <div>
          <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.25rem' }}>
            Confirm New Password
          </label>
          <input
            type={showPassword ? 'text' : 'password'}
            required
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Re-type new password"
            style={{ width: '100%', padding: '0.75rem', borderRadius: '6px', border: '1px solid #ccc', boxSizing: 'border-box' }}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <input
            type="checkbox"
            id="toggleShow"
            checked={showPassword}
            onChange={(e) => setShowPassword(e.target.checked)}
          />
          <label htmlFor="toggleShow" style={{ fontSize: '0.9rem', color: '#555', cursor: 'pointer' }}>
            Show passwords
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
          {isLoading ? 'Updating...' : 'Update Password & Continue →'}
        </button>
      </form>
    </div>
  );
}
