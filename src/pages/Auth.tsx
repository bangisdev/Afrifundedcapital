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
import logo from "@/assets/logo.svg";
import { ArrowRight, Loader2, Mail, Lock, UserIcon, AlertCircle } from "lucide-react";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

const REMEMBER_KEY = "_afc_remember";

interface AuthProps {
  redirectAfterAuth?: string;
}

function Auth({ redirectAfterAuth }: AuthProps = {}) {
  const { isLoading: authLoading, isAuthenticated, signIn, error: authError } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const refCode = useMemo(() => searchParams.get("ref") || null, [searchParams]);
  const [mode, setMode] = useState<"sign-in" | "sign-up">(refCode ? "sign-up" : "sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rememberMe, setRememberMe] = useState(
    () => localStorage.getItem(REMEMBER_KEY) === "true",
  );

  // Mount-side: if already authenticated, redirect immediately
  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      const redirect = redirectAfterAuth || "/dashboard";
      navigate(redirect, { replace: true });
    }
  }, [authLoading, isAuthenticated, navigate, redirectAfterAuth]);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.set("email", email);
      formData.set("password", password);
      await signIn("email", formData);

      const redirect = redirectAfterAuth || "/dashboard";
      navigate(redirect, { replace: true });
    } catch (err) {
      console.error("Sign in error:", err);
      setError(err instanceof Error ? err.message : "Invalid email or password.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/sign-up/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name, email, password, referralCode: refCode }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Sign up failed" }));
        throw new Error(err.message || err.error || "Sign up failed");
      }

      // Auto sign in after sign up
      const formData = new FormData();
      formData.set("email", email);
      formData.set("password", password);
      await signIn("email", formData);

      const redirect = redirectAfterAuth || "/dashboard";
      navigate(redirect, { replace: true });
    } catch (err) {
      console.error("Sign up error:", err);
      setError(err instanceof Error ? err.message : "Registration failed. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      <div className="flex-1 flex items-center justify-center">
        <div className="flex items-center justify-center h-full flex-col">
          <Card className="min-w-[350px] pb-0 border shadow-md">
            {mode === "sign-in" ? (
              <>
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
                  <CardTitle className="text-xl">Welcome Back</CardTitle>
                  <CardDescription>
                    Sign in to your account
                  </CardDescription>
                </CardHeader>
                <form onSubmit={handleSignIn}>
                  <CardContent className="space-y-4">
                    <div className="relative">
                      <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
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
                      <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
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

                    {error && (
                      <div className="flex items-center gap-2 text-sm text-red-500 bg-red-500/5 rounded-md p-2.5">
                        <AlertCircle className="h-4 w-4 shrink-0" />
                        <span>{error}</span>
                      </div>
                    )}

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
                    Don&apos;t have an account?{" "}
                    <button
                      type="button"
                      onClick={() => { setMode("sign-up"); setError(null); }}
                      className="underline hover:text-foreground transition-colors"
                    >
                      Sign up
                    </button>
                  </div>
                </CardFooter>
              </>
            ) : (
              <>
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
                  <CardTitle className="text-xl">Create Account</CardTitle>
                  <CardDescription>
                    Join AfriFundedCapital today
                  </CardDescription>
                </CardHeader>
                <form onSubmit={handleSignUp}>
                  <CardContent className="space-y-4">
                    <div className="relative">
                      <UserIcon className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
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
                      <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
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
                      <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
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

                    {error && (
                      <div className="flex items-center gap-2 text-sm text-red-500 bg-red-500/5 rounded-md p-2.5">
                        <AlertCircle className="h-4 w-4 shrink-0" />
                        <span>{error}</span>
                      </div>
                    )}

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
                      onClick={() => { setMode("sign-in"); setError(null); }}
                      className="underline hover:text-foreground transition-colors"
                    >
                      Sign in
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
