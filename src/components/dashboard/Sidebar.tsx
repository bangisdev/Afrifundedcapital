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

const adminNavItems: NavItem[] = [
  { label: "Dashboard", icon: <LayoutDashboard className="h-4 w-4" />, path: "/admin" },
  { label: "Users", icon: <Users className="h-4 w-4" />, path: "/admin/users" },
  { label: "Challenges", icon: <BarChart3 className="h-4 w-4" />, path: "/admin/challenges" },
  { label: "Payments", icon: <Wallet className="h-4 w-4" />, path: "/admin/payments" },
  { label: "Payouts", icon: <DollarSign className="h-4 w-4" />, path: "/admin/payouts" },
  { label: "KYC", icon: <Shield className="h-4 w-4" />, path: "/admin/kyc" },
  { label: "Affiliates", icon: <Percent className="h-4 w-4" />, path: "/admin/affiliates" },
  { label: "Coupons", icon: <Gift className="h-4 w-4" />, path: "/admin/coupons" },
  { label: "Support", icon: <Ticket className="h-4 w-4" />, path: "/admin/support" },
  { label: "Certificates", icon: <Award className="h-4 w-4" />, path: "/admin/certificates" },
  { label: "MT5", icon: <TrendingUp className="h-4 w-4" />, path: "/admin/mt5" },
  { label: "Notifications", icon: <Bell className="h-4 w-4" />, path: "/admin/notifications" },
  { label: "Reports", icon: <FileText className="h-4 w-4" />, path: "/admin/reports" },
  { label: "Audit Logs", icon: <BarChart3 className="h-4 w-4" />, path: "/admin/audit-logs" },
  { label: "Settings", icon: <Settings className="h-4 w-4" />, path: "/admin/settings" },
];

export function Sidebar({ isAdmin = false }: { isAdmin?: boolean }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { signOut, user } = useAuth();
  const [collapsed, setCollapsed] = useState(false);

  const navGroups = isAdmin ? [{ items: adminNavItems }] : clientNavGroups;

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  return (
    <aside
      className={cn(
        "h-screen border-r border-border bg-card flex flex-col transition-all duration-200",
        collapsed ? "w-14" : "w-56",
      )}
    >
      {/* Logo */}
      <div className={cn("h-14 flex items-center border-b border-border px-4", collapsed && "justify-center")}>
        {!collapsed && (
          <span className="text-sm font-medium tracking-tight">AfriFundedCapital</span>
        )}
        <Button
          variant="ghost"
          size="icon"
          className={cn("h-6 w-6 ml-auto", collapsed && "ml-0")}
          onClick={() => setCollapsed(!collapsed)}
        >
          <ChevronLeft className={cn("h-3 w-3 transition-transform", collapsed && "rotate-180")} />
        </Button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-3 px-2 overflow-y-auto">
        {navGroups.map((group, gi) => (
          <div key={gi} className="mb-1 last:mb-0">
            {group.label && !collapsed && (
              <p className="px-3 pt-3 pb-1 text-[10px] font-medium uppercase tracking-widest text-muted-foreground/50">
                {group.label}
              </p>
            )}
            <div className="space-y-0.5">
              {group.items.map((item) => (
                <button
                  key={item.path}
                  onClick={() => navigate(item.path)}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-2 rounded-md text-xs transition-colors",
                    location.pathname === item.path
                      ? "bg-secondary text-foreground font-medium"
                      : "text-muted-foreground hover:text-foreground hover:bg-secondary/50",
                    collapsed && "justify-center px-2",
                  )}
                >
                  {item.icon}
                  {!collapsed && <span>{item.label}</span>}
                </button>
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* Bottom actions */}
      <div className="border-t border-border p-2 space-y-0.5">
        {/* Admin link only shown if user has admin role */}
        {!isAdmin && user?.role && ["super_admin", "support_admin", "finance_admin", "client_manager", "compliance_admin", "marketing_admin", "affiliate_manager"].includes(user.role) && (
          <button
            onClick={() => navigate("/admin")}
            className={cn(
              "w-full flex items-center gap-3 px-3 py-2 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors",
              collapsed && "justify-center",
            )}
          >
            <Settings className="h-4 w-4" />
            {!collapsed && <span>Admin</span>}
          </button>
        )}
        <button
          onClick={handleSignOut}
          className={cn(
            "w-full flex items-center gap-3 px-3 py-2 rounded-md text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/5 transition-colors",
            collapsed && "justify-center",
          )}
        >
          <LogOut className="h-4 w-4" />
          {!collapsed && <span>Sign Out</span>}
        </button>
      </div>
    </aside>
  );
}
