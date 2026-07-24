/* eslint-disable @typescript-eslint/no-explicit-any */
import { useApiQuery, useApiMutation } from "@/hooks/use-api";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Loader2, Plus, Edit2 } from "lucide-react";
import { toast } from "sonner";

export default function AdminChallenges() {
  const { data: templates, isLoading: tLoading } = useApiQuery<any[]>(["admin", "templates"], "/api/challenges/templates");
  const { data: allChallenges } = useApiQuery<any[]>(["admin", "allChallenges"], "/api/challenges/admin/all");
  const updateTemplate = useApiMutation<any, any>("put", "/api/challenges/admin/templates/${id}");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  if (tLoading) return <div className="flex items-center justify-center h-64"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-8">
      <div><h1 className="text-lg font-medium tracking-tight">Challenges</h1><p className="text-xs text-muted-foreground mt-1">Manage challenge templates and user challenges</p></div>

      <div className="space-y-4">
        <h2 className="text-sm font-medium">Templates</h2>
        <div className="grid md:grid-cols-3 gap-4">
          {(templates || []).map((t: any) => (
            <div key={t.id} className="card-subtle p-5">
              {editingId === String(t.id) ? (
                <div className="space-y-2">
                  <Input value={editName} onChange={(e) => setEditName(e.target.value)} className="text-xs h-8" />
                  <div className="flex gap-2">
                    <Button size="sm" className="text-[10px] h-7" onClick={async () => { await updateTemplate.mutateAsync({ id: t.id, name: editName }); setEditingId(null); toast.success("Updated"); }}>Save</Button>
                    <Button size="sm" variant="ghost" className="text-[10px] h-7" onClick={() => setEditingId(null)}>Cancel</Button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium">{t.name}</span>
                    <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => { setEditingId(String(t.id)); setEditName(t.name); }}><Edit2 className="h-3 w-3" /></Button>
                  </div>
                  <div className="space-y-1 text-xs text-muted-foreground">
                    <div className="flex justify-between"><span>Target</span><span className="text-foreground">{t.profitTarget}%</span></div>
                    <div className="flex justify-between"><span>Max DD</span><span className="text-foreground">{t.maxDrawdown}%</span></div>
                    <div className="flex justify-between"><span>Daily DD</span><span className="text-foreground">{t.dailyDrawdown}%</span></div>
                    <div className="flex justify-between"><span>Price</span><span className="text-foreground">₦{(t.price || 0).toLocaleString()}</span></div>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-4">
        <h2 className="text-sm font-medium">User Challenges ({(allChallenges || []).length})</h2>
        <div className="space-y-1">
          {(allChallenges || []).slice(0, 50).map((ch: any) => (
            <div key={ch.id} className="card-subtle p-3 flex items-center justify-between">
              <div className="text-xs"><span className="font-medium">#{ch.id}</span> <span className="text-muted-foreground">User {ch.userId} · ${(ch.accountSize || 0).toLocaleString()}</span></div>
              <Badge variant={ch.status === "active" ? "default" : ch.status === "funded" ? "default" : "secondary"} className="text-[10px]">{ch.status}</Badge>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
