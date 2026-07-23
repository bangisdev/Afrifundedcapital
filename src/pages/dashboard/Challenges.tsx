import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
import { Loader2, CheckCircle, Clock, XCircle, DollarSign, ArrowRight } from "lucide-react";
import { toast } from "sonner";

export default function Challenges() {
  const templates = useQuery(api.challenges.listChallengeTemplates, {});
  const myChallenges = useQuery(api.challenges.getMyChallenges);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [selectedSize, setSelectedSize] = useState<string | null>(null);
  const [couponCode, setCouponCode] = useState("");
  const [showPurchase, setShowPurchase] = useState(false);

  const initiatePayment = useMutation(api.payments.initiatePayment);

  const sizes = useQuery(
    api.challenges.getAccountSizesForTemplate,
    selectedTemplate ? { templateId: selectedTemplate as any } : "skip",
  );

  if (!templates || !myChallenges) {
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

  const handlePurchase = async () => {
    if (!selectedTemplate || !selectedSize) {
      toast.error("Please select a challenge and account size");
      return;
    }

    try {
      const result = await initiatePayment({
        amount: sizes?.find((s) => s._id === selectedSize)?.price || 0,
        provider: "flutterwave",
        templateId: selectedTemplate as any,
        accountSizeId: selectedSize as any,
        couponCode: couponCode || undefined,
        description: `Challenge purchase`,
      });

      toast.success("Payment initiated! Reference: " + result.reference);
      setShowPurchase(false);
    } catch (error: any) {
      toast.error(error.message || "Payment failed");
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
            {templates.map((template) => (
              <div
                key={template._id}
                className={`card-subtle p-6 cursor-pointer transition-all hover:bg-secondary/30 ${
                  selectedTemplate === template._id ? "ring-1 ring-foreground" : ""
                }`}
                onClick={() => {
                  setSelectedTemplate(template._id);
                  setSelectedSize(null);
                }}
              >
                <h3 className="text-sm font-medium mb-1">{template.name}</h3>
                <p className="text-xs text-muted-foreground mb-4">
                  {template.description}
                </p>
                <div className="space-y-1.5 text-xs text-muted-foreground">
                  <div className="flex justify-between">
                    <span>Profit Target</span>
                    <span className="text-foreground">{template.profitTarget}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Max Drawdown</span>
                    <span className="text-foreground">{template.maxDrawdown}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Daily Drawdown</span>
                    <span className="text-foreground">{template.dailyDrawdown}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Min Trading Days</span>
                    <span className="text-foreground">{template.minTradingDays}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Duration</span>
                    <span className="text-foreground">{template.durationDays ? `${template.durationDays} days` : "Unlimited"}</span>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full mt-4 text-xs"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedTemplate(template._id);
                    setShowPurchase(true);
                  }}
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
            myChallenges.map((ch) => (
              <div key={ch._id} className="card-subtle p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium">{ch.templateName}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      ${ch.accountSize.toLocaleString()} — Started {new Date(ch.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {statusBadge(ch.status)}
                  </div>
                </div>
                {ch.status === "active" && (
                  <div className="mt-3">
                    <div className="flex justify-between text-xs text-muted-foreground mb-1">
                      <span>Profit Target: {ch.profitTarget}%</span>
                      <span>Drawdown: {ch.maxDrawdown}%</span>
                    </div>
                    <div className="progress-bar">
                      <div className="progress-bar-fill" style={{ width: "0%" }} />
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </TabsContent>
      </Tabs>

      {/* Purchase Dialog */}
      <Dialog open={showPurchase} onOpenChange={setShowPurchase}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-medium">Purchase Challenge</DialogTitle>
            <DialogDescription className="text-xs">
              Select your account size and apply any coupon codes
            </DialogDescription>
          </DialogHeader>

          {selectedTemplate && sizes && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2">
                {sizes.map((size) => (
                  <button
                    key={size._id}
                    className={`p-3 border rounded-lg text-left transition-colors ${
                      selectedSize === size._id
                        ? "border-foreground bg-secondary"
                        : "border-border hover:bg-secondary/30"
                    }`}
                    onClick={() => setSelectedSize(size._id)}
                  >
                    <div className="text-sm font-medium">{size.label}</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {size.currency} {size.price.toLocaleString()}
                    </div>
                  </button>
                ))}
              </div>

              <div>
                <label className="text-xs text-muted-foreground block mb-1">
                  Coupon Code (optional)
                </label>
                <Input
                  placeholder="Enter coupon code"
                  value={couponCode}
                  onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                  className="text-xs h-9"
                />
              </div>

              {selectedSize && (
                <div className="border-t border-border pt-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Total</span>
                    <span className="font-medium">
                      ₦{sizes.find((s) => s._id === selectedSize)?.price.toLocaleString()}
                    </span>
                  </div>
                </div>
              )}

              <Button
                className="w-full text-xs"
                size="sm"
                disabled={!selectedSize}
                onClick={handlePurchase}
              >
                Proceed to Payment
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
