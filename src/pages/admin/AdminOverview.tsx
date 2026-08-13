/* eslint-disable @typescript-eslint/no-explicit-any */
import { useApiQuery } from "@/hooks/use-api";
import { readResponseBody } from "@/lib/api";
import { useState, useMemo } from "react";
import {
  Loader2,
  Users,
  BarChart3,
  Wallet,
  Activity,
  Award,
  CheckCircle2,
  TrendingUp,
  Clock,
  Database,
  CheckCircle,
  AlertTriangle,
  ChevronRight,
  Mail,
  Send,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Link } from "react-router";
import { parseStoredViolations, ruleCodeLabel, timeAgo } from "@/lib/challenge-violations";
import { cn } from "@/lib/utils";

function StatCard({
  label,
  value,
  icon,
  tone = "default",
}: {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  tone?: "default" | "emerald" | "amber" | "blue";
}) {
  return (
    <div className="card-subtle p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground mb-1.5">
            {label}
          </p>
          <div className="kpi-value">{value}</div>
        </div>
        <div
          className={cn(
            "icon-chip shrink-0",
            tone === "emerald" && "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
            tone === "amber" && "bg-amber-500/10 text-amber-600 border-amber-500/20",
            tone === "blue" && "bg-blue-500/10 text-blue-600 border-blue-500/20",
          )}
        >
          {icon}
        </div>
      </div>
    </div>
  );
}

function SectionCard({
  title,
  icon,
  accent = "default",
  actions,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  accent?: "default" | "emerald" | "blue" | "amber";
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="card-subtle p-6">
      <div className="flex items-center justify-between gap-3 mb-4">
        <h2 className="text-sm font-medium inline-flex items-center gap-2">
          {icon && (
            <span
              className={cn(
                "h-6 w-6 rounded-md flex items-center justify-center shrink-0",
                accent === "blue" && "bg-blue-500/10 text-blue-600",
                accent === "emerald" && "bg-emerald-500/10 text-emerald-600",
                accent === "amber" && "bg-amber-500/10 text-amber-600",
                accent === "default" && "bg-secondary text-foreground/70",
              )}
            >
              {icon}
            </span>
          )}
          {title}
        </h2>
        {actions}
      </div>
      {children}
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
  const { data: digestStatus, refetch: refetchDigestStatus } = useApiQuery<any>(["admin", "digestStatus"], "/api/challenges/admin/digest-status");

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
  const [sendingDigest, setSendingDigest] = useState(false);

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

  const handleSendDigest = async () => {
    setSendingDigest(true);
    try {
      const res = await fetch("/api/challenges/admin/digest-send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({}),
      });
      const data = await readResponseBody(res);
      if (data.success) {
        toast.success(data.message || "Digest sent");
        // Refresh the status card so the "last sent" timestamp updates inline.
        refetchDigestStatus();
      } else {
        toast.warning(data.message || data.error || "Digest send failed");
      }
    } catch (e: any) {
      toast.error(e?.message || "Failed to send digest");
    }
    setSendingDigest(false);
  };

  const hasNoData = !userStats?.totalUsers && !challengeStats?.total;

  // Simple proportional bars for the growth cards (pure CSS, no chart dep).
  const userGrowthPct =
    userGrowth && userGrowth.totalUsers > 0
      ? Math.min(100, Math.round(((userGrowth.newUsers30d || 0) / userGrowth.totalUsers) * 100))
      : 0;
  const revenueTotal =
    revenueGrowth && Number(revenueGrowth.thisMonth || 0) + Number(revenueGrowth.lastMonth || 0) > 0
      ? Number(revenueGrowth.thisMonth || 0) + Number(revenueGrowth.lastMonth || 0)
      : 0;
  const revenuePct = revenueTotal > 0 ? Math.round((Number(revenueGrowth?.thisMonth || 0) / revenueTotal) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* ─── Page header ─── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <p className="eyebrow mb-1">Operations</p>
          <h1 className="text-xl font-medium tracking-tight">Admin Overview</h1>
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

      {/* ─── Seed results ─── */}
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

      {/* ─── KPI cards ─── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Users" value={userStats?.totalUsers || 0} icon={<Users className="h-4 w-4" />} />
        <StatCard label="Total Challenges" value={challengeStats?.total || 0} icon={<BarChart3 className="h-4 w-4" />} />
        <StatCard label="Revenue" value={`₦${(paymentStats?.revenue || 0).toLocaleString()}`} icon={<Wallet className="h-4 w-4" />} tone="blue" />
        <StatCard label="Active Challenges" value={challengeStats?.active || 0} icon={<Activity className="h-4 w-4" />} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Funded Accounts" value={challengeStats?.funded || 0} icon={<Award className="h-4 w-4" />} tone="emerald" />
        <StatCard label="Completed Payments" value={paymentStats?.completed || 0} icon={<CheckCircle2 className="h-4 w-4" />} />
        <StatCard label="Total Paid Out" value={`₦${(payoutStats?.totalPaid || 0).toLocaleString()}`} icon={<TrendingUp className="h-4 w-4" />} />
        <StatCard label="Pending Payouts" value={payoutStats?.pending || 0} icon={<Clock className="h-4 w-4" />} tone="amber" />
      </div>

      {/* ─── Weekly violation digest status ─── */}
      <SectionCard
        title="Weekly Violation Digest"
        icon={<Mail className="h-3 w-3" />}
        accent="blue"
        actions={
          <div className="flex items-center gap-2 shrink-0">
            <Button
              size="sm"
              variant="outline"
              className="text-xs"
              onClick={handleSendDigest}
              disabled={sendingDigest}
            >
              {sendingDigest ? (
                <Loader2 className="h-3 w-3 animate-spin mr-1" />
              ) : (
                <Send className="h-3 w-3 mr-1" />
              )}
              {sendingDigest ? "Sending…" : "Send digest now"}
            </Button>
            <Link
              to="/admin/challenges?tab=violations"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              View digest
              <ChevronRight className="h-3 w-3" />
            </Link>
          </div>
        }
      >
        <div className="flex items-center gap-3">
          <div
            className={`h-9 w-9 rounded-full flex items-center justify-center shrink-0 ${
              digestStatus?.lastSentAt
                ? "bg-emerald-500/10 text-emerald-600"
                : "bg-blue-500/10 text-blue-600"
            }`}
          >
            {digestStatus?.lastSentAt ? (
              <CheckCircle className="h-4 w-4" />
            ) : (
              <Mail className="h-4 w-4" />
            )}
          </div>
          <div className="min-w-0">
            <div className="text-xs font-medium">
              {digestStatus === undefined
                ? "Loading…"
                : digestStatus.lastSentAt
                  ? `Last sent ${timeAgo(digestStatus.lastSentAt)}`
                  : "Never sent yet"}
            </div>
            <div className="text-[10px] text-muted-foreground mt-0.5">
              {digestStatus === undefined
                ? "Checking the last digest send…"
                : digestStatus.lastSentAt
                  ? `${new Date(digestStatus.lastSentAt).toLocaleString()} — a recap email goes to every admin every 7 days`
                  : "The first recap fires shortly after the server starts, then every 7 days when violations are detected"}
            </div>
          </div>
        </div>
      </SectionCard>

      {/* ─── Growth snapshot ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {userGrowth && (
          <SectionCard title="User Growth" icon={<Users className="h-3 w-3" />}>
            <div className="flex items-center gap-6 text-xs text-muted-foreground mb-4">
              <span>Total: {userGrowth.totalUsers}</span>
              <span>New (30d): {userGrowth.newUsers30d}</span>
            </div>
            <div className="bar-track">
              <div className="bar-fill" style={{ width: `${userGrowthPct}%` }} />
            </div>
            <p className="text-[10px] text-muted-foreground mt-1.5">
              {userGrowthPct}% of your user base joined in the last 30 days
            </p>
          </SectionCard>
        )}
        {revenueGrowth && (
          <SectionCard title="Revenue Growth" icon={<TrendingUp className="h-3 w-3" />}>
            <div className="flex items-center gap-6 text-xs text-muted-foreground mb-4">
              <span>This Month: ₦{(revenueGrowth.thisMonth || 0).toLocaleString()}</span>
              <span>Last Month: ₦{(revenueGrowth.lastMonth || 0).toLocaleString()}</span>
            </div>
            <div className="bar-track">
              <div className="bar-fill" style={{ width: `${revenuePct}%` }} />
            </div>
            <p className="text-[10px] text-muted-foreground mt-1.5">
              {revenuePct}% of the two-month total was earned this month
            </p>
          </SectionCard>
        )}
      </div>

      {/* ─── Recent violations ─── */}
      <SectionCard
        title="Recent Violations"
        icon={<AlertTriangle className="h-3 w-3" />}
        accent="amber"
        actions={
          <Link
            to="/admin/challenges?tab=violations"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            View all
            <ChevronRight className="h-3 w-3" />
          </Link>
        }
      >
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
      </SectionCard>
    </div>
  );
}
