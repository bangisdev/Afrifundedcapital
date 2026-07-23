import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Card } from "@/components/ui/card";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  Loader2,
  Users,
  DollarSign,
  Award,
  BarChart3,
  Ticket,
  Shield,
  TrendingUp,
  Activity,
} from "lucide-react";

export default function AdminOverview() {
  const userStats = useQuery(api.users.getUserStats);
  const paymentStats = useQuery(api.payments.getPaymentStats);
  const affiliateStats = useQuery(api.affiliates.getAffiliateStats);
  const revenueGrowth = useQuery(api.payments.getRevenueGrowth);
  const userGrowth = useQuery(api.users.getUserGrowth);

  if (!userStats || !paymentStats || !affiliateStats || !revenueGrowth || !userGrowth) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const statCards = [
    {
      label: "Total Users",
      value: userStats.total,
      icon: <Users className="h-4 w-4" />,
      sub: `${userStats.verified} verified`,
    },
    {
      label: "Revenue",
      value: `₦${paymentStats.totalRevenue.toLocaleString()}`,
      icon: <DollarSign className="h-4 w-4" />,
      sub: `${paymentStats.completed} completed payments`,
    },
    {
      label: "KYC Pending",
      value: userStats.pending,
      icon: <Shield className="h-4 w-4" />,
      sub: "awaiting verification",
    },
    {
      label: "Affiliates",
      value: affiliateStats.totalAffiliates,
      icon: <Users className="h-4 w-4" />,
      sub: `₦${affiliateStats.totalCommissions.toLocaleString()} commissions`,
    },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-lg font-medium tracking-tight">Admin Dashboard</h1>
        <p className="text-xs text-muted-foreground mt-1">
          Platform overview, growth metrics, and analytics
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((stat) => (
          <div key={stat.label} className="card-subtle p-5">
            <div className="flex items-center gap-2 mb-3">
              <div className="h-6 w-6 rounded-full border border-border flex items-center justify-center">
                {stat.icon}
              </div>
              <span className="text-xs text-muted-foreground">{stat.label}</span>
            </div>
            <div className="stat-value">{stat.value}</div>
            <div className="text-xs text-muted-foreground mt-1">{stat.sub}</div>
          </div>
        ))}
      </div>

      {/* Charts */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Revenue Chart */}
        <div className="card-subtle p-5">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-medium">Revenue Growth (6 months)</h3>
          </div>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={revenueGrowth}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis
                  dataKey="month"
                  tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                  tickFormatter={(v) => v.slice(5)}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                  tickFormatter={(v) => `₦${(v / 1000).toFixed(0)}k`}
                />
                <Tooltip
                  contentStyle={{
                    background: "var(--background)",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius)",
                    fontSize: 12,
                  }}
                  formatter={(value: number) => [`₦${value.toLocaleString()}`, "Revenue"]}
                />
                <Bar dataKey="revenue" fill="var(--foreground)" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* User Growth Chart */}
        <div className="card-subtle p-5">
          <div className="flex items-center gap-2 mb-4">
            <Activity className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-medium">User Growth (6 months)</h3>
          </div>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={userGrowth}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis
                  dataKey="month"
                  tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                  tickFormatter={(v) => v.slice(5)}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                  allowDecimals={false}
                />
                <Tooltip
                  contentStyle={{
                    background: "var(--background)",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius)",
                    fontSize: 12,
                  }}
                  formatter={(value: number) => [value, "New Users"]}
                />
                <Line
                  type="monotone"
                  dataKey="count"
                  stroke="var(--foreground)"
                  strokeWidth={2}
                  dot={{ r: 3, fill: "var(--foreground)" }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Detailed stats */}
      <div className="grid md:grid-cols-3 gap-4">
        <div className="card-subtle p-5">
          <h3 className="text-sm font-medium mb-4">Payment Breakdown</h3>
          <div className="space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Completed</span>
              <span className="font-medium">{paymentStats.completed}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Pending</span>
              <span className="font-medium">{paymentStats.pending}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Failed</span>
              <span className="font-medium">{paymentStats.failed}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Refunded</span>
              <span className="font-medium">{paymentStats.refunded}</span>
            </div>
          </div>
        </div>

        <div className="card-subtle p-5">
          <h3 className="text-sm font-medium mb-4">Affiliate Summary</h3>
          <div className="space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Total Referrals</span>
              <span className="font-medium">{affiliateStats.totalReferrals}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Active Referrals</span>
              <span className="font-medium">{affiliateStats.activeReferrals}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Pending Commissions</span>
              <span className="font-medium">₦{affiliateStats.pendingCommissions.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Paid Commissions</span>
              <span className="font-medium">₦{affiliateStats.paidCommissions.toLocaleString()}</span>
            </div>
          </div>
        </div>

        <div className="card-subtle p-5">
          <h3 className="text-sm font-medium mb-4">User Breakdown</h3>
          <div className="space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Admins</span>
              <span className="font-medium">{userStats.admins}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">KYC Verified</span>
              <span className="font-medium">{userStats.verified}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">KYC Pending</span>
              <span className="font-medium">{userStats.pending}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
