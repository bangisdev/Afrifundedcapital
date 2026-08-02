/* eslint-disable @typescript-eslint/no-explicit-any */
import { useApiQuery, useApiMutation } from "@/hooks/use-api";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Plus, Trash2, Tag, Users, DollarSign, ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";
import { toast } from "sonner";

export default function AdminCoupons() {
  // Sorting (whitelisted columns on the server: id, code, discountType, discountValue, currentUses, isActive, expiresAt, createdAt)
  const [sortBy, setSortBy] = useState("createdAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const SORT_COLUMNS: Array<{ key: string; label: string }> = [
    { key: "code", label: "Code" },
    { key: "discountValue", label: "Discount" },
    { key: "currentUses", label: "Uses" },
    { key: "expiresAt", label: "Expires" },
    { key: "createdAt", label: "Created" },
  ];
  const handleSort = (key: string) => {
    if (sortBy === key) {
      setSortOrder((o) => (o === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(key);
      setSortOrder("desc");
    }
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

  const sortParams = new URLSearchParams();
  sortParams.set("sortBy", sortBy);
  sortParams.set("sortOrder", sortOrder);
  const qs = sortParams.toString();
  const listQuery = `/api/coupons/admin/all?${qs}`;
  const { data: coupons, isLoading, refetch } = useApiQuery<any[]>(["admin", "coupons", qs ? `?${qs}` : ""], listQuery);
  const createCoupon = useApiMutation<any, any>("post", "/api/coupons/admin/create");
  const [showCreate, setShowCreate] = useState(false);
  const [code, setCode] = useState("");
  const [discountType, setDiscountType] = useState("percentage");
  const [discountValue, setDiscountValue] = useState("");
  const [maxUses, setMaxUses] = useState("");

  if (isLoading) return <div className="flex items-center justify-center h-64"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;

  const handleCreate = async () => {
    if (!code || !discountValue) { toast.error("Fill in all fields"); return; }
    try {
      await createCoupon.mutateAsync({
        code,
        discountType,
        discountValue: parseFloat(discountValue),
        maxUses: maxUses ? parseInt(maxUses) : null,
      });
      toast.success("Coupon created");
      setShowCreate(false);
      setCode("");
      setDiscountValue("");
      setMaxUses("");
      refetch();
    } catch (e: any) { toast.error(e.message); }
  };

  const handleDelete = async (id: number) => {
    try {
      await fetch(`/api/coupons/admin/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      toast.success("Coupon deleted");
      refetch();
    } catch (e: any) { toast.error(e?.message || "Failed to delete"); }
  };

  // Aggregate stats
  const totalCoupons = (coupons || []).length;
  const totalRedemptions = (coupons || []).reduce((sum: number, c: any) => sum + (c.redemptionCount || 0), 0);
  const totalDiscountGiven = (coupons || []).reduce((sum: number, c: any) => sum + (c.totalDiscountGiven || 0), 0);

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-medium tracking-tight">Coupons</h1>
          <p className="text-xs text-muted-foreground mt-1">{totalCoupons} coupons · {totalRedemptions} total redemptions</p>
        </div>
        <Button size="sm" className="text-xs" onClick={() => setShowCreate(true)}>
          <Plus className="h-3 w-3 mr-1" /> Create
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="card-subtle p-4">
          <div className="flex items-center gap-2 mb-2">
            <Tag className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Total Coupons</span>
          </div>
          <div className="text-lg font-medium">{totalCoupons}</div>
        </div>
        <div className="card-subtle p-4">
          <div className="flex items-center gap-2 mb-2">
            <Users className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Total Redemptions</span>
          </div>
          <div className="text-lg font-medium">{totalRedemptions}</div>
        </div>
        <div className="card-subtle p-4">
          <div className="flex items-center gap-2 mb-2">
            <DollarSign className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Total Discount Given</span>
          </div>
          <div className="text-lg font-medium">₦{totalDiscountGiven.toLocaleString()}</div>
        </div>
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="card-subtle p-4 space-y-3">
          <div className="grid grid-cols-4 gap-3">
            <Input placeholder="Code (e.g. SAVE20)" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} className="text-xs h-9" />
            <select value={discountType} onChange={(e) => setDiscountType(e.target.value)} className="h-9 rounded-md border border-input bg-background px-3 text-xs">
              <option value="percentage">Percentage</option>
              <option value="fixed">Fixed (₦)</option>
            </select>
            <Input type="number" placeholder="Value" value={discountValue} onChange={(e) => setDiscountValue(e.target.value)} className="text-xs h-9" />
            <Input type="number" placeholder="Max uses (blank=unlimited)" value={maxUses} onChange={(e) => setMaxUses(e.target.value)} className="text-xs h-9" />
          </div>
          <div className="flex gap-2">
            <Button size="sm" className="text-xs" onClick={handleCreate}>Create</Button>
            <Button size="sm" variant="ghost" className="text-xs" onClick={() => setShowCreate(false)}>Cancel</Button>
          </div>
        </div>
      )}

      {/* Sort Toolbar */}
      <div className="card-subtle px-4 py-2 flex items-center gap-1.5 flex-wrap">
        <span className="text-[10px] font-medium text-muted-foreground mr-1">Sort:</span>
        {SORT_COLUMNS.map((c) => sortHeader(c.key, c.label))}
        <span className="ml-auto text-[10px] text-muted-foreground">
          {totalCoupons} coupon{totalCoupons !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Coupon list */}
      <div className="space-y-1">
        {(coupons || []).map((c: any) => {
          const redemptionCount = c.redemptionCount || 0;
          const maxUses = c.maxUses || null;
          const usagePercent = maxUses ? Math.round((redemptionCount / maxUses) * 100) : null;
          const isExhausted = maxUses && redemptionCount >= maxUses;
          const isNearLimit = usagePercent !== null && usagePercent >= 80 && !isExhausted;

          return (
            <div key={c.id} className="card-subtle p-4">
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3">
                    <div className="text-sm font-mono font-medium">{c.code}</div>
                    <span className={`inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium rounded ${
                      c.discountType === "percentage"
                        ? "bg-foreground text-background"
                        : "bg-secondary text-secondary-foreground"
                    }`}>
                      {c.discountType === "percentage" ? `${c.discountValue}%` : `₦${c.discountValue}`}
                    </span>
                    {isExhausted && (
                      <span className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium rounded bg-destructive/10 text-destructive">
                        Exhausted
                      </span>
                    )}
                    {isNearLimit && (
                      <span className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium rounded bg-yellow-500/10 text-yellow-600 dark:text-yellow-400">
                        Near Limit
                      </span>
                    )}
                  </div>

                  {/* Usage bar */}
                  <div className="flex items-center gap-3 mt-2">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Users className="h-3 w-3" />
                      <span>{redemptionCount} used</span>
                      {maxUses && <span className="text-[10px]">of {maxUses}</span>}
                    </div>
                    {c.totalDiscountGiven > 0 && (
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <DollarSign className="h-3 w-3" />
                        <span>₦{c.totalDiscountGiven.toLocaleString()} given</span>
                      </div>
                    )}
                    {c.expiresAt && (
                      <span className={`text-[10px] ${
                        c.expiresAt < Date.now() ? "text-destructive" : "text-muted-foreground"
                      }`}>
                        {c.expiresAt < Date.now() ? "Expired" : `Expires ${new Date(c.expiresAt).toLocaleDateString()}`}
                      </span>
                    )}
                  </div>

                  {/* Progress bar for limited coupons */}
                  {maxUses && (
                    <div className="mt-2">
                      <div className="h-1 bg-secondary rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${
                            isExhausted ? "bg-destructive" : isNearLimit ? "bg-yellow-500" : "bg-foreground"
                          }`}
                          style={{ width: `${Math.min(usagePercent || 0, 100)}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>

                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-destructive ml-4 shrink-0"
                  onClick={() => handleDelete(c.id)}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
