/* eslint-disable @typescript-eslint/no-explicit-any */
import { useApiQuery, useApiMutation } from "@/hooks/use-api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function AdminAffiliates() {
  const { data: affiliates, isLoading } = useApiQuery<any[]>(["admin", "affiliates"], "/api/affiliates/admin/all");

  if (isLoading) return <div className="flex items-center justify-center h-64"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-8">
      <div><h1 className="text-lg font-medium tracking-tight">Affiliates</h1><p className="text-xs text-muted-foreground mt-1">{(affiliates || []).length} affiliates</p></div>
      <div className="space-y-1">
        {(affiliates || []).map((a: any) => (
          <div key={a.id} className="card-subtle p-4 flex items-center justify-between">
            <div><div className="text-sm font-medium">{a.referralCode}</div><div className="text-xs text-muted-foreground">User {a.userId} · {a.totalReferrals} referrals</div></div>
            <div className="text-right"><div className="text-sm font-medium">₦{(a.totalCommissions || 0).toLocaleString()}</div><Badge variant="outline" className="text-[10px]">{a.isActive ? "Active" : "Inactive"}</Badge></div>
          </div>
        ))}
      </div>
    </div>
  );
}
