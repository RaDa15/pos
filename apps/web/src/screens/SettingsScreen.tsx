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
import { useAuth } from '../context/AuthContext.js';
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

  // Auth & Permissions
  const { employee, permissions } = useAuth();
  const canExportImport = permissions.includes('data.export_import') || employee?.role === 'admin';

  // Data management state (SCR-24, F-21, AC-54, AC-55)
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [isConfirmImportModalOpen, setIsConfirmImportModalOpen] = useState(false);
  const [importResult, setImportResult] = useState<{
    counts: Record<string, number>;
    importedUsers: Array<{ username: string; fullName: string; role: string }>;
  } | null>(null);
  const [isResultModalOpen, setIsResultModalOpen] = useState(false);
  const importFileInputRef = useRef<HTMLInputElement | null>(null);

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

  // Handle JSON Export (AC-55)
  const handleExportData = async () => {
    try {
      setExporting(true);
      const res = await fetch('/api/v1/data/export', {
        method: 'GET',
        credentials: 'include',
        headers: {
          Accept: 'application/json',
        },
      });

      if (!res.ok) {
        throw new Error(`Export failed with HTTP ${res.status}`);
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const today = new Date().toISOString().slice(0, 10);
      a.download = `pos-backup-${profile?.businessCode || 'data'}-${today}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);

      toast('JSON backup downloaded successfully. Sensitive credentials excluded (AC-55).', 'success');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to export business data.';
      toast(msg, 'error');
    } finally {
      setExporting(false);
    }
  };

  // Handle File Select for Prototype Import
  const handleSelectImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.endsWith('.json')) {
      toast('Please select a valid JSON backup file.', 'error');
      return;
    }
    setImportFile(file);
    setIsConfirmImportModalOpen(true);
    e.target.value = '';
  };

  // Handle Confirm Import (AC-54)
  const handleExecuteImport = async () => {
    if (!importFile) return;

    try {
      setImporting(true);
      const fileText = await importFile.text();
      let parsedJson: unknown;
      try {
        parsedJson = JSON.parse(fileText);
      } catch {
        throw new Error('File contents is not valid JSON.');
      }

      const res = await apiClient.post<{
        data: {
          counts: Record<string, number>;
          importedUsers: Array<{ username: string; fullName: string; role: string }>;
        };
      }>('/api/v1/data/import-prototype', parsedJson);

      setIsConfirmImportModalOpen(false);
      setImportFile(null);
      setImportResult(res.data);
      setIsResultModalOpen(true);
      toast('Prototype backup imported successfully (AC-54)!', 'success');
      await loadSettings();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to import prototype backup.';
      toast(msg, 'error');
    } finally {
      setImporting(false);
    }
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

            {/* Section 4: Data Management (SCR-24, F-21, AC-54, AC-55) */}
            {canExportImport && (
              <Card>
                <div style={{ marginBottom: '16px' }}>
                  <h2 style={{ fontSize: '16px', fontWeight: 700, margin: '0 0 4px 0', color: 'var(--ink)' }}>
                    Data Management (Export & Migration)
                  </h2>
                  <p style={{ margin: 0, fontSize: '13px', color: 'var(--muted)' }}>
                    Download full operational backups or import legacy records from the prototype system.
                  </p>
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
                    gap: '20px',
                  }}
                >
                  {/* Export Card */}
                  <div
                    style={{
                      border: '1px solid var(--border)',
                      borderRadius: '8px',
                      padding: '16px',
                      background: 'var(--surface-sunken)',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      gap: '12px',
                    }}
                  >
                    <div>
                      <h3 style={{ fontSize: '14.5px', fontWeight: 700, margin: '0 0 6px 0', color: 'var(--ink)' }}>
                        JSON Data Export (AC-55)
                      </h3>
                      <p style={{ margin: '0 0 8px 0', fontSize: '12.5px', color: 'var(--muted)', lineHeight: 1.5 }}>
                        Download a comprehensive JSON backup of all business tables: products, inventory movements,
                        customers, suppliers, purchases, sales, payments, expenses, and audit trail.
                      </p>
                      <div
                        style={{
                          fontSize: '11.5px',
                          padding: '6px 10px',
                          background: 'var(--panel)',
                          border: '1px solid var(--border)',
                          borderRadius: '4px',
                          color: 'var(--ink)',
                        }}
                      >
                        🔒 Security guarantee: Password hashes, active sessions, and TOTP secrets are strictly excluded.
                      </div>
                    </div>

                    <div>
                      <Button
                        type="button"
                        variant="primary"
                        disabled={exporting}
                        onClick={handleExportData}
                        style={{ width: '100%' }}
                      >
                        {exporting ? 'Generating JSON Backup…' : 'Download JSON Export'}
                      </Button>
                    </div>
                  </div>

                  {/* Import Card */}
                  <div
                    style={{
                      border: '1px solid var(--border)',
                      borderRadius: '8px',
                      padding: '16px',
                      background: 'var(--surface-sunken)',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      gap: '12px',
                    }}
                  >
                    <div>
                      <h3 style={{ fontSize: '14.5px', fontWeight: 700, margin: '0 0 6px 0', color: 'var(--ink)' }}>
                        Prototype Backup Import (AC-54)
                      </h3>
                      <p style={{ margin: '0 0 8px 0', fontSize: '12.5px', color: 'var(--muted)', lineHeight: 1.5 }}>
                        Migrate legacy data from your prototype JSON backup into this business. Imports products, customers,
                        suppliers, expenses, sales history, and employee accounts.
                      </p>
                      <div
                        style={{
                          fontSize: '11.5px',
                          padding: '6px 10px',
                          background: 'var(--panel)',
                          border: '1px solid var(--border)',
                          borderRadius: '4px',
                          color: 'var(--ink)',
                        }}
                      >
                        ⚠️ Note: Import is permitted only once into a fresh business before new transactions are registered.
                      </div>
                    </div>

                    <div>
                      <input
                        ref={importFileInputRef}
                        type="file"
                        accept=".json"
                        style={{ display: 'none' }}
                        onChange={handleSelectImportFile}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        disabled={importing}
                        onClick={() => importFileInputRef.current?.click()}
                        style={{ width: '100%' }}
                      >
                        {importing ? 'Processing Import…' : 'Select Backup File (.json)'}
                      </Button>
                    </div>
                  </div>
                </div>
              </Card>
            )}

            {/* Modal: Confirm Prototype Import */}
            {isConfirmImportModalOpen && (
              <Modal
                isOpen={isConfirmImportModalOpen}
                onClose={() => {
                  if (!importing) {
                    setIsConfirmImportModalOpen(false);
                    setImportFile(null);
                  }
                }}
                title="Confirm Prototype Backup Import (AC-54)"
                size="normal"
                hideFooter
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <div
                    style={{
                      padding: '12px',
                      background: 'var(--amber-tint, #fffbeb)',
                      border: '1px solid var(--amber, #f59e0b)',
                      borderRadius: '6px',
                      fontSize: '13px',
                      color: 'var(--ink)',
                      lineHeight: 1.5,
                    }}
                  >
                    <strong>⚠️ Important Migration Warning:</strong>
                    <ul style={{ margin: '8px 0 0 0', paddingLeft: '18px' }}>
                      <li>This operation will insert all records from the selected prototype JSON backup file into your business database.</li>
                      <li>It can only be executed once on a fresh business account. Subsequent imports will be rejected.</li>
                      <li>Legacy employee passwords will <strong>not</strong> be imported; they will be assigned temporary passwords and prompted to change them on first login.</li>
                    </ul>
                  </div>

                  <div style={{ fontSize: '13px' }}>
                    <span style={{ color: 'var(--muted)' }}>Selected file: </span>
                    <strong>{importFile?.name}</strong>{' '}
                    <span style={{ color: 'var(--muted)' }}>
                      ({Math.round((importFile?.size || 0) / 1024)} KB)
                    </span>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={importing}
                      onClick={() => {
                        setIsConfirmImportModalOpen(false);
                        setImportFile(null);
                      }}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      variant="primary"
                      disabled={importing}
                      onClick={handleExecuteImport}
                    >
                      {importing ? 'Importing Data…' : 'Confirm & Import Backup'}
                    </Button>
                  </div>
                </div>
              </Modal>
            )}

            {/* Modal: Prototype Import Results */}
            {isResultModalOpen && importResult && (
              <Modal
                isOpen={isResultModalOpen}
                onClose={() => setIsResultModalOpen(false)}
                title="Prototype Import Successful (AC-54)"
                size="wide"
                hideFooter
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div
                    style={{
                      padding: '12px',
                      background: 'var(--green-tint)',
                      color: 'var(--green)',
                      borderRadius: '6px',
                      fontWeight: 600,
                      fontSize: '13.5px',
                    }}
                  >
                    ✓ Prototype backup successfully imported into this business!
                  </div>

                  <div>
                    <h3 style={{ fontSize: '14px', fontWeight: 700, margin: '0 0 8px 0' }}>Imported Entity Counts</h3>
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                        gap: '10px',
                      }}
                    >
                      {Object.entries(importResult.counts).map(([entity, count]) => (
                        <div
                          key={entity}
                          style={{
                            padding: '10px',
                            background: 'var(--surface-sunken)',
                            borderRadius: '6px',
                            border: '1px solid var(--border)',
                          }}
                        >
                          <span style={{ fontSize: '12px', color: 'var(--muted)', display: 'block', textTransform: 'capitalize' }}>
                            {entity}
                          </span>
                          <strong style={{ fontSize: '16px' }}>{count}</strong>
                        </div>
                      ))}
                    </div>
                  </div>

                  {importResult.importedUsers.length > 0 && (
                    <div>
                      <h3 style={{ fontSize: '14px', fontWeight: 700, margin: '8px 0 8px 0' }}>
                        Imported Employee Accounts ({importResult.importedUsers.length})
                      </h3>
                      <p style={{ margin: '0 0 8px 0', fontSize: '12px', color: 'var(--muted)' }}>
                        All imported employees have been flagged to change their password on first login.
                      </p>
                      <div style={{ maxHeight: '180px', overflowY: 'auto', border: '1px solid var(--border)', borderRadius: '6px' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
                          <thead>
                            <tr style={{ background: 'var(--surface-sunken)', borderBottom: '1px solid var(--border)' }}>
                              <th style={{ padding: '6px 10px', textAlign: 'left' }}>Username</th>
                              <th style={{ padding: '6px 10px', textAlign: 'left' }}>Name</th>
                              <th style={{ padding: '6px 10px', textAlign: 'left' }}>Role</th>
                            </tr>
                          </thead>
                          <tbody>
                            {importResult.importedUsers.map((u, i) => (
                              <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                                <td style={{ padding: '6px 10px', fontWeight: 600, fontFamily: 'monospace' }}>
                                  {u.username}
                                </td>
                                <td style={{ padding: '6px 10px' }}>{u.fullName}</td>
                                <td style={{ padding: '6px 10px' }}>
                                  <Pill variant="neutral">{u.role}</Pill>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '10px' }}>
                    <Button variant="primary" onClick={() => setIsResultModalOpen(false)}>
                      Done
                    </Button>
                  </div>
                </div>
              </Modal>
            )}

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
