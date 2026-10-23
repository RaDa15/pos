import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api, ApiError } from '../api/client.js';
import { setAppLanguage } from '../i18n/index.js';

export interface EmployeeInfo {
  id: string;
  name: string;
  username: string;
  role: string;
  language: 'en' | 'dz';
  mustChangePassword: boolean;
}

export interface BusinessInfo {
  id: string;
  businessCode: string;
  name: string;
  type: 'grocery' | 'restaurant';
  gstRegistered: boolean;
  gstNo?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  logoUrl?: string | null;
}

export interface SubscriptionInfo {
  plan: 'starter' | 'professional' | 'enterprise';
  status: string;
  effectiveStatus: string;
  expiresAt: string;
  daysLeft: number;
}

export interface DeviceBusinessInfo {
  name: string;
  businessCode: string;
  type?: 'grocery' | 'restaurant';
  logoUrl?: string | null;
}

export interface AuthContextType {
  isAuthenticated: boolean;
  isLoading: boolean;
  employee: EmployeeInfo | null;
  business: BusinessInfo | null;
  subscription: SubscriptionInfo | null;
  permissions: string[];
  dashboardLens: string | null;
  planFeatures: string[];
  deviceBusiness: DeviceBusinessInfo | null;
  error: string | null;
  checkDevice: () => Promise<DeviceBusinessInfo | null>;
  checkMe: () => Promise<boolean>;
  companyLogin: (identifier: string, password: string, rememberDevice: boolean) => Promise<{ business: DeviceBusinessInfo; subscriptionBlocked: boolean }>;
  employeeLogin: (username: string, password: string) => Promise<EmployeeInfo>;
  logout: () => Promise<void>;
  forgetDevice: () => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  setLanguage: (language: 'en' | 'dz') => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isLoading, setIsLoading] = useState(true);
  const [employee, setEmployee] = useState<EmployeeInfo | null>(null);
  const [business, setBusiness] = useState<BusinessInfo | null>(null);
  const [subscription, setSubscription] = useState<SubscriptionInfo | null>(null);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [dashboardLens, setDashboardLens] = useState<string | null>(null);
  const [planFeatures, setPlanFeatures] = useState<string[]>([]);
  const [deviceBusiness, setDeviceBusiness] = useState<DeviceBusinessInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  const checkDevice = useCallback(async (): Promise<DeviceBusinessInfo | null> => {
    try {
      const res = await api.get<{ data: { business: DeviceBusinessInfo | null } }>('/api/v1/auth/device');
      const biz = res.data?.business || null;
      setDeviceBusiness(biz);
      return biz;
    } catch {
      setDeviceBusiness(null);
      return null;
    }
  }, []);

  const checkMe = useCallback(async (): Promise<boolean> => {
    try {
      const res = await api.get<{
        data: {
          employee: EmployeeInfo;
          business: BusinessInfo;
          subscription: SubscriptionInfo;
          permissions: string[];
          dashboardLens: string;
          planFeatures: string[];
        };
      }>('/api/v1/auth/me');

      if (res.data?.employee) {
        setEmployee(res.data.employee);
        setBusiness(res.data.business);
        setSubscription(res.data.subscription);
        setPermissions(res.data.permissions || []);
        setDashboardLens(res.data.dashboardLens || null);
        setPlanFeatures(res.data.planFeatures || []);
        if (res.data.employee.language) {
          setAppLanguage(res.data.employee.language);
        }
        return true;
      }
      return false;
    } catch {
      setEmployee(null);
      setBusiness(null);
      setSubscription(null);
      setPermissions([]);
      setDashboardLens(null);
      setPlanFeatures([]);
      return false;
    }
  }, []);

  useEffect(() => {
    async function initAuth() {
      setIsLoading(true);
      await Promise.allSettled([checkDevice(), checkMe()]);
      setIsLoading(false);
    }
    initAuth();

    const handleSessionExpired = () => {
      setEmployee(null);
      setBusiness(null);
      setSubscription(null);
      setPermissions([]);
      setDashboardLens(null);
      setPlanFeatures([]);
      if (typeof window !== 'undefined' && window.location.pathname.startsWith('/app')) {
        window.location.href = '/login/employee?expired=1';
      }
    };

    window.addEventListener('pos:session-expired', handleSessionExpired);
    return () => window.removeEventListener('pos:session-expired', handleSessionExpired);
  }, [checkDevice, checkMe]);

  const companyLogin = async (
    identifier: string,
    password: string,
    rememberDevice: boolean
  ) => {
    setError(null);
    try {
      const res = await api.post<{
        data: {
          business: DeviceBusinessInfo;
          subscriptionBlocked: boolean;
        };
      }>('/api/v1/auth/company-login', {
        identifier,
        password,
        rememberDevice,
      });

      setDeviceBusiness(res.data.business);
      return res.data;
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Company login failed';
      setError(msg);
      throw err;
    }
  };

  const employeeLogin = async (username: string, password: string) => {
    setError(null);
    try {
      const res = await api.post<{
        data: {
          employee: EmployeeInfo;
          business: BusinessInfo;
          subscription: SubscriptionInfo;
          permissions: string[];
          dashboardLens: string;
          planFeatures: string[];
        };
      }>('/api/v1/auth/employee-login', {
        username,
        password,
      });

      setEmployee(res.data.employee);
      setBusiness(res.data.business);
      setSubscription(res.data.subscription);
      setPermissions(res.data.permissions || []);
      setDashboardLens(res.data.dashboardLens || null);
      setPlanFeatures(res.data.planFeatures || []);
      if (res.data.employee.language) {
        setAppLanguage(res.data.employee.language);
      }

      return res.data.employee;
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Employee login failed';
      setError(msg);
      throw err;
    }
  };

  const logout = async () => {
    try {
      await api.post('/api/v1/auth/logout');
    } catch {
      // Ignore network errors on logout
    } finally {
      setEmployee(null);
      setBusiness(null);
      setSubscription(null);
      setPermissions([]);
      setDashboardLens(null);
      setPlanFeatures([]);
    }
  };

  const forgetDevice = async () => {
    try {
      await api.post('/api/v1/auth/forget-device');
    } catch {
      // Ignore error
    } finally {
      setDeviceBusiness(null);
    }
  };

  const changePassword = async (currentPassword: string, newPassword: string) => {
    await api.post('/api/v1/me/password', {
      currentPassword,
      newPassword,
    });
    if (employee) {
      setEmployee({ ...employee, mustChangePassword: false });
    }
  };

  const setLanguage = async (language: 'en' | 'dz') => {
    await api.patch('/api/v1/me', { language });
    if (employee) {
      setEmployee({ ...employee, language });
    }
    setAppLanguage(language);
  };

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated: !!employee,
        isLoading,
        employee,
        business,
        subscription,
        permissions,
        dashboardLens,
        planFeatures,
        deviceBusiness,
        error,
        checkDevice,
        checkMe,
        companyLogin,
        employeeLogin,
        logout,
        forgetDevice,
        changePassword,
        setLanguage,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
