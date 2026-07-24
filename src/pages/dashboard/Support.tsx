/* eslint-disable @typescript-eslint/no-explicit-any */
import { useApiQuery, useApiMutation } from "@/hooks/use-api";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, Ticket, Plus, Send } from "lucide-react";
import { toast } from "sonner";

export default function Support() {
  const { data: tickets, isLoading } = useApiQuery<any[]>(["support", "my"], "/api/support/my");
  const createTicket = useApiMutation<any, any>("post", "/api/support/create");
  const addMessage = useApiMutation<any, any>("post", "/api/support/${id}/messages");
  const [showCreate, setShowCreate] = useState(false);
  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState("general");
  const [message, setMessage] = useState("");
  const [selectedTicket, setSelectedTicket] = useState<any>(null);
  const [reply, setReply] = useState("");

  if (isLoading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  }

  const handleCreate = async () => {
    if (!subject || !message) { toast.error("Fill in all fields"); return; }
    try {
      await createTicket.mutateAsync({ subject, category, priority: "medium" });
      toast.success("Ticket created"); setShowCreate(false); setSubject(""); setMessage("");
    } catch (e: any) { toast.error(e.message); }
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div><h1 className="text-lg font-medium tracking-tight">Support</h1><p className="text-xs text-muted-foreground mt-1">Get help with your account and challenges</p></div>
        <Button size="sm" className="text-xs" onClick={() => setShowCreate(true)}><Plus className="h-3 w-3 mr-1" /> New Ticket</Button>
      </div>
      {!tickets || tickets.length === 0 ? (
        <div className="card-subtle p-8 text-center"><Ticket className="h-8 w-8 mx-auto mb-3 text-muted-foreground" /><p className="text-xs text-muted-foreground">No support tickets yet</p></div>
      ) : (
        <div className="space-y-2">
          {tickets.map((t: any) => (
            <button key={t.id} onClick={() => setSelectedTicket(t)} className="w-full card-subtle p-4 text-left hover:bg-secondary/30 transition-colors">
              <div className="flex items-center justify-between">
                <div><div className="text-sm font-medium">{t.subject}</div><div className="text-xs text-muted-foreground mt-0.5">{t.category} · {t.createdAt ? new Date(t.createdAt).toLocaleDateString() : ""}</div></div>
                <Badge variant={t.status === "open" ? "default" : "secondary"} className="text-[10px]">{t.status}</Badge>
              </div>
            </button>
          ))}
        </div>
      )}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle className="text-base font-medium">New Support Ticket</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><label className="text-xs text-muted-foreground block mb-1">Subject</label><Input value={subject} onChange={(e) => setSubject(e.target.value)} className="text-xs h-9" /></div>
            <div><label className="text-xs text-muted-foreground block mb-1">Category</label>
              <select value={category} onChange={(e) => setCategory(e.target.value)} className="w-full h-9 rounded-md border border-input bg-background px-3 text-xs">
                <option value="general">General</option><option value="technical">Technical</option><option value="billing">Billing</option><option value="account">Account</option>
              </select>
            </div>
            <div><label className="text-xs text-muted-foreground block mb-1">Message</label><textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={4} className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs" /></div>
            <Button className="w-full text-xs" size="sm" onClick={handleCreate}>Submit Ticket</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
