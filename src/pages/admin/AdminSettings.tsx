import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Loader2, Settings as SettingsIcon, Save } from "lucide-react";
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
    </div>
  );
}
