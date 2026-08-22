/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useApiQuery, useApiMutation } from "@/hooks/use-api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { PageLoader } from "@/components/dashboard/PageLoader";
import { formatMoney } from "@/lib/utils";
import {
  BookOpen, Plus, Search, Filter, TrendingUp, TrendingDown,
  Minus, Target, BarChart3, X, ChevronDown, ChevronUp,
  Clock, Star, Brain, Tag, Camera, Trash2, Edit3, Eye,
  ArrowUpRight, ArrowDownRight, DollarSign, Trophy, Flame,
  AlertTriangle, ImagePlus, XCircle, ChevronLeft, RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ═══════════════════════════════════════════════════════
//  Types
// ═══════════════════════════════════════════════════════

interface JournalEntry {
  id: number;
  userId: number;
  challengeId: number | null;
  symbol: string;
  direction: string;
  lotSize: number | null;
  entryPrice: number | null;
  exitPrice: number | null;
  stopLoss: number | null;
  takeProfit: number | null;
  pnl: number | null;
  commission: number | null;
  swap: number | null;
  pips: number | null;
  openTime: number | null;
  closeTime: number | null;
  duration: number | null;
  strategy: string | null;
  timeframe: string | null;
  setupQuality: number | null;
  emotionalState: string | null;
  outcome: string;
  tags: string | null;
  notes: string | null;
  lessonsLearned: string | null;
  screenshots: string | null;
  createdAt: number;
  updatedAt: number;
}

interface JournalStats {
  totalTrades: number;
  wins: number;
  losses: number;
  breakeven: number;
  winRate: number;
  totalPnl: number;
  avgWin: number;
  avgLoss: number;
  profitFactor: number;
  largestWin: number;
  largestLoss: number;
  avgSetupQuality: number;
  strategyStats: { name: string; winRate: number; total: number; pnl: number }[];
  symbolStats: { symbol: string; winRate: number; total: number; pnl: number }[];
}

const STRATEGIES = [
  "Breakout", "Pullback", "Mean Reversion", "Trend Following",
  "Scalping", "Swing", "News Trading", "Supply & Demand",
  "Order Blocks", "Fibonacci", "ICT Concepts", "Price Action",
  "Range Trading", "Momentum", "Custom",
];

const TIMEFRAMES = ["M1", "M5", "M15", "M30", "H1", "H4", "D1", "W1", "MN"];

const EMOTIONAL_STATES = [
  { value: "confident", label: "Confident", color: "text-emerald-500", icon: "😎" },
  { value: "neutral", label: "Neutral", color: "text-blue-500", icon: "😐" },
  { value: "anxious", label: "Anxious", color: "text-amber-500", icon: "😰" },
  { value: "fomo", label: "FOMO", color: "text-orange-500", icon: "🔥" },
  { value: "revenge", label: "Revenge", color: "text-red-500", icon: "😤" },
  { value: "greedy", label: "Greedy", color: "text-purple-500", icon: "🤑" },
];

const POPULAR_PAIRS = [
  "EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "USDCAD", "USDCHF", "NZDUSD",
  "EURGBP", "EURJPY", "GBPJPY", "AUDJPY", "XAUUSD", "XAGUSD", "BTCUSD",
  "US30", "NAS100", "SPX500", "UK100", "DAX40", "JP225",
];

// ═══════════════════════════════════════════════════════
//  Empty form state
// ═══════════════════════════════════════════════════════

function getEmptyForm(): Record<string, any> {
  return {
    symbol: "EURUSD",
    direction: "buy",
    lotSize: null,
    entryPrice: null,
    exitPrice: null,
    stopLoss: null,
    takeProfit: null,
    pnl: null,
    commission: null,
    swap: null,
    pips: null,
    strategy: null,
    timeframe: null,
    setupQuality: 3,
    emotionalState: "neutral",
    outcome: "win",
    tags: [],
    notes: "",
    lessonsLearned: "",
    screenshots: null,
    screenshotsData: [],
  };
}

// ═══════════════════════════════════════════════════════
//  Main Journal Page
// ═══════════════════════════════════════════════════════

export default function Journal() {
  const [search, setSearch] = useState("");
  const [filterSymbol, setFilterSymbol] = useState("");
  const [filterOutcome, setFilterOutcome] = useState("");
  const [filterStrategy, setFilterStrategy] = useState("");
  const [sortBy, setSortBy] = useState("newest");
  const [showForm, setShowForm] = useState(false);
  const [editingEntry, setEditingEntry] = useState<JournalEntry | null>(null);
  const [viewingEntry, setViewingEntry] = useState<JournalEntry | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);

  const queryParams = useMemo(() => {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (filterSymbol) params.set("symbol", filterSymbol);
    if (filterOutcome) params.set("outcome", filterOutcome);
    if (filterStrategy) params.set("strategy", filterStrategy);
    params.set("sort", sortBy);
    return params.toString();
  }, [search, filterSymbol, filterOutcome, filterStrategy, sortBy]);

  const { data, isLoading, refetch } = useApiQuery<any>(
    ["journal", queryParams],
    `/api/journal?${queryParams}`,
  );

  const createMutation = useApiMutation<any, any>("post", "/api/journal");
  const updateMutation = useApiMutation<any, any>("put", "/api/journal");
  const deleteMutation = useApiMutation<any, any>("delete", "/api/journal");

  const entries: JournalEntry[] = data?.entries || [];
  const stats: JournalStats = data?.stats || {
    totalTrades: 0, wins: 0, losses: 0, breakeven: 0,
    winRate: 0, totalPnl: 0, avgWin: 0, avgLoss: 0,
    profitFactor: 0, largestWin: 0, largestLoss: 0,
    avgSetupQuality: 0, strategyStats: [], symbolStats: [],
  };

  const handleCreate = async (formData: any) => {
    await createMutation.mutateAsync(formData);
    setShowForm(false);
    refetch();
  };

  const handleUpdate = async (id: number, formData: any) => {
    await updateMutation.mutateAsync({ id, ...formData });
    setEditingEntry(null);
    setShowForm(false);
    refetch();
  };

  const handleDelete = async (id: number) => {
    await deleteMutation.mutateAsync({ id });
    setDeleteConfirm(null);
    refetch();
  };

  if (isLoading) {
    return (
      <div className="space-y-8">
        <PageHeader eyebrow="Journal" title="Trade Journal" subtitle="Log and analyze your trades" />
        <PageLoader rows={6} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Journal"
        title="Trade Journal"
        subtitle="Log every trade, review your performance, and improve your edge"
        actions={
          <Button size="sm" className="text-xs" onClick={() => { setEditingEntry(null); setShowForm(true); }}>
            <Plus className="h-3 w-3 mr-1" /> New Entry
          </Button>
        }
      />

      {/* ─── Stats Overview ─── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3">
        <StatCard label="Total Trades" value={String(stats.totalTrades)} icon={BarChart3} />
        <StatCard
          label="Win Rate"
          value={`${stats.winRate.toFixed(1)}%`}
          icon={Trophy}
          highlight={stats.winRate >= 55 ? "positive" : stats.winRate < 45 ? "negative" : "neutral"}
        />
        <StatCard
          label="Total P&L"
          value={`${stats.totalPnl >= 0 ? "+" : ""}${formatMoney(stats.totalPnl)}`}
          icon={DollarSign}
          highlight={stats.totalPnl >= 0 ? "positive" : "negative"}
        />
        <StatCard
          label="Profit Factor"
          value={stats.profitFactor === Infinity ? "∞" : stats.profitFactor.toFixed(2)}
          icon={Target}
          highlight={stats.profitFactor >= 1.5 ? "positive" : stats.profitFactor < 1 ? "negative" : "neutral"}
        />
        <StatCard label="Avg Win" value={formatMoney(stats.avgWin)} icon={TrendingUp} highlight="positive" />
        <StatCard label="Avg Loss" value={formatMoney(-stats.avgLoss)} icon={TrendingDown} highlight="negative" />
      </div>

      {/* ─── Search & Filters ─── */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search trades by symbol, notes, strategy, or tags..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm bg-secondary/50 border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary/50"
            />
          </div>
          <Button variant="outline" size="sm" className="text-xs" onClick={() => setShowFilters(!showFilters)}>
            <Filter className="h-3 w-3 mr-1" /> Filters
            {(filterSymbol || filterOutcome || filterStrategy) && (
              <Badge variant="default" className="ml-1 h-4 w-4 rounded-full p-0 text-[9px] flex items-center justify-center">
                {[filterSymbol, filterOutcome, filterStrategy].filter(Boolean).length}
              </Badge>
            )}
          </Button>
          <Button variant="outline" size="sm" className="text-xs" onClick={() => refetch()}>
            <RefreshCw className="h-3 w-3" />
          </Button>
        </div>

        <AnimatePresence>
          {showFilters && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="card-subtle p-4 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 block">Symbol</label>
                    <select
                      value={filterSymbol}
                      onChange={(e) => setFilterSymbol(e.target.value)}
                      className="w-full px-3 py-1.5 text-sm bg-secondary/50 border border-border rounded-lg"
                    >
                      <option value="">All Symbols</option>
                      {POPULAR_PAIRS.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 block">Outcome</label>
                    <select
                      value={filterOutcome}
                      onChange={(e) => setFilterOutcome(e.target.value)}
                      className="w-full px-3 py-1.5 text-sm bg-secondary/50 border border-border rounded-lg"
                    >
                      <option value="">All Outcomes</option>
                      <option value="win">Win</option>
                      <option value="loss">Loss</option>
                      <option value="breakeven">Breakeven</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 block">Strategy</label>
                    <select
                      value={filterStrategy}
                      onChange={(e) => setFilterStrategy(e.target.value)}
                      className="w-full px-3 py-1.5 text-sm bg-secondary/50 border border-border rounded-lg"
                    >
                      <option value="">All Strategies</option>
                      {STRATEGIES.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                </div>
                {(filterSymbol || filterOutcome || filterStrategy) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs text-muted-foreground"
                    onClick={() => { setFilterSymbol(""); setFilterOutcome(""); setFilterStrategy(""); }}
                  >
                    <XCircle className="h-3 w-3 mr-1" /> Clear filters
                  </Button>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ─── Strategy & Symbol Performance ─── */}
      {stats.strategyStats.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card className="gap-0">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium flex items-center gap-1.5">
                <Brain className="h-3.5 w-3.5 text-muted-foreground" /> Performance by Strategy
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {stats.strategyStats.sort((a, b) => b.total - a.total).slice(0, 6).map((s) => (
                <div key={s.name} className="flex items-center gap-2 text-xs">
                  <span className="w-24 truncate text-muted-foreground">{s.name}</span>
                  <div className="flex-1 h-1.5 bg-secondary rounded-full overflow-hidden">
                    <div
                      className={cn("h-full rounded-full", s.winRate >= 55 ? "bg-emerald-500" : s.winRate < 45 ? "bg-red-500" : "bg-amber-500")}
                      style={{ width: `${Math.min(s.winRate, 100)}%` }}
                    />
                  </div>
                  <span className="w-12 text-right font-medium">{s.winRate.toFixed(0)}%</span>
                  <span className="w-6 text-center text-muted-foreground">({s.total})</span>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="gap-0">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium flex items-center gap-1.5">
                <BarChart3 className="h-3.5 w-3.5 text-muted-foreground" /> Performance by Symbol
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {stats.symbolStats.sort((a, b) => b.total - a.total).slice(0, 6).map((s) => (
                <div key={s.symbol} className="flex items-center gap-2 text-xs">
                  <span className="w-16 truncate font-medium">{s.symbol}</span>
                  <div className="flex-1 h-1.5 bg-secondary rounded-full overflow-hidden">
                    <div
                      className={cn("h-full rounded-full", s.winRate >= 55 ? "bg-emerald-500" : s.winRate < 45 ? "bg-red-500" : "bg-amber-500")}
                      style={{ width: `${Math.min(s.winRate, 100)}%` }}
                    />
                  </div>
                  <span className="w-12 text-right font-medium">{s.winRate.toFixed(0)}%</span>
                  <span className="w-6 text-center text-muted-foreground">({s.total})</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ─── Trade Entries List ─── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium flex items-center gap-1.5">
            <BookOpen className="h-4 w-4 text-muted-foreground" /> Trade Log
            <Badge variant="secondary" className="text-[10px] ml-1">{entries.length}</Badge>
          </h2>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="text-xs px-2 py-1 bg-secondary/50 border border-border rounded-lg"
          >
            <option value="newest">Newest First</option>
            <option value="oldest">Oldest First</option>
          </select>
        </div>

        {entries.length === 0 ? (
          <Card className="p-12 text-center space-y-4">
            <div className="h-16 w-16 rounded-2xl bg-secondary/50 flex items-center justify-center mx-auto">
              <BookOpen className="h-8 w-8 text-muted-foreground" />
            </div>
            <div>
              <h3 className="text-lg font-medium">No Trades Logged Yet</h3>
              <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
                Start logging your trades to build a comprehensive journal. Track your performance,
                identify patterns, and improve your trading edge.
              </p>
            </div>
            <Button size="sm" onClick={() => setShowForm(true)}>
              <Plus className="h-3 w-3 mr-1" /> Log Your First Trade
            </Button>
          </Card>
        ) : (
          <div className="space-y-2">
            {entries.map((entry) => (
              <TradeEntryCard
                key={entry.id}
                entry={entry}
                onView={() => setViewingEntry(entry)}
                onEdit={() => { setEditingEntry(entry); setShowForm(true); }}
                onDelete={() => setDeleteConfirm(entry.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* ─── Create/Edit Form Modal ─── */}
      <AnimatePresence>
        {showForm && (
          <TradeForm
            entry={editingEntry}
            onSubmit={editingEntry
              ? (data) => handleUpdate(editingEntry.id, data)
              : handleCreate
            }
            onClose={() => { setShowForm(false); setEditingEntry(null); }}
          />
        )}
      </AnimatePresence>

      {/* ─── View Entry Modal ─── */}
      <AnimatePresence>
        {viewingEntry && (
          <TradeDetail
            entry={viewingEntry}
            onClose={() => setViewingEntry(null)}
          />
        )}
      </AnimatePresence>

      {/* ─── Delete Confirmation ─── */}
      <AnimatePresence>
        {deleteConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setDeleteConfirm(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-background border border-border rounded-xl p-6 max-w-sm w-full space-y-4 shadow-xl"
            >
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-destructive/10 flex items-center justify-center">
                  <AlertTriangle className="h-5 w-5 text-destructive" />
                </div>
                <div>
                  <h3 className="font-medium">Delete Trade Entry</h3>
                  <p className="text-xs text-muted-foreground">This action cannot be undone.</p>
                </div>
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" size="sm" onClick={() => setDeleteConfirm(null)}>Cancel</Button>
                <Button variant="destructive" size="sm" onClick={() => handleDelete(deleteConfirm)}>
                  <Trash2 className="h-3 w-3 mr-1" /> Delete
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
//  Stat Card
// ═══════════════════════════════════════════════════════

function StatCard({ label, value, icon: Icon, highlight }: {
  label: string; value: string; icon: any; highlight?: "positive" | "negative" | "neutral";
}) {
  return (
    <div className="card-subtle p-3 text-center space-y-1">
      <div className="flex items-center justify-center gap-1 text-[10px] text-muted-foreground uppercase tracking-wider">
        <Icon className="h-3 w-3" /> {label}
      </div>
      <div className={cn(
        "text-lg font-bold",
        highlight === "positive" && "text-emerald-600",
        highlight === "negative" && "text-destructive",
      )}>
        {value}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
//  Trade Entry Card
// ═══════════════════════════════════════════════════════

function TradeEntryCard({ entry, onView, onEdit, onDelete }: {
  entry: JournalEntry; onView: () => void; onEdit: () => void; onDelete: () => void;
}) {
  const isWin = entry.outcome === "win";
  const isLoss = entry.outcome === "loss";
  const tags: string[] = entry.tags ? JSON.parse(entry.tags) : [];
  const hasScreenshots = entry.screenshots && JSON.parse(entry.screenshots).length > 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="card-subtle hover:ring-1 hover:ring-primary/20 transition-all cursor-pointer group"
      onClick={onView}
    >
      <div className="p-4">
        <div className="flex items-center justify-between gap-3">
          {/* Left: Symbol + Direction */}
          <div className="flex items-center gap-3 min-w-0">
            <div className={cn(
              "h-9 w-9 rounded-lg flex items-center justify-center shrink-0",
              isWin ? "bg-emerald-500/10" : isLoss ? "bg-red-500/10" : "bg-secondary"
            )}>
              {isWin ? (
                <ArrowUpRight className="h-4 w-4 text-emerald-600" />
              ) : isLoss ? (
                <ArrowDownRight className="h-4 w-4 text-red-600" />
              ) : (
                <Minus className="h-4 w-4 text-muted-foreground" />
              )}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-sm">{entry.symbol}</span>
                <Badge variant={entry.direction === "buy" ? "default" : "secondary"} className="text-[9px] px-1.5 py-0">
                  {entry.direction.toUpperCase()}
                </Badge>
                {entry.timeframe && (
                  <Badge variant="outline" className="text-[9px] px-1.5 py-0">{entry.timeframe}</Badge>
                )}
              </div>
              <div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-0.5">
                {entry.strategy && <span>{entry.strategy}</span>}
                {entry.lotSize && <span>· {entry.lotSize} lot</span>}
                {entry.pips != null && (
                  <span className={entry.pips >= 0 ? "text-emerald-600" : "text-destructive"}>
                    · {entry.pips >= 0 ? "+" : ""}{entry.pips.toFixed(1)} pips
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Right: P&L + Actions */}
          <div className="text-right shrink-0">
            <div className={cn(
              "text-lg font-bold tabular-nums",
              isWin ? "text-emerald-600" : isLoss ? "text-destructive" : "text-muted-foreground",
            )}>
              {entry.pnl != null ? `${entry.pnl >= 0 ? "+" : ""}${formatMoney(entry.pnl)}` : "—"}
            </div>
            <div className="flex items-center gap-1 justify-end mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={(e) => { e.stopPropagation(); onView(); }}>
                <Eye className="h-3 w-3" />
              </Button>
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={(e) => { e.stopPropagation(); onEdit(); }}>
                <Edit3 className="h-3 w-3" />
              </Button>
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-destructive" onClick={(e) => { e.stopPropagation(); onDelete(); }}>
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          </div>
        </div>

        {/* Bottom row: tags + meta */}
        {(tags.length > 0 || entry.emotionalState || entry.setupQuality || hasScreenshots) && (
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            {entry.emotionalState && (
              <span className="text-[10px]">
                {EMOTIONAL_STATES.find((e) => e.value === entry.emotionalState)?.icon}{" "}
                <span className="text-muted-foreground">{entry.emotionalState}</span>
              </span>
            )}
            {entry.setupQuality && (
              <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                <Star className="h-2.5 w-2.5" /> {entry.setupQuality}/5
              </span>
            )}
            {hasScreenshots && (
              <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                <Camera className="h-2.5 w-2.5" /> Screenshot
              </span>
            )}
            {tags.slice(0, 3).map((tag) => (
              <Badge key={tag} variant="outline" className="text-[9px] px-1.5 py-0">{tag}</Badge>
            ))}
            {tags.length > 3 && (
              <span className="text-[10px] text-muted-foreground">+{tags.length - 3} more</span>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════
//  Trade Form Modal
// ═══════════════════════════════════════════════════════

function TradeForm({ entry, onSubmit, onClose }: {
  entry: JournalEntry | null;
  onSubmit: (data: any) => Promise<any>;
  onClose: () => void;
}) {
  const [form, setForm] = useState(() => {
    if (entry) {
      return {
        ...entry,
        tags: entry.tags ? JSON.parse(entry.tags) : [],
        screenshotsData: entry.screenshots ? JSON.parse(entry.screenshots) : [],
      };
    }
    return getEmptyForm();
  });
  const [saving, setSaving] = useState(false);
  const [tagInput, setTagInput] = useState("");
  const screenshotRef = useRef<HTMLInputElement>(null);

  const updateField = (field: string, value: any) => setForm((prev) => ({ ...prev, [field]: value }));

  const addTag = () => {
    if (tagInput.trim() && !(form.tags as string[]).includes(tagInput.trim())) {
      updateField("tags", [...(form.tags as string[]), tagInput.trim()]);
      setTagInput("");
    }
  };

  const removeTag = (tag: string) => {
    updateField("tags", (form.tags as string[]).filter((t) => t !== tag));
  };

  const handleScreenshot = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        const existing = (form.screenshotsData as any[]) || [];
        updateField("screenshotsData", [...existing, { name: file.name, dataUrl }]);
      };
      reader.readAsDataURL(file);
    });
  };

  const removeScreenshot = (idx: number) => {
    const updated = (form.screenshotsData as any[]).filter((_: any, i: number) => i !== idx);
    updateField("screenshotsData", updated);
  };

  const handleSubmit = async () => {
    setSaving(true);
    try {
      await onSubmit({
        ...form,
        screenshots: form.screenshotsData || [],
      });
    } catch { /* silent */ }
    setSaving(false);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-start justify-center p-4 pt-12 overflow-y-auto"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0, y: 16 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.95, opacity: 0, y: 16 }}
        onClick={(e) => e.stopPropagation()}
        className="bg-background border border-border rounded-xl w-full max-w-2xl shadow-2xl space-y-0 overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-sm font-semibold">{entry ? "Edit Trade" : "Log New Trade"}</h2>
          <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
          {/* Symbol + Direction + Outcome */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 block">Symbol *</label>
              <input
                type="text"
                value={form.symbol || ""}
                onChange={(e) => updateField("symbol", e.target.value.toUpperCase())}
                className="w-full px-3 py-2 text-sm bg-secondary/50 border border-border rounded-lg font-mono"
                placeholder="EURUSD"
              />
              <div className="flex flex-wrap gap-1 mt-1.5">
                {POPULAR_PAIRS.slice(0, 8).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => updateField("symbol", p)}
                    className={cn(
                      "text-[9px] px-1.5 py-0.5 rounded border transition-colors",
                      form.symbol === p
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-secondary/50 text-muted-foreground border-border hover:bg-secondary"
                    )}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 block">Direction *</label>
              <div className="flex gap-1">
                {["buy", "sell"].map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => updateField("direction", d)}
                    className={cn(
                      "flex-1 py-2 text-sm font-medium rounded-lg border transition-colors",
                      form.direction === d
                        ? d === "buy"
                          ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/30"
                          : "bg-red-500/10 text-red-600 border-red-500/30"
                        : "bg-secondary/50 text-muted-foreground border-border"
                    )}
                  >
                    {d.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 block">Outcome *</label>
              <div className="flex gap-1">
                {(["win", "loss", "breakeven"] as const).map((o) => (
                  <button
                    key={o}
                    type="button"
                    onClick={() => updateField("outcome", o)}
                    className={cn(
                      "flex-1 py-2 text-[11px] font-medium rounded-lg border transition-colors",
                      form.outcome === o
                        ? o === "win"
                          ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/30"
                          : o === "loss"
                            ? "bg-red-500/10 text-red-600 border-red-500/30"
                            : "bg-amber-500/10 text-amber-600 border-amber-500/30"
                        : "bg-secondary/50 text-muted-foreground border-border"
                    )}
                  >
                    {o === "breakeven" ? "BE" : o.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Prices + P&L */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Entry Price", field: "entryPrice", placeholder: "1.08500" },
              { label: "Exit Price", field: "exitPrice", placeholder: "1.08750" },
              { label: "Stop Loss", field: "stopLoss", placeholder: "1.08300" },
              { label: "Take Profit", field: "takeProfit", placeholder: "1.09000" },
            ].map(({ label, field, placeholder }) => (
              <div key={field}>
                <label className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 block">{label}</label>
                <input
                  type="number"
                  step="any"
                  value={(form as any)[field] ?? ""}
                  onChange={(e) => updateField(field, e.target.value ? parseFloat(e.target.value) : null)}
                  className="w-full px-3 py-2 text-sm bg-secondary/50 border border-border rounded-lg font-mono"
                  placeholder={placeholder}
                />
              </div>
            ))}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 block">P&L ($)</label>
              <input
                type="number"
                step="any"
                value={form.pnl ?? ""}
                onChange={(e) => updateField("pnl", e.target.value ? parseFloat(e.target.value) : 0)}
                className="w-full px-3 py-2 text-sm bg-secondary/50 border border-border rounded-lg font-mono"
                placeholder="0.00"
              />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 block">Pips</label>
              <input
                type="number"
                step="any"
                value={form.pips ?? ""}
                onChange={(e) => updateField("pips", e.target.value ? parseFloat(e.target.value) : null)}
                className="w-full px-3 py-2 text-sm bg-secondary/50 border border-border rounded-lg font-mono"
                placeholder="25.0"
              />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 block">Lot Size</label>
              <input
                type="number"
                step="any"
                value={form.lotSize ?? ""}
                onChange={(e) => updateField("lotSize", e.target.value ? parseFloat(e.target.value) : null)}
                className="w-full px-3 py-2 text-sm bg-secondary/50 border border-border rounded-lg font-mono"
                placeholder="0.10"
              />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 block">Commission</label>
              <input
                type="number"
                step="any"
                value={form.commission ?? ""}
                onChange={(e) => updateField("commission", e.target.value ? parseFloat(e.target.value) : 0)}
                className="w-full px-3 py-2 text-sm bg-secondary/50 border border-border rounded-lg font-mono"
                placeholder="0.00"
              />
            </div>
          </div>

          {/* Strategy + Timeframe + Setup Quality */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 block">Strategy</label>
              <select
                value={form.strategy || ""}
                onChange={(e) => updateField("strategy", e.target.value || null)}
                className="w-full px-3 py-2 text-sm bg-secondary/50 border border-border rounded-lg"
              >
                <option value="">Select...</option>
                {STRATEGIES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 block">Timeframe</label>
              <div className="flex flex-wrap gap-1">
                {TIMEFRAMES.map((tf) => (
                  <button
                    key={tf}
                    type="button"
                    onClick={() => updateField("timeframe", tf)}
                    className={cn(
                      "text-[10px] px-2 py-1 rounded border transition-colors",
                      form.timeframe === tf
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-secondary/50 text-muted-foreground border-border"
                    )}
                  >
                    {tf}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 block">Setup Quality (1-5)</label>
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => updateField("setupQuality", q)}
                    className={cn(
                      "flex-1 py-2 rounded-lg border transition-colors text-sm font-medium",
                      form.setupQuality === q
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-secondary/50 text-muted-foreground border-border"
                    )}
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Emotional State */}
          <div>
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5 block flex items-center gap-1">
              <Brain className="h-3 w-3" /> Emotional State
            </label>
            <div className="flex gap-2 flex-wrap">
              {EMOTIONAL_STATES.map((e) => (
                <button
                  key={e.value}
                  type="button"
                  onClick={() => updateField("emotionalState", e.value)}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs transition-colors",
                    form.emotionalState === e.value
                      ? "bg-primary/10 border-primary/30 ring-1 ring-primary/20"
                      : "bg-secondary/50 border-border hover:bg-secondary"
                  )}
                >
                  <span>{e.icon}</span>
                  <span>{e.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Tags */}
          <div>
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5 block flex items-center gap-1">
              <Tag className="h-3 w-3" /> Tags
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(); } }}
                className="flex-1 px-3 py-1.5 text-sm bg-secondary/50 border border-border rounded-lg"
                placeholder="Add a tag and press Enter..."
              />
              <Button variant="outline" size="sm" className="text-xs" onClick={addTag} type="button">Add</Button>
            </div>
            {(form.tags as string[]).length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {(form.tags as string[]).map((tag) => (
                  <Badge key={tag} variant="secondary" className="text-[10px] gap-1 pr-1">
                    {tag}
                    <button onClick={() => removeTag(tag)} className="ml-0.5 hover:text-destructive">
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {/* Notes */}
          <div>
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 block">Trade Notes</label>
            <textarea
              value={form.notes || ""}
              onChange={(e) => updateField("notes", e.target.value)}
              className="w-full px-3 py-2 text-sm bg-secondary/50 border border-border rounded-lg min-h-[80px] resize-y"
              placeholder="What was your thesis? What did you observe? What went well or poorly?"
            />
          </div>

          {/* Lessons Learned */}
          <div>
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 block">Lessons Learned</label>
            <textarea
              value={form.lessonsLearned || ""}
              onChange={(e) => updateField("lessonsLearned", e.target.value)}
              className="w-full px-3 py-2 text-sm bg-secondary/50 border border-border rounded-lg min-h-[60px] resize-y"
              placeholder="What would you do differently next time?"
            />
          </div>

          {/* Screenshots */}
          <div>
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5 block flex items-center gap-1">
              <Camera className="h-3 w-3" /> Screenshots
            </label>
            <input
              ref={screenshotRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handleScreenshot}
              className="hidden"
            />
            <Button variant="outline" size="sm" className="text-xs" onClick={() => screenshotRef.current?.click()} type="button">
              <ImagePlus className="h-3 w-3 mr-1" /> Add Screenshots
            </Button>
            {(form.screenshotsData as any[]).length > 0 && (
              <div className="flex gap-2 mt-2 flex-wrap">
                {(form.screenshotsData as any[]).map((ss: any, idx: number) => (
                  <div key={idx} className="relative group">
                    <img src={ss.dataUrl} alt={ss.name} className="h-16 w-16 object-cover rounded-lg border border-border" />
                    <button
                      onClick={() => removeScreenshot(idx)}
                      className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-destructive text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      type="button"
                    >
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-6 py-4 border-t border-border bg-secondary/20">
          <Button variant="outline" size="sm" onClick={onClose} className="text-xs">Cancel</Button>
          <Button size="sm" onClick={handleSubmit} disabled={saving} className="text-xs">
            {saving ? <RefreshCw className="h-3 w-3 mr-1 animate-spin" /> : <BookOpen className="h-3 w-3 mr-1" />}
            {entry ? "Save Changes" : "Log Trade"}
          </Button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════
//  Trade Detail Modal
// ═══════════════════════════════════════════════════════

function TradeDetail({ entry, onClose }: { entry: JournalEntry; onClose: () => void }) {
  const tags: string[] = entry.tags ? JSON.parse(entry.tags) : [];
  const screenshots: any[] = entry.screenshots ? JSON.parse(entry.screenshots) : [];
  const isWin = entry.outcome === "win";
  const isLoss = entry.outcome === "loss";
  const emotion = EMOTIONAL_STATES.find((e) => e.value === entry.emotionalState);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-start justify-center p-4 pt-12 overflow-y-auto"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0, y: 16 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.95, opacity: 0, y: 16 }}
        onClick={(e) => e.stopPropagation()}
        className="bg-background border border-border rounded-xl w-full max-w-xl shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div className={cn(
          "px-6 py-4 border-b border-border",
          isWin ? "bg-emerald-500/5" : isLoss ? "bg-red-500/5" : ""
        )}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={cn(
                "h-10 w-10 rounded-xl flex items-center justify-center",
                isWin ? "bg-emerald-500/10" : isLoss ? "bg-red-500/10" : "bg-secondary"
              )}>
                {isWin ? <TrendingUp className="h-5 w-5 text-emerald-600" />
                  : isLoss ? <TrendingDown className="h-5 w-5 text-red-600" />
                  : <Minus className="h-5 w-5 text-muted-foreground" />}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold">{entry.symbol}</span>
                  <Badge variant={entry.direction === "buy" ? "default" : "secondary"} className="text-[10px]">
                    {entry.direction.toUpperCase()}
                  </Badge>
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {new Date(entry.createdAt).toLocaleString()} · {entry.strategy || "No strategy"} · {entry.timeframe || "—"}
                </div>
              </div>
            </div>
            <div className="text-right">
              <div className={cn(
                "text-xl font-bold",
                isWin ? "text-emerald-600" : isLoss ? "text-destructive" : "text-muted-foreground",
              )}>
                {entry.pnl != null ? `${entry.pnl >= 0 ? "+" : ""}${formatMoney(entry.pnl)}` : "—"}
              </div>
              {entry.pips != null && (
                <div className={cn("text-xs", entry.pips >= 0 ? "text-emerald-600" : "text-destructive")}>
                  {entry.pips >= 0 ? "+" : ""}{entry.pips.toFixed(1)} pips
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="p-6 space-y-5 max-h-[65vh] overflow-y-auto">
          {/* Price Levels */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Entry", value: entry.entryPrice },
              { label: "Exit", value: entry.exitPrice },
              { label: "Stop Loss", value: entry.stopLoss },
              { label: "Take Profit", value: entry.takeProfit },
            ].map(({ label, value }) => (
              <div key={label} className="text-center">
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</div>
                <div className="text-sm font-mono font-medium mt-0.5">{value?.toFixed(5) ?? "—"}</div>
              </div>
            ))}
          </div>

          {/* Meta badges */}
          <div className="flex flex-wrap gap-2">
            {emotion && (
              <Badge variant="outline" className="text-[10px] gap-1">
                {emotion.icon} {emotion.label}
              </Badge>
            )}
            {entry.setupQuality && (
              <Badge variant="outline" className="text-[10px] gap-1">
                <Star className="h-2.5 w-2.5" /> Setup: {entry.setupQuality}/5
              </Badge>
            )}
            {entry.lotSize && (
              <Badge variant="outline" className="text-[10px]">{entry.lotSize} lot</Badge>
            )}
            {entry.commission != null && entry.commission !== 0 && (
              <Badge variant="outline" className="text-[10px]">Commission: ${entry.commission}</Badge>
            )}
          </div>

          {/* Tags */}
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {tags.map((tag) => (
                <Badge key={tag} variant="secondary" className="text-[10px]">{tag}</Badge>
              ))}
            </div>
          )}

          {/* Notes */}
          {entry.notes && (
            <div>
              <h4 className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Trade Notes</h4>
              <p className="text-sm whitespace-pre-wrap">{entry.notes}</p>
            </div>
          )}

          {/* Lessons Learned */}
          {entry.lessonsLearned && (
            <div>
              <h4 className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Lessons Learned</h4>
              <p className="text-sm whitespace-pre-wrap text-muted-foreground italic">{entry.lessonsLearned}</p>
            </div>
          )}

          {/* Screenshots */}
          {screenshots.length > 0 && (
            <div>
              <h4 className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Screenshots</h4>
              <div className="grid grid-cols-2 gap-2">
                {screenshots.map((ss: any, idx: number) => (
                  <a key={idx} href={ss.dataUrl} target="_blank" rel="noopener noreferrer">
                    <img src={ss.dataUrl} alt={ss.name} className="w-full h-32 object-cover rounded-lg border border-border hover:ring-2 hover:ring-primary/30 transition-all" />
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end px-6 py-4 border-t border-border">
          <Button variant="outline" size="sm" onClick={onClose} className="text-xs">
            <ChevronLeft className="h-3 w-3 mr-1" /> Close
          </Button>
        </div>
      </motion.div>
    </motion.div>
  );
}
