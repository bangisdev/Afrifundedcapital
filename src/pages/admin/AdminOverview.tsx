/* eslint-disable @typescript-eslint/no-explicit-any */
import { useApiQuery } from "@/hooks/use-api";
import { Loader2, Users, BarChart3, DollarSign, Award, TrendingUp } from "lucide-react";

function StatCard({ label, value, icon }: { label: string; value: string | number; icon: React.ReactNode }) {
  return (
    <div className="card-subtle p-5">
      <div className="flex items-center gap-2 mb-3"><div className="h-6 w-6 rounded-full border border-border flex items-center justify-center">{icon}</div><span className="text-xs text-muted-foreground">{label}</span></div>
      <div className="stat-value">{value}</div>
    </div>
  );
}

export default function AdminOverview() {
  const { data: userStats } = useApiQuery<any>(["admin", "userStats"], "/api/users/stats");
  const { data: challengeStats } = useApiQuery<any>(["admin", "challengeStats"], "/api/challenges/admin/stats");
  const { data: paymentStats } = useApiQuery<any>(["admin", "paymentStats"], "/api/payments/admin/stats");
  const { data: payoutStats } = useApiQuery<any>(["admin", "payoutStats"], "/api/payouts/admin/stats");
  const { data: userGrowth } = useApiQuery<any>(["admin", "userGrowth"], "/api/users/growth");
  const { data: revenueGrowth } = useApiQuery<any>(["admin", "revenueGrowth"], "/api/payments/admin/revenue-growth");

  return (
    <div className="space-y-8">
      <div><h1 className="text-lg font-medium tracking-tight">Admin Overview</h1><p className="text-xs text-muted-foreground mt-1">Platform statistics and analytics</p></div>
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
