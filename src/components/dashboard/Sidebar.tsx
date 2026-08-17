import { useNavigate, useLocation } from "react-router";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import {
  LayoutDashboard,
  TrendingUp,
  Wallet,
  Users,
  Award,
  Ticket,
  Bell,
  FileText,
  Settings,
  Shield,
  Gift,
  BarChart3,
  LogOut,
  ChevronLeft,
  UserCircle,
  Percent,
  DollarSign,
  ScrollText,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";

interface NavItem {
  label: string;
  icon: React.ReactNode;
  path: string;
}

interface NavGroup {
  label?: string;
  items: NavItem[];
}

// Client navigation is grouped so the dashboard stays scannable — the
// notifications bell in the top bar covers /dashboard/notifications, so it
// isn't repeated here.
const clientNavGroups: NavGroup[] = [
  {
    items: [
      { label: "Overview", icon: <LayoutDashboard className="h-4 w-4" />, path: "/dashboard" },
      { label: "Challenges", icon: <BarChart3 className="h-4 w-4" />, path: "/dashboard/challenges" },
      { label: "Trading", icon: <TrendingUp className="h-4 w-4" />, path: "/dashboard/trading" },
    ],
  },
  {
    label: "Finance",
    items: [
      { label: "Wallet", icon: <Wallet className="h-4 w-4" />, path: "/dashboard/wallet" },
      { label: "Payouts", icon: <DollarSign className="h-4 w-4" />, path: "/dashboard/payouts" },
    ],
  },
  {
    label: "Account",
    items: [
      { label: "Affiliate", icon: <Users className="h-4 w-4" />, path: "/dashboard/affiliate" },
      { label: "Certificates", icon: <Award className="h-4 w-4" />, path: "/dashboard/certificates" },
      { label: "Support", icon: <Ticket className="h-4 w-4" />, path: "/dashboard/support" },
      { label: "Profile", icon: <UserCircle className="h-4 w-4" />, path: "/dashboard/profile" },
    ],
  },
];

const adminNavGroups: NavGroup[] = [
  {
    label: "Overview",
    items: [{ label: "Dashboard", icon: <LayoutDashboard className="h-4 w-4" />, path: "/admin" }],
  },
  {
    label: "Management",
    items: [
      { label: "Users", icon: <Users className="h-4 w-4" />, path: "/admin/users" },
      { label: "Challenges", icon: <BarChart3 className="h-4 w-4" />, path: "/admin/challenges" },
      { label: "Payments", icon: <Wallet className="h-4 w-4" />, path: "/admin/payments" },
      { label: "Payouts", icon: <DollarSign className="h-4 w-4" />, path: "/admin/payouts" },
      { label: "KYC", icon: <Shield className="h-4 w-4" />, path: "/admin/kyc" },
      { label: "Affiliates", icon: <Percent className="h-4 w-4" />, path: "/admin/affiliates" },
      { label: "Coupons", icon: <Gift className="h-4 w-4" />, path: "/admin/coupons" },
    ],
  },
  {
    label: "Operations",
    items: [
      { label: "Support", icon: <Ticket className="h-4 w-4" />, path: "/admin/support" },
      { label: "Certificates", icon: <Award className="h-4 w-4" />, path: "/admin/certificates" },
      { label: "MT5", icon: <TrendingUp className="h-4 w-4" />, path: "/admin/mt5" },
      { label: "Notifications", icon: <Bell className="h-4 w-4" />, path: "/admin/notifications" },
      { label: "Reports", icon: <FileText className="h-4 w-4" />, path: "/admin/reports" },
    ],
  },
  {
    label: "System",
    items: [
      { label: "Audit Logs", icon: <ScrollText className="h-4 w-4" />, path: "/admin/audit-logs" },
      { label: "Settings", icon: <Settings className="h-4 w-4" />, path: "/admin/settings" },
    ],
  },
];

function isActive(path: string, current: string): boolean {
  if (current === path) return true;
  // Index items (Overview) only match exactly; every other item also matches
  // its nested routes (e.g. /dashboard/challenges/123 → Challenges).
  if (path === "/dashboard" || path === "/admin") return false;
  return current.startsWith(path + "/");
}

export function Sidebar({
  isAdmin = false,
  mobileOpen = false,
  onClose,
}: {
  isAdmin?: boolean;
  mobileOpen?: boolean;
  onClose?: () => void;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const { signOut, user } = useAuth();
  const [collapsed, setCollapsed] = useState(false);

  const navGroups = isAdmin ? adminNavGroups : clientNavGroups;
  const consoleLabel = isAdmin ? "Admin Console" : "Client Portal";

  // On mobile the drawer is always expanded (collapsed state is desktop-only).
  const effCollapsed = collapsed && !mobileOpen;

  const go = (path: string) => {
    navigate(path);
    onClose?.();
  };

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
    onClose?.();
  };

  return (
    <>
      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 md:hidden"
          onClick={onClose}
          aria-hidden
        />
      )}
    <aside
      className={cn(
        "h-screen border-r border-border bg-card flex flex-col transition-all duration-200",
        // Mobile: off-canvas drawer; desktop: static column.
        "fixed inset-y-0 left-0 z-50 md:static md:z-auto",
        mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0",
        effCollapsed ? "w-16" : "w-60",
      )}
    >
      {/* Brand */}
      <div
        className={cn(
          "h-16 flex items-center gap-3 border-b border-border px-4 shrink-0",
          effCollapsed && "justify-center px-0",
        )}
      >
        {!effCollapsed && (
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <div className="h-7 w-7 rounded-lg bg-foreground text-background flex items-center justify-center text-[11px] font-semibold tracking-tight shrink-0 ring-1 ring-ring/40 shadow-sm">
                AFC
              </div>
              <span className="text-sm font-medium tracking-tight truncate">AfriFundedCapital</span>
            </div>
            <p className="text-[10px] text-muted-foreground mt-0.5 pl-9">{consoleLabel}</p>
          </div>
        )}
        {effCollapsed && (
          <div className="h-7 w-7 rounded-lg bg-foreground text-background flex items-center justify-center text-[11px] font-semibold shrink-0 ring-1 ring-ring/40 shadow-sm">
            AFC
          </div>
        )}
        <Button
          variant="ghost"
          size="icon"
          className={cn("h-6 w-6 ml-auto shrink-0 hidden md:inline-flex", effCollapsed && "ml-0")}
          onClick={() => setCollapsed(!collapsed)}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <ChevronLeft className={cn("h-3 w-3 transition-transform", effCollapsed && "rotate-180")} />
        </Button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4 px-2.5 overflow-y-auto overflow-x-hidden">
        {navGroups.map((group, gi) => (
          <div key={gi} className="mb-2 last:mb-0">
            {group.label && !effCollapsed && (
              <p className="px-2.5 pb-1.5 pt-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/60">
                {group.label}
              </p>
            )}
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const active = isActive(item.path, location.pathname);
                return (
                  <button
                    key={item.path}
                    onClick={() => go(item.path)}
                    className={cn(
                      "relative w-full flex items-center gap-3 px-2.5 py-2 rounded-lg text-xs transition-all duration-150",
                      active
                        ? "bg-brand/10 text-foreground font-medium ring-1 ring-brand/15"
                        : "text-muted-foreground hover:text-foreground hover:bg-secondary/60",
                      effCollapsed && "justify-center px-0",
                    )}
                  >
                    {active && (
                      <span className="absolute left-0 top-1/2 -translate-y-1/2 h-4 w-[3px] rounded-full bg-brand" />
                    )}
                    <span className={cn("shrink-0", active ? "text-brand" : "text-muted-foreground/80")}>
                      {item.icon}
                    </span>
                    {!effCollapsed && <span className="truncate">{item.label}</span>}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Bottom actions */}
      <div className="border-t border-border p-2.5 space-y-0.5">
        {/* Admin link only shown if user has admin role */}
        {!isAdmin && user?.role && ["super_admin", "support_admin", "finance_admin", "client_manager", "compliance_admin", "marketing_admin", "affiliate_manager"].includes(user.role) && (
          <button
            onClick={() => go("/admin")}
            className={cn(
              "w-full flex items-center gap-3 px-2.5 py-2 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors",
              effCollapsed && "justify-center px-0",
            )}
          >
            <Settings className="h-4 w-4" />
            {!effCollapsed && <span>Admin</span>}
          </button>
        )}
        <button
          onClick={handleSignOut}
          className={cn(
            "w-full flex items-center gap-3 px-2.5 py-2 rounded-lg text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/5 transition-colors",
            effCollapsed && "justify-center px-0",
          )}
        >
          <LogOut className="h-4 w-4" />
          {!effCollapsed && <span>Sign Out</span>}
        </button>
      </div>
    </aside>
    </>
  );
}
