/* eslint-disable @typescript-eslint/no-explicit-any */
import { useApiQuery } from "@/hooks/use-api";
import { readResponseBody } from "@/lib/api";
import { useState, useMemo } from "react";
import { Loader2, Users, BarChart3, DollarSign, Award, TrendingUp, Database, CheckCircle, AlertTriangle, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Link } from "react-router";
import { parseStoredViolations, ruleCodeLabel, timeAgo } from "@/lib/challenge-violations";

function StatCard({ label, value, icon }: { label: string; value: string | number; icon: React.ReactNode }) {
  return (
    <div className="card-subtle p-5">
      <div className="flex items-center gap-2 mb-3"><div className="h-6 w-6 rounded-full border border-border flex items-center justify-center">{icon}</div><span className="text-xs text-muted-foreground">{label}</span></div>
      <div className="stat-value">{value}</div>
    </div>
  );
}

export default function AdminOverview() {
  const { data: userStats, refetch: refetchUsers } = useApiQuery<any>(["admin", "userStats"], "/api/users/stats");
  const { data: challengeStats, refetch: refetchChallenges } = useApiQuery<any>(["admin", "challengeStats"], "/api/challenges/admin/stats");
  const { data: paymentStats, refetch: refetchPayments } = useApiQuery<any>(["admin", "paymentStats"], "/api/payments/admin/stats");
  const { data: payoutStats, refetch: refetchPayouts } = useApiQuery<any>(["admin", "payoutStats"], "/api/payouts/admin/stats");
  const { data: userGrowth } = useApiQuery<any>(["admin", "userGrowth"], "/api/users/growth");
  const { data: revenueGrowth } = useApiQuery<any>(["admin", "revenueGrowth"], "/api/payments/admin/revenue-growth");
  const { data: allChallenges } = useApiQuery<any[]>(["admin", "allChallenges"], "/api/challenges/admin/all?sortBy=createdAt&sortOrder=desc");

  // Recent violations snapshot — newest first, capped at 5 rows so the
  // overview stays scannable. Full detail + recovery actions live on the
  // digest tab (/admin/challenges?tab=violations).
  const recentViolations = useMemo(() => {
    return (allChallenges || [])
      .filter((c: any) => c.status === "violated")
      .sort((a: any, b: any) => (b.updatedAt || 0) - (a.updatedAt || 0))
      .slice(0, 5);
  }, [allChallenges]);

  const [bulkSeeding, setBulkSeeding] = useState(false);
  const [bulkSeedResult, setBulkSeedResult] = useState<any>(null);
  const [seedingUsers, setSeedingUsers] = useState(false);
  const [userSeedResult, setUserSeedResult] = useState<any>(null);

  const handleBulkSeed = async () => {
    setBulkSeeding(true);
    setBulkSeedResult(null);
    try {
      const res = await fetch("/api/seed/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({}),
      });
      const data = await readResponseBody(res);
      setBulkSeedResult(data);
      if (data.success) {
        toast.success("All demo data seeded successfully!");
      } else {
        toast.warning(data.message || "Seed completed with some errors");
      }
      // Refresh all stats
      refetchUsers();
      refetchChallenges();
      refetchPayments();
      refetchPayouts();
    } catch (e: any) {
      toast.error(e?.message || "Failed to run bulk seed");
    }
    setBulkSeeding(false);
  };

  const handleSeedUsers = async () => {
    setSeedingUsers(true);
    setUserSeedResult(null);
    try {
      const res = await fetch("/api/seed/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });
      const data = await readResponseBody(res);
      setUserSeedResult(data);
      if (data.success) {
        toast.success(data.message || "Demo users seeded successfully!");
      } else {
        toast.warning(data.message || "Seed completed with some errors");
      }
      refetchUsers();
    } catch (e: any) {
      toast.error(e?.message || "Failed to seed demo users");
    }
    setSeedingUsers(false);
  };

  const hasNoData = !userStats?.totalUsers && !challengeStats?.total;

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-medium tracking-tight">Admin Overview</h1>
          <p className="text-xs text-muted-foreground mt-1">Platform statistics and analytics</p>
        </div>
        {hasNoData && (
          <Button
            size="sm"
            className="text-xs"
            onClick={handleBulkSeed}
            disabled={bulkSeeding}
          >
            {bulkSeeding ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Database className="h-3 w-3 mr-1" />}
            {bulkSeeding ? "Seeding..." : "Seed All Demo Data"}
          </Button>
        )}
        {!hasNoData && (
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              className="text-xs"
              onClick={handleSeedUsers}
              disabled={seedingUsers}
            >
              {seedingUsers ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Users className="h-3 w-3 mr-1" />}
              {seedingUsers ? "Seeding..." : "Seed Demo Users"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="text-xs"
              onClick={handleBulkSeed}
              disabled={bulkSeeding}
            >
              {bulkSeeding ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Database className="h-3 w-3 mr-1" />}
              {bulkSeeding ? "Seeding..." : "Re-Seed Demo Data"}
            </Button>
          </div>
        )}
      </div>

      {/* Bulk seed results */}
      {bulkSeedResult && (
        <div className={`card-subtle p-4 flex items-start gap-3 ${bulkSeedResult.success ? "border-emerald-500/20" : "border-yellow-500/20"}`}>
          {bulkSeedResult.success ? (
            <CheckCircle className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />
          ) : (
            <AlertTriangle className="h-4 w-4 text-yellow-500 mt-0.5 shrink-0" />
          )}
          <div className="text-xs">
            <div className="font-medium">{bulkSeedResult.message}</div>
            {bulkSeedResult.results && (
              <div className="mt-1 text-muted-foreground space-y-0.5">
                {bulkSeedResult.results.templates && (
                  <div>Templates: {bulkSeedResult.results.templates.created || 0} created, {bulkSeedResult.results.templates.accountSizes || 0} account sizes</div>
                )}
                {bulkSeedResult.results.affiliates && (
                  <div>Affiliates: {bulkSeedResult.results.affiliates.createdAffiliates || 0} created, {bulkSeedResult.results.affiliates.createdWallets || 0} wallets</div>
                )}
                {bulkSeedResult.results.fundedAccounts && !bulkSeedResult.results.fundedAccounts.skipped && (
                  <div>Funded: {bulkSeedResult.results.fundedAccounts.mt5Accounts || 0} MT5 accounts, {bulkSeedResult.results.fundedAccounts.payoutRequests || 0} payout requests</div>
                )}
                {bulkSeedResult.results.fundedAccounts?.skipped && (
                  <div>Funded: Already seeded</div>
                )}
              </div>
            )}
            {bulkSeedResult.errors && bulkSeedResult.errors.length > 0 && (
              <div className="mt-1 text-red-500">
                {bulkSeedResult.errors.map((e: string, i: number) => (
                  <div key={i}>{e}</div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* User seed results */}
      {userSeedResult && (
        <div className={`card-subtle p-4 flex items-start gap-3 ${userSeedResult.success ? "border-emerald-500/20" : "border-yellow-500/20"}`}>
          {userSeedResult.success ? (
            <CheckCircle className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />
          ) : (
            <AlertTriangle className="h-4 w-4 text-yellow-500 mt-0.5 shrink-0" />
          )}
          <div className="text-xs">
            <div className="font-medium">{userSeedResult.message}</div>
            {userSeedResult.users && (
              <div className="mt-1 text-muted-foreground">
                Created {userSeedResult.users.length} demo users with challenges in various states
              </div>
            )}
            {userSeedResult.errors && userSeedResult.errors.length > 0 && (
              <div className="mt-1 text-red-500">
                {userSeedResult.errors.map((e: string, i: number) => (
                  <div key={i}>{e}</div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Users" value={userStats?.totalUsers || 0} icon={<Users className="h-3.5 w-3.5" />} />
        <StatCard label="Total Challenges" value={challengeStats?.total || 0} icon={<BarChart3 className="h-3.5 w-3.5" />} />
        <StatCard label="Revenue" value={`₦${(paymentStats?.revenue || 0).toLocaleString()}`} icon={<DollarSign className="h-3.5 w-3.5" />} />
        <StatCard label="Active Challenges" value={challengeStats?.active || 0} icon={<TrendingUp className="h-3.5 w-3.5" />} />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Funded Accounts" value={challengeStats?.funded || 0} icon={<Award className="h-3.5 w-3.5" />} />
        <StatCard label="Completed Payments" value={paymentStats?.completed || 0} icon={<DollarSign className="h-3.5 w-3.5" />} />
        <StatCard label="Total Paid Out" value={`₦${(payoutStats?.totalPaid || 0).toLocaleString()}`} icon={<TrendingUp className="h-3.5 w-3.5" />} />
        <StatCard label="Pending Payouts" value={payoutStats?.pending || 0} icon={<BarChart3 className="h-3.5 w-3.5" />} />
      </div>
      {userGrowth && (
        <div className="card-subtle p-6">
          <h2 className="text-sm font-medium mb-3">User Growth</h2>
          <div className="flex items-center gap-6 text-xs text-muted-foreground">
            <span>Total: {userGrowth.totalUsers}</span>
            <span>New (30d): {userGrowth.newUsers30d}</span>
          </div>
        </div>
      )}
      {revenueGrowth && (
        <div className="card-subtle p-6">
          <h2 className="text-sm font-medium mb-3">Revenue Growth</h2>
          <div className="flex items-center gap-6 text-xs text-muted-foreground">
            <span>This Month: ₦{(revenueGrowth.thisMonth || 0).toLocaleString()}</span>
            <span>Last Month: ₦{(revenueGrowth.lastMonth || 0).toLocaleString()}</span>
          </div>
        </div>
      )}

      {/* Recent violations digest snapshot */}
      <div className="card-subtle p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-medium inline-flex items-center gap-2">
            <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
            Recent Violations
          </h2>
          <Link
            to="/admin/challenges?tab=violations"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            View all
            <ChevronRight className="h-3 w-3" />
          </Link>
        </div>
        {recentViolations.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No violations recorded yet — the rule engine hasn't flagged any challenges.
          </p>
        ) : (
          <div className="divide-y divide-border">
            {recentViolations.map((ch: any) => {
              const stored = parseStoredViolations(ch.violations);
              const hard = stored.filter((v) => v.severity !== "warning").slice(0, 2);
              const extra = stored.filter((v) => v.severity !== "warning").length - hard.length;
              const initials = (ch.userName || "U")
                .split(" ")
                .filter(Boolean)
                .slice(0, 2)
                .map((p: string) => p[0])
                .join("")
                .toUpperCase();
              return (
                <div key={ch.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                  <div className="h-8 w-8 rounded-full bg-red-500/10 text-red-600 flex items-center justify-center text-[10px] font-medium shrink-0">
                    {initials || "U"}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium truncate">{ch.userName || `User ${ch.userId}`}</span>
                      <span className="text-[10px] text-muted-foreground shrink-0">{timeAgo(ch.updatedAt)}</span>
                    </div>
                    <div className="text-[10px] text-muted-foreground truncate mt-0.5">
                      {ch.templateName || "Challenge"} · ${(ch.accountSize || 0).toLocaleString()}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {hard.map((v, i) => (
                      <span
                        key={i}
                        className="inline-flex items-center rounded-full border border-red-500/20 bg-red-500/10 px-1.5 py-0.5 text-[9px] text-red-600"
                      >
                        {ruleCodeLabel(v.code || v.type)}
                      </span>
                    ))}
                    {extra > 0 && <span className="text-[9px] text-muted-foreground">+{extra}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
