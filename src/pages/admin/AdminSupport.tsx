/* eslint-disable @typescript-eslint/no-explicit-any */
import { useApiQuery, useApiMutation } from "@/hooks/use-api";
import { useState, useRef, useEffect } from "react";
import { useResetOnChange } from "@/hooks/use-reset-on-change";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Loader2,
  MessageSquare,
  ArrowLeft,
  Send,
  Lock,
  Unlock,
  CheckCircle,
  Clock,
  AlertCircle,
  User,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Search,
  X,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
} from "lucide-react";
import { toast } from "sonner";

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  open: { label: "Open", color: "bg-blue-500/10 text-blue-600 border-blue-500/20", icon: AlertCircle },
  pending: { label: "Pending", color: "bg-amber-500/10 text-amber-600 border-amber-500/20", icon: Clock },
  waiting_on_customer: { label: "Waiting on Customer", color: "bg-violet-500/10 text-violet-600 border-violet-500/20", icon: User },
  resolved: { label: "Resolved", color: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20", icon: CheckCircle },
  closed: { label: "Closed", color: "bg-secondary text-secondary-foreground", icon: Lock },
};

const PRIORITY_CONFIG: Record<string, { label: string; color: string }> = {
  low: { label: "Low", color: "bg-secondary text-secondary-foreground" },
  medium: { label: "Medium", color: "bg-amber-500/10 text-amber-600" },
  high: { label: "High", color: "bg-orange-500/10 text-orange-600" },
  urgent: { label: "Urgent", color: "bg-red-500/10 text-red-600" },
};

function formatTime(ts: number | null) {
  if (!ts) return "";
  const d = new Date(ts);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 60000) return "Just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatFullTime(ts: number | null) {
  if (!ts) return "";
  return new Date(ts).toLocaleString("en-US", {
    year: "numeric", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

const PAGE_SIZES = [10, 25, 50];
const EMPTY_STATS = { total: 0, open: 0, pending: 0, resolved: 0 };

interface TicketsResponse {
  tickets: any[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  stats: { total: number; open: number; pending: number; resolved: number };
}

export default function AdminSupport() {
  const { data: briefUsers } = useApiQuery<any[]>(["admin", "briefUsers"], "/api/users/brief");
  const updateStatus = useApiMutation<any, any>("put", "/api/support/admin/${id}/status");
  const assignTicket = useApiMutation<any, any>("put", "/api/support/admin/${id}/assign");
  const addMessage = useApiMutation<any, any>("post", "/api/support/${id}/messages");

  const [selectedTicket, setSelectedTicket] = useState<any>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [reply, setReply] = useState("");
  const [isInternal, setIsInternal] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sortBy, setSortBy] = useState("createdAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { data: messages, isLoading: messagesLoading } = useApiQuery<any[]>(
    ["ticket-messages", selectedTicket?.id || 0],
    `/api/support/${selectedTicket?.id || 0}/messages`,
    { enabled: !!selectedTicket }
  );

  // Debounce the search input so we don't hit the API on every keystroke
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  // Reset to first page whenever filters, page size, or sort change
  useResetOnChange([debouncedSearch, statusFilter, priorityFilter, pageSize, sortBy, sortOrder], () => {
    setPage(1);
  });

  // Sortable columns matching the server whitelist for /api/support/admin/all
  const SORT_COLUMNS: Array<{ key: string; label: string }> = [
    { key: "id", label: "ID" },
    { key: "subject", label: "Subject" },
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
        className={`inline-flex items-center gap-1 text-[11px] font-medium transition-colors rounded px-1.5 py-0.5 ${
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
  if (debouncedSearch) params.set("search", debouncedSearch);
  if (statusFilter !== "all") params.set("status", statusFilter);
  if (priorityFilter !== "all") params.set("priority", priorityFilter);
  const listQuery = `/api/support/admin/all?${params.toString()}`;

  const { data, isLoading, refetch } = useApiQuery<TicketsResponse>(["admin", "tickets", listQuery], listQuery);

  const tickets = data?.tickets || [];
  const total = data?.total || 0;
  const totalPages = data?.totalPages || 1;
  const stats = data?.stats || EMPTY_STATS;
  const hasActiveFilters = debouncedSearch || statusFilter !== "all" || priorityFilter !== "all";

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSendReply = async () => {
    if (!reply.trim() || !selectedTicket) return;
    try {
      await addMessage.mutateAsync({ id: selectedTicket.id, message: reply, isInternal });
      setReply("");
      setIsInternal(false);
      toast.success(isInternal ? "Internal note added" : "Reply sent");
    } catch (err: any) {
      toast.error(err?.message || "Failed to send");
    }
  };

  const handleStatusChange = async (ticketId: number, status: string) => {
    try {
      await updateStatus.mutateAsync({ id: ticketId, status });
      toast.success(`Status updated to ${STATUS_CONFIG[status]?.label || status}`);
      refetch();
      if (selectedTicket?.id === ticketId) {
        setSelectedTicket({ ...selectedTicket, status });
      }
    } catch (err: any) {
      toast.error(err?.message || "Failed to update");
    }
  };

  const handleAssign = async (ticketId: number, userId: number) => {
    try {
      await assignTicket.mutateAsync({ id: ticketId, userId });
      toast.success("Ticket assigned");
      refetch();
      if (selectedTicket?.id === ticketId) {
        setSelectedTicket({ ...selectedTicket, assignedTo: userId });
      }
    } catch (err: any) {
      toast.error(err?.message || "Failed to assign");
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Detail view
  if (showDetail && selectedTicket) {
    const priorityCfg = PRIORITY_CONFIG[selectedTicket.priority] || PRIORITY_CONFIG.medium;
    const assignee = briefUsers?.find((u) => u.id === selectedTicket.assignedTo);

    return (
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon-sm" onClick={() => { setShowDetail(false); setSelectedTicket(null); }}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1">
            <h1 className="text-sm font-medium">{selectedTicket.subject}</h1>
            <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
              <span>#{selectedTicket.id}</span>
              <span>·</span>
              <span>User {selectedTicket.userId}</span>
              <span>·</span>
              <span>{selectedTicket.category}</span>
              <span>·</span>
              <span>{formatFullTime(selectedTicket.createdAt)}</span>
            </div>
          </div>
        </div>

        {/* Status & Actions Bar */}
        <div className="card-subtle p-3 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground">Status:</span>
            <div className="relative">
              <select
                value={selectedTicket.status}
                onChange={(e) => handleStatusChange(selectedTicket.id, e.target.value)}
                className="h-7 rounded border border-input bg-background px-2 pr-6 text-[10px] appearance-none cursor-pointer"
              >
                {Object.entries(STATUS_CONFIG).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground pointer-events-none" />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground">Priority:</span>
            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium border ${priorityCfg.color}`}>
              {priorityCfg.label}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground">Assign:</span>
            <div className="relative">
              <select
                value={selectedTicket.assignedTo || ""}
                onChange={(e) => handleAssign(selectedTicket.id, parseInt(e.target.value))}
                className="h-7 rounded border border-input bg-background px-2 pr-6 text-[10px] appearance-none cursor-pointer"
              >
                <option value="">Unassigned</option>
                {(briefUsers || []).map((u: any) => (
                  <option key={u.id} value={u.id}>{u.name || u.email}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground pointer-events-none" />
            </div>
          </div>

          {assignee && (
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <User className="h-3 w-3" />
              {assignee.name || assignee.email}
            </div>
          )}
        </div>

        {/* Messages Thread */}
        <div className="border rounded-lg overflow-hidden">
          <div className="p-3 border-b bg-muted/30">
            <h3 className="text-xs font-medium text-muted-foreground">Conversation</h3>
          </div>
          <div className="max-h-[50vh] overflow-y-auto p-4 space-y-4">
            {messagesLoading ? (
              <div className="flex justify-center py-8"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
            ) : !messages || messages.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-8">No messages yet</p>
            ) : (
              messages.map((msg: any) => {
                const isAdmin = msg.userId !== selectedTicket.userId;
                return (
                  <div key={msg.id} className={`flex ${isAdmin ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[75%] rounded-lg p-3 ${
                      msg.isInternal
                        ? "bg-amber-500/10 border border-amber-500/20"
                        : isAdmin
                        ? "bg-foreground text-background"
                        : "bg-secondary"
                    }`}>
                      <div className="flex items-center gap-2 mb-1">
                        {msg.isInternal && <Lock className="h-3 w-3 text-amber-600" />}
                        <span className="text-[10px] font-medium">
                          {msg.isInternal ? "Internal Note" : isAdmin ? "Support" : `User ${msg.userId}`}
                        </span>
                        <span className={`text-[10px] ${isAdmin ? "text-background/60" : "text-muted-foreground"}`}>
                          {formatTime(msg.createdAt)}
                        </span>
                      </div>
                      <p className="text-xs whitespace-pre-wrap">{msg.message}</p>
                    </div>
                  </div>
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Reply Box */}
        <div className="card-subtle p-3 space-y-2">
          <div className="flex items-center gap-2">
            <button
              className={`text-[10px] px-2 py-1 rounded border transition-colors ${
                isInternal
                  ? "border-amber-500/40 bg-amber-500/10 text-amber-600"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
              onClick={() => setIsInternal(!isInternal)}
            >
              {isInternal ? <><Lock className="h-3 w-3 inline mr-1" />Internal Note</> : <><Unlock className="h-3 w-3 inline mr-1" />Reply</>}
            </button>
          </div>
          <div className="flex gap-2">
            <Input
              placeholder={isInternal ? "Add an internal note (not visible to user)..." : "Type your reply..."}
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSendReply(); } }}
              className="text-xs flex-1"
              disabled={selectedTicket.status === "closed"}
            />
            <Button
              size="sm"
              className="text-xs h-8"
              disabled={!reply.trim() || selectedTicket.status === "closed" || addMessage.isPending}
              onClick={handleSendReply}
            >
              {addMessage.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // List view
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-medium tracking-tight">Support Tickets</h1>
        <p className="text-xs text-muted-foreground mt-1">Manage and respond to customer support requests</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Total", value: stats.total, icon: MessageSquare },
          { label: "Open", value: stats.open, icon: AlertCircle },
          { label: "Pending", value: stats.pending, icon: Clock },
          { label: "Resolved", value: stats.resolved, icon: CheckCircle },
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

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search by subject, ticket #, or user..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 text-xs flex-1 pl-8"
          />
        </div>
        <div className="relative">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 pr-8 text-xs appearance-none cursor-pointer"
          >
            <option value="all">All Status</option>
            {Object.entries(STATUS_CONFIG).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>
          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
        </div>
        <div className="relative">
          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 pr-8 text-xs appearance-none cursor-pointer"
          >
            <option value="all">All Priority</option>
            {Object.entries(PRIORITY_CONFIG).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>
          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
        </div>
        {hasActiveFilters && (
          <Button variant="ghost" size="sm" className="h-9 text-xs" onClick={() => { setSearch(""); setStatusFilter("all"); setPriorityFilter("all"); }}>
            <X className="h-3 w-3 mr-1" /> Clear
          </Button>
        )}
      </div>

      {/* Sort toolbar */}
      <div className="flex items-center gap-0.5" aria-label="Sort support tickets">
        <span className="text-[10px] text-muted-foreground mr-1">Sort:</span>
        {SORT_COLUMNS.map((col) => sortHeader(col.key, col.label))}
      </div>

      {/* Ticket List */}
      <div className="space-y-1">
        {tickets.length === 0 ? (
          <div className="card-subtle p-8 text-center text-sm text-muted-foreground">
            No tickets found
          </div>
        ) : (
          tickets.map((ticket: any) => {
            const statusCfg = STATUS_CONFIG[ticket.status] || STATUS_CONFIG.open;
            const priorityCfg = PRIORITY_CONFIG[ticket.priority] || PRIORITY_CONFIG.medium;
            const StatusIcon = statusCfg.icon;
            return (
              <div
                key={ticket.id}
                className="card-subtle p-4 cursor-pointer hover:bg-secondary/20 transition-colors"
                onClick={() => { setSelectedTicket(ticket); setShowDetail(true); }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="h-8 w-8 rounded-full bg-secondary flex items-center justify-center shrink-0 mt-0.5">
                      <MessageSquare className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium truncate">{ticket.subject}</span>
                        <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium border ${priorityCfg.color}`}>
                          {priorityCfg.label}
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2">
                        <span>#{ticket.id}</span>
                        <span>·</span>
                        <span>{ticket.userName || `User ${ticket.userId}`}</span>
                        <span>·</span>
                        <span>{ticket.category}</span>
                        <span>·</span>
                        <span>{formatTime(ticket.createdAt)}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${statusCfg.color}`}>
                      <StatusIcon className="h-3 w-3" />
                      {statusCfg.label}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-[10px] h-7"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedTicket(ticket);
                        setShowDetail(true);
                      }}
                    >
                      View
                    </Button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Pagination Footer */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-muted-foreground">
        <div>
          Showing {tickets.length} of {total} tickets
          {total > 0 && ` · Page ${page} of ${totalPages}`}
        </div>
        <div className="flex items-center gap-2">
          <select
            value={pageSize}
            onChange={(e) => setPageSize(Number(e.target.value))}
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
    </div>
  );
}
