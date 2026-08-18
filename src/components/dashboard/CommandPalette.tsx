import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router";
import { Command } from "cmdk";
import { Search, LayoutDashboard, CreditCard, Trophy, Wallet, Bell, User, Shield, Users, BarChart3, Settings, FileText, LifeBuoy, Gift, Award, Lock } from "lucide-react";

interface CommandPaletteProps {
  isAdmin?: boolean;
}

const clientRoutes = [
  { label: "Overview", path: "/dashboard", icon: LayoutDashboard },
  { label: "Challenges", path: "/dashboard/challenges", icon: Trophy },
  { label: "Wallet", path: "/dashboard/wallet", icon: Wallet },
  { label: "Payouts", path: "/dashboard/payouts", icon: CreditCard },
  { label: "Notifications", path: "/dashboard/notifications", icon: Bell },
  { label: "Profile", path: "/dashboard/profile", icon: User },
  { label: "Security", path: "/dashboard/security", icon: Shield },
  { label: "Affiliate", path: "/dashboard/affiliate", icon: Gift },
  { label: "Certificates", path: "/dashboard/certificates", icon: Award },
  { label: "KYC Verification", path: "/dashboard/kyc", icon: Lock },
  { label: "Support", path: "/dashboard/support", icon: LifeBuoy },
];

const adminRoutes = [
  { label: "Admin Overview", path: "/admin", icon: LayoutDashboard },
  { label: "Users", path: "/admin/users", icon: Users },
  { label: "Challenges", path: "/admin/challenges", icon: Trophy },
  { label: "Payments", path: "/admin/payments", icon: CreditCard },
  { label: "Payouts", path: "/admin/payouts", icon: Wallet },
  { label: "KYC", path: "/admin/kyc", icon: Lock },
  { label: "MT5 Manager", path: "/admin/mt5", icon: Settings },
  { label: "Trading", path: "/admin/trading", icon: BarChart3 },
  { label: "Affiliates", path: "/admin/affiliates", icon: Gift },
  { label: "Certificates", path: "/admin/certificates", icon: Award },
  { label: "Coupons", path: "/admin/coupons", icon: FileText },
  { label: "Notifications", path: "/admin/notifications", icon: Bell },
  { label: "Audit Logs", path: "/admin/audit-logs", icon: Shield },
  { label: "Settings", path: "/admin/settings", icon: Settings },
  { label: "Secrets", path: "/admin/secrets", icon: Lock },
];

export function CommandPalette({ isAdmin = false }: CommandPaletteProps) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const routes = isAdmin ? adminRoutes : clientRoutes;

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
      if (e.key === "Escape") {
        setOpen(false);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  const handleSelect = useCallback(
    (path: string) => {
      setOpen(false);
      navigate(path);
    },
    [navigate]
  );

  return (
    <>
      {/* Trigger button in header */}
      <button
        onClick={() => setOpen(true)}
        className="hidden sm:flex items-center gap-2 h-8 px-3 text-xs text-muted-foreground border border-border rounded-md hover:bg-secondary transition-colors"
        aria-label="Open command palette"
      >
        <Search className="h-3 w-3" />
        <span>Search</span>
        <kbd className="ml-1 text-[10px] font-mono text-muted-foreground/60 bg-muted px-1 py-0.5 rounded">
          ⌘K
        </kbd>
      </button>

      {/* Dialog */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]"
          onClick={() => setOpen(false)}
        >
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" />
          <Command
            className="relative z-50 w-full max-w-lg bg-card border border-border rounded-xl shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center border-b border-border px-4">
              <Search className="h-4 w-4 text-muted-foreground shrink-0" />
              <Command.Input
                placeholder="Type a command or search..."
                className="flex-1 h-12 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                autoFocus
              />
              <kbd className="text-[10px] font-mono text-muted-foreground/60 bg-muted px-1.5 py-0.5 rounded">
                ESC
              </kbd>
            </div>
            <Command.List className="max-h-80 overflow-auto p-2">
              <Command.Empty className="py-6 text-center text-sm text-muted-foreground">
                No results found.
              </Command.Empty>
              <Command.Group heading="Navigation" className="text-xs text-muted-foreground">
                {routes.map((route) => (
                  <Command.Item
                    key={route.path}
                    value={route.label}
                    onSelect={() => handleSelect(route.path)}
                    className="flex items-center gap-3 px-3 py-2 text-sm rounded-md cursor-pointer aria-selected:bg-secondary transition-colors"
                  >
                    <route.icon className="h-4 w-4 text-muted-foreground" />
                    <span>{route.label}</span>
                  </Command.Item>
                ))}
              </Command.Group>
            </Command.List>
          </Command>
        </div>
      )}
    </>
  );
}
