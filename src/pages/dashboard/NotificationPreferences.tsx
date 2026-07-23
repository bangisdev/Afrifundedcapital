import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Loader2, Bell, Mail, ArrowLeft, Save } from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "react-router";

interface PreferenceGroup {
  key: string;
  label: string;
  description: string;
  icon: React.ReactNode;
}

const PREFERENCE_GROUPS: PreferenceGroup[] = [
  {
    key: "email_payment",
    label: "Payments & Payouts",
    description: "Payment confirmations, refunds, and payout updates",
    icon: (
      <div className="h-8 w-8 rounded-full bg-green-500/10 flex items-center justify-center">
        <svg className="h-4 w-4 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </div>
    ),
  },
  {
    key: "email_kyc",
    label: "KYC Updates",
    description: "Identity verification status and document updates",
    icon: (
      <div className="h-8 w-8 rounded-full bg-emerald-500/10 flex items-center justify-center">
        <svg className="h-4 w-4 text-emerald-600 dark:text-emerald-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
        </svg>
      </div>
    ),
  },
  {
    key: "email_challenge",
    label: "Challenge Updates",
    description: "Challenge start, phase completions, violations, and funded status",
    icon: (
      <div className="h-8 w-8 rounded-full bg-amber-500/10 flex items-center justify-center">
        <svg className="h-4 w-4 text-amber-600 dark:text-amber-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
        </svg>
      </div>
    ),
  },
  {
    key: "email_referral",
    label: "Referrals & Commissions",
    description: "Referral signups, commission earnings, and payout notifications",
    icon: (
      <div className="h-8 w-8 rounded-full bg-purple-500/10 flex items-center justify-center">
        <svg className="h-4 w-4 text-purple-600 dark:text-purple-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
        </svg>
      </div>
    ),
  },
  {
    key: "email_support",
    label: "Support Replies",
    description: "Replies to your support tickets from our team",
    icon: (
      <div className="h-8 w-8 rounded-full bg-blue-500/10 flex items-center justify-center">
        <svg className="h-4 w-4 text-blue-600 dark:text-blue-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193-.34.027-.68.052-1.02.072v3.091l-3-3c-1.354 0-2.694-.055-4.02-.163a2.115 2.115 0 01-.825-.242m9.345-8.334a2.126 2.126 0 00-.476-.095 48.64 48.64 0 00-8.048 0c-1.131.094-1.976 1.057-1.976 2.192v4.286c0 .837.46 1.58 1.155 1.951m9.345-8.334V6.637c0-1.621-1.152-3.026-2.76-3.235A48.455 48.455 0 0011.25 3c-2.115 0-4.198.137-6.24.402-1.608.209-2.76 1.614-2.76 3.235v6.226c0 1.621 1.152 3.026 2.76 3.235.577.075 1.157.14 1.74.194V21l4.155-4.155" />
        </svg>
      </div>
    ),
  },
  {
    key: "marketing",
    label: "Marketing & Promotions",
    description: "Product updates, special offers, and promotional content",
    icon: (
      <div className="h-8 w-8 rounded-full bg-pink-500/10 flex items-center justify-center">
        <svg className="h-4 w-4 text-pink-600 dark:text-pink-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M10.34 15.84c-.688-.06-1.386-.09-2.09-.09H7.5a4.5 4.5 0 110-9h.75c.704 0 1.402-.03 2.09-.09m0 9.18c.253.962.584 1.892.985 2.783.247.55.06 1.21-.463 1.511l-.657.38a.502.502 0 01-.546 0l-.657-.38c-.522-.3-.71-.96-.462-1.511.4-.89.731-1.82.985-2.783m0-9.18A7.476 7.476 0 007.5 6.75H15a4.5 4.5 0 010 9h-.75c-.704 0-1.402-.03-2.09-.09" />
        </svg>
      </div>
    ),
  },
];

const DEFAULT_PREFERENCES: Record<string, boolean> = {
  email_payment: true,
  email_kyc: true,
  email_challenge: true,
  email_referral: true,
  email_support: true,
  marketing: true,
};

export default function NotificationPreferences() {
  const navigate = useNavigate();
  const user = useQuery(api.users.currentUser);
  const updatePreferences = useMutation(api.users.updatePreferences);
  const [preferences, setPreferences] = useState<Record<string, boolean>>(DEFAULT_PREFERENCES);
  const [emailEnabled, setEmailEnabled] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (user && !loaded) {
      setEmailEnabled(user.emailNotifications !== false);
      if (user.notificationPreferences) {
        setPreferences({ ...DEFAULT_PREFERENCES, ...user.notificationPreferences });
      }
      setLoaded(true);
    }
  }, [user, loaded]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await updatePreferences({
        emailNotifications: emailEnabled,
        notificationPreferences: preferences,
      });
      toast.success("Notification preferences saved");
    } catch (error: any) {
      toast.error(error.message);
    }
    setSaving(false);
  };

  const hasChanges = () => {
    if (!user) return true;
    if (user.emailNotifications !== emailEnabled && emailEnabled !== (user.emailNotifications !== false)) return true;
    const currentPrefs = user.notificationPreferences || {};
    return Object.keys(preferences).some((key) => preferences[key] !== currentPrefs[key]);
  };

  const enabledCount = Object.values(preferences).filter(Boolean).length;
  const totalCount = Object.keys(preferences).length;

  if (!user) {
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
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate("/dashboard/notifications")}
            className="h-7 w-7 rounded-md hover:bg-secondary flex items-center justify-center transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
          </button>
          <div>
            <h1 className="text-lg font-medium tracking-tight">Notification Preferences</h1>
            <p className="text-xs text-muted-foreground mt-1">
              Choose which notifications you'd like to receive via email
            </p>
          </div>
        </div>
        <Badge variant="outline" className="text-xs font-normal">
          {enabledCount} of {totalCount} enabled
        </Badge>
      </div>

      {/* Master toggle */}
      <div className="card-subtle p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-full bg-secondary flex items-center justify-center">
            <Mail className="h-4 w-4" />
          </div>
          <div>
            <div className="text-sm font-medium">Email Notifications</div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Master toggle for all email notifications
            </p>
          </div>
        </div>
        <Switch
          checked={emailEnabled}
          onCheckedChange={setEmailEnabled}
        />
      </div>

      {/* Individual preferences */}
      <div className="space-y-1">
        <div className="flex items-center gap-2 px-1 mb-2">
          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
            Notification Types
          </span>
          <Separator className="flex-1" />
        </div>

        {PREFERENCE_GROUPS.map((group) => (
          <div
            key={group.key}
            className={`card-subtle p-4 flex items-center justify-between transition-all ${
              !emailEnabled ? "opacity-50" : ""
            }`}
          >
            <div className="flex items-center gap-3">
              {group.icon}
              <div>
                <div className="text-sm font-medium">{group.label}</div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {group.description}
                </p>
              </div>
            </div>
            <Switch
              checked={preferences[group.key] !== false}
              onCheckedChange={(checked) =>
                setPreferences({ ...preferences, [group.key]: checked })
              }
              disabled={!emailEnabled}
            />
          </div>
        ))}
      </div>

      {/* Save */}
      <div className="flex items-center justify-end gap-2 pt-2">
        <Button
          variant="outline"
          size="sm"
          className="text-xs"
          onClick={() => {
            setEmailEnabled(user.emailNotifications !== false);
            setPreferences({ ...DEFAULT_PREFERENCES, ...(user.notificationPreferences || {}) });
          }}
        >
          Reset
        </Button>
        <Button
          size="sm"
          className="text-xs"
          onClick={handleSave}
          disabled={saving || !hasChanges()}
        >
          {saving ? (
            <>
              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save className="h-3 w-3 mr-1" />
              Save Preferences
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
