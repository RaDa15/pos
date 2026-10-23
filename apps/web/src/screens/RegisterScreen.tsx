import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { api } from '../api/client.js';
import { AuthLayout } from '../components/layout/AuthLayout.js';
import { Field } from '../components/ui/Field.js';
import { Input } from '../components/ui/Input.js';
import { Button } from '../components/ui/Button.js';
import { AlertBanner } from '../components/ui/AlertBanner.js';

export function RegisterScreen() {
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [nameStatus, setNameStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle');
  const [type, setType] = useState<'grocery' | 'restaurant'>('grocery');
  const [ownerName, setOwnerName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [gstNo, setGstNo] = useState('');
  const [address, setAddress] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const checkNameAvailability = async (candidate: string) => {
    const trimmed = candidate.trim();
    if (trimmed.length < 2) {
      setNameStatus('idle');
      return;
    }
    setNameStatus('checking');
    try {
      const res = await api.get<{ data: { available: boolean } }>(
        `/api/v1/register/name-available?name=${encodeURIComponent(trimmed)}`
      );
      setNameStatus(res.data.available ? 'available' : 'taken');
    } catch {
      setNameStatus('idle');
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (name.trim().length < 2) {
      setError('Business name must be at least 2 characters.');
      return;
    }
    if (nameStatus === 'taken') {
      setError('A business with this name already exists.');
      return;
    }
    if (!ownerName.trim()) {
      setError('Owner name is required.');
      return;
    }
    if (phone.trim().length < 8) {
      setError('Phone number must be at least 8 digits.');
      return;
    }
    if (!email.trim() || !email.includes('@')) {
      setError('A valid email address is required.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    const draft = {
      business: {
        name: name.trim(),
        type,
        ownerName: ownerName.trim(),
        phone: phone.trim(),
        email: email.trim(),
        gstNo: gstNo.trim() || null,
        address: address.trim() || null,
      },
      password,
    };

    sessionStorage.setItem('draft_registration', JSON.stringify(draft));
    navigate('/register/plan');
  };

  return (
    <AuthLayout
      title="Register Business"
      subtitle="Step 1 of 2: Business & Owner Details"
      progressStep={1}
      totalSteps={2}
      maxWidth={540}
      footer={
        <div>
          <Link to="/login" style={{ color: 'var(--teal-dark)', fontWeight: 600, textDecoration: 'none' }}>
            Already registered? Company sign-in
          </Link>
          {' · '}
          <Link to="/" style={{ color: 'var(--muted)', textDecoration: 'none' }}>
            Cancel
          </Link>
        </div>
      }
    >
      {error && <AlertBanner variant="danger" message={error} />}

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <Field
          label="Business Name"
          required
          hint={
            nameStatus === 'checking'
              ? 'Checking name availability...'
              : nameStatus === 'available'
              ? '✓ Business name is available'
              : nameStatus === 'taken'
              ? '✕ Business name is already taken'
              : undefined
          }
        >
          <Input
            type="text"
            required
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              checkNameAvailability(e.target.value);
            }}
            placeholder="e.g. Thimphu Grocery & General Store"
          />
        </Field>

        <Field label="Business Type" required>
          <div style={{ display: 'flex', gap: '16px', marginTop: '4px' }}>
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                cursor: 'pointer',
                fontSize: '13.5px',
                fontWeight: type === 'grocery' ? 600 : 400,
              }}
            >
              <input
                type="radio"
                name="businessType"
                value="grocery"
                checked={type === 'grocery'}
                onChange={() => setType('grocery')}
              />
              Grocery / Retail Store
            </label>
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                cursor: 'pointer',
                fontSize: '13.5px',
                fontWeight: type === 'restaurant' ? 600 : 400,
              }}
            >
              <input
                type="radio"
                name="businessType"
                value="restaurant"
                checked={type === 'restaurant'}
                onChange={() => setType('restaurant')}
              />
              Restaurant / Café / Bar
            </label>
          </div>
        </Field>

        <Field label="Owner / Manager Name" required>
          <Input
            type="text"
            required
            value={ownerName}
            onChange={(e) => setOwnerName(e.target.value)}
            placeholder="e.g. Pema Tshering"
          />
        </Field>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <Field label="Phone Number" required>
            <Input
              type="text"
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="e.g. 17123456"
            />
          </Field>
          <Field label="Email Address" required>
            <Input
              type="text"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="e.g. owner@example.bt"
            />
          </Field>
        </div>

        <Field
          label="Tax Payer Number (TPN)"
          hint="If provided, invoices show TAX INVOICE and GST applies. Otherwise non-GST."
        >
          <Input
            type="text"
            value={gstNo}
            onChange={(e) => setGstNo(e.target.value)}
            placeholder="e.g. TPN-12345678 (optional)"
          />
        </Field>

        <Field label="Business Address">
          <Input
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="e.g. Norzin Lam, Thimphu (optional)"
          />
        </Field>

        <Field label="Company Master Password" required hint="Used for device authorization and company-level sign in.">
          <Input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Min 8 characters"
          />
        </Field>

        <Field label="Confirm Master Password" required>
          <Input
            type="password"
            required
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Re-type master password"
          />
        </Field>

        <div style={{ marginTop: '16px' }}>
          <Button
            type="submit"
            variant="primary"
            size="lg"
            style={{ width: '100%', justifyContent: 'center' }}
          >
            Continue to Choose Plan →
          </Button>
        </div>
      </form>
    </AuthLayout>
  );
}
