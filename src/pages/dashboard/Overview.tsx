/* eslint-disable @typescript-eslint/no-explicit-any */
import { useApiQuery } from "@/hooks/use-api";
import { useNavigate } from "react-router";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, ChevronRight, Sparkles, X, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

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

export default function Overview() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { data: metrics, isLoading: metricsLoading } = useApiQuery<any>(["metrics", "dashboard"], "/api/challenges/metrics");
  const { data: challengesData, isLoading: challengesLoading } = useApiQuery<any>(["challenges", "my"], "/api/challenges/my");
  const challenges = challengesData?.challenges || [];
  const { data: wallet, isLoading: walletLoading } = useApiQuery<any>(["wallet", "my"], "/api/wallets/my");
  const [bannerDismissed, setBannerDismissed] = useState(
    () => localStorage.getItem(SKIP_BANNER_KEY) === "true",
  );

  const showBanner = user && needsOnboarding(user) && !bannerDismissed;
  const isLoading = metricsLoading || challengesLoading || walletLoading;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const firstName = user?.name?.split(" ")[0] || "Trader";
  const greeting = `${greetingForHour(new Date().getHours())}${user?.name ? `, ${firstName}` : ""}`;

  const statCards = [
    {
      label: "Active Challenges",
      value: String(metrics?.activeChallenges ?? 0),
      path: "/dashboard/challenges",
    },
    {
      label: "Funded Accounts",
      value: String(metrics?.fundedAccounts ?? 0),
      path: "/dashboard/trading",
    },
    {
      label: "Wallet Balance",
      value: `${(wallet?.balance || 0).toLocaleString()} ${wallet?.currency || "NGN"}`,
      path: "/dashboard/wallet",
    },
  ];

  return (
    <div className="space-y-10">
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
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{greeting}</h1>
          <p className="text-xs text-muted-foreground mt-1.5">
            Track your funded journey — challenges, trading and payouts at a glance.
          </p>
        </div>
        <Button size="sm" className="text-xs shrink-0" onClick={() => navigate("/dashboard/challenges")}>
          New Challenge
          <ArrowRight className="ml-1 h-3 w-3" />
        </Button>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {statCards.map((stat) => (
          <button
            key={stat.label}
            onClick={() => navigate(stat.path)}
            className="card-subtle p-5 text-left hover:bg-secondary/30 transition-colors"
          >
            <p className="text-xs text-muted-foreground">{stat.label}</p>
            <p className="stat-value mt-2">{stat.value}</p>
          </button>
        ))}
      </div>

      {/* Active challenges */}
      {challenges && challenges.length > 0 ? (
        <div>
          <h2 className="text-sm font-medium mb-4">Your Challenges</h2>
          <div className="space-y-2">
            {challenges.slice(0, 5).map((ch: any) => (
              <button
                key={ch.id}
                onClick={() => navigate("/dashboard/challenges")}
                className="w-full card-subtle p-4 flex items-center justify-between text-left hover:bg-secondary/30 transition-colors"
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium">Challenge #{ch.id}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    ${ch.accountSize?.toLocaleString()} account
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={statusPillStyle(ch.status)}>{ch.status?.replace(/_/g, " ")}</span>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="card-subtle p-10 text-center">
          <p className="text-sm text-muted-foreground mb-4">
            You haven't purchased any challenges yet.
          </p>
          <Button size="sm" onClick={() => navigate("/dashboard/challenges")}>
            Browse Challenges
          </Button>
        </div>
      )}
    </div>
  );
}
