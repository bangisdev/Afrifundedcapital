/* eslint-disable @typescript-eslint/no-explicit-any */
import { useApiQuery, useApiMutation } from "@/hooks/use-api";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Loader2, Save, CreditCard, Shield, Webhook, Eye, EyeOff,
  CheckCircle, AlertTriangle, Copy, Database
} from "lucide-react";
import { toast } from "sonner";

interface ProviderConfig {
  publicKey: string;
  secretKey: string;
  secretHash?: string;
  webhookUrl?: string;
  isEnabled: boolean;
}

export default function AdminSettings() {
  const { data: settings, isLoading, refetch } = useApiQuery<any[]>(
    ["admin", "settings"],
    "/api/seed/settings"
  );
  const updateSetting = useApiMutation<any, any>("put", "/api/seed/settings/flutterwave_config");
  const seedData = useApiMutation<any, any>("post", "/api/seed/seed");

  // Flutterwave state
  const [flwConfig, setFlwConfig] = useState<ProviderConfig>({
    publicKey: "",
    secretKey: "",
    secretHash: "",
    webhookUrl: "",
    isEnabled: true,
  });
  const [showFlwSecret, setShowFlwSecret] = useState(false);
  const [showFlwHash, setShowFlwHash] = useState(false);
  const [savingFlw, setSavingFlw] = useState(false);

  // Paystack state (future-ready)
  const [pskConfig, setPskConfig] = useState<ProviderConfig>({
    publicKey: "",
    secretKey: "",
    isEnabled: false,
  });
  const [showPskSecret, setShowPskSecret] = useState(false);
  const [savingPsk, setSavingPsk] = useState(false);

  const [seeding, setSeeding] = useState(false);

  // Load existing config from settings
  useEffect(() => {
    if (!settings) return;
    const flwSetting = settings.find((s: any) => s.key === "flutterwave_config");
    if (flwSetting?.value) {
      setFlwConfig({
        publicKey: flwSetting.value.publicKey || "",
        secretKey: flwSetting.value.secretKey || "",
        secretHash: flwSetting.value.secretHash || "",
        webhookUrl: flwSetting.value.webhookUrl || "",
        isEnabled: flwSetting.value.isEnabled !== false,
      });
    }
    const pskSetting = settings.find((s: any) => s.key === "paystack_config");
    if (pskSetting?.value) {
      setPskConfig({
        publicKey: pskSetting.value.publicKey || "",
        secretKey: pskSetting.value.secretKey || "",
        isEnabled: pskSetting.value.isEnabled === true,
      });
    }
  }, [settings]);

  const saveFlutterwave = async () => {
    setSavingFlw(true);
    try {
      await updateSetting.mutateAsync({
        value: {
          publicKey: flwConfig.publicKey,
          secretKey: flwConfig.secretKey,
          secretHash: flwConfig.secretHash,
          webhookUrl: flwConfig.webhookUrl,
          isEnabled: flwConfig.isEnabled,
        },
        group: "payments",
      });
      toast.success("Flutterwave configuration saved");
      refetch();
    } catch (e: any) {
      toast.error(e?.message || "Failed to save Flutterwave config");
    }
    setSavingFlw(false);
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
            secretKey: pskConfig.secretKey,
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

  const handleSeed = async () => {
    setSeeding(true);
    try {
      await seedData.mutateAsync({});
      toast.success("Seed data created successfully");
      refetch();
    } catch (e: any) {
      toast.error(e.message);
    }
    setSeeding(false);
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
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-medium tracking-tight">Payment Settings</h1>
          <p className="text-xs text-muted-foreground mt-1">
            Configure payment providers and API keys
          </p>
        </div>
        <Button size="sm" className="text-xs" onClick={handleSeed} disabled={seeding}>
          {seeding ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Database className="h-3 w-3 mr-1" />}
          Seed Data
        </Button>
      </div>

      <Tabs defaultValue="flutterwave" className="space-y-6">
        <TabsList className="border border-border bg-transparent p-0.5">
          <TabsTrigger value="flutterwave" className="text-xs data-[state=active]:bg-secondary gap-1.5">
            <CreditCard className="h-3 w-3" />
            Flutterwave
          </TabsTrigger>
          <TabsTrigger value="paystack" className="text-xs data-[state=active]:bg-secondary gap-1.5">
            <CreditCard className="h-3 w-3" />
            Paystack
          </TabsTrigger>
          <TabsTrigger value="webhooks" className="text-xs data-[state=active]:bg-secondary gap-1.5">
            <Webhook className="h-3 w-3" />
            Webhooks
          </TabsTrigger>
        </TabsList>

        {/* ─── Flutterwave ──────────────────────────── */}
        <TabsContent value="flutterwave" className="space-y-6">
          {/* Status indicator */}
          <div className="card-subtle p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`h-2 w-2 rounded-full ${flwConfig.isEnabled && flwConfig.publicKey ? "bg-emerald-500" : "bg-yellow-500"}`} />
              <div>
                <div className="text-sm font-medium">Flutterwave</div>
                <div className="text-xs text-muted-foreground">
                  {flwConfig.isEnabled && flwConfig.publicKey
                    ? "Active — keys configured"
                    : flwConfig.isEnabled
                      ? "Enabled — keys not yet configured"
                      : "Disabled"}
                </div>
              </div>
            </div>
            <Switch
              checked={flwConfig.isEnabled}
              onCheckedChange={(checked) => setFlwConfig({ ...flwConfig, isEnabled: checked })}
            />
          </div>

          {/* API Keys */}
          <div className="card-subtle p-6 space-y-5">
            <div className="flex items-center gap-2 mb-1">
              <Shield className="h-4 w-4 text-muted-foreground" />
              <h3 className="text-sm font-medium">API Keys</h3>
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Public Key</Label>
              <div className="relative">
                <Input
                  type="text"
                  placeholder="FLWPUBK_TEST-..."
                  value={flwConfig.publicKey}
                  onChange={(e) => setFlwConfig({ ...flwConfig, publicKey: e.target.value })}
                  className="text-xs font-mono pr-20"
                />
                <div className="absolute right-2 top-1/2 -translate-y-1/2 flex gap-1">
                  {flwConfig.publicKey && (
                    <button
                      onClick={() => copyToClipboard(flwConfig.publicKey)}
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
              <div className="relative">
                <Input
                  type={showFlwSecret ? "text" : "password"}
                  placeholder="FLWSECK_TEST-..."
                  value={flwConfig.secretKey}
                  onChange={(e) => setFlwConfig({ ...flwConfig, secretKey: e.target.value })}
                  className="text-xs font-mono pr-20"
                />
                <div className="absolute right-2 top-1/2 -translate-y-1/2 flex gap-1">
                  <button
                    onClick={() => setShowFlwSecret(!showFlwSecret)}
                    className="p-1 hover:bg-secondary rounded"
                  >
                    {showFlwSecret ? <EyeOff className="h-3 w-3 text-muted-foreground" /> : <Eye className="h-3 w-3 text-muted-foreground" />}
                  </button>
                  {flwConfig.secretKey && (
                    <button
                      onClick={() => copyToClipboard(flwConfig.secretKey)}
                      className="p-1 hover:bg-secondary rounded"
                    >
                      <Copy className="h-3 w-3 text-muted-foreground" />
                    </button>
                  )}
                </div>
              </div>
              <p className="text-[10px] text-muted-foreground">
                Server-side only. Used for payment verification.
              </p>
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Verif Hash (Secret Hash)</Label>
              <div className="relative">
                <Input
                  type={showFlwHash ? "text" : "password"}
                  placeholder="Your verif-hash from Flutterwave dashboard"
                  value={flwConfig.secretHash || ""}
                  onChange={(e) => setFlwConfig({ ...flwConfig, secretHash: e.target.value })}
                  className="text-xs font-mono pr-20"
                />
                <div className="absolute right-2 top-1/2 -translate-y-1/2 flex gap-1">
                  <button
                    onClick={() => setShowFlwHash(!showFlwHash)}
                    className="p-1 hover:bg-secondary rounded"
                  >
                    {showFlwHash ? <EyeOff className="h-3 w-3 text-muted-foreground" /> : <Eye className="h-3 w-3 text-muted-foreground" />}
                  </button>
                  {flwConfig.secretHash && (
                    <button
                      onClick={() => copyToClipboard(flwConfig.secretHash || "")}
                      className="p-1 hover:bg-secondary rounded"
                    >
                      <Copy className="h-3 w-3 text-muted-foreground" />
                    </button>
                  )}
                </div>
              </div>
              <p className="text-[10px] text-muted-foreground">
                Found in Flutterwave Dashboard → Settings → Webhooks.
              </p>
            </div>

            <div className="pt-2">
              <Button
                size="sm"
                className="text-xs"
                onClick={saveFlutterwave}
                disabled={savingFlw || !flwConfig.publicKey || !flwConfig.secretKey}
              >
                {savingFlw ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Save className="h-3 w-3 mr-1" />}
                Save Flutterwave Config
              </Button>
            </div>
          </div>

          {/* Test mode notice */}
          {flwConfig.publicKey.includes("TEST") && (
            <div className="card-subtle p-4 flex items-start gap-3 border-yellow-500/20">
              <AlertTriangle className="h-4 w-4 text-yellow-500 mt-0.5 shrink-0" />
              <div>
                <div className="text-xs font-medium text-yellow-600 dark:text-yellow-400">Test Mode</div>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  Your keys contain "TEST" — payments will use Flutterwave's sandbox.
                  Switch to live keys in production.
                </p>
              </div>
            </div>
          )}

          {flwConfig.publicKey && flwConfig.secretKey && flwConfig.isEnabled && (
            <div className="card-subtle p-4 flex items-start gap-3 border-emerald-500/20">
              <CheckCircle className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />
              <div>
                <div className="text-xs font-medium text-emerald-600 dark:text-emerald-400">Configured</div>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  Flutterwave checkout is ready. Users can purchase challenges via card, USSD, bank transfer, or mobile money.
                </p>
              </div>
            </div>
          )}
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
            <div className="flex items-center gap-2 mb-1">
              <Shield className="h-4 w-4 text-muted-foreground" />
              <h3 className="text-sm font-medium">API Keys</h3>
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
              <div className="relative">
                <Input
                  type={showPskSecret ? "text" : "password"}
                  placeholder="sk_test_..."
                  value={pskConfig.secretKey}
                  onChange={(e) => setPskConfig({ ...pskConfig, secretKey: e.target.value })}
                  className="text-xs font-mono pr-10"
                />
                <button
                  onClick={() => setShowPskSecret(!showPskSecret)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-secondary rounded"
                >
                  {showPskSecret ? <EyeOff className="h-3 w-3 text-muted-foreground" /> : <Eye className="h-3 w-3 text-muted-foreground" />}
                </button>
              </div>
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
                <span>Copy the Hash value and paste it in the Flutterwave tab above as "Verif Hash"</span>
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
