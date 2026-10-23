import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.js';
import { APP_NAME } from '@pos/shared';

export function LandingScreen() {
  const { deviceBusiness, employee, isAuthenticated, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <div style={{ maxWidth: '600px', margin: '4rem auto', padding: '2rem', fontFamily: 'system-ui, sans-serif' }}>
      <header style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
        <h1 style={{ fontSize: '2.5rem', marginBottom: '0.5rem', color: '#1a1a1a' }}>{APP_NAME}</h1>
        <p style={{ color: '#666', fontSize: '1.1rem' }}>
          Multi-tenant POS and GST SaaS for Bhutanese businesses
        </p>
      </header>

      {isAuthenticated && employee ? (
        <div style={{ padding: '1.5rem', background: '#e8f5e9', borderRadius: '8px', marginBottom: '2rem' }}>
          <p style={{ margin: '0 0 1rem 0' }}>
            Signed in as <strong>{employee.name}</strong> ({employee.role})
          </p>
          <div style={{ display: 'flex', gap: '1rem' }}>
            <button
              onClick={() => navigate('/app')}
              style={{ padding: '0.75rem 1.5rem', background: '#2e7d32', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}
            >
              Go to App Dashboard →
            </button>
            <button
              onClick={logout}
              style={{ padding: '0.75rem 1.5rem', background: 'transparent', border: '1px solid #ccc', borderRadius: '6px', cursor: 'pointer' }}
            >
              Sign out
            </button>
          </div>
        </div>
      ) : deviceBusiness ? (
        <div style={{ padding: '1.5rem', background: '#f0f4f8', borderRadius: '8px', marginBottom: '2rem', border: '1px solid #d0d7de' }}>
          <h3 style={{ margin: '0 0 0.5rem 0', color: '#0969da' }}>Remembered Device</h3>
          <p style={{ margin: '0 0 1rem 0' }}>
            Business: <strong>{deviceBusiness.name}</strong> ({deviceBusiness.businessCode})
          </p>
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
            <button
              onClick={() => navigate('/login/employee')}
              style={{ padding: '0.75rem 1.5rem', background: '#0969da', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}
            >
              Continue to Employee Sign-in →
            </button>
            <button
              onClick={() => navigate('/login')}
              style={{ padding: '0.75rem 1.5rem', background: 'white', border: '1px solid #ccc', borderRadius: '6px', cursor: 'pointer' }}
            >
              Different Company
            </button>
          </div>
        </div>
      ) : null}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <Link
          to="/register"
          style={{
            display: 'block',
            padding: '1.25rem',
            background: '#0969da',
            color: 'white',
            textDecoration: 'none',
            borderRadius: '8px',
            textAlign: 'center',
            fontWeight: 600,
            fontSize: '1.1rem',
          }}
        >
          Register a New Business
        </Link>

        <Link
          to="/login"
          style={{
            display: 'block',
            padding: '1.25rem',
            background: 'white',
            color: '#1a1a1a',
            textDecoration: 'none',
            borderRadius: '8px',
            textAlign: 'center',
            fontWeight: 600,
            fontSize: '1.1rem',
            border: '2px solid #e1e4e8',
          }}
        >
          Company Sign-in
        </Link>

        <Link
          to="/platform/login"
          style={{
            display: 'block',
            padding: '0.75rem',
            color: '#666',
            textDecoration: 'none',
            textAlign: 'center',
            fontSize: '0.9rem',
          }}
        >
          Platform Admin Sign-in
        </Link>
      </div>

      <footer style={{ marginTop: '3rem', textAlign: 'center', borderTop: '1px solid #eee', paddingTop: '1.5rem', color: '#888', fontSize: '0.85rem' }}>
        <span>English</span> · <span style={{ cursor: 'pointer' }} onClick={() => alert('Dzongkha interface')}>རྫོང་ཁ</span>
      </footer>
    </div>
  );
}
