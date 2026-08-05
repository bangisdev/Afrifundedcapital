import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

// ═══════════════════════════════════════════════
//  GENERIC HOOKS
// ═══════════════════════════════════════════════

export function useApiQuery<T>(
  key: string[],
  path: string,
  options?: { enabled?: boolean },
) {
  return useQuery<T>({
    queryKey: key,
    queryFn: () => api.get<T>(path),
    enabled: options?.enabled,
  });
}

export function useApiMutation<T, R = void>(
  method: "post" | "put" | "delete",
  path: string,
  options?: {
    /**
     * Query keys to invalidate after a successful mutation. When omitted the
     * legacy behavior is kept (invalidate EVERY query, which refetches all
     * page queries and can cause heavy re-render storms on data-heavy pages).
     * Pass an empty array to skip invalidation entirely.
     */
    invalidateKeys?: Array<Array<string | number>>;
    onSuccess?: () => void;
  },
) {
  const queryClient = useQueryClient();

  return useMutation<R, Error, T>({
    mutationFn: (body) => {
      if (method === "post") return api.post<R>(path, body);
      if (method === "put") return api.put<R>(path, body);
      return api.delete<R>(path);
    },
    onSuccess: () => {
      if (options?.invalidateKeys) {
        // Scoped: refresh exactly the queries that depend on this mutation
        // (empty array = refresh nothing). Query keys match by prefix, so a
        // key like ["admin", "mt5"] covers every paginated list under it.
        for (const key of options.invalidateKeys) {
          queryClient.invalidateQueries({ queryKey: key });
        }
      } else {
        // Legacy default for callers that rely on a full cache refresh.
        queryClient.invalidateQueries();
      }
      options?.onSuccess?.();
    },
  });
}

// ═══════════════════════════════════════════════
//  AUTH HOOKS
// ═══════════════════════════════════════════════

interface SessionData {
  user: Record<string, unknown>;
  session: { id: string; expiresAt: number };
}

export function useSession() {
  return useApiQuery<SessionData | null>(["session"], "/auth/session", { enabled: false });
}

export function useSignIn() {
  return useMutation<Record<string, unknown>, Error, { email: string; password: string }>({
    mutationFn: async (body) => {
      const res = await fetch("/api/auth/sign-in/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Sign in failed");
      }
      return res.json();
    },
  });
}

export function useSignUp() {
  return useMutation<Record<string, unknown>, Error, { name: string; email: string; password: string }>({
    mutationFn: async (body) => {
      const res = await fetch("/api/auth/sign-up/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Sign up failed");
      }
      return res.json();
    },
  });
}

export function useSignOut() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      await fetch("/api/auth/sign-out", {
        method: "POST",
        credentials: "include",
      });
    },
    onSuccess: () => {
      queryClient.clear();
    },
  });
}
