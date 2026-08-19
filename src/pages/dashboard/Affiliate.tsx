/* eslint-disable @typescript-eslint/no-explicit-any */
import { useApiQuery, useApiMutation } from "@/hooks/use-api";
import { useEffect, useState, useMemo } from "react";
import { useResetOnChange } from "@/hooks/use-reset-on-change";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Loader2, Copy, Users, TrendingUp, DollarSign, Link2, ExternalLink, ArrowUpRight, Clock, CheckCircle, XCircle, Banknote, ArrowUp, ArrowDown, ArrowUpDown, Award, Zap, Target } from "lucide-react";
import { toast } from "sonner";
import { cn, formatMoney, formatRelativeTime } from "@/lib/utils";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface PayoutsResponse {
  payouts: any[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  stats: { total: number; byStatus: Record<string, number> };
}

interface ReferralsResponse {
  referrals: any[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  stats: { total: number; byStatus: Record<string, number> };
}

// Affiliate tiers based on total commissions earned
const TIERS = [
  { name: "Starter", min: 0, max: 50000, color: "bg-secondary", icon: Users, rate: "10%" },
  { name: "Silver", min: 50000, max: 200000, color: "bg-slate-300 dark:bg-slate-500", icon: Award, rate: "12%" },
  { name: "Gold", min: 200000, max: 500000, color: "bg-yellow-400 dark:bg-yellow-500", icon: Zap, rate: "15%" },
  { name: "Platinum", min: 500000, max: Infinity, color: "bg-violet-500", icon: Target, rate: "20%" },
];

function getCurrentTier(commissions: number) {
  for (let i = TIERS.length - 1; i >= 0; i--) {
    if (commissions >= TIERS[i].min) return { tier: TIERS[i], index: i };
  }
  return { tier: TIERS[0], index: 0 };
}

export default function Affiliate() {
  const { user } = useAuth();
  const { data: affiliate, isLoading } = useApiQuery<any>(["affiliate", "my"], "/api/affiliates/my");
  const { data: payoutStats } = useApiQuery<any>(["affiliate", "payout-stats"], "/api/affiliates/payouts/stats");
  const generateCode = useApiMutation<any, any>("post", "/api/users/referral-code");
  const requestPayout = useApiMutation<any, any>("post", "/api/affiliates/payout-request");

  const [showPayoutDialog, setShowPayoutDialog] = useState(false);
  const [payoutAmount, setPayoutAmount] = useState("");
  const [payoutMethod, setPayoutMethod] = useState("bank_transfer");
  const [payoutDetails, setPayoutDetails] = useState("");
  const [pPage, setPPage] = useState(1);
  const [pPageSize, setPPageSize] = useState(10);
  const [rPage, setRPage] = useState(1);
  const [rPageSize, setRPageSize] = useState(10);

  // Referrals sorting
  const [rSortBy, setRSortBy] = useState("createdAt");
  const [rSortOrder, setRSortOrder] = useState<"asc" | "desc">("desc");
  const REFERRAL_SORT_COLUMNS: Array<{ key: string; label: string }> = [
    { key: "name", label: "Name" },
    { key: "status", label: "Status" },
    { key: "commissionEarned", label: "Commission" },
    { key: "createdAt", label: "Referred" },
  ];
  const handleReferralSort = (key: string) => {
    if (rSortBy === key) {
      setRSortOrder((o) => (o === "asc" ? "desc" : "asc"));
    } else {
      setRSortBy(key);
      setRSortOrder("desc");
    }
    setRPage(1);
  };
  const referralSortHeader = (sortKey: string, label: string) => {
    const active = rSortBy === sortKey;
    return (
      <button
        key={sortKey}
        type="button"
        onClick={() => handleReferralSort(sortKey)}
        aria-label={`Sort by ${label}`}
        aria-pressed={active}
        className={`inline-flex items-center gap-1 font-medium transition-colors rounded px-1 py-0.5 -mx-1 ${
          active ? "text-foreground" : "text-muted-foreground hover:text-foreground"
        }`}
      >
        {label}
        {active ? (
          rSortOrder === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
        ) : (
          <ArrowUpDown className="h-3 w-3 opacity-50" />
        )}
      </button>
    );
  };

  // Auto-generate code on mount
  useEffect(() => {
    if (!isLoading && user && !affiliate) {
      generateCode.mutate({}, {
        onSuccess: () => {
          toast.success("Referral code generated!");
        },
      });
    }
  }, [isLoading, user, affiliate, generateCode]);

  // Payout history
  const pParams = new URLSearchParams();
  pParams.set("page", String(pPage));
  pParams.set("pageSize", String(pPageSize));
  const pQuery = `/api/affiliates/payouts?${pParams.toString()}`;
  const { data: payoutsData, isLoading: pLoading } = useApiQuery<PayoutsResponse>(["affiliate", "payouts", pQuery], pQuery);

  // Referrals list
  const rParams = new URLSearchParams();
  rParams.set("page", String(rPage));
  rParams.set("pageSize", String(rPageSize));
  rParams.set("sortBy", rSortBy);
  rParams.set("sortOrder", rSortOrder);
  const rQuery = `/api/affiliates/referrals?${rParams.toString()}`;
  const { data: referralsData, isLoading: rLoading } = useApiQuery<ReferralsResponse>(["affiliate", "referrals", rQuery], rQuery);

  const referrals = referralsData?.referrals || [];
  const rTotal = referralsData?.total || 0;
  const rTotalPages = referralsData?.totalPages || 1;

  const payouts = payoutsData?.payouts || [];
  const pTotal = payoutsData?.total || 0;
  const pTotalPages = payoutsData?.totalPages || 1;

  useResetOnChange([pPageSize], () => { setPPage(1); });
  useResetOnChange([pTotalPages, pPage], () => setPPage(1), pPage > pTotalPages && pTotalPages > 0);
  useResetOnChange([rPageSize, rSortBy, rSortOrder], () => { setRPage(1); });
  useResetOnChange([rTotalPages, rPage], () => setRPage(1), rPage > rTotalPages && rTotalPages > 0);

  const pFrom = pTotal === 0 ? 0 : (pPage - 1) * pPageSize + 1;
  const pTo = Math.min(pPage * pPageSize, pTotal);
  const rFrom = rTotal === 0 ? 0 : (rPage - 1) * rPageSize + 1;
  const rTo = Math.min(rPage * rPageSize, rTotal);

  // Build commission chart data from referral commissionEarned fields
  const commissionChartData = useMemo(() => {
    if (!referrals || referrals.length === 0) return [];
    // Group by month and sum commissions
    const monthlyData: Record<string, number> = {};
    referrals.forEach((ref: any) => {
      if (ref.commissionEarned && ref.createdAt) {
        const date = new Date(ref.createdAt);
        const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
        monthlyData[monthKey] = (monthlyData[monthKey] || 0) + ref.commissionEarned;
      }
    });
    // Convert to sorted array and compute cumulative
    const sorted = Object.entries(monthlyData)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, amount]) => {
        const [y, m] = month.split("-");
        const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        return {
          month: `${monthNames[parseInt(m, 10) - 1]} ${y}`,
          amount,
          cumulative: 0, // filled below
        };
      });
    let cumulative = 0;
    sorted.forEach((d) => {
      cumulative += d.amount;
      d.cumulative = cumulative;
    });
    return sorted;
  }, [referrals]);

  const totalCommissions = affiliate?.totalCommissions || 0;
  const { tier: currentTier, index: tierIndex } = getCurrentTier(totalCommissions);
  const nextTier = tierIndex < TIERS.length - 1 ? TIERS[tierIndex + 1] : null;
  const tierProgress = nextTier
    ? Math.min(((totalCommissions - currentTier.min) / (nextTier.min - currentTier.min)) * 100, 100)
    : 100;

  if (isLoading || generateCode.isPending) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const referralCode = affiliate?.referralCode || user?.referralCode || "N/A";
  const referralLink = typeof window !== "undefined" ? `${window.location.origin}/auth?ref=${referralCode}` : "";

  const stats = [
    { label: "Total Referrals", value: affiliate?.totalReferrals || 0, icon: Users },
    { label: "Active Referrals", value: affiliate?.activeReferrals || 0, icon: TrendingUp },
    { label: "Total Commissions", value: formatMoney(affiliate?.totalCommissions || 0, "NGN"), icon: DollarSign },
    { label: "Pending Payout", value: formatMoney(affiliate?.pendingCommissions || 0, "NGN"), icon: TrendingUp },
  ];

  const handlePayoutRequest = async () => {
    const amount = parseFloat(payoutAmount);
    if (!amount || amount <= 0) { toast.error("Enter a valid amount"); return; }
    if (amount < 5000) { toast.error("Minimum payout is ₦5,000"); return; }
    if (!payoutDetails.trim()) { toast.error("Enter your payment details (bank name, account number)"); return; }

    try {
      await requestPayout.mutateAsync({
        amount,
        paymentMethod: payoutMethod,
        paymentDetails: payoutDetails,
      });
      toast.success("Payout request submitted!");
      setShowPayoutDialog(false);
      setPayoutAmount("");
      setPayoutDetails("");
    } catch (e: any) {
      toast.error(e.message || "Failed to submit payout request");
    }
  };

  const pendingCommission = affiliate?.pendingCommissions || 0;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Account"
        title="Affiliate Program"
        subtitle="Earn commissions by referring new traders"
      />

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {stats.map((stat) => (
          <div key={stat.label} className="card-subtle p-4">
            <div className="flex items-center gap-2 mb-2">
              <stat.icon className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{stat.label}</span>
            </div>
            <div className="text-lg font-semibold">{stat.value}</div>
          </div>
        ))}
      </div>

      {/* Commission Growth Chart */}
      {commissionChartData.length > 1 && (
        <div className="card-subtle p-6">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-medium">Commission Growth</h2>
          </div>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={commissionChartData}>
                <defs>
                  <linearGradient id="commissionGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--brand))" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="hsl(var(--brand))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="month" tick={{ fontSize: 10 }} className="text-muted-foreground" />
                <YAxis tick={{ fontSize: 10 }} className="text-muted-foreground" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                    fontSize: "12px",
                  }}
                  formatter={(value: number) => [`₦${value.toLocaleString()}`, "Cumulative"]}
                />
                <Area
                  type="monotone"
                  dataKey="cumulative"
                  stroke="hsl(var(--brand))"
                  strokeWidth={2}
                  fill="url(#commissionGradient)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Affiliate Tier */}
      <div className="card-subtle p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <currentTier.icon className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-medium">Your Tier: {currentTier.name}</h2>
          </div>
          <Badge variant="outline" className="text-[10px]">
            {currentTier.rate} commission rate
          </Badge>
        </div>

        {/* Tier Progress */}
        <div className="space-y-3">
          <div className="relative h-2 bg-secondary rounded-full overflow-hidden">
            <div
              className="h-full bg-brand rounded-full transition-all duration-500"
              style={{ width: `${tierProgress}%` }}
            />
          </div>
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>₦{currentTier.min.toLocaleString()}</span>
            {nextTier ? (
              <span>Next: {nextTier.name} at ₦{nextTier.min.toLocaleString()}</span>
            ) : (
              <span>Maximum tier reached</span>
            )}
          </div>
        </div>

        {/* Tier Ladder */}
        <div className="grid grid-cols-4 gap-2 mt-4">
          {TIERS.map((t, i) => {
            const isCurrentOrLower = i <= tierIndex;
            const isCurrent = i === tierIndex;
            return (
              <div
                key={t.name}
                className={cn(
                  "text-center p-2 rounded-lg border transition-all",
                  isCurrent
                    ? "border-brand bg-brand/10 ring-1 ring-brand/20"
                    : isCurrentOrLower
                    ? "border-border bg-secondary/50"
                    : "border-border/50 bg-secondary/20 opacity-50"
                )}
              >
                <t.icon className={cn("h-4 w-4 mx-auto mb-1", isCurrent ? "text-brand" : "text-muted-foreground")} />
                <p className="text-[10px] font-medium">{t.name}</p>
                <p className="text-[9px] text-muted-foreground">{t.rate}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Referral Code Card */}
      <div className="card-subtle p-6">
        <h2 className="text-sm font-medium mb-3 flex items-center gap-2">
          <Link2 className="h-4 w-4" />
          Your Referral Code
        </h2>
        <div className="flex items-center gap-3">
          <div className="flex-1 p-3 bg-secondary rounded-lg font-mono text-sm tracking-wider">
            {referralCode}
          </div>
          <Button
            variant="outline"
            size="sm"
            className="text-xs"
            onClick={() => {
              navigator.clipboard.writeText(referralCode);
              toast.success("Referral code copied!");
            }}
          >
            <Copy className="h-3 w-3 mr-1" /> Copy
          </Button>
        </div>
      </div>

      {/* Referral Link Card */}
      <div className="card-subtle p-6">
        <h2 className="text-sm font-medium mb-3 flex items-center gap-2">
          <ExternalLink className="h-4 w-4" />
          Your Referral Link
        </h2>
        <p className="text-xs text-muted-foreground mb-3">
          Share this link with others. They will be signed up as your referral.
        </p>
        <div className="flex items-center gap-2">
          <Input
            value={referralLink}
            readOnly
            className="text-xs h-9 font-mono bg-secondary"
          />
          <Button
            variant="outline"
            size="sm"
            className="text-xs shrink-0"
            onClick={() => {
              navigator.clipboard.writeText(referralLink);
              toast.success("Referral link copied!");
            }}
          >
            <Copy className="h-3 w-3 mr-1" /> Copy
          </Button>
        </div>
      </div>

      {/* Commission Payout Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium flex items-center gap-2">
            <Banknote className="h-4 w-4" />
            Commission Payouts
          </h2>
          <Button
            size="sm"
            className="text-xs"
            onClick={() => setShowPayoutDialog(true)}
            disabled={pendingCommission < 5000}
          >
            <ArrowUpRight className="h-3 w-3 mr-1" /> Withdraw
          </Button>
        </div>

        {/* Payout Stats */}
        <div className="grid grid-cols-3 gap-3">
          <div className="card-subtle p-3">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Available</div>
            <div className="text-sm font-semibold mt-1">{formatMoney(pendingCommission, "NGN")}</div>
          </div>
          <div className="card-subtle p-3">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Paid Out</div>
            <div className="text-sm font-semibold mt-1">{formatMoney(payoutStats?.paid || 0, "NGN")}</div>
          </div>
          <div className="card-subtle p-3">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Total Requests</div>
            <div className="text-sm font-semibold mt-1">{payoutStats?.totalRequested || 0}</div>
          </div>
        </div>

        {pendingCommission < 5000 && (
          <p className="text-[10px] text-muted-foreground">Minimum withdrawal is ₦5,000. You need {formatMoney(5000 - pendingCommission, "NGN")} more to request a payout.</p>
        )}

        {/* Payout History */}
        {pLoading && payouts.length === 0 ? (
          <div className="flex items-center justify-center py-8"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
        ) : pTotal > 0 ? (
          <div className="space-y-2">
            <h3 className="text-xs font-medium text-muted-foreground">Recent Requests</h3>
            {payouts.map((p: any) => (
              <div key={p.id} className="card-subtle p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-full bg-secondary flex items-center justify-center">
                    {p.status === "paid" ? (
                      <CheckCircle className="h-4 w-4 text-green-500" />
                    ) : p.status === "rejected" ? (
                      <XCircle className="h-4 w-4 text-red-500" />
                    ) : (
                      <Clock className="h-4 w-4 text-amber-500" />
                    )}
                  </div>
                  <div>
                    <div className="text-sm font-medium">{formatMoney(p.amount, "NGN")}</div>
                    <div className="text-[10px] text-muted-foreground">
                      {p.paymentMethod} · {p.requestedAt ? formatRelativeTime(p.requestedAt) : ""}
                    </div>
                  </div>
                </div>
                <Badge
                  variant={
                    p.status === "paid" ? "default"
                    : p.status === "rejected" ? "destructive"
                    : p.status === "approved" ? "secondary"
                    : "outline"
                  }
                  className="text-[10px]"
                >
                  {p.status}
                </Badge>
              </div>
            ))}

            {/* Pagination footer */}
            <div className="flex items-center justify-between pt-1">
              <div className="text-[10px] text-muted-foreground">Showing {pFrom}–{pTo} of {pTotal} payouts</div>
              <div className="flex items-center gap-2">
                <select
                  value={pPageSize}
                  onChange={(e) => setPPageSize(Number(e.target.value))}
                  className="h-7 px-2 rounded-md border border-input bg-background text-[11px] cursor-pointer outline-none"
                  aria-label="Rows per page"
                >
                  {[10, 25, 50].map((n) => <option key={n} value={n}>{n} / page</option>)}
                </select>
                <Button variant="outline" size="sm" className="h-7 px-2.5 text-[11px]" disabled={pPage <= 1} onClick={() => setPPage((p) => p - 1)}>Prev</Button>
                <span className="px-2 text-[11px] font-medium tabular-nums">{pPage} / {pTotalPages}</span>
                <Button variant="outline" size="sm" className="h-7 px-2.5 text-[11px]" disabled={pPage >= pTotalPages} onClick={() => setPPage((p) => p + 1)}>Next</Button>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {/* Referrals Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium flex items-center gap-2">
            <Users className="h-4 w-4" />
            My Referrals
          </h2>
          <span className="text-xs text-muted-foreground">{rTotal} referral{rTotal !== 1 ? "s" : ""}</span>
        </div>

        {rLoading && referrals.length === 0 ? (
          <div className="flex items-center justify-center py-8"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
        ) : rTotal > 0 ? (
          <>
            {/* Sort Toolbar */}
            <div className="card-subtle px-4 py-2 flex items-center gap-1.5 flex-wrap">
              <span className="text-[10px] font-medium text-muted-foreground mr-1">Sort:</span>
              {REFERRAL_SORT_COLUMNS.map((c) => referralSortHeader(c.key, c.label))}
            </div>

            <div className="space-y-2">
              {referrals.map((ref: any) => (
                <div key={ref.id} className="card-subtle p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="h-8 w-8 rounded-full bg-secondary flex items-center justify-center shrink-0">
                      {ref.status === "converted" ? (
                        <CheckCircle className="h-4 w-4 text-green-500" />
                      ) : ref.status === "pending" ? (
                        <Clock className="h-4 w-4 text-amber-500" />
                      ) : (
                        <Users className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{ref.referredName || "New Trader"}</div>
                      <div className="text-[10px] text-muted-foreground">
                        {ref.referredEmail || ""} · {ref.createdAt ? formatRelativeTime(ref.createdAt) : ""}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    {ref.commissionEarned ? (
                      <span className="text-sm font-medium tabular-nums">{formatMoney(ref.commissionEarned, "NGN")}</span>
                    ) : null}
                    <Badge
                      variant={ref.status === "converted" ? "default" : ref.status === "pending" ? "secondary" : "outline"}
                      className="text-[10px]"
                    >
                      {ref.status}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>

            {/* Pagination footer */}
            <div className="flex items-center justify-between pt-1">
              <div className="text-[10px] text-muted-foreground">Showing {rFrom}–{rTo} of {rTotal} referrals</div>
              <div className="flex items-center gap-2">
                <select
                  value={rPageSize}
                  onChange={(e) => setRPageSize(Number(e.target.value))}
                  className="h-7 px-2 rounded-md border border-input bg-background text-[11px] cursor-pointer outline-none"
                  aria-label="Rows per page"
                >
                  {[10, 25, 50].map((n) => <option key={n} value={n}>{n} / page</option>)}
                </select>
                <Button variant="outline" size="sm" className="h-7 px-2.5 text-[11px]" disabled={rPage <= 1} onClick={() => setRPage((p) => p - 1)}>Prev</Button>
                <span className="px-2 text-[11px] font-medium tabular-nums">{rPage} / {rTotalPages}</span>
                <Button variant="outline" size="sm" className="h-7 px-2.5 text-[11px]" disabled={rPage >= rTotalPages} onClick={() => setRPage((p) => p + 1)}>Next</Button>
              </div>
            </div>
          </>
        ) : null}
      </div>

      {/* How It Works */}
      <div className="card-subtle p-6">
        <h2 className="text-sm font-medium mb-4">How It Works</h2>
        <div className="space-y-3">
          {[
            { step: 1, text: "Share your referral link or code with friends" },
            { step: 2, text: "They sign up using your link and purchase a challenge" },
            { step: 3, text: "You earn commission on their first purchase (up to 20% at Platinum tier)" },
            { step: 4, text: "Withdraw your earnings once you reach ₦5,000" },
          ].map((item) => (
            <div key={item.step} className="flex items-start gap-3">
              <div className="h-5 w-5 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[10px] font-semibold shrink-0 mt-0.5">
                {item.step}
              </div>
              <span className="text-xs text-muted-foreground">{item.text}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Payout Request Dialog */}
      <Dialog open={showPayoutDialog} onOpenChange={setShowPayoutDialog}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base font-medium">Request Commission Payout</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Available balance: {formatMoney(pendingCommission, "NGN")}. Minimum withdrawal: ₦5,000.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Amount (NGN)</label>
              <Input
                type="number"
                value={payoutAmount}
                onChange={(e) => setPayoutAmount(e.target.value)}
                placeholder="Enter amount"
                className="text-xs h-9"
                min={5000}
                max={pendingCommission}
              />
              <div className="flex justify-between mt-1">
                <span className="text-[10px] text-muted-foreground">Min: ₦5,000</span>
                <button
                  className="text-[10px] text-primary hover:underline"
                  onClick={() => setPayoutAmount(String(pendingCommission))}
                >
                  Max: {formatMoney(pendingCommission, "NGN")}
                </button>
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Payment Method</label>
              <select
                value={payoutMethod}
                onChange={(e) => setPayoutMethod(e.target.value)}
                className="w-full h-9 rounded-md border border-input bg-background px-3 text-xs"
              >
                <option value="bank_transfer">Bank Transfer</option>
                <option value="mobile_money">Mobile Money</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Payment Details</label>
              <Input
                value={payoutDetails}
                onChange={(e) => setPayoutDetails(e.target.value)}
                placeholder="Bank name, account name, account number"
                className="text-xs h-9"
              />
            </div>
            <Button
              className="w-full text-xs"
              size="sm"
              onClick={handlePayoutRequest}
              disabled={requestPayout.isPending || !payoutAmount || !payoutDetails.trim()}
            >
              {requestPayout.isPending ? (
                <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> Processing...</>
              ) : (
                "Submit Request"
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
