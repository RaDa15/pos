import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { api } from '../api/client.js';

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
  const [showPassword, setShowPassword] = useState(false);
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

    // Save draft in sessionStorage
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
    <div style={{ maxWidth: '540px', margin: '2rem auto', padding: '2rem', fontFamily: 'system-ui, sans-serif' }}>
      <header style={{ marginBottom: '2rem' }}>
        <h2 style={{ margin: '0 0 0.5rem 0' }}>Register your Business</h2>
        <p style={{ color: '#666', margin: 0 }}>Step 1 of 2: Business & Owner Details</p>
      </header>

      {error && (
        <div style={{ padding: '0.75rem 1rem', background: '#ffebe9', color: '#cf222e', borderRadius: '6px', marginBottom: '1.5rem', border: '1px solid #ff8182' }}>
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        <div>
          <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.25rem' }}>
            Business Name *
          </label>
          <input
            type="text"
            required
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              checkNameAvailability(e.target.value);
            }}
            placeholder="e.g. Thimphu Grocery & General Store"
            style={{ width: '100%', padding: '0.75rem', borderRadius: '6px', border: '1px solid #ccc', boxSizing: 'border-box' }}
          />
          {nameStatus === 'checking' && <small style={{ color: '#666' }}>Checking availability...</small>}
          {nameStatus === 'available' && <small style={{ color: '#2da44e' }}>✓ Business name is available</small>}
          {nameStatus === 'taken' && <small style={{ color: '#cf222e' }}>✗ Name already taken</small>}
        </div>

        <div>
          <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.25rem' }}>
            Business Type *
          </label>
          <div style={{ display: 'flex', gap: '1.5rem', marginTop: '0.25rem' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
              <input
                type="radio"
                name="businessType"
                value="grocery"
                checked={type === 'grocery'}
                onChange={() => setType('grocery')}
              />
              Grocery / Retail Store
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
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
        </div>

        <div>
          <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.25rem' }}>
            Owner / Manager Name *
          </label>
          <input
            type="text"
            required
            value={ownerName}
            onChange={(e) => setOwnerName(e.target.value)}
            placeholder="e.g. Pema Tshering"
            style={{ width: '100%', padding: '0.75rem', borderRadius: '6px', border: '1px solid #ccc', boxSizing: 'border-box' }}
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          <div>
            <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.25rem' }}>
              Phone Number *
            </label>
            <input
              type="tel"
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="e.g. 17123456"
              style={{ width: '100%', padding: '0.75rem', borderRadius: '6px', border: '1px solid #ccc', boxSizing: 'border-box' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.25rem' }}>
              Email Address *
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="e.g. owner@example.bt"
              style={{ width: '100%', padding: '0.75rem', borderRadius: '6px', border: '1px solid #ccc', boxSizing: 'border-box' }}
            />
          </div>
        </div>

        <div>
          <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.25rem' }}>
            Tax Payer Number (TPN) <small style={{ fontWeight: 'normal', color: '#666' }}>(optional)</small>
          </label>
          <input
            type="text"
            value={gstNo}
            onChange={(e) => setGstNo(e.target.value)}
            placeholder="e.g. TPN-12345678"
            style={{ width: '100%', padding: '0.75rem', borderRadius: '6px', border: '1px solid #ccc', boxSizing: 'border-box' }}
          />
          <small style={{ color: '#666', display: 'block', marginTop: '0.25rem' }}>
            If provided, your invoices will show "TAX INVOICE" and GST rates will apply. Without TPN, business operates as non-GST.
          </small>
        </div>

        <div>
          <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.25rem' }}>
            Business Address <small style={{ fontWeight: 'normal', color: '#666' }}>(optional)</small>
          </label>
          <input
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="e.g. Norzin Lam, Thimphu"
            style={{ width: '100%', padding: '0.75rem', borderRadius: '6px', border: '1px solid #ccc', boxSizing: 'border-box' }}
          />
        </div>

        <div>
          <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.25rem' }}>
            Company Master Password *
          </label>
          <div style={{ position: 'relative' }}>
            <input
              type={showPassword ? 'text' : 'password'}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Min 8 characters"
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
          <small style={{ color: '#666' }}>
            Used for device authorization and company-level sign in.
          </small>
        </div>

        <div>
          <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.25rem' }}>
            Confirm Password *
          </label>
          <input
            type={showPassword ? 'text' : 'password'}
            required
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Re-type master password"
            style={{ width: '100%', padding: '0.75rem', borderRadius: '6px', border: '1px solid #ccc', boxSizing: 'border-box' }}
          />
        </div>

        <button
          type="submit"
          style={{
            marginTop: '1rem',
            padding: '1rem',
            background: '#0969da',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            fontSize: '1rem',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Continue to Choose Plan →
        </button>

        <div style={{ textAlign: 'center', marginTop: '0.5rem' }}>
          <Link to="/login" style={{ color: '#0969da', textDecoration: 'none', fontSize: '0.9rem' }}>
            Already registered? Company sign-in
          </Link>
          {' · '}
          <Link to="/" style={{ color: '#666', textDecoration: 'none', fontSize: '0.9rem' }}>
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
