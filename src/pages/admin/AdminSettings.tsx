/* eslint-disable @typescript-eslint/no-explicit-any */
import { useApiQuery, useApiMutation } from "@/hooks/use-api";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { PageLoader } from "@/components/dashboard/PageLoader";
import { readResponseBody, errorMessageOf } from "@/lib/api";
import { formatRelativeTime } from "@/lib/utils";
import { useState, type ReactNode } from "react";
import { useResetOnChange } from "@/hooks/use-reset-on-change";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Loader2, Save, CreditCard, Shield, Webhook,
  CheckCircle, AlertTriangle, Copy, Database, Zap, Globe, Mail, Users, Settings2, History, ArrowUpRight,
  KeyRound, Trash2, Server, Activity, Lock
} from "lucide-react";
import { toast } from "sonner";
import { Link } from "react-router";

interface ProviderConfig {
  publicKey: string;
  webhookUrl?: string;
  isEnabled: boolean;
  mode?: "test" | "live";
}



/**
 * Pull the last-changed metadata (attached server-side from the audit trail)
 * for a given setting key. Returns null when the key is unknown or untouched.
 */
function getSettingMeta(settings: any[] | undefined, key: string): any | null {
  const s = settings?.find((x: any) => x.key === key);
  if (!s || !s.lastChangedAt) return null;
  return s;
}

/**
 * "Last changed by X · 3h ago" — hidden when the config was never changed.
 * Clickable: jumps to Admin → Audit Logs pre-filtered to this setting key so
 * reviewers can see the full change history of the config.
 */
function LastChanged({ meta, settingKey }: { meta: any | null; settingKey?: string }) {
  if (!meta) return null;
  const actor = meta.lastChangedBy
    ? meta.lastChangedBy
    : meta.lastChangedUserDeleted
      ? `Deleted user #${meta.lastChangedUserId ?? "?"}`
      : "Unknown admin";
  const key = settingKey || meta.entityId || "";
  return (
    <Link
      to={`/admin/audit-logs?entity=setting&entityId=${encodeURIComponent(key)}`}
      className="group flex items-center gap-1.5 text-[10px] text-muted-foreground shrink-0 hover:text-foreground transition-colors"
      title={`${meta.lastChangedByEmail ? `${meta.lastChangedByEmail} · ` : ""}${meta.lastChangedAction || "changed"} — click to view this config's history in Audit Logs`}
    >
      <History className="h-3 w-3 shrink-0" />
      <span>Last changed by <span className="font-medium text-foreground/80 group-hover:underline">{actor}</span></span>
      <span>·</span>
      <span>{formatRelativeTime(meta.lastChangedAt)}</span>
      <ArrowUpRight className="h-2.5 w-2.5 opacity-0 group-hover:opacity-100 transition-opacity" />
    </Link>
  );
}

/**
 * "View history" pill next to the attribution line — always visible so admins
 * can discover the audit trail for a config even before its first change.
 * Same deep link as LastChanged: Admin → Audit Logs scoped to this setting key.
 */
function ViewHistoryLink({ settingKey }: { settingKey: string }) {
  return (
    <Link
      to={`/admin/audit-logs?entity=setting&entityId=${encodeURIComponent(settingKey)}`}
      className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2 py-0.5 text-[10px] font-medium text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors shrink-0"
      title={`View all audit entries for ${settingKey}`}
    >
      <History className="h-3 w-3" />
      View history
    </Link>
  );
}

/**
 * Admin-editable gateway secret: status badge (source + masked value), a
 * password input to update the key, and a clear-override action when the
 * value currently comes from the database.
 *
 * Updates go to PUT /api/admin/secrets/:envVar — the value is stored encrypted
 * at rest (AES-256-GCM) and takes effect immediately for every consumer.
 * Clearing the override falls back to the environment variable, which stays
 * the deployment-level source of truth.
 */
function SecretKeyField({
  envVar,
  status,
  hint,
}: {
  envVar: string;
  status?: { configured: boolean; source: "env" | "db" | "none"; masked: string };
  hint?: ReactNode;
}) {
  const [value, setValue] = useState("");

  const updateSecret = useApiMutation<any, any>("put", `/api/admin/secrets/${envVar}`, {
    invalidateKeys: [
      ["admin", "secrets-status"],
      ["admin", "flutterwave-config"],
      ["admin", "resend-status"],
    ],
    onSuccess: () => {
      setValue("");
      toast.success(`${envVar} updated and stored securely`);
    },
  });
  const clearSecret = useApiMutation<any, any>("delete", `/api/admin/secrets/${envVar}`, {
    invalidateKeys: [
      ["admin", "secrets-status"],
      ["admin", "flutterwave-config"],
      ["admin", "resend-status"],
    ],
    onSuccess: () => {
      setValue("");
      toast.success(`${envVar} cleared — falling back to the environment variable`);
    },
  });

  const source = status?.source ?? "none";
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {source === "env" && (
          <Badge className="border-transparent bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            <CheckCircle className="h-3 w-3" />
            {envVar} · From env{status?.masked ? ` · ${status.masked}` : ""}
          </Badge>
        )}
        {source === "db" && (
          <Badge className="border-transparent bg-sky-500/10 text-sky-600 dark:text-sky-400">
            <KeyRound className="h-3 w-3" />
            {envVar} · From database{status?.masked ? ` · ${status.masked}` : ""}
          </Badge>
        )}
        {source === "none" && (
          <Badge
            variant="outline"
            className="border-amber-500/30 bg-amber-500/5 text-amber-600 dark:text-amber-400"
            title={`Not configured — update ${envVar} here or set it in the platform Keys/API keys tab`}
          >
            <AlertTriangle className="h-3 w-3" />
            {envVar} · Not configured
          </Badge>
        )}
        {source === "db" && (
          <button
            type="button"
            onClick={async () => {
              try {
                await clearSecret.mutateAsync(undefined);
              } catch (e: any) {
                toast.error(e?.message || `Failed to clear ${envVar}`);
              }
            }}
            disabled={clearSecret.isPending}
            className="inline-flex items-center gap-1 text-[10px] font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            title={`Clear the stored override for ${envVar} and fall back to the environment variable`}
          >
            <Trash2 className="h-3 w-3" />
            {clearSecret.isPending ? "Clearing…" : "Clear override"}
          </button>
        )}
      </div>
      <div className="flex gap-2">
        <Input
          type="password"
          placeholder={`Paste a new ${envVar} — stored encrypted`}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="text-xs font-mono"
          autoComplete="off"
        />
        <Button
          size="sm"
          variant="outline"
          className="text-xs shrink-0"
          onClick={async () => {
            try {
              await updateSecret.mutateAsync({ value });
            } catch (e: any) {
              toast.error(e?.message || `Failed to update ${envVar}`);
            }
          }}
          disabled={updateSecret.isPending || !value.trim()}
        >
          {updateSecret.isPending ? (
            <Loader2 className="h-3 w-3 animate-spin mr-1" />
          ) : (
            <Save className="h-3 w-3 mr-1" />
          )}
          Update
        </Button>
      </div>
      {hint}
    </div>
  );
}

export default function AdminSettings() {
  const { data: settings, isLoading, refetch } = useApiQuery<any[]>(
    ["admin", "settings"],
    "/api/seed/settings"
  );
  // Scoped: saving a config only changes the settings list — no full-cache blast.
  const updateSetting = useApiMutation<any, any>("put", "/api/seed/settings/flutterwave_config", {
    invalidateKeys: [["admin", "settings"]],
  });

  // Env-var credential status — secrets live in environment variables, never
  // the database. These tell the admin whether the runtime actually has them.
  const { data: flwEnvStatus } = useApiQuery<any>(
    ["admin", "flutterwave-config"],
    "/api/payments/admin/flutterwave-config"
  );
  const { data: resendEnvStatus } = useApiQuery<any>(
    ["admin", "resend-status"],
    "/api/test-email/status"
  );
  // Admin-managed secret overrides — status + source for each gateway key.
  const { data: secretsStatus } = useApiQuery<any>(
    ["admin", "secrets-status"],
    "/api/admin/secrets"
  );
  const secretStatusOf = (name: string) =>
    (secretsStatus?.items ?? []).find((s: any) => s.name === name);

  // Mode state
  const [liveMode, setLiveMode] = useState(false);

  // Flutterwave state - stores both test and live keys
  const [flwTestConfig, setFlwTestConfig] = useState<ProviderConfig>({
    publicKey: "",
    webhookUrl: "",
    isEnabled: true,
    mode: "test",
  });
  const [flwLiveConfig, setFlwLiveConfig] = useState<ProviderConfig>({
    publicKey: "",
    webhookUrl: "",
    isEnabled: false,
    mode: "live",
  });
  const [savingFlw, setSavingFlw] = useState(false);
  const [confirmLiveSwitch, setConfirmLiveSwitch] = useState(false);

  // Paystack state (future-ready)
  const [pskConfig, setPskConfig] = useState<ProviderConfig>({
    publicKey: "",
    isEnabled: false,
  });
  const [savingPsk, setSavingPsk] = useState(false);

  // Resend email state — the API key is NOT part of it (env-managed).
  const [resendConfig, setResendConfig] = useState({
    fromEmail: "AfriFundedCapital <noreply@afrifundedcapital.com>",
    isEnabled: false,
  });
  const [savingResend, setSavingResend] = useState(false);
  // Optional transient key for a one-off test send (never persisted).
  const [testApiKey, setTestApiKey] = useState("");
  const [testEmail, setTestEmail] = useState("");
  const [sendingTest, setSendingTest] = useState(false);

  // Affiliate settings state
  const [affiliateThreshold, setAffiliateThreshold] = useState(50000);
  const [savingAffiliate, setSavingAffiliate] = useState(false);

  const [bulkSeeding, setBulkSeeding] = useState(false);

  // Test webhook state
  const [testWebhookState, setTestWebhookState] = useState<"idle" | "testing" | "done" | "error">("idle");
  const [testWebhookResult, setTestWebhookResult] = useState<any>(null);
  const [testWebhookPaymentId, setTestWebhookPaymentId] = useState("");

  // Load existing config from settings (render-adjust: fires once settings arrive)
  useResetOnChange([settings], () => {
    if (!settings) return;

    // Load Flutterwave config
    const flwSetting = settings.find((s: any) => s.key === "flutterwave_config");
    if (flwSetting?.value) {
      const val = flwSetting.value;
      // Detect mode from keys
      const isTest = (val.publicKey || "").includes("TEST");
      const mode = isTest ? "test" : "live";

      if (mode === "test") {
        setFlwTestConfig({
          publicKey: val.publicKey || "",
          webhookUrl: val.webhookUrl || "",
          isEnabled: val.isEnabled !== false,
          mode: "test",
        });
      } else {
        setFlwLiveConfig({
          publicKey: val.publicKey || "",
          webhookUrl: val.webhookUrl || "",
          isEnabled: val.isEnabled !== false,
          mode: "live",
        });
        setLiveMode(true);
      }
    }

    // Load saved live keys separately
    const flwLiveSetting = settings.find((s: any) => s.key === "flutterwave_live_config");
    if (flwLiveSetting?.value) {
      setFlwLiveConfig({
        publicKey: flwLiveSetting.value.publicKey || "",
        webhookUrl: flwLiveSetting.value.webhookUrl || "",
        isEnabled: flwLiveSetting.value.isEnabled !== false,
        mode: "live",
      });
    }

    // Load saved test keys separately
    const flwTestSetting = settings.find((s: any) => s.key === "flutterwave_test_config");
    if (flwTestSetting?.value) {
      setFlwTestConfig({
        publicKey: flwTestSetting.value.publicKey || "",
        webhookUrl: flwTestSetting.value.webhookUrl || "",
        isEnabled: flwTestSetting.value.isEnabled !== false,
        mode: "test",
      });
    }

    // Load Resend config
    const resendSetting = settings.find((s: any) => s.key === "resend_config");
    if (resendSetting?.value) {
      setResendConfig({
        fromEmail: resendSetting.value.fromEmail || "AfriFundedCapital <noreply@afrifundedcapital.com>",
        isEnabled: resendSetting.value.isEnabled === true,
      });
    }

    // Load Paystack config
    const pskSetting = settings.find((s: any) => s.key === "paystack_config");
    if (pskSetting?.value) {
      setPskConfig({
        publicKey: pskSetting.value.publicKey || "",
        isEnabled: pskSetting.value.isEnabled === true,
      });
    }

    // Load affiliate auto-approve threshold
    const affThreshold = settings.find((s: any) => s.key === "affiliate_auto_approve_threshold");
    if (affThreshold?.value) {
      setAffiliateThreshold(typeof affThreshold.value === "number" ? affThreshold.value : 50000);
    }
  }, Boolean(settings && settings.length > 0));

  // Get the currently active config based on mode
  const activeFlwConfig = liveMode ? flwLiveConfig : flwTestConfig;
  const setActiveFlwConfig = liveMode ? setFlwLiveConfig : setFlwTestConfig;

  const handleModeSwitch = (wantLive: boolean) => {
    if (wantLive && !liveMode) {
      // Show confirmation when switching to live
      setConfirmLiveSwitch(true);
    } else {
      setLiveMode(wantLive);
    }
  };

  const confirmSwitchToLive = () => {
    setLiveMode(true);
    setConfirmLiveSwitch(false);
    toast.success("Switched to Live mode");
  };

  const saveFlutterwave = async () => {
    setSavingFlw(true);
    try {
      // Save to mode-specific key
      const configKey = liveMode ? "flutterwave_live_config" : "flutterwave_test_config";
      await fetch(`/api/seed/settings/${configKey}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          value: {
            publicKey: activeFlwConfig.publicKey,
            webhookUrl: activeFlwConfig.webhookUrl,
            isEnabled: activeFlwConfig.isEnabled,
            mode: liveMode ? "live" : "test",
          },
          group: "payments",
        }),
      });

      // Also update the main flutterwave_config to the active mode's keys
      await updateSetting.mutateAsync({
        value: {
          publicKey: activeFlwConfig.publicKey,
          webhookUrl: activeFlwConfig.webhookUrl,
          isEnabled: activeFlwConfig.isEnabled,
          mode: liveMode ? "live" : "test",
          activeMode: liveMode ? "live" : "test",
        },
        group: "payments",
      });

      toast.success(`Flutterwave ${liveMode ? "Live" : "Test"} configuration saved`);
      refetch();
    } catch (e: any) {
      toast.error(e?.message || "Failed to save Flutterwave config");
    }
    setSavingFlw(false);
  };

  const saveResend = async () => {
    setSavingResend(true);
    try {
      await fetch("/api/seed/settings/resend_config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          value: {
            // apiKey intentionally omitted — secrets come from env vars only.
            fromEmail: resendConfig.fromEmail,
            isEnabled: resendConfig.isEnabled,
          },
          group: "email",
        }),
      });
      toast.success("Resend email configuration saved");
      refetch();
    } catch (e: any) {
      toast.error(e?.message || "Failed to save Resend config");
    }
    setSavingResend(false);
  };

  const sendTestEmail = async () => {
    if (!testEmail) {
      toast.error("Enter an email address to test");
      return;
    }
    setSendingTest(true);
    try {
      const res = await fetch("/api/test-email/send-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ to: testEmail, ...(testApiKey ? { apiKey: testApiKey } : {}) }),
      });
      const data = await readResponseBody(res);
      if (res.ok && data.success) {
        toast.success(`Test email sent to ${testEmail}`);
      } else {
        toast.error(errorMessageOf(data, res.status));
      }
    } catch (e: any) {
      toast.error(e?.message || "Failed to send test email");
    }
    setSendingTest(false);
  };

  const savePaystack = async () => {
    setSavingPsk(true);
    try {
      await fetch("/api/seed/settings/paystack_config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          value: {
            publicKey: pskConfig.publicKey,
            isEnabled: pskConfig.isEnabled,
          },
          group: "payments",
        }),
      });
      toast.success("Paystack configuration saved");
      refetch();
    } catch (e: any) {
      toast.error(e?.message || "Failed to save Paystack config");
    }
    setSavingPsk(false);
  };

  const saveAffiliateThreshold = async () => {
    setSavingAffiliate(true);
    try {
      await fetch("/api/seed/settings/affiliate_auto_approve_threshold", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          value: affiliateThreshold,
          group: "affiliate",
        }),
      });
      toast.success(`Affiliate payout auto-approve threshold set to ₦${affiliateThreshold.toLocaleString()}`);
      refetch();
    } catch (e: any) {
      toast.error(e?.message || "Failed to save affiliate threshold");
    }
    setSavingAffiliate(false);
  };

  const handleBulkSeed = async () => {
    setBulkSeeding(true);
    try {
      const res = await fetch("/api/seed/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({}),
      });
      const data = await readResponseBody(res);
      if (data.success) {
        toast.success("All demo data seeded successfully!");
      } else {
        toast.warning(data.message || errorMessageOf(data, res.status));
      }
      refetch();
    } catch (e: any) {
      toast.error(e?.message || "Failed to run bulk seed");
    }
    setBulkSeeding(false);
  };

  const fireTestWebhook = async () => {
    setTestWebhookState("testing");
    setTestWebhookResult(null);
    try {
      const res = await fetch("/api/payments/admin/test-webhook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          paymentId: testWebhookPaymentId ? parseInt(testWebhookPaymentId) : undefined,
        }),
      });
      const data = await readResponseBody(res);
      if (!res.ok) throw new Error(errorMessageOf(data, res.status));
      setTestWebhookResult(data);
      setTestWebhookState("done");
      if (data.webhookStatus === "ok") {
        toast.success("Webhook processed successfully!");
      } else {
        toast.info(`Webhook responded: ${data.webhookStatus}`);
      }
    } catch (e: any) {
      setTestWebhookState("error");
      toast.error(e?.message || "Failed to fire test webhook");
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard");
  };

  const getWebhookUrl = () => {
    const host = typeof window !== "undefined" ? window.location.origin : "";
    return `${host}/api/payments/webhook/flutterwave`;
  };

  if (isLoading) {
    return <PageLoader />;
  }


  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="System"
        title="Payment Settings"
        subtitle="Configure payment providers and environment mode — gateway secrets can be updated here or set via environment variables"
        actions={
          <Button size="sm" className="text-xs" onClick={handleBulkSeed} disabled={bulkSeeding}>
            {bulkSeeding ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Database className="h-3 w-3 mr-1" />}
            {bulkSeeding ? "Seeding..." : "Seed All Demo Data"}
          </Button>
        }
      />

      {/* Keys saved here are encrypted with a stable key only when
          APP_SECRETS_KEY / JWT_PRIVATE_KEY is set — otherwise they would be
          lost on restart, so warn the admin. */}
      {secretsStatus && !secretsStatus.encryptionKeyed && (
        <div className="card-subtle p-4 flex items-start gap-3 border-yellow-500/20">
          <AlertTriangle className="h-4 w-4 text-yellow-500 mt-0.5 shrink-0" />
          <div>
            <div className="text-xs font-medium text-yellow-600 dark:text-yellow-400">Secret overrides are not persistent</div>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              No <code className="bg-muted px-1 rounded">APP_SECRETS_KEY</code> is set, so keys saved here are
              encrypted with an ephemeral key and will not survive a restart. Set{" "}
              <code className="bg-muted px-1 rounded">APP_SECRETS_KEY</code> in the platform Keys/API keys tab
              to make updates permanent.
            </p>
          </div>
        </div>
      )}

      {/* ─── LIVE / TEST MODE TOGGLE ────────────────────── */}
      <div className={`card-subtle p-5 ${liveMode ? "border-red-500/30 bg-red-500/5" : "border-emerald-500/20 bg-emerald-500/5"}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${liveMode ? "bg-red-500/10" : "bg-emerald-500/10"}`}>
              {liveMode ? (
                <Globe className="h-5 w-5 text-red-500" />
              ) : (
                <Zap className="h-5 w-5 text-emerald-500" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-medium">
                  {liveMode ? "Live Mode" : "Test Mode"}
                </h3>
                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${liveMode ? "bg-red-500/10 text-red-600 dark:text-red-400" : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"}`}>
                  {liveMode ? "PRODUCTION" : "SANDBOX"}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {liveMode
                  ? "Real money transactions are being processed. Ensure live API keys are configured."
                  : "All payments are simulated using Flutterwave's sandbox. No real money is processed."}
              </p>
            </div>
          </div>
          <Switch
            checked={liveMode}
            onCheckedChange={handleModeSwitch}
            className={liveMode ? "data-[state=checked]:bg-red-500" : ""}
          />
        </div>

        {/* Live mode warning banner */}
        {liveMode && (
          <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/5 p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-red-500 mt-0.5 shrink-0" />
              <div>
                <div className="text-sm font-semibold text-red-600 dark:text-red-400">
                  ⚠️ Production Mode Active
                </div>
                <ul className="mt-2 space-y-1 text-xs text-red-600/80 dark:text-red-400/80">
                  <li>• Real payments will be processed through Flutterwave</li>
                  <li>• Users will be charged actual amounts in NGN</li>
                  <li>• Ensure your live API keys are correctly configured below</li>
                  <li>• Verify webhook URLs are updated in Flutterwave dashboard</li>
                  <li>• Monitor transaction logs closely for the first 24 hours</li>
                </ul>
                <div className="mt-3 flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-xs border-red-500/30 text-red-600 dark:text-red-400 hover:bg-red-500/10"
                    onClick={() => {
                      setLiveMode(false);
                      setConfirmLiveSwitch(false);
                      toast.success("Switched back to Test mode");
                    }}
                  >
                    Switch Back to Test Mode
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {!liveMode && (
          <div className="mt-3 flex items-center gap-2 text-[10px] text-muted-foreground">
            <CheckCircle className="h-3 w-3 text-emerald-500" />
            <span>Safe to test — no real money will be charged</span>
          </div>
        )}
      </div>

      {/* ─── Confirm Live Switch Dialog ────────────────── */}
      {confirmLiveSwitch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="card-subtle max-w-md w-full mx-4 p-6 space-y-4 border border-red-500/30">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-500/10">
                <AlertTriangle className="h-5 w-5 text-red-500" />
              </div>
              <div>
                <h3 className="text-sm font-semibold">Switch to Live Mode?</h3>
                <p className="text-xs text-muted-foreground">This action requires confirmation</p>
              </div>
            </div>
            <div className="space-y-2 text-xs text-muted-foreground">
              <p>You are about to switch to <strong className="text-red-600 dark:text-red-400">Live (Production)</strong> mode:</p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>Real money transactions will be processed</li>
                <li>Ensure your live API keys are configured</li>
                <li>Webhook URLs must be updated for production</li>
              </ul>
            </div>
            <div className="flex justify-end gap-2">
              <Button
                size="sm"
                variant="outline"
                className="text-xs"
                onClick={() => setConfirmLiveSwitch(false)}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                className="text-xs bg-red-600 hover:bg-red-700 text-white"
                onClick={confirmSwitchToLive}
              >
                Yes, Switch to Live
              </Button>
            </div>
          </div>
        </div>
      )}

      <Tabs defaultValue="flutterwave" className="space-y-6">
        <TabsList className="border border-border bg-transparent p-0.5">
          <TabsTrigger value="flutterwave" className="text-xs data-[state=active]:bg-secondary gap-1.5">
            <CreditCard className="h-3 w-3" />
            Flutterwave
            {liveMode && <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />}
          </TabsTrigger>
          <TabsTrigger value="paystack" className="text-xs data-[state=active]:bg-secondary gap-1.5">
            <CreditCard className="h-3 w-3" />
            Paystack
          </TabsTrigger>
          <TabsTrigger value="resend" className="text-xs data-[state=active]:bg-secondary gap-1.5">
            <Mail className="h-3 w-3" />
            Resend
          </TabsTrigger>
          <TabsTrigger value="affiliate" className="text-xs data-[state=active]:bg-secondary gap-1.5">
            <Users className="h-3 w-3" />
            Affiliate
          </TabsTrigger>
          <TabsTrigger value="webhooks" className="text-xs data-[state=active]:bg-secondary gap-1.5">
            <Webhook className="h-3 w-3" />
            Webhooks
          </TabsTrigger>
          <TabsTrigger value="smtp" className="text-xs data-[state=active]:bg-secondary gap-1.5">
            <Server className="h-3 w-3" />
            SMTP
          </TabsTrigger>
          <TabsTrigger value="mt5" className="text-xs data-[state=active]:bg-secondary gap-1.5">
            <Activity className="h-3 w-3" />
            MT5
          </TabsTrigger>
          <TabsTrigger value="security" className="text-xs data-[state=active]:bg-secondary gap-1.5">
            <Lock className="h-3 w-3" />
            Security
          </TabsTrigger>
        </TabsList>

        {/* ─── Flutterwave ──────────────────────────── */}
        <TabsContent value="flutterwave" className="space-y-6">
          {/* Mode indicator stripe */}
          {liveMode ? (
            <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-3 flex items-center gap-2">
              <Globe className="h-4 w-4 text-red-500" />
              <span className="text-xs font-medium text-red-600 dark:text-red-400">
                Editing LIVE (Production) keys
              </span>
            </div>
          ) : (
            <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 p-3 flex items-center gap-2">
              <Zap className="h-4 w-4 text-emerald-500" />
              <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                Editing TEST (Sandbox) keys
              </span>
            </div>
          )}

          {/* Status indicator */}
          <div className="card-subtle p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`h-2 w-2 rounded-full ${activeFlwConfig.isEnabled && activeFlwConfig.publicKey ? "bg-emerald-500" : "bg-yellow-500"}`} />
              <div>
                <div className="text-sm font-medium">Flutterwave ({liveMode ? "Live" : "Test"} Keys)</div>
                <div className="text-xs text-muted-foreground">
                  {activeFlwConfig.isEnabled && activeFlwConfig.publicKey
                    ? `${liveMode ? "Live" : "Test"} keys configured`
                    : activeFlwConfig.isEnabled
                      ? `Enabled — ${liveMode ? "live" : "test"} keys not yet configured`
                      : "Disabled"}
                </div>
              </div>
            </div>
            <Switch
              checked={activeFlwConfig.isEnabled}
              onCheckedChange={(checked) => setActiveFlwConfig({ ...activeFlwConfig, isEnabled: checked })}
            />
          </div>

          {/* API Keys */}
          <div className="card-subtle p-6 space-y-5">
            <div className="flex items-center justify-between gap-2 mb-1">
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-sm font-medium">
                  {liveMode ? "Production" : "Test"} API Keys
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <LastChanged meta={getSettingMeta(settings, "flutterwave_config")} settingKey="flutterwave_config" />
                <ViewHistoryLink settingKey="flutterwave_config" />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Public Key</Label>
              <div className="relative">
                <Input
                  type="text"
                  placeholder={liveMode ? "FLWPUBK_live-..." : "FLWPUBK_TEST-..."}
                  value={activeFlwConfig.publicKey}
                  onChange={(e) => setActiveFlwConfig({ ...activeFlwConfig, publicKey: e.target.value })}
                  className="text-xs font-mono pr-20"
                />
                <div className="absolute right-2 top-1/2 -translate-y-1/2 flex gap-1">
                  {activeFlwConfig.publicKey && (
                    <button
                      onClick={() => copyToClipboard(activeFlwConfig.publicKey)}
                      className="p-1 hover:bg-secondary rounded"
                    >
                      <Copy className="h-3 w-3 text-muted-foreground" />
                    </button>
                  )}
                </div>
              </div>
              <p className="text-[10px] text-muted-foreground">
                Used in the frontend checkout modal. Safe to expose.
              </p>
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Secret Key</Label>
              <SecretKeyField
                envVar="FLW_SECRET_KEY"
                status={secretStatusOf("FLW_SECRET_KEY")}
                hint={
                  <p className="text-[10px] text-muted-foreground pt-1">
                    Server-side only — used for payment verification and refunds. Updating here takes effect
                    immediately and is stored encrypted at rest; clearing falls back to{" "}
                    <code className="bg-muted px-1 rounded">FLW_SECRET_KEY</code> from the environment.
                  </p>
                }
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Verif Hash (Webhook Signature)</Label>
              <SecretKeyField
                envVar="FLW_SECRET_HASH"
                status={secretStatusOf("FLW_SECRET_HASH")}
                hint={
                  <p className="text-[10px] text-muted-foreground pt-1">
                    Found in Flutterwave Dashboard → Settings → Webhooks. Updating here takes effect immediately
                    (stored encrypted at rest); clearing falls back to{" "}
                    <code className="bg-muted px-1 rounded">FLW_SECRET_HASH</code> from the environment.
                  </p>
                }
              />
            </div>

            <div className="pt-2 flex items-center gap-3">
              <Button
                size="sm"
                className="text-xs"
                onClick={saveFlutterwave}
                disabled={savingFlw || !activeFlwConfig.publicKey}
              >
                {savingFlw ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Save className="h-3 w-3 mr-1" />}
                Save {liveMode ? "Live" : "Test"} Config
              </Button>
              {!liveMode && flwTestConfig.publicKey && flwLiveConfig.publicKey && (
                <Button
                  size="sm"
                  variant="outline"
                  className="text-xs"
                  onClick={() => {
                    setLiveMode(true);
                    toast.success("Switched to Live mode to edit production keys");
                  }}
                >
                  <Globe className="h-3 w-3 mr-1" />
                  Edit Live Keys
                </Button>
              )}
              {liveMode && flwTestConfig.publicKey && (
                <Button
                  size="sm"
                  variant="outline"
                  className="text-xs"
                  onClick={() => {
                    setLiveMode(false);
                    toast.success("Switched to Test mode to edit sandbox keys");
                  }}
                >
                  <Zap className="h-3 w-3 mr-1" />
                  Edit Test Keys
                </Button>
              )}
            </div>
          </div>

          {/* Test mode notice */}
          {!liveMode && activeFlwConfig.publicKey.includes("TEST") && (
            <div className="card-subtle p-4 flex items-start gap-3 border-yellow-500/20">
              <AlertTriangle className="h-4 w-4 text-yellow-500 mt-0.5 shrink-0" />
              <div>
                <div className="text-xs font-medium text-yellow-600 dark:text-yellow-400">Test Mode</div>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  Your keys contain "TEST" — payments will use Flutterwave's sandbox.
                  Switch to live mode above when you're ready for production.
                </p>
              </div>
            </div>
          )}

          {activeFlwConfig.publicKey && flwEnvStatus?.secretKeyConfigured && activeFlwConfig.isEnabled && (
            <div className={`card-subtle p-4 flex items-start gap-3 ${liveMode ? "border-red-500/20" : "border-emerald-500/20"}`}>
              <CheckCircle className={`h-4 w-4 mt-0.5 shrink-0 ${liveMode ? "text-red-500" : "text-emerald-500"}`} />
              <div>
                <div className={`text-xs font-medium ${liveMode ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"}`}>
                  {liveMode ? "Live Mode Active" : "Configured"}
                </div>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {liveMode
                    ? "Flutterwave checkout is LIVE. Real payments will be processed."
                    : "Flutterwave checkout is ready in sandbox mode. Users can test the full purchase flow."}
                </p>
              </div>
            </div>
          )}

          {/* Quick key status summary */}
          <div className="card-subtle p-4">
            <div className="text-xs font-medium mb-3">Key Status Summary</div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex items-center gap-2">
                <div className={`h-2 w-2 rounded-full ${flwTestConfig.publicKey ? "bg-emerald-500" : "bg-muted"}`} />
                <span className="text-[11px] text-muted-foreground">Test Keys</span>
                <span className="text-[10px] text-muted-foreground">
                  {flwTestConfig.publicKey ? "Public key set" : "Not set"}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div className={`h-2 w-2 rounded-full ${flwLiveConfig.publicKey ? "bg-emerald-500" : "bg-muted"}`} />
                <span className="text-[11px] text-muted-foreground">Live Keys</span>
                <span className="text-[10px] text-muted-foreground">
                  {flwLiveConfig.publicKey ? "Public key set" : "Not set"}
                </span>
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground mt-2">
              Secrets (FLW_SECRET_KEY / FLW_SECRET_HASH) are shared across modes and can be updated in this panel
              or set via environment variables — see the fields above.
            </p>
          </div>
        </TabsContent>

        {/* ─── Paystack (future-ready) ─────────────── */}
        <TabsContent value="paystack" className="space-y-6">
          <div className="card-subtle p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`h-2 w-2 rounded-full ${pskConfig.isEnabled && pskConfig.publicKey ? "bg-emerald-500" : "bg-muted"}`} />
              <div>
                <div className="text-sm font-medium">Paystack</div>
                <div className="text-xs text-muted-foreground">
                  {pskConfig.isEnabled && pskConfig.publicKey
                    ? "Active — keys configured"
                    : pskConfig.isEnabled
                      ? "Enabled — keys not yet configured"
                      : "Not configured — coming soon"}
                </div>
              </div>
            </div>
            <Switch
              checked={pskConfig.isEnabled}
              onCheckedChange={(checked) => setPskConfig({ ...pskConfig, isEnabled: checked })}
            />
          </div>

          <div className="card-subtle p-6 space-y-5">
            <div className="flex items-center justify-between gap-2 mb-1">
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-sm font-medium">API Keys</h3>
              </div>
              <div className="flex items-center gap-2">
                <LastChanged meta={getSettingMeta(settings, "paystack_config")} settingKey="paystack_config" />
                <ViewHistoryLink settingKey="paystack_config" />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Public Key</Label>
              <Input
                type="text"
                placeholder="pk_test_..."
                value={pskConfig.publicKey}
                onChange={(e) => setPskConfig({ ...pskConfig, publicKey: e.target.value })}
                className="text-xs font-mono"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Secret Key</Label>
              <SecretKeyField
                envVar="PAYSTACK_SECRET_KEY"
                status={secretStatusOf("PAYSTACK_SECRET_KEY")}
                hint={
                  <p className="text-[10px] text-muted-foreground pt-1">
                    Server-side only — used for payment verification and refunds when the Paystack integration
                    ships. Updating here takes effect immediately (stored encrypted at rest); clearing falls back
                    to <code className="bg-muted px-1 rounded">PAYSTACK_SECRET_KEY</code> from the environment.
                  </p>
                }
              />
            </div>

            <div className="pt-2">
              <Button
                size="sm"
                className="text-xs"
                onClick={savePaystack}
                disabled={savingPsk}
              >
                {savingPsk ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Save className="h-3 w-3 mr-1" />}
                Save Paystack Config
              </Button>
            </div>
          </div>

          <div className="card-subtle p-4 flex items-start gap-3">
            <AlertTriangle className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
            <div>
              <div className="text-xs font-medium">Coming Soon</div>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                Paystack integration is architecture-ready. Save your keys now and enable it when the integration is complete.
              </p>
            </div>
          </div>
        </TabsContent>

        {/* ─── Resend Email ──────────────────────────── */}
        <TabsContent value="resend" className="space-y-6">
          {/* Status indicator */}
          <div className="card-subtle p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`h-2 w-2 rounded-full ${resendConfig.isEnabled && resendEnvStatus?.apiKeyConfigured ? "bg-emerald-500" : "bg-yellow-500"}`} />
              <div>
                <div className="text-sm font-medium">Resend Email Service</div>
                <div className="text-xs text-muted-foreground">
                  {resendConfig.isEnabled && resendEnvStatus?.apiKeyConfigured
                    ? "Active — emails are being sent"
                    : resendConfig.isEnabled
                      ? "Enabled — RESEND_API_KEY not yet configured"
                      : "Disabled"}
                </div>
              </div>
            </div>
            <Switch
              checked={resendConfig.isEnabled}
              onCheckedChange={(checked) => setResendConfig({ ...resendConfig, isEnabled: checked })}
            />
          </div>

          {/* API Key */}
          <div className="card-subtle p-6 space-y-5">
            <div className="flex items-center justify-between gap-2 mb-1">
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-sm font-medium">API Configuration</h3>
              </div>
              <div className="flex items-center gap-2">
                <LastChanged meta={getSettingMeta(settings, "resend_config")} settingKey="resend_config" />
                <ViewHistoryLink settingKey="resend_config" />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Resend API Key</Label>
              <SecretKeyField
                envVar="RESEND_API_KEY"
                status={secretStatusOf("RESEND_API_KEY")}
                hint={
                  <p className="text-[10px] text-muted-foreground pt-1">
                    Used for all transactional emails. Get one from{" "}
                    <a href="https://resend.com/api-keys" target="_blank" rel="noopener noreferrer" className="underline">resend.com/api-keys</a>.{" "}
                    Updating here takes effect immediately (stored encrypted at rest); clearing falls back to{" "}
                    <code className="bg-muted px-1 rounded">RESEND_API_KEY</code> from the environment.
                  </p>
                }
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">From Email</Label>
              <Input
                type="text"
                placeholder="AfriFundedCapital <noreply@afrifundedcapital.com>"
                value={resendConfig.fromEmail}
                onChange={(e) => setResendConfig({ ...resendConfig, fromEmail: e.target.value })}
                className="text-xs font-mono"
              />
              <p className="text-[10px] text-muted-foreground">
                The sender address for all outgoing emails. Must be from a verified domain in Resend.
              </p>
            </div>

            <div className="pt-2">
              <Button
                size="sm"
                className="text-xs"
                onClick={saveResend}
                disabled={savingResend}
              >
                {savingResend ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Save className="h-3 w-3 mr-1" />}
                Save Resend Config
              </Button>
            </div>
          </div>

          {/* Test email */}
          <div className="card-subtle p-6 space-y-4">
            <div className="flex items-center gap-2 mb-1">
              <Mail className="h-4 w-4 text-muted-foreground" />
              <h3 className="text-sm font-medium">Send Test Email</h3>
            </div>

            <p className="text-xs text-muted-foreground">
              Send a test email to verify your Resend configuration is working correctly.
            </p>

            <div className="flex gap-2">
              <Input
                type="email"
                placeholder="your@email.com"
                value={testEmail}
                onChange={(e) => setTestEmail(e.target.value)}
                className="text-xs"
              />
              <Button
                size="sm"
                className="text-xs shrink-0"
                onClick={sendTestEmail}
                disabled={sendingTest || !testEmail || (!resendEnvStatus?.apiKeyConfigured && !testApiKey)}
              >
                {sendingTest ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Mail className="h-3 w-3 mr-1" />}
                Send Test
              </Button>
            </div>
            <Input
              type="password"
              placeholder="Optional: paste a key just for this test (never saved)"
              value={testApiKey}
              onChange={(e) => setTestApiKey(e.target.value)}
              className="text-xs font-mono"
            />
            <p className="text-[10px] text-muted-foreground">
              Uses RESEND_API_KEY from the environment, or a key pasted above for this single send. Test keys are never persisted.
            </p>
          </div>

          {/* Status */}
          {resendConfig.isEnabled && resendEnvStatus?.apiKeyConfigured && (
            <div className="card-subtle p-4 flex items-start gap-3 border-emerald-500/20">
              <CheckCircle className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />
              <div>
                <div className="text-xs font-medium text-emerald-600 dark:text-emerald-400">Email Service Active</div>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  Transactional emails will be sent for KYC approvals, payment confirmations, support replies, and more.
                </p>
              </div>
            </div>
          )}

          {!resendEnvStatus?.apiKeyConfigured && resendConfig.isEnabled && (
            <div className="card-subtle p-4 flex items-start gap-3 border-yellow-500/20">
              <AlertTriangle className="h-4 w-4 text-yellow-500 mt-0.5 shrink-0" />
              <div>
                <div className="text-xs font-medium text-yellow-600 dark:text-yellow-400">API Key Required</div>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  Set the RESEND_API_KEY environment variable in the platform Keys/API keys tab to enable email delivery.
                </p>
              </div>
            </div>
          )}
        </TabsContent>

        {/* ─── SMTP ────────────────────────────────── */}
        <TabsContent value="smtp" className="space-y-6">
          <div className="card-subtle p-6 space-y-5">
            <div className="flex items-center gap-2 mb-1">
              <Server className="h-4 w-4 text-muted-foreground" />
              <h3 className="text-sm font-medium">SMTP Relay</h3>
            </div>

            <p className="text-xs text-muted-foreground">
              Optional SMTP credentials used by the email service when a direct relay is configured. The
              password is managed as a runtime secret — updating here takes effect immediately (stored
              encrypted at rest) and clearing falls back to the environment variable.
            </p>

            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">SMTP Password</Label>
              <SecretKeyField
                envVar="SMTP_PASSWORD"
                status={secretStatusOf("SMTP_PASSWORD")}
                hint={
                  <p className="text-[10px] text-muted-foreground pt-1">
                    The SMTP host, port, and username are connection metadata — set them via{" "}
                    <code className="bg-muted px-1 rounded">SMTP_HOST</code>,{" "}
                    <code className="bg-muted px-1 rounded">SMTP_PORT</code>, and{" "}
                    <code className="bg-muted px-1 rounded">SMTP_USER</code> in the platform Keys/API keys tab.
                  </p>
                }
              />
            </div>

            <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 flex items-start gap-2">
              <Shield className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
              <span className="text-[11px] text-muted-foreground">
                Transactional email is sent through <strong>Resend</strong> by default (see the Resend tab).
                The SMTP password is managed here so the relay path can be activated without a redeploy.
              </span>
            </div>
          </div>
        </TabsContent>

        {/* ─── MT5 Gateway ────────────────────────── */}
        <TabsContent value="mt5" className="space-y-6">
          <div className="card-subtle p-6 space-y-5">
            <div className="flex items-center gap-2 mb-1">
              <Activity className="h-4 w-4 text-muted-foreground" />
              <h3 className="text-sm font-medium">MT5 Manager API Gateway</h3>
            </div>

            <p className="text-xs text-muted-foreground">
              The bearer token the platform uses to authenticate with your MT5 Manager API gateway. It is a
              managed runtime secret — updating here takes effect immediately (stored encrypted at rest) and
              clearing falls back to the environment variable.
            </p>

            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Gateway API Key</Label>
              <SecretKeyField
                envVar="MT5_GATEWAY_API_KEY"
                status={secretStatusOf("MT5_GATEWAY_API_KEY")}
                hint={
                  <p className="text-[10px] text-muted-foreground pt-1">
                    Saving a key here — or on the Admin → MT5 page's API Key field — stores it encrypted and
                    never in plaintext settings. Endpoint URLs, manager login, and leverage stay in the MT5
                    gateway config.
                  </p>
                }
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Manager Password</Label>
              <SecretKeyField
                envVar="MT5_MANAGER_PASSWORD"
                status={secretStatusOf("MT5_MANAGER_PASSWORD")}
                hint={
                  <p className="text-[10px] text-muted-foreground pt-1">
                    The MT5 Manager API login password sent with gateway requests. Managed like the API key —
                    encrypted at rest, never in plaintext settings, clearing falls back to{" "}
                    <code className="bg-muted px-1 rounded">MT5_MANAGER_PASSWORD</code> from the environment.
                  </p>
                }
              />
            </div>

            <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 flex items-start gap-2">
              <Shield className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
              <span className="text-[11px] text-muted-foreground">
                The Admin → MT5 page's "API Key" field saves through this same encrypted store, so the key is
                never written to the database in plaintext.
              </span>
            </div>
          </div>
        </TabsContent>

        {/* ─── Security (JWT signing key) ──────────── */}
        <TabsContent value="security" className="space-y-6">
          <div className="card-subtle p-6 space-y-5">
            <div className="flex items-center gap-2 mb-1">
              <Lock className="h-4 w-4 text-muted-foreground" />
              <h3 className="text-sm font-medium">Auth Signing Key</h3>
            </div>

            <p className="text-xs text-muted-foreground">
              The JWT signing key used by the auth layer. It is a managed runtime secret — updating here
              takes effect immediately (stored encrypted at rest) and clearing falls back to the environment
              variable.
            </p>

            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">JWT Private Key</Label>
              <SecretKeyField
                envVar="JWT_PRIVATE_KEY"
                status={secretStatusOf("JWT_PRIVATE_KEY")}
                hint={
                  <p className="text-[10px] text-muted-foreground pt-1">
                    Used to sign authentication tokens. Updating here takes effect immediately (stored
                    encrypted at rest); clearing falls back to{" "}
                    <code className="bg-muted px-1 rounded">JWT_PRIVATE_KEY</code> from the environment.
                  </p>
                }
              />
            </div>

            <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 flex items-start gap-2">
              <Shield className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
              <span className="text-[11px] text-muted-foreground">
                Because the JWT key is itself now a managed secret, the override store's master key comes
                from <code className="bg-muted px-1 rounded">APP_SECRETS_KEY</code> only — set it in the
                platform Keys/API keys tab so stored secrets survive restarts.
              </span>
            </div>
          </div>
        </TabsContent>

        {/* ─── Affiliate ──────────────────────────── */}
        <TabsContent value="affiliate" className="space-y-6">
          <div className="card-subtle p-6 space-y-5">
            <div className="flex items-center justify-between gap-2 mb-1">
              <div className="flex items-center gap-2">
                <Settings2 className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-sm font-medium">Payout Auto-Approval</h3>
              </div>
              <div className="flex items-center gap-2">
                <LastChanged meta={getSettingMeta(settings, "affiliate_auto_approve_threshold")} settingKey="affiliate_auto_approve_threshold" />
                <ViewHistoryLink settingKey="affiliate_auto_approve_threshold" />
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              Configure the threshold below which affiliate payout requests are automatically approved without manual review. Requests above this amount will require admin approval.
            </p>

            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Auto-Approve Threshold (₦)</Label>
              <div className="flex items-center gap-3">
                <Input
                  type="number"
                  min={5000}
                  step={5000}
                  value={affiliateThreshold}
                  onChange={(e) => setAffiliateThreshold(Math.max(5000, parseInt(e.target.value) || 0))}
                  className="text-sm font-mono w-48"
                />
                <div className="text-xs text-muted-foreground">
                  = ₦{affiliateThreshold.toLocaleString()}
                </div>
              </div>
              <p className="text-[10px] text-muted-foreground">
                Minimum: ₦5,000. Payout requests at or below this amount will be instantly approved. Set to ₦0 to disable auto-approval.
              </p>
            </div>

            <div className="card-subtle p-4 space-y-3">
              <div className="text-xs font-medium">How it works</div>
              <div className="space-y-2 text-xs text-muted-foreground">
                <div className="flex items-start gap-2">
                  <div className="h-4 w-4 rounded-full bg-emerald-500/10 flex items-center justify-center shrink-0 mt-0.5">
                    <CheckCircle className="h-2.5 w-2.5 text-emerald-500" />
                  </div>
                  <span>Request ≤ ₦{affiliateThreshold.toLocaleString()} → Auto-approved, user notified immediately</span>
                </div>
                <div className="flex items-start gap-2">
                  <div className="h-4 w-4 rounded-full bg-amber-500/10 flex items-center justify-center shrink-0 mt-0.5">
                    <AlertTriangle className="h-2.5 w-2.5 text-amber-500" />
                  </div>
                  <span>Request &gt; ₦{affiliateThreshold.toLocaleString()} → Pending admin review</span>
                </div>
              </div>
            </div>

            <div className="pt-2">
              <Button
                size="sm"
                className="text-xs"
                onClick={saveAffiliateThreshold}
                disabled={savingAffiliate}
              >
                {savingAffiliate ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Save className="h-3 w-3 mr-1" />}
                Save Threshold
              </Button>
            </div>
          </div>
        </TabsContent>

        {/* ─── Webhooks ─────────────────────────────── */}
        <TabsContent value="webhooks" className="space-y-6">
          <div className="card-subtle p-6 space-y-4">
            <div className="flex items-center gap-2 mb-1">
              <Webhook className="h-4 w-4 text-muted-foreground" />
              <h3 className="text-sm font-medium">Webhook Configuration</h3>
            </div>

            <p className="text-xs text-muted-foreground">
              Webhooks ensure payments are confirmed even if users close the browser after payment.
              Configure these URLs in your payment provider dashboards.
            </p>

            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Flutterwave Webhook URL</Label>
                <div className="flex gap-2">
                  <Input
                    readOnly
                    value={getWebhookUrl()}
                    className="text-xs font-mono bg-muted"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs shrink-0"
                    onClick={() => copyToClipboard(getWebhookUrl())}
                  >
                    <Copy className="h-3 w-3" />
                  </Button>
                </div>
                <p className="text-[10px] text-muted-foreground">
                  Paste this URL in Flutterwave Dashboard → Settings → Webhooks
                </p>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Paystack Webhook URL</Label>
                <div className="flex gap-2">
                  <Input
                    readOnly
                    value={typeof window !== "undefined" ? `${window.location.origin}/api/payments/webhook/paystack` : ""}
                    className="text-xs font-mono bg-muted"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs shrink-0"
                    onClick={() => copyToClipboard(`${window.location.origin}/api/payments/webhook/paystack`)}
                  >
                    <Copy className="h-3 w-3" />
                  </Button>
                </div>
                <p className="text-[10px] text-muted-foreground">
                  Paste this URL in Paystack Dashboard → Settings → Webhooks
                </p>
              </div>
            </div>
          </div>

          {/* Test Webhook */}
          <div className="card-subtle p-6 space-y-4">
            <div className="flex items-center gap-2 mb-1">
              <Zap className="h-4 w-4 text-muted-foreground" />
              <h3 className="text-sm font-medium">Test Webhook</h3>
            </div>

            <p className="text-xs text-muted-foreground">
              Fire a sample <code className="bg-muted px-1 rounded">charge.completed</code> payload at your own
              webhook endpoint to verify the URL and secret hash are configured correctly.
            </p>

            <div className="flex items-end gap-2">
              <div className="flex-1 space-y-1.5">
                <Label className="text-xs text-muted-foreground">Payment ID (optional)</Label>
                <Input
                  type="number"
                  placeholder="Complete a specific pending payment"
                  value={testWebhookPaymentId}
                  onChange={(e) => setTestWebhookPaymentId(e.target.value)}
                  className="text-xs"
                />
                <p className="text-[10px] text-muted-foreground">
                  Leave empty for a signature + reachability check. Enter a pending payment ID to run the full
                  processing pipeline on it (marks it completed, creates its challenge).
                </p>
              </div>
              <Button
                size="sm"
                className="text-xs shrink-0"
                onClick={fireTestWebhook}
                disabled={testWebhookState === "testing"}
              >
                {testWebhookState === "testing" ? (
                  <><Loader2 className="h-3 w-3 animate-spin mr-1" /> Firing...</>
                ) : (
                  <><Zap className="h-3 w-3 mr-1" /> Send Test Webhook</>
                )}
              </Button>
            </div>

            {testWebhookResult && (
              <div className="rounded-lg border p-3 space-y-2 bg-muted/30">
                <div className="flex items-center gap-2 text-xs">
                  {testWebhookResult.webhookStatus === "ok" ? (
                    <CheckCircle className="h-3.5 w-3.5 text-emerald-500" />
                  ) : (
                    <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                  )}
                  <span className="font-medium">
                    Webhook responded: <code className="bg-muted px-1 rounded">{testWebhookResult.webhookStatus}</code>
                  </span>
                </div>
                <div className="text-[10px] text-muted-foreground space-y-1 font-mono">
                  <div>tx_ref: {testWebhookResult.txRef}</div>
                  <div>
                    secret hash: {testWebhookResult.secretHashConfigured
                      ? "configured ✓"
                      : "NOT configured — set FLW_SECRET_HASH env var"}
                  </div>
                  {testWebhookResult.usedPayment && (
                    <div>processed payment #{testWebhookResult.paymentId}</div>
                  )}
                </div>
              </div>
            )}

            {testWebhookState === "done" && testWebhookResult && !testWebhookResult.secretHashConfigured && (
              <div className="rounded-lg border border-yellow-500/20 p-3 flex items-start gap-2">
                <AlertTriangle className="h-3.5 w-3.5 text-yellow-500 mt-0.5 shrink-0" />
                <p className="text-[10px] text-muted-foreground">
                  No secret hash is configured, so the webhook accepted the payload without signature validation.
                  Set the FLW_SECRET_HASH environment variable (Keys/API keys tab) and make sure it matches your Flutterwave dashboard.
                </p>
              </div>
            )}
          </div>

          {/* Webhook setup instructions */}
          <div className="card-subtle p-6 space-y-3">
            <h3 className="text-sm font-medium">Setup Instructions</h3>
            <div className="space-y-2 text-xs text-muted-foreground">
              <div className="flex gap-2">
                <span className="text-foreground font-medium">1.</span>
                <span>Copy the webhook URL above</span>
              </div>
              <div className="flex gap-2">
                <span className="text-foreground font-medium">2.</span>
                <span>Go to your Flutterwave Dashboard → Settings → Webhooks</span>
              </div>
              <div className="flex gap-2">
                <span className="text-foreground font-medium">3.</span>
                <span>Paste the URL and select the <code className="bg-muted px-1 rounded">charge.completed</code> event</span>
              </div>
              <div className="flex gap-2">
                <span className="text-foreground font-medium">4.</span>
                <span>Copy the Hash value and set it as the <code className="bg-muted px-1 rounded">FLW_SECRET_HASH</code> environment variable (Keys/API keys tab)</span>
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
