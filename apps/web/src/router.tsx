import { createBrowserRouter } from 'react-router-dom';
import { RootLayout } from './components/RootLayout.js';
import { ProtectedRoute } from './components/ProtectedRoute.js';

// Screens SCR-01 to SCR-06
import { LandingScreen } from './screens/LandingScreen.js';
import { RegisterScreen } from './screens/RegisterScreen.js';
import { PlanSelectScreen } from './screens/PlanSelectScreen.js';
import { CompanyLoginScreen } from './screens/CompanyLoginScreen.js';
import { EmployeeLoginScreen } from './screens/EmployeeLoginScreen.js';
import { ChangePasswordScreen } from './screens/ChangePasswordScreen.js';

// Screen SCR-07 Dashboard
import { DashboardScreen } from './screens/DashboardScreen.js';

// Phase 5 Screens: SCR-11 Products & SCR-24 Settings
import { ProductsScreen } from './screens/ProductsScreen.js';
import { SettingsScreen } from './screens/SettingsScreen.js';

// Phase 6 Screens: SCR-12 Inventory, SCR-18 Customers, SCR-19 Suppliers
import { InventoryScreen } from './screens/InventoryScreen.js';
import { CustomersScreen } from './screens/CustomersScreen.js';
import { SuppliersScreen } from './screens/SuppliersScreen.js';

// Phase 7 Screen: SCR-08 POS
import { PosScreen } from './screens/PosScreen.js';

// Phase 8 Screens: SCR-14 Invoices, SCR-09 Receipt, SCR-15 Payments
import { InvoicesScreen } from './screens/InvoicesScreen.js';
import { ReceiptScreen } from './screens/ReceiptScreen.js';
import { PaymentsScreen } from './screens/PaymentsScreen.js';

// Phase 9 Screen: SCR-10 Kitchen Board
import { KitchenBoardScreen } from './screens/KitchenBoardScreen.js';

// Phase 10 Screens: SCR-16 GST Report, SCR-17 Sales Report, SCR-20 Expenses
import { GstReportScreen } from './screens/GstReportScreen.js';
import { SalesReportScreen } from './screens/SalesReportScreen.js';
import { ExpensesScreen } from './screens/ExpensesScreen.js';

// Screen Placeholders for SCR-08 to SCR-24
import { ScreenPlaceholder } from './screens/ScreenPlaceholder.js';

// Platform Screens SCR-25 to SCR-27
import { PlatformLoginScreen } from './screens/PlatformLoginScreen.js';
import { PlatformBusinessesScreen } from './screens/PlatformBusinessesScreen.js';
import { PlatformPaymentsScreen } from './screens/PlatformPaymentsScreen.js';

// Dev components catalog
import { DevComponentsPage } from './screens/DevComponentsPage.js';

export const router = createBrowserRouter([
  {
    element: <RootLayout />,
    children: [
      // Public & Auth Routes
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

      // App Screens (SCR-07 to SCR-24)
      {
        path: '/app',
        element: (
          <ProtectedRoute>
            <DashboardScreen />
          </ProtectedRoute>
        ),
      },
      {
        path: '/app/pos',
        element: (
          <ProtectedRoute>
            <PosScreen />
          </ProtectedRoute>
        ),
      },
      {
        path: '/app/sales/:id',
        element: (
          <ProtectedRoute>
            <ReceiptScreen />
          </ProtectedRoute>
        ),
      },
      {
        path: '/app/kitchen',
        element: (
          <ProtectedRoute>
            <KitchenBoardScreen />
          </ProtectedRoute>
        ),
      },
      {
        path: '/app/products',
        element: (
          <ProtectedRoute>
            <ProductsScreen />
          </ProtectedRoute>
        ),
      },
      {
        path: '/app/inventory',
        element: (
          <ProtectedRoute>
            <InventoryScreen />
          </ProtectedRoute>
        ),
      },
      {
        path: '/app/purchases',
        element: (
          <ProtectedRoute>
            <ScreenPlaceholder
              screenId="SCR-13"
              title="Supplier Purchases"
              description="Record incoming goods from suppliers, cost price tracking, and batch assignments."
              phaseNumber={6}
            />
          </ProtectedRoute>
        ),
      },
      {
        path: '/app/sales',
        element: (
          <ProtectedRoute>
            <InvoicesScreen />
          </ProtectedRoute>
        ),
      },
      {
        path: '/app/reports/payments',
        element: (
          <ProtectedRoute>
            <PaymentsScreen />
          </ProtectedRoute>
        ),
      },
      {
        path: '/app/payments',
        element: (
          <ProtectedRoute>
            <PaymentsScreen />
          </ProtectedRoute>
        ),
      },
      {
        path: '/app/reports/gst',
        element: (
          <ProtectedRoute>
            <GstReportScreen />
          </ProtectedRoute>
        ),
      },
      {
        path: '/app/reports/sales',
        element: (
          <ProtectedRoute>
            <SalesReportScreen />
          </ProtectedRoute>
        ),
      },
      {
        path: '/app/customers',
        element: (
          <ProtectedRoute>
            <CustomersScreen />
          </ProtectedRoute>
        ),
      },
      {
        path: '/app/suppliers',
        element: (
          <ProtectedRoute>
            <SuppliersScreen />
          </ProtectedRoute>
        ),
      },
      {
        path: '/app/expenses',
        element: (
          <ProtectedRoute>
            <ExpensesScreen />
          </ProtectedRoute>
        ),
      },
      {
        path: '/app/users',
        element: (
          <ProtectedRoute>
            <ScreenPlaceholder
              screenId="SCR-21"
              title="Employees & Permissions"
              description="Manage staff accounts, assign 8 roles (Admin, Cashier, Waiter, Kitchen, etc.), and enforce plan limits."
              phaseNumber={9}
            />
          </ProtectedRoute>
        ),
      },
      {
        path: '/app/audit',
        element: (
          <ProtectedRoute>
            <ScreenPlaceholder
              screenId="SCR-22"
              title="Audit Activity Log"
              description="Immutable audit trail of all financial, catalogue, inventory, and security actions."
              phaseNumber={9}
            />
          </ProtectedRoute>
        ),
      },
      {
        path: '/app/subscription',
        element: (
          <ProtectedRoute>
            <ScreenPlaceholder
              screenId="SCR-23"
              title="Subscription Management"
              description="Plan details, expiration date, upgrade/downgrade, and offline bank transfer payment reference submission."
              phaseNumber={9}
            />
          </ProtectedRoute>
        ),
      },
      {
        path: '/app/settings',
        element: (
          <ProtectedRoute>
            <SettingsScreen />
          </ProtectedRoute>
        ),
      },

      // Platform Screens (SCR-25 to SCR-27)
      {
        path: '/platform/login',
        element: <PlatformLoginScreen />,
      },
      {
        path: '/platform',
        element: <PlatformBusinessesScreen />,
      },
      {
        path: '/platform/payments',
        element: <PlatformPaymentsScreen />,
      },

      // Design System Component Catalog (Dev Only)
      {
        path: '/dev/components',
        element: <DevComponentsPage />,
      },
    ],
  },
]);
