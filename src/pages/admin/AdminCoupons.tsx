import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, Gift, Plus, Copy, Trash2 } from "lucide-react";
import { toast } from "sonner";

export default function AdminCoupons() {
  const coupons = useQuery(api.coupons.listCoupons, {});
  const createCoupon = useMutation(api.coupons.createCoupon);
  const updateCoupon = useMutation(api.coupons.updateCoupon);
  const deleteCoupon = useMutation(api.coupons.deleteCoupon);
  const [showCreate, setShowCreate] = useState(false);

  const [code, setCode] = useState("");
  const [discountType, setDiscountType] = useState<"fixed" | "percentage">("percentage");
  const [discountValue, setDiscountValue] = useState("");
  const [maxUses, setMaxUses] = useState("");

  if (!coupons) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const handleCreate = async () => {
    if (!code || !discountValue) {
      toast.error("Code and value are required");
      return;
    }
    try {
      await createCoupon({
        code: code.toUpperCase(),
        discountType,
        discountValue: parseInt(discountValue),
        maxUses: maxUses ? parseInt(maxUses) : undefined,
      });
      toast.success("Coupon created");
      setShowCreate(false);
      setCode("");
      setDiscountValue("");
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const handleToggleActive = async (couponId: any, isActive: boolean) => {
    try {
      await updateCoupon({ couponId, isActive: !isActive });
      toast.success(isActive ? "Coupon deactivated" : "Coupon activated");
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const handleDelete = async (couponId: any) => {
    try {
      await deleteCoupon({ couponId });
      toast.success("Coupon deleted");
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-medium tracking-tight">Coupons</h1>
          <p className="text-xs text-muted-foreground mt-1">
            Create and manage discount coupons
          </p>
        </div>
        <Button size="sm" className="text-xs" onClick={() => setShowCreate(true)}>
          <Plus className="h-3 w-3 mr-1" /> Create Coupon
        </Button>
      </div>

      {coupons.length === 0 ? (
        <div className="card-subtle p-8 text-center">
          <Gift className="h-8 w-8 mx-auto mb-4 text-muted-foreground" />
          <p className="text-xs text-muted-foreground">No coupons yet</p>
        </div>
      ) : (
        <div className="space-y-1">
          {coupons.map((c) => (
            <div key={c._id} className="card-subtle p-4 flex items-center justify-between">
              <div>
                <div className="text-sm font-medium font-mono">{c.code}</div>
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant="outline" className="text-[10px] rounded-full">
                    {c.discountType === "percentage" ? `${c.discountValue}%` : `₦${c.discountValue}`}
                  </Badge>
                  <Badge variant="outline" className={`text-[10px] rounded-full ${c.isActive ? "" : "text-muted-foreground"}`}>
                    {c.isActive ? "Active" : "Inactive"}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {c.currentUses}/{c.maxUses || "∞"} uses
                  </span>
                  {c.expiresAt && (
                    <span className="text-xs text-muted-foreground">
                      Expires {new Date(c.expiresAt).toLocaleDateString()}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="sm" className="text-xs text-muted-foreground"
                  onClick={() => handleToggleActive(c._id, c.isActive)}>
                  {c.isActive ? "Deactivate" : "Activate"}
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive"
                  onClick={() => handleDelete(c._id)}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base font-medium">Create Coupon</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Code</label>
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                className="text-xs h-9 font-mono"
                placeholder="WELCOME25"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Discount Type</label>
              <select
                className="w-full h-9 rounded-md border border-input bg-background px-3 text-xs"
                value={discountType}
                onChange={(e) => setDiscountType(e.target.value as any)}
              >
                <option value="percentage">Percentage (%)</option>
                <option value="fixed">Fixed (₦)</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Value</label>
              <Input
                type="number"
                value={discountValue}
                onChange={(e) => setDiscountValue(e.target.value)}
                className="text-xs h-9"
                placeholder={discountType === "percentage" ? "25" : "5000"}
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">
                Max Uses <span className="font-normal">(optional)</span>
              </label>
              <Input
                type="number"
                value={maxUses}
                onChange={(e) => setMaxUses(e.target.value)}
                className="text-xs h-9"
                placeholder="100"
              />
            </div>
            <Button className="w-full text-xs" size="sm" onClick={handleCreate}>
              Create Coupon
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
