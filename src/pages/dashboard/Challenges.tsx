/* eslint-disable @typescript-eslint/no-explicit-any */
import { useApiQuery, useApiMutation } from "@/hooks/use-api";
import { readResponseBody } from "@/lib/api";
import { newsBlackoutWindow, RULE_HINTS, formatMoney, formatShortDate } from "@/lib/utils";
import { useEffect, useRef, useState } from "react";
import { useResetOnChange } from "@/hooks/use-reset-on-change";
import { useAuth } from "@/hooks/use-auth";
import { useFlutterwavePayment } from "@/hooks/use-flutterwave";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/dashboard/PageHeader";
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
import { PageLoader } from "@/components/dashboard/PageLoader";
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
  EmptyMedia,
} from "@/components/ui/empty";
import { useNavigate, useSearchParams, Link } from "react-router";
import { Loader2, CheckCircle, XCircle, ChevronRight, ChevronLeft, ArrowUp, ArrowDown, ArrowUpDown, Gift, Check, X, ExternalLink, BarChart3 } from "lucide-react";
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

const TEMPLATE_TYPE_LABELS: Record<string, string> = {
  one_step: "One-Step",
  two_step: "Two-Step",
  instant_funding: "Instant Funding",
};

function formatNgn(price: number | string | null | undefined) {
  if (price === null || price === undefined || price === "") return "N/A";
  const n = typeof price === "number" ? price : parseFloat(String(price));
  if (Number.isNaN(n) || n <= 0) return "N/A";
  return `₦${n.toLocaleString()}`;
}

/**
 * News-trading rule value for the buy page. "Yes" when news trading is
 * allowed; otherwise surfaces the template's configured blackout window via
 * the shared newsBlackoutWindow formatter.
 */
function newsTradingLabel(t: Doc) {
  if (t.allowNewsTrading !== false) return "Yes";
  const win = newsBlackoutWindow(t);
  return win ? `No · ${win}` : "No · no blackout";
}

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

  // Deep link support: ?template=<id>&size=<id> preselects the challenge and
  // account size and opens the purchase dialog (e.g. from the landing page
  // cards). The params are read once at mount into the state initializers
  // below; the cleanup effect only strips them so refreshing (or closing the
  // dialog) doesn't re-trigger anything.
  const [searchParams, setSearchParams] = useSearchParams();
  const urlTemplate = searchParams.get("template");
  const urlSize = searchParams.get("size");
  const deepLinkConsumed = useRef(false);

  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(urlTemplate);
  const [selectedSize, setSelectedSize] = useState<string | null>(urlTemplate && urlSize ? urlSize : null);
  const [couponCode, setCouponCode] = useState("");
  const [couponResult, setCouponResult] = useState<any>(null);
  const [couponError, setCouponError] = useState("");
  const [validatingCoupon, setValidatingCoupon] = useState(false);
  const [showPurchase, setShowPurchase] = useState(() => !!urlTemplate && !!urlSize);

  const isAdmin = user?.role === "super_admin" || user?.role === "support_admin" || user?.role === "finance_admin";
  const demoPurchase = useApiMutation<any, any>("post", "/api/challenges/demo-purchase");

  const { state: paymentState, startCheckout, reset: resetPayment } = useFlutterwavePayment();

  const { data: sizes } = useApiQuery<any[]>(
    ["sizes", selectedTemplate || "none"],
    `/api/challenges/templates/${selectedTemplate || 0}/sizes`,
    { enabled: !!selectedTemplate },
  );

  useEffect(() => {
    if (deepLinkConsumed.current) return;
    if (!urlTemplate) return;
    deepLinkConsumed.current = true;
    // Clean the URL so refreshing (or closing the dialog) doesn't re-trigger it.
    setSearchParams({}, { replace: true });
  }, [urlTemplate, setSearchParams]);

  // Clear a deep-linked selection if it doesn't match the loaded templates —
  // adjusted during render (React's documented "adjust state when data changes"
  // pattern) instead of an effect, so no cascading render pass.
  const [prevTemplates, setPrevTemplates] = useState<Doc[] | undefined>(templates);
  const [prevSelectedTemplate, setPrevSelectedTemplate] = useState<string | null>(selectedTemplate);
  if (templates !== prevTemplates || selectedTemplate !== prevSelectedTemplate) {
    setPrevTemplates(templates);
    setPrevSelectedTemplate(selectedTemplate);
    if (templates && selectedTemplate && !templates.some((t: Doc) => String(t.id) === selectedTemplate)) {
      setSelectedTemplate(null);
    }
  }

  // Clear a deep-linked size if it doesn't belong to the selected template.
  const [prevSizes, setPrevSizes] = useState<Doc[] | undefined>(sizes);
  const [prevSelectedSize, setPrevSelectedSize] = useState<string | null>(selectedSize);
  if (sizes !== prevSizes || selectedSize !== prevSelectedSize) {
    setPrevSizes(sizes);
    setPrevSelectedSize(selectedSize);
    if (sizes && selectedSize && !sizes.some((s: Doc) => String(s.id) === selectedSize)) {
      setSelectedSize(null);
    }
  }

  const isLoading = templatesLoading || myLoading;

  if (isLoading) {
    return <PageLoader rows={5} />;
  }

  const ruleFlag = (label: string, allowed: boolean, value?: string, hint?: string) => (
    <div className="flex items-start gap-1.5 text-xs">
      {allowed ? (
        <Check className="h-3 w-3 text-brand shrink-0 mt-0.5" />
      ) : (
        <X className="h-3 w-3 text-muted-foreground/50 shrink-0 mt-0.5" />
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className="text-muted-foreground">{label}</span>
          <span className={`font-medium tabular-nums ${allowed ? "text-foreground" : "text-muted-foreground"}`}>
            {value ?? (allowed ? "Yes" : "No")}
          </span>
        </div>
        {hint && (
          <div className="mt-0.5 whitespace-normal text-[10px] leading-snug text-muted-foreground/70">
            {hint}{" "}
            <Link
              to="/docs/trading-rules"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-0.5 font-medium text-foreground hover:text-brand transition-colors duration-150"
            >
              Learn more
              <ExternalLink className="h-2.5 w-2.5" />
            </Link>
          </div>
        )}
      </div>
    </div>
  );

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
      const data = await readResponseBody(res);
      if (data.valid) {
        setCouponResult(data);
        toast.success(`Coupon applied! You save ${formatMoney(data.discount)}`);
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

    const selectedTemplateObj = templates?.find((t: Doc) => String(t.id) === selectedTemplate);
    const purchaseLabel = `${selectedTemplateObj?.name || "Challenge"} - ${selectedAccountSize.label}`;
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
      description: purchaseLabel,
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
      <PageHeader
        eyebrow="Trading"
        title="Challenges"
        subtitle="Browse challenge types and start your funding journey"
      />

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
                <div className="flex items-start justify-between gap-2 mb-1">
                  <h3 className="text-sm font-medium">{template.name}</h3>
                  {TEMPLATE_TYPE_LABELS[template.type] && (
                    <span className="badge-subtle shrink-0">{TEMPLATE_TYPE_LABELS[template.type]}</span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mb-4">{template.description}</p>
                <div className="space-y-1.5 text-xs text-muted-foreground">
                  <div className="flex justify-between"><span>Profit Target</span><span className="text-foreground">{template.profitTarget}%</span></div>
                  <div className="flex justify-between"><span>Max Drawdown</span><span className="text-foreground">{template.maxDrawdown}%</span></div>
                  <div className="flex justify-between"><span>Daily Drawdown</span><span className="text-foreground">{template.dailyDrawdown}%</span></div>
                  <div className="flex justify-between"><span>Min Trading Days</span><span className="text-foreground">{template.minTradingDays}</span></div>
                  <div className="flex justify-between"><span>Duration</span><span className="text-foreground">{template.durationDays ? `${template.durationDays} days` : "Unlimited"}</span></div>
                  <div className="flex justify-between"><span>Leverage</span><span className="text-foreground">1:{template.maxLeverage}</span></div>
                  <div className="flex justify-between"><span>Reset Fee</span><span className="text-foreground">{formatNgn(template.resetFee)}</span></div>
                  <div className="flex justify-between"><span>Extension Fee</span><span className="text-foreground">{formatNgn(template.extensionFee)}</span></div>
                  <div className="flex justify-between"><span>Consistency Rule</span><span className="text-foreground">{template.consistencyTarget ? `Max ${template.consistencyTarget}% daily` : "No restriction"}</span></div>
                  <div className="flex justify-between"><span>Profit Share</span><span className="text-foreground text-brand">90%</span></div>
                </div>
                <div className="mt-4 pt-4 border-t border-border">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Trading Rules</div>
                  <div className="space-y-1.5">
                    {ruleFlag("Weekend Holding", template.allowWeekendHolding ?? false, undefined, RULE_HINTS.weekendHolding)}
                    {ruleFlag("News Trading", template.allowNewsTrading !== false, newsTradingLabel(template), RULE_HINTS.newsTrading)}
                    {ruleFlag("Expert Advisors", template.allowEATrading !== false, undefined, RULE_HINTS.eaTrading)}
                    {ruleFlag("Copy Trading", !!template.allowCopyTrading, undefined, RULE_HINTS.copyTrading)}
                  </div>
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
            <Empty className="card-subtle p-8">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <BarChart3 className="h-6 w-6" />
                </EmptyMedia>
                <EmptyTitle>No challenges yet. Start your journey!</EmptyTitle>
                <EmptyDescription>
                  Pick an account size above and begin your evaluation — or apply a coupon at checkout.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
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
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">
                        {ch.templateName
                          ? `${ch.templateName} · ${formatMoney(Number(ch.accountSize || 0), "USD")}`
                          : `Challenge #${ch.id}`}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {ch.templateName ? `Challenge #${ch.id} · ` : ""}
                        Started {formatShortDate(ch.createdAt) || "N/A"}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
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
                            Redeemed {formatShortDate(cp.redeemedAt)}
                          </div>
                        </div>
                      </div>
                      <span className="text-sm font-medium tabular-nums shrink-0 ml-4">
                        {cp.discountAmount ? `-${formatMoney(cp.discountAmount)}` : "—"}
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
            {paymentState.status !== "success" && selectedTemplate && (
              (() => {
                const tpl = templates?.find((t: Doc) => String(t.id) === selectedTemplate);
                if (!tpl) return null;
                return (
                  <p className="text-[10px] text-muted-foreground mt-1">
                    {tpl.profitTarget}% profit target · {tpl.maxDrawdown}% max drawdown · 1:{tpl.maxLeverage} leverage ·{" "}
                    {tpl.minTradingDays} min trading days{tpl.durationDays ? ` · ${tpl.durationDays} days` : ""}
                  </p>
                );
              })()
            )}
          </DialogHeader>

          {paymentState.status === "success" ? (
            <div className="space-y-4 py-4">
              <div className="flex flex-col items-center gap-3 text-center">
                <div className="h-12 w-12 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                  <CheckCircle className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div>
                  <p className="text-sm font-medium">Challenge Created</p>
                  {(() => {
                    const tpl = templates?.find((t: Doc) => String(t.id) === selectedTemplate);
                    const acct = sizes?.find((s: Doc) => String(s.id) === selectedSize);
                    return tpl && acct ? (
                      <p className="text-xs text-muted-foreground mt-1">
                        {tpl.name} - {acct.label}
                      </p>
                    ) : null;
                  })()}
                  <p className="text-xs text-muted-foreground mt-1">
                    Reference: {paymentState.reference?.slice(0, 16)}...
                  </p>
                  <Link
                    to="/docs/trading-rules"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-foreground hover:text-brand transition-colors duration-150"
                  >
                    Review your trading rules
                    <ExternalLink className="h-3 w-3" />
                  </Link>
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
              {/* Confirmation strip — names the exact challenge + account size being purchased */}
              {(() => {
                const tpl = templates?.find((t: Doc) => String(t.id) === selectedTemplate);
                const acct = sizes?.find((s: Doc) => String(s.id) === selectedSize);
                if (!tpl && !acct) return null;
                return (
                  <div className="flex items-center justify-between gap-3 rounded-md border border-border/60 bg-secondary/30 px-3 py-2.5">
                    <div className="min-w-0">
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                        You're purchasing
                      </div>
                      <div className="text-sm font-medium truncate">
                        {tpl?.name || "Challenge"}
                        {acct ? ` · ${acct.label}` : ""}
                      </div>
                    </div>
                    {acct?.price != null && (
                      <span className="text-sm font-medium tabular-nums shrink-0">
                        {formatMoney(Number(acct.price), acct.currency || "NGN")}
                      </span>
                    )}
                  </div>
                );
              })()}

              <Link
                to="/docs/trading-rules"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-brand transition-colors duration-150"
              >
                Review this challenge's trading rules before you pay
                <ExternalLink className="h-3 w-3" />
              </Link>

              <div className="grid grid-cols-2 gap-2">
                {sizes.map((size: Doc) => (
                  <button key={size.id}
                    className={`p-3 border rounded-lg text-left transition-colors ${String(size.id) === selectedSize ? "border-foreground bg-secondary" : "border-border hover:bg-secondary/30"}`}
                    onClick={() => setSelectedSize(String(size.id))}
                    disabled={paymentState.status === "initiating" || paymentState.status === "verifying"}
                  >
                    <div className="text-sm font-medium">{size.label}</div>
                    <div className="text-xs text-muted-foreground mt-1">{formatMoney(Number(size.price), size.currency || "NGN")}</div>
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
                      ? `${couponResult.discountValue}% off — You save ${formatMoney(couponResult.discount)}`
                      : `${formatMoney(couponResult.discountValue)} off — You save ${formatMoney(couponResult.discount)}`}
                  </p>
                )}
              </div>

              {selectedSize && (
                <div className="border-t border-border pt-3 space-y-1">
                  {couponResult && (
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Original Price</span>
                      <span className="text-muted-foreground line-through">{formatMoney(Number(sizes.find((s: Doc) => String(s.id) === selectedSize)?.price))}</span>
                    </div>
                  )}
                  {couponResult && (
                    <div className="flex justify-between text-xs text-emerald-600 dark:text-emerald-400">
                      <span>Discount</span>
                      <span>-{formatMoney(couponResult.discount)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm font-medium">
                    <span className="text-muted-foreground">Total</span>
                    <span className="tabular-nums">{formatMoney(Number(couponResult?.finalAmount ?? sizes.find((s: Doc) => String(s.id) === selectedSize)?.price))}</span>
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
