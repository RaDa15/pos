import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext.js';
import { AppShell } from '../components/layout/AppShell.js';
import { Card } from '../components/ui/Card.js';
import { Button } from '../components/ui/Button.js';
import { Input } from '../components/ui/Input.js';
import { Modal } from '../components/ui/Modal.js';
import { Pill } from '../components/ui/Pill.js';
import { EmptyState } from '../components/ui/EmptyState.js';
import { useToast } from '../components/ui/Toast.js';
import { apiClient } from '../api/client.js';
import { PRODUCT_UNITS, getDefaultTrackStock, ProductUnit } from '@pos/shared';

interface TaxRate {
  id: string;
  name: string;
  rate: number;
  mode: string;
  category: string;
  active: boolean;
  isDefault: boolean;
}

interface Product {
  id: string;
  name: string;
  category: string;
  barcode: string;
  imagePath: string | null;
  purchasePrice: number;
  sellPrice: number;
  taxRateId: string;
  taxRate: {
    id: string;
    name: string;
    rate: number;
    mode: string;
    category: string;
  };
  unit: string;
  trackStock: boolean;
  stock: number;
  minStock: number;
  supplierId: string | null;
  supplierName: string | null;
  batchNo: string | null;
  expiryDate: string | null;
  active: boolean;
  createdAt: string;
}

export const ProductsScreen: React.FC = () => {
  const { t } = useTranslation();
  const { business, permissions } = useAuth();
  const { toast } = useToast();
  const isRestaurant = business?.type === 'restaurant';
  const itemNoun = isRestaurant ? 'menu item' : 'product';
  const itemNounPlural = isRestaurant ? 'menu items' : 'products';

  const canManage = permissions.includes('products.manage');
  const canImportExport = permissions.includes('products.import_export');

  const [products, setProducts] = useState<Product[]>([]);
  const [taxRates, setTaxRates] = useState<TaxRate[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Modal states
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [importResult, setImportResult] = useState<{
    created: number;
    updated: number;
    skipped: { row: number; error: string }[];
  } | null>(null);
  const [importing, setImporting] = useState(false);

  // Form states
  const [formData, setFormData] = useState({
    name: '',
    category: 'Uncategorized',
    barcode: '',
    purchasePrice: '0',
    sellPrice: '',
    taxRateId: '',
    unit: 'pc' as ProductUnit,
    trackStock: true,
    openingStock: '0',
    minStock: '0',
    active: true,
  });
  const [selectedImageFile, setSelectedImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const importFileRef = useRef<HTMLInputElement | null>(null);

  // Load products and tax rates
  const loadData = async () => {
    try {
      setLoading(true);
      const [prodRes, taxRes, catRes] = await Promise.all([
        apiClient.get<{ data: Product[] }>('/api/v1/products'),
        apiClient.get<{ data: TaxRate[] }>('/api/v1/settings/tax-rates'),
        apiClient.get<{ data: string[] }>('/api/v1/products/categories'),
      ]);
      setProducts(prodRes.data || []);
      setTaxRates(taxRes.data || []);
      setCategories(catRes.data || []);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load catalogue data.';
      setErrorMessage(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Filter products by search term
  const filteredProducts = useMemo(() => {
    if (!search.trim()) return products;
    const term = search.toLowerCase();
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(term) ||
        p.barcode.toLowerCase().includes(term) ||
        p.category.toLowerCase().includes(term)
    );
  }, [products, search]);

  // Group products by category
  const groupedProducts = useMemo(() => {
    const groups = new Map<string, Product[]>();
    for (const p of filteredProducts) {
      const cat = p.category || 'Uncategorized';
      if (!groups.has(cat)) {
        groups.set(cat, []);
      }
      groups.get(cat)!.push(p);
    }
    return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [filteredProducts]);

  // Open modal for Create
  const handleOpenCreate = () => {
    setEditingProduct(null);
    const defaultTax = taxRates.find((t) => t.isDefault) || taxRates[0];
    const initialUnit: ProductUnit = isRestaurant ? 'plate' : 'pc';
    const defaultTrack = getDefaultTrackStock(business?.type || 'grocery', initialUnit);

    setFormData({
      name: '',
      category: categories[0] || 'Uncategorized',
      barcode: '',
      purchasePrice: '0',
      sellPrice: '',
      taxRateId: defaultTax ? defaultTax.id : '',
      unit: initialUnit,
      trackStock: defaultTrack,
      openingStock: '0',
      minStock: '0',
      active: true,
    });
    setSelectedImageFile(null);
    setImagePreview(null);
    setIsEditModalOpen(true);
  };

  // Open modal for Edit
  const handleOpenEdit = (product: Product) => {
    setEditingProduct(product);
    setFormData({
      name: product.name,
      category: product.category,
      barcode: product.barcode,
      purchasePrice: String(product.purchasePrice),
      sellPrice: String(product.sellPrice),
      taxRateId: product.taxRateId,
      unit: product.unit as ProductUnit,
      trackStock: product.trackStock,
      openingStock: String(product.stock),
      minStock: String(product.minStock),
      active: product.active,
    });
    setSelectedImageFile(null);
    setImagePreview(product.imagePath ? `/uploads${product.imagePath}` : null);
    setIsEditModalOpen(true);
  };

  // Handle unit change and update default trackStock if creating
  const handleUnitChange = (newUnit: ProductUnit) => {
    setFormData((prev) => {
      const updated = { ...prev, unit: newUnit };
      if (!editingProduct) {
        updated.trackStock = getDefaultTrackStock(business?.type || 'grocery', newUnit);
      }
      return updated;
    });
  };

  // Image file select
  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (file.size > 2 * 1024 * 1024) {
        setErrorMessage('Image file must be under 2 MB.');
        return;
      }
      setSelectedImageFile(file);
      setImagePreview(URL.createObjectURL(file));
    }
  };

  // Submit product create/edit
  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setErrorMessage(null);

    try {
      let savedProduct: Product;

      if (editingProduct) {
        // Edit product
        const payload = {
          name: formData.name,
          category: formData.category,
          barcode: formData.barcode || undefined,
          purchasePrice: parseFloat(formData.purchasePrice) || 0,
          sellPrice: parseFloat(formData.sellPrice),
          taxRateId: formData.taxRateId,
          unit: formData.unit,
          trackStock: formData.trackStock,
          minStock: parseInt(formData.minStock, 10) || 0,
          active: formData.active,
        };

        const res = await apiClient.patch<{ data: Product }>(
          `/api/v1/products/${editingProduct.id}`,
          payload
        );
        savedProduct = res.data;

        // Upload image if selected
        if (selectedImageFile) {
          const imgFormData = new FormData();
          imgFormData.append('file', selectedImageFile);
          await apiClient.post(`/api/v1/products/${editingProduct.id}/image`, imgFormData);
        }
      } else {
        // Create product
        const payload = {
          name: formData.name,
          category: formData.category,
          barcode: formData.barcode ? formData.barcode.trim() : null,
          purchasePrice: parseFloat(formData.purchasePrice) || 0,
          sellPrice: parseFloat(formData.sellPrice),
          taxRateId: formData.taxRateId,
          unit: formData.unit,
          trackStock: formData.trackStock,
          openingStock: formData.trackStock ? parseInt(formData.openingStock, 10) || 0 : 0,
          minStock: parseInt(formData.minStock, 10) || 0,
        };

        const res = await apiClient.post<{ data: Product }>('/api/v1/products', payload);
        savedProduct = res.data;

        // Upload image if selected
        if (selectedImageFile && savedProduct.id) {
          const imgFormData = new FormData();
          imgFormData.append('file', selectedImageFile);
          await apiClient.post(`/api/v1/products/${savedProduct.id}/image`, imgFormData);
        }
      }

      toast('Product saved.', 'success');
      setIsEditModalOpen(false);
      await loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save product.';
      setErrorMessage(msg);
    } finally {
      setSubmitting(false);
    }
  };

  // Download template
  const handleDownloadTemplate = () => {
    window.location.href = '/api/v1/products/import-template.csv';
  };

  // Export CSV
  const handleExportCsv = () => {
    window.location.href = '/api/v1/products/export.csv';
  };

  // Import CSV
  const handleImportCsv = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!importFileRef.current?.files?.[0]) return;

    setImporting(true);
    setErrorMessage(null);
    setImportResult(null);

    try {
      const file = importFileRef.current.files[0];
      const formData = new FormData();
      formData.append('file', file);

      const res = await apiClient.post<{
        created: number;
        updated: number;
        skipped: { row: number; error: string }[];
      }>('/api/v1/products/import', formData);

      setImportResult(res);
      toast('Products imported.', 'success');
      await loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'CSV Import failed.';
      setErrorMessage(msg);
    } finally {
      setImporting(false);
    }
  };

  return (
    <AppShell
      title={isRestaurant ? t('nav.menu', 'Menu') : t('nav.products', 'Products')}
      subtitle="Manage your catalogue, pricing, barcodes, and tax rates."
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {/* Toolbar */}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '12px',
          }}
        >
          {/* Search bar */}
          <div style={{ minWidth: '280px', maxWidth: '400px', flex: '1' }}>
            <Input
              type="text"
              placeholder="Search by name or barcode…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {canImportExport && (
              <>
                <Button variant="outline" onClick={handleDownloadTemplate}>
                  Template
                </Button>
                <Button variant="outline" onClick={() => setIsImportModalOpen(true)}>
                  Import CSV
                </Button>
                <Button variant="outline" onClick={handleExportCsv}>
                  Export CSV
                </Button>
              </>
            )}
            {canManage && (
              <Button variant="primary" onClick={handleOpenCreate}>
                + Add {itemNoun}
              </Button>
            )}
          </div>
        </div>

        {/* Loading state */}
        {loading && (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--muted)' }}>
            Loading {itemNounPlural}…
          </div>
        )}

        {/* Empty state: when no products match search */}
        {!loading && products.length > 0 && filteredProducts.length === 0 && (
          <EmptyState
            message="No matching items"
            description="No products match your search. Try a different keyword or clear the search."
            action={{ label: 'Clear search', onClick: () => setSearch('') }}
          />
        )}

        {/* Empty state: catalogue completely empty */}
        {!loading && products.length === 0 && (
          <EmptyState
            message={`No ${itemNounPlural} yet`}
            description={`Add your first ${itemNoun} manually or import from a CSV file.`}
            action={
              canManage
                ? { label: `+ Add ${itemNoun}`, onClick: handleOpenCreate }
                : undefined
            }
          />
        )}

        {/* Grouped Products Table */}
        {!loading &&
          groupedProducts.map(([category, items]) => (
            <Card key={category} style={{ overflow: 'hidden', padding: 0 }}>
              <div
                style={{
                  padding: '14px 20px',
                  background: 'var(--surface-hover)',
                  borderBottom: '1px solid var(--border)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <h3
                  style={{
                    margin: 0,
                    fontSize: '15px',
                    fontWeight: 700,
                    color: 'var(--ink)',
                  }}
                >
                  {category}
                </h3>
                <span style={{ fontSize: '12px', color: 'var(--muted)', fontWeight: 600 }}>
                  {items.length} {items.length === 1 ? itemNoun : itemNounPlural}
                </span>
              </div>

              <div style={{ overflowX: 'auto' }}>
                <table
                  style={{
                    width: '100%',
                    borderCollapse: 'collapse',
                    textAlign: 'left',
                    fontSize: '13.5px',
                  }}
                >
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
                      <th style={{ padding: '12px 16px' }}>Item</th>
                      <th style={{ padding: '12px 16px' }}>Barcode</th>
                      <th style={{ padding: '12px 16px' }}>Purchase</th>
                      <th style={{ padding: '12px 16px' }}>Selling</th>
                      <th style={{ padding: '12px 16px' }}>GST Rate</th>
                      <th style={{ padding: '12px 16px' }}>Stock</th>
                      <th style={{ padding: '12px 16px', textAlign: 'right' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((prod) => {
                      const isLowStock = prod.trackStock && prod.stock <= prod.minStock;
                      return (
                        <tr
                          key={prod.id}
                          style={{
                            borderBottom: '1px solid var(--border)',
                            transition: 'background 0.15s ease',
                          }}
                        >
                          {/* Item Avatar + Name */}
                          <td style={{ padding: '12px 16px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                              <div
                                style={{
                                  width: '36px',
                                  height: '36px',
                                  borderRadius: '6px',
                                  background: 'var(--surface-hover)',
                                  border: '1px solid var(--border)',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  fontWeight: 700,
                                  color: 'var(--muted)',
                                  overflow: 'hidden',
                                  flexShrink: 0,
                                }}
                              >
                                {prod.imagePath ? (
                                  <img
                                    src={`/uploads${prod.imagePath}`}
                                    alt={prod.name}
                                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                  />
                                ) : (
                                  prod.name.charAt(0).toUpperCase()
                                )}
                              </div>
                              <div>
                                <div style={{ fontWeight: 600, color: 'var(--ink)' }}>
                                  {prod.name}
                                </div>
                                {!prod.active && (
                                  <Pill variant="neutral" style={{ marginTop: '2px' }}>
                                    Inactive
                                  </Pill>
                                )}
                              </div>
                            </div>
                          </td>

                          {/* Barcode */}
                          <td
                            style={{
                              padding: '12px 16px',
                              fontFamily: 'var(--font-mono, monospace)',
                              fontSize: '12.5px',
                              color: 'var(--muted)',
                            }}
                          >
                            {prod.barcode}
                          </td>

                          {/* Purchase Price */}
                          <td style={{ padding: '12px 16px' }}>
                            Nu. {prod.purchasePrice.toFixed(2)}
                          </td>

                          {/* Selling Price */}
                          <td style={{ padding: '12px 16px', fontWeight: 600 }}>
                            Nu. {prod.sellPrice.toFixed(2)}
                          </td>

                          {/* GST Rate */}
                          <td style={{ padding: '12px 16px' }}>
                            <Pill variant="neutral">{prod.taxRate?.rate ?? 0}%</Pill>
                          </td>

                          {/* Stock Status */}
                          <td style={{ padding: '12px 16px' }}>
                            {!prod.trackStock ? (
                              <span style={{ color: 'var(--muted)' }}>Not tracked</span>
                            ) : (
                              <span
                                style={{
                                  fontWeight: isLowStock ? 700 : 500,
                                  color: isLowStock ? 'var(--red)' : 'var(--ink)',
                                }}
                              >
                                {prod.stock} {prod.unit}
                                {isLowStock && (
                                  <Pill variant="danger" style={{ marginLeft: '6px' }}>
                                    Low
                                  </Pill>
                                )}
                              </span>
                            )}
                          </td>

                          {/* Edit Action */}
                          <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                            {canManage && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleOpenEdit(prod)}
                              >
                                Edit
                              </Button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          ))}

        {/* Modal: Add / Edit Product */}
        <Modal
          isOpen={isEditModalOpen}
          onClose={() => setIsEditModalOpen(false)}
          title={editingProduct ? `Edit ${itemNoun}` : `Add new ${itemNoun}`}
        >
          <form onSubmit={handleSaveProduct} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {errorMessage && (
              <div
                style={{
                  padding: '10px 14px',
                  background: 'var(--red-tint)',
                  color: 'var(--red)',
                  borderRadius: '6px',
                  fontSize: '13px',
                }}
              >
                {errorMessage}
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div style={{ gridColumn: 'span 2' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                  Name *
                </label>
                <Input
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g. Red Label Tea 250g"
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                  Category
                </label>
                <Input
                  list="categories-list"
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  placeholder="e.g. Beverages"
                />
                <datalist id="categories-list">
                  {categories.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                  Barcode
                </label>
                <Input
                  value={formData.barcode}
                  onChange={(e) => setFormData({ ...formData, barcode: e.target.value })}
                  placeholder="Auto-generated if left blank"
                />
                <span style={{ fontSize: '11px', color: 'var(--muted)' }}>
                  Auto-generates 11 digits starting with 20 if blank (BR-08)
                </span>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                  Selling Price (Nu.) *
                </label>
                <Input
                  required
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={formData.sellPrice}
                  onChange={(e) => setFormData({ ...formData, sellPrice: e.target.value })}
                  placeholder="0.00"
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                  Purchase Price (Nu.)
                </label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.purchasePrice}
                  onChange={(e) => setFormData({ ...formData, purchasePrice: e.target.value })}
                  placeholder="0.00"
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                  GST Tax Rate *
                </label>
                <select
                  required
                  value={formData.taxRateId}
                  onChange={(e) => setFormData({ ...formData, taxRateId: e.target.value })}
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
                  {taxRates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.rate}%)
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                  Unit
                </label>
                <select
                  value={formData.unit}
                  onChange={(e) => handleUnitChange(e.target.value as ProductUnit)}
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
                  {PRODUCT_UNITS.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </select>
              </div>

              {/* Stock Tracking Toggle */}
              <div style={{ gridColumn: 'span 2' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={formData.trackStock}
                    onChange={(e) => setFormData({ ...formData, trackStock: e.target.checked })}
                  />
                  <span style={{ fontSize: '13.5px', fontWeight: 600 }}>Track inventory stock levels</span>
                </label>
                <span style={{ display: 'block', fontSize: '11.5px', color: 'var(--muted)', marginTop: '2px' }}>
                  {isRestaurant
                    ? 'Restaurant plates default to untracked; packaged drinks/bottles are tracked (BR-09).'
                    : 'Tracked items update stock on sales and alert on low stock.'}
                </span>
              </div>

              {formData.trackStock && (
                <>
                  {!editingProduct && (
                    <div>
                      <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                        Opening Stock
                      </label>
                      <Input
                        type="number"
                        min="0"
                        value={formData.openingStock}
                        onChange={(e) => setFormData({ ...formData, openingStock: e.target.value })}
                      />
                    </div>
                  )}

                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                      Minimum Alert Stock
                    </label>
                    <Input
                      type="number"
                      min="0"
                      value={formData.minStock}
                      onChange={(e) => setFormData({ ...formData, minStock: e.target.value })}
                    />
                  </div>
                </>
              )}

              {/* Photo Upload */}
              <div style={{ gridColumn: 'span 2' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                  Photo (JPEG, PNG, WebP · Max 2MB)
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                  {imagePreview && (
                    <img
                      src={imagePreview}
                      alt="Preview"
                      style={{
                        width: '54px',
                        height: '54px',
                        objectFit: 'cover',
                        borderRadius: '6px',
                        border: '1px solid var(--border)',
                      }}
                    />
                  )}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    ref={fileInputRef}
                    onChange={handleImageChange}
                  />
                </div>
              </div>

              {/* Active Toggle (Edit only) */}
              {editingProduct && (
                <div style={{ gridColumn: 'span 2' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={formData.active}
                      onChange={(e) => setFormData({ ...formData, active: e.target.checked })}
                    />
                    <span style={{ fontSize: '13.5px', fontWeight: 600 }}>Active (available at POS)</span>
                  </label>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '12px' }}>
              <Button type="button" variant="outline" onClick={() => setIsEditModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" disabled={submitting}>
                {submitting ? 'Saving…' : 'Save ' + itemNoun}
              </Button>
            </div>
          </form>
        </Modal>

        {/* Modal: CSV Import */}
        <Modal
          isOpen={isImportModalOpen}
          onClose={() => {
            setIsImportModalOpen(false);
            setImportResult(null);
          }}
          title="Import Products from CSV"
        >
          <form onSubmit={handleImportCsv} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <p style={{ fontSize: '13px', color: 'var(--muted)', margin: 0 }}>
              Upload your CSV file with product details. Make sure columns match the template. Quoted
              commas in product names are supported.
            </p>

            <input
              type="file"
              accept=".csv,text/csv"
              ref={importFileRef}
              required
              style={{
                padding: '10px',
                border: '1px dashed var(--border)',
                borderRadius: '6px',
                background: 'var(--surface-hover)',
              }}
            />

            {importResult && (
              <div
                style={{
                  padding: '14px',
                  background: 'var(--surface-hover)',
                  borderRadius: '6px',
                  border: '1px solid var(--border)',
                  fontSize: '13px',
                }}
              >
                <div style={{ fontWeight: 700, color: 'var(--ink)', marginBottom: '6px' }}>
                  Import complete — {importResult.created} created, {importResult.updated} updated,{' '}
                  {importResult.skipped.length} skipped.
                </div>
                {importResult.skipped.length > 0 && (
                  <div style={{ marginTop: '8px', color: 'var(--red)', fontSize: '12px' }}>
                    <strong>Errors:</strong>
                    <ul style={{ margin: '4px 0 0 16px', padding: 0 }}>
                      {importResult.skipped.slice(0, 5).map((sk, idx) => (
                        <li key={idx}>
                          Row {sk.row}: {sk.error}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '12px' }}>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setIsImportModalOpen(false);
                  setImportResult(null);
                }}
              >
                Close
              </Button>
              <Button type="submit" variant="primary" disabled={importing}>
                {importing ? 'Importing…' : 'Start Import'}
              </Button>
            </div>
          </form>
        </Modal>
      </div>
    </AppShell>
  );
};
