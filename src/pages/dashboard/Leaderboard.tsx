/* eslint-disable @typescript-eslint/no-explicit-any */
import { useApiQuery } from "@/hooks/use-api";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { PageLoader } from "@/components/dashboard/PageLoader";
import {
  Trophy, TrendingUp, BarChart3, Target, Award,
  ChevronDown, Globe, Medal,
} from "lucide-react";
import { formatMoney } from "@/lib/utils";

type Period = "week" | "month" | "all";

interface LeaderboardEntry {
  rank: number;
  userId: number;
  name: string;
  country: string | null;
  avatarInitials: string;
  totalProfit: number;
  winRate: number;
  profitFactor: number;
  accountSize: number;
  profitPct: number;
  healthScore: number;
  tradingDays: number;
  challengeLabel: string;
}

interface LeaderboardResponse {
  leaderboard: LeaderboardEntry[];
  period: string;
  total: number;
}

const PERIOD_OPTIONS: Array<{ value: Period; label: string }> = [
  { value: "all", label: "All Time" },
  { value: "month", label: "This Month" },
  { value: "week", label: "This Week" },
];

const RANK_STYLES: Record<number, string> = {
  1: "bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-400",
  2: "bg-gray-400/10 border-gray-400/30 text-gray-600 dark:text-gray-400",
  3: "bg-orange-600/10 border-orange-600/30 text-orange-700 dark:text-orange-400",
};

function getRankBadge(rank: number) {
  if (rank === 1) return <Trophy className="h-4 w-4" />;
  if (rank === 2) return <Medal className="h-4 w-4" />;
  if (rank === 3) return <Award className="h-4 w-4" />;
  return <span className="text-xs font-mono">{rank}</span>;
}

export default function Leaderboard() {
  const [period, setPeriod] = useState<Period>("all");
  const { data, isLoading } = useApiQuery<LeaderboardResponse>(
    ["leaderboard", period],
    `/api/leaderboard?period=${period}&limit=20`
  );

  const leaderboard = data?.leaderboard || [];

  if (isLoading) {
    return <PageLoader rows={8} />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Community"
        title="Trader Leaderboard"
        subtitle="Top performing funded traders ranked by profit percentage"
        actions={
          <div className="flex items-center gap-2">
            {PERIOD_OPTIONS.map((p) => (
              <Button
                key={p.value}
                variant={period === p.value ? "default" : "outline"}
                size="sm"
                className={`text-xs h-8 ${period === p.value ? "btn-brand" : ""}`}
                onClick={() => setPeriod(p.value)}
              >
                {p.label}
              </Button>
            ))}
          </div>
        }
      />

      {/* Top 3 Podium */}
      {leaderboard.length >= 3 && (
        <div className="grid grid-cols-3 gap-3 mb-6">
          {[1, 0, 2].map((idx) => {
            const trader = leaderboard[idx];
            if (!trader) return <div key={idx} />;
            const isTop = idx === 0;
            return (
              <div
                key={trader.userId}
                className={`card-subtle p-4 sm:p-5 text-center transition-all ${isTop ? "sm:-mt-4 ring-2 ring-amber-500/20" : ""}`}
              >
                <div className={`h-12 w-12 rounded-full mx-auto mb-3 flex items-center justify-center text-sm font-semibold ${RANK_STYLES[trader.rank] || "bg-secondary"}`}>
                  {getRankBadge(trader.rank)}
                </div>
                <div className="text-sm font-medium truncate">{trader.name}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{trader.challengeLabel}</div>
                <div className={`text-lg font-semibold mt-2 ${trader.profitPct >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
                  {trader.profitPct >= 0 ? "+" : ""}{trader.profitPct.toFixed(1)}%
                </div>
                <div className="flex items-center justify-center gap-3 mt-2 text-[10px] text-muted-foreground">
                  <span>{trader.winRate.toFixed(0)}% WR</span>
                  <span>·</span>
                  <span>{trader.tradingDays}d</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Full Table */}
      {leaderboard.length === 0 ? (
        <div className="card-subtle p-12 text-center">
          <Trophy className="h-10 w-10 mx-auto mb-3 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">No traders on the leaderboard yet</p>
          <p className="text-xs text-muted-foreground/70 mt-1">Opt in via Profile settings to appear here</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {leaderboard.map((trader) => (
            <div
              key={trader.userId}
              className={`card-subtle p-3.5 sm:p-4 flex items-center gap-3 sm:gap-4 transition-colors hover:bg-secondary/20 ${
                RANK_STYLES[trader.rank] || ""
              }`}
            >
              {/* Rank */}
              <div className={`h-9 w-9 rounded-xl flex items-center justify-center shrink-0 text-xs font-semibold ${
                RANK_STYLES[trader.rank] || "bg-secondary text-secondary-foreground"
              }`}>
                {getRankBadge(trader.rank)}
              </div>

              {/* Avatar */}
              <div className="h-9 w-9 rounded-full bg-secondary flex items-center justify-center text-[11px] font-semibold shrink-0">
                {trader.avatarInitials}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium truncate">{trader.name}</span>
                  {trader.country && (
                    <span className="text-[10px] text-muted-foreground hidden sm:inline">
                      {trader.country}
                    </span>
                  )}
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5">
                  {trader.challengeLabel} · {formatMoney(trader.accountSize, "USD")} account · {trader.tradingDays} trading days
                </div>
              </div>

              {/* Stats */}
              <div className="hidden sm:flex items-center gap-4 text-xs">
                <div className="text-right">
                  <div className="text-[10px] text-muted-foreground">Win Rate</div>
                  <div className="font-medium tabular-nums">{trader.winRate.toFixed(0)}%</div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] text-muted-foreground">Profit Factor</div>
                  <div className="font-medium tabular-nums">{trader.profitFactor.toFixed(1)}</div>
                </div>
              </div>

              {/* Profit */}
              <div className="text-right shrink-0">
                <div className={`text-sm font-semibold tabular-nums ${
                  trader.profitPct >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"
                }`}>
                  {trader.profitPct >= 0 ? "+" : ""}{trader.profitPct.toFixed(1)}%
                </div>
                <div className="text-[10px] text-muted-foreground tabular-nums">
                  {formatMoney(trader.totalProfit, "USD")}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
