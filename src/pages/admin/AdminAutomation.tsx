/* eslint-disable @typescript-eslint/no-explicit-any */
import { useApiQuery } from "@/hooks/use-api";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { PageLoader } from "@/components/dashboard/PageLoader";
import { readResponseBody } from "@/lib/api";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Loader2,
  Clock,
  Webhook,
  Plug,
  Play,
  Pause,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Plus,
  Trash2,
  Edit2,
  ExternalLink,
  ArrowUpRight,
  ArrowDownRight,
  Timer,
  Calendar,
  Zap,
  Settings,
  X,
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

interface ScheduledTask {
  id: string;
  name: string;
  description: string;
  schedule: string;
  lastRun: number | null;
  nextRun: number | null;
  lastStatus: "success" | "failed" | "running" | "skipped" | null;
  isEnabled: boolean;
  runCount: number;
  avgDuration: number;
}

interface WebhookConfig {
  id: string;
  name: string;
  url: string;
  events: string[];
  isActive: boolean;
  lastTriggered: number | null;
  lastStatus: "success" | "failed" | null;
  failureCount: number;
  secret: string;
}

interface Integration {
  id: string;
  name: string;
  description: string;
  category: string;
  isConnected: boolean;
  lastSync: number | null;
  syncStatus: "ok" | "error" | "syncing" | null;
  config?: Record<string, string>;
}

const TASK_STATUS_ICONS: Record<string, any> = {
  success: CheckCircle2,
  failed: XCircle,
  running: Loader2,
  skipped: AlertTriangle,
};

const TASK_STATUS_COLORS: Record<string, string> = {
  success: "text-emerald-600",
  failed: "text-red-600",
  running: "text-blue-600 animate-spin",
  skipped: "text-amber-600",
};

export default function AdminAutomation() {
  const { data: tasksData, isLoading: tasksLoading, refetch: refetchTasks } = useApiQuery<any>(
    ["admin", "scheduledTasks"],
    "/api/admin/scheduled-tasks"
  );

  const { data: webhooksData, isLoading: webhooksLoading, refetch: refetchWebhooks } = useApiQuery<any>(
    ["admin", "webhooks"],
    "/api/admin/webhooks"
  );

  const { data: integrationsData, isLoading: integrationsLoading, refetch: refetchIntegrations } = useApiQuery<any>(
    ["admin", "integrations"],
    "/api/admin/integrations"
  );

  const [activeTab, setActiveTab] = useState<"tasks" | "webhooks" | "integrations">("tasks");
  const [showWebhookForm, setShowWebhookForm] = useState(false);
  const [webhookForm, setWebhookForm] = useState({ name: "", url: "", events: "" });
  const [deleteTarget, setDeleteTarget] = useState<{ type: string; id: string; label: string } | null>(null);

  const handleRunTask = async (taskId: string) => {
    try {
      await fetch(`/api/admin/scheduled-tasks/${taskId}/run`, {
        method: "POST",
        credentials: "include",
      });
      toast.success("Task triggered");
      refetchTasks();
    } catch {
      toast.error("Failed to trigger task");
    }
  };

  const handleToggleTask = async (taskId: string, enabled: boolean) => {
    try {
      await fetch(`/api/admin/scheduled-tasks/${taskId}/toggle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ enabled }),
      });
      toast.success(enabled ? "Task enabled" : "Task disabled");
      refetchTasks();
    } catch {
      toast.error("Failed to toggle task");
    }
  };

  const handleCreateWebhook = async () => {
    if (!webhookForm.name.trim() || !webhookForm.url.trim()) {
      toast.error("Name and URL are required");
      return;
    }
    try {
      await fetch("/api/admin/webhooks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: webhookForm.name,
          url: webhookForm.url,
          events: webhookForm.events.split(",").map((e) => e.trim()).filter(Boolean),
        }),
      });
      toast.success("Webhook created");
      setShowWebhookForm(false);
      setWebhookForm({ name: "", url: "", events: "" });
      refetchWebhooks();
    } catch {
      toast.error("Failed to create webhook");
    }
  };

  const handleDeleteWebhook = async () => {
    if (!deleteTarget) return;
    try {
      await fetch(`/api/admin/webhooks/${deleteTarget.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      toast.success("Webhook deleted");
      setDeleteTarget(null);
      refetchWebhooks();
    } catch {
      toast.error("Failed to delete webhook");
    }
  };

  const handleTestWebhook = async (webhookId: string) => {
    try {
      await fetch(`/api/admin/webhooks/${webhookId}/test`, {
        method: "POST",
        credentials: "include",
      });
      toast.success("Test webhook sent");
      refetchWebhooks();
    } catch {
      toast.error("Failed to send test webhook");
    }
  };

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
  };

  const formatSchedule = (cron: string) => {
    if (!cron) return "Unknown";
    if (cron.includes("* * * * *")) return "Every minute";
    if (cron.includes("*/5 * * * *")) return "Every 5 minutes";
    if (cron.includes("*/15 * * * *")) return "Every 15 minutes";
    if (cron.includes("*/30 * * * *")) return "Every 30 minutes";
    if (cron.includes("0 * * * *")) return "Every hour";
    if (cron.includes("0 0 * * *")) return "Daily at midnight";
    if (cron.includes("0 9 * * *")) return "Daily at 9:00 AM";
    return cron;
  };

  if (tasksLoading || webhooksLoading || integrationsLoading) return <PageLoader />;

  const tasks: ScheduledTask[] = tasksData?.tasks || [
    { id: "mt5-sync", name: "MT5 Account Sync", description: "Syncs MT5 account balances and equity data", schedule: "*/5 * * * *", lastRun: Date.now() - 300000, nextRun: Date.now() + 30000, lastStatus: "success", isEnabled: true, runCount: 2880, avgDuration: 1200 },
    { id: "metrics-snapshot", name: "Metrics Snapshot", description: "Captures daily trading metrics for all active challenges", schedule: "0 0 * * *", lastRun: Date.now() - 86400000, nextRun: Date.now() + 43200000, lastStatus: "success", isEnabled: true, runCount: 365, avgDuration: 5400 },
    { id: "violation-check", name: "Violation Rule Engine", description: "Evaluates all active challenges for rule violations", schedule: "*/15 * * * *", lastRun: Date.now() - 900000, nextRun: Date.now() + 60000, lastStatus: "success", isEnabled: true, runCount: 9600, avgDuration: 3400 },
    { id: "digest-email", name: "Weekly Digest Email", description: "Sends violation digest to admins every 7 days", schedule: "0 9 * * 1", lastRun: Date.now() - 432000000, nextRun: Date.now() + 259200000, lastStatus: "success", isEnabled: true, runCount: 52, avgDuration: 8000 },
    { id: "stale-payment-cleanup", name: "Stale Payment Cleanup", description: "Archives abandoned payments older than 24 hours", schedule: "0 */6 * * *", lastRun: Date.now() - 21600000, nextRun: Date.now() + 21600000, lastStatus: "success", isEnabled: true, runCount: 1460, avgDuration: 2200 },
    { id: "session-cleanup", name: "Session Cleanup", description: "Removes expired authentication sessions", schedule: "0 2 * * *", lastRun: Date.now() - 72000000, nextRun: Date.now() + 14400000, lastStatus: "success", isEnabled: true, runCount: 365, avgDuration: 800 },
    { id: "leaderboard-update", name: "Leaderboard Update", description: "Recalculates trader leaderboard rankings", schedule: "*/30 * * * *", lastRun: Date.now() - 1800000, nextRun: Date.now() + 1200000, lastStatus: "running", isEnabled: true, runCount: 4800, avgDuration: 4500 },
  ];

  const webhooks: WebhookConfig[] = webhooksData?.webhooks || [
    { id: "wh-1", name: "Payment Notifications", url: "https://hooks.example.com/payments", events: ["payment.completed", "payment.refunded"], isActive: true, lastTriggered: Date.now() - 3600000, lastStatus: "success", failureCount: 0, secret: "whsec_***" },
    { id: "wh-2", name: "Slack Alerts", url: "https://hooks.slack.com/services/T00/B00/xxx", events: ["challenge.violated", "kyc.rejected"], isActive: true, lastTriggered: Date.now() - 7200000, lastStatus: "success", failureCount: 2, secret: "whsec_***" },
    { id: "wh-3", name: "Analytics Pipeline", url: "https://analytics.example.com/ingest", events: ["user.registered", "challenge.purchased", "payment.completed"], isActive: false, lastTriggered: null, lastStatus: "failed", failureCount: 15, secret: "whsec_***" },
  ];

  const integrations: Integration[] = integrationsData?.integrations || [
    { id: "mt5", name: "MetaTrader 5", description: "Trading platform integration", category: "Trading", isConnected: true, lastSync: Date.now() - 300000, syncStatus: "ok" },
    { id: "flutterwave", name: "Flutterwave", description: "Payment processing", category: "Payments", isConnected: true, lastSync: Date.now() - 3600000, syncStatus: "ok" },
    { id: "resend", name: "Resend", description: "Transactional email service", category: "Email", isConnected: true, lastSync: Date.now() - 600000, syncStatus: "ok" },
    { id: "redis", name: "Redis", description: "Caching and sessions", category: "Infrastructure", isConnected: true, lastSync: Date.now() - 60000, syncStatus: "ok" },
    { id: "prometheus", name: "Prometheus", description: "Metrics collection", category: "Monitoring", isConnected: false, lastSync: null, syncStatus: null },
    { id: "grafana", name: "Grafana", description: "Dashboard & alerting", category: "Monitoring", isConnected: false, lastSync: null, syncStatus: null },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="System"
        title="Automation"
        subtitle="Manage scheduled tasks, webhooks, and integrations"
      />

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        {(["tasks", "webhooks", "integrations"] as const).map((tab) => (
          <button
            key={tab}
            className={`px-4 py-2 text-xs font-medium transition-colors border-b-2 -mb-px capitalize ${
              activeTab === tab
                ? "border-foreground text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => setActiveTab(tab)}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Scheduled Tasks */}
      {activeTab === "tasks" && (
        <div className="space-y-2">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-muted-foreground">
              {tasks.filter((t) => t.isEnabled).length} of {tasks.length} tasks enabled
            </span>
            <Button variant="outline" size="sm" className="text-xs" onClick={() => refetchTasks()}>
              <RefreshCw className="h-3 w-3 mr-1" /> Refresh
            </Button>
          </div>
          {tasks.map((task) => {
            const StatusIcon = task.lastStatus ? TASK_STATUS_ICONS[task.lastStatus] : Clock;
            const statusColor = task.lastStatus ? TASK_STATUS_COLORS[task.lastStatus] : "text-muted-foreground";

            return (
              <div key={task.id} className={`card-subtle p-4 transition-colors ${!task.isEnabled ? "opacity-60" : ""}`}>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="h-8 w-8 rounded-md bg-secondary flex items-center justify-center shrink-0">
                      <StatusIcon className={`h-4 w-4 ${statusColor}`} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium">{task.name}</span>
                        {task.lastStatus === "running" && (
                          <span className="inline-flex items-center rounded-full bg-blue-500/10 px-1.5 py-0.5 text-[9px] text-blue-600 font-medium">
                            Running
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">{task.description}</div>
                      <div className="flex items-center gap-3 mt-1 text-[10px] text-muted-foreground">
                        <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {formatSchedule(task.schedule)}</span>
                        <span>{task.runCount.toLocaleString()} runs</span>
                        <span>Avg {formatDuration(task.avgDuration)}</span>
                        {task.lastRun && <span>Last: {new Date(task.lastRun).toLocaleTimeString()}</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="h-7 w-7"
                      title="Run now"
                      onClick={() => handleRunTask(task.id)}
                      disabled={!task.isEnabled}
                    >
                      <Play className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="h-7 w-7"
                      title={task.isEnabled ? "Disable" : "Enable"}
                      onClick={() => handleToggleTask(task.id, !task.isEnabled)}
                    >
                      {task.isEnabled ? <Pause className="h-3.5 w-3.5 text-emerald-600" /> : <Play className="h-3.5 w-3.5" />}
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Webhooks */}
      {activeTab === "webhooks" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">{webhooks.length} webhook{webhooks.length !== 1 ? "s" : ""} configured</span>
            <Button size="sm" className="text-xs" onClick={() => setShowWebhookForm(true)}>
              <Plus className="h-3 w-3 mr-1" /> New Webhook
            </Button>
          </div>

          {webhooks.map((wh) => (
            <div key={wh.id} className={`card-subtle p-4 transition-colors ${!wh.isActive ? "opacity-60" : ""}`}>
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0">
                  <div className={`h-8 w-8 rounded-md flex items-center justify-center shrink-0 ${
                    wh.lastStatus === "success" ? "bg-emerald-500/10 text-emerald-600" :
                    wh.lastStatus === "failed" ? "bg-red-500/10 text-red-600" :
                    "bg-secondary text-muted-foreground"
                  }`}>
                    <Webhook className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium">{wh.name}</span>
                      {wh.failureCount > 0 && (
                        <span className="inline-flex items-center rounded-full bg-red-500/10 px-1.5 py-0.5 text-[9px] text-red-600 font-medium">
                          {wh.failureCount} failures
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-muted-foreground font-mono mt-0.5 truncate max-w-[400px]">{wh.url}</div>
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      {wh.events.map((evt) => (
                        <span key={evt} className="inline-flex items-center rounded-full bg-secondary px-1.5 py-0.5 text-[9px] font-medium">
                          {evt}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button variant="ghost" size="icon-sm" className="h-7 w-7" title="Test" onClick={() => handleTestWebhook(wh.id)}>
                    <Play className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon-sm" className="h-7 w-7" title="Delete" onClick={() => setDeleteTarget({ type: "webhook", id: wh.id, label: wh.name })}>
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </div>
              </div>
            </div>
          ))}

          {/* Webhook Form Modal */}
          {showWebhookForm && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowWebhookForm(false)}>
              <div className="bg-background border rounded-lg shadow-lg w-full max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between p-4 border-b">
                  <h3 className="text-sm font-medium">New Webhook</h3>
                  <button onClick={() => setShowWebhookForm(false)} className="text-muted-foreground hover:text-foreground">
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="p-4 space-y-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium">Name</label>
                    <Input value={webhookForm.name} onChange={(e) => setWebhookForm({ ...webhookForm, name: e.target.value })} placeholder="e.g. Slack Notifications" className="text-xs" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium">URL</label>
                    <Input value={webhookForm.url} onChange={(e) => setWebhookForm({ ...webhookForm, url: e.target.value })} placeholder="https://..." className="text-xs" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium">Events (comma-separated)</label>
                    <Input value={webhookForm.events} onChange={(e) => setWebhookForm({ ...webhookForm, events: e.target.value })} placeholder="payment.completed, challenge.violated" className="text-xs" />
                  </div>
                </div>
                <div className="flex justify-end gap-2 p-4 border-t">
                  <Button variant="outline" size="sm" className="text-xs" onClick={() => setShowWebhookForm(false)}>Cancel</Button>
                  <Button size="sm" className="text-xs" onClick={handleCreateWebhook}>Create</Button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Integrations */}
      {activeTab === "integrations" && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {integrations.map((integration) => (
            <div key={integration.id} className="card-subtle p-4">
              <div className="flex items-start justify-between gap-2 mb-3">
                <div className="flex items-center gap-2.5">
                  <div className={`h-8 w-8 rounded-md flex items-center justify-center ${
                    integration.isConnected ? "bg-emerald-500/10 text-emerald-600" : "bg-secondary text-muted-foreground"
                  }`}>
                    <Plug className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="text-xs font-medium">{integration.name}</h3>
                    <p className="text-[10px] text-muted-foreground">{integration.description}</p>
                  </div>
                </div>
                <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${
                  integration.isConnected ? "bg-emerald-500" : "bg-muted-foreground/30"
                }`} />
              </div>
              <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                <span className="inline-flex items-center rounded-full bg-secondary px-1.5 py-0.5 font-medium">
                  {integration.category}
                </span>
                {integration.lastSync && (
                  <span>Last sync: {new Date(integration.lastSync).toLocaleTimeString()}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteTarget?.type === "webhook" ? "Webhook" : "Task"}</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "<strong>{deleteTarget?.label}</strong>"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-white hover:bg-destructive/90" onClick={handleDeleteWebhook}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
