import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { AppShell } from '../components/layout/AppShell.js';
import { Card } from '../components/ui/Card.js';
import { Button } from '../components/ui/Button.js';
import { Input } from '../components/ui/Input.js';
import { Modal } from '../components/ui/Modal.js';
import { Pill } from '../components/ui/Pill.js';
import { useToast } from '../components/ui/Toast.js';
import { apiClient } from '../api/client.js';
import {
  TAX_MODES,
  TAX_CATEGORIES,
  TAX_MODE_LABELS,
  TAX_CATEGORY_LABELS,
  CUSTOMER_TYPE_LABELS,
  TaxMode,
  TaxCategory,
} from '@pos/shared';

interface TaxRate {
  id: string;
  name: string;
  rate: number;
  mode: TaxMode;
  category: TaxCategory;
  effectiveDate: string;
  active: boolean;
  isDefault: boolean;
}

interface CustomerDiscount {
  customerType: string;
  discountPct: number;
}

interface BusinessProfile {
  id: string;
  businessCode: string;
  name: string;
  type: string;
  ownerName: string;
  phone: string;
  email: string;
  address: string | null;
  gstNo: string | null;
  gstRegistered: boolean;
  logoUrl: string | null;
}

export const SettingsScreen: React.FC = () => {
  const { t } = useTranslation();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Business profile state
  const [profile, setProfile] = useState<BusinessProfile | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);

  // Tax rates state
  const [taxRates, setTaxRates] = useState<TaxRate[]>([]);
  const [isTaxModalOpen, setIsTaxModalOpen] = useState(false);
  const [editingTaxRate, setEditingTaxRate] = useState<TaxRate | null>(null);
  const [taxFormData, setTaxFormData] = useState({
    name: '',
    rate: '5',
    mode: 'exclusive' as TaxMode,
    category: 'standard' as TaxCategory,
    effectiveDate: new Date().toISOString().split('T')[0],
    isDefault: false,
    active: true,
  });
  const [savingTax, setSavingTax] = useState(false);

  // Customer discounts state
  const [discounts, setDiscounts] = useState<CustomerDiscount[]>([]);
  const [savingDiscounts, setSavingDiscounts] = useState(false);

  // Logo upload state
  const logoInputRef = useRef<HTMLInputElement | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  // Fetch settings data
  const loadSettings = async () => {
    try {
      setLoading(true);
      const [bizRes, taxRes, discRes] = await Promise.all([
        apiClient.get<{ data: BusinessProfile }>('/api/v1/business'),
        apiClient.get<{ data: TaxRate[] }>('/api/v1/settings/tax-rates'),
        apiClient.get<{ data: CustomerDiscount[] }>('/api/v1/settings/customer-discounts'),
      ]);
      setProfile(bizRes.data);
      setTaxRates(taxRes.data || []);
      setDiscounts(discRes.data || []);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load business settings.';
      setErrorMessage(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);

  // Save profile
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;

    setSavingProfile(true);
    setErrorMessage(null);

    try {
      const res = await apiClient.patch<{ data: BusinessProfile }>('/api/v1/business', {
        ownerName: profile.ownerName,
        phone: profile.phone,
        email: profile.email,
        address: profile.address,
        gstNo: profile.gstNo,
        gstRegistered: profile.gstRegistered,
      });
      setProfile(res.data);
      toast('Business profile saved.', 'success');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save business profile.';
      setErrorMessage(msg);
    } finally {
      setSavingProfile(false);
    }
  };

  // Upload logo
  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.[0]) return;
    const file = e.target.files[0];

    if (file.size > 2 * 1024 * 1024) {
      setErrorMessage('Logo file size must be less than 2 MB.');
      return;
    }

    setUploadingLogo(true);
    setErrorMessage(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await apiClient.post<{ data: { logoUrl: string } }>(
        '/api/v1/business/logo',
        formData
      );
      if (profile) {
        setProfile({ ...profile, logoUrl: res.data.logoUrl });
      }
      toast('Logo updated.', 'success');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Logo upload failed. SVG is not allowed.';
      setErrorMessage(msg);
    } finally {
      setUploadingLogo(false);
    }
  };

  // Delete logo
  const handleDeleteLogo = async () => {
    try {
      await apiClient.delete('/api/v1/business/logo');
      if (profile) {
        setProfile({ ...profile, logoUrl: null });
      }
      toast('Logo removed. Default logo will be used on receipts.', 'info');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to delete logo.';
      setErrorMessage(msg);
    }
  };

  // Open Tax Modal for Create
  const handleOpenCreateTax = () => {
    setEditingTaxRate(null);
    setTaxFormData({
      name: '',
      rate: '5',
      mode: 'exclusive',
      category: 'standard',
      effectiveDate: new Date().toISOString().split('T')[0],
      isDefault: false,
      active: true,
    });
    setIsTaxModalOpen(true);
  };

  // Open Tax Modal for Edit
  const handleOpenEditTax = (rate: TaxRate) => {
    setEditingTaxRate(rate);
    setTaxFormData({
      name: rate.name,
      rate: String(rate.rate),
      mode: rate.mode,
      category: rate.category,
      effectiveDate: rate.effectiveDate,
      isDefault: rate.isDefault,
      active: rate.active,
    });
    setIsTaxModalOpen(true);
  };

  // Save Tax Rate
  const handleSaveTaxRate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingTax(true);
    setErrorMessage(null);

    try {
      if (editingTaxRate) {
        // BR-10 / AC-52: Rate, Mode, and Category are immutable!
        await apiClient.patch(`/api/v1/settings/tax-rates/${editingTaxRate.id}`, {
          name: taxFormData.name,
          effectiveDate: taxFormData.effectiveDate,
          active: taxFormData.active,
          isDefault: taxFormData.isDefault,
        });
        toast(`Tax rate "${taxFormData.name}" updated.`, 'success');
      } else {
        await apiClient.post('/api/v1/settings/tax-rates', {
          name: taxFormData.name,
          rate: parseFloat(taxFormData.rate) || 0,
          mode: taxFormData.mode,
          category: taxFormData.category,
          effectiveDate: taxFormData.effectiveDate,
          isDefault: taxFormData.isDefault,
        });
        toast(`Tax rate "${taxFormData.name}" created.`, 'success');
      }

      setIsTaxModalOpen(false);
      await loadSettings();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save tax rate.';
      setErrorMessage(msg);
    } finally {
      setSavingTax(false);
    }
  };

  // Set default tax rate
  const handleSetDefaultTax = async (rateId: string) => {
    try {
      await apiClient.patch(`/api/v1/settings/tax-rates/${rateId}`, { isDefault: true });
      toast('Default tax rate updated.', 'success');
      await loadSettings();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to set default rate.';
      setErrorMessage(msg);
    }
  };

  // Save Customer Discounts
  const handleSaveDiscounts = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingDiscounts(true);
    setErrorMessage(null);

    try {
      await apiClient.put('/api/v1/settings/customer-discounts', {
        items: discounts.map((d) => ({
          customerType: d.customerType,
          discountPct: Number(d.discountPct) || 0,
        })),
      });
      toast('Customer-type discounts saved (BR-34).', 'success');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save customer discounts.';
      setErrorMessage(msg);
    } finally {
      setSavingDiscounts(false);
    }
  };

  const updateDiscountPct = (type: string, val: string) => {
    const num = Math.min(100, Math.max(0, parseFloat(val) || 0));
    setDiscounts((prev) =>
      prev.map((d) => (d.customerType === type ? { ...d, discountPct: num } : d))
    );
  };

  return (
    <AppShell
      title={t('nav.settings', 'Settings')}
      subtitle="Business profile, tax rates, receipt branding, and customer discounts."
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        {errorMessage && (
          <div
            style={{
              padding: '12px 16px',
              background: 'var(--red-tint)',
              color: 'var(--red)',
              borderRadius: '8px',
              fontSize: '13.5px',
            }}
          >
            {errorMessage}
          </div>
        )}

        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--muted)' }}>
            Loading settings…
          </div>
        ) : (
          <>
            {/* Section 1: Business Profile & Logo */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
                gap: '20px',
              }}
            >
              {/* Profile Card */}
              <Card>
                <h2
                  style={{
                    fontSize: '16px',
                    fontWeight: 700,
                    margin: '0 0 16px 0',
                    color: 'var(--ink)',
                  }}
                >
                  Store Profile
                </h2>

                <form
                  onSubmit={handleSaveProfile}
                  style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}
                >
                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                      Business Name
                    </label>
                    <Input disabled value={profile?.name || ''} />
                    <span style={{ fontSize: '11px', color: 'var(--muted)' }}>
                      Business Code: {profile?.businessCode} · Type: {profile?.type} (Immutable in v1)
                    </span>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                      Owner / Manager Name *
                    </label>
                    <Input
                      required
                      value={profile?.ownerName || ''}
                      onChange={(e) =>
                        setProfile(profile ? { ...profile, ownerName: e.target.value } : null)
                      }
                    />
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                        Phone Number *
                      </label>
                      <Input
                        required
                        value={profile?.phone || ''}
                        onChange={(e) =>
                          setProfile(profile ? { ...profile, phone: e.target.value } : null)
                        }
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                        Email *
                      </label>
                      <Input
                        required
                        type="email"
                        value={profile?.email || ''}
                        onChange={(e) =>
                          setProfile(profile ? { ...profile, email: e.target.value } : null)
                        }
                      />
                    </div>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                      Store Address
                    </label>
                    <Input
                      value={profile?.address || ''}
                      onChange={(e) =>
                        setProfile(profile ? { ...profile, address: e.target.value } : null)
                      }
                      placeholder="e.g. Norzin Lam, Thimphu"
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                      TPN / GST Registration Number
                    </label>
                    <Input
                      value={profile?.gstNo || ''}
                      onChange={(e) =>
                        setProfile(profile ? { ...profile, gstNo: e.target.value } : null)
                      }
                      placeholder="e.g. GST-100223344"
                    />
                  </div>

                  {/* GST Registered Switch (BR-11, AC-53) */}
                  <div
                    style={{
                      padding: '12px',
                      background: 'var(--surface-hover)',
                      borderRadius: '8px',
                      border: '1px solid var(--border)',
                    }}
                  >
                    <label
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        cursor: 'pointer',
                        fontWeight: 600,
                        fontSize: '13.5px',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={profile?.gstRegistered || false}
                        onChange={(e) =>
                          setProfile(profile ? { ...profile, gstRegistered: e.target.checked } : null)
                        }
                      />
                      <span>GST-Registered Business</span>
                    </label>
                    <div
                      style={{
                        fontSize: '12px',
                        color: 'var(--muted)',
                        marginTop: '4px',
                        lineHeight: '1.4',
                      }}
                    >
                      If unchecked: every sale line is taxed at 0% regardless of product rate, receipts
                      are titled <strong>INVOICE</strong> instead of TAX INVOICE, and GST summaries are
                      hidden on receipts (BR-11, AC-53).
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '6px' }}>
                    <Button type="submit" variant="primary" disabled={savingProfile}>
                      {savingProfile ? 'Saving…' : 'Save Profile'}
                    </Button>
                  </div>
                </form>
              </Card>

              {/* Logo Card */}
              <Card>
                <h2
                  style={{
                    fontSize: '16px',
                    fontWeight: 700,
                    margin: '0 0 16px 0',
                    color: 'var(--ink)',
                  }}
                >
                  Receipt Logo
                </h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <p style={{ fontSize: '13px', color: 'var(--muted)', margin: 0 }}>
                    Upload your store logo for 80mm thermal receipts and printed invoices. Accepted:
                    JPEG, PNG, WebP (max 2 MB). SVG is not supported.
                  </p>

                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '20px',
                      padding: '16px',
                      background: 'var(--surface-hover)',
                      borderRadius: '8px',
                      border: '1px solid var(--border)',
                    }}
                  >
                    <div
                      style={{
                        width: '80px',
                        height: '80px',
                        borderRadius: '8px',
                        border: '1px solid var(--border)',
                        background: 'var(--panel)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        overflow: 'hidden',
                      }}
                    >
                      {profile?.logoUrl ? (
                        <img
                          src={`/uploads${profile.logoUrl}`}
                          alt="Logo"
                          style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                        />
                      ) : (
                        <span style={{ fontSize: '28px', color: 'var(--muted)' }}>🏪</span>
                      )}
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        ref={logoInputRef}
                        style={{ display: 'none' }}
                        onChange={handleLogoUpload}
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={uploadingLogo}
                        onClick={() => logoInputRef.current?.click()}
                      >
                        {uploadingLogo ? 'Processing…' : 'Upload New Logo'}
                      </Button>
                      {profile?.logoUrl && (
                        <Button variant="danger" size="sm" onClick={handleDeleteLogo}>
                          Use Default Logo
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </Card>
            </div>

            {/* Section 2: Tax Rates (BR-10, AC-52) */}
            <Card style={{ overflow: 'hidden', padding: 0 }}>
              <div
                style={{
                  padding: '16px 20px',
                  borderBottom: '1px solid var(--border)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '12px',
                }}
              >
                <div>
                  <h2
                    style={{
                      fontSize: '16px',
                      fontWeight: 700,
                      margin: 0,
                      color: 'var(--ink)',
                    }}
                  >
                    Tax Rates
                  </h2>
                  <p
                    style={{
                      fontSize: '12.5px',
                      color: 'var(--muted)',
                      margin: '4px 0 0 0',
                    }}
                  >
                    Changing or deactivating a rate only affects future sales — every past invoice keeps
                    the rate it was sold at (BR-10).
                  </p>
                </div>

                <Button variant="primary" size="sm" onClick={handleOpenCreateTax}>
                  + Add Tax Rate
                </Button>
              </div>

              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13.5px' }}>
                  <thead>
                    <tr
                      style={{
                        borderBottom: '1px solid var(--border)',
                        color: 'var(--muted)',
                        fontSize: '12px',
                        textTransform: 'uppercase',
                        letterSpacing: '0.04em',
                      }}
                    >
                      <th style={{ padding: '12px 16px', textAlign: 'left' }}>Name</th>
                      <th style={{ padding: '12px 16px', textAlign: 'left' }}>Rate %</th>
                      <th style={{ padding: '12px 16px', textAlign: 'left' }}>Mode</th>
                      <th style={{ padding: '12px 16px', textAlign: 'left' }}>Category</th>
                      <th style={{ padding: '12px 16px', textAlign: 'center' }}>Default</th>
                      <th style={{ padding: '12px 16px', textAlign: 'left' }}>Effective From</th>
                      <th style={{ padding: '12px 16px', textAlign: 'left' }}>Status</th>
                      <th style={{ padding: '12px 16px', textAlign: 'right' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {taxRates.map((tr) => (
                      <tr key={tr.id} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '12px 16px', fontWeight: 600 }}>{tr.name}</td>
                        <td style={{ padding: '12px 16px' }}>{tr.rate}%</td>
                        <td style={{ padding: '12px 16px' }}>{TAX_MODE_LABELS[tr.mode] || tr.mode}</td>
                        <td style={{ padding: '12px 16px' }}>
                          {TAX_CATEGORY_LABELS[tr.category] || tr.category}
                        </td>
                        <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                          {tr.isDefault ? (
                            <Pill variant="neutral">Default ★</Pill>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleSetDefaultTax(tr.id)}
                              style={{
                                background: 'transparent',
                                border: 'none',
                                color: 'var(--muted)',
                                cursor: 'pointer',
                                fontSize: '12px',
                                textDecoration: 'underline',
                              }}
                            >
                              Make default
                            </button>
                          )}
                        </td>
                        <td style={{ padding: '12px 16px', color: 'var(--muted)' }}>
                          {tr.effectiveDate}
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          <Pill variant={tr.active ? 'success' : 'neutral'}>
                            {tr.active ? 'Active' : 'Inactive'}
                          </Pill>
                        </td>
                        <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                          <Button variant="outline" size="sm" onClick={() => handleOpenEditTax(tr)}>
                            Edit
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>

            {/* Section 3: Customer-Type Pricing (BR-34) */}
            <Card>
              <h2
                style={{
                  fontSize: '16px',
                  fontWeight: 700,
                  margin: '0 0 6px 0',
                  color: 'var(--ink)',
                }}
              >
                Customer-Type Automatic Pricing (BR-34)
              </h2>
              <p style={{ fontSize: '13px', color: 'var(--muted)', margin: '0 0 16px 0' }}>
                Set percentage discounts that automatically apply at the POS when a customer of that
                type is selected. Walk-in customers never get automatic discounts.
              </p>

              <form onSubmit={handleSaveDiscounts}>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                    gap: '16px',
                    marginBottom: '20px',
                  }}
                >
                  {discounts.map((disc) => (
                    <div
                      key={disc.customerType}
                      style={{
                        padding: '14px',
                        background: 'var(--surface-hover)',
                        borderRadius: '8px',
                        border: '1px solid var(--border)',
                      }}
                    >
                      <label
                        style={{
                          display: 'block',
                          fontSize: '13px',
                          fontWeight: 600,
                          marginBottom: '6px',
                          color: 'var(--ink)',
                        }}
                      >
                        {CUSTOMER_TYPE_LABELS[disc.customerType as keyof typeof CUSTOMER_TYPE_LABELS] ||
                          disc.customerType}
                      </label>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Input
                          type="number"
                          step="0.5"
                          min="0"
                          max="100"
                          value={disc.discountPct}
                          onChange={(e) => updateDiscountPct(disc.customerType, e.target.value)}
                        />
                        <span style={{ fontWeight: 600, color: 'var(--muted)' }}>%</span>
                      </div>
                    </div>
                  ))}
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <Button type="submit" variant="primary" disabled={savingDiscounts}>
                    {savingDiscounts ? 'Saving…' : 'Save Customer Discounts'}
                  </Button>
                </div>
              </form>
            </Card>

            {/* Modal: Add / Edit Tax Rate */}
            <Modal
              isOpen={isTaxModalOpen}
              onClose={() => setIsTaxModalOpen(false)}
              title={editingTaxRate ? 'Edit Tax Rate' : 'Add Tax Rate'}
            >
              <form onSubmit={handleSaveTaxRate} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                    Tax Rate Name *
                  </label>
                  <Input
                    required
                    value={taxFormData.name}
                    onChange={(e) => setTaxFormData({ ...taxFormData, name: e.target.value })}
                    placeholder="e.g. GST Standard 5%"
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                      Rate (%) * {editingTaxRate && <span style={{ color: 'var(--red)' }}>(Immutable)</span>}
                    </label>
                    <Input
                      required
                      disabled={!!editingTaxRate}
                      type="number"
                      step="0.01"
                      min="0"
                      max="100"
                      value={taxFormData.rate}
                      onChange={(e) => setTaxFormData({ ...taxFormData, rate: e.target.value })}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                      Tax Mode * {editingTaxRate && <span style={{ color: 'var(--red)' }}>(Immutable)</span>}
                    </label>
                    <select
                      disabled={!!editingTaxRate}
                      value={taxFormData.mode}
                      onChange={(e) => setTaxFormData({ ...taxFormData, mode: e.target.value as TaxMode })}
                      style={{
                        width: '100%',
                        height: '38px',
                        borderRadius: '6px',
                        border: '1px solid var(--border)',
                        padding: '0 10px',
                        background: 'var(--panel)',
                        color: 'var(--ink)',
                      }}
                    >
                      {TAX_MODES.map((m) => (
                        <option key={m} value={m}>
                          {TAX_MODE_LABELS[m]}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {editingTaxRate && (
                  <div
                    style={{
                      padding: '10px 14px',
                      background: 'var(--surface-hover)',
                      borderRadius: '6px',
                      fontSize: '12px',
                      color: 'var(--muted)',
                    }}
                  >
                    Note: By Bhutanese GST rules (BR-10, AC-52), tax rate %, mode, and category cannot
                    be altered once created to protect audit integrity. You can update name, effective
                    date, and active status, or create a new rate.
                  </div>
                )}

                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                    Category * {editingTaxRate && <span style={{ color: 'var(--red)' }}>(Immutable)</span>}
                  </label>
                  <select
                    disabled={!!editingTaxRate}
                    value={taxFormData.category}
                    onChange={(e) =>
                      setTaxFormData({ ...taxFormData, category: e.target.value as TaxCategory })
                    }
                    style={{
                      width: '100%',
                      height: '38px',
                      borderRadius: '6px',
                      border: '1px solid var(--border)',
                      padding: '0 10px',
                      background: 'var(--panel)',
                      color: 'var(--ink)',
                    }}
                  >
                    {TAX_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {TAX_CATEGORY_LABELS[c]}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                    Effective Date
                  </label>
                  <Input
                    type="date"
                    value={taxFormData.effectiveDate}
                    onChange={(e) => setTaxFormData({ ...taxFormData, effectiveDate: e.target.value })}
                  />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={taxFormData.isDefault}
                      onChange={(e) => setTaxFormData({ ...taxFormData, isDefault: e.target.checked })}
                    />
                    <span style={{ fontSize: '13.5px', fontWeight: 600 }}>Default tax rate for new items</span>
                  </label>

                  {editingTaxRate && (
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={taxFormData.active}
                        onChange={(e) => setTaxFormData({ ...taxFormData, active: e.target.checked })}
                      />
                      <span style={{ fontSize: '13.5px', fontWeight: 600 }}>Active (selectable)</span>
                    </label>
                  )}
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '12px' }}>
                  <Button type="button" variant="outline" onClick={() => setIsTaxModalOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" variant="primary" disabled={savingTax}>
                    {savingTax ? 'Saving…' : 'Save Tax Rate'}
                  </Button>
                </div>
              </form>
            </Modal>
          </>
        )}
      </div>
    </AppShell>
  );
};
