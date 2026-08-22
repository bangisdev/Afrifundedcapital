/* eslint-disable @typescript-eslint/no-explicit-any */
import { useApiQuery, useApiMutation } from "@/hooks/use-api";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { PageLoader } from "@/components/dashboard/PageLoader";
import { readResponseBody } from "@/lib/api";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Loader2,
  Megaphone,
  Plus,
  Edit2,
  Trash2,
  Eye,
  EyeOff,
  CheckCircle,
  Clock,
  AlertTriangle,
  X,
  Send,
  Calendar,
  BarChart3,
} from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface Announcement {
  id: number;
  title: string;
  message: string;
  type: "info" | "warning" | "maintenance" | "update";
  priority: "low" | "medium" | "high" | "urgent";
  isActive: boolean;
  showBanner: boolean;
  targetAudience: "all" | "traders" | "admins" | "new_users";
  createdBy: number;
  createdAt: number;
  updatedAt: number;
  expiresAt: number | null;
  viewCount: number;
}

const TYPE_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  info: { label: "Info", color: "bg-blue-500/10 text-blue-600 border-blue-500/20", icon: AlertTriangle },
  warning: { label: "Warning", color: "bg-amber-500/10 text-amber-600 border-amber-500/20", icon: AlertTriangle },
  maintenance: { label: "Maintenance", color: "bg-red-500/10 text-red-600 border-red-500/20", icon: Clock },
  update: { label: "Update", color: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20", icon: CheckCircle },
};

const PRIORITY_CONFIG: Record<string, { label: string; color: string }> = {
  low: { label: "Low", color: "bg-secondary text-secondary-foreground" },
  medium: { label: "Medium", color: "bg-blue-500/10 text-blue-600" },
  high: { label: "High", color: "bg-amber-500/10 text-amber-600" },
  urgent: { label: "Urgent", color: "bg-red-500/10 text-red-600" },
};

const AUDIENCE_LABELS: Record<string, string> = {
  all: "All Users",
  traders: "Traders",
  admins: "Admins",
  new_users: "New Users",
};

export default function AdminAnnouncements() {
  const { data: announcements, isLoading, refetch } = useApiQuery<Announcement[]>(
    ["admin", "announcements"],
    "/api/admin/announcements"
  );

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({
    title: "",
    message: "",
    type: "info" as string,
    priority: "medium" as string,
    targetAudience: "all" as string,
    showBanner: false,
    expiresAt: "",
  });
  const [deleteTarget, setDeleteTarget] = useState<Announcement | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!form.title.trim() || !form.message.trim()) {
      toast.error("Title and message are required");
      return;
    }
    setSubmitting(true);
    try {
      const body: any = {
        title: form.title,
        message: form.message,
        type: form.type,
        priority: form.priority,
        targetAudience: form.targetAudience,
        showBanner: form.showBanner,
        expiresAt: form.expiresAt ? new Date(form.expiresAt).getTime() : null,
      };

      const url = editingId
        ? `/api/admin/announcements/${editingId}`
        : "/api/admin/announcements";
      const method = editingId ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });

      if (!res.ok) throw new Error("Failed to save announcement");

      toast.success(editingId ? "Announcement updated" : "Announcement created");
      setShowForm(false);
      setEditingId(null);
      resetForm();
      refetch();
    } catch (err: any) {
      toast.error(err?.message || "Failed to save");
    }
    setSubmitting(false);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await fetch(`/api/admin/announcements/${deleteTarget.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      toast.success("Announcement deleted");
      setDeleteTarget(null);
      refetch();
    } catch {
      toast.error("Failed to delete");
    }
  };

  const handleToggleActive = async (ann: Announcement) => {
    try {
      await fetch(`/api/admin/announcements/${ann.id}/toggle`, {
        method: "POST",
        credentials: "include",
      });
      toast.success(ann.isActive ? "Announcement deactivated" : "Announcement activated");
      refetch();
    } catch {
      toast.error("Failed to toggle");
    }
  };

  const handleEdit = (ann: Announcement) => {
    setEditingId(ann.id);
    setForm({
      title: ann.title,
      message: ann.message,
      type: ann.type,
      priority: ann.priority,
      targetAudience: ann.targetAudience,
      showBanner: ann.showBanner,
      expiresAt: ann.expiresAt ? new Date(ann.expiresAt).toISOString().slice(0, 16) : "",
    });
    setShowForm(true);
  };

  const resetForm = () => {
    setForm({
      title: "",
      message: "",
      type: "info",
      priority: "medium",
      targetAudience: "all",
      showBanner: false,
      expiresAt: "",
    });
  };

  if (isLoading) return <PageLoader />;

  const allAnnouncements = announcements || [];
  const activeCount = allAnnouncements.filter((a) => a.isActive).length;
  const bannerCount = allAnnouncements.filter((a) => a.showBanner).length;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Communications"
        title="Announcements"
        subtitle="Manage platform-wide announcements and banners"
        actions={
          <Button
            size="sm"
            className="text-xs"
            onClick={() => { resetForm(); setEditingId(null); setShowForm(true); }}
          >
            <Plus className="h-3 w-3 mr-1" /> New Announcement
          </Button>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="card-subtle p-3 flex items-center gap-3">
          <div className="h-8 w-8 rounded-md bg-secondary flex items-center justify-center">
            <Megaphone className="h-4 w-4 text-muted-foreground" />
          </div>
          <div>
            <div className="text-lg font-medium">{allAnnouncements.length}</div>
            <div className="text-[10px] text-muted-foreground">Total</div>
          </div>
        </div>
        <div className="card-subtle p-3 flex items-center gap-3">
          <div className="h-8 w-8 rounded-md bg-emerald-500/10 flex items-center justify-center">
            <Eye className="h-4 w-4 text-emerald-600" />
          </div>
          <div>
            <div className="text-lg font-medium">{activeCount}</div>
            <div className="text-[10px] text-muted-foreground">Active</div>
          </div>
        </div>
        <div className="card-subtle p-3 flex items-center gap-3">
          <div className="h-8 w-8 rounded-md bg-blue-500/10 flex items-center justify-center">
            <BarChart3 className="h-4 w-4 text-blue-600" />
          </div>
          <div>
            <div className="text-lg font-medium">{bannerCount}</div>
            <div className="text-[10px] text-muted-foreground">Banners</div>
          </div>
        </div>
        <div className="card-subtle p-3 flex items-center gap-3">
          <div className="h-8 w-8 rounded-md bg-secondary flex items-center justify-center">
            <Send className="h-4 w-4 text-muted-foreground" />
          </div>
          <div>
            <div className="text-lg font-medium">{allAnnouncements.filter((a) => a.priority === "urgent").length}</div>
            <div className="text-[10px] text-muted-foreground">Urgent</div>
          </div>
        </div>
      </div>

      {/* Announcement Form Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowForm(false)}>
          <div className="bg-background border rounded-lg shadow-lg w-full max-w-lg mx-4 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="text-sm font-medium">{editingId ? "Edit Announcement" : "New Announcement"}</h3>
              <button onClick={() => { setShowForm(false); setEditingId(null); }} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-4 space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium">Title</label>
                <Input
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="e.g. Scheduled Maintenance"
                  className="text-xs"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium">Message</label>
                <Textarea
                  value={form.message}
                  onChange={(e) => setForm({ ...form, message: e.target.value })}
                  placeholder="Announcement details..."
                  className="text-xs min-h-[100px]"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium">Type</label>
                  <select
                    value={form.type}
                    onChange={(e) => setForm({ ...form, type: e.target.value })}
                    className="h-9 w-full rounded-md border border-input bg-background px-3 text-xs"
                  >
                    <option value="info">Info</option>
                    <option value="warning">Warning</option>
                    <option value="maintenance">Maintenance</option>
                    <option value="update">Update</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium">Priority</label>
                  <select
                    value={form.priority}
                    onChange={(e) => setForm({ ...form, priority: e.target.value })}
                    className="h-9 w-full rounded-md border border-input bg-background px-3 text-xs"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium">Target Audience</label>
                  <select
                    value={form.targetAudience}
                    onChange={(e) => setForm({ ...form, targetAudience: e.target.value })}
                    className="h-9 w-full rounded-md border border-input bg-background px-3 text-xs"
                  >
                    <option value="all">All Users</option>
                    <option value="traders">Traders</option>
                    <option value="admins">Admins</option>
                    <option value="new_users">New Users</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium">Expires At (optional)</label>
                  <input
                    type="datetime-local"
                    value={form.expiresAt}
                    onChange={(e) => setForm({ ...form, expiresAt: e.target.value })}
                    className="h-9 w-full rounded-md border border-input bg-background px-3 text-xs"
                  />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="showBanner"
                  checked={form.showBanner}
                  onChange={(e) => setForm({ ...form, showBanner: e.target.checked })}
                  className="rounded border-input"
                />
                <label htmlFor="showBanner" className="text-xs text-muted-foreground">
                  Show as top banner on dashboard
                </label>
              </div>
            </div>
            <div className="flex justify-end gap-2 p-4 border-t">
              <Button variant="outline" size="sm" className="text-xs" onClick={() => { setShowForm(false); setEditingId(null); }}>
                Cancel
              </Button>
              <Button size="sm" className="text-xs" onClick={handleSubmit} disabled={submitting}>
                {submitting ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                {editingId ? "Update" : "Create"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Announcements List */}
      <div className="space-y-2">
        {allAnnouncements.length === 0 ? (
          <div className="card-subtle p-12 text-center">
            <Megaphone className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">No announcements yet</p>
            <p className="text-xs text-muted-foreground mt-1">Create your first announcement to notify users</p>
          </div>
        ) : (
          allAnnouncements.map((ann) => {
            const typeCfg = TYPE_CONFIG[ann.type] || TYPE_CONFIG.info;
            const priorityCfg = PRIORITY_CONFIG[ann.priority] || PRIORITY_CONFIG.medium;
            const TypeIcon = typeCfg.icon;
            const isExpired = ann.expiresAt && ann.expiresAt < Date.now();

            return (
              <div
                key={ann.id}
                className={`card-subtle p-4 transition-colors ${
                  !ann.isActive ? "opacity-60" : ""
                } ${isExpired ? "border-amber-500/20" : ""}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className={`h-8 w-8 rounded-md flex items-center justify-center shrink-0 ${typeCfg.color.split(" ").slice(0, 2).join(" ")}`}>
                      <TypeIcon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium truncate">{ann.title}</span>
                        <span className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[9px] font-medium ${typeCfg.color}`}>
                          {typeCfg.label}
                        </span>
                        <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-medium ${priorityCfg.color}`}>
                          {priorityCfg.label}
                        </span>
                        {ann.showBanner && (
                          <span className="inline-flex items-center rounded-full bg-blue-500/10 px-1.5 py-0.5 text-[9px] text-blue-600 font-medium">
                            Banner
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{ann.message}</p>
                      <div className="flex items-center gap-3 mt-2 text-[10px] text-muted-foreground">
                        <span>Target: {AUDIENCE_LABELS[ann.targetAudience] || ann.targetAudience}</span>
                        <span>·</span>
                        <span>{new Date(ann.createdAt).toLocaleDateString()}</span>
                        {ann.expiresAt && (
                          <>
                            <span>·</span>
                            <span className={isExpired ? "text-amber-600" : ""}>
                              Expires {new Date(ann.expiresAt).toLocaleDateString()}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="h-7 w-7"
                      title={ann.isActive ? "Deactivate" : "Activate"}
                      onClick={() => handleToggleActive(ann)}
                    >
                      {ann.isActive ? <Eye className="h-3.5 w-3.5 text-emerald-600" /> : <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="h-7 w-7"
                      title="Edit"
                      onClick={() => handleEdit(ann)}
                    >
                      <Edit2 className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="h-7 w-7"
                      title="Delete"
                      onClick={() => setDeleteTarget(ann)}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Delete Dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Announcement</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "<strong>{deleteTarget?.title}</strong>"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-white hover:bg-destructive/90" onClick={handleDelete}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
