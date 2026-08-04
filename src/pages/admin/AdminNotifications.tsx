/* eslint-disable @typescript-eslint/no-explicit-any */
import { useApiQuery, useApiMutation } from "@/hooks/use-api";
import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Loader2,
  Send,
  Bell,
  Users,
  Megaphone,
  ChevronDown,
  Clock,
  Eye,
  Search,
} from "lucide-react";
import { toast } from "sonner";

const SEGMENTS = [
  { value: "all", label: "All Users", description: "Send to every registered user" },
  { value: "admins", label: "Admins Only", description: "Send to admin/support/finance roles" },
  { value: "verified", label: "Verified Users", description: "Users with verified email" },
  { value: "kyc_approved", label: "KYC Approved", description: "Users with approved KYC" },
  { value: "onboarded", label: "Onboarded Users", description: "Users who completed onboarding" },
  { value: "new_users", label: "New Users (30d)", description: "Users who joined in the last 30 days" },
];

const NOTIF_TYPES = [
  { value: "broadcast", label: "Broadcast", color: "bg-blue-500/10 text-blue-600" },
  { value: "system", label: "System", color: "bg-amber-500/10 text-amber-600" },
  { value: "payment", label: "Payment", color: "bg-emerald-500/10 text-emerald-600" },
  { value: "kyc", label: "KYC", color: "bg-violet-500/10 text-violet-600" },
  { value: "support", label: "Support", color: "bg-pink-500/10 text-pink-600" },
  { value: "security", label: "Security", color: "bg-red-500/10 text-red-600" },
];

function formatTime(ts: number | null) {
  if (!ts) return "";
  const d = new Date(ts);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 60000) return "Just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function AdminNotifications() {
  const { data: notifications, isLoading } = useApiQuery<any[]>(["admin", "notifications"], "/api/notifications/admin/all");
  const { data: stats } = useApiQuery<any>(["admin", "notifStats"], "/api/notifications/admin/stats");
  const broadcast = useApiMutation<any, any>("post", "/api/notifications/broadcast");
  const segmentedBroadcast = useApiMutation<any, any>("post", "/api/notifications/broadcast/segmented");

  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [type, setType] = useState("broadcast");
  const [link, setLink] = useState("");
  const [segment, setSegment] = useState("all");
  const [sending, setSending] = useState(false);
  const [tab, setTab] = useState<"compose" | "history">("compose");
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");

  const filteredNotifications = useMemo(() => {
    if (!notifications) return [];
    return notifications.filter((n) => {
      const matchesSearch = !search ||
        n.title?.toLowerCase().includes(search.toLowerCase()) ||
        n.message?.toLowerCase().includes(search.toLowerCase());
      const matchesType = typeFilter === "all" || n.type === typeFilter;
      return matchesSearch && matchesType;
    });
  }, [notifications, search, typeFilter]);

  const typeStats = useMemo(() => {
    if (!notifications) return {};
    const counts: Record<string, number> = {};
    for (const n of notifications) {
      counts[n.type] = (counts[n.type] || 0) + 1;
    }
    return counts;
  }, [notifications]);

  const handleBroadcast = async () => {
    if (!title.trim() || !message.trim()) {
      toast.error("Title and message are required");
      return;
    }
    setSending(true);
    try {
      if (segment === "all") {
        const result = await broadcast.mutateAsync({ title, message, type, link: link || undefined });
        toast.success(`Broadcast sent to ${result?.sentTo || "all"} users`);
      } else {
        const result = await segmentedBroadcast.mutateAsync({ title, message, type, segment, link: link || undefined });
        toast.success(`Sent to ${result?.sentTo || 0} users in segment`);
      }
      setTitle("");
      setMessage("");
      setLink("");
    } catch (e: any) {
      toast.error(e.message || "Failed to send");
    }
    setSending(false);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-lg font-medium tracking-tight">Notifications</h1>
        <p className="text-xs text-muted-foreground mt-1">Send broadcast notifications and manage notification history</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Total Sent", value: stats?.total || notifications?.length || 0, icon: Bell },
          { label: "Unread", value: stats?.unread || 0, icon: Eye },
          { label: "Types", value: Object.keys(typeStats).length, icon: Megaphone },
          { label: "Segments", value: SEGMENTS.length, icon: Users },
        ].map((s) => (
          <div key={s.label} className="card-subtle p-3 flex items-center gap-3">
            <div className="h-8 w-8 rounded-md bg-secondary flex items-center justify-center">
              <s.icon className="h-4 w-4 text-muted-foreground" />
            </div>
            <div>
              <div className="text-lg font-medium">{s.value}</div>
              <div className="text-[10px] text-muted-foreground">{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        {(["compose", "history"] as const).map((t) => (
          <button
            key={t}
            className={`px-4 py-2 text-xs font-medium transition-colors border-b-2 -mb-px ${
              tab === t
                ? "border-foreground text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => setTab(t)}
          >
            {t === "compose" ? "Compose" : `History (${notifications?.length || 0})`}
          </button>
        ))}
      </div>

      {/* Compose Tab */}
      {tab === "compose" && (
        <div className="grid md:grid-cols-3 gap-6">
          {/* Form */}
          <div className="md:col-span-2 space-y-4">
            <div className="card-subtle p-5 space-y-4">
              <h3 className="text-sm font-medium">New Notification</h3>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Title *</label>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="text-xs h-9"
                  placeholder="e.g. Maintenance Notice, New Feature, etc."
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Message *</label>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={4}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs resize-none"
                  placeholder="Write your notification message here..."
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Type</label>
                  <div className="relative">
                    <select
                      value={type}
                      onChange={(e) => setType(e.target.value)}
                      className="w-full h-9 rounded-md border border-input bg-background px-3 pr-8 text-xs appearance-none cursor-pointer"
                    >
                      {NOTIF_TYPES.map((t) => (
                        <option key={t.value} value={t.value}>{t.label}</option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Link (optional)</label>
                  <Input
                    value={link}
                    onChange={(e) => setLink(e.target.value)}
                    className="text-xs h-9"
                    placeholder="/dashboard/challenges"
                  />
                </div>
              </div>
              <Button
                size="sm"
                className="text-xs"
                onClick={handleBroadcast}
                disabled={sending || !title.trim() || !message.trim()}
              >
                {sending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Send className="h-3 w-3 mr-1" />}
                Send Notification
              </Button>
            </div>
          </div>

          {/* Segment Picker */}
          <div className="space-y-4">
            <div className="card-subtle p-5 space-y-3">
              <h3 className="text-sm font-medium">Target Audience</h3>
              <div className="space-y-2">
                {SEGMENTS.map((s) => (
                  <button
                    key={s.value}
                    className={`w-full p-3 rounded-lg border text-left transition-colors ${
                      segment === s.value
                        ? "border-foreground bg-secondary"
                        : "border-border hover:bg-secondary/30"
                    }`}
                    onClick={() => setSegment(s.value)}
                  >
                    <div className="text-xs font-medium">{s.label}</div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">{s.description}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Preview */}
            <div className="card-subtle p-5 space-y-3">
              <h3 className="text-sm font-medium">Preview</h3>
              {title || message ? (
                <div className="border rounded-lg p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <Bell className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-xs font-medium">{title || "Notification Title"}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">{message || "Your message will appear here..."}</p>
                  {link && <div className="text-[10px] text-primary">{link}</div>}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground text-center py-4">
                  Fill in the form to see a preview
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* History Tab */}
      {tab === "history" && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search notifications..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 h-9 text-xs"
              />
            </div>
            <div className="relative">
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="h-9 rounded-md border border-input bg-background px-3 pr-8 text-xs appearance-none cursor-pointer"
              >
                <option value="all">All Types</option>
                {NOTIF_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            </div>
          </div>

          {isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : filteredNotifications.length === 0 ? (
            <div className="card-subtle p-8 text-center text-sm text-muted-foreground">No notifications found</div>
          ) : (
            <div className="space-y-1">
              {filteredNotifications.map((n) => {
                const typeCfg = NOTIF_TYPES.find((t) => t.value === n.type) || NOTIF_TYPES[0];
                return (
                  <div key={n.id} className={`card-subtle p-4 flex items-start gap-3 ${!n.read ? "bg-secondary/20" : ""}`}>
                    <div className="h-8 w-8 rounded-full bg-secondary flex items-center justify-center shrink-0 mt-0.5">
                      <Bell className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{n.title}</span>
                        <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium ${typeCfg.color}`}>
                          {typeCfg.label}
                        </span>
                        {!n.read && <span className="h-2 w-2 rounded-full bg-blue-500" />}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.message}</p>
                      <div className="flex items-center gap-3 mt-1 text-[10px] text-muted-foreground">
                        <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{formatTime(n.createdAt)}</span>
                        <span>User {n.userId}</span>
                        {n.link && <span className="text-primary">{n.link}</span>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
