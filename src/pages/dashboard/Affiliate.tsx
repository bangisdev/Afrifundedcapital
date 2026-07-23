/* eslint-disable @typescript-eslint/no-explicit-any */
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Loader2, Copy, Link, Users, DollarSign, TrendingUp } from "lucide-react";
import { toast } from "sonner";

export default function Affiliate() {
  const affiliate = useQuery(api.affiliates.getMyAffiliate);
  const generateCode = useMutation(api.users.generateReferralCodeForUser);
  const trackReferral = useMutation(api.affiliates.trackReferral);

  if (!affiliate) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const referralLink = affiliate.referralCode
    ? `${window.location.origin}/auth?ref=${affiliate.referralCode}`
    : null;

  const copyReferralLink = () => {
    if (referralLink) {
      navigator.clipboard.writeText(referralLink);
      toast.success("Referral link copied to clipboard");
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-lg font-medium tracking-tight">Affiliate Program</h1>
        <p className="text-xs text-muted-foreground mt-1">
          Earn commissions by referring traders to AfriFundedCapital
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card-subtle p-5">
          <div className="flex items-center gap-2 mb-3">
            <div className="h-6 w-6 rounded-full border border-border flex items-center justify-center">
              <Users className="h-3 w-3" />
            </div>
            <span className="stat-label">Total Referrals</span>
          </div>
          <div className="stat-value">{affiliate.totalReferrals}</div>
        </div>
        <div className="card-subtle p-5">
          <div className="flex items-center gap-2 mb-3">
            <div className="h-6 w-6 rounded-full border border-border flex items-center justify-center">
              <TrendingUp className="h-3 w-3" />
            </div>
            <span className="stat-label">Active Referrals</span>
          </div>
          <div className="stat-value">{affiliate.activeReferralsCount}</div>
        </div>
        <div className="card-subtle p-5">
          <div className="flex items-center gap-2 mb-3">
            <div className="h-6 w-6 rounded-full border border-border flex items-center justify-center">
              <DollarSign className="h-3 w-3" />
            </div>
            <span className="stat-label">Total Earned</span>
          </div>
          <div className="stat-value">₦{affiliate.totalCommissions.toLocaleString()}</div>
        </div>
        <div className="card-subtle p-5">
          <div className="flex items-center gap-2 mb-3">
            <div className="h-6 w-6 rounded-full border border-border flex items-center justify-center">
              <DollarSign className="h-3 w-3" />
            </div>
            <span className="stat-label">Pending</span>
          </div>
          <div className="stat-value">₦{affiliate.pendingCommissions.toLocaleString()}</div>
        </div>
      </div>

      {/* Referral Link */}
      <div className="card-subtle p-6">
        <h2 className="text-sm font-medium mb-3">Your Referral Link</h2>
        {referralLink ? (
          <div className="flex items-center gap-2">
            <div className="flex-1 bg-secondary rounded-md px-3 py-2 text-xs text-muted-foreground font-mono truncate">
              {referralLink}
            </div>
            <Button variant="outline" size="icon" className="h-8 w-8 shrink-0" onClick={copyReferralLink}>
              <Copy className="h-3 w-3" />
            </Button>
          </div>
        ) : (
          <Button
            size="sm"
            variant="outline"
            className="text-xs"
            onClick={async () => {
              const code = await generateCode();
              if (code) toast.success("Referral code generated!");
            }}
          >
            Generate Referral Code
          </Button>
        )}
        <div className="mt-3 text-xs text-muted-foreground">
          Commission rate: {affiliate.commissionRate}% per referral
        </div>
      </div>

      {/* Recent Commissions */}
      <div>
        <h2 className="text-sm font-medium mb-4">Recent Commissions</h2>
        <div className="space-y-1">
          {affiliate.recentCommissions && affiliate.recentCommissions.length > 0 ? (
            affiliate.recentCommissions.map((c: any) => (
              <div key={c._id} className="card-subtle p-3 flex items-center justify-between">
                <div>
                  <div className="text-xs font-medium">{c.description}</div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">
                    {new Date(c.createdAt).toLocaleDateString()} · Level {c.level}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-medium ${c.status === "paid" ? "text-foreground" : c.status === "pending" ? "text-muted-foreground" : ""}`}>
                    {c.status}
                  </span>
                  <span className="text-sm font-light">₦{c.amount.toLocaleString()}</span>
                </div>
              </div>
            ))
          ) : (
            <div className="card-subtle p-6 text-center">
              <p className="text-xs text-muted-foreground">No commissions yet. Start sharing your referral link!</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
