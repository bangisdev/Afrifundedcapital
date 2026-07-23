/* eslint-disable @typescript-eslint/no-explicit-any */
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import {
  Loader2, Plus, Eye, LayoutTemplate, ChevronDown, ChevronRight,
  Users, Settings, DollarSign, BarChart3, Save, X, Check,
} from "lucide-react";
import { toast } from "sonner";

// ═══════════════════════════════════════════════
//  STATUS BADGE HELPER
// ═══════════════════════════════════════════════

const statusBadge = (status: string) => {
  const variants: Record<string, string> = {
    active: "bg-foreground text-background",
    pending: "bg-secondary text-secondary-foreground",
    phase_1_passed: "bg-foreground text-background",
    phase_2_passed: "bg-foreground text-background",
    funded: "bg-foreground text-background",
    violated: "bg-destructive/10 text-destructive",
    expired: "bg-secondary text-secondary-foreground",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded ${variants[status] || "bg-secondary text-secondary-foreground"}`}>
      {status.replace(/_/g, " ")}
    </span>
  );
};

// ═══════════════════════════════════════════════
//  MAIN PAGE
// ═══════════════════════════════════════════════

export default function AdminChallenges() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-medium tracking-tight">Challenges</h1>
        <p className="text-xs text-muted-foreground mt-1">
          Manage user challenges and challenge templates
        </p>
      </div>

      <Tabs defaultValue="user-challenges" className="space-y-6">
        <TabsList className="border border-border bg-transparent p-0.5">
          <TabsTrigger value="user-challenges" className="text-xs data-[state=active]:bg-secondary">
            <Users className="h-3.5 w-3.5 mr-1.5" />
            User Challenges
          </TabsTrigger>
          <TabsTrigger value="templates" className="text-xs data-[state=active]:bg-secondary">
            <LayoutTemplate className="h-3.5 w-3.5 mr-1.5" />
            Templates
          </TabsTrigger>
        </TabsList>

        <TabsContent value="user-challenges">
          <UserChallengesTab />
        </TabsContent>

        <TabsContent value="templates">
          <TemplatesTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ═══════════════════════════════════════════════
//  USER CHALLENGES TAB (existing content)
// ═══════════════════════════════════════════════

function UserChallengesTab() {
  const challenges = useQuery(api.challenges.listAllChallenges, {});

  if (!challenges) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (challenges.length === 0) {
    return (
      <div className="card-subtle p-8 text-center">
        <p className="text-xs text-muted-foreground">No challenges yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {challenges.map((ch) => (
        <div key={ch._id} className="card-subtle p-4 flex items-center justify-between">
          <div>
            <div className="text-sm font-medium">
              {ch.userName || ch.userEmail || "Unknown"} — ${ch.accountSize?.toLocaleString()}
            </div>
            <div className="flex items-center gap-2 mt-1">
              {statusBadge(ch.status)}
              <span className="text-xs text-muted-foreground">{ch.templateName || "Challenge"}</span>
              <span className="text-xs text-muted-foreground">
                {new Date(ch.createdAt).toLocaleDateString()}
              </span>
            </div>
          </div>
          <div className="text-xs text-muted-foreground">
            ₦{ch.amountPaid?.toLocaleString() || 0}
          </div>
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════
//  TEMPLATES TAB
// ═══════════════════════════════════════════════

function TemplatesTab() {
  const templates = useQuery(api.challenges.listChallengeTemplates, { includeInactive: true });

  if (!templates) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (templates.length === 0) {
    return (
      <div className="card-subtle p-8 text-center">
        <p className="text-xs text-muted-foreground">
          No templates yet. Go to Settings and click "Seed Now" to create default templates.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {templates.map((template) => (
        <TemplateCard key={template._id} template={template} />
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════
//  TEMPLATE CARD
// ═══════════════════════════════════════════════

function TemplateCard({ template }: { template: any }) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);

  const accountSizes = useQuery(api.challenges.getAccountSizesForTemplate, {
    templateId: template._id,
  });
  const updateTemplate = useMutation(api.challenges.updateChallengeTemplate);
  const createAccountSize = useMutation(api.challenges.createAccountSize);
  const updateAccountSize = useMutation(api.challenges.updateAccountSize);

  // Edit form state
  const [editForm, setEditForm] = useState({
    name: template.name,
    description: template.description || "",
    profitTarget: template.profitTarget,
    dailyDrawdown: template.dailyDrawdown,
    maxDrawdown: template.maxDrawdown,
    minTradingDays: template.minTradingDays,
  });
  const [saving, setSaving] = useState(false);

  // New account size form state
  const [showNewSize, setShowNewSize] = useState(false);
  const [newSize, setNewSize] = useState({ label: "", size: 0, price: 0 });

  const handleSaveTemplate = async () => {
    setSaving(true);
    try {
      await updateTemplate({
        templateId: template._id,
        name: editForm.name,
        description: editForm.description,
        profitTarget: Number(editForm.profitTarget),
        dailyDrawdown: Number(editForm.dailyDrawdown),
        maxDrawdown: Number(editForm.maxDrawdown),
        minTradingDays: Number(editForm.minTradingDays),
      });
      toast.success("Template updated");
      setEditing(false);
    } catch (error: any) {
      toast.error(error.message || "Failed to update template");
    }
    setSaving(false);
  };

  const handleCreateSize = async () => {
    if (!newSize.label || newSize.size <= 0 || newSize.price <= 0) {
      toast.error("Please fill in all fields");
      return;
    }
    try {
      await createAccountSize({
        templateId: template._id,
        label: newSize.label,
        size: newSize.size,
        price: newSize.price,
        sortOrder: (accountSizes?.length ?? 0),
      });
      toast.success("Account size added");
      setShowNewSize(false);
      setNewSize({ label: "", size: 0, price: 0 });
    } catch (error: any) {
      toast.error(error.message || "Failed to create account size");
    }
  };

  const handleToggleSizeActive = async (sizeId: any, currentActive: boolean) => {
    try {
      await updateAccountSize({
        sizeId,
        isActive: !currentActive,
      });
      toast.success(`Account size ${currentActive ? "deactivated" : "activated"}`);
    } catch (error: any) {
      toast.error(error.message || "Failed to update account size");
    }
  };

  const typeLabel = template.type.replace(/_/g, " ");
  const sizeCount = accountSizes?.length ?? 0;
  const activeSizes = accountSizes?.filter((s) => s.isActive).length ?? 0;

  return (
    <div className="card-subtle">
      {/* Header */}
      <div className="p-4 flex items-center justify-between">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <button
            onClick={() => setExpanded(!expanded)}
            className="h-6 w-6 shrink-0 flex items-center justify-center rounded hover:bg-secondary transition-colors"
          >
            {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          </button>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">{template.name}</span>
              {!template.isActive && (
                <Badge variant="outline" className="text-[10px] h-4 px-1.5">Inactive</Badge>
              )}
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{typeLabel}</span>
              <span className="text-[10px] text-muted-foreground">·</span>
              <span className="text-xs text-muted-foreground">
                {template.profitTarget}% target · {template.dailyDrawdown}% daily / {template.maxDrawdown}% max DD
              </span>
              <span className="text-[10px] text-muted-foreground">·</span>
              <span className="text-xs text-muted-foreground">{sizeCount} sizes ({activeSizes} active)</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0 ml-4">
          {editing ? (
            <>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditing(false)} disabled={saving}>
                <X className="h-3.5 w-3.5" />
              </Button>
              <Button variant="default" size="icon" className="h-7 w-7" onClick={handleSaveTemplate} disabled={saving}>
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              </Button>
            </>
          ) : (
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setEditing(true)}>
              <Settings className="h-3 w-3 mr-1" />
              Edit
            </Button>
          )}
        </div>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="border-t border-border">
          {editing ? (
            <div className="p-4 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Name</label>
                  <Input
                    className="text-xs h-8"
                    value={editForm.name}
                    onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Description</label>
                  <Input
                    className="text-xs h-8"
                    value={editForm.description}
                    onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Profit Target %</label>
                  <Input
                    className="text-xs h-8"
                    type="number"
                    value={editForm.profitTarget}
                    onChange={(e) => setEditForm({ ...editForm, profitTarget: Number(e.target.value) })}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Daily Drawdown %</label>
                  <Input
                    className="text-xs h-8"
                    type="number"
                    value={editForm.dailyDrawdown}
                    onChange={(e) => setEditForm({ ...editForm, dailyDrawdown: Number(e.target.value) })}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Max Drawdown %</label>
                  <Input
                    className="text-xs h-8"
                    type="number"
                    value={editForm.maxDrawdown}
                    onChange={(e) => setEditForm({ ...editForm, maxDrawdown: Number(e.target.value) })}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Min Trading Days</label>
                  <Input
                    className="text-xs h-8"
                    type="number"
                    value={editForm.minTradingDays}
                    onChange={(e) => setEditForm({ ...editForm, minTradingDays: Number(e.target.value) })}
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className="p-4 grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Profit Target</div>
                <div className="font-medium">{template.profitTarget}%</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Daily Drawdown</div>
                <div className="font-medium">{template.dailyDrawdown}%</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Max Drawdown</div>
                <div className="font-medium">{template.maxDrawdown}%</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Min Days</div>
                <div className="font-medium">{template.minTradingDays}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Leverage</div>
                <div className="font-medium">1:{template.maxLeverage}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Duration</div>
                <div className="font-medium">{template.durationDays > 0 ? `${template.durationDays} days` : "Unlimited"}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Weekend Holding</div>
                <div className="font-medium">{template.allowWeekendHolding ? "Yes" : "No"}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">EA Trading</div>
                <div className="font-medium">{template.allowEATrading ? "Allowed" : "Not allowed"}</div>
              </div>
            </div>
          )}

          {/* Account sizes */}
          <div className="border-t border-border">
            <div className="px-4 py-3 flex items-center justify-between">
              <span className="text-xs font-medium">Account Sizes</span>
              <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => setShowNewSize(!showNewSize)}>
                <Plus className="h-3 w-3 mr-1" />
                Add Size
              </Button>
            </div>

            {showNewSize && (
              <div className="px-4 pb-3">
                <div className="flex items-center gap-2 p-3 rounded-md border border-border bg-secondary/20">
                  <Input
                    className="text-xs h-8 w-28"
                    placeholder="Label (e.g. $50K)"
                    value={newSize.label}
                    onChange={(e) => setNewSize({ ...newSize, label: e.target.value })}
                  />
                  <Input
                    className="text-xs h-8 w-24"
                    type="number"
                    placeholder="Size ($)"
                    value={newSize.size || ""}
                    onChange={(e) => setNewSize({ ...newSize, size: Number(e.target.value) })}
                  />
                  <Input
                    className="text-xs h-8 w-24"
                    type="number"
                    placeholder="Price ($)"
                    value={newSize.price || ""}
                    onChange={(e) => setNewSize({ ...newSize, price: Number(e.target.value) })}
                  />
                  <Button variant="default" size="sm" className="h-8 text-xs" onClick={handleCreateSize}>
                    <Check className="h-3 w-3 mr-1" />
                    Add
                  </Button>
                  <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => setShowNewSize(false)}>
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            )}

            {!accountSizes ? (
              <div className="px-4 pb-4 flex justify-center">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            ) : accountSizes.length === 0 ? (
              <div className="px-4 pb-4 text-xs text-muted-foreground text-center">
                No account sizes configured
              </div>
            ) : (
              <div className="px-4 pb-4 space-y-1">
                {accountSizes
                  .sort((a, b) => a.sortOrder - b.sortOrder)
                  .map((size) => (
                    <div key={size._id} className="flex items-center justify-between py-1.5 px-2 rounded-md hover:bg-secondary/20 text-xs">
                      <div className="flex items-center gap-3">
                        <span className={`font-medium ${!size.isActive ? "text-muted-foreground line-through" : ""}`}>
                          {size.label}
                        </span>
                        <span className="text-muted-foreground">
                          ${size.size.toLocaleString()}
                        </span>
                        <span className="text-muted-foreground">
                          @ ${size.price}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        {!size.isActive && (
                          <Badge variant="outline" className="text-[10px] h-4 px-1">Inactive</Badge>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          className={`h-6 text-[10px] px-2 ${size.isActive ? "text-muted-foreground" : "text-foreground"}`}
                          onClick={() => handleToggleSizeActive(size._id, size.isActive)}
                        >
                          {size.isActive ? "Deactivate" : "Activate"}
                        </Button>
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
