import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Card } from "@/components/ui/card";
import { Loader2, TrendingUp, TrendingDown, Minus } from "lucide-react";

export default function Trading() {
  const challenges = useQuery(api.challenges.getMyChallenges);
  const metrics = useQuery(api.challenges.getDashboardMetrics);

  if (!challenges || !metrics) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Find funded challenges
  const fundedChallenges = challenges.filter((c) => c.status === "funded");
  const activeChallenges = challenges.filter((c) => c.status === "active");

  const latestMetrics = metrics.latestMetrics;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-lg font-medium tracking-tight">Trading</h1>
        <p className="text-xs text-muted-foreground mt-1">
          Monitor your trading performance and account metrics
        </p>
      </div>

      {/* Performance metrics */}
      {latestMetrics ? (
        <div className="space-y-4">
          <h2 className="text-sm font-medium">Current Metrics</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="card-subtle p-4">
              <div className="stat-label">Balance</div>
              <div className="stat-value mt-1">${latestMetrics.balance.toLocaleString()}</div>
            </div>
            <div className="card-subtle p-4">
              <div className="stat-label">Equity</div>
              <div className="stat-value mt-1">${latestMetrics.equity.toLocaleString()}</div>
            </div>
            <div className="card-subtle p-4">
              <div className="stat-label">Floating P/L</div>
              <div className={`stat-value mt-1 ${latestMetrics.floatingPL >= 0 ? "text-foreground" : "text-destructive"}`}>
                ${latestMetrics.floatingPL.toFixed(2)}
              </div>
            </div>
            <div className="card-subtle p-4">
              <div className="stat-label">Total Profit</div>
              <div className={`stat-value mt-1 ${latestMetrics.totalProfit >= 0 ? "text-foreground" : "text-destructive"}`}>
                ${latestMetrics.totalProfit.toFixed(2)}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="card-subtle p-4">
              <div className="stat-label">Win Rate</div>
              <div className="stat-value mt-1">{latestMetrics.winRate?.toFixed(1) || 0}%</div>
            </div>
            <div className="card-subtle p-4">
              <div className="stat-label">Profit Factor</div>
              <div className="stat-value mt-1">{latestMetrics.profitFactor?.toFixed(2) || 0}</div>
            </div>
            <div className="card-subtle p-4">
              <div className="stat-label">Risk Score</div>
              <div className="stat-value mt-1">{latestMetrics.riskScore || 0}/100</div>
            </div>
            <div className="card-subtle p-4">
              <div className="stat-label">Health Score</div>
              <div className="stat-value mt-1">{latestMetrics.healthScore || 0}/100</div>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="card-subtle p-4">
              <div className="stat-label">Open Positions</div>
              <div className="stat-value mt-1">{latestMetrics.openPositions}</div>
            </div>
            <div className="card-subtle p-4">
              <div className="stat-label">Closed Trades</div>
              <div className="stat-value mt-1">{latestMetrics.closedTrades}</div>
            </div>
            <div className="card-subtle p-4">
              <div className="stat-label">Drawdown</div>
              <div className={`stat-value mt-1 ${latestMetrics.currentDrawdown > 5 ? "text-destructive" : ""}`}>
                {latestMetrics.currentDrawdown.toFixed(2)}%
              </div>
            </div>
            <div className="card-subtle p-4">
              <div className="stat-label">Daily Drawdown</div>
              <div className={`stat-value mt-1 ${latestMetrics.dailyDrawdown > 3 ? "text-destructive" : ""}`}>
                {latestMetrics.dailyDrawdown.toFixed(2)}%
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="card-subtle p-8 text-center">
          <p className="text-sm text-muted-foreground">
            No trading data available yet. Start an active challenge to see metrics.
          </p>
        </div>
      )}

      {/* Active Challenges */}
      {activeChallenges.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-medium">Active Challenges</h2>
          {activeChallenges.map((ch) => (
            <div key={ch._id} className="card-subtle p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <div className="text-sm font-medium">${ch.accountSize.toLocaleString()} Account</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    Target: {ch.profitTarget}% | Max DD: {ch.maxDrawdown}%
                  </div>
                </div>
                <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded bg-foreground text-background">
                  Active
                </span>
              </div>
              <div className="space-y-2">
                <div>
                  <div className="flex justify-between text-xs text-muted-foreground mb-1">
                    <span>Profit Target Progress</span>
                    <span>0%</span>
                  </div>
                  <div className="progress-bar">
                    <div className="progress-bar-fill" style={{ width: "0%" }} />
                  </div>
                </div>
                <div className="flex gap-4 text-xs text-muted-foreground">
                  <span>{ch.minTradingDays} min trading days</span>
                  <span>{ch.maxLeverage}:1 leverage</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Funded Accounts */}
      {fundedChallenges.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-medium">Funded Accounts</h2>
          {fundedChallenges.map((ch) => (
            <div key={ch._id} className="card-subtle p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium">${ch.accountSize.toLocaleString()} Funded Account</div>
                  <div className="text-xs text-muted-foreground mt-0.5">90% Profit Share</div>
                </div>
                <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded bg-foreground text-background">
                  Funded
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
