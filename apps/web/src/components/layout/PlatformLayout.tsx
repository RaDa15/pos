import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { OfflineBar } from '../ui/OfflineBar.js';
import { api } from '../../api/client.js';

export interface PlatformLayoutProps {
  title?: string;
  children: React.ReactNode;
}

export const PlatformLayout: React.FC<PlatformLayoutProps> = ({
  title,
  children,
}) => {
  const navigate = useNavigate();

  const handleLogout = async () => {
    try {
      await api.post('/api/v1/platform/logout');
    } catch {
      // ignore
    } finally {
      navigate('/platform/login');
    }
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--paper)', display: 'flex', flexDirection: 'column' }}>
      <OfflineBar />

      {/* Platform Topbar */}
      <header
        style={{
          backgroundColor: 'var(--navy)',
          color: '#FFFFFF',
          padding: '0 24px',
          height: '56px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '28px' }}>
          <div style={{ fontWeight: 800, fontSize: '16px', letterSpacing: '-0.01em' }}>
            POS SYSTEM <span style={{ fontSize: '11px', color: 'var(--teal)', fontWeight: 700, marginLeft: '6px' }}>PLATFORM ADMIN</span>
          </div>

          <nav style={{ display: 'flex', gap: '8px' }}>
            <NavLink
              to="/platform"
              end
              style={({ isActive }) => ({
                color: isActive ? '#FFFFFF' : 'var(--nav-text)',
                backgroundColor: isActive ? 'var(--navy-2)' : 'transparent',
                padding: '6px 12px',
                borderRadius: 'var(--radius-sm)',
                fontSize: '13px',
                fontWeight: isActive ? 600 : 400,
                textDecoration: 'none',
              })}
            >
              Businesses
            </NavLink>
            <NavLink
              to="/platform/payments"
              style={({ isActive }) => ({
                color: isActive ? '#FFFFFF' : 'var(--nav-text)',
                backgroundColor: isActive ? 'var(--navy-2)' : 'transparent',
                padding: '6px 12px',
                borderRadius: 'var(--radius-sm)',
                fontSize: '13px',
                fontWeight: isActive ? 600 : 400,
                textDecoration: 'none',
              })}
            >
              Payment Queue
            </NavLink>
          </nav>
        </div>

        <button
          type="button"
          onClick={handleLogout}
          style={{
            color: '#F2B6A3',
            fontSize: '12.5px',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
          }}
        >
          Sign out
        </button>
      </header>

      {/* Content */}
      <main
        style={{
          flex: 1,
          maxWidth: '1100px',
          width: '100%',
          margin: '0 auto',
          padding: '28px 24px 60px',
        }}
      >
        {title && (
          <h1
            style={{
              fontSize: '18px',
              fontWeight: 800,
              margin: '0 0 20px 0',
              color: 'var(--ink)',
            }}
          >
            {title}
          </h1>
        )}
        {children}
      </main>
    </div>
  );
};
