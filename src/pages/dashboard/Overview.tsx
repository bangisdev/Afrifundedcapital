/* eslint-disable @typescript-eslint/no-explicit-any */
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ArrowRight, BarChart3, TrendingUp, Wallet, Award, Loader2, ChevronRight } from "lucide-react";

export default function Overview() {
  const navigate = useNavigate();
  const metrics = useQuery(api.challenges.getDashboardMetrics);
  const challenges = useQuery(api.challenges.getMyChallenges);
  const wallet = useQuery(api.wallets.getMyWallet);

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
