/* eslint-disable @typescript-eslint/no-explicit-any */
import { useApiQuery, useApiMutation } from "@/hooks/use-api";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";

export default function NotificationPreferences() {
  const { data: user } = useApiQuery<any>(["users", "current"], "/api/users/current");
  const updatePrefs = useApiMutation<any, any>("put", "/api/users/preferences");
  const [emailEnabled, setEmailEnabled] = useState(user?.emailNotifications ?? true);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await updatePrefs.mutateAsync({ emailNotifications: emailEnabled });
      toast.success("Preferences saved");
    } catch (e: any) { toast.error(e.message); }
    setSaving(false);
  };

  return (
    <div className="space-y-8">
      <div><h1 className="text-lg font-medium tracking-tight">Notification Preferences</h1><p className="text-xs text-muted-foreground mt-1">Control how you receive notifications</p></div>
      <div className="card-subtle p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div><div className="text-sm font-medium">Email Notifications</div><div className="text-xs text-muted-foreground">Receive notifications via email</div></div>
          <button onClick={() => setEmailEnabled(!emailEnabled)} className={`h-6 w-11 rounded-full transition-colors ${emailEnabled ? "bg-foreground" : "bg-secondary"}`}>
            <div className={`h-4 w-4 rounded-full bg-background transition-transform ${emailEnabled ? "translate-x-6" : "translate-x-1"}`} />
          </button>
        </div>
      </div>
      <Button size="sm" className="text-xs" onClick={handleSave} disabled={saving}>{saving ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Save className="h-3 w-3 mr-1" />} Save Preferences</Button>
    </div>
  );
}
