import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";

import { useAuth } from "@/hooks/use-auth";
import { readResponseBody, errorMessageOf } from "@/lib/api";
import logo from "@/assets/logo.svg";
import { ArrowRight, Loader2, Mail, Lock, UserIcon, AlertCircle, ShieldCheck, KeyRound, CheckCircle2 } from "lucide-react";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

const REMEMBER_KEY = "_afc_remember";

interface AuthProps {
  redirectAfterAuth?: string;
}

type AuthMode = "sign-in" | "sign-up" | "forgot" | "reset" | "verify" | "2fa";

function Auth({ redirectAfterAuth }: AuthProps = {}) {
  const { isLoading: authLoading, isAuthenticated, signIn, refetch } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const refCode = useMemo(() => searchParams.get("ref") || null, [searchParams]);

  // Deep-link tokens: /auth?verify=<token> and /auth?reset=<token> (from emails).
  const verifyToken = useMemo(() => searchParams.get("verify"), [searchParams]);
  const resetToken = useMemo(() => searchParams.get("reset"), [searchParams]);

  // Optional ?returnTo= deep link — only accept same-origin relative paths
  // (reject protocol-relative and backslash-prefixed values to avoid open redirects).
  const returnTo = useMemo(() => {
    const raw = searchParams.get("returnTo");
    if (!raw) return null;
    if (!raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return null;
    return raw;
  }, [searchParams]);
  const redirectPath = returnTo || redirectAfterAuth || "/dashboard";

  const initialMode: AuthMode = verifyToken ? "verify" : resetToken ? "reset" : refCode ? "sign-up" : "sign-in";
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  // Verify deep links start in the loading state — the auto-run effect below
  // only needs to flip it back to false once verification settles.
  const [isLoading, setIsLoading] = useState(initialMode === "verify");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [rememberMe, setRememberMe] = useState(
    () => localStorage.getItem(REMEMBER_KEY) === "true",
  );

  // 2FA challenge state
  const [challengeToken, setChallengeToken] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [useBackupCode, setUseBackupCode] = useState(false);

  // Verify-email auto-run on mount. The loading/reset state is applied inside
  // the async callback (the sanctioned pattern for effects that sync with an
  // external system) rather than synchronously in the effect body.
  useEffect(() => {
    if (mode !== "verify" || !verifyToken || success) return;
    let cancelled = false;
    void (async () => {
      setIsLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/auth/verify-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ token: verifyToken }),
        });
        if (!res.ok) {
          throw new Error(errorMessageOf(await readResponseBody(res), res.status));
        }
        if (!cancelled) {
          setSuccess("Your email has been verified. You can now sign in.");
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Verification failed. The link may be invalid or expired.");
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mode, verifyToken, success]);

  // Mount-side: if already authenticated, redirect immediately
  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      navigate(redirectPath, { replace: true });
    }
  }, [authLoading, isAuthenticated, navigate, redirectPath]);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const formData = new FormData();
      formData.set("email", email);
      formData.set("password", password);
      const result = await signIn("email", formData);

      if (result?.requiresTwoFactor) {
        setChallengeToken(result.challengeToken);
        setCode("");
        setUseBackupCode(false);
        setMode("2fa");
        return;
      }

      navigate(redirectPath, { replace: true });
    } catch (err) {
      console.error("Sign in error:", err);
      setError(err instanceof Error ? err.message : "Invalid email or password.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleTwoFactor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!challengeToken) return;
    setIsLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/auth/2fa/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ challengeToken, code: code.trim() }),
      });
      if (!res.ok) {
        throw new Error(errorMessageOf(await readResponseBody(res), res.status));
      }
      await refetch();
      navigate(redirectPath, { replace: true });
    } catch (err) {
      console.error("2FA error:", err);
      setError(err instanceof Error ? err.message : "Verification failed. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/auth/sign-up/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name, email, password, referralCode: refCode }),
      });

      if (!res.ok) {
        throw new Error(errorMessageOf(await readResponseBody(res), res.status));
      }

      // Auto sign in after sign up
      const formData = new FormData();
      formData.set("email", email);
      formData.set("password", password);
      await signIn("email", formData);

      setSuccess("Account created! Check your inbox to verify your email.");
      navigate(redirectPath, { replace: true });
    } catch (err) {
      console.error("Sign up error:", err);
      setError(err instanceof Error ? err.message : "Registration failed. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email }),
      });
      if (!res.ok) {
        throw new Error(errorMessageOf(await readResponseBody(res), res.status));
      }
      setSuccess("If an account exists for that email, a password reset link has been sent.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ token: resetToken, password }),
      });
      if (!res.ok) {
        throw new Error(errorMessageOf(await readResponseBody(res), res.status));
      }
      setSuccess("Your password has been reset. Please sign in with your new password.");
      setMode("sign-in");
      setPassword("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Password reset failed. The link may be invalid or expired.");
    } finally {
      setIsLoading(false);
    }
  };

  const errorBlock = error ? (
    <div className="flex items-center gap-2 text-sm text-red-500 bg-red-500/5 rounded-md p-2.5">
      <AlertCircle className="h-4 w-4 shrink-0" />
      <span>{error}</span>
    </div>
  ) : null;

  const successBlock = success ? (
    <div className="flex items-center gap-2 text-sm text-green-600 bg-green-500/5 rounded-md p-2.5">
      <CheckCircle2 className="h-4 w-4 shrink-0" />
      <span>{success}</span>
    </div>
  ) : null;

  const header = (title: string, description: string) => (
    <CardHeader className="text-center">
      <div className="flex justify-center">
        <img
          src={logo}
          alt="Logo"
          width={64}
          height={64}
          className="rounded-lg mb-4 mt-4 cursor-pointer"
          onClick={() => navigate("/")}
        />
      </div>
      <CardTitle className="text-xl">{title}</CardTitle>
      <CardDescription>{description}</CardDescription>
    </CardHeader>
  );

  return (
    <div className="min-h-screen flex flex-col relative overflow-hidden">
      {/* Decorative background — dot grid + brand-tinted orbs */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div
          className="absolute inset-0 opacity-[0.03] dark:opacity-[0.05]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)",
            backgroundSize: "48px 48px",
          }}
        />
        <div className="absolute -top-40 -right-40 h-[480px] w-[480px] rounded-full bg-brand/10 blur-[120px]" />
        <div className="absolute -bottom-40 -left-40 h-[420px] w-[420px] rounded-full bg-brand/5 blur-[110px]" />
      </div>
      <div className="flex-1 flex items-center justify-center relative">
        <div className="flex items-center justify-center h-full flex-col w-full px-4">
          <Card className="w-full max-w-[400px] min-w-0 sm:min-w-[350px] pb-0 border shadow-md">
            {mode === "sign-in" && (
              <>
                {header("Welcome Back", "Sign in to your account")}
                <form onSubmit={handleSignIn}>
                  <CardContent className="space-y-4">
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="name@example.com"
                        type="email"
                        className="pl-9"
                        disabled={isLoading}
                        required
                      />
                    </div>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Password"
                        type="password"
                        className="pl-9"
                        disabled={isLoading}
                        required
                        minLength={6}
                      />
                    </div>

                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="remember-me"
                        checked={rememberMe}
                        onCheckedChange={(checked) => {
                          const val = checked === true;
                          setRememberMe(val);
                          if (val) {
                            localStorage.setItem(REMEMBER_KEY, "true");
                          } else {
                            localStorage.removeItem(REMEMBER_KEY);
                          }
                        }}
                        disabled={isLoading}
                      />
                      <Label htmlFor="remember-me" className="text-xs text-muted-foreground cursor-pointer font-normal">
                        Remember me
                      </Label>
                    </div>

                    {errorBlock}

                    <Button type="submit" className="w-full" disabled={isLoading}>
                      {isLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <>
                          Sign In
                          <ArrowRight className="ml-2 h-4 w-4" />
                        </>
                      )}
                    </Button>
                  </CardContent>
                </form>
                <CardFooter className="flex-col gap-2 pb-6">
                  <div className="text-xs text-muted-foreground">
                    <button
                      type="button"
                      onClick={() => { setMode("forgot"); setError(null); setSuccess(null); }}
                      className="underline hover:text-foreground transition-colors"
                    >
                      Forgot password?
                    </button>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Don&apos;t have an account?{" "}
                    <button
                      type="button"
                      onClick={() => { setMode("sign-up"); setError(null); setSuccess(null); }}
                      className="underline hover:text-foreground transition-colors"
                    >
                      Sign up
                    </button>
                  </div>
                </CardFooter>
              </>
            )}

            {mode === "sign-up" && (
              <>
                {header("Create Account", "Join AfriFundedCapital today")}
                <form onSubmit={handleSignUp}>
                  <CardContent className="space-y-4">
                    <div className="relative">
                      <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Full name"
                        type="text"
                        className="pl-9"
                        disabled={isLoading}
                        required
                      />
                    </div>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="name@example.com"
                        type="email"
                        className="pl-9"
                        disabled={isLoading}
                        required
                      />
                    </div>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Password (min 6 characters)"
                        type="password"
                        className="pl-9"
                        disabled={isLoading}
                        required
                        minLength={6}
                      />
                    </div>

                    {errorBlock}
                    {successBlock}

                    <Button type="submit" className="w-full" disabled={isLoading}>
                      {isLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <>
                          Create Account
                          <ArrowRight className="ml-2 h-4 w-4" />
                        </>
                      )}
                    </Button>
                  </CardContent>
                </form>
                <CardFooter className="flex-col gap-2 pb-6">
                  <div className="text-xs text-muted-foreground">
                    Already have an account?{" "}
                    <button
                      type="button"
                      onClick={() => { setMode("sign-in"); setError(null); setSuccess(null); }}
                      className="underline hover:text-foreground transition-colors"
                    >
                      Sign in
                    </button>
                  </div>
                </CardFooter>
              </>
            )}

            {mode === "forgot" && (
              <>
                {header("Reset Password", "Enter your email and we'll send you a reset link")}
                <form onSubmit={handleForgotPassword}>
                  <CardContent className="space-y-4">
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="name@example.com"
                        type="email"
                        className="pl-9"
                        disabled={isLoading}
                        required
                      />
                    </div>
                    {errorBlock}
                    {successBlock}
                    <Button type="submit" className="w-full" disabled={isLoading}>
                      {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Send Reset Link"}
                    </Button>
                  </CardContent>
                </form>
                <CardFooter className="flex-col gap-2 pb-6">
                  <div className="text-xs text-muted-foreground">
                    Remembered it?{" "}
                    <button
                      type="button"
                      onClick={() => { setMode("sign-in"); setError(null); setSuccess(null); }}
                      className="underline hover:text-foreground transition-colors"
                    >
                      Back to sign in
                    </button>
                  </div>
                </CardFooter>
              </>
            )}

            {mode === "reset" && (
              <>
                {header("Choose a New Password", "Enter your new password below")}
                <form onSubmit={handleResetPassword}>
                  <CardContent className="space-y-4">
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="New password (min 6 characters)"
                        type="password"
                        className="pl-9"
                        disabled={isLoading}
                        required
                        minLength={6}
                      />
                    </div>
                    {errorBlock}
                    {successBlock}
                    <Button type="submit" className="w-full" disabled={isLoading}>
                      {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Update Password"}
                    </Button>
                  </CardContent>
                </form>
                <CardFooter className="flex-col gap-2 pb-6">
                  <div className="text-xs text-muted-foreground">
                    <button
                      type="button"
                      onClick={() => { setMode("sign-in"); setError(null); setSuccess(null); }}
                      className="underline hover:text-foreground transition-colors"
                    >
                      Back to sign in
                    </button>
                  </div>
                </CardFooter>
              </>
            )}

            {mode === "verify" && (
              <>
                {header("Verify Your Email", "Confirming your email address")}
                <CardContent className="space-y-4">
                  {isLoading && !success && !error && (
                    <div className="flex flex-col items-center gap-3 py-4">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                      <p className="text-sm text-muted-foreground">Verifying…</p>
                    </div>
                  )}
                  {successBlock}
                  {errorBlock}
                  <Button
                    type="button"
                    className="w-full"
                    onClick={() => { setMode("sign-in"); setError(null); setSuccess(null); }}
                  >
                    Continue to Sign In
                  </Button>
                </CardContent>
              </>
            )}

            {mode === "2fa" && (
              <>
                {header("Two-Factor Authentication", "Enter the code from your authenticator app")}
                <form onSubmit={handleTwoFactor}>
                  <CardContent className="space-y-4">
                    <div className="relative">
                      <ShieldCheck className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        value={code}
                        onChange={(e) => setCode(e.target.value)}
                        placeholder={useBackupCode ? "Backup code" : "6-digit code"}
                        inputMode={useBackupCode ? "text" : "numeric"}
                        className="pl-9 tracking-widest"
                        disabled={isLoading}
                        required
                        maxLength={useBackupCode ? 10 : 6}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => { setUseBackupCode((v) => !v); setCode(""); setError(null); }}
                      className="text-xs text-muted-foreground underline hover:text-foreground transition-colors"
                    >
                      {useBackupCode ? "Use authenticator code instead" : "Use a backup code"}
                    </button>
                    {errorBlock}
                    <Button type="submit" className="w-full" disabled={isLoading || !challengeToken}>
                      {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : (
                        <>
                          Verify
                          <KeyRound className="ml-2 h-4 w-4" />
                        </>
                      )}
                    </Button>
                  </CardContent>
                </form>
                <CardFooter className="flex-col gap-2 pb-6">
                  <div className="text-xs text-muted-foreground">
                    Can&apos;t access your codes?{" "}
                    <button
                      type="button"
                      onClick={() => { setMode("sign-in"); setChallengeToken(null); setError(null); }}
                      className="underline hover:text-foreground transition-colors"
                    >
                      Back to sign in
                    </button>
                  </div>
                </CardFooter>
              </>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

export default function AuthPage(props: AuthProps) {
  return (
    <Suspense>
      <Auth {...props} />
    </Suspense>
  );
}
