import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.js';

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, employee, deviceBusiness } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', fontFamily: 'system-ui, sans-serif' }}>
        <p>Loading session...</p>
      </div>
    );
  }

  if (!isAuthenticated || !employee) {
    // If device is remembered, go to employee login, otherwise company login
    return <Navigate to={deviceBusiness ? '/login/employee' : '/login'} state={{ from: location }} replace />;
  }

  if (employee.mustChangePassword && location.pathname !== '/change-password') {
    return <Navigate to="/change-password" replace />;
  }

  return <>{children}</>;
}
