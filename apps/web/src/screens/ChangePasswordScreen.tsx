import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.js';
import { ApiError } from '../api/client.js';
import { AuthLayout } from '../components/layout/AuthLayout.js';
import { Field } from '../components/ui/Field.js';
import { Input } from '../components/ui/Input.js';
import { Button } from '../components/ui/Button.js';
import { AlertBanner } from '../components/ui/AlertBanner.js';

export function ChangePasswordScreen() {
  const navigate = useNavigate();
  const { employee, changePassword } = useAuth();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
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

      const r = (employee?.role || '').toLowerCase();
      if (r === 'cashier' || r === 'waiter') {
        navigate('/app/pos');
      } else if (r === 'kitchen_staff') {
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
    <AuthLayout
      title="Set New Password"
      subtitle="You must change your temporary password before proceeding."
      maxWidth={440}
    >
      {error && <AlertBanner variant="danger" message={error} />}

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <Field label="Current Temporary Password" required>
          <Input
            type="password"
            required
            autoFocus
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
          />
        </Field>

        <Field label="New Password" required hint="Must be at least 8 characters.">
          <Input
            type="password"
            required
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="Min 8 characters"
          />
        </Field>

        <Field label="Confirm New Password" required>
          <Input
            type="password"
            required
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Re-type new password"
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
            Save Password & Continue →
          </Button>
        </div>
      </form>
    </AuthLayout>
  );
}
