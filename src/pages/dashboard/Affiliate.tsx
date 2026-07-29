/* eslint-disable @typescript-eslint/no-explicit-any */
import { useApiQuery, useApiMutation } from "@/hooks/use-api";
import { useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Copy, Users, TrendingUp, DollarSign, Link2, ExternalLink } from "lucide-react";
import { toast } from "sonner";

export default function Affiliate() {
  const { user } = useAuth();
  const { data: affiliate, isLoading } = useApiQuery<any>(["affiliate", "my"], "/api/affiliates/my");
  const generateCode = useApiMutation<any, any>("post", "/api/users/referral-code");

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

  if (isLoading || generateCode.isPending) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const referralCode = affiliate?.referralCode || user?.referralCode || "N/A";
  const referralLink = typeof window !== "undefined" ? `${window.location.origin}/auth?ref=${referralCode}` : "";
  const baseUrl = typeof window !== "undefined" ? window.location.origin : "";

  const stats = [
    { label: "Total Referrals", value: affiliate?.totalReferrals || 0, icon: Users },
    { label: "Active Referrals", value: affiliate?.activeReferrals || 0, icon: Users },
    { label: "Total Commissions", value: `₦${(affiliate?.totalCommissions || 0).toLocaleString()}`, icon: DollarSign },
    { label: "Pending Payout", value: `₦${(affiliate?.pendingCommissions || 0).toLocaleString()}`, icon: TrendingUp },
  ];

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

      {/* How It Works */}
      <div className="card-subtle p-6">
        <h2 className="text-sm font-medium mb-4">How It Works</h2>
        <div className="space-y-3">
          {[
            { step: 1, text: "Share your referral link or code with friends" },
            { step: 2, text: "They sign up using your link and purchase a challenge" },
            { step: 3, text: "You earn commission on their first purchase (10%)" },
            { step: 4, text: "Withdraw your earnings from the Payouts page" },
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
    </div>
  );
}
