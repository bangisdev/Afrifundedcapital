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
  onSuccess?: () => void,
) {
  const queryClient = useQueryClient();

  return useMutation<R, Error, T>({
    mutationFn: (body) => {
      if (method === "post") return api.post<R>(path, body);
      if (method === "put") return api.put<R>(path, body);
      return api.delete<R>(path);
    },
    onSuccess: () => {
      queryClient.invalidateQueries();
      onSuccess?.();
    },
  });
}

// ═══════════════════════════════════════════════
//  AUTH HOOKS
// ═══════════════════════════════════════════════

export function useSession() {
  return useApiQuery<any>(["session"], "/auth/session", { enabled: false });
}

export function useSignIn() {
  return useMutation<any, Error, { email: string; password: string }>({
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
  return useMutation<any, Error, { name: string; email: string; password: string }>({
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
