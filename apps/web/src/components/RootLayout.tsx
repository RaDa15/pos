import { Outlet } from 'react-router-dom';
import { AuthProvider } from '../context/AuthContext.js';

export function RootLayout() {
  return (
    <AuthProvider>
      <Outlet />
    </AuthProvider>
  );
}
