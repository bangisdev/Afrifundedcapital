/* eslint-disable @typescript-eslint/no-explicit-any */
import { useApiQuery, useApiMutation } from "@/hooks/use-api";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Send } from "lucide-react";
import { toast } from "sonner";

export default function AdminNotifications() {
  const broadcast = useApiMutation<any, any>("post", "/api/notifications/broadcast");
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [type, setType] = useState("broadcast");
  const [sending, setSending] = useState(false);

  const handleBroadcast = async () => {
    if (!title || !message) { toast.error("Fill in all fields"); return; }
    setSending(true);
    try {
      await broadcast.mutateAsync({ title, message, type });
      toast.success("Notification broadcasted to all users");
      setTitle(""); setMessage("");
    } catch (e: any) { toast.error(e.message); }
    setSending(false);
  };

  return (
    <div className="space-y-8">
      <div><h1 className="text-lg font-medium tracking-tight">Notifications</h1><p className="text-xs text-muted-foreground mt-1">Send broadcast notifications to all users</p></div>
      <div className="card-subtle p-6 space-y-4">
        <div><label className="text-xs text-muted-foreground block mb-1">Title</label><Input value={title} onChange={(e) => setTitle(e.target.value)} className="text-xs h-9" placeholder="Notification title" /></div>
        <div><label className="text-xs text-muted-foreground block mb-1">Message</label><textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={4} className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs" placeholder="Notification message..." /></div>
        <div><label className="text-xs text-muted-foreground block mb-1">Type</label>
          <select value={type} onChange={(e) => setType(e.target.value)} className="w-full h-9 rounded-md border border-input bg-background px-3 text-xs">
            <option value="broadcast">Broadcast</option><option value="system">System</option>
          </select>
        </div>
        <Button size="sm" className="text-xs" onClick={handleBroadcast} disabled={sending}>
          {sending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Send className="h-3 w-3 mr-1" />} Send to All Users
        </Button>
      </div>
    </div>
  );
}
