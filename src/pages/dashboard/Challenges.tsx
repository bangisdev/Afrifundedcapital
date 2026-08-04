/* eslint-disable @typescript-eslint/no-explicit-any */
import { useApiQuery, useApiMutation } from "@/hooks/use-api";
import { useState } from "react";
import { useResetOnChange } from "@/hooks/use-reset-on-change";
import { useAuth } from "@/hooks/use-auth";
import { useFlutterwavePayment } from "@/hooks/use-flutterwave";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs";
import { useNavigate } from "react-router";
import { Loader2, CheckCircle, XCircle, ChevronRight, ChevronLeft, ArrowUp, ArrowDown, ArrowUpDown, Gift } from "lucide-react";
import { toast } from "sonner";

type Doc = Record<string, any>;

interface ChallengesResponse {
  challenges: any[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  stats: { total: number; byStatus: Record<string, number> };
}

interface MyCouponsResponse {
  coupons: any[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  stats: { total: number; totalDiscount: number };
}

const PAGE_SIZES = [5, 10, 25];

export default function Challenges() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { data: templates, isLoading: templatesLoading } = useApiQuery<any[]>(["templates"], "/api/challenges/templates");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Sorting (whitelisted columns on the server: id, status, accountSize, amountPaid, currentPhase, createdAt)
  const [sortBy, setSortBy] = useState("createdAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const SORT_COLUMNS: Array<{ key: string; label: string }> = [
    { key: "id", label: "ID" },
    { key: "accountSize", label: "Account Size" },
    { key: "amountPaid", label: "Amount Paid" },
    { key: "status", label: "Status" },
    { key: "createdAt", label: "Created" },
  ];
  const handleSort = (key: string) => {
    if (sortBy === key) {
      setSortOrder((o) => (o === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(key);
      setSortOrder("desc");
    }
    setPage(1);
  };
  const sortHeader = (sortKey: string, label: string) => {
    const active = sortBy === sortKey;
    return (
      <button
        key={sortKey}
        type="button"
        onClick={() => handleSort(sortKey)}
        aria-label={`Sort by ${label}`}
        aria-pressed={active}
        className={`inline-flex items-center gap-1 font-medium transition-colors rounded px-1 py-0.5 -mx-1 ${
          active ? "text-foreground" : "text-muted-foreground hover:text-foreground"
        }`}
      >
        {label}
        {active ? (
          sortOrder === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
        ) : (
          <ArrowUpDown className="h-3 w-3 opacity-50" />
        )}
      </button>
    );
  };

  const params = new URLSearchParams();
  params.set("page", String(page));
  params.set("pageSize", String(pageSize));
  params.set("sortBy", sortBy);
  params.set("sortOrder", sortOrder);
  const listQuery = `/api/challenges/my?${params.toString()}`;
  const { data: myData, isLoading: myLoading } = useApiQuery<ChallengesResponse>(["challenges", "my", listQuery], listQuery);
  const myChallenges = myData?.challenges || [];
  const myTotal = myData?.total || 0;
  const myTotalPages = myData?.totalPages || 1;

  // Clamp page if the current page exceeds total pages (e.g. after data changes)
  useResetOnChange([myTotalPages, page], () => setPage(1), page > myTotalPages);

  // My Coupons (server-driven pagination + sorting)
  const [cPage, setCPage] = useState(1);
  const [cPageSize, setCPageSize] = useState(10);
  // Sorting (whitelisted columns on the server: id, code, discountAmount, originalAmount, redeemedAt)
  const [cSortBy, setCSortBy] = useState("redeemedAt");
  const [cSortOrder, setCSortOrder] = useState<"asc" | "desc">("desc");
  const COUPON_SORT_COLUMNS: Array<{ key: string; label: string }> = [
    { key: "code", label: "Code" },
    { key: "discountAmount", label: "Discount" },
    { key: "redeemedAt", label: "Redeemed" },
  ];
  const handleCouponSort = (key: string) => {
    if (cSortBy === key) {
      setCSortOrder((o) => (o === "asc" ? "desc" : "asc"));
    } else {
      setCSortBy(key);
      setCSortOrder("desc");
    }
    setCPage(1);
  };
  const couponSortHeader = (sortKey: string, label: string) => {
    const active = cSortBy === sortKey;
    return (
      <button
        key={sortKey}
        type="button"
        onClick={() => handleCouponSort(sortKey)}
        aria-label={`Sort by ${label}`}
        aria-pressed={active}
        className={`inline-flex items-center gap-1 font-medium transition-colors rounded px-1 py-0.5 -mx-1 ${
          active ? "text-foreground" : "text-muted-foreground hover:text-foreground"
        }`}
      >
        {label}
        {active ? (
          cSortOrder === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
        ) : (
          <ArrowUpDown className="h-3 w-3 opacity-50" />
        )}
      </button>
    );
  };

  const cParams = new URLSearchParams();
  cParams.set("page", String(cPage));
  cParams.set("pageSize", String(cPageSize));
  cParams.set("sortBy", cSortBy);
  cParams.set("sortOrder", cSortOrder);
  const cQuery = `/api/coupons/my?${cParams.toString()}`;
  const { data: couponsData, isLoading: couponsLoading } = useApiQuery<MyCouponsResponse>(["coupons", "my", cQuery], cQuery);
  const myCoupons = couponsData?.coupons || [];
  const cTotal = couponsData?.total || 0;
  const cTotalPages = couponsData?.totalPages || 1;

  // Reset coupons page whenever page size or sort changes
  useResetOnChange([cPageSize, cSortBy, cSortOrder], () => {
    setCPage(1);
  });

  // Clamp coupons page if the current page exceeds total pages
  useResetOnChange([cTotalPages, cPage], () => setCPage(1), cPage > cTotalPages && cTotalPages > 0);

  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [selectedSize, setSelectedSize] = useState<string | null>(null);
  const [couponCode, setCouponCode] = useState("");
  const [couponResult, setCouponResult] = useState<any>(null);
  const [couponError, setCouponError] = useState("");
  const [validatingCoupon, setValidatingCoupon] = useState(false);
  const [showPurchase, setShowPurchase] = useState(false);

  const isAdmin = user?.role === "super_admin" || user?.role === "support_admin" || user?.role === "finance_admin";
  const demoPurchase = useApiMutation<any, any>("post", "/api/challenges/demo-purchase");

  const { state: paymentState, startCheckout, reset: resetPayment } = useFlutterwavePayment();

  const { data: sizes } = useApiQuery<any[]>(
    ["sizes", selectedTemplate || "none"],
    `/api/challenges/templates/${selectedTemplate || 0}/sizes`,
    { enabled: !!selectedTemplate },
  );

  const isLoading = templatesLoading || myLoading;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const statusBadge = (status: string) => {
    const variants: Record<string, { label: string; className: string }> = {
      active: { label: "Active", className: "bg-foreground text-background" },
      pending: { label: "Pending", className: "bg-secondary text-secondary-foreground" },
      phase_1_passed: { label: "Phase 1 Passed", className: "bg-foreground text-background" },
      phase_2_passed: { label: "Phase 2 Passed", className: "bg-foreground text-background" },
      funded: { label: "Funded", className: "bg-foreground text-background" },
      violated: { label: "Violated", className: "bg-destructive/10 text-destructive" },
      expired: { label: "Expired", className: "bg-secondary text-secondary-foreground" },
    };
    const v = variants[status] || { label: status, className: "bg-secondary text-secondary-foreground" };
    return <span className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded ${v.className}`}>{v.label}</span>;
  };

  const handleApplyCoupon = async () => {
    if (!couponCode.trim()) {
      setCouponError("");
      setCouponResult(null);
      return;
    }
    const selectedAccountSize = sizes?.find((s: Doc) => String(s.id) === selectedSize);
    if (!selectedAccountSize) {
      setCouponError("Select an account size first");
      return;
    }
    setValidatingCoupon(true);
    setCouponError("");
    setCouponResult(null);
    try {
      const res = await fetch("/api/coupons/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ code: couponCode.trim(), amount: selectedAccountSize.price }),
      });
      const data = await res.json();
      if (data.valid) {
        setCouponResult(data);
        toast.success(`Coupon applied! You save ₦${data.discount?.toLocaleString()}`);
      } else {
        setCouponError(data.error || "Invalid coupon");
        setCouponResult(null);
      }
    } catch {
      setCouponError("Failed to validate coupon");
    } finally {
      setValidatingCoupon(false);
    }
  };

  const handleRemoveCoupon = () => {
    setCouponCode("");
    setCouponResult(null);
    setCouponError("");
  };

  const handleProceedToPayment = async () => {
    if (!selectedTemplate || !selectedSize || !user?.email) {
      toast.error("Please select a challenge and account size");
      return;
    }

    const selectedAccountSize = sizes?.find((s: Doc) => String(s.id) === selectedSize);
    if (!selectedAccountSize) {
      toast.error("Selected account size not found");
      return;
    }

    const finalAmount = couponResult?.finalAmount ?? selectedAccountSize.price;

    await startCheckout({
      amount: finalAmount,
      originalAmount: selectedAccountSize.price,
      currency: "NGN",
      email: user.email,
      name: user.name || "Trader",
      phoneNumber: user.phone || "",
      templateId: selectedTemplate as any,
      accountSizeId: selectedSize as any,
      couponCode: couponResult?.valid ? couponCode.trim() : undefined,
      couponId: couponResult?.couponId,
      description: `${selectedAccountSize.label} Challenge`,
    });
  };

  const getPaymentButtonContent = () => {
    switch (paymentState.status) {
      case "initiating":
        return <div className="flex items-center justify-center gap-2"><Loader2 className="h-3 w-3 animate-spin" /><span>Preparing payment...</span></div>;
      case "verifying":
        return <div className="flex items-center justify-center gap-2"><Loader2 className="h-3 w-3 animate-spin" /><span>Verifying payment...</span></div>;
      case "success":
        return <div className="flex items-center justify-center gap-2 text-emerald-600 dark:text-emerald-400"><CheckCircle className="h-3 w-3" /><span>Challenge Created!</span></div>;
      case "error":
        return "Try Again";
      default:
        return "Proceed to Payment";
    }
  };

  const handleDialogClose = (open: boolean) => {
    if (!open) {
      if (paymentState.status === "success") resetPayment();
      setShowPurchase(false);
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-lg font-medium tracking-tight">Challenges</h1>
        <p className="text-xs text-muted-foreground mt-1">
          Browse challenge types and start your funding journey
        </p>
      </div>

      <Tabs defaultValue="browse" className="space-y-6">
        <TabsList className="border border-border bg-transparent p-0.5">
          <TabsTrigger value="browse" className="text-xs data-[state=active]:bg-secondary">Browse</TabsTrigger>
          <TabsTrigger value="my-challenges" className="text-xs data-[state=active]:bg-secondary">My Challenges</TabsTrigger>
        </TabsList>

        <TabsContent value="browse" className="space-y-6">
          <div className="grid md:grid-cols-3 gap-4">
            {(templates || []).map((template: Doc) => (
              <div
                key={template.id}
                className={`card-subtle p-6 cursor-pointer transition-all hover:bg-secondary/30 ${
                  selectedTemplate === String(template.id) ? "ring-1 ring-foreground" : ""
                }`}
                onClick={() => { setSelectedTemplate(String(template.id)); setSelectedSize(null); }}
              >
                <h3 className="text-sm font-medium mb-1">{template.name}</h3>
                <p className="text-xs text-muted-foreground mb-4">{template.description}</p>
                <div className="space-y-1.5 text-xs text-muted-foreground">
                  <div className="flex justify-between"><span>Profit Target</span><span className="text-foreground">{template.profitTarget}%</span></div>
                  <div className="flex justify-between"><span>Max Drawdown</span><span className="text-foreground">{template.maxDrawdown}%</span></div>
                  <div className="flex justify-between"><span>Daily Drawdown</span><span className="text-foreground">{template.dailyDrawdown}%</span></div>
                  <div className="flex justify-between"><span>Min Trading Days</span><span className="text-foreground">{template.minTradingDays}</span></div>
                  <div className="flex justify-between"><span>Duration</span><span className="text-foreground">{template.durationDays ? `${template.durationDays} days` : "Unlimited"}</span></div>
                </div>
                <Button variant="outline" size="sm" className="w-full mt-4 text-xs"
                  disabled={paymentState.status === "initiating" || paymentState.status === "verifying"}
                  onClick={(e) => { e.stopPropagation(); setSelectedTemplate(String(template.id)); setShowPurchase(true); }}
                >
                  Select
                </Button>
              </div>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="my-challenges" className="space-y-3">
          {myChallenges.length === 0 ? (
            <div className="card-subtle p-8 text-center">
              <p className="text-sm text-muted-foreground">No challenges yet. Start your journey!</p>
            </div>
          ) : (
            <>
              {/* Sort Toolbar */}
              <div className="card-subtle px-4 py-2 flex items-center gap-1.5 flex-wrap">
                <span className="text-[10px] font-medium text-muted-foreground mr-1">Sort:</span>
                {SORT_COLUMNS.map((c) => sortHeader(c.key, c.label))}
                <span className="ml-auto text-[10px] text-muted-foreground">
                  {myTotal} challenge{myTotal !== 1 ? 's' : ''}
                </span>
              </div>

              {myChallenges.map((ch: Doc) => (
                <button
                  key={ch.id}
                  onClick={() => navigate(`/dashboard/challenges/${ch.id}`)}
                  className="w-full card-subtle p-4 text-left hover:bg-secondary/30 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-medium">Challenge #{ch.id}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        ${ch.accountSize?.toLocaleString()} — Started {ch.createdAt ? new Date(ch.createdAt).toLocaleDateString() : "N/A"}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {statusBadge(ch.status)}
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </div>
                </button>
              ))}

              {/* Pagination Footer */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-muted-foreground pt-1">
                <div>Showing {myChallenges.length} of {myTotal} challenges · Page {page} of {myTotalPages}</div>
                <div className="flex items-center gap-2">
                  <select
                    value={pageSize}
                    onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
                    className="h-8 rounded-md border border-input bg-background px-2 text-xs appearance-none cursor-pointer"
                    aria-label="Rows per page"
                  >
                    {PAGE_SIZES.map((n) => (
                      <option key={n} value={n}>{n} / page</option>
                    ))}
                  </select>
                  <div className="flex items-center gap-1">
                    <Button variant="outline" size="sm" className="h-8 px-2.5 text-xs" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                      <ChevronLeft className="h-3.5 w-3.5" /> Prev
                    </Button>
                    <span className="px-2 font-medium tabular-nums">{page} / {myTotalPages}</span>
                    <Button variant="outline" size="sm" className="h-8 px-2.5 text-xs" disabled={page >= myTotalPages} onClick={() => setPage((p) => p + 1)}>
                      Next <ChevronRight className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* My Coupons Section */}
          <div className="space-y-4 pt-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium flex items-center gap-2">
                <Gift className="h-4 w-4" />
                My Coupons
              </h2>
              <span className="text-xs text-muted-foreground">{cTotal} coupon{cTotal !== 1 ? "s" : ""}</span>
            </div>

            {couponsLoading && myCoupons.length === 0 ? (
              <div className="flex items-center justify-center py-8"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
            ) : cTotal > 0 ? (
              <>
                {/* Sort Toolbar */}
                <div className="card-subtle px-4 py-2 flex items-center gap-1.5 flex-wrap">
                  <span className="text-[10px] font-medium text-muted-foreground mr-1">Sort:</span>
                  {COUPON_SORT_COLUMNS.map((c) => couponSortHeader(c.key, c.label))}
                </div>

                <div className="space-y-2">
                  {myCoupons.map((cp: any) => (
                    <div key={cp.id} className="card-subtle p-4 flex items-center justify-between">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="h-8 w-8 rounded-full bg-secondary flex items-center justify-center shrink-0">
                          <Gift className="h-4 w-4 text-muted-foreground" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-medium font-mono tracking-wider">{cp.code || `#${cp.id}`}</div>
                          <div className="text-[10px] text-muted-foreground">
                            Redeemed {cp.redeemedAt ? new Date(cp.redeemedAt).toLocaleDateString() : ""}
                          </div>
                        </div>
                      </div>
                      <span className="text-sm font-medium tabular-nums shrink-0 ml-4">
                        {cp.discountAmount ? `-₦${cp.discountAmount.toLocaleString()}` : "—"}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Pagination footer */}
                <div className="flex items-center justify-between pt-1">
                  <div className="text-[10px] text-muted-foreground">Showing {cTotal === 0 ? 0 : (cPage - 1) * cPageSize + 1}–{Math.min(cPage * cPageSize, cTotal)} of {cTotal} coupons</div>
                  <div className="flex items-center gap-2">
                    <select
                      value={cPageSize}
                      onChange={(e) => setCPageSize(Number(e.target.value))}
                      className="h-7 px-2 rounded-md border border-input bg-background text-[11px] cursor-pointer outline-none"
                      aria-label="Rows per page"
                    >
                      {[10, 25, 50].map((n) => <option key={n} value={n}>{n} / page</option>)}
                    </select>
                    <Button variant="outline" size="sm" className="h-7 px-2.5 text-[11px]" disabled={cPage <= 1} onClick={() => setCPage((p) => p - 1)}>Prev</Button>
                    <span className="px-2 text-[11px] font-medium tabular-nums">{cPage} / {cTotalPages}</span>
                    <Button variant="outline" size="sm" className="h-7 px-2.5 text-[11px]" disabled={cPage >= cTotalPages} onClick={() => setCPage((p) => p + 1)}>Next</Button>
                  </div>
                </div>
              </>
            ) : (
              <div className="card-subtle p-6 text-center">
                <Gift className="h-6 w-6 mx-auto mb-2 text-muted-foreground" />
                <p className="text-xs text-muted-foreground">No coupons used yet. Apply a coupon code at checkout to save.</p>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* Purchase Dialog */}
      <Dialog open={showPurchase} onOpenChange={handleDialogClose}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-medium">
              {paymentState.status === "success" ? "Payment Successful!" : "Purchase Challenge"}
            </DialogTitle>
            <DialogDescription className="text-xs">
              {paymentState.status === "success"
                ? "Your challenge has been created. Happy trading!"
                : "Select your account size and apply any coupon codes"}
            </DialogDescription>
          </DialogHeader>

          {paymentState.status === "success" ? (
            <div className="space-y-4 py-4">
              <div className="flex flex-col items-center gap-3 text-center">
                <div className="h-12 w-12 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                  <CheckCircle className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div>
                  <p className="text-sm font-medium">Challenge Created</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Reference: {paymentState.reference?.slice(0, 16)}...
                  </p>
                </div>
              </div>
              <Button className="w-full text-xs" size="sm" onClick={() => { resetPayment(); setShowPurchase(false); }}>
                View My Challenges
              </Button>
            </div>
          ) : paymentState.status === "error" ? (
            <div className="space-y-4 py-4">
              <div className="flex flex-col items-center gap-3 text-center">
                <div className="h-12 w-12 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                  <XCircle className="h-6 w-6 text-red-600 dark:text-red-400" />
                </div>
                <div>
                  <p className="text-sm font-medium">Payment Failed</p>
                  <p className="text-xs text-muted-foreground mt-1">{paymentState.message || "Something went wrong. Please try again."}</p>
                </div>
              </div>
              <Button variant="outline" className="w-full text-xs" size="sm" onClick={() => resetPayment()}>Try Again</Button>
            </div>
          ) : selectedTemplate && sizes ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2">
                {sizes.map((size: Doc) => (
                  <button key={size.id}
                    className={`p-3 border rounded-lg text-left transition-colors ${String(size.id) === selectedSize ? "border-foreground bg-secondary" : "border-border hover:bg-secondary/30"}`}
                    onClick={() => setSelectedSize(String(size.id))}
                    disabled={paymentState.status === "initiating" || paymentState.status === "verifying"}
                  >
                    <div className="text-sm font-medium">{size.label}</div>
                    <div className="text-xs text-muted-foreground mt-1">{size.currency} {size.price?.toLocaleString()}</div>
                  </button>
                ))}
              </div>

              <div>
                <label className="text-xs text-muted-foreground block mb-1">Coupon Code (optional)</label>
                <div className="flex gap-2">
                  <Input placeholder="Enter coupon code" value={couponCode}
                    onChange={(e) => { setCouponCode(e.target.value.toUpperCase()); if (couponResult) { setCouponResult(null); setCouponError(""); } }}
                    className="text-xs h-9 flex-1" disabled={paymentState.status === "initiating" || paymentState.status === "verifying"} />
                  {couponResult ? (
                    <Button variant="outline" size="sm" className="h-9 px-3 text-xs"
                      onClick={handleRemoveCoupon} disabled={paymentState.status === "initiating" || paymentState.status === "verifying"}>
                      Remove
                    </Button>
                  ) : (
                    <Button variant="outline" size="sm" className="h-9 px-3 text-xs"
                      onClick={handleApplyCoupon} disabled={!couponCode.trim() || validatingCoupon || paymentState.status === "initiating" || paymentState.status === "verifying"}>
                      {validatingCoupon ? <Loader2 className="h-3 w-3 animate-spin" /> : "Apply"}
                    </Button>
                  )}
                </div>
                {couponError && <p className="text-[10px] text-red-500 mt-1">{couponError}</p>}
                {couponResult && (
                  <p className="text-[10px] text-emerald-600 dark:text-emerald-400 mt-1">
                    ✓ {couponResult.discountType === "percentage"
                      ? `${couponResult.discountValue}% off — You save ₦${couponResult.discount?.toLocaleString()}`
                      : `₦${couponResult.discountValue} off — You save ₦${couponResult.discount?.toLocaleString()}`}
                  </p>
                )}
              </div>

              {selectedSize && (
                <div className="border-t border-border pt-3 space-y-1">
                  {couponResult && (
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Original Price</span>
                      <span className="text-muted-foreground line-through">₦{sizes.find((s: Doc) => String(s.id) === selectedSize)?.price?.toLocaleString()}</span>
                    </div>
                  )}
                  {couponResult && (
                    <div className="flex justify-between text-xs text-emerald-600 dark:text-emerald-400">
                      <span>Discount</span>
                      <span>-₦{couponResult.discount?.toLocaleString()}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm font-medium">
                    <span className="text-muted-foreground">Total</span>
                    <span>₦{(couponResult?.finalAmount ?? sizes.find((s: Doc) => String(s.id) === selectedSize)?.price)?.toLocaleString()}</span>
                  </div>
                </div>
              )}

              <Button className="w-full text-xs" size="sm"
                disabled={!selectedSize || paymentState.status === "initiating" || paymentState.status === "verifying"}
                onClick={handleProceedToPayment}
              >
                {getPaymentButtonContent()}
              </Button>

              {isAdmin && (
                <Button
                  variant="outline"
                  className="w-full text-xs"
                  size="sm"
                  disabled={!selectedSize || demoPurchase.isPending}
                  onClick={async () => {
                    if (!selectedTemplate || !selectedSize) return;
                    try {
                      await demoPurchase.mutateAsync({ templateId: selectedTemplate, accountSizeId: selectedSize });
                      toast.success("Demo challenge created!");
                      setShowPurchase(false);
                      resetPayment();
                    } catch (err: any) {
                      toast.error(err?.message || "Failed to create demo challenge");
                    }
                  }}
                >
                  {demoPurchase.isPending ? (
                    <div className="flex items-center gap-2"><Loader2 className="h-3 w-3 animate-spin" /><span>Creating...</span></div>
                  ) : (
                    "Create Demo Challenge"
                  )}
                </Button>
              )}

              <p className="text-[10px] text-muted-foreground text-center">
                Secure payment powered by Flutterwave. Your payment data is encrypted.
              </p>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
