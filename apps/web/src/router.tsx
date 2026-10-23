import { createBrowserRouter } from 'react-router-dom';
import { RootLayout } from './components/RootLayout.js';
import { ProtectedRoute } from './components/ProtectedRoute.js';
import { LandingScreen } from './screens/LandingScreen.js';
import { RegisterScreen } from './screens/RegisterScreen.js';
import { PlanSelectScreen } from './screens/PlanSelectScreen.js';
import { CompanyLoginScreen } from './screens/CompanyLoginScreen.js';
import { EmployeeLoginScreen } from './screens/EmployeeLoginScreen.js';
import { ChangePasswordScreen } from './screens/ChangePasswordScreen.js';
import { AppHomeScreen } from './screens/AppHomeScreen.js';

export const router = createBrowserRouter([
  {
    element: <RootLayout />,
    children: [
      {
        path: '/',
        element: <LandingScreen />,
      },
      {
        path: '/register',
        element: <RegisterScreen />,
      },
      {
        path: '/register/plan',
        element: <PlanSelectScreen />,
      },
      {
        path: '/login',
        element: <CompanyLoginScreen />,
      },
      {
        path: '/login/employee',
        element: <EmployeeLoginScreen />,
      },
      {
        path: '/change-password',
        element: (
          <ProtectedRoute>
            <ChangePasswordScreen />
          </ProtectedRoute>
        ),
      },
      {
        path: '/app',
        element: (
          <ProtectedRoute>
            <AppHomeScreen viewTitle="Dashboard" />
          </ProtectedRoute>
        ),
      },
      {
        path: '/app/pos',
        element: (
          <ProtectedRoute>
            <AppHomeScreen viewTitle="Point of Sale" />
          </ProtectedRoute>
        ),
      },
      {
        path: '/app/kitchen',
        element: (
          <ProtectedRoute>
            <AppHomeScreen viewTitle="Kitchen Board" />
          </ProtectedRoute>
        ),
      },
    ],
  },
]);
