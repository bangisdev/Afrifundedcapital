/* eslint-disable @typescript-eslint/no-explicit-any */
import { useApiQuery, useApiMutation } from "@/hooks/use-api";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Save, Database } from "lucide-react";
import { toast } from "sonner";

export default function AdminSettings() {
  const { data: settings, isLoading, refetch } = useApiQuery<any[]>(["admin", "settings"], "/api/seed/settings");
  const updateSetting = useApiMutation<any, any>("put", "/api/seed/settings/${key}");
  const seedData = useApiMutation<any, any>("post", "/api/seed/seed");
  const [seeding, setSeeding] = useState(false);

  const handleSeed = async () => {
    setSeeding(true);
    try {
      await seedData.mutateAsync({});
      toast.success("Seed data created successfully");
      refetch();
    } catch (e: any) { toast.error(e.message); }
    setSeeding(false);
  };

  if (isLoading) return <div className="flex items-center justify-center h-64"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div><h1 className="text-lg font-medium tracking-tight">Settings</h1><p className="text-xs text-muted-foreground mt-1">Platform configuration</p></div>
        <Button size="sm" className="text-xs" onClick={handleSeed} disabled={seeding}>
          {seeding ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Database className="h-3 w-3 mr-1" />} Seed Data
        </Button>
      </div>
      <div className="space-y-1">
        {(!settings || settings.length === 0) ? (
          <div className="card-subtle p-8 text-center"><p className="text-xs text-muted-foreground">No settings configured yet. Click "Seed Data" to initialize.</p></div>
        ) : settings.map((s: any) => (
          <div key={s.id} className="card-subtle p-4 flex items-center justify-between">
            <div><div className="text-sm font-medium">{s.key}</div><div className="text-xs text-muted-foreground">{s.group}</div></div>
            <div className="text-xs text-muted-foreground font-mono max-w-[200px] truncate">{typeof s.value === "string" ? s.value : JSON.stringify(s.value)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
