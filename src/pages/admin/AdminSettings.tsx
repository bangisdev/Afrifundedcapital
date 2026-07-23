/* eslint-disable @typescript-eslint/no-explicit-any */
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Loader2, Settings as SettingsIcon, Save, Database, CheckCircle } from "lucide-react";
import { toast } from "sonner";

export default function AdminSettings() {
  const settings = useQuery(api.seed.listSettings, {});
  const updateSetting = useMutation(api.seed.updateSetting);
  const [saving, setSaving] = useState(false);

  if (!settings) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const groupedSettings = settings.reduce((acc: Record<string, any[]>, s) => {
    if (!acc[s.group]) acc[s.group] = [];
    acc[s.group].push(s);
    return acc;
  }, {});

  const handleSave = async (key: string, value: string) => {
    setSaving(true);
    try {
      await updateSetting({ key, value: isNaN(Number(value)) ? value : Number(value) });
      toast.success("Setting updated");
    } catch (error: any) {
      toast.error(error.message);
    }
    setSaving(false);
  };

  const [editValues, setEditValues] = useState<Record<string, string>>({});

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-medium tracking-tight">Settings</h1>
        <p className="text-xs text-muted-foreground mt-1">
          Configure platform settings and preferences
        </p>
      </div>

      <Tabs defaultValue="general" className="space-y-6">
        <TabsList className="border border-border bg-transparent p-0.5 flex-wrap">
          {Object.keys(groupedSettings).map((group) => (
            <TabsTrigger key={group} value={group} className="text-xs data-[state=active]:bg-secondary capitalize">
              {group}
            </TabsTrigger>
          ))}
        </TabsList>

        {Object.entries(groupedSettings).map(([group, groupSettings]) => (
          <TabsContent key={group} value={group} className="space-y-2">
            {groupSettings.map((s) => (
              <div key={s._id} className="card-subtle p-4 flex items-center justify-between">
                <div className="flex-1">
                  <div className="text-sm font-medium">
                    {s.key.replace(/_/g, " ").replace(/\b\w/g, (l: string) => l.toUpperCase())}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {s.description || ""}
                  </div>
                </div>
                <div className="flex items-center gap-2 ml-4">
                  <Input
                    className="text-xs h-8 w-32 text-right font-mono"
                    value={editValues[s._id] !== undefined ? editValues[s._id] : String(s.value ?? "")}
                    onChange={(e) => setEditValues({ ...editValues, [s._id]: e.target.value })}
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8 shrink-0"
                    onClick={() => handleSave(s.key, editValues[s._id] !== undefined ? editValues[s._id] : String(s.value ?? ""))}
                  >
                    <Save className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            ))}
          </TabsContent>
        ))}
      </Tabs>

      <Separator />

      {/* ── Seed Data ── */}
      <div>
        <h2 className="text-sm font-medium mb-2">Seed Data</h2>
        <p className="text-xs text-muted-foreground mb-4">
          Populate the database with default challenge templates (One Step, Two Step, Instant Funding)
          with 6 account sizes each ($5K to $200K), default roles, and platform settings.
          This only runs if no templates exist yet.
        </p>
        <SeedDataButton />
      </div>
    </div>
  );
}

function SeedDataButton() {
  const seed = useAction(api.seed.seed);
  const templates = useQuery(api.challenges.listChallengeTemplates, {});
  const [seeding, setSeeding] = useState(false);

  const seededCount = templates?.length ?? 0;

  const handleSeed = async () => {
    setSeeding(true);
    try {
      await seed();
      toast.success("Database seeded successfully!");
    } catch (error: any) {
      toast.error(error.message || "Failed to seed database");
    }
    setSeeding(false);
  };

  return (
    <div className="card-subtle p-4 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <Database className="h-4 w-4 text-muted-foreground" />
        <div>
          <div className="text-sm font-medium">
            {seededCount > 0
              ? `${seededCount} template${seededCount !== 1 ? "s" : ""} already seeded`
              : "No templates yet"}
          </div>
          {seededCount > 0 && (
            <div className="flex items-center gap-1 mt-0.5">
              <CheckCircle className="h-3 w-3 text-emerald-500" />
              <span className="text-xs text-emerald-500">Challenge data is ready</span>
            </div>
          )}
        </div>
      </div>
      <Button
        variant={seededCount > 0 ? "outline" : "default"}
        size="sm"
        onClick={handleSeed}
        disabled={seeding}
      >
        {seeding ? (
          <>
            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
            Seeding…
          </>
        ) : seededCount > 0 ? (
          "Re-seed"
        ) : (
          "Seed Now"
        )}
      </Button>
    </div>
  );
}
