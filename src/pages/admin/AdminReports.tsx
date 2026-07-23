/* eslint-disable @typescript-eslint/no-explicit-any */
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useState, useMemo, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Loader2,
  Download,
  Printer,
  Search,
  FileSpreadsheet,
  FileText,
  DollarSign,
  Users,
  BarChart3,
  Calendar,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Helpers ───

function toCSV(rows: Record<string, any>[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const escape = (val: any) => {
    const s = String(val ?? "");
    if (s.includes(",") || s.includes('"') || s.includes("\n")) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };
  return [headers.join(","), ...rows.map((r) => headers.map((h) => escape(r[h])).join(","))].join("\n");
}

function downloadCSV(csv: string, filename: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function formatDate(iso: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function getStatusColor(status: string) {
  switch (status) {
    case "completed":
    case "funded":
    case "active":
      return "bg-green-500/10 text-green-600 dark:text-green-400";
    case "pending":
      return "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400";
    case "failed":
    case "violated":
    case "expired":
      return "bg-red-500/10 text-red-600 dark:text-red-400";
    case "refunded":
      return "bg-blue-500/10 text-blue-600 dark:text-blue-400";
    default:
      return "bg-secondary text-muted-foreground";
  }
}

function StatusBadge({ status }: { status: string }) {
  return (
    <Badge variant="outline" className={cn("text-[10px] font-normal border-0", getStatusColor(status))}>
      {status.replace(/_/g, " ")}
    </Badge>
  );
}

// ─── CSV/PDF Export Row ───

function ExportRow({
  onCSV,
  onPrint,
  label,
}: {
  onCSV: () => void;
  onPrint: () => void;
  label: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" className="text-xs h-7" onClick={onCSV}>
          <FileSpreadsheet className="h-3 w-3 mr-1" />
          Export CSV
        </Button>
        <Button variant="outline" size="sm" className="text-xs h-7" onClick={onPrint}>
          <FileText className="h-3 w-3 mr-1" />
          Export PDF
        </Button>
      </div>
    </div>
  );
}

// ─── Report Table ───

function ReportTable({ columns, rows }: { columns: string[]; rows: Record<string, any>[] }) {
  return (
    <div className="overflow-x-auto -mx-1">
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="border-b border-border">
            {columns.map((col) => (
              <th key={col} className="text-left font-medium text-muted-foreground py-2 px-2 whitespace-nowrap">
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="py-8 text-center text-muted-foreground">
                No data found
              </td>
            </tr>
          ) : (
            rows.map((row, i) => (
              <tr key={i} className="border-b border-border/50 hover:bg-secondary/30 transition-colors">
                {columns.map((col) => (
                  <td key={col} className="py-2 px-2 whitespace-nowrap">
                    {row[col] ?? "—"}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

// ─── Page ───

export default function AdminReports() {
  const paymentsData = useQuery(api.payments.getAllPaymentsReport);
  const usersData = useQuery(api.users.getAllUsersReport);
  const challengesData = useQuery(api.challenges.getAllChallengesReport);
  const printRef = useRef<HTMLDivElement>(null);

  const [paymentsSearch, setPaymentsSearch] = useState("");
  const [usersSearch, setUsersSearch] = useState("");
  const [challengesSearch, setChallengesSearch] = useState("");

  // ── Payments ──
  const filteredPayments = useMemo(() => {
    if (!paymentsData) return [];
    if (!paymentsSearch) return paymentsData;
    const q = paymentsSearch.toLowerCase();
    return paymentsData.filter((p) =>
      [p.reference, p.userName, p.userEmail, p.status, p.provider].some((v) =>
        v?.toLowerCase().includes(q),
      ),
    );
  }, [paymentsData, paymentsSearch]);

  // ── Users ──
  const filteredUsers = useMemo(() => {
    if (!usersData) return [];
    if (!usersSearch) return usersData;
    const q = usersSearch.toLowerCase();
    return usersData.filter(
      (u) =>
        u.name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        u.role.toLowerCase().includes(q),
    );
  }, [usersData, usersSearch]);

  // ── Challenges ──
  const filteredChallenges = useMemo(() => {
    if (!challengesData) return [];
    if (!challengesSearch) return challengesData;
    const q = challengesSearch.toLowerCase();
    return challengesData.filter(
      (c) =>
        c.userName.toLowerCase().includes(q) ||
        c.userEmail.toLowerCase().includes(q) ||
        c.templateName.toLowerCase().includes(q) ||
        c.status.toLowerCase().includes(q),
    );
  }, [challengesData, challengesSearch]);

  // ── Stats ──
  const paymentStats = useMemo(() => {
    if (!paymentsData) return null;
    return {
      total: paymentsData.length,
      completed: paymentsData.filter((p) => p.status === "completed").length,
      failed: paymentsData.filter((p) => p.status === "failed").length,
      pending: paymentsData.filter((p) => p.status === "pending").length,
      revenue: paymentsData
        .filter((p) => p.status === "completed")
        .reduce((sum, p) => sum + p.amount, 0),
    };
  }, [paymentsData]);

  const userStats = useMemo(() => {
    if (!usersData) return null;
    return {
      total: usersData.length,
      admins: usersData.filter((u) => u.role !== "user").length,
      verified: usersData.filter((u) => u.kycStatus === "approved").length,
      twoFactorEnabled: usersData.filter((u) => u.twoFactorEnabled).length,
    };
  }, [usersData]);

  const challengeStats = useMemo(() => {
    if (!challengesData) return null;
    return {
      total: challengesData.length,
      active: challengesData.filter((c) => c.status === "active").length,
      funded: challengesData.filter((c) => c.status === "funded").length,
      violated: challengesData.filter((c) => c.status === "violated").length,
    };
  }, [challengesData]);

  const handleExportCSV = (type: string) => {
    let rows: Record<string, any>[] = [];
    let filename = "";
    switch (type) {
      case "payments":
        rows = filteredPayments;
        filename = "afc-payments-report.csv";
        break;
      case "users":
        rows = filteredUsers;
        filename = "afc-users-report.csv";
        break;
      case "challenges":
        rows = filteredChallenges;
        filename = "afc-challenges-report.csv";
        break;
    }
    downloadCSV(toCSV(rows), filename);
  };

  const handlePrint = () => {
    window.print();
  };

  const isLoading = !paymentsData || !usersData || !challengesData;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const paymentColumns = ["Reference", "User", "Email", "Amount", "Currency", "Status", "Provider", "Date"];
  const paymentRows = filteredPayments.map((p) => ({
    Reference: p.reference,
    User: p.userName,
    Email: p.userEmail,
    Amount: p.amount.toLocaleString(),
    Currency: p.currency,
    Status: <StatusBadge status={p.status} />,
    Provider: p.provider,
    Date: formatDate(p.createdAt),
  }));

  const userColumns = ["Name", "Email", "Role", "KYC Status", "2FA", "Country", "Joined"];
  const userRows = filteredUsers.map((u) => ({
    Name: u.name,
    Email: u.email,
    Role: u.role.replace(/_/g, " "),
    "KYC Status": <StatusBadge status={u.kycStatus} />,
    "2FA": u.twoFactorEnabled ? "Yes" : "No",
    Country: u.country || "—",
    Joined: formatDate(u.createdAt),
  }));

  const challengeColumns = ["User", "Email", "Challenge", "Size", "Status", "Paid", "Violations", "Created"];
  const challengeRows = filteredChallenges.map((c) => ({
    User: c.userName,
    Email: c.userEmail,
    Challenge: c.templateName,
    Size: `$${c.accountSize.toLocaleString()}`,
    Status: <StatusBadge status={c.status} />,
    Paid: `$${c.amountPaid.toLocaleString()}`,
    Violations: c.violationsCount,
    Created: formatDate(c.createdAt),
  }));

  return (
    <div ref={printRef} className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between print:hidden">
        <div>
          <h1 className="text-lg font-medium tracking-tight">Reports</h1>
          <p className="text-xs text-muted-foreground mt-1">
            Export platform data as CSV or PDF for analysis and record-keeping
          </p>
        </div>
      </div>

      <Tabs defaultValue="payments" className="space-y-6">
        <TabsList className="border border-border bg-transparent p-0.5 flex-wrap print:hidden">
          <TabsTrigger value="payments" className="text-xs data-[state=active]:bg-secondary">
            <DollarSign className="h-3 w-3 mr-1" />
            Payments
          </TabsTrigger>
          <TabsTrigger value="users" className="text-xs data-[state=active]:bg-secondary">
            <Users className="h-3 w-3 mr-1" />
            Users
          </TabsTrigger>
          <TabsTrigger value="challenges" className="text-xs data-[state=active]:bg-secondary">
            <BarChart3 className="h-3 w-3 mr-1" />
            Challenges
          </TabsTrigger>
        </TabsList>

        {/* ───────────── Payments Tab ───────────── */}
        <TabsContent value="payments" className="space-y-4">
          {/* Stats */}
          {paymentStats && (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 print:grid-cols-5">
              <div className="card-subtle p-3 text-center">
                <div className="stat-value text-lg">{paymentStats.total}</div>
                <div className="stat-label text-[10px]">Total</div>
              </div>
              <div className="card-subtle p-3 text-center">
                <div className="stat-value text-lg">{paymentStats.completed}</div>
                <div className="stat-label text-[10px]">Completed</div>
              </div>
              <div className="card-subtle p-3 text-center">
                <div className="stat-value text-lg">{paymentStats.pending}</div>
                <div className="stat-label text-[10px]">Pending</div>
              </div>
              <div className="card-subtle p-3 text-center">
                <div className="stat-value text-lg">{paymentStats.failed}</div>
                <div className="stat-label text-[10px]">Failed</div>
              </div>
              <div className="card-subtle p-3 text-center">
                <div className="stat-value text-lg">${paymentStats.revenue.toLocaleString()}</div>
                <div className="stat-label text-[10px]">Revenue</div>
              </div>
            </div>
          )}

          {/* Search + Export */}
          <div className="flex items-center justify-between gap-3 print:hidden">
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                className="pl-8 text-xs h-9"
                placeholder="Search payments…"
                value={paymentsSearch}
                onChange={(e) => setPaymentsSearch(e.target.value)}
              />
            </div>
            <ExportRow
              label={`${filteredPayments.length} payments`}
              onCSV={() => handleExportCSV("payments")}
              onPrint={handlePrint}
            />
          </div>

          {/* Table */}
          <div className="card-subtle p-4 overflow-x-auto">
            <ReportTable columns={paymentColumns} rows={paymentRows} />
          </div>
        </TabsContent>

        {/* ───────────── Users Tab ───────────── */}
        <TabsContent value="users" className="space-y-4">
          {userStats && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 print:grid-cols-4">
              <div className="card-subtle p-3 text-center">
                <div className="stat-value text-lg">{userStats.total}</div>
                <div className="stat-label text-[10px]">Total Users</div>
              </div>
              <div className="card-subtle p-3 text-center">
                <div className="stat-value text-lg">{userStats.verified}</div>
                <div className="stat-label text-[10px]">KYC Verified</div>
              </div>
              <div className="card-subtle p-3 text-center">
                <div className="stat-value text-lg">{userStats.admins}</div>
                <div className="stat-label text-[10px]">Admins</div>
              </div>
              <div className="card-subtle p-3 text-center">
                <div className="stat-value text-lg">{userStats.twoFactorEnabled}</div>
                <div className="stat-label text-[10px]">2FA Enabled</div>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between gap-3 print:hidden">
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                className="pl-8 text-xs h-9"
                placeholder="Search users…"
                value={usersSearch}
                onChange={(e) => setUsersSearch(e.target.value)}
              />
            </div>
            <ExportRow
              label={`${filteredUsers.length} users`}
              onCSV={() => handleExportCSV("users")}
              onPrint={handlePrint}
            />
          </div>

          <div className="card-subtle p-4 overflow-x-auto">
            <ReportTable columns={userColumns} rows={userRows} />
          </div>
        </TabsContent>

        {/* ───────────── Challenges Tab ───────────── */}
        <TabsContent value="challenges" className="space-y-4">
          {challengeStats && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 print:grid-cols-4">
              <div className="card-subtle p-3 text-center">
                <div className="stat-value text-lg">{challengeStats.total}</div>
                <div className="stat-label text-[10px]">Total</div>
              </div>
              <div className="card-subtle p-3 text-center">
                <div className="stat-value text-lg">{challengeStats.active}</div>
                <div className="stat-label text-[10px]">Active</div>
              </div>
              <div className="card-subtle p-3 text-center">
                <div className="stat-value text-lg">{challengeStats.funded}</div>
                <div className="stat-label text-[10px]">Funded</div>
              </div>
              <div className="card-subtle p-3 text-center">
                <div className="stat-value text-lg">{challengeStats.violated}</div>
                <div className="stat-label text-[10px]">Violated</div>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between gap-3 print:hidden">
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                className="pl-8 text-xs h-9"
                placeholder="Search challenges…"
                value={challengesSearch}
                onChange={(e) => setChallengesSearch(e.target.value)}
              />
            </div>
            <ExportRow
              label={`${filteredChallenges.length} challenges`}
              onCSV={() => handleExportCSV("challenges")}
              onPrint={handlePrint}
            />
          </div>

          <div className="card-subtle p-4 overflow-x-auto">
            <ReportTable columns={challengeColumns} rows={challengeRows} />
          </div>
        </TabsContent>
      </Tabs>

      {/* Print styles */}
      <style>{`
        @media print {
          @page { margin: 0.5in; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .print\\:hidden { display: none !important; }
          .print\\:grid-cols-5 { grid-template-columns: repeat(5, 1fr) !important; }
          .print\\:grid-cols-4 { grid-template-columns: repeat(4, 1fr) !important; }
        }
      `}</style>
    </div>
  );
}
