import { useState, useEffect, useCallback } from "react";

interface User {
  id: number;
  name?: string | null;
  email?: string | null;
  image?: string | null;
  role?: string | null;
  isAnonymous?: boolean;
  tradingExperience?: string | null;
  country?: string | null;
  timezone?: string | null;
  phone?: string | null;
  onboardingComplete?: boolean;
  kycStatus?: string | null;
  emailNotifications?: boolean;
  notificationPreferences?: Record<string, boolean> | null;
  isDemoSeeded?: boolean;
  referralCode?: string | null;
  emailVerified?: boolean;
  twoFactorEnabled?: boolean;
  [key: string]: unknown;
}

interface Session {
  user: User;
  session: {
    id: string;
    expiresAt: number;
  };
}

interface AuthState {
  isLoading: boolean;
  isAuthenticated: boolean;
  user: User | null;
  error: string | null;
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({
    isLoading: true,
    isAuthenticated: false,
    user: null,
    error: null,
  });

  const fetchSession = useCallback(async () => {
    try {
      setState((s) => ({ ...s, isLoading: true }));
      const res = await fetch("/api/auth/session", {
        credentials: "include",
      });

      if (!res.ok) {
        if (res.status === 401) {
          setState({
            isLoading: false,
            isAuthenticated: false,
            user: null,
            error: null,
          });
          return;
        }
        throw new Error(`Session check failed: ${res.status}`);
      }

      const session: Session = await res.json();
      if (session?.user) {
        setState({
          isLoading: false,
          isAuthenticated: true,
          user: session.user,
          error: null,
        });
      } else {
        setState({
          isLoading: false,
          isAuthenticated: false,
          user: null,
          error: null,
        });
      }
    } catch (err) {
      console.error("useAuth: fetchSession error:", err);
      setState({
        isLoading: false,
        isAuthenticated: false,
        user: null,
        error: err instanceof Error ? err.message : "Session fetch failed",
      });
    }
  }, []);

  // Fetch session on mount
  useEffect(() => {
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (cancelled) return;
      void fetchSession();
    });
    return () => {
      cancelled = true;
    };
  }, [fetchSession]);

  const signIn = useCallback(
    async (provider: string, formData: FormData) => {
      const email = formData.get("email") as string;
      const password = formData.get("password") as string;

      const res = await fetch(`/api/auth/sign-in/${provider}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Sign in failed" }));
        throw new Error(err.message || err.error || "Sign in failed");
      }

      const body = await res.json().catch(() => ({}));

      // 2FA gate: password is correct but the account requires a TOTP/backup
      // code. The caller shows the code screen and finishes via
      // /api/auth/2fa/verify — no session is created yet.
      if (body?.requiresTwoFactor) {
        return {
          requiresTwoFactor: true as const,
          challengeToken: body.challengeToken as string,
          challengeExpiresAt: body.challengeExpiresAt as number | undefined,
        };
      }

      await fetchSession();
      return { requiresTwoFactor: false as const };
    },
    [fetchSession],
  );

  const signOut = useCallback(async () => {
    try {
      await fetch("/api/auth/sign-out", {
        method: "POST",
        credentials: "include",
      });
    } catch (err) {
      console.error("Sign out error:", err);
    }
    setState({
      isLoading: false,
      isAuthenticated: false,
      user: null,
      error: null,
    });
  }, []);

  return {
    isLoading: state.isLoading,
    isAuthenticated: state.isAuthenticated,
    user: state.user,
    error: state.error,
    signIn,
    signOut,
    refetch: fetchSession,
  };
}
