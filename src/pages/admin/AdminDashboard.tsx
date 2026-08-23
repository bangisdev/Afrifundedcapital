import { lazy, Suspense } from "react";
import { Route, Routes } from "react-router";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { Loader2 } from "lucide-react";

// ─── Lazy-loaded admin page components ───
const AdminOverview = lazy(() => import("./AdminOverview"));
const AdminUsers = lazy(() => import("./AdminUsers"));
const AdminChallenges = lazy(() => import("./AdminChallenges"));
const AdminPayments = lazy(() => import("./AdminPayments"));
const AdminKyc = lazy(() => import("./AdminKyc"));
const AdminAffiliates = lazy(() => import("./AdminAffiliates"));
const AdminCoupons = lazy(() => import("./AdminCoupons"));
const AdminSupport = lazy(() => import("./AdminSupport"));
const AdminCertificates = lazy(() => import("./AdminCertificates"));
const AdminSettings = lazy(() => import("./AdminSettings"));
const AdminAuditLogs = lazy(() => import("./AdminAuditLogs"));
const AdminMT5 = lazy(() => import("./AdminMT5"));
const AdminNotifications = lazy(() => import("./AdminNotifications"));
const AdminReports = lazy(() => import("./AdminReports"));
const AdminPayouts = lazy(() => import("./AdminPayouts"));
const AdminSystemHealth = lazy(() => import("./AdminSystemHealth"));
const AdminAnnouncements = lazy(() => import("./AdminAnnouncements"));
const AdminEmailTemplates = lazy(() => import("./AdminEmailTemplates"));
const AdminAutomation = lazy(() => import("./AdminAutomation"));
const NotFound = lazy(() => import("../dashboard/NotFound"));

function PageLoader() {
  return (
    <div className="flex h-[60vh] items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  );
}

export default function AdminDashboard() {
  return (
    <DashboardLayout isAdmin>
      <ErrorBoundary fallbackTitle="Admin page error" fallbackDescription="This admin page encountered an error. Try navigating to a different section or return to the overview.">
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route index element={<AdminOverview />} />
            <Route path="users" element={<AdminUsers />} />
            <Route path="challenges" element={<AdminChallenges />} />
            <Route path="payments" element={<AdminPayments />} />
            <Route path="payouts" element={<AdminPayouts />} />
            <Route path="kyc" element={<AdminKyc />} />
            <Route path="affiliates" element={<AdminAffiliates />} />
            <Route path="coupons" element={<AdminCoupons />} />
            <Route path="support" element={<AdminSupport />} />
            <Route path="certificates" element={<AdminCertificates />} />
            <Route path="settings" element={<AdminSettings />} />
            <Route path="mt5" element={<AdminMT5 />} />
            <Route path="audit-logs" element={<AdminAuditLogs />} />
            <Route path="notifications" element={<AdminNotifications />} />
            <Route path="reports" element={<AdminReports />} />
            <Route path="system-health" element={<AdminSystemHealth />} />
            <Route path="announcements" element={<AdminAnnouncements />} />
            <Route path="email-templates" element={<AdminEmailTemplates />} />
            <Route path="automation" element={<AdminAutomation />} />
            <Route path="*" element={<NotFound isAdmin />} />
          </Routes>
        </Suspense>
      </ErrorBoundary>
    </DashboardLayout>
  );
}
