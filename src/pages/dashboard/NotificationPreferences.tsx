/* eslint-disable @typescript-eslint/no-explicit-any */
import { useApiQuery, useApiMutation } from "@/hooks/use-api";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { PageLoader } from "@/components/dashboard/PageLoader";
import { Save, Bell, Mail, MessageCircle } from "lucide-react";
import { toast } from "sonner";

export default function NotificationPreferences() {
  const { data: user, isLoading } = useApiQuery<any>(["users", "current"], "/api/users/current");
  const updatePrefs = useApiMutation<any, any>("put", "/api/users/preferences");
  const [emailEnabled, setEmailEnabled] = useState(true);
  const [inAppEnabled, setInAppEnabled] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (user) {
      setEmailEnabled(user.emailNotifications ?? true);
      setInAppEnabled(user.inAppNotifications ?? true);
    }
  }, [user]);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      await updatePrefs.mutateAsync({
        emailNotifications: emailEnabled,
        inAppNotifications: inAppEnabled,
      });
      toast.success("Preferences saved");
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e: any) {
      toast.error(e.message);
    }
    setSaving(false);
  };

  if (isLoading) {
    return <PageLoader rows={4} />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Account"
        title="Notification Preferences"
        subtitle="Control how and when you receive notifications"
      />

      {/* Email Notifications */}
      <div className="card-subtle divide-y divide-border">
        <div className="p-5 flex items-start gap-4">
          <div className="h-9 w-9 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0 mt-0.5">
            <Mail className="h-4 w-4 text-blue-600" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium">Email Notifications</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  Receive challenge updates, payment confirmations, and account alerts via email
                </div>
              </div>
              <Switch checked={emailEnabled} onCheckedChange={setEmailEnabled} />
            </div>
          </div>
        </div>

        {/* In-App Notifications */}
        <div className="p-5 flex items-start gap-4">
          <div className="h-9 w-9 rounded-lg bg-purple-500/10 flex items-center justify-center shrink-0 mt-0.5">
            <Bell className="h-4 w-4 text-purple-600" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium">In-App Notifications</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  Show real-time notifications in your dashboard sidebar and header
                </div>
              </div>
              <Switch checked={inAppEnabled} onCheckedChange={setInAppEnabled} />
            </div>
          </div>
        </div>

        {/* Info Note */}
        <div className="p-5 flex items-start gap-4">
          <div className="h-9 w-9 rounded-lg bg-secondary flex items-center justify-center shrink-0 mt-0.5">
            <MessageCircle className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="flex-1">
            <div className="text-sm font-medium">Support Replies</div>
            <div className="text-xs text-muted-foreground mt-0.5">
              You'll always receive email notifications when support agents reply to your tickets, regardless of these settings.
            </div>
          </div>
        </div>
      </div>

      <Button
        size="sm"
        className="text-xs h-9 gap-2"
        onClick={handleSave}
        disabled={saving}
      >
        {saving ? (
          <>Saving...</>
        ) : saved ? (
          <>
            <span className="text-green-600">✓</span> Saved
          </>
        ) : (
          <>
            <Save className="h-3.5 w-3.5" /> Save Preferences
          </>
        )}
      </Button>
    </div>
  );
}
