import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useState } from "react";
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
import { Loader2, CheckCircle, XCircle } from "lucide-react";
import { toast } from "sonner";

type Doc = Record<string, any>;

export default function Challenges() {
  const { user } = useAuth();
  const templates = useQuery(api.challenges.listChallengeTemplates, {});
  const myChallenges = useQuery(api.challenges.getMyChallenges);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [selectedSize, setSelectedSize] = useState<string | null>(null);
  const [couponCode, setCouponCode] = useState("");
  const [showPurchase, setShowPurchase] = useState(false);

  const { state: paymentState, startCheckout, reset: resetPayment } = useFlutterwavePayment();

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

  const handleProceedToPayment = async () => {
    if (!selectedTemplate || !selectedSize || !user?.email) {
      toast.error("Please select a challenge and account size");
      return;
    }

    const selectedAccountSize = sizes?.find((s: Doc) => s._id === selectedSize);
    if (!selectedAccountSize) {
      toast.error("Selected account size not found");
      return;
    }

    await startCheckout({
      amount: selectedAccountSize.price,
      currency: "NGN",
      email: user.email,
      name: user.name || "Trader",
      phoneNumber: user.phone || "",
      templateId: selectedTemplate as any,
      accountSizeId: selectedSize as any,
      couponCode: couponCode || undefined,
      description: `${selectedAccountSize.label} Challenge`,
    });
  };

  const getPaymentButtonContent = () => {
    switch (paymentState.status) {
      case "initiating":
        return (
          <div className="flex items-center justify-center gap-2">
            <Loader2 className="h-3 w-3 animate-spin" />
            <span>Preparing payment...</span>
          </div>
        );
      case "verifying":
        return (
          <div className="flex items-center justify-center gap-2">
            <Loader2 className="h-3 w-3 animate-spin" />
            <span>Verifying payment...</span>
          </div>
        );
      case "success":
        return (
          <div className="flex items-center justify-center gap-2 text-emerald-600 dark:text-emerald-400">
            <CheckCircle className="h-3 w-3" />
            <span>Challenge Created!</span>
          </div>
        );
      case "error":
        return "Try Again";
      default:
        return "Proceed to Payment";
    }
  };

  const handleDialogClose = (open: boolean) => {
    if (!open) {
      if (paymentState.status === "success") {
        resetPayment();
      }
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
            {templates.map((template: Doc) => (
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
                  disabled={paymentState.status === "initiating" || paymentState.status === "verifying"}
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
            myChallenges.map((ch: Doc) => (
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
              <Button
                className="w-full text-xs"
                size="sm"
                onClick={() => {
                  resetPayment();
                  setShowPurchase(false);
                }}
              >
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
                  <p className="text-xs text-muted-foreground mt-1">
                    {paymentState.message || "Something went wrong. Please try again."}
                  </p>
                </div>
              </div>
              <Button
                variant="outline"
                className="w-full text-xs"
                size="sm"
                onClick={() => resetPayment()}
              >
                Try Again
              </Button>
            </div>
          ) : selectedTemplate && sizes ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2">
                {sizes.map((size: Doc) => (
                  <button
                    key={size._id}
                    className={`p-3 border rounded-lg text-left transition-colors ${
                      selectedSize === size._id
                        ? "border-foreground bg-secondary"
                        : "border-border hover:bg-secondary/30"
                    }`}
                    onClick={() => setSelectedSize(size._id)}
                    disabled={paymentState.status === "initiating" || paymentState.status === "verifying"}
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
                  disabled={paymentState.status === "initiating" || paymentState.status === "verifying"}
                />
              </div>

              {selectedSize && (
                <div className="border-t border-border pt-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Total</span>
                    <span className="font-medium">
                      ₦{(sizes as Doc[]).find((s: Doc) => s._id === selectedSize)?.price.toLocaleString()}
                    </span>
                  </div>
                </div>
              )}

              <Button
                className="w-full text-xs"
                size="sm"
                disabled={
                  !selectedSize ||
                  paymentState.status === "initiating" ||
                  paymentState.status === "verifying"
                }
                onClick={handleProceedToPayment}
              >
                {getPaymentButtonContent()}
              </Button>

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
