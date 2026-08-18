import { useEffect, useRef, useState } from "react";
import { useNavigate, Outlet, useLocation } from "react-router";
import { useAuth } from "@/hooks/use-auth";
import { Sidebar } from "./Sidebar";
import { ThemeToggle } from "@/components/ThemeToggle";
import { NotificationBell } from "@/components/NotificationBell";
import { CommandPalette } from "@/components/dashboard/CommandPalette";
import { MailWarning, ChevronRight, Menu } from "lucide-react";
import { cn } from "@/lib/utils";

// Pretty label for the current section shown in the top bar breadcrumb.
const sectionTitles: Record<string, string> = {
  // Admin
  "": "Overview",
  users: "Users",
  challenges: "Challenges",
  payments: "Payments",
  payouts: "Payouts",
  kyc: "KYC",
  affiliates: "Affiliates",
  coupons: "Coupons",
  support: "Support",
  certificates: "Certificates",
  mt5: "MT5",
  notifications: "Notifications",
  reports: "Reports",
  "audit-logs": "Audit Logs",
  settings: "Settings",
  // Client
  trading: "Trading",
  wallet: "Wallet",
  affiliate: "Affiliate",
  profile: "Profile",
  onboarding: "Onboarding",
};

function currentSectionTitle(pathname: string, isAdmin: boolean): string {
  const base = isAdmin ? "/admin" : "/dashboard";
  const rest = pathname.startsWith(base) ? pathname.slice(base.length) : "";
  const seg = rest.split("/").filter(Boolean)[0] || "";
  return sectionTitles[seg] || (isAdmin ? "Admin" : "Dashboard");
}

function initialsOf(name: string | null | undefined): string {
  return (name || "U")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
}

function roleLabel(role: string | null | undefined): string {
  if (!role || role === "user") return "Trader";
  return role.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

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
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Track whether auth has ever resolved to true on THIS component instance.
  const hasSeenAuth = useRef(false);
  const hasCheckedOnboarding = useRef(false);
  useEffect(() => {
    if (isAuthenticated) hasSeenAuth.current = true;
  }, [isAuthenticated]);

  // Close the mobile drawer whenever the route changes — adjusted during
  // render (React's documented "adjust state when a prop changes" pattern)
  // rather than in an effect, so the reset doesn't trigger a cascading pass.
  const [prevPathname, setPrevPathname] = useState(location.pathname);
  if (prevPathname !== location.pathname) {
    setPrevPathname(location.pathname);
    setSidebarOpen(false);
  }

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
      <div className="min-h-screen flex flex-col items-center justify-center gap-3">
        <div className="h-8 w-8 rounded-lg bg-foreground text-background flex items-center justify-center text-xs font-semibold tracking-tight ring-1 ring-ring/40 shadow-sm animate-pulse">
          AFC
        </div>
        <div className="text-xs text-muted-foreground animate-pulse">Loading…</div>
      </div>
    );
  }

  if (!isAuthenticated) return null;

  const sectionTitle = currentSectionTitle(location.pathname, isAdmin);

  return (
    <div className="min-h-screen bg-background flex">
      <Sidebar isAdmin={isAdmin} mobileOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="h-16 border-b border-border flex items-center justify-between gap-3 px-4 sm:px-6 bg-card/70 backdrop-blur supports-[backdrop-filter]:bg-card/70">
          <div className="flex items-center gap-2 text-xs min-w-0">
            {/* Mobile menu toggle */}
            <button
              onClick={() => setSidebarOpen(true)}
              className="md:hidden h-8 w-8 shrink-0 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
              aria-label="Open navigation menu"
            >
              <Menu className="h-4 w-4" />
            </button>
            <button
              onClick={() => navigate(isAdmin ? "/admin" : "/dashboard")}
              className="text-muted-foreground hover:text-foreground shrink-0"
            >
              {isAdmin ? "Admin" : "Dashboard"}
            </button>
            <ChevronRight className="h-3 w-3 text-muted-foreground/50 shrink-0" />
            <span className="font-medium text-foreground truncate">{sectionTitle}</span>
          </div>
          <div className="flex items-center gap-3">
            <CommandPalette isAdmin={isAdmin} />
            <NotificationBell isAdmin={isAdmin} />
            <ThemeToggle />
            <div className="hidden sm:flex items-center gap-2.5 pl-3 border-l border-border">
              <div className="h-7 w-7 rounded-full bg-secondary text-secondary-foreground flex items-center justify-center text-[10px] font-semibold shrink-0">
                {initialsOf(user?.name)}
              </div>
              <div className="leading-tight">
                <div className="text-xs font-medium text-foreground max-w-[140px] truncate">
                  {user?.name || user?.email || "Trader"}
                </div>
                <div className="text-[10px] text-muted-foreground">{roleLabel(user?.role)}</div>
              </div>
            </div>
          </div>
        </header>
        {/* Email verification banner */}
        {user && user.emailVerified === false && <EmailVerificationBanner email={user.email} onVerified={refetch} />}
        {/* Main content */}
        <main className={cn("flex-1 overflow-auto", isAdmin ? "bg-gradient-to-b from-secondary/30 to-transparent" : "")}>
          <div className="h-full px-5 py-6 sm:px-7 sm:py-8">{children || <Outlet />}</div>
        </main>
      </div>
    </div>
  );
}
