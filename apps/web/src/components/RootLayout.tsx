import { Outlet } from 'react-router-dom';
import { AuthProvider } from '../context/AuthContext.js';
import { ToastProvider } from './ui/Toast.js';

export function RootLayout() {
  return (
    <AuthProvider>
      <ToastProvider>
        <Outlet />
      </ToastProvider>
    </AuthProvider>
  );
}
