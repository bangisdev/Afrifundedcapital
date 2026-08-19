/* eslint-disable @typescript-eslint/no-explicit-any */
import { useApiQuery } from "@/hooks/use-api";
import { useNavigate } from "react-router";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { PageLoader } from "@/components/dashboard/PageLoader";
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
  EmptyContent,
  EmptyMedia,
} from "@/components/ui/empty";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowRight,
  ChevronRight,
  Sparkles,
  X,
  BarChart3,
  Award,
  Wallet,
  TrendingUp,
  Bell,
  Clock,
  CreditCard,
  Shield,
  AlertTriangle,
  MessageSquare,
  Plus,
  ArrowUpRight,
  Zap,
} from "lucide-react";
import { cn, formatMoney, formatRelativeTime } from "@/lib/utils";

const SKIP_BANNER_KEY = "_afc_onboarding_banner_dismissed";

function needsOnboarding(user: { name?: string | null; tradingExperience?: string | null; phone?: string | null }): boolean {
  return !user.name || !user.tradingExperience || !user.phone;
}

function statusPillStyle(status: string): string {
  const base = "rounded-full border px-2 py-0.5 text-[10px] capitalize";
  switch (status) {
    case "active":
      return cn(base, "border-emerald-500/25 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400");
    case "funded":
      return cn(base, "border-brand/25 bg-brand/10 text-brand");
    case "violated":
      return cn(base, "border-red-500/25 bg-red-500/10 text-red-600 dark:text-red-400");
    case "phase_1_passed":
    case "phase_2_passed":
      return cn(base, "border-sky-500/25 bg-sky-500/10 text-sky-600 dark:text-sky-400");
    default:
      return cn(base, "border-border bg-secondary text-muted-foreground");
  }
}

function greetingForHour(hour: number): string {
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

const notificationIcons: Record<string, React.ReactNode> = {
  certificate: <Award className="h-3.5 w-3.5 text-yellow-500" />,
  payment: <CreditCard className="h-3.5 w-3.5 text-green-500" />,
  kyc: <Shield className="h-3.5 w-3.5 text-blue-500" />,
  support: <MessageSquare className="h-3.5 w-3.5 text-purple-500" />,
  security: <Shield className="h-3.5 w-3.5 text-red-500" />,
  challenge_violation: <AlertTriangle className="h-3.5 w-3.5 text-red-500" />,
  challenge_expired: <Clock className="h-3.5 w-3.5 text-orange-500" />,
  payout: <CreditCard className="h-3.5 w-3.5 text-emerald-500" />,
  broadcast: <Bell className="h-3.5 w-3.5 text-muted-foreground" />,
};

export default function Overview() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { data: metrics, isLoading: metricsLoading } = useApiQuery<any>(["metrics", "dashboard"], "/api/challenges/metrics");
  const { data: challengesData, isLoading: challengesLoading } = useApiQuery<any>(["challenges", "my"], "/api/challenges/my");
  const challenges = challengesData?.challenges || [];
  const { data: wallet, isLoading: walletLoading } = useApiQuery<any>(["wallet", "my"], "/api/wallets/my");
  const { data: notificationsData } = useApiQuery<any>(["notifications", "my"], "/api/notifications/my");
  const { data: payoutStats } = useApiQuery<any>(["payouts", "stats"], "/api/payouts/my/stats");
  const [bannerDismissed, setBannerDismissed] = useState(
    () => localStorage.getItem(SKIP_BANNER_KEY) === "true",
  );

  const showBanner = user && needsOnboarding(user) && !bannerDismissed;
  const isLoading = metricsLoading || challengesLoading || walletLoading;

  if (isLoading) {
    return <PageLoader />;
  }

  const firstName = user?.name?.split(" ")[0] || "Trader";
  const greeting = `${greetingForHour(new Date().getHours())}${user?.name ? `, ${firstName}` : ""}`;

  const statCards = [
    {
      label: "Active Challenges",
      value: String(metrics?.activeChallenges ?? 0),
      path: "/dashboard/challenges",
      icon: <BarChart3 className="h-4 w-4" />,
      trend: metrics?.activeChallenges > 0 ? "+Active" : undefined,
    },
    {
      label: "Funded Accounts",
      value: String(metrics?.fundedAccounts ?? 0),
      path: "/dashboard/trading",
      icon: <Award className="h-4 w-4" />,
    },
    {
      label: "Wallet Balance",
      value: formatMoney(wallet?.balance, wallet?.currency || "NGN"),
      path: "/dashboard/wallet",
      icon: <Wallet className="h-4 w-4" />,
      subtitle: wallet?.currency || "NGN",
    },
  ];

  const notifications = notificationsData?.notifications || [];
  const recentNotifications = notifications.slice(0, 5);

  const quickActions = [
    {
      label: "New Challenge",
      icon: <Plus className="h-4 w-4" />,
      path: "/dashboard/challenges",
      color: "bg-brand/10 text-brand",
    },
    {
      label: "Deposit",
      icon: <ArrowUpRight className="h-4 w-4" />,
      path: "/dashboard/wallet",
      color: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    },
    {
      label: "Trading",
      icon: <TrendingUp className="h-4 w-4" />,
      path: "/dashboard/trading",
      color: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
    },
    {
      label: "Support",
      icon: <MessageSquare className="h-4 w-4" />,
      path: "/dashboard/support",
      color: "bg-purple-500/10 text-purple-600 dark:text-purple-400",
    },
  ];

  return (
    <div className="space-y-8">
      {/* Onboarding reminder banner */}
      <AnimatePresence>
        {showBanner && (
          <motion.div
            initial={{ opacity: 0, y: -8, height: 0 }}
            animate={{ opacity: 1, y: 0, height: "auto" }}
            exit={{ opacity: 0, y: -8, height: 0 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            className="overflow-hidden"
          >
            <div className="relative flex items-start gap-4 rounded-lg border border-border bg-card p-4">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-foreground/5">
                <Sparkles className="h-4 w-4 text-foreground/70" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">Finish setting up your profile</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Add your trading experience and contact details to get personalized challenge recommendations.
                </p>
                <div className="flex items-center gap-3 mt-3">
                  <Button
                    size="sm"
                    className="h-8 text-xs"
                    onClick={() => navigate("/dashboard/onboarding")}
                  >
                    Complete Setup
                    <ArrowRight className="ml-1.5 h-3 w-3" />
                  </Button>
                  <button
                    type="button"
                    onClick={() => {
                      setBannerDismissed(true);
                      localStorage.setItem(SKIP_BANNER_KEY, "true");
                    }}
                    className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 decoration-dotted transition-colors"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setBannerDismissed(true);
                  localStorage.setItem(SKIP_BANNER_KEY, "true");
                }}
                className="shrink-0 h-6 w-6 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <PageHeader
        eyebrow="Overview"
        title={greeting}
        subtitle="Track your funded journey — challenges, trading and payouts at a glance."
        actions={
          <Button size="sm" className="text-xs shrink-0" onClick={() => navigate("/dashboard/challenges")}>
            New Challenge
            <ArrowRight className="ml-1 h-3 w-3" />
          </Button>
        }
      />

      {/* Stats grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {statCards.map((stat) => (
          <button
            key={stat.label}
            onClick={() => navigate(stat.path)}
            className="card-subtle p-5 text-left hover:bg-secondary/30 transition-colors group"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground mb-1.5">
                  {stat.label}
                </p>
                <div className="kpi-value">{stat.value}</div>
                {stat.subtitle && (
                  <p className="text-[10px] text-muted-foreground mt-1">{stat.subtitle}</p>
                )}
                {stat.trend && (
                  <p className="text-[10px] text-emerald-600 dark:text-emerald-400 mt-1 flex items-center gap-1">
                    <Zap className="h-2.5 w-2.5" />
                    {stat.trend}
                  </p>
                )}
              </div>
              <span className="icon-chip shrink-0">{stat.icon}</span>
            </div>
          </button>
        ))}
      </div>

      {/* Quick Actions */}
      <div>
        <h2 className="text-sm font-medium mb-3">Quick Actions</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {quickActions.map((action) => (
            <button
              key={action.label}
              onClick={() => navigate(action.path)}
              className="card-subtle p-4 text-center hover:bg-secondary/30 transition-colors group"
            >
              <div className={cn("h-10 w-10 rounded-xl mx-auto mb-2 flex items-center justify-center", action.color)}>
                {action.icon}
              </div>
              <span className="text-xs font-medium text-muted-foreground group-hover:text-foreground transition-colors">
                {action.label}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Active challenges */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-medium">Your Challenges</h2>
            {challenges && challenges.length > 0 && (
              <button
                onClick={() => navigate("/dashboard/challenges")}
                className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1"
              >
                View all <ChevronRight className="h-3 w-3" />
              </button>
            )}
          </div>
          {challenges && challenges.length > 0 ? (
            <div className="space-y-2">
              {challenges.slice(0, 3).map((ch: any) => (
                <button
                  key={ch.id}
                  onClick={() => navigate("/dashboard/challenges")}
                  className="w-full card-subtle p-4 flex items-center justify-between text-left hover:bg-secondary/30 transition-colors group"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">
                      {ch.templateName || `Challenge #${ch.id}`}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      ${ch.accountSize?.toLocaleString()} account
                      {ch.createdAt ? ` · ${formatRelativeTime(ch.createdAt)}` : ""}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={statusPillStyle(ch.status)}>{ch.status?.replace(/_/g, " ")}</span>
                    <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <Empty className="card-subtle p-8">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <BarChart3 className="h-6 w-6" />
                </EmptyMedia>
                <EmptyTitle>No challenges yet</EmptyTitle>
                <EmptyDescription>
                  Start your funded journey by purchasing a challenge.
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button size="sm" onClick={() => navigate("/dashboard/challenges")}>
                  Browse Challenges
                </Button>
              </EmptyContent>
            </Empty>
          )}
        </div>

        {/* Recent Notifications */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-medium">Recent Activity</h2>
            {recentNotifications.length > 0 && (
              <button
                onClick={() => navigate("/dashboard/notifications")}
                className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1"
              >
                View all <ChevronRight className="h-3 w-3" />
              </button>
            )}
          </div>
          {recentNotifications.length > 0 ? (
            <div className="card-subtle divide-y divide-border overflow-hidden">
              {recentNotifications.map((n: any) => (
                <button
                  key={n.id}
                  onClick={() => navigate(n.link || "/dashboard/notifications")}
                  className={cn(
                    "w-full text-left px-4 py-3 flex items-start gap-3 hover:bg-secondary/30 transition-colors",
                    !n.read && "bg-secondary/10"
                  )}
                >
                  <span className="mt-0.5 shrink-0">
                    {notificationIcons[n.type] || <Bell className="h-3.5 w-3.5 text-muted-foreground" />}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium truncate">{n.title}</span>
                      {!n.read && <span className="h-1.5 w-1.5 rounded-full bg-blue-500 shrink-0" />}
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-1">{n.message}</p>
                    <span className="text-[10px] text-muted-foreground/60 mt-1 block">
                      {formatRelativeTime(n.createdAt)}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="card-subtle p-8 text-center">
              <Bell className="h-6 w-6 mx-auto mb-2 text-muted-foreground/40" />
              <p className="text-xs text-muted-foreground">No recent activity</p>
            </div>
          )}
        </div>
      </div>

      {/* Wallet Summary & Payout Stats */}
      {wallet && (
        <div className="card-subtle p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-medium">Wallet Summary</h2>
            <button
              onClick={() => navigate("/dashboard/wallet")}
              className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1"
            >
              View wallet <ChevronRight className="h-3 w-3" />
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Balance</p>
              <p className="text-lg font-semibold mt-1">{formatMoney(wallet.balance, wallet.currency || "NGN")}</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Total Deposits</p>
              <p className="text-lg font-semibold mt-1">{formatMoney(wallet.totalDeposits || 0, wallet.currency || "NGN")}</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Total Withdrawn</p>
              <p className="text-lg font-semibold mt-1">{formatMoney(wallet.totalWithdrawals || 0, wallet.currency || "NGN")}</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Pending Payouts</p>
              <p className="text-lg font-semibold mt-1">{formatMoney(payoutStats?.totalPending || 0, wallet.currency || "NGN")}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
