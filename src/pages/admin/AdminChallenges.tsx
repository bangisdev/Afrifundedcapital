/* eslint-disable @typescript-eslint/no-explicit-any */
import { useApiQuery, useApiMutation } from "@/hooks/use-api";
import { readResponseBody, errorMessageOf } from "@/lib/api";
import { useState, useMemo, Fragment } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { newsBlackoutWindow } from "@/lib/utils";
import {
  Loader2,
  Plus,
  Edit2,
  Trash2,
  ChevronRight,
  X,
  Trophy,
  Users,
  CheckCircle,
  DollarSign,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  History,
  Check,
  Info,
} from "lucide-react";
import { toast } from "sonner";
import { Link } from "react-router";
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

interface Template {
  id: number;
  name: string;
  description: string | null;
  type: string;
  isActive: boolean | null;
  profitTarget: number;
  dailyDrawdown: number;
  maxDrawdown: number;
  maxLeverage: number;
  minTradingDays: number;
  maxTradingDays: number | null;
  maxPositionSize: number | null;
  consistencyTarget: number | null;
  allowWeekendHolding: boolean | null;
  allowNewsTrading: boolean | null;
  allowEATrading: boolean | null;
  allowCopyTrading: boolean | null;
  newsBlackoutBeforeMinutes: number | null;
  newsBlackoutAfterMinutes: number | null;
  price: number;
  currency: string;
  durationDays: number;
  resetFee: number | null;
  extensionFee: number | null;
  scalingPlan: string | null;
  maxAccountSize: number | null;
  createdBy: number;
  createdAt: number;
  updatedAt: number;
}

interface AccountSize {
  id: number;
  label: string;
  size: number;
  currency: string;
  templateId: number;
  price: number;
  isActive: boolean | null;
  sortOrder: number;
}

const TEMPLATE_TYPES = [
  { value: "two_step", label: "Two-Step" },
  { value: "one_step", label: "One-Step" },
  { value: "instant_funding", label: "Instant Funding" },
  { value: "evaluation", label: "Evaluation" },
];

function formatNgn(n: number) {
  return `₦${n.toLocaleString()}`;
}

// Compact news-trading rule label for the challenges table — mirrors the
// dashboard/landing "No · 15m" formatting via the shared blackout formatter.
function newsRulesLabel(rules: any): string {
  if (rules?.allowNewsTrading !== false) return "News on";
  const win = newsBlackoutWindow(rules || {});
  return win ? `No · ${win}` : "No · no blackout";
}

// Detail-row rule value for the expanded panel: "Yes" when allowed, otherwise
// the news row carries the configured blackout window ("No · 15m", "No · 30m/5m").
function ruleRowValue(rules: any, key: string): string {
  if (key === "news") {
    if (rules?.allowNewsTrading === false) {
      const win = newsBlackoutWindow(rules || {});
      return win ? `No · ${win}` : "No · no blackout";
    }
    return "Yes";
  }
  return rules?.[key] === false ? "No" : "Yes";
}

// Single trading-rule row for the expanded challenge detail — matches the
// ChallengeDetail card style (check/x + label + Yes/No value). An optional
// hint renders an info icon with a tooltip explaining the restriction.
function ruleRow(label: string, allowed: boolean, value: string, hint?: string) {
  return (
    <div className="flex items-center gap-1.5 text-xs">
      {allowed ? (
        <Check className="h-3 w-3 text-emerald-500 shrink-0" />
      ) : (
        <X className="h-3 w-3 text-muted-foreground/50 shrink-0" />
      )}
      <span className="text-muted-foreground">
        {hint ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex items-center gap-1 cursor-help">
                {label}
                <Info className="h-3 w-3 text-muted-foreground/50" />
              </span>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-64 text-xs leading-relaxed">
              {hint}
            </TooltipContent>
          </Tooltip>
        ) : (
          label
        )}
      </span>
      <span className={`ml-auto font-medium tabular-nums ${allowed ? "text-foreground" : "text-muted-foreground"}`}>
        {value}
      </span>
    </div>
  );
}

export default function AdminChallenges() {
  const { data: templates, isLoading: tLoading } = useApiQuery<Template[]>(
    ["admin", "templates"],
    "/api/challenges/templates"
  );
  const [challengeSortBy, setChallengeSortBy] = useState("createdAt");
  const [challengeSortOrder, setChallengeSortOrder] = useState<"asc" | "desc">("desc");
  const challengeParams = new URLSearchParams();
  challengeParams.set("sortBy", challengeSortBy);
  challengeParams.set("sortOrder", challengeSortOrder);
  const challengesQuery = `/api/challenges/admin/all?${challengeParams.toString()}`;
  const { data: allChallenges, isLoading: cLoading } = useApiQuery<any[]>(
    ["admin", "allChallenges", challengesQuery],
    challengesQuery
  );

  const handleChallengeSort = (key: string) => {
    if (challengeSortBy === key) {
      setChallengeSortOrder((o) => (o === "asc" ? "desc" : "asc"));
    } else {
      setChallengeSortBy(key);
      setChallengeSortOrder("desc");
    }
  };

  const challengeSortHeader = (sortKey: string, label: string) => {
    const active = challengeSortBy === sortKey;
    return (
      <button
        key={sortKey}
        type="button"
        onClick={() => handleChallengeSort(sortKey)}
        aria-label={`Sort by ${label}`}
        aria-pressed={active}
        className={`inline-flex items-center gap-1 font-medium transition-colors rounded px-1 py-0.5 -mx-1 ${
          active ? "text-foreground" : "text-muted-foreground hover:text-foreground"
        }`}
      >
        {label}
        {active ? (
          challengeSortOrder === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
        ) : (
          <ArrowUpDown className="h-3 w-3 opacity-50" />
        )}
      </button>
    );
  };

  // Scoped invalidation: creating a template/size only affects the template
  // list (sizes are loaded per-template into local state) — no full-cache blast.
  const createTemplate = useApiMutation<any, any>("post", "/api/challenges/admin/templates", {
    invalidateKeys: [["admin", "templates"]],
  });
  const createSize = useApiMutation<any, any>("post", "/api/challenges/admin/sizes", {
    invalidateKeys: [["admin", "templates"]],
  });

  const apiPut = async (path: string, body: any) => {
    const res = await fetch(path, { method: "PUT", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify(body) });
    if (!res.ok) { throw new Error(errorMessageOf(await readResponseBody(res), res.status)); }
    return readResponseBody(res);
  };
  const apiDelete = async (path: string) => {
    const res = await fetch(path, { method: "DELETE", credentials: "include" });
    if (!res.ok) { throw new Error(errorMessageOf(await readResponseBody(res), res.status)); }
    return readResponseBody(res);
  };

  const [expandedTemplate, setExpandedTemplate] = useState<number | null>(null);
  const [expandedChallenge, setExpandedChallenge] = useState<number | null>(null);
  const [showCreateTemplate, setShowCreateTemplate] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  const [addingSizeTo, setAddingSizeTo] = useState<number | null>(null);
  const [editingSize, setEditingSize] = useState<AccountSize | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ type: "template" | "size"; id: number; label: string } | null>(null);
  const [tab, setTab] = useState<"templates" | "challenges">("templates");

  // Create template form
  const [newTemplate, setNewTemplate] = useState({
    name: "",
    description: "",
    type: "two_step",
    profitTarget: 8,
    dailyDrawdown: 5,
    maxDrawdown: 10,
    maxLeverage: 100,
    minTradingDays: 5,
    maxTradingDays: null as number | null,
    price: 50000,
    currency: "NGN",
    durationDays: 30,
    resetFee: null as number | null,
    allowWeekendHolding: false,
    allowNewsTrading: true,
    allowEATrading: true,
    allowCopyTrading: false,
    newsBlackoutBeforeMinutes: 15 as number | null,
    newsBlackoutAfterMinutes: 15 as number | null,
  });

  // Add size form
  const [newSize, setNewSize] = useState({ label: "", size: 0, price: 0, sortOrder: 0 });

  // Sizes cache
  const [sizesCache, setSizesCache] = useState<Record<number, AccountSize[]>>({});

  const isLoading = tLoading || cLoading;

  const loadSizes = async (templateId: number) => {
    try {
      const res = await fetch(`/api/challenges/templates/${templateId}/sizes`, { credentials: "include" });
      const data = await readResponseBody(res);
      // Guard against non-array responses so sizes.map never crashes
      setSizesCache((prev) => ({ ...prev, [templateId]: Array.isArray(data) ? data : [] }));
    } catch {
      // Failed or non-JSON response — leave the cache empty so sizes.map is safe
    }
  };

  const toggleExpand = (id: number) => {
    if (expandedTemplate === id) {
      setExpandedTemplate(null);
    } else {
      setExpandedTemplate(id);
      if (!sizesCache[id]) loadSizes(id);
    }
  };

  const toggleChallengeExpand = (id: number) => {
    setExpandedChallenge((prev) => (prev === id ? null : id));
  };

  const stats = useMemo(() => {
    if (!templates || !allChallenges) return { templates: 0, active: 0, funded: 0, revenue: 0 };
    return {
      templates: templates.length,
      active: allChallenges.filter((c) => c.status === "active").length,
      funded: allChallenges.filter((c) => c.status === "funded").length,
      revenue: allChallenges.reduce((sum, c) => sum + (c.amountPaid || 0), 0),
    };
  }, [templates, allChallenges]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-medium tracking-tight">Challenge Management</h1>
          <p className="text-xs text-muted-foreground mt-1">
            Create and manage challenge templates and account sizes
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Templates", value: stats.templates, icon: Trophy },
          { label: "Active Challenges", value: stats.active, icon: Users },
          { label: "Funded Traders", value: stats.funded, icon: CheckCircle },
          { label: "Revenue", value: formatNgn(stats.revenue), icon: DollarSign },
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
        {(["templates", "challenges"] as const).map((t) => (
          <button
            key={t}
            className={`px-4 py-2 text-xs font-medium transition-colors border-b-2 -mb-px ${
              tab === t
                ? "border-foreground text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => setTab(t)}
          >
            {t === "templates" ? "Templates & Sizes" : `All Challenges (${allChallenges?.length || 0})`}
          </button>
        ))}
      </div>

      {/* Templates Tab */}
      {tab === "templates" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium">Challenge Templates</h2>
            <Button size="sm" className="text-xs h-8" onClick={() => setShowCreateTemplate(true)}>
              <Plus className="h-3 w-3 mr-1" /> New Template
            </Button>
          </div>

          {(templates || []).length === 0 ? (
            <div className="card-subtle p-8 text-center text-sm text-muted-foreground">
              No templates yet. Create your first challenge template.
            </div>
          ) : (
            <div className="space-y-2">
              {(templates || []).map((t) => {
                const sizes = Array.isArray(sizesCache[t.id]) ? sizesCache[t.id] : [];
                const isExpanded = expandedTemplate === t.id;
                return (
                  <div key={t.id} className="border rounded-lg overflow-hidden">
                    {/* Template Header */}
                    <div
                      className="p-4 flex items-center justify-between cursor-pointer hover:bg-muted/30 transition-colors"
                      onClick={() => toggleExpand(t.id)}
                    >
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-md bg-secondary flex items-center justify-center">
                          <Trophy className="h-4 w-4 text-muted-foreground" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium">{t.name}</span>
                            <Badge variant="outline" className="text-[10px]">
                              {TEMPLATE_TYPES.find((tp) => tp.value === t.type)?.label || t.type}
                            </Badge>
                            <Badge variant={t.isActive ? "default" : "secondary"} className="text-[10px]">
                              {t.isActive ? "Active" : "Inactive"}
                            </Badge>
                          </div>
                          <div className="text-xs text-muted-foreground mt-0.5">
                            {t.description || "No description"} · Base price: {formatNgn(t.price)} · {sizes.length} sizes
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <Link
                          to={`/admin/audit-logs?entity=challenge_template&entityId=${t.id}`}
                          className="inline-flex items-center justify-center h-7 w-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
                          title={`View the audit trail for template ${t.name}`}
                          aria-label={`View audit trail for template ${t.id}`}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <History className="h-3.5 w-3.5" />
                        </Link>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="h-7 w-7"
                          title="Edit template"
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingTemplate(t);
                          }}
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="h-7 w-7"
                          title="Delete template"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteTarget({ type: "template", id: t.id, label: t.name });
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                        <ChevronRight
                          className={`h-4 w-4 text-muted-foreground transition-transform ${isExpanded ? "rotate-90" : ""}`}
                        />
                      </div>
                    </div>

                    {/* Expanded: Account Sizes */}
                    {isExpanded && (
                      <div className="border-t bg-muted/20 p-4">
                        <div className="flex items-center justify-between mb-3">
                          <h3 className="text-xs font-medium text-muted-foreground">Account Sizes</h3>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-[10px] h-7"
                            onClick={() => {
                              setAddingSizeTo(t.id);
                              setNewSize({ label: "", size: 0, price: t.price, sortOrder: sizes.length });
                            }}
                          >
                            <Plus className="h-3 w-3 mr-1" /> Add Size
                          </Button>
                        </div>

                        {sizes.length === 0 ? (
                          <p className="text-xs text-muted-foreground text-center py-4">No sizes configured</p>
                        ) : (
                          <div className="space-y-1">
                            {sizes.map((s) => (
                              <div key={s.id} className="flex items-center justify-between p-2 rounded bg-background">
                                <div className="flex items-center gap-3 text-xs">
                                  <span className="font-medium w-16">{s.label}</span>
                                  <span className="text-muted-foreground">${s.size.toLocaleString()}</span>
                                  <span className="font-medium">{formatNgn(s.price)}</span>
                                </div>
                                <div className="flex items-center gap-1">
                                  <Link
                                    to={`/admin/audit-logs?entity=account_size&entityId=${s.id}`}
                                    className="inline-flex items-center justify-center h-6 w-6 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
                                    title={`View the audit trail for size ${s.label}`}
                                    aria-label={`View audit trail for size ${s.id}`}
                                  >
                                    <History className="h-3 w-3" />
                                  </Link>
                                  <Button
                                    variant="ghost"
                                    size="icon-sm"
                                    className="h-6 w-6"
                                    onClick={() => setEditingSize(s)}
                                  >
                                    <Edit2 className="h-3 w-3" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon-sm"
                                    className="h-6 w-6"
                                    onClick={() =>
                                      setDeleteTarget({ type: "size", id: s.id, label: `${s.label} (${formatNgn(s.price)})` })
                                    }
                                  >
                                    <Trash2 className="h-3 w-3 text-destructive" />
                                  </Button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Quick details */}
                        <div className="mt-3 grid grid-cols-3 gap-2 text-[10px] text-muted-foreground">
                          <div>
                            Profit Target: <span className="text-foreground">{t.profitTarget}%</span>
                          </div>
                          <div>
                            Daily DD: <span className="text-foreground">{t.dailyDrawdown}%</span>
                          </div>
                          <div>
                            Max DD: <span className="text-foreground">{t.maxDrawdown}%</span>
                          </div>
                          <div>
                            Leverage: <span className="text-foreground">1:{t.maxLeverage}</span>
                          </div>
                          <div>
                            Min Days: <span className="text-foreground">{t.minTradingDays}</span>
                          </div>
                          <div>
                            Duration: <span className="text-foreground">{t.durationDays}d</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Challenges Tab */}
      {tab === "challenges" && (
        <div className="space-y-3">
          {(allChallenges || []).length === 0 ? (
            <div className="card-subtle p-8 text-center text-sm text-muted-foreground">
              No challenges purchased yet
            </div>
          ) : (
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left p-3 font-medium text-muted-foreground">{challengeSortHeader("id", "ID")}</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">User</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">{challengeSortHeader("accountSize", "Account Size")}</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">{challengeSortHeader("amountPaid", "Amount Paid")}</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">{challengeSortHeader("status", "Status")}</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">Rules</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">{challengeSortHeader("createdAt", "Created")}</th>
                  </tr>
                </thead>
                <tbody>
                  {(allChallenges || []).map((ch: any) => {
                    const isChallengeExpanded = expandedChallenge === ch.id;
                    const tr = ch.templateRules;
                    return (
                      <Fragment key={ch.id}>
                        <tr
                          onClick={() => toggleChallengeExpand(ch.id)}
                          aria-expanded={isChallengeExpanded}
                          className={`border-b last:border-b-0 cursor-pointer transition-colors ${
                            isChallengeExpanded ? "bg-muted/40" : "hover:bg-muted/30"
                          }`}
                        >
                          <td className="p-3 font-medium">
                            <span className="inline-flex items-center gap-1">
                              <ChevronRight
                                className={`h-3 w-3 text-muted-foreground transition-transform duration-200 ${
                                  isChallengeExpanded ? "rotate-90" : ""
                                }`}
                              />
                              #{ch.id}
                            </span>
                          </td>
                          <td className="p-3">User {ch.userId}</td>
                          <td className="p-3">${(ch.accountSize || 0).toLocaleString()}</td>
                          <td className="p-3">{formatNgn(ch.amountPaid || 0)}</td>
                          <td className="p-3">
                            <Badge
                              variant={
                                ch.status === "active"
                                  ? "default"
                                  : ch.status === "funded"
                                  ? "default"
                                  : ch.status === "violated"
                                  ? "destructive"
                                  : "secondary"
                              }
                              className="text-[10px]"
                            >
                              {ch.status}
                            </Badge>
                          </td>
                          <td className="p-3">
                            <Badge
                              className={
                                ch.templateRules?.allowNewsTrading !== false
                                  ? "text-[10px] bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                                  : "text-[10px] bg-amber-500/10 text-amber-600 border-amber-500/20"
                              }
                              title={
                                ch.templateRules?.allowNewsTrading !== false
                                  ? "News trading allowed"
                                  : "News trading disabled — blocked around high-impact events per the template blackout window"
                              }
                            >
                              {newsRulesLabel(ch.templateRules)}
                            </Badge>
                          </td>
                          <td className="p-3 text-muted-foreground">
                            {ch.createdAt ? new Date(ch.createdAt).toLocaleDateString() : "—"}
                          </td>
                        </tr>
                        {isChallengeExpanded && (
                          <tr className="border-b last:border-b-0 bg-muted/20">
                            <td colSpan={7} className="p-4">
                              <div className="flex items-center justify-between mb-3">
                                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                                  Trading Rules{ch.templateName ? ` · ${ch.templateName}` : ""}
                                </span>
                                {ch.templateName && (
                                  <span className="text-[10px] text-muted-foreground">Template #{ch.templateId}</span>
                                )}
                              </div>
                              {tr ? (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-12 gap-y-2.5 max-w-xl">
                                  {ruleRow(
                                    "Weekend Holding",
                                    tr.allowWeekendHolding !== false,
                                    ruleRowValue(tr, "allowWeekendHolding"),
                                    "When restricted, any trade opened or closed on Saturday or Sunday is flagged as a rule violation."
                                  )}
                                  {ruleRow(
                                    "News Trading",
                                    tr.allowNewsTrading !== false,
                                    ruleRowValue(tr, "news"),
                                    "When restricted, trades opened inside the blackout window around a high-impact news release are flagged. The window is template-configured (15 min each side by default)."
                                  )}
                                  {ruleRow(
                                    "Expert Advisors",
                                    tr.allowEATrading !== false,
                                    ruleRowValue(tr, "allowEATrading"),
                                    "When restricted, automated strategies are flagged using heuristics — high trade frequency, robotic spacing, and night trading."
                                  )}
                                  {ruleRow(
                                    "Copy Trading",
                                    tr.allowCopyTrading !== false,
                                    ruleRowValue(tr, "allowCopyTrading"),
                                    "When restricted, trades matching another account's trade signatures within a short window are flagged."
                                  )}
                                </div>
                              ) : (
                                <p className="text-xs text-muted-foreground">
                                  Template rules unavailable for this challenge.
                                </p>
                              )}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Create Template Dialog */}
      {showCreateTemplate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowCreateTemplate(false)}>
          <div className="bg-background border rounded-lg shadow-lg w-full max-w-lg mx-4 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="text-sm font-medium">Create New Template</h2>
              <button onClick={() => setShowCreateTemplate(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-4 space-y-3">
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Name *</label>
                <Input value={newTemplate.name} onChange={(e) => setNewTemplate({ ...newTemplate, name: e.target.value })} className="text-xs h-8" placeholder="e.g. Pro Trader Challenge" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Description</label>
                <Input value={newTemplate.description} onChange={(e) => setNewTemplate({ ...newTemplate, description: e.target.value })} className="text-xs h-8" placeholder="Brief description of the challenge" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Type *</label>
                  <select value={newTemplate.type} onChange={(e) => setNewTemplate({ ...newTemplate, type: e.target.value })} className="w-full h-8 rounded-md border border-input bg-background px-2 text-xs">
                    {TEMPLATE_TYPES.map((tp) => (
                      <option key={tp.value} value={tp.value}>{tp.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Base Price (₦) *</label>
                  <Input type="number" value={newTemplate.price} onChange={(e) => setNewTemplate({ ...newTemplate, price: Number(e.target.value) })} className="text-xs h-8" />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Profit Target %</label>
                  <Input type="number" value={newTemplate.profitTarget} onChange={(e) => setNewTemplate({ ...newTemplate, profitTarget: Number(e.target.value) })} className="text-xs h-8" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Daily DD %</label>
                  <Input type="number" value={newTemplate.dailyDrawdown} onChange={(e) => setNewTemplate({ ...newTemplate, dailyDrawdown: Number(e.target.value) })} className="text-xs h-8" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Max DD %</label>
                  <Input type="number" value={newTemplate.maxDrawdown} onChange={(e) => setNewTemplate({ ...newTemplate, maxDrawdown: Number(e.target.value) })} className="text-xs h-8" />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Max Leverage</label>
                  <Input type="number" value={newTemplate.maxLeverage} onChange={(e) => setNewTemplate({ ...newTemplate, maxLeverage: Number(e.target.value) })} className="text-xs h-8" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Min Trading Days</label>
                  <Input type="number" value={newTemplate.minTradingDays} onChange={(e) => setNewTemplate({ ...newTemplate, minTradingDays: Number(e.target.value) })} className="text-xs h-8" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Duration (days)</label>
                  <Input type="number" value={newTemplate.durationDays} onChange={(e) => setNewTemplate({ ...newTemplate, durationDays: Number(e.target.value) })} className="text-xs h-8" />
                </div>
              </div>
              <div className="flex gap-4 text-xs">
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input type="checkbox" checked={newTemplate.allowWeekendHolding} onChange={(e) => setNewTemplate({ ...newTemplate, allowWeekendHolding: e.target.checked })} className="rounded" />
                  Weekend Holding
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input type="checkbox" checked={newTemplate.allowNewsTrading} onChange={(e) => setNewTemplate({ ...newTemplate, allowNewsTrading: e.target.checked })} className="rounded" />
                  News Trading
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input type="checkbox" checked={newTemplate.allowEATrading} onChange={(e) => setNewTemplate({ ...newTemplate, allowEATrading: e.target.checked })} className="rounded" />
                  EA Trading
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input type="checkbox" checked={newTemplate.allowCopyTrading} onChange={(e) => setNewTemplate({ ...newTemplate, allowCopyTrading: e.target.checked })} className="rounded" />
                  Copy Trading
                </label>
              </div>
              {!newTemplate.allowNewsTrading && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">Blackout before news (min)</label>
                    <Input type="number" min={0} value={newTemplate.newsBlackoutBeforeMinutes ?? ""} onChange={(e) => setNewTemplate({ ...newTemplate, newsBlackoutBeforeMinutes: e.target.value === "" ? null : Number(e.target.value) })} className="text-xs h-8" />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">Blackout after news (min)</label>
                    <Input type="number" min={0} value={newTemplate.newsBlackoutAfterMinutes ?? ""} onChange={(e) => setNewTemplate({ ...newTemplate, newsBlackoutAfterMinutes: e.target.value === "" ? null : Number(e.target.value) })} className="text-xs h-8" />
                  </div>
                  <p className="col-span-2 text-[10px] text-muted-foreground">
                    No new positions within these windows around high-impact news events (from the News Calendar feed). Empty = 15 min each side.
                  </p>
                </div>
              )}
              <Button
                className="w-full text-xs"
                size="sm"
                disabled={!newTemplate.name}
                onClick={async () => {
                  try {
                    await createTemplate.mutateAsync(newTemplate);
                    toast.success("Template created");
                    setShowCreateTemplate(false);
                    setNewTemplate({
                      name: "", description: "", type: "two_step", profitTarget: 8, dailyDrawdown: 5,
                      maxDrawdown: 10, maxLeverage: 100, minTradingDays: 5, maxTradingDays: null,
                      price: 50000, currency: "NGN", durationDays: 30, resetFee: null,
                      allowWeekendHolding: false, allowNewsTrading: true, allowEATrading: true, allowCopyTrading: false,
                      newsBlackoutBeforeMinutes: 15, newsBlackoutAfterMinutes: 15,
                    });
                  } catch (err: any) {
                    toast.error(err?.message || "Failed to create template");
                  }
                }}
              >
                Create Template
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Template Dialog */}
      {editingTemplate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setEditingTemplate(null)}>
          <div className="bg-background border rounded-lg shadow-lg w-full max-w-lg mx-4 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="text-sm font-medium">Edit Template: {editingTemplate.name}</h2>
              <button onClick={() => setEditingTemplate(null)} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-4 space-y-3">
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Name</label>
                <Input value={editingTemplate.name} onChange={(e) => setEditingTemplate({ ...editingTemplate, name: e.target.value })} className="text-xs h-8" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Description</label>
                <Input value={editingTemplate.description || ""} onChange={(e) => setEditingTemplate({ ...editingTemplate, description: e.target.value })} className="text-xs h-8" />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Profit Target %</label>
                  <Input type="number" value={editingTemplate.profitTarget} onChange={(e) => setEditingTemplate({ ...editingTemplate, profitTarget: Number(e.target.value) })} className="text-xs h-8" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Daily DD %</label>
                  <Input type="number" value={editingTemplate.dailyDrawdown} onChange={(e) => setEditingTemplate({ ...editingTemplate, dailyDrawdown: Number(e.target.value) })} className="text-xs h-8" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Max DD %</label>
                  <Input type="number" value={editingTemplate.maxDrawdown} onChange={(e) => setEditingTemplate({ ...editingTemplate, maxDrawdown: Number(e.target.value) })} className="text-xs h-8" />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Base Price (₦)</label>
                  <Input type="number" value={editingTemplate.price} onChange={(e) => setEditingTemplate({ ...editingTemplate, price: Number(e.target.value) })} className="text-xs h-8" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Leverage</label>
                  <Input type="number" value={editingTemplate.maxLeverage} onChange={(e) => setEditingTemplate({ ...editingTemplate, maxLeverage: Number(e.target.value) })} className="text-xs h-8" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Duration (days)</label>
                  <Input type="number" value={editingTemplate.durationDays} onChange={(e) => setEditingTemplate({ ...editingTemplate, durationDays: Number(e.target.value) })} className="text-xs h-8" />
                </div>
              </div>
              <div className="flex gap-4 text-xs">
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input type="checkbox" checked={!!editingTemplate.allowWeekendHolding} onChange={(e) => setEditingTemplate({ ...editingTemplate, allowWeekendHolding: e.target.checked })} className="rounded" />
                  Weekend
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input type="checkbox" checked={!!editingTemplate.allowNewsTrading} onChange={(e) => setEditingTemplate({ ...editingTemplate, allowNewsTrading: e.target.checked })} className="rounded" />
                  News
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input type="checkbox" checked={!!editingTemplate.allowEATrading} onChange={(e) => setEditingTemplate({ ...editingTemplate, allowEATrading: e.target.checked })} className="rounded" />
                  EA
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input type="checkbox" checked={!!editingTemplate.allowCopyTrading} onChange={(e) => setEditingTemplate({ ...editingTemplate, allowCopyTrading: e.target.checked })} className="rounded" />
                  Copy
                </label>
              </div>
              {!editingTemplate.allowNewsTrading && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">Blackout before news (min)</label>
                    <Input type="number" min={0} value={editingTemplate.newsBlackoutBeforeMinutes ?? ""} onChange={(e) => setEditingTemplate({ ...editingTemplate, newsBlackoutBeforeMinutes: e.target.value === "" ? null : Number(e.target.value) })} className="text-xs h-8" />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">Blackout after news (min)</label>
                    <Input type="number" min={0} value={editingTemplate.newsBlackoutAfterMinutes ?? ""} onChange={(e) => setEditingTemplate({ ...editingTemplate, newsBlackoutAfterMinutes: e.target.value === "" ? null : Number(e.target.value) })} className="text-xs h-8" />
                  </div>
                  <p className="col-span-2 text-[10px] text-muted-foreground">
                    No new positions within these windows around high-impact news events. Empty = 15 min each side.
                  </p>
                </div>
              )}
              <Button
                className="w-full text-xs"
                size="sm"
                onClick={async () => {
                  try {
                    const { id: _id, ...templateData } = editingTemplate;
                    await apiPut(`/api/challenges/admin/templates/${_id}`, templateData);
                    toast.success("Template updated");
                    setEditingTemplate(null);
                  } catch (err: any) {
                    toast.error(err?.message || "Failed to update");
                  }
                }}
              >
                Save Changes
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Add Size Dialog */}
      {addingSizeTo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setAddingSizeTo(null)}>
          <div className="bg-background border rounded-lg shadow-lg w-full max-w-sm mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="text-sm font-medium">Add Account Size</h2>
              <button onClick={() => setAddingSizeTo(null)} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-4 space-y-3">
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Label *</label>
                <Input value={newSize.label} onChange={(e) => setNewSize({ ...newSize, label: e.target.value })} className="text-xs h-8" placeholder="e.g. $50,000" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Account Size ($)</label>
                  <Input type="number" value={newSize.size} onChange={(e) => setNewSize({ ...newSize, size: Number(e.target.value) })} className="text-xs h-8" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Price (₦)</label>
                  <Input type="number" value={newSize.price} onChange={(e) => setNewSize({ ...newSize, price: Number(e.target.value) })} className="text-xs h-8" />
                </div>
              </div>
              <Button
                className="w-full text-xs"
                size="sm"
                disabled={!newSize.label}
                onClick={async () => {
                  try {
                    await createSize.mutateAsync({ ...newSize, templateId: addingSizeTo, currency: "NGN" });
                    toast.success("Size added");
                    setAddingSizeTo(null);
                    loadSizes(addingSizeTo);
                  } catch (err: any) {
                    toast.error(err?.message || "Failed to add size");
                  }
                }}
              >
                Add Size
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Size Dialog */}
      {editingSize && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setEditingSize(null)}>
          <div className="bg-background border rounded-lg shadow-lg w-full max-w-sm mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="text-sm font-medium">Edit Size: {editingSize.label}</h2>
              <button onClick={() => setEditingSize(null)} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-4 space-y-3">
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Label</label>
                <Input value={editingSize.label} onChange={(e) => setEditingSize({ ...editingSize, label: e.target.value })} className="text-xs h-8" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Account Size ($)</label>
                  <Input type="number" value={editingSize.size} onChange={(e) => setEditingSize({ ...editingSize, size: Number(e.target.value) })} className="text-xs h-8" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Price (₦)</label>
                  <Input type="number" value={editingSize.price} onChange={(e) => setEditingSize({ ...editingSize, price: Number(e.target.value) })} className="text-xs h-8" />
                </div>
              </div>
              <Button
                className="w-full text-xs"
                size="sm"
                onClick={async () => {
                  try {
                    const { id: _sid, ...sizeData } = editingSize;
                    await apiPut(`/api/challenges/admin/sizes/${_sid}`, sizeData);
                    toast.success("Size updated");
                    setEditingSize(null);
                    loadSizes(editingSize.templateId);
                  } catch (err: any) {
                    toast.error(err?.message || "Failed to update");
                  }
                }}
              >
                Save Changes
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {deleteTarget?.type === "template" ? "Template" : "Size"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{deleteTarget?.label}</strong>?
              {deleteTarget?.type === "template" && " This will also delete all associated account sizes."}
              {" "}This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={async () => {
                if (!deleteTarget) return;
                try {
                  if (deleteTarget.type === "template") {
                    await apiDelete(`/api/challenges/admin/templates/${deleteTarget.id}`);
                  } else {
                    await apiDelete(`/api/challenges/admin/sizes/${deleteTarget.id}`);
                  }
                  toast.success("Deleted successfully");
                  setDeleteTarget(null);
                } catch (err: any) {
                  toast.error(err?.message || "Failed to delete");
                }
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
