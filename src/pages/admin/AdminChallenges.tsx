import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Loader2, Plus, Eye } from "lucide-react";
import { toast } from "sonner";

export default function AdminChallenges() {
  const challenges = useQuery(api.challenges.listAllChallenges, {});
  const createTemplate = useMutation(api.challenges.createChallengeTemplate);

  if (!challenges) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const statusBadge = (status: string) => {
    const variants: Record<string, string> = {
      active: "bg-foreground text-background",
      pending: "bg-secondary text-secondary-foreground",
      phase_1_passed: "bg-foreground text-background",
      phase_2_passed: "bg-foreground text-background",
      funded: "bg-foreground text-background",
      violated: "bg-destructive/10 text-destructive",
      expired: "bg-secondary text-secondary-foreground",
    };
    return (
      <span className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded ${variants[status] || ""}`}>
        {status.replace(/_/g, " ")}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-medium tracking-tight">Challenges</h1>
          <p className="text-xs text-muted-foreground mt-1">
            Manage all user challenges and templates
          </p>
        </div>
      </div>

      {challenges.length === 0 ? (
        <div className="card-subtle p-8 text-center">
          <p className="text-xs text-muted-foreground">No challenges yet</p>
        </div>
      ) : (
        <div className="space-y-1">
          {challenges.map((ch) => (
            <div key={ch._id} className="card-subtle p-4 flex items-center justify-between">
              <div>
                <div className="text-sm font-medium">
                  {ch.userName || ch.userEmail || "Unknown"} — ${ch.accountSize?.toLocaleString()}
                </div>
                <div className="flex items-center gap-2 mt-1">
                  {statusBadge(ch.status)}
                  <span className="text-xs text-muted-foreground">
                    {ch.templateName || "Challenge"}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(ch.createdAt).toLocaleDateString()}
                  </span>
                </div>
              </div>
              <div className="text-xs text-muted-foreground">
                ₦{ch.amountPaid?.toLocaleString() || 0}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
