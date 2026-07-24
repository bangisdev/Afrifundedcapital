/* eslint-disable @typescript-eslint/no-explicit-any */
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useNavigate } from "react-router";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, BarChart3, TrendingUp, Wallet, Award, Loader2, ChevronRight, Sparkles, X } from "lucide-react";

const SKIP_BANNER_KEY = "_afc_onboarding_banner_dismissed";

function needsOnboarding(user: { name?: string | null; tradingExperience?: string | null; phone?: string | null }): boolean {
  // User skipped if onboardingComplete is true but key fields are missing
  return !user.name || !user.tradingExperience || !user.phone;
}

export default function Overview() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const metrics = useQuery(api.challenges.getDashboardMetrics);
  const challenges = useQuery(api.challenges.getMyChallenges);
  const wallet = useQuery(api.wallets.getMyWallet);
  const [bannerDismissed, setBannerDismissed] = useState(
    () => localStorage.getItem(SKIP_BANNER_KEY) === "true",
  );

  const showBanner = user && needsOnboarding(user) && !bannerDismissed;

  if (!metrics || !challenges || !wallet) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const statCards = [
    {
      label: "Active Challenges",
      value: metrics.activeChallenges,
      icon: <BarChart3 className="h-4 w-4" />,
      path: "/dashboard/challenges",
    },
    {
      label: "Funded Accounts",
      value: metrics.fundedAccounts,
      icon: <Award className="h-4 w-4" />,
      path: "/dashboard/trading",
    },
    {
      label: "Wallet Balance",
      value: `${wallet.balance.toLocaleString()} ${wallet.currency}`,
      icon: <Wallet className="h-4 w-4" />,
      path: "/dashboard/wallet",
    },
    {
      label: "Total Challenges",
      value: metrics.totalChallenges,
      icon: <TrendingUp className="h-4 w-4" />,
      path: "/dashboard/challenges",
    },
  ];

  // Latest metrics
  const latestMetrics = metrics.latestMetrics;

  return (
    <div className="space-y-8">
      {/* ── Onboarding reminder banner ── */}
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-medium tracking-tight">Overview</h1>
          <p className="text-xs text-muted-foreground mt-1">
            Welcome to your AfriFundedCapital dashboard
          </p>
        </div>
        <Button size="sm" className="text-xs" onClick={() => navigate("/dashboard/challenges")}>
          New Challenge
          <ArrowRight className="ml-1 h-3 w-3" />
        </Button>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((stat) => (
          <button
            key={stat.label}
            onClick={() => navigate(stat.path)}
            className="card-subtle p-5 text-left hover:bg-secondary/30 transition-colors"
          >
            <div className="flex items-center gap-2 mb-3">
              <div className="h-6 w-6 rounded-full border border-border flex items-center justify-center">
                {stat.icon}
              </div>
              <span className="text-xs text-muted-foreground">{stat.label}</span>
            </div>
            <div className="stat-value">{stat.value}</div>
          </button>
        ))}
      </div>

      {/* Latest metrics */}
      {latestMetrics && (
        <div>
          <h2 className="text-sm font-medium mb-4">Latest Trading Metrics</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: "Balance", value: `$${latestMetrics.balance.toLocaleString()}` },
              { label: "Equity", value: `$${latestMetrics.equity.toLocaleString()}` },
              { label: "Profit Target", value: `${latestMetrics.profitTargetProgress.toFixed(1)}%` },
              { label: "Health Score", value: `${latestMetrics.healthScore || 0}/100` },
            ].map((m) => (
              <div key={m.label} className="card-subtle p-4">
                <div className="stat-label">{m.label}</div>
                <div className="stat-value mt-1">{m.value}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Active challenges */}
      {challenges.length > 0 ? (
        <div>
          <h2 className="text-sm font-medium mb-4">Your Challenges</h2>
          <div className="space-y-2">
            {challenges.slice(0, 5).map((ch) => (
              <button
                key={ch._id}
                onClick={() => navigate("/dashboard/challenges")}
                className="w-full card-subtle p-4 flex items-center justify-between text-left hover:bg-secondary/30 transition-colors"
              >
                <div>
                  <div className="text-sm">{ch.templateName || "Challenge"}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    ${ch.accountSize.toLocaleString()} — {ch.status.replace(/_/g, " ")}
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="card-subtle p-8 text-center">
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
