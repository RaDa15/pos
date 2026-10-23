import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.js';
import { AuthLayout } from '../components/layout/AuthLayout.js';
import { Button } from '../components/ui/Button.js';
import { Card } from '../components/ui/Card.js';

export function LandingScreen() {
  const { deviceBusiness, employee, isAuthenticated, logout } = useAuth();
  const navigate = useNavigate();

  const getRoleHome = (role: string): string => {
    if (role === 'cashier' || role === 'waiter') return '/app/pos';
    if (role === 'kitchen_staff') return '/app/kitchen';
    return '/app';
  };

  return (
    <AuthLayout
      title="POS SYSTEM"
      subtitle="Bhutanese Multi-Tenant POS & GST SaaS"
      footer={
        <div style={{ display: 'flex', justifyContent: 'center', gap: '16px' }}>
          <Link
            to="/platform/login"
            style={{ color: 'var(--muted)', textDecoration: 'underline' }}
          >
            Platform Admin Login
          </Link>
          <span style={{ color: 'var(--line)' }}>•</span>
          <Link
            to="/dev/components"
            style={{ color: 'var(--muted)', textDecoration: 'underline' }}
          >
            Design System Components
          </Link>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {isAuthenticated && employee ? (
          <Card style={{ backgroundColor: 'var(--teal-wash)', borderColor: 'var(--teal-tint)' }}>
            <div style={{ fontSize: '13px', color: 'var(--teal-dark)', fontWeight: 600 }}>
              Currently Signed In
            </div>
            <div style={{ fontSize: '15px', fontWeight: 700, margin: '4px 0 12px 0', color: 'var(--ink)' }}>
              {employee.name} ({employee.role.replace('_', ' ')})
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <Button
                variant="primary"
                onClick={() => navigate(getRoleHome(employee.role))}
                style={{ flex: 1 }}
              >
                Go to Workspace →
              </Button>
              <Button variant="outline" onClick={logout}>
                Sign out
              </Button>
            </div>
          </Card>
        ) : deviceBusiness ? (
          <Card style={{ backgroundColor: 'var(--paper)', borderColor: 'var(--line)' }}>
            <div style={{ fontSize: '12px', color: 'var(--muted)', fontWeight: 600 }}>
              Remembered Business Device
            </div>
            <div style={{ fontSize: '15px', fontWeight: 700, margin: '4px 0 12px 0', color: 'var(--ink)' }}>
              {deviceBusiness.name}{' '}
              <span style={{ fontSize: '12px', fontWeight: 500, color: 'var(--muted)' }}>
                ({deviceBusiness.businessCode})
              </span>
            </div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <Button
                variant="primary"
                onClick={() => navigate('/login/employee')}
                style={{ flex: 1 }}
              >
                Employee Sign-in →
              </Button>
              <Button variant="outline" onClick={() => navigate('/login')}>
                Different Company
              </Button>
            </div>
          </Card>
        ) : null}

        <Button
          variant="primary"
          size="lg"
          onClick={() => navigate('/register')}
          style={{ width: '100%', justifyContent: 'center' }}
        >
          Register a New Business
        </Button>

        <Button
          variant="default"
          size="lg"
          onClick={() => navigate('/login')}
          style={{ width: '100%', justifyContent: 'center' }}
        >
          Company Sign-in
        </Button>
      </div>
    </AuthLayout>
  );
}
