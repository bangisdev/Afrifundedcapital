/* eslint-disable @typescript-eslint/no-explicit-any */
import { useApiQuery, useApiMutation } from "@/hooks/use-api";
import { useEffect, useState } from "react";
import { useResetOnChange } from "@/hooks/use-reset-on-change";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Loader2, Copy, Users, TrendingUp, DollarSign, Link2, ExternalLink, ArrowUpRight, Clock, CheckCircle, XCircle, Banknote, ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";
import { toast } from "sonner";

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

  // Referrals sorting (whitelisted columns on the server: id, name, status, commissionEarned, createdAt, convertedAt)
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

  // Auto-generate code on mount if user has no affiliate record
  useEffect(() => {
    if (!isLoading && user && !affiliate) {
      generateCode.mutate({}, {
        onSuccess: () => {
          toast.success("Referral code generated!");
        },
      });
    }
  }, [isLoading, user, affiliate, generateCode]);

  // Payout history (server-driven pagination)
  const pParams = new URLSearchParams();
  pParams.set("page", String(pPage));
  pParams.set("pageSize", String(pPageSize));
  const pQuery = `/api/affiliates/payouts?${pParams.toString()}`;

  const { data: payoutsData, isLoading: pLoading } = useApiQuery<PayoutsResponse>(["affiliate", "payouts", pQuery], pQuery);

  // Referrals list (server-driven pagination + sorting)
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

  // Reset to first page whenever page size or sort changes
  useResetOnChange([pPageSize], () => {
    setPPage(1);
  });

  // Clamp page if the current page exceeds total pages
  useResetOnChange([pTotalPages, pPage], () => setPPage(1), pPage > pTotalPages && pTotalPages > 0);

  // Reset referrals page whenever page size or sort changes
  useResetOnChange([rPageSize, rSortBy, rSortOrder], () => {
    setRPage(1);
  });

  // Clamp referrals page if the current page exceeds total pages
  useResetOnChange([rTotalPages, rPage], () => setRPage(1), rPage > rTotalPages && rTotalPages > 0);

  const pFrom = pTotal === 0 ? 0 : (pPage - 1) * pPageSize + 1;
  const pTo = Math.min(pPage * pPageSize, pTotal);
  const rFrom = rTotal === 0 ? 0 : (rPage - 1) * rPageSize + 1;
  const rTo = Math.min(rPage * rPageSize, rTotal);

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
    { label: "Active Referrals", value: affiliate?.activeReferrals || 0, icon: Users },
    { label: "Total Commissions", value: `₦${(affiliate?.totalCommissions || 0).toLocaleString()}`, icon: DollarSign },
    { label: "Pending Payout", value: `₦${(affiliate?.pendingCommissions || 0).toLocaleString()}`, icon: TrendingUp },
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
      <div>
        <h1 className="text-lg font-medium tracking-tight">Affiliate Program</h1>
        <p className="text-xs text-muted-foreground mt-1">Earn commissions by referring new traders</p>
      </div>

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
            <div className="text-sm font-semibold mt-1">₦{pendingCommission.toLocaleString()}</div>
          </div>
          <div className="card-subtle p-3">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Paid Out</div>
            <div className="text-sm font-semibold mt-1">₦{(payoutStats?.paid || 0).toLocaleString()}</div>
          </div>
          <div className="card-subtle p-3">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Total Requests</div>
            <div className="text-sm font-semibold mt-1">{payoutStats?.totalRequested || 0}</div>
          </div>
        </div>

        {pendingCommission < 5000 && (
          <p className="text-[10px] text-muted-foreground">Minimum withdrawal is ₦5,000. You need ₦{(5000 - pendingCommission).toLocaleString()} more to request a payout.</p>
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
                    <div className="text-sm font-medium">₦{p.amount.toLocaleString()}</div>
                    <div className="text-[10px] text-muted-foreground">
                      {p.paymentMethod} · {p.requestedAt ? new Date(p.requestedAt).toLocaleDateString() : ""}
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
                        {ref.referredEmail || ""} · {ref.createdAt ? new Date(ref.createdAt).toLocaleDateString() : ""}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    {ref.commissionEarned ? (
                      <span className="text-sm font-medium tabular-nums">₦{ref.commissionEarned.toLocaleString()}</span>
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
            { step: 3, text: "You earn commission on their first purchase (10%)" },
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
              Available balance: ₦{pendingCommission.toLocaleString()}. Minimum withdrawal: ₦5,000.
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
                  Max: ₦{pendingCommission.toLocaleString()}
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
