/* eslint-disable @typescript-eslint/no-explicit-any */
import { useApiQuery, useApiMutation } from "@/hooks/use-api";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

export default function AdminCoupons() {
  const { data: coupons, isLoading, refetch } = useApiQuery<any[]>(["admin", "coupons"], "/api/coupons/admin/all");
  const createCoupon = useApiMutation<any, any>("post", "/api/coupons/admin/create");
  const deleteCoupon = useApiMutation<any, any>("delete", "/api/coupons/admin/${id}");
  const [showCreate, setShowCreate] = useState(false);
  const [code, setCode] = useState("");
  const [discountType, setDiscountType] = useState("percentage");
  const [discountValue, setDiscountValue] = useState("");

  if (isLoading) return <div className="flex items-center justify-center h-64"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;

  const handleCreate = async () => {
    if (!code || !discountValue) { toast.error("Fill in all fields"); return; }
    try {
      await createCoupon.mutateAsync({ code, discountType, discountValue: parseFloat(discountValue) });
      toast.success("Coupon created"); setShowCreate(false); setCode(""); setDiscountValue(""); refetch();
    } catch (e: any) { toast.error(e.message); }
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div><h1 className="text-lg font-medium tracking-tight">Coupons</h1><p className="text-xs text-muted-foreground mt-1">{(coupons || []).length} coupons</p></div>
        <Button size="sm" className="text-xs" onClick={() => setShowCreate(true)}><Plus className="h-3 w-3 mr-1" /> Create</Button>
      </div>
      {showCreate && (
        <div className="card-subtle p-4 space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <Input placeholder="Code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} className="text-xs h-9" />
            <select value={discountType} onChange={(e) => setDiscountType(e.target.value)} className="h-9 rounded-md border border-input bg-background px-3 text-xs"><option value="percentage">Percentage</option><option value="fixed">Fixed</option></select>
            <Input type="number" placeholder="Value" value={discountValue} onChange={(e) => setDiscountValue(e.target.value)} className="text-xs h-9" />
          </div>
          <div className="flex gap-2"><Button size="sm" className="text-xs" onClick={handleCreate}>Create</Button><Button size="sm" variant="ghost" className="text-xs" onClick={() => setShowCreate(false)}>Cancel</Button></div>
        </div>
      )}
      <div className="space-y-1">
        {(coupons || []).map((c: any) => (
          <div key={c.id} className="card-subtle p-4 flex items-center justify-between">
            <div><div className="text-sm font-mono font-medium">{c.code}</div><div className="text-xs text-muted-foreground">{c.discountType}: {c.discountValue} · {c.currentUses || 0} uses</div></div>
            <Button variant="ghost" size="sm" className="h-7 text-destructive" onClick={async () => { await deleteCoupon.mutateAsync({ id: c.id }); toast.success("Deleted"); refetch(); }}><Trash2 className="h-3 w-3" /></Button>
          </div>
        ))}
      </div>
    </div>
  );
}
