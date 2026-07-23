import { Route, Routes } from "react-router";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import Overview from "./Overview";
import Challenges from "./Challenges";
import Trading from "./Trading";
import Wallet from "./Wallet";
import Affiliate from "./Affiliate";
import Certificates from "./Certificates";
import Support from "./Support";
import Profile from "./Profile";
import Notifications from "./Notifications";
import NotificationPreferences from "./NotificationPreferences";

export default function Dashboard() {
  return (
    <DashboardLayout>
      <Routes>
        <Route index element={<Overview />} />
        <Route path="challenges" element={<Challenges />} />
        <Route path="trading" element={<Trading />} />
        <Route path="wallet" element={<Wallet />} />
        <Route path="affiliate" element={<Affiliate />} />
        <Route path="certificates" element={<Certificates />} />
        <Route path="support" element={<Support />} />
        <Route path="profile" element={<Profile />} />
        <Route path="notifications" element={<Notifications />} />
        <Route path="notifications/preferences" element={<NotificationPreferences />} />
      </Routes>
    </DashboardLayout>
  );
}
