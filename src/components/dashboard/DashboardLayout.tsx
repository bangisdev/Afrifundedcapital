import { useEffect, useRef, useState } from "react";
import { useNavigate, Outlet, useLocation } from "react-router";
import { useAuth } from "@/hooks/use-auth";
import { Sidebar } from "./Sidebar";
import { ThemeToggle } from "@/components/ThemeToggle";
import { NotificationBell } from "@/components/NotificationBell";
import { MailWarning } from "lucide-react";

function EmailVerificationBanner({ email, onVerified }: { email?: string | null; onVerified: () => void }) {
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState<"idle" | "sent" | "error">("idle");

  const resend = async () => {
    if (!email || sending) return;
    setSending(true);
    setStatus("idle");
    try {
      const res = await fetch("/api/auth/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email }),
      });
      setStatus(res.ok ? "sent" : "error");
    } catch {
      setStatus("error");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex items-center justify-between gap-4 px-6 py-2.5 text-xs bg-amber-500/10 border-b border-amber-500/30 text-amber-800 dark:text-amber-300">
      <div className="flex items-center gap-2 min-w-0">
        <MailWarning className="h-4 w-4 shrink-0" />
        <span className="truncate">
          Please verify your email{email ? ` (${email})` : ""} to unlock full account access.
        </span>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        {status === "sent" && <span className="text-green-600 dark:text-green-400">Verification email sent</span>}
        {status === "error" && <span className="text-red-600 dark:text-red-400">Couldn't send — try again</span>}
        <button onClick={resend} disabled={sending} className="underline hover:no-underline disabled:opacity-50">
          {sending ? "Sending…" : "Resend email"}
        </button>
        <button onClick={onVerified} className="underline hover:no-underline">
          I&apos;ve verified
        </button>
      </div>
    </div>
  );
}

export function DashboardLayout({ isAdmin = false, children }: { isAdmin?: boolean; children?: React.ReactNode }) {
  const { isLoading, isAuthenticated, user, refetch } = useAuth();
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
        {/* Email verification banner */}
        {user && user.emailVerified === false && <EmailVerificationBanner email={user.email} onVerified={refetch} />}
        {/* Main content */}
        <main className="flex-1 overflow-auto">
          {children || <Outlet />}
        </main>
      </div>
    </div>
  );
}
