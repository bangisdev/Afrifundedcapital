import { useEffect, useRef } from "react";
import { useNavigate, Outlet, useLocation } from "react-router";
import { useAuth } from "@/hooks/use-auth";
import { Sidebar } from "./Sidebar";
import { ThemeToggle } from "@/components/ThemeToggle";
import { NotificationBell } from "@/components/NotificationBell";

export function DashboardLayout({ isAdmin = false, children }: { isAdmin?: boolean; children?: React.ReactNode }) {
  const { isLoading, isAuthenticated, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // Track whether auth has ever resolved to true on THIS component instance.
  const hasSeenAuth = useRef(false);
  const hasCheckedOnboarding = useRef(false);
  useEffect(() => {
    if (isAuthenticated) hasSeenAuth.current = true;
  }, [isAuthenticated]);

  useEffect(() => {
    if (location.pathname.startsWith("/auth")) return;
    if (!isLoading && !isAuthenticated && !hasSeenAuth.current) {
      // Preserve the intended destination (including query params) so the
      // sign-in page can return the user exactly where they were headed.
      const returnTo = encodeURIComponent(location.pathname + location.search);
      navigate(`/auth?returnTo=${returnTo}`, { replace: true });
    }
  }, [isLoading, isAuthenticated, navigate, location.pathname, location.search]);

  // Onboarding redirect
  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated) return;
    if (!user) return;
    if (hasCheckedOnboarding.current) return;
    hasCheckedOnboarding.current = true;

    if (location.pathname === "/dashboard/onboarding") return;

    if (!user.onboardingComplete) {
      navigate("/dashboard/onboarding", { replace: true });
    }
  }, [isLoading, isAuthenticated, user, navigate, location.pathname]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground text-sm">Loading…</div>
      </div>
    );
  }

  if (!isAuthenticated) return null;

  return (
    <div className="min-h-screen bg-background flex">
      <Sidebar isAdmin={isAdmin} />
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="h-14 border-b border-border flex items-center justify-between px-6 bg-card">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <button onClick={() => navigate(isAdmin ? "/admin" : "/dashboard")} className="hover:text-foreground">
              {isAdmin ? "Admin" : "Dashboard"}
            </button>
          </div>
          <div className="flex items-center gap-3">
            <NotificationBell isAdmin={isAdmin} />
            <ThemeToggle />
            <div className="text-xs text-muted-foreground">
              {user?.name || user?.email || "Trader"}
            </div>
          </div>
        </header>
        {/* Main content */}
        <main className="flex-1 overflow-auto">
          {children || <Outlet />}
        </main>
      </div>
    </div>
  );
}
