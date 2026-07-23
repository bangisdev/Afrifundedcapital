import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
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
  Target,
  PieChart as PieChartIcon,
  Wallet,
} from "lucide-react";

const PIE_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--foreground)",
  "var(--muted-foreground)",
];

export default function AdminOverview() {
  const userStats = useQuery(api.users.getUserStats);
  const paymentStats = useQuery(api.payments.getPaymentStats);
  const challengeStats = useQuery(api.challenges.getAdminChallengeStats);
  const revenueGrowth = useQuery(api.payments.getRevenueGrowth);
  const userGrowth = useQuery(api.users.getUserGrowth);
  const payoutStats = useQuery(api.payouts.getPayoutStats);

  if (!userStats || !paymentStats || !challengeStats || !revenueGrowth || !userGrowth || !payoutStats) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const { statusBreakdown, fundedAccounts, templateDistribution, challengeGrowth, sizeBuckets } = challengeStats;

  // Pie chart data
  const statusPieData = [
    { name: "Active", value: statusBreakdown.active },
    { name: "Pending", value: statusBreakdown.pending },
    { name: "Phase 1 Passed", value: statusBreakdown.phase1Passed },
    { name: "Phase 2 Passed", value: statusBreakdown.phase2Passed },
    { name: "Funded", value: statusBreakdown.funded },
    { name: "Violated", value: statusBreakdown.violated },
    { name: "Expired", value: statusBreakdown.expired },
  ].filter((d) => d.value > 0);

  const statCards = [
    {
      label: "Total Users",
      value: userStats.total,
      icon: <Users className="h-4 w-4" />,
      sub: `${userStats.verified} verified · ${userStats.admins} admins`,
    },
    {
      label: "Total Revenue",
      value: `$${paymentStats.totalRevenue.toLocaleString()}`,
      icon: <DollarSign className="h-4 w-4" />,
      sub: `${paymentStats.completed} completed payments`,
    },
    {
      label: "KYC Pending",
      value: userStats.pending,
      icon: <Shield className="h-4 w-4" />,
      sub: `${userStats.verified} verified · ${userStats.pending} pending`,
    },
    {
      label: "Challenges",
      value: challengeStats.totalChallenges,
      icon: <Target className="h-4 w-4" />,
      sub: `${statusBreakdown.funded} funded · ${statusBreakdown.active} active`,
    },
    {
      label: "Funded Accounts",
      value: fundedAccounts.total,
      icon: <Award className="h-4 w-4" />,
      sub: `$${fundedAccounts.totalAccountSize.toLocaleString()} total size`,
    },
    {
      label: "Payouts",
      value: payoutStats.total,
      icon: <Wallet className="h-4 w-4" />,
      sub: `$${payoutStats.totalPaid.toLocaleString()} paid · $${payoutStats.totalPending.toLocaleString()} pending`,
    },
  ];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-lg font-medium tracking-tight">Admin Dashboard</h1>
        <p className="text-xs text-muted-foreground mt-1">
          Platform overview, growth metrics, and performance analytics
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {statCards.map((stat) => (
          <div key={stat.label} className="card-subtle p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="h-6 w-6 rounded-full border border-border flex items-center justify-center">
                {stat.icon}
              </div>
            </div>
            <div className="stat-value text-lg">{stat.value}</div>
            <div className="text-[10px] text-muted-foreground mt-1">{stat.sub}</div>
          </div>
        ))}
      </div>

      {/* Charts Row 1 */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Revenue Growth */}
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
                  tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                />
                <Tooltip
                  contentStyle={{ background: "var(--background)", border: "1px solid var(--border)", borderRadius: "var(--radius)", fontSize: 12 }}
                  formatter={(value: number) => [`$${value.toLocaleString()}`, "Revenue"]}
                />
                <Bar dataKey="revenue" fill="var(--foreground)" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* User Growth */}
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
                <YAxis tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ background: "var(--background)", border: "1px solid var(--border)", borderRadius: "var(--radius)", fontSize: 12 }}
                  formatter={(value: number) => [value, "New Users"]}
                />
                <Line type="monotone" dataKey="count" stroke="var(--foreground)" strokeWidth={2} dot={{ r: 3, fill: "var(--foreground)" }} activeDot={{ r: 5 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Charts Row 2 — Challenge Stats */}
      <div className="grid md:grid-cols-3 gap-6">
        {/* Challenge Status Pie */}
        <div className="card-subtle p-5">
          <div className="flex items-center gap-2 mb-4">
            <PieChartIcon className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-medium">Challenge Status</h3>
          </div>
          <div className="h-56 flex items-center justify-center">
            {statusPieData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={statusPieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={45}
                    outerRadius={80}
                    paddingAngle={2}
                    dataKey="value"
                  >
                    {statusPieData.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ background: "var(--background)", border: "1px solid var(--border)", borderRadius: "var(--radius)", fontSize: 12 }}
                    formatter={(value: number, name: string) => [value, name]}
                  />
                  <Legend
                    wrapperStyle={{ fontSize: 10 }}
                    formatter={(value: string) => <span style={{ color: "var(--muted-foreground)" }}>{value}</span>}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-xs text-muted-foreground">No challenge data</p>
            )}
          </div>
        </div>

        {/* Challenge Growth */}
        <div className="card-subtle p-5">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-medium">Challenge Growth (6 months)</h3>
          </div>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={challengeGrowth}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis
                  dataKey="month"
                  tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                  tickFormatter={(v) => v.slice(5)}
                />
                <YAxis tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ background: "var(--background)", border: "1px solid var(--border)", borderRadius: "var(--radius)", fontSize: 12 }}
                  formatter={(value: number) => [value, "Challenges"]}
                />
                <Line type="monotone" dataKey="count" stroke="var(--chart-2)" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Account Size Distribution */}
        <div className="card-subtle p-5">
          <div className="flex items-center gap-2 mb-4">
            <Target className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-medium">Account Sizes</h3>
          </div>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={[
                  { name: "≤$10K", value: sizeBuckets.under10k },
                  { name: "$10K-$50K", value: sizeBuckets.under50k },
                  { name: "$50K-$100K", value: sizeBuckets.under100k },
                  { name: ">$100K", value: sizeBuckets.over100k },
                ]}
                layout="vertical"
              >
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} allowDecimals={false} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} width={80} />
                <Tooltip
                  contentStyle={{ background: "var(--background)", border: "1px solid var(--border)", borderRadius: "var(--radius)", fontSize: 12 }}
                  formatter={(value: number) => [value, "Challenges"]}
                />
                <Bar dataKey="value" fill="var(--foreground)" radius={[0, 2, 2, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Detail Cards */}
      <div className="grid md:grid-cols-3 gap-4">
        {/* Payment Breakdown */}
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
            <div className="border-t border-border pt-2 mt-2">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Challenge Revenue</span>
                <span className="font-medium">${challengeStats.totalChallengeRevenue.toLocaleString()}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Template Distribution */}
        <div className="card-subtle p-5">
          <h3 className="text-sm font-medium mb-4">Challenge Templates</h3>
          <div className="space-y-2">
            {templateDistribution.map((t) => (
              <div key={t.name} className="flex justify-between text-xs">
                <span className="text-muted-foreground">{t.name}</span>
                <span className="font-medium">{t.count} challenges · ${t.revenue.toLocaleString()}</span>
              </div>
            ))}
            {templateDistribution.length === 0 && (
              <p className="text-xs text-muted-foreground">No template data yet</p>
            )}
          </div>
        </div>

        {/* Funded & Payout Stats */}
        <div className="card-subtle p-5">
          <h3 className="text-sm font-medium mb-4">Funded & Payouts</h3>
          <div className="space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Funded Accounts</span>
              <span className="font-medium">{fundedAccounts.total}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Active Funded</span>
              <span className="font-medium">{fundedAccounts.active}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Total Account Size</span>
              <span className="font-medium">${fundedAccounts.totalAccountSize.toLocaleString()}</span>
            </div>
            <div className="border-t border-border pt-2 mt-2">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Total Paid Out</span>
                <span className="font-medium">${payoutStats.totalPaid.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Pending Payouts</span>
                <span className="font-medium">${payoutStats.totalPending.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Fees Collected</span>
                <span className="font-medium">${(totalPayoutFees(paymentStats, payoutStats)).toLocaleString()}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function totalPayoutFees(paymentStats: { totalRevenue: number }, payoutStats: { totalPaid: number }): number {
  // Simplified: revenue - total paid out = fees/profits
  return Math.max(0, paymentStats.totalRevenue - payoutStats.totalPaid);
}
