import { Route, Routes } from "react-router";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import Overview from "./Overview";
import Challenges from "./Challenges";
import ChallengeDetail from "./ChallengeDetail";
import Trading from "./Trading";
import Wallet from "./Wallet";
import Affiliate from "./Affiliate";
import Certificates from "./Certificates";
import Support from "./Support";
import Profile from "./Profile";
import Notifications from "./Notifications";
import NotificationPreferences from "./NotificationPreferences";
import Payouts from "./Payouts";
import Onboarding from "./Onboarding";
import Leaderboard from "./Leaderboard";
import Journal from "./Journal";
import NotFound from "./NotFound";

export default function Dashboard() {
  return (
    <DashboardLayout>
      <ErrorBoundary fallbackTitle="Page error" fallbackDescription="This page encountered an error. Try navigating to a different section or return to the overview.">
        <Routes>
          <Route index element={<Overview />} />
          <Route path="challenges" element={<Challenges />} />
          <Route path="challenges/:id" element={<ChallengeDetail />} />
          <Route path="trading" element={<Trading />} />
          <Route path="wallet" element={<Wallet />} />
          <Route path="payouts" element={<Payouts />} />
          <Route path="affiliate" element={<Affiliate />} />
          <Route path="certificates" element={<Certificates />} />
          <Route path="support" element={<Support />} />
          <Route path="profile" element={<Profile />} />
          <Route path="notifications" element={<Notifications />} />
          <Route path="notifications/preferences" element={<NotificationPreferences />} />
          <Route path="onboarding" element={<Onboarding />} />
          <Route path="leaderboard" element={<Leaderboard />} />
          <Route path="journal" element={<Journal />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </ErrorBoundary>
    </DashboardLayout>
  );
}
