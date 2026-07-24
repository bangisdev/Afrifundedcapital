/* eslint-disable @typescript-eslint/no-explicit-any */
import { useApiQuery } from "@/hooks/use-api";
import { Button } from "@/components/ui/button";
import { Loader2, Download, BarChart3 } from "lucide-react";

export default function AdminReports() {
  const { data: userStats } = useApiQuery<any>(["admin", "userStats"], "/api/users/stats");
  const { data: paymentStats } = useApiQuery<any>(["admin", "paymentStats"], "/api/payments/admin/stats");
  const { data: challengeStats } = useApiQuery<any>(["admin", "challengeStats"], "/api/challenges/admin/stats");
  const { data: payoutStats } = useApiQuery<any>(["admin", "payoutStats"], "/api/payouts/admin/stats");

  const handleExportCSV = (data: any[], filename: string) => {
    if (!data.length) return;
    const headers = Object.keys(data[0]);
    const csv = [headers.join(","), ...data.map((row) => headers.map((h) => JSON.stringify(row[h] || "")).join(",")).join("\n")];
    const blob = new Blob([csv.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-8">
      <div><h1 className="text-lg font-medium tracking-tight">Reports</h1><p className="text-xs text-muted-foreground mt-1">Export platform data</p></div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="card-subtle p-6">
          <h2 className="text-sm font-medium mb-3">Users</h2>
          <div className="text-xs text-muted-foreground mb-3">Total: {userStats?.totalUsers || 0}</div>
          <Button variant="outline" size="sm" className="text-xs" onClick={() => handleExportCSV([{ totalUsers: userStats?.totalUsers }], "users-report.csv")}>
            <Download className="h-3 w-3 mr-1" /> Export CSV
          </Button>
        </div>
        <div className="card-subtle p-6">
          <h2 className="text-sm font-medium mb-3">Payments</h2>
          <div className="text-xs text-muted-foreground mb-3">Total: {paymentStats?.total || 0} · Revenue: ₦{(paymentStats?.revenue || 0).toLocaleString()}</div>
          <Button variant="outline" size="sm" className="text-xs" onClick={() => handleExportCSV([{ total: paymentStats?.total, revenue: paymentStats?.revenue }], "payments-report.csv")}>
            <Download className="h-3 w-3 mr-1" /> Export CSV
          </Button>
        </div>
        <div className="card-subtle p-6">
          <h2 className="text-sm font-medium mb-3">Challenges</h2>
          <div className="text-xs text-muted-foreground mb-3">Total: {challengeStats?.total || 0} · Active: {challengeStats?.active || 0} · Funded: {challengeStats?.funded || 0}</div>
          <Button variant="outline" size="sm" className="text-xs" onClick={() => handleExportCSV([{ total: challengeStats?.total, active: challengeStats?.active, funded: challengeStats?.funded }], "challenges-report.csv")}>
            <Download className="h-3 w-3 mr-1" /> Export CSV
          </Button>
        </div>
        <div className="card-subtle p-6">
          <h2 className="text-sm font-medium mb-3">Payouts</h2>
          <div className="text-xs text-muted-foreground mb-3">Total: {payoutStats?.total || 0} · Paid: ₦{(payoutStats?.totalPaid || 0).toLocaleString()}</div>
          <Button variant="outline" size="sm" className="text-xs" onClick={() => handleExportCSV([{ total: payoutStats?.total, totalPaid: payoutStats?.totalPaid }], "payouts-report.csv")}>
            <Download className="h-3 w-3 mr-1" /> Export CSV
          </Button>
        </div>
      </div>
    </div>
  );
}
