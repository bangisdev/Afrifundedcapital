import { lazy, Suspense } from "react";
import { Route, Routes } from "react-router";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { Loader2 } from "lucide-react";

// ─── Lazy-loaded page components ───
const Overview = lazy(() => import("./Overview"));
const Challenges = lazy(() => import("./Challenges"));
const ChallengeDetail = lazy(() => import("./ChallengeDetail"));
const Trading = lazy(() => import("./Trading"));
const Wallet = lazy(() => import("./Wallet"));
const Affiliate = lazy(() => import("./Affiliate"));
const Certificates = lazy(() => import("./Certificates"));
const Support = lazy(() => import("./Support"));
const Profile = lazy(() => import("./Profile"));
const Notifications = lazy(() => import("./Notifications"));
const NotificationPreferences = lazy(() => import("./NotificationPreferences"));
const Payouts = lazy(() => import("./Payouts"));
const Onboarding = lazy(() => import("./Onboarding"));
const Leaderboard = lazy(() => import("./Leaderboard"));
const Journal = lazy(() => import("./Journal"));
const NotFound = lazy(() => import("./NotFound"));

function PageLoader() {
  return (
    <div className="flex h-[60vh] items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  );
}

export default function Dashboard() {
  return (
    <DashboardLayout>
      <ErrorBoundary fallbackTitle="Page error" fallbackDescription="This page encountered an error. Try navigating to a different section or return to the overview.">
        <Suspense fallback={<PageLoader />}>
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
        </Suspense>
      </ErrorBoundary>
    </DashboardLayout>
  );
}
