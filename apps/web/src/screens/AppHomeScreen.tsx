import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.js';
import { APP_NAME } from '@pos/shared';

export function AppHomeScreen({ viewTitle }: { viewTitle?: string }) {
  const { employee, business, subscription, dashboardLens, logout, setLanguage } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login/employee');
  };

  const handleToggleLang = async () => {
    const nextLang = employee?.language === 'dz' ? 'en' : 'dz';
    await setLanguage(nextLang);
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', fontFamily: 'system-ui, sans-serif' }}>
      {/* Top Bar */}
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '0.75rem 1.5rem',
          background: '#24292f',
          color: 'white',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <strong style={{ fontSize: '1.1rem' }}>{APP_NAME}</strong>
          <span style={{ color: '#8b949e' }}>|</span>
          <span>
            {business?.name} ({business?.type === 'restaurant' ? 'Restaurant' : 'Grocery'} · {business?.businessCode})
          </span>
          <span
            style={{
              fontSize: '0.75rem',
              padding: '2px 8px',
              borderRadius: '12px',
              background: subscription?.effectiveStatus === 'active' || subscription?.effectiveStatus === 'trial' ? '#238636' : '#da3633',
              color: 'white',
              textTransform: 'uppercase',
              fontWeight: 600,
            }}
          >
            {subscription?.effectiveStatus} ({subscription?.daysLeft}d left)
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <button
            onClick={handleToggleLang}
            style={{ background: 'transparent', border: '1px solid #555', color: '#ccc', borderRadius: '4px', padding: '4px 8px', cursor: 'pointer', fontSize: '0.8rem' }}
          >
            {employee?.language === 'dz' ? 'English' : 'རྫོང་ཁ'}
          </button>
          <span style={{ fontSize: '0.9rem' }}>
            {employee?.name} ({employee?.role})
          </span>
          <button
            onClick={handleLogout}
            style={{
              background: '#da3633',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              padding: '4px 10px',
              cursor: 'pointer',
              fontSize: '0.85rem',
            }}
          >
            Sign out
          </button>
        </div>
      </header>

      {/* Main Container */}
      <main style={{ flex: 1, padding: '2rem', maxWidth: '1000px', margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>
        <h1 style={{ margin: '0 0 1rem 0' }}>{viewTitle || 'Dashboard'}</h1>

        {dashboardLens && (
          <div style={{ padding: '0.75rem 1rem', background: '#f6f8fa', borderLeft: '4px solid #0969da', borderRadius: '4px', marginBottom: '1.5rem', color: '#555', fontSize: '0.95rem' }}>
            Showing a {dashboardLens}-focused view of the dashboard.
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
          <div style={{ padding: '1.25rem', background: 'white', border: '1px solid #d0d7de', borderRadius: '8px' }}>
            <h3 style={{ margin: '0 0 0.5rem 0' }}>Employee Profile</h3>
            <p style={{ margin: '0.25rem 0' }}><strong>Name:</strong> {employee?.name}</p>
            <p style={{ margin: '0.25rem 0' }}><strong>Username:</strong> {employee?.username}</p>
            <p style={{ margin: '0.25rem 0' }}><strong>Role:</strong> {employee?.role}</p>
            <p style={{ margin: '0.25rem 0' }}><strong>Language:</strong> {employee?.language === 'dz' ? 'Dzongkha' : 'English'}</p>
          </div>

          <div style={{ padding: '1.25rem', background: 'white', border: '1px solid #d0d7de', borderRadius: '8px' }}>
            <h3 style={{ margin: '0 0 0.5rem 0' }}>Business Details</h3>
            <p style={{ margin: '0.25rem 0' }}><strong>Business Code:</strong> {business?.businessCode}</p>
            <p style={{ margin: '0.25rem 0' }}><strong>Type:</strong> {business?.type}</p>
            <p style={{ margin: '0.25rem 0' }}><strong>GST Registered:</strong> {business?.gstRegistered ? `Yes (${business.gstNo})` : 'No'}</p>
            <p style={{ margin: '0.25rem 0' }}><strong>Plan:</strong> {subscription?.plan}</p>
          </div>
        </div>

        <div style={{ padding: '1.5rem', background: '#f8fafc', border: '1px dashed #cbd5e1', borderRadius: '8px', textAlign: 'center', color: '#64748b' }}>
          <p style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600 }}>Phase 3 Complete: Authentication & Multi-Tenancy Operational</p>
          <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.9rem' }}>
            Navigation, tokens, and comprehensive dashboard lenses are scheduled for Phase 4.
          </p>
        </div>
      </main>
    </div>
  );
}
