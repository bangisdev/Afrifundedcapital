/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Compatibility shim for `convex/react` imports.
 * Pages that import `useQuery` / `useMutation` / `useAction` / `useConvexAuth` from
 * `convex/react` will resolve here while being progressively migrated to the new API.
 *
 * These hooks return empty/default values at runtime. They will NOT fetch real data.
 */

import { useCallback } from "react";
import { api } from "./_generated/api";

// ── useQuery ──────────────────────────────────────────────────────────
// Mimics Convex's useQuery(api.module.fn, args). Always returns undefined
// (loading) or null (no data). Real data comes after migration.
export function useQuery(_queryRef: any, _args?: any): any {
  return undefined;
}

// ── useMutation ────────────────────────────────────────────────────────
// Mimics Convex's useMutation(api.module.fn). Returns a no-op mutate function.
export function useMutation(mutationRef: any): any {
  return useCallback(async (_args?: any) => {
    console.warn(
      "[convex-shim] useMutation called — no backend connected. Mutation:",
      mutationRef?.name,
    );
    return null;
  }, [mutationRef]);
}

// ── useAction ──────────────────────────────────────────────────────────
// Mimics Convex's useAction(api.module.fn). Returns a no-op action function.
export function useAction(actionRef: any): any {
  return useCallback(async (_args?: any) => {
    console.warn(
      "[convex-shim] useAction called — no backend connected. Action:",
      actionRef?.name,
    );
    return null;
  }, [actionRef]);
}

// ── useConvexAuth ──────────────────────────────────────────────────────
// Mimics Convex's useConvexAuth(). Returns default auth state.
// Real auth is handled by use-auth.ts with Better Auth.
export function useConvexAuth(): {
  isLoading: boolean;
  isAuthenticated: boolean;
  isLoggedIn: boolean;
} {
  return {
    isLoading: false,
    isAuthenticated: false,
    isLoggedIn: false,
  };
}

export { api };
