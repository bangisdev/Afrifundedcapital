/* eslint-disable @typescript-eslint/no-explicit-any */
import { useApiQuery } from "@/hooks/use-api";
import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Loader2,
  Download,
  FileText,
  Users,
  CreditCard,
  Trophy,
  DollarSign,
  ChevronDown,
  Calendar,
  Filter,
} from "lucide-react";

type ReportType = "users" | "payments" | "challenges";

interface DateRange {
  from: string;
  to: string;
}

function formatNgn(n: number) {
  return `₦${n.toLocaleString()}`;
}

function formatDate(ts: number | null) {
  if (!ts) return "—";
  return new Date(ts).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function toCSV(data: any[], headers: string[]) {
  const escape = (v: any) => {
    const s = String(v ?? "");
    return s.includes(",") || s.includes('"') || s.includes("\n")
      ? `"${s.replace(/"/g, '""')}"`
      : s;
  };
  const rows = data.map((row) => headers.map((h) => escape(row[h])).join(","));
  return [headers.join(","), ...rows].join("\n");
}

function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function exportPDF(html: string, filename: string) {
  const win = window.open("", "_blank");
  if (!win) return;
  win.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>${filename}</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding: 40px; color: #1a1a1a; }
        h1 { font-size: 20px; margin-bottom: 4px; }
        .subtitle { color: #666; font-size: 12px; margin-bottom: 24px; }
        .brand { color: #999; font-size: 10px; margin-top: 24px; border-top: 1px solid #eee; padding-top: 8px; }
        table { width: 100%; border-collapse: collapse; font-size: 11px; }
        th { text-align: left; padding: 8px 6px; border-bottom: 2px solid #333; font-weight: 600; }
        td { padding: 6px; border-bottom: 1px solid #eee; }
        tr:nth-child(even) { background: #fafafa; }
        .badge { display: inline-block; padding: 2px 6px; border-radius: 4px; font-size: 10px; }
        .badge-green { background: #dcfce7; color: #166534; }
        .badge-red { background: #fee2e2; color: #991b1b; }
        .badge-amber { background: #fef3c7; color: #92400e; }
        .badge-blue { background: #dbeafe; color: #1e40af; }
        .badge-secondary { background: #f3f4f6; color: #374151; }
        @media print { body { padding: 20px; } }
      </style>
    </head>
    <body>
      ${html}
      <div class="brand">AfriFundedCapital — Report generated ${new Date().toLocaleString()}</div>
      <script>window.onload = () => { window.print(); }</script>
    </body>
    </html>
  `);
  win.document.close();
}

export default function AdminReports() {
  // Server-driven lists now return paginated envelopes; pull a large page for report/export purposes
  const { data: usersData, isLoading: usersLoading } = useApiQuery<any>(["admin", "users", "report"], "/api/users/list?page=1&pageSize=100");
  const { data: paymentsData, isLoading: paymentsLoading } = useApiQuery<any>(["admin", "payments", "report"], "/api/payments/admin/all?page=1&pageSize=100");
  const { data: challenges, isLoading: challengesLoading } = useApiQuery<any[]>(["admin", "allChallenges"], "/api/challenges/admin/all");
  const { data: userStats } = useApiQuery<any>(["admin", "userStats"], "/api/users/stats");
  const { data: paymentStats } = useApiQuery<any>(["admin", "paymentStats"], "/api/payments/admin/stats");

  const users = usersData?.users || [];
  const payments = paymentsData?.items || [];

  const [activeTab, setActiveTab] = useState<ReportType>("payments");
  const [dateRange, setDateRange] = useState<DateRange>({ from: "", to: "" });
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const filterByDate = (items: any[], dateField: string = "createdAt") => {
    if (!items) return [];
    return items.filter((item) => {
      const ts = item[dateField];
      if (!ts) return true;
      const d = new Date(ts);
      if (dateRange.from && d < new Date(dateRange.from)) return false;
      if (dateRange.to) {
        const to = new Date(dateRange.to);
        to.setHours(23, 59, 59, 999);
        if (d > to) return false;
      }
      return true;
    });
  };

  const filteredPayments = useMemo(() => {
    let items = filterByDate(payments || []);
    if (statusFilter !== "all") items = items.filter((p) => p.status === statusFilter);
    return items;
  }, [payments, dateRange, statusFilter]);

  const filteredUsers = useMemo(() => {
    return filterByDate(users || []);
  }, [users, dateRange]);

  const filteredChallenges = useMemo(() => {
    let items = filterByDate(challenges || []);
    if (statusFilter !== "all") items = items.filter((c) => c.status === statusFilter);
    return items;
  }, [challenges, dateRange, statusFilter]);

  const isLoading = usersLoading || paymentsLoading || challengesLoading;

  // ─── CSV Exports ───────────────────────────────────────

  const exportUsersCSV = () => {
    const headers = ["ID", "Name", "Email", "Role", "KYC Status", "Email Verified", "Onboarding", "Joined"];
    const data = filteredUsers.map((u) => ({
      ID: u.id,
      Name: u.name || "",
      Email: u.email || "",
      Role: u.role || "user",
      "KYC Status": u.kycStatus || "unverified",
      "Email Verified": u.emailVerified ? "Yes" : "No",
      Onboarding: u.onboardingComplete ? "Complete" : "Incomplete",
      Joined: formatDate(u.createdAt),
    }));
    downloadFile(toCSV(data, headers), `users-report-${Date.now()}.csv`, "text/csv");
  };

  const exportPaymentsCSV = () => {
    const headers = ["ID", "User", "Amount", "Currency", "Provider", "Status", "Reference", "Description", "Date"];
    const data = filteredPayments.map((p) => ({
      ID: p.id,
      User: p.userId,
      Amount: p.amount || 0,
      Currency: p.currency || "NGN",
      Provider: p.provider || "",
      Status: p.status || "",
      Reference: p.reference || "",
      Description: p.description || "",
      Date: formatDate(p.createdAt),
    }));
    downloadFile(toCSV(data, headers), `payments-report-${Date.now()}.csv`, "text/csv");
  };

  const exportChallengesCSV = () => {
    const headers = ["ID", "User", "Account Size", "Status", "Amount Paid", "Template", "Started", "Expires"];
    const data = filteredChallenges.map((c) => ({
      ID: c.id,
      User: c.userId,
      "Account Size": `$${(c.accountSize || 0).toLocaleString()}`,
      Status: c.status || "",
      "Amount Paid": c.amountPaid || 0,
      Template: c.templateId || "",
      Started: formatDate(c.startedAt || c.createdAt),
      Expires: formatDate(c.expiresAt),
    }));
    downloadFile(toCSV(data, headers), `challenges-report-${Date.now()}.csv`, "text/csv");
  };

  // ─── PDF Exports ───────────────────────────────────────

  const exportUsersPDF = () => {
    const rows = filteredUsers.map((u) => `
      <tr>
        <td>${u.id}</td>
        <td>${u.name || "—"}</td>
        <td>${u.email || "—"}</td>
        <td><span class="badge badge-${u.role === "super_admin" ? "red" : u.role === "user" ? "secondary" : "blue"}">${u.role || "user"}</span></td>
        <td><span class="badge badge-${u.kycStatus === "approved" ? "green" : u.kycStatus === "rejected" ? "red" : "amber"}">${u.kycStatus || "unverified"}</span></td>
        <td>${formatDate(u.createdAt)}</td>
      </tr>
    `).join("");
    exportPDF(`
      <h1>Users Report</h1>
      <div class="subtitle">${filteredUsers.length} users · ${dateRange.from || "All time"} to ${dateRange.to || "Now"}</div>
      <table>
        <thead><tr><th>ID</th><th>Name</th><th>Email</th><th>Role</th><th>KYC</th><th>Joined</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="6" style="text-align:center;color:#999;">No users found</td></tr>'}</tbody>
      </table>
    `, "users-report");
  };

  const exportPaymentsPDF = () => {
    const rows = filteredPayments.map((p) => `
      <tr>
        <td>${p.id}</td>
        <td>User ${p.userId}</td>
        <td style="text-align:right;font-weight:600;">${formatNgn(p.amount || 0)}</td>
        <td>${p.provider}</td>
        <td><span class="badge badge-${p.status === "completed" ? "green" : p.status === "refunded" ? "red" : p.status === "pending" ? "amber" : "secondary"}">${p.status}</span></td>
        <td style="font-family:monospace;font-size:10px;">${p.reference}</td>
        <td>${formatDate(p.createdAt)}</td>
      </tr>
    `).join("");
    const totalRevenue = filteredPayments.filter((p) => p.status === "completed").reduce((s, p) => s + (p.amount || 0), 0);
    exportPDF(`
      <h1>Payments Report</h1>
      <div class="subtitle">${filteredPayments.length} transactions · Total revenue: ${formatNgn(totalRevenue)} · ${dateRange.from || "All time"} to ${dateRange.to || "Now"}</div>
      <table>
        <thead><tr><th>ID</th><th>User</th><th style="text-align:right;">Amount</th><th>Provider</th><th>Status</th><th>Reference</th><th>Date</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="7" style="text-align:center;color:#999;">No payments found</td></tr>'}</tbody>
      </table>
    `, "payments-report");
  };

  const exportChallengesPDF = () => {
    const rows = filteredChallenges.map((c) => `
      <tr>
        <td>${c.id}</td>
        <td>User ${c.userId}</td>
        <td>$${(c.accountSize || 0).toLocaleString()}</td>
        <td><span class="badge badge-${c.status === "active" ? "green" : c.status === "funded" ? "blue" : c.status === "violated" ? "red" : "secondary"}">${c.status}</span></td>
        <td style="text-align:right;">${formatNgn(c.amountPaid || 0)}</td>
        <td>${formatDate(c.startedAt || c.createdAt)}</td>
        <td>${formatDate(c.expiresAt)}</td>
      </tr>
    `).join("");
    exportPDF(`
      <h1>Challenges Report</h1>
      <div class="subtitle">${filteredChallenges.length} challenges · ${dateRange.from || "All time"} to ${dateRange.to || "Now"}</div>
      <table>
        <thead><tr><th>ID</th><th>User</th><th>Size</th><th>Status</th><th>Paid</th><th>Started</th><th>Expires</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="7" style="text-align:center;color:#999;">No challenges found</td></tr>'}</tbody>
      </table>
    `, "challenges-report");
  };

  // ─── Summary Stats ─────────────────────────────────────

  const summaryStats = useMemo(() => {
    const totalUsers = users?.length || 0;
    const totalRevenue = payments?.filter((p: any) => p.status === "completed").reduce((s: number, p: any) => s + (p.amount || 0), 0) || 0;
    const totalChallenges = challenges?.length || 0;
    const activeChallenges = challenges?.filter((c: any) => c.status === "active").length || 0;
    const fundedTraders = challenges?.filter((c: any) => c.status === "funded").length || 0;
    const pendingPayments = payments?.filter((p: any) => p.status === "pending").length || 0;
    return { totalUsers, totalRevenue, totalChallenges, activeChallenges, fundedTraders, pendingPayments };
  }, [users, payments, challenges]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const tabs = [
    { id: "payments" as const, label: "Payments", icon: CreditCard, count: filteredPayments.length },
    { id: "users" as const, label: "Users", icon: Users, count: filteredUsers.length },
    { id: "challenges" as const, label: "Challenges", icon: Trophy, count: filteredChallenges.length },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-lg font-medium tracking-tight">Reports</h1>
        <p className="text-xs text-muted-foreground mt-1">Export and download platform data as CSV or PDF</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {[
          { label: "Total Users", value: summaryStats.totalUsers, icon: Users },
          { label: "Total Revenue", value: formatNgn(summaryStats.totalRevenue), icon: DollarSign },
          { label: "Active Challenges", value: summaryStats.activeChallenges, icon: Trophy },
          { label: "Funded Traders", value: summaryStats.fundedTraders, icon: Trophy },
          { label: "Total Challenges", value: summaryStats.totalChallenges, icon: FileText },
          { label: "Pending Payments", value: summaryStats.pendingPayments, icon: CreditCard },
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
        {tabs.map((t) => (
          <button
            key={t.id}
            className={`px-4 py-2 text-xs font-medium transition-colors border-b-2 -mb-px flex items-center gap-1.5 ${
              activeTab === t.id
                ? "border-foreground text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => setActiveTab(t.id)}
          >
            <t.icon className="h-3 w-3" />
            {t.label}
            <span className="text-[10px] text-muted-foreground">({t.count})</span>
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex items-center gap-2">
          <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
          <Input
            type="date"
            value={dateRange.from}
            onChange={(e) => setDateRange({ ...dateRange, from: e.target.value })}
            className="h-9 text-xs w-36"
          />
          <span className="text-xs text-muted-foreground">to</span>
          <Input
            type="date"
            value={dateRange.to}
            onChange={(e) => setDateRange({ ...dateRange, to: e.target.value })}
            className="h-9 text-xs w-36"
          />
        </div>
        {(activeTab === "payments" || activeTab === "challenges") && (
          <div className="relative">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-3 pr-8 text-xs appearance-none cursor-pointer"
            >
              <option value="all">All Status</option>
              {activeTab === "payments" ? (
                <>
                  <option value="completed">Completed</option>
                  <option value="pending">Pending</option>
                  <option value="failed">Failed</option>
                  <option value="refunded">Refunded</option>
                </>
              ) : (
                <>
                  <option value="active">Active</option>
                  <option value="funded">Funded</option>
                  <option value="violated">Violated</option>
                  <option value="expired">Expired</option>
                </>
              )}
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          </div>
        )}
        {(dateRange.from || dateRange.to || statusFilter !== "all") && (
          <Button
            variant="ghost"
            size="sm"
            className="text-xs h-9"
            onClick={() => { setDateRange({ from: "", to: "" }); setStatusFilter("all"); }}
          >
            Clear filters
          </Button>
        )}
      </div>

      {/* Export Buttons */}
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          className="text-xs"
          onClick={() => {
            if (activeTab === "users") exportUsersCSV();
            else if (activeTab === "payments") exportPaymentsCSV();
            else exportChallengesCSV();
          }}
        >
          <Download className="h-3 w-3 mr-1" /> Export CSV
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="text-xs"
          onClick={() => {
            if (activeTab === "users") exportUsersPDF();
            else if (activeTab === "payments") exportPaymentsPDF();
            else exportChallengesPDF();
          }}
        >
          <FileText className="h-3 w-3 mr-1" /> Export PDF
        </Button>
        <span className="text-[10px] text-muted-foreground ml-2">
          {activeTab === "users" && filteredUsers.length}
          {activeTab === "payments" && filteredPayments.length}
          {activeTab === "challenges" && filteredChallenges.length}
          {" "}records
        </span>
      </div>

      {/* Data Table */}
      <div className="border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b bg-muted/50">
                {activeTab === "users" && (
                  <>
                    <th className="text-left p-3 font-medium text-muted-foreground">ID</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">Name</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">Email</th>
                    <th className="text-left p-3 font-medium text-muted-foreground hidden md:table-cell">Role</th>
                    <th className="text-left p-3 font-medium text-muted-foreground hidden md:table-cell">KYC</th>
                    <th className="text-left p-3 font-medium text-muted-foreground hidden lg:table-cell">Joined</th>
                  </>
                )}
                {activeTab === "payments" && (
                  <>
                    <th className="text-left p-3 font-medium text-muted-foreground">ID</th>
                    <th className="text-left p-3 font-medium text-muted-foreground hidden md:table-cell">User</th>
                    <th className="text-right p-3 font-medium text-muted-foreground">Amount</th>
                    <th className="text-left p-3 font-medium text-muted-foreground hidden md:table-cell">Provider</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">Status</th>
                    <th className="text-left p-3 font-medium text-muted-foreground hidden lg:table-cell">Reference</th>
                    <th className="text-left p-3 font-medium text-muted-foreground hidden xl:table-cell">Date</th>
                  </>
                )}
                {activeTab === "challenges" && (
                  <>
                    <th className="text-left p-3 font-medium text-muted-foreground">ID</th>
                    <th className="text-left p-3 font-medium text-muted-foreground hidden md:table-cell">User</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">Size</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">Status</th>
                    <th className="text-right p-3 font-medium text-muted-foreground hidden md:table-cell">Paid</th>
                    <th className="text-left p-3 font-medium text-muted-foreground hidden lg:table-cell">Started</th>
                    <th className="text-left p-3 font-medium text-muted-foreground hidden xl:table-cell">Expires</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {activeTab === "users" && filteredUsers.length === 0 && (
                <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">No users found</td></tr>
              )}
              {activeTab === "users" && filteredUsers.map((u) => (
                <tr key={u.id} className="border-b last:border-b-0 hover:bg-muted/30">
                  <td className="p-3 font-mono">{u.id}</td>
                  <td className="p-3 font-medium">{u.name || "—"}</td>
                  <td className="p-3 text-muted-foreground">{u.email}</td>
                  <td className="p-3 hidden md:table-cell">
                    <Badge variant={u.role === "super_admin" ? "destructive" : "outline"} className="text-[10px]">
                      {u.role || "user"}
                    </Badge>
                  </td>
                  <td className="p-3 hidden md:table-cell">
                    <Badge
                      variant={u.kycStatus === "approved" ? "default" : "secondary"}
                      className="text-[10px]"
                    >
                      {u.kycStatus || "unverified"}
                    </Badge>
                  </td>
                  <td className="p-3 hidden lg:table-cell text-muted-foreground">{formatDate(u.createdAt)}</td>
                </tr>
              ))}

              {activeTab === "payments" && filteredPayments.length === 0 && (
                <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">No payments found</td></tr>
              )}
              {activeTab === "payments" && filteredPayments.map((p) => (
                <tr key={p.id} className="border-b last:border-b-0 hover:bg-muted/30">
                  <td className="p-3 font-mono">{p.id}</td>
                  <td className="p-3 hidden md:table-cell text-muted-foreground">User {p.userId}</td>
                  <td className="p-3 text-right font-medium">{formatNgn(p.amount || 0)}</td>
                  <td className="p-3 hidden md:table-cell">
                    <Badge variant="outline" className="text-[10px] capitalize">{p.provider}</Badge>
                  </td>
                  <td className="p-3">
                    <Badge
                      variant={p.status === "completed" ? "default" : p.status === "refunded" ? "destructive" : "secondary"}
                      className="text-[10px]"
                    >
                      {p.status}
                    </Badge>
                  </td>
                  <td className="p-3 hidden lg:table-cell font-mono text-[10px] text-muted-foreground truncate max-w-[160px]">
                    {p.reference}
                  </td>
                  <td className="p-3 hidden xl:table-cell text-muted-foreground">{formatDate(p.createdAt)}</td>
                </tr>
              ))}

              {activeTab === "challenges" && filteredChallenges.length === 0 && (
                <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">No challenges found</td></tr>
              )}
              {activeTab === "challenges" && filteredChallenges.map((c) => (
                <tr key={c.id} className="border-b last:border-b-0 hover:bg-muted/30">
                  <td className="p-3 font-mono">#{c.id}</td>
                  <td className="p-3 hidden md:table-cell text-muted-foreground">User {c.userId}</td>
                  <td className="p-3 font-medium">${(c.accountSize || 0).toLocaleString()}</td>
                  <td className="p-3">
                    <Badge
                      variant={c.status === "active" ? "default" : c.status === "funded" ? "default" : c.status === "violated" ? "destructive" : "secondary"}
                      className="text-[10px]"
                    >
                      {c.status}
                    </Badge>
                  </td>
                  <td className="p-3 hidden md:table-cell text-right">{formatNgn(c.amountPaid || 0)}</td>
                  <td className="p-3 hidden lg:table-cell text-muted-foreground">{formatDate(c.startedAt || c.createdAt)}</td>
                  <td className="p-3 hidden xl:table-cell text-muted-foreground">{formatDate(c.expiresAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
