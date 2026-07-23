/* eslint-disable @typescript-eslint/no-explicit-any */
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Percent, DollarSign } from "lucide-react";
import { toast } from "sonner";

export default function AdminAffiliates() {
  const affiliates = useQuery(api.affiliates.listAffiliates, {});
  const approveCommission = useMutation(api.affiliates.approveCommission);

  if (!affiliates) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-medium tracking-tight">Affiliates</h1>
        <p className="text-xs text-muted-foreground mt-1">
          Manage affiliate partners and commissions
        </p>
      </div>

      {affiliates.length === 0 ? (
        <div className="card-subtle p-8 text-center">
          <Percent className="h-8 w-8 mx-auto mb-4 text-muted-foreground" />
          <p className="text-xs text-muted-foreground">No affiliates yet</p>
        </div>
      ) : (
        <div className="space-y-1">
          {affiliates.map((a: any) => (
            <div key={a._id} className="card-subtle p-4 flex items-center justify-between">
              <div>
                <div className="text-sm font-medium">{a.userName || a.userEmail || "Unknown"}</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  Code: {a.referralCode} · Rate: {a.commissionRate}%
                </div>
                <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                  <span>{a.totalReferrals} referrals</span>
                  <span>{a.activeReferrals} active</span>
                  <span>₦{a.totalCommissions?.toLocaleString()} earned</span>
                </div>
              </div>
              <Badge variant="outline" className={`text-xs rounded-full ${a.isActive ? "" : "text-muted-foreground"}`}>
                {a.isActive ? "Active" : "Inactive"}
              </Badge>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
