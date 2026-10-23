import React, { useState, useEffect } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext.js';
import { useToast } from '../ui/Toast.js';
import { SubscriptionBadge } from '../ui/SubscriptionBadge.js';
import { LanguageToggle } from '../ui/LanguageToggle.js';
import { OfflineBar } from '../ui/OfflineBar.js';
import { Button } from '../ui/Button.js';
import { Card } from '../ui/Card.js';
import {
  ROLE_PERMISSIONS,
  PermissionKey,
} from '@pos/shared';
import { EmployeeRole } from '@pos/shared';

export interface AppShellProps {
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
}

interface NavItemDef {
  path: string;
  labelKey: string;
  defaultLabel: string;
  permission?: PermissionKey;
  planFeature?: string;
  businessType?: 'grocery' | 'restaurant';
  badgeCount?: number;
}

interface NavSectionDef {
  labelKey?: string;
  defaultLabel?: string;
  items: NavItemDef[];
}

export const AppShell: React.FC<AppShellProps> = ({
  title,
  subtitle,
  children,
}) => {
  const { t } = useTranslation();
  const { employee, business, subscription, logout } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);

  // Close mobile drawer on route change
  useEffect(() => {
    setMobileDrawerOpen(false);
  }, [location.pathname]);

  // Handle escape key to close mobile drawer
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && mobileDrawerOpen) {
        setMobileDrawerOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mobileDrawerOpen]);

  const role = (employee?.role as EmployeeRole) || 'cashier';
  const rolePermissions = ROLE_PERMISSIONS[role] || [];
  const bizType = business?.type || 'grocery';
  const effectiveStatus = (subscription?.effectiveStatus || 'trial').toLowerCase();
  const isSubscriptionActive = effectiveStatus === 'active' || effectiveStatus === 'trial';

  // Navigation sections based on 08-APP-FLOW.md §1
  const navSections: NavSectionDef[] = [
    {
      items: [
        {
          path: '/app',
          labelKey: 'nav.dashboard',
          defaultLabel: 'Dashboard',
          permission: 'dashboard.view',
        },
        {
          path: '/app/pos',
          labelKey: 'nav.pos',
          defaultLabel: 'Point of Sale',
          permission: 'pos.sell',
        },
        {
          path: '/app/kitchen',
          labelKey: 'nav.kitchen',
          defaultLabel: 'Kitchen Board',
          permission: 'kitchen.view',
          businessType: 'restaurant',
        },
      ],
    },
    {
      labelKey: 'nav.catalogue_inventory',
      defaultLabel: 'Catalogue & Stock',
      items: [
        {
          path: '/app/products',
          labelKey: bizType === 'restaurant' ? 'nav.menu' : 'nav.products',
          defaultLabel: bizType === 'restaurant' ? 'Menu' : 'Products',
          permission: 'products.view',
        },
        {
          path: '/app/inventory',
          labelKey: 'nav.inventory',
          defaultLabel: 'Inventory',
          permission: 'inventory.view',
        },
        {
          path: '/app/purchases',
          labelKey: 'nav.purchases',
          defaultLabel: 'Purchases',
          permission: 'purchases.manage',
          businessType: 'grocery',
        },
        {
          path: '/app/sales',
          labelKey: 'nav.invoices',
          defaultLabel: 'Invoices',
          permission: 'sales.view',
        },
      ],
    },
    {
      labelKey: 'nav.relations',
      defaultLabel: 'Customers & Suppliers',
      items: [
        {
          path: '/app/customers',
          labelKey: 'nav.customers',
          defaultLabel: 'Customers',
          permission: 'customers.view',
          planFeature: 'customers',
        },
        {
          path: '/app/suppliers',
          labelKey: 'nav.suppliers',
          defaultLabel: 'Suppliers',
          permission: 'suppliers.view',
          planFeature: 'suppliers',
        },
        {
          path: '/app/expenses',
          labelKey: 'nav.expenses',
          defaultLabel: 'Expenses',
          permission: 'expenses.view',
        },
      ],
    },
    {
      labelKey: 'nav.reports',
      defaultLabel: 'Reports',
      items: [
        {
          path: '/app/reports/sales',
          labelKey: 'nav.sales_report',
          defaultLabel: 'Sales Report',
          permission: 'reports.sales',
          planFeature: 'sales_charts',
        },
        {
          path: '/app/reports/payments',
          labelKey: 'nav.payments_report',
          defaultLabel: 'Payments',
          permission: 'payments.view',
          planFeature: 'payment_reports',
        },
        {
          path: '/app/reports/gst',
          labelKey: 'nav.gst_report',
          defaultLabel: 'GST Report',
          permission: 'reports.gst',
          planFeature: 'gst_reports',
        },
      ],
    },
    {
      labelKey: 'nav.admin',
      defaultLabel: 'Administration',
      items: [
        {
          path: '/app/users',
          labelKey: 'nav.users',
          defaultLabel: 'Employees',
          permission: 'employees.manage',
        },
        {
          path: '/app/audit',
          labelKey: 'nav.audit',
          defaultLabel: 'Audit Log',
          permission: 'audit.view',
        },
        {
          path: '/app/subscription',
          labelKey: 'nav.subscription',
          defaultLabel: 'Subscription',
          permission: 'subscription.manage',
        },
        {
          path: '/app/settings',
          labelKey: 'nav.settings',
          defaultLabel: 'Settings',
          permission: 'settings.manage',
        },
      ],
    },
  ];

  // Helper to filter nav items
  const isItemVisible = (item: NavItemDef) => {
    // 1. Role permission check
    if (item.permission && !rolePermissions.includes(item.permission)) {
      return false;
    }
    // Waiter cannot view sales list / invoices per 08-APP-FLOW.md §1
    if (role === 'waiter' && item.path === '/app/sales') {
      return false;
    }
    // 2. Business type check
    if (item.businessType && item.businessType !== bizType) {
      return false;
    }
    // 3. Plan feature limit check
    if (item.planFeature) {
      const allowedFeatures = (subscription as unknown as { allowedFeatures?: Record<string, boolean> })?.allowedFeatures;
      if (allowedFeatures && allowedFeatures[item.planFeature] === false) {
        return false;
      }
    }
    return true;
  };

  // Determine if current route is blocked by subscription (BR-05)
  // When inactive: only /app (Dashboard), /app/subscription, and /app/settings are usable
  const isCurrentRouteBlockedBySubscription = () => {
    if (isSubscriptionActive) return false;
    const path = location.pathname;
    const allowedWhenInactive = ['/app', '/app/subscription', '/app/settings'];
    return !allowedWhenInactive.includes(path);
  };

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/login/employee');
    } catch {
      toast('Failed to sign out', 'error');
    }
  };

  const renderSidebarContent = () => (
    <>
      {/* Brand & Business info */}
      <div className="brand" style={{ padding: '0 20px 18px', borderBottom: '1px solid rgba(255,255,255,0.1)', marginBottom: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div className="mark" style={{ fontWeight: 800, fontSize: '18px', letterSpacing: '-0.01em', color: '#FFFFFF' }}>
            {business?.name || 'POS SYSTEM'}
          </div>
          {mobileDrawerOpen && (
            <button
              type="button"
              aria-label="Close menu"
              onClick={() => setMobileDrawerOpen(false)}
              style={{
                color: 'var(--nav-text)',
                fontSize: '20px',
                padding: '4px',
                background: 'none',
                border: 'none',
              }}
            >
              ✕
            </button>
          )}
        </div>
        <div className="sub" style={{ fontSize: '11px', color: 'var(--nav-sub)', marginTop: '2px', textTransform: 'capitalize' }}>
          {bizType} · {business?.businessCode || ''}
        </div>
      </div>

      {/* Navigation items */}
      <nav aria-label="Main Navigation" style={{ flex: 1, overflowY: 'auto' }}>
        {navSections.map((sec, secIdx) => {
          const visibleItems = sec.items.filter(isItemVisible);
          if (visibleItems.length === 0) return null;

          return (
            <div key={`sec-${secIdx}`} style={{ marginBottom: '8px' }}>
              {sec.defaultLabel && (
                <div
                  className="nav-section-label"
                  style={{
                    fontSize: '10.5px',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    color: 'var(--nav-label)',
                    padding: '14px 20px 6px',
                  }}
                >
                  {sec.labelKey ? t(sec.labelKey, sec.defaultLabel) : sec.defaultLabel}
                </div>
              )}
              {visibleItems.map((item) => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  end={item.path === '/app'}
                  className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                  style={({ isActive }) => ({
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '9px 20px',
                    fontSize: '13.5px',
                    color: isActive ? '#FFFFFF' : 'var(--nav-text)',
                    backgroundColor: isActive ? 'var(--navy-2)' : 'transparent',
                    borderLeft: isActive ? '3px solid var(--teal)' : '3px solid transparent',
                    fontWeight: isActive ? 600 : 400,
                    textDecoration: 'none',
                    transition: 'all 0.15s ease',
                  })}
                >
                  <span>{t(item.labelKey, item.defaultLabel)}</span>
                  {item.badgeCount !== undefined && item.badgeCount > 0 && (
                    <span
                      style={{
                        backgroundColor: 'var(--badge-red)',
                        color: '#FFFFFF',
                        fontSize: '11px',
                        fontWeight: 700,
                        padding: '1px 6px',
                        borderRadius: '9px',
                        minWidth: '18px',
                        textAlign: 'center',
                      }}
                    >
                      {item.badgeCount}
                    </span>
                  )}
                </NavLink>
              ))}
            </div>
          );
        })}
      </nav>

      {/* Sidebar footer */}
      <div
        className="sidebar-foot"
        style={{
          marginTop: 'auto',
          padding: '14px 20px 0',
          borderTop: '1px solid rgba(255,255,255,0.1)',
        }}
      >
        <div className="who" style={{ fontSize: '13px', fontWeight: 600, color: '#FFFFFF' }}>
          {employee?.name || 'Staff User'}
        </div>
        <div className="role" style={{ fontSize: '11.5px', color: 'var(--nav-sub)', textTransform: 'capitalize' }}>
          {role.replace('_', ' ')}
        </div>
        <LanguageToggle variant="sidebar" />
        <button
          type="button"
          onClick={handleLogout}
          className="logout"
          style={{
            marginTop: '10px',
            fontSize: '12.5px',
            color: '#F2B6A3',
            background: 'none',
            border: 'none',
            padding: 0,
            cursor: 'pointer',
            textAlign: 'left',
            display: 'block',
          }}
        >
          {t('common.sign_out', 'Sign out')}
        </button>
      </div>
    </>
  );

  return (
    <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: 'var(--paper)' }}>
      {/* Desktop / Tablet Sidebar */}
      <aside
        className="sidebar"
        style={{
          width: '224px',
          flexShrink: 0,
          backgroundColor: 'var(--navy)',
          color: '#EDEEF3',
          display: 'flex',
          flexDirection: 'column',
          padding: '20px 0',
        }}
      >
        {renderSidebarContent()}
      </aside>

      {/* Mobile Drawer Backdrop and Sidebar */}
      {mobileDrawerOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Navigation Menu"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9990,
            backgroundColor: 'var(--backdrop)',
            display: 'flex',
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setMobileDrawerOpen(false);
          }}
        >
          <div
            style={{
              width: '260px',
              maxWidth: '85vw',
              height: '100%',
              backgroundColor: 'var(--navy)',
              color: '#EDEEF3',
              display: 'flex',
              flexDirection: 'column',
              padding: '20px 0',
              boxShadow: 'var(--shadow-modal)',
              animation: 'fadeInUp 0.2s ease-out',
            }}
          >
            {renderSidebarContent()}
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="main" style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <OfflineBar />

        {/* Topbar */}
        <header
          className="topbar"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '14px 28px',
            borderBottom: '1px solid var(--line)',
            backgroundColor: 'var(--panel)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {/* Mobile Hamburger toggle button */}
            <button
              type="button"
              aria-label="Open menu"
              onClick={() => setMobileDrawerOpen(true)}
              style={{
                display: 'none',
                background: 'none',
                border: 'none',
                padding: '4px',
                fontSize: '20px',
                color: 'var(--ink)',
                cursor: 'pointer',
              }}
              className="mobile-hamburger-btn"
            >
              ☰
            </button>
            <div>
              <h1
                style={{
                  fontSize: '17px',
                  lineHeight: '24px',
                  fontWeight: 700,
                  margin: 0,
                  color: 'var(--ink)',
                }}
              >
                {title || 'POS SYSTEM'}
              </h1>
              {subtitle && (
                <div style={{ fontSize: '12.5px', color: 'var(--muted)', marginTop: '2px' }}>
                  {subtitle}
                </div>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {subscription && (
              <SubscriptionBadge status={subscription.effectiveStatus || subscription.status} />
            )}
          </div>
        </header>

        {/* Page Content or Inactive Subscription Blocker (BR-05) */}
        <main className="content" style={{ padding: '24px 28px 60px', flex: 1 }}>
          {isCurrentRouteBlockedBySubscription() ? (
            <Card style={{ maxWidth: '560px', margin: '40px auto', textAlign: 'center', padding: '32px 24px' }}>
              <div style={{ fontSize: '32px', marginBottom: '12px' }}>🔒</div>
              <h2 style={{ fontSize: '18px', fontWeight: 700, margin: '0 0 8px 0', color: 'var(--red)' }}>
                Subscription Inactive
              </h2>
              <p style={{ fontSize: '13.5px', color: 'var(--muted)', margin: '0 0 20px 0', lineHeight: 1.5 }}>
                This feature is restricted while your subscription is {effectiveStatus}.
              </p>
              {role === 'admin' ? (
                <Button variant="primary" onClick={() => navigate('/app/subscription')}>
                  Renew or Upgrade Subscription
                </Button>
              ) : (
                <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--ink)' }}>
                  Please ask your Admin to renew the business subscription.
                </p>
              )}
            </Card>
          ) : (
            children
          )}
        </main>
      </div>
    </div>
  );
};
