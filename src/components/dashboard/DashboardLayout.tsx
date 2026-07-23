import { useEffect, useState } from "react";
import { useNavigate, Outlet, useLocation } from "react-router";
import { useAuth } from "@/hooks/use-auth";
import { Sidebar } from "./Sidebar";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";
import { Bell, ChevronRight } from "lucide-react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

export function DashboardLayout({ isAdmin = false, children }: { isAdmin?: boolean; children?: React.ReactNode }) {
  const { isLoading, isAuthenticated, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const unreadCount = useQuery(api.notifications.getUnreadCount, {});

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      navigate("/auth");
    }
  }, [isLoading, isAuthenticated, navigate]);

  // Redirect from base /dashboard to /dashboard/ (overview)
  useEffect(() => {
    if (location.pathname === "/dashboard" && !isAdmin) {
      navigate("/dashboard", { replace: true });
    }
    if (location.pathname === "/admin" && isAdmin) {
      navigate("/admin", { replace: true });
    }
  }, [location.pathname, isAdmin, navigate]);

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
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 relative"
              onClick={() => navigate(isAdmin ? "/admin" : "/dashboard")}
            >
              <Bell className="h-4 w-4" />
              {unreadCount && unreadCount > 0 ? (
                <span className="absolute -top-0.5 -right-0.5 h-3.5 w-3.5 rounded-full bg-foreground text-[8px] font-medium text-background flex items-center justify-center">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              ) : null}
            </Button>
            <ThemeToggle />
            <div className="text-xs text-muted-foreground">
              {user?.name || user?.email || "Trader"}
            </div>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto p-6">
          {children || <Outlet />}
        </main>
      </div>
    </div>
  );
}
