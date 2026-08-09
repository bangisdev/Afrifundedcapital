import { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/use-auth";
import { useApiQuery } from "@/hooks/use-api";
import { api } from "@/lib/api";
import {
  ShieldCheck,
  ShieldOff,
  KeyRound,
  Smartphone,
  Monitor,
  History,
  MailCheck,
  MailWarning,
  Loader2,
  CheckCircle2,
  AlertCircle,
  RefreshCcw,
} from "lucide-react";

interface SessionRow {
  id: string;
  deviceInfo: string | null;
  ipAddress: string | null;
  lastActiveAt: number | null;
  createdAt: number | null;
  expiresAt: number;
  isCurrent: boolean;
}

interface LoginRow {
  id: number;
  ipAddress: string | null;
  deviceInfo: string | null;
  success: boolean;
  failedReason: string | null;
  timestamp: number;
}

function formatTime(ts: number | null): string {
  if (!ts) return "—";
  return new Date(ts).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function deviceLabel(info: string | null): string {
  if (!info) return "Unknown device";
  const ua = info;
  const isMobile = /mobile|android|iphone|ipad/i.test(ua);
  const browser =
    /edg\//i.test(ua) ? "Edge" :
    /chrome/i.test(ua) ? "Chrome" :
    /firefox/i.test(ua) ? "Firefox" :
    /safari/i.test(ua) ? "Safari" : "";
  const os =
    /windows/i.test(ua) ? "Windows" :
    /mac os/i.test(ua) ? "macOS" :
    /android/i.test(ua) ? "Android" :
    /iphone|ipad/i.test(ua) ? "iOS" :
    /linux/i.test(ua) ? "Linux" : "";
  return [isMobile ? "Mobile" : "Desktop", os, browser].filter(Boolean).join(" · ");
}

export function AccountSecurity() {
  const { user, refetch } = useAuth();
  const [message, setMessage] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  // Change password
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);

  // 2FA
  const [setup, setSetup] = useState<{ secret: string; otpauthUrl: string; qrDataUrl: string; backupCodes: string[] } | null>(null);
  const [twoFactorCode, setTwoFactorCode] = useState("");
  const [twoFactorBusy, setTwoFactorBusy] = useState(false);
  const [disableCode, setDisableCode] = useState("");

  // Sessions
  const [sessionsKey, setSessionsKey] = useState(0);
  const sessionsQuery = useApiQuery<any>(["auth", "sessions", String(sessionsKey)], "/api/auth/sessions");
  const sessions: SessionRow[] = sessionsQuery.data?.sessions || [];

  // Login history
  const [historyKey, setHistoryKey] = useState(0);
  const historyQuery = useApiQuery<any>(["auth", "login-history", String(historyKey)], "/api/auth/login-history");
  const history: LoginRow[] = historyQuery.data?.history || [];

  const flash = (kind: "ok" | "err", text: string) => {
    setMessage({ kind, text });
    window.setTimeout(() => setMessage(null), 6000);
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      flash("err", "New passwords do not match.");
      return;
    }
    setChangingPassword(true);
    try {
      await api.post("/api/auth/change-password", { currentPassword, newPassword });
      flash("ok", "Password updated.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      flash("err", err instanceof Error ? err.message : "Failed to update password.");
    } finally {
      setChangingPassword(false);
    }
  };

  const handleSetup2FA = async () => {
    setTwoFactorBusy(true);
    setMessage(null);
    try {
      const data = await api.post<any>("/api/auth/2fa/setup");
      setSetup({ secret: data.secret, otpauthUrl: data.otpauthUrl, qrDataUrl: data.qrDataUrl, backupCodes: data.backupCodes || [] });
    } catch (err) {
      flash("err", err instanceof Error ? err.message : "Failed to start 2FA setup.");
    } finally {
      setTwoFactorBusy(false);
    }
  };

  const handleEnable2FA = async () => {
    if (!setup) return;
    setTwoFactorBusy(true);
    try {
      await api.post("/api/auth/2fa/enable", { code: twoFactorCode.trim() });
      setSetup(null);
      setTwoFactorCode("");
      flash("ok", "Two-factor authentication enabled.");
      void refetch();
    } catch (err) {
      flash("err", err instanceof Error ? err.message : "Failed to enable 2FA.");
    } finally {
      setTwoFactorBusy(false);
    }
  };

  const handleDisable2FA = async () => {
    setTwoFactorBusy(true);
    try {
      await api.post("/api/auth/2fa/disable", { code: disableCode.trim() });
      setDisableCode("");
      flash("ok", "Two-factor authentication disabled.");
      void refetch();
    } catch (err) {
      flash("err", err instanceof Error ? err.message : "Failed to disable 2FA.");
    } finally {
      setTwoFactorBusy(false);
    }
  };

  const handleRevoke = async (sessionId: string) => {
    try {
      await api.post("/api/auth/sessions/revoke", { sessionId });
      setSessionsKey((k) => k + 1);
    } catch (err) {
      flash("err", err instanceof Error ? err.message : "Failed to revoke session.");
    }
  };

  const handleRevokeOthers = async () => {
    try {
      const res = await api.post<any>("/api/auth/sessions/revoke-others");
      setSessionsKey((k) => k + 1);
      flash("ok", `Signed out ${res?.revoked ?? 0} other device(s).`);
    } catch (err) {
      flash("err", err instanceof Error ? err.message : "Failed to sign out other devices.");
    }
  };

  const twoFactorEnabled = !!user?.twoFactorEnabled;
  const emailVerified = !!user?.emailVerified;

  return (
    <div className="space-y-6">
      {message && (
        <div className={`flex items-center gap-2 text-sm rounded-md p-2.5 ${message.kind === "ok" ? "text-green-600 bg-green-500/5" : "text-red-500 bg-red-500/5"}`}>
          {message.kind === "ok" ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <AlertCircle className="h-4 w-4 shrink-0" />}
          <span>{message.text}</span>
        </div>
      )}

      {/* Email verification */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            {emailVerified ? <MailCheck className="h-4 w-4 text-green-600" /> : <MailWarning className="h-4 w-4 text-amber-500" />}
            Email Verification
          </CardTitle>
          <CardDescription>
            {emailVerified
              ? "Your email address is verified."
              : "Verify your email to unlock full account access."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {emailVerified ? (
            <Badge variant="outline" className="text-green-600 border-green-600/40">Verified</Badge>
          ) : (
            <div className="flex items-center gap-3">
              <Badge variant="outline" className="text-amber-600 border-amber-600/40">Pending verification</Badge>
              <Button
                size="sm"
                variant="outline"
                onClick={async () => {
                  try {
                    await api.post("/api/auth/resend-verification", { email: user?.email });
                    flash("ok", "Verification email sent — check your inbox.");
                  } catch (err) {
                    flash("err", err instanceof Error ? err.message : "Failed to resend verification email.");
                  }
                }}
              >
                <RefreshCcw className="h-3.5 w-3.5 mr-1.5" /> Resend email
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Change password */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <KeyRound className="h-4 w-4" /> Change Password
          </CardTitle>
          <CardDescription>Use a strong password you don&apos;t use anywhere else.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleChangePassword} className="space-y-3">
            <Input
              type="password"
              placeholder="Current password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input
                type="password"
                placeholder="New password (min 6 characters)"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                minLength={6}
              />
              <Input
                type="password"
                placeholder="Confirm new password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={6}
              />
            </div>
            <Button type="submit" size="sm" disabled={changingPassword}>
              {changingPassword ? <Loader2 className="h-4 w-4 animate-spin" /> : "Update Password"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Two-factor authentication */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            {twoFactorEnabled ? <ShieldCheck className="h-4 w-4 text-green-600" /> : <ShieldOff className="h-4 w-4 text-muted-foreground" />}
            Two-Factor Authentication
          </CardTitle>
          <CardDescription>
            {twoFactorEnabled
              ? "Your account is protected by a time-based one-time passcode."
              : "Add an extra layer of security with an authenticator app."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!setup && (
            <div className="flex items-center gap-3">
              <Badge variant={twoFactorEnabled ? "default" : "outline"}>
                {twoFactorEnabled ? "Enabled" : "Disabled"}
              </Badge>
              {!twoFactorEnabled && (
                <Button size="sm" onClick={handleSetup2FA} disabled={twoFactorBusy}>
                  {twoFactorBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Smartphone className="h-4 w-4 mr-1.5" />}
                  Enable 2FA
                </Button>
              )}
            </div>
          )}

          {setup && (
            <div className="space-y-4 rounded-lg border p-4">
              <p className="text-sm text-muted-foreground">
                Scan this QR code with your authenticator app (Google Authenticator, Authy, etc.), then enter the 6-digit code to confirm.
              </p>
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="shrink-0">
                  {setup.qrDataUrl ? (
                    <img src={setup.qrDataUrl} alt="2FA QR code" className="rounded border w-[180px] h-[180px]" />
                  ) : (
                    <div className="w-[180px] h-[180px] rounded border flex items-center justify-center text-xs text-muted-foreground p-3 break-all">
                      {setup.otpauthUrl}
                    </div>
                  )}
                </div>
                <div className="flex-1 space-y-3 min-w-0">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Manual entry key</p>
                    <code className="text-xs bg-muted rounded px-2 py-1 break-all select-all">{setup.secret}</code>
                  </div>
                  {setup.backupCodes.length > 0 && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">
                        Backup codes — save these somewhere safe. Each can be used once to sign in.
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {setup.backupCodes.map((bc) => (
                          <code key={bc} className="text-xs bg-muted rounded px-1.5 py-0.5 select-all">{bc}</code>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="flex gap-2">
                    <Input
                      placeholder="6-digit code"
                      value={twoFactorCode}
                      onChange={(e) => setTwoFactorCode(e.target.value)}
                      className="w-40 tracking-widest"
                      inputMode="numeric"
                      maxLength={6}
                    />
                    <Button size="sm" onClick={handleEnable2FA} disabled={twoFactorBusy || twoFactorCode.length !== 6}>
                      {twoFactorBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirm"}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => { setSetup(null); setTwoFactorCode(""); }}>
                      Cancel
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {twoFactorEnabled && !setup && (
            <div className="flex flex-col sm:flex-row sm:items-center gap-2">
              <Input
                placeholder="Enter code to disable"
                value={disableCode}
                onChange={(e) => setDisableCode(e.target.value)}
                className="w-48 tracking-widest"
                inputMode="numeric"
                maxLength={6}
              />
              <Button
                size="sm"
                variant="outline"
                onClick={handleDisable2FA}
                disabled={twoFactorBusy || disableCode.length !== 6}
                className="text-red-600 hover:text-red-600"
              >
                {twoFactorBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Disable 2FA"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Active sessions */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Monitor className="h-4 w-4" /> Active Sessions
            </CardTitle>
            <CardDescription>Devices currently signed in to your account.</CardDescription>
          </div>
          <Button size="sm" variant="outline" onClick={handleRevokeOthers} disabled={sessions.length <= 1}>
            Sign out other devices
          </Button>
        </CardHeader>
        <CardContent>
          {sessionsQuery.isLoading ? (
            <div className="py-6 text-center text-sm text-muted-foreground">Loading sessions…</div>
          ) : sessions.length === 0 ? (
            <div className="py-6 text-center text-sm text-muted-foreground">No active sessions.</div>
          ) : (
            <ul className="divide-y divide-border">
              {sessions.map((s) => (
                <li key={s.id} className="py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <span className="truncate">{deviceLabel(s.deviceInfo)}</span>
                      {s.isCurrent && <Badge className="text-[10px] px-1.5 py-0">This device</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {[s.ipAddress, `Last active ${formatTime(s.lastActiveAt)}`].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  {!s.isCurrent && (
                    <Button size="sm" variant="ghost" className="text-red-600 hover:text-red-600" onClick={() => handleRevoke(s.id)}>
                      Sign out
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Login history */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <History className="h-4 w-4" /> Recent Sign-ins
          </CardTitle>
          <CardDescription>Recent login attempts on your account.</CardDescription>
        </CardHeader>
        <CardContent>
          {historyQuery.isLoading ? (
            <div className="py-6 text-center text-sm text-muted-foreground">Loading…</div>
          ) : history.length === 0 ? (
            <div className="py-6 text-center text-sm text-muted-foreground">No sign-in history yet.</div>
          ) : (
            <ul className="divide-y divide-border">
              {history.map((h) => (
                <li key={h.id} className="py-2.5 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-sm">
                      <span
                        className={`inline-block h-1.5 w-1.5 rounded-full shrink-0 ${h.success ? "bg-green-500" : "bg-red-500"}`}
                      />
                      <span className="truncate">{deviceLabel(h.deviceInfo)}</span>
                    </div>
                    <p className="text-xs text-muted-foreground pl-3.5">
                      {[h.ipAddress, formatTime(h.timestamp), h.failedReason ? `Reason: ${h.failedReason}` : ""]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                  <Badge variant={h.success ? "outline" : "destructive"} className="shrink-0 text-[10px]">
                    {h.success ? "Success" : "Failed"}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
