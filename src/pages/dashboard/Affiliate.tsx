/* eslint-disable @typescript-eslint/no-explicit-any */
import { useApiQuery, useApiMutation } from "@/hooks/use-api";
import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Users, Copy, Gift, TrendingUp } from "lucide-react";
import { toast } from "sonner";

export default function Affiliate() {
  const { user } = useAuth();
  const { data: affiliate, isLoading } = useApiQuery<any>(["affiliate", "my"], "/api/affiliates/my");
  const generateCode = useApiMutation<any, any>("post", "/api/users/referral-code");

  if (isLoading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  }

  const referralCode = affiliate?.referralCode || user?.referralCode || "N/A";
  const referralLink = typeof window !== "undefined" ? `${window.location.origin}/auth?ref=${referralCode}` : "";

  return (
    <div className="space-y-8">
      <div><h1 className="text-lg font-medium tracking-tight">Affiliate Program</h1><p className="text-xs text-muted-foreground mt-1">Earn commissions by referring new traders</p></div>
      <div className="grid md:grid-cols-3 gap-4">
        <div className="card-subtle p-5"><div className="stat-label">Total Referrals</div><div className="stat-value mt-1">{affiliate?.totalReferrals || 0}</div></div>
        <div className="card-subtle p-5"><div className="stat-label">Total Commissions</div><div className="stat-value mt-1">₦{(affiliate?.totalCommissions || 0).toLocaleString()}</div></div>
        <div className="card-subtle p-5"><div className="stat-label">Pending</div><div className="stat-value mt-1">₦{(affiliate?.pendingCommissions || 0).toLocaleString()}</div></div>
      </div>
      <div className="card-subtle p-6">
        <h2 className="text-sm font-medium mb-3">Your Referral Code</h2>
        <div className="flex items-center gap-3">
          <div className="flex-1 p-3 bg-secondary rounded-lg font-mono text-sm">{referralCode}</div>
          <Button variant="outline" size="sm" className="text-xs" onClick={() => { navigator.clipboard.writeText(referralCode); toast.success("Copied!"); }}><Copy className="h-3 w-3 mr-1" /> Copy</Button>
        </div>
        {referralLink && (
          <div className="mt-3">
            <label className="text-xs text-muted-foreground block mb-1">Referral Link</label>
            <div className="flex items-center gap-2">
              <Input value={referralLink} readOnly className="text-xs h-9 font-mono" />
              <Button variant="outline" size="sm" className="text-xs" onClick={() => { navigator.clipboard.writeText(referralLink); toast.success("Link copied!"); }}>Copy</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
