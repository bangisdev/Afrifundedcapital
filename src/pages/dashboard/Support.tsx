/* eslint-disable @typescript-eslint/no-explicit-any */
import { useApiQuery, useApiMutation } from "@/hooks/use-api";
import { useState } from "react";
import { useResetOnChange } from "@/hooks/use-reset-on-change";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, Ticket, Plus, ChevronLeft, ChevronRight, ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";
import { toast } from "sonner";

interface SupportResponse {
  tickets: any[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  stats: { total: number; byStatus: Record<string, number> };
}

const PAGE_SIZES = [5, 10, 25];

export default function Support() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Sorting (whitelisted columns on the server: id, subject, category, priority, status, createdAt, updatedAt)
  const [sortBy, setSortBy] = useState("createdAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const SORT_COLUMNS: Array<{ key: string; label: string }> = [
    { key: "subject", label: "Subject" },
    { key: "category", label: "Category" },
    { key: "priority", label: "Priority" },
    { key: "status", label: "Status" },
    { key: "createdAt", label: "Created" },
  ];
  const handleSort = (key: string) => {
    if (sortBy === key) {
      setSortOrder((o) => (o === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(key);
      setSortOrder("desc");
    }
    setPage(1);
  };
  const sortHeader = (sortKey: string, label: string) => {
    const active = sortBy === sortKey;
    return (
      <button
        key={sortKey}
        type="button"
        onClick={() => handleSort(sortKey)}
        aria-label={`Sort by ${label}`}
        aria-pressed={active}
        className={`inline-flex items-center gap-1 font-medium transition-colors rounded px-1 py-0.5 -mx-1 ${
          active ? "text-foreground" : "text-muted-foreground hover:text-foreground"
        }`}
      >
        {label}
        {active ? (
          sortOrder === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
        ) : (
          <ArrowUpDown className="h-3 w-3 opacity-50" />
        )}
      </button>
    );
  };

  const params = new URLSearchParams();
  params.set("page", String(page));
  params.set("pageSize", String(pageSize));
  params.set("sortBy", sortBy);
  params.set("sortOrder", sortOrder);
  const listQuery = `/api/support/my?${params.toString()}`;

  const { data, isLoading } = useApiQuery<SupportResponse>(["support", "my", listQuery], listQuery);
  const createTicket = useApiMutation<any, any>("post", "/api/support/create");
  const addMessage = useApiMutation<any, any>("post", "/api/support/${id}/messages");
  const [showCreate, setShowCreate] = useState(false);
  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState("general");
  const [message, setMessage] = useState("");
  const [selectedTicket, setSelectedTicket] = useState<any>(null);
  const [reply, setReply] = useState("");

  const tickets = data?.tickets || [];
  const total = data?.total || 0;
  const totalPages = data?.totalPages || 1;

  // Clamp page if the current page exceeds total pages (e.g. after data changes)
  useResetOnChange([totalPages, page], () => setPage(1), page > totalPages);

  // Reset to first page whenever the sort changes
  useResetOnChange([sortBy, sortOrder], () => {
    setPage(1);
  });

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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-medium tracking-tight">Support</h1>
          <p className="text-xs text-muted-foreground mt-1">Get help with your account and challenges</p>
        </div>
        <div className="flex items-center gap-3">
          {total > 0 && <span className="text-xs text-muted-foreground">{total} ticket{total === 1 ? "" : "s"}</span>}
          <Button size="sm" className="text-xs" onClick={() => setShowCreate(true)}><Plus className="h-3 w-3 mr-1" /> New Ticket</Button>
        </div>
      </div>

      {tickets.length === 0 ? (
        <div className="card-subtle p-8 text-center"><Ticket className="h-8 w-8 mx-auto mb-3 text-muted-foreground" /><p className="text-xs text-muted-foreground">No support tickets yet</p></div>
      ) : (
        <>
          <div className="card-subtle px-4 py-2 flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] font-medium text-muted-foreground mr-1">Sort:</span>
            {SORT_COLUMNS.map((c) => sortHeader(c.key, c.label))}
          </div>
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

          {/* Pagination Footer */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-muted-foreground">
            <div>Showing {tickets.length} of {total} tickets · Page {page} of {totalPages}</div>
            <div className="flex items-center gap-2">
              <select
                value={pageSize}
                onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
                className="h-8 rounded-md border border-input bg-background px-2 text-xs appearance-none cursor-pointer"
                aria-label="Rows per page"
              >
                {PAGE_SIZES.map((n) => (
                  <option key={n} value={n}>{n} / page</option>
                ))}
              </select>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 px-2.5 text-xs"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  <ChevronLeft className="h-3.5 w-3.5" /> Prev
                </Button>
                <span className="px-2 font-medium tabular-nums">{page} / {totalPages}</span>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 px-2.5 text-xs"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </div>
        </>
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
