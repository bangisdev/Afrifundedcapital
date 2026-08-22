/* eslint-disable @typescript-eslint/no-explicit-any */
import { useApiQuery } from "@/hooks/use-api";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { PageLoader } from "@/components/dashboard/PageLoader";
import { readResponseBody } from "@/lib/api";
import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  Loader2,
  Server,
  Database,
  Activity,
  Clock,
  Cpu,
  HardDrive,
  Wifi,
  WifiOff,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ArrowUpRight,
  Zap,
  Globe,
  Shield,
  MemoryStick,
  Timer,
} from "lucide-react";

interface HealthCheck {
  status: "ok" | "degraded" | "down";
  latency: number;
  lastChecked: number;
  details?: string;
}

interface SystemMetrics {
  uptime: number;
  memoryUsage: { used: number; total: number; percentage: number };
  cpuUsage: number;
  diskUsage: { used: number; total: number; percentage: number };
  activeConnections: number;
  requestsPerMinute: number;
  avgResponseTime: number;
  errorRate: number;
}

interface DatabaseStats {
  totalTables: number;
  totalRows: number;
  dbSize: string;
  activeConnections: number;
  maxConnections: number;
  cacheHitRate: number;
  slowQueries: number;
}

function StatusIndicator({ status }: { status: "ok" | "degraded" | "down" }) {
  return (
    <div className="flex items-center gap-2">
      <div className={`h-2.5 w-2.5 rounded-full ${
        status === "ok" ? "bg-emerald-500 animate-pulse" :
        status === "degraded" ? "bg-amber-500 animate-pulse" :
        "bg-red-500"
      }`} />
      <span className={`text-xs font-medium capitalize ${
        status === "ok" ? "text-emerald-600" :
        status === "degraded" ? "text-amber-600" :
        "text-red-600"
      }`}>
        {status}
      </span>
    </div>
  );
}

function MetricCard({ label, value, icon, subtitle, status }: {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  subtitle?: string;
  status?: "ok" | "warning" | "error";
}) {
  return (
    <div className="card-subtle p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground mb-1.5">
            {label}
          </p>
          <p className="text-2xl font-medium">{value}</p>
          {subtitle && <p className="text-[10px] text-muted-foreground mt-1">{subtitle}</p>}
        </div>
        <div className={`icon-chip shrink-0 ${
          status === "warning" ? "bg-amber-500/10 text-amber-600 border-amber-500/20" :
          status === "error" ? "bg-red-500/10 text-red-600 border-red-500/20" :
          "bg-secondary text-foreground/70"
        }`}>
          {icon}
        </div>
      </div>
    </div>
  );
}

function ProgressBar({ value, max, color = "bg-brand" }: { value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="w-full h-2 bg-secondary rounded-full overflow-hidden">
      <div
        className={`h-full rounded-full transition-all ${color}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export default function AdminSystemHealth() {
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState(Date.now());

  const { data: healthData, isLoading, refetch } = useApiQuery<any>(
    ["admin", "systemHealth"],
    "/api/admin/system-health"
  );

  const { data: dbStats } = useApiQuery<any>(
    ["admin", "dbStats"],
    "/api/admin/db-stats"
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refetch();
      setLastRefresh(Date.now());
      toast.success("System health refreshed");
    } catch {
      toast.error("Failed to refresh");
    }
    setRefreshing(false);
  }, [refetch]);

  const formatUptime = (seconds: number) => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    if (days > 0) return `${days}d ${hours}h ${mins}m`;
    if (hours > 0) return `${hours}h ${mins}m`;
    return `${mins}m`;
  };

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };

  if (isLoading) return <PageLoader />;

  const health = healthData || {};
  const db = dbStats || {};
  const metrics = health.metrics || {};
  const services = health.services || [];

  const overallStatus = services.every((s: any) => s.status === "ok")
    ? "ok"
    : services.some((s: any) => s.status === "down")
      ? "down"
      : "degraded";

  const memPct = metrics.memoryUsage?.percentage || 0;
  const diskPct = metrics.diskUsage?.percentage || 0;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="System"
        title="System Health"
        subtitle="Monitor server status, performance metrics, and infrastructure"
        actions={
          <Button variant="outline" size="sm" className="text-xs" onClick={handleRefresh} disabled={refreshing}>
            {refreshing ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <RefreshCw className="h-3 w-3 mr-1" />}
            {refreshing ? "Refreshing..." : "Refresh"}
          </Button>
        }
      />

      {/* Overall Status Banner */}
      <div className={`card-subtle p-4 flex items-center gap-4 ${
        overallStatus === "ok" ? "border-emerald-500/20" :
        overallStatus === "degraded" ? "border-amber-500/20" :
        "border-red-500/20"
      }`}>
        <div className={`h-12 w-12 rounded-xl flex items-center justify-center shrink-0 ${
          overallStatus === "ok" ? "bg-emerald-500/10 text-emerald-600" :
          overallStatus === "degraded" ? "bg-amber-500/10 text-amber-600" :
          "bg-red-500/10 text-red-600"
        }`}>
          {overallStatus === "ok" ? <CheckCircle2 className="h-6 w-6" /> :
           overallStatus === "degraded" ? <AlertTriangle className="h-6 w-6" /> :
           <XCircle className="h-6 w-6" />}
        </div>
        <div className="flex-1">
          <h2 className="text-sm font-medium">
            {overallStatus === "ok" ? "All Systems Operational" :
             overallStatus === "degraded" ? "Some Systems Degraded" :
             "System Outage Detected"}
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Last checked {new Date(lastRefresh).toLocaleTimeString()} · Auto-refreshes every 30s
          </p>
        </div>
        <StatusIndicator status={overallStatus} />
      </div>

      {/* Core Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          label="Uptime"
          value={formatUptime(metrics.uptime || 0)}
          icon={<Clock className="h-4 w-4" />}
          subtitle="Since last restart"
          status="ok"
        />
        <MetricCard
          label="CPU Usage"
          value={`${metrics.cpuUsage || 0}%`}
          icon={<Cpu className="h-4 w-4" />}
          subtitle="Current load"
          status={metrics.cpuUsage > 80 ? "error" : metrics.cpuUsage > 60 ? "warning" : "ok"}
        />
        <MetricCard
          label="Memory"
          value={`${memPct}%`}
          icon={<MemoryStick className="h-4 w-4" />}
          subtitle={metrics.memoryUsage ? `${formatBytes(metrics.memoryUsage.used)} / ${formatBytes(metrics.memoryUsage.total)}` : "N/A"}
          status={memPct > 90 ? "error" : memPct > 75 ? "warning" : "ok"}
        />
        <MetricCard
          label="Disk Usage"
          value={`${diskPct}%`}
          icon={<HardDrive className="h-4 w-4" />}
          subtitle={metrics.diskUsage ? `${formatBytes(metrics.diskUsage.used)} / ${formatBytes(metrics.diskUsage.total)}` : "N/A"}
          status={diskPct > 90 ? "error" : diskPct > 80 ? "warning" : "ok"}
        />
      </div>

      {/* Request Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          label="Requests/min"
          value={metrics.requestsPerMinute || 0}
          icon={<Zap className="h-4 w-4" />}
          subtitle="Current throughput"
        />
        <MetricCard
          label="Avg Response"
          value={`${metrics.avgResponseTime || 0}ms`}
          icon={<Timer className="h-4 w-4" />}
          subtitle="API latency"
          status={metrics.avgResponseTime > 500 ? "error" : metrics.avgResponseTime > 200 ? "warning" : "ok"}
        />
        <MetricCard
          label="Error Rate"
          value={`${(metrics.errorRate || 0).toFixed(2)}%`}
          icon={<AlertTriangle className="h-4 w-4" />}
          subtitle="5xx responses"
          status={metrics.errorRate > 5 ? "error" : metrics.errorRate > 1 ? "warning" : "ok"}
        />
        <MetricCard
          label="Active Connections"
          value={metrics.activeConnections || 0}
          icon={<Wifi className="h-4 w-4" />}
          subtitle="Open sockets"
        />
      </div>

      {/* Service Health */}
      <div className="card-subtle p-6">
        <h2 className="text-sm font-medium mb-4 flex items-center gap-2">
          <Globe className="h-4 w-4 text-muted-foreground" />
          Service Health
        </h2>
        {services.length === 0 ? (
          <p className="text-xs text-muted-foreground">No service data available</p>
        ) : (
          <div className="space-y-3">
            {services.map((service: any, i: number) => (
              <div key={i} className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
                <div className="flex items-center gap-3">
                  <div className={`h-8 w-8 rounded-md flex items-center justify-center ${
                    service.status === "ok" ? "bg-emerald-500/10 text-emerald-600" :
                    service.status === "degraded" ? "bg-amber-500/10 text-amber-600" :
                    "bg-red-500/10 text-red-600"
                  }`}>
                    {service.status === "ok" ? <CheckCircle2 className="h-4 w-4" /> :
                     service.status === "degraded" ? <AlertTriangle className="h-4 w-4" /> :
                     <XCircle className="h-4 w-4" />}
                  </div>
                  <div>
                    <div className="text-xs font-medium">{service.name || "Unknown Service"}</div>
                    <div className="text-[10px] text-muted-foreground">{service.details || ""}</div>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-[10px] text-muted-foreground tabular-nums">
                    {service.latency ? `${service.latency}ms` : ""}
                  </span>
                  <StatusIndicator status={service.status || "ok"} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Database Stats */}
      <div className="card-subtle p-6">
        <h2 className="text-sm font-medium mb-4 flex items-center gap-2">
          <Database className="h-4 w-4 text-muted-foreground" />
          Database Statistics
        </h2>
        {db ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <div className="text-[10px] text-muted-foreground mb-1">Database Size</div>
                <div className="text-lg font-medium">{db.dbSize || "N/A"}</div>
              </div>
              <div>
                <div className="text-[10px] text-muted-foreground mb-1">Total Rows</div>
                <div className="text-lg font-medium">{(db.totalRows || 0).toLocaleString()}</div>
              </div>
              <div>
                <div className="text-[10px] text-muted-foreground mb-1">Connections</div>
                <div className="text-lg font-medium">{db.activeConnections || 0} / {db.maxConnections || 0}</div>
              </div>
              <div>
                <div className="text-[10px] text-muted-foreground mb-1">Cache Hit Rate</div>
                <div className="text-lg font-medium">{db.cacheHitRate || 0}%</div>
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Connection Pool</span>
                <span className="tabular-nums">{db.activeConnections || 0} / {db.maxConnections || 100}</span>
              </div>
              <ProgressBar
                value={db.activeConnections || 0}
                max={db.maxConnections || 100}
                color={(db.activeConnections || 0) / (db.maxConnections || 100) > 0.8 ? "bg-red-500" : "bg-brand"}
              />
            </div>
            {db.slowQueries > 0 && (
              <div className="flex items-center gap-2 p-2 bg-amber-500/5 border border-amber-500/20 rounded text-xs text-amber-600">
                <AlertTriangle className="h-3 w-3" />
                {db.slowQueries} slow query{db.slowQueries !== 1 ? "s" : ""} detected in the last hour
              </div>
            )}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Database statistics not available</p>
        )}
      </div>

      {/* Resource Usage Bars */}
      <div className="card-subtle p-6">
        <h2 className="text-sm font-medium mb-4 flex items-center gap-2">
          <Activity className="h-4 w-4 text-muted-foreground" />
          Resource Usage
        </h2>
        <div className="space-y-4">
          <div>
            <div className="flex items-center justify-between text-xs mb-1.5">
              <span className="text-muted-foreground">CPU</span>
              <span className="tabular-nums font-medium">{metrics.cpuUsage || 0}%</span>
            </div>
            <ProgressBar
              value={metrics.cpuUsage || 0}
              max={100}
              color={(metrics.cpuUsage || 0) > 80 ? "bg-red-500" : (metrics.cpuUsage || 0) > 60 ? "bg-amber-500" : "bg-emerald-500"}
            />
          </div>
          <div>
            <div className="flex items-center justify-between text-xs mb-1.5">
              <span className="text-muted-foreground">Memory</span>
              <span className="tabular-nums font-medium">{memPct}%</span>
            </div>
            <ProgressBar
              value={memPct}
              max={100}
              color={memPct > 90 ? "bg-red-500" : memPct > 75 ? "bg-amber-500" : "bg-emerald-500"}
            />
          </div>
          <div>
            <div className="flex items-center justify-between text-xs mb-1.5">
              <span className="text-muted-foreground">Disk</span>
              <span className="tabular-nums font-medium">{diskPct}%</span>
            </div>
            <ProgressBar
              value={diskPct}
              max={100}
              color={diskPct > 90 ? "bg-red-500" : diskPct > 80 ? "bg-amber-500" : "bg-emerald-500"}
            />
          </div>
          <div>
            <div className="flex items-center justify-between text-xs mb-1.5">
              <span className="text-muted-foreground">Database Connections</span>
              <span className="tabular-nums font-medium">
                {db.activeConnections || 0} / {db.maxConnections || 100}
              </span>
            </div>
            <ProgressBar
              value={db.activeConnections || 0}
              max={db.maxConnections || 100}
              color={(db.activeConnections || 0) / (db.maxConnections || 100) > 0.8 ? "bg-red-500" : "bg-brand"}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
