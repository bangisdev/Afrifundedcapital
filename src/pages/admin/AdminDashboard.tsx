/* eslint-disable @typescript-eslint/no-explicit-any */
import { Route, Routes } from "react-router";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import AdminOverview from "./AdminOverview";
import AdminUsers from "./AdminUsers";
import AdminChallenges from "./AdminChallenges";
import AdminPayments from "./AdminPayments";
import AdminKyc from "./AdminKyc";
import AdminAffiliates from "./AdminAffiliates";
import AdminCoupons from "./AdminCoupons";
import AdminSupport from "./AdminSupport";
import AdminCertificates from "./AdminCertificates";
import AdminSettings from "./AdminSettings";
import AdminAuditLogs from "./AdminAuditLogs";
import AdminMT5 from "./AdminMT5";
import AdminNotifications from "./AdminNotifications";
import AdminReports from "./AdminReports";
import AdminPayouts from "./AdminPayouts";

export default function AdminDashboard() {
  return (
    <DashboardLayout isAdmin>
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
      </Routes>
    </DashboardLayout>
  );
}
