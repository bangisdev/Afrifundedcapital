/* eslint-disable @typescript-eslint/no-explicit-any */
import { useApiQuery } from "@/hooks/use-api";
import { useState } from "react";
import { Loader2, Users, BarChart3, DollarSign, Award, TrendingUp, Database, CheckCircle, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

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

  const [bulkSeeding, setBulkSeeding] = useState(false);
  const [bulkSeedResult, setBulkSeedResult] = useState<any>(null);

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
      const data = await res.json();
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
    </div>
  );
}
