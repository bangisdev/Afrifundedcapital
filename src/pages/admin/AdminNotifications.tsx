/* eslint-disable @typescript-eslint/no-explicit-any */
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Loader2,
  Send,
  Bell,
  Megaphone,
  Users,
  CheckCircle2,
  History,
  Search,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export default function AdminNotifications() {
  const broadcastHistory = useQuery(api.notifications.listAllNotifications, {
    broadcastOnly: true,
  });
  const sendBroadcast = useMutation(api.notifications.sendBroadcast);
  const userStats = useQuery(api.users.getUserStats);

  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [link, setLink] = useState("");
  const [targetRole, setTargetRole] = useState("");
  const [sending, setSending] = useState(false);

  const handleSend = async () => {
    if (!title.trim() || !message.trim()) {
      toast.error("Title and message are required");
      return;
    }

    setSending(true);
    try {
      const result = await sendBroadcast({
        title: title.trim(),
        message: message.trim(),
        link: link.trim() || undefined,
        targetRole: targetRole || undefined,
      });
      toast.success(`Broadcast sent to ${result.sent} of ${result.total} users`);
      setTitle("");
      setMessage("");
      setLink("");
    } catch (error: any) {
      toast.error(error.message);
    }
    setSending(false);
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-medium tracking-tight">Broadcast</h1>
          <p className="text-xs text-muted-foreground mt-1">
            Send notifications to all users or a specific role
          </p>
        </div>
        {userStats && (
          <Badge variant="outline" className="text-xs font-normal">
            {userStats.total} total users
          </Badge>
        )}
      </div>

      {/* Compose */}
      <div className="card-subtle p-6 space-y-4">
        <div className="flex items-center gap-2 mb-1">
          <div className="h-7 w-7 rounded-full bg-foreground/10 flex items-center justify-center">
            <Megaphone className="h-3.5 w-3.5" />
          </div>
          <span className="text-sm font-medium">Compose Broadcast</span>
        </div>

        <div className="grid gap-4">
          <div>
            <label className="text-xs text-muted-foreground block mb-1.5">Title</label>
            <Input
              className="text-xs h-9"
              placeholder="e.g. Platform Maintenance Tonight"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1.5">Message</label>
            <Textarea
              className="text-xs min-h-[100px] resize-y"
              placeholder="Write your broadcast message..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-muted-foreground block mb-1.5">
                Link <span className="text-muted-foreground/60">(optional)</span>
              </label>
              <Input
                className="text-xs h-9"
                placeholder="/dashboard/challenges"
                value={link}
                onChange={(e) => setLink(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1.5">
                Target Role <span className="text-muted-foreground/60">(optional)</span>
              </label>
              <select
                className="h-9 w-full rounded-md border border-border bg-transparent px-3 text-xs text-muted-foreground"
                value={targetRole}
                onChange={(e) => setTargetRole(e.target.value)}
              >
                <option value="">All users</option>
                <option value="user">Traders only</option>
                <option value="super_admin">Super admins</option>
                <option value="support_admin">Support admins</option>
                <option value="finance_admin">Finance admins</option>
                <option value="marketing_admin">Marketing admins</option>
              </select>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-border">
          <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
            <Users className="h-3 w-3" />
            <span>
              Will be sent to{" "}
              <span className="font-medium text-foreground">
                {targetRole === "user"
                  ? (userStats?.total || 0) - (userStats?.admins || 0)
                  : targetRole
                    ? "filtered"
                    : userStats?.total || 0}
              </span>{" "}
              user{userStats?.total !== 1 ? "s" : ""}
            </span>
          </div>
          <Button
            size="sm"
            className="text-xs"
            onClick={handleSend}
            disabled={sending || !title.trim() || !message.trim()}
          >
            {sending ? (
              <>
                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                Sending...
              </>
            ) : (
              <>
                <Send className="h-3 w-3 mr-1" />
                Send Broadcast
              </>
            )}
          </Button>
        </div>
      </div>

      {/* History */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <History className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-medium">Broadcast History</h2>
        </div>

        {!broadcastHistory ? (
          <div className="flex items-center justify-center h-32">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : broadcastHistory.length === 0 ? (
          <div className="card-subtle p-8 text-center">
            <Bell className="h-8 w-8 mx-auto text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground">No broadcasts sent yet.</p>
          </div>
        ) : (
          <div className="space-y-1">
            {broadcastHistory.map((n) => (
              <div key={n._id} className="card-subtle p-3">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-medium">{n.title}</span>
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-[9px] font-normal border-0",
                          n.read
                            ? "bg-secondary text-muted-foreground"
                            : "bg-foreground/10 text-foreground",
                        )}
                      >
                        {n.read ? "read" : "unread"}
                      </Badge>
                    </div>
                    <p className="text-[11px] text-muted-foreground line-clamp-1">
                      {n.message}
                    </p>
                    <div className="flex items-center gap-2 mt-1.5">
                      <span className="text-[9px] text-muted-foreground">
                        Sent to {n.userName}
                      </span>
                      <span className="text-[9px] text-muted-foreground">
                        {new Date(n.createdAt).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
