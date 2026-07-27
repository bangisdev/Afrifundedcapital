// @vitest-environment jsdom
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/hooks/use-auth", () => ({
  useAuth: vi.fn(() => ({ isLoading: false, isAuthenticated: true, user: { id: 1, role: "super_admin" }, error: null, signIn: vi.fn(), signOut: vi.fn(), refetch: vi.fn() })),
}));

const queryDataMap: Record<string, any> = {};
vi.mock("@/hooks/use-api", () => ({
  useApiQuery: vi.fn((key: string[]) => {
    const dataKey = `${key.join("/")}`;
    if (queryDataMap[dataKey] === undefined) return { data: undefined, isLoading: true, refetch: vi.fn() };
    return { data: queryDataMap[dataKey], isLoading: false, refetch: vi.fn() };
  }),
  useApiMutation: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
}));

import AdminPayouts from "@/pages/admin/AdminPayouts";

function clearAll() { Object.keys(queryDataMap).forEach((k) => delete queryDataMap[k]); }
function setQueryData(updates: Record<string, any>) { clearAll(); Object.assign(queryDataMap, { "admin/payouts": [], ...updates }); }

describe("AdminPayouts Page", () => {
  beforeEach(() => { clearAll(); vi.clearAllMocks(); });

  describe("Loading State", () => {
    it("shows spinner when loading", () => { clearAll(); const { container } = render(<AdminPayouts />); expect(container.querySelector(".animate-spin")).toBeTruthy(); });
  });

  describe("Page Header", () => {
    it("renders title", () => { setQueryData({}); render(<AdminPayouts />); expect(screen.getByText("Payouts")).toBeTruthy(); });
    it("shows payout count", () => {
      setQueryData({ "admin/payouts": [
        { id: 1, amount: 50000, status: "pending", userId: 1, paymentMethod: "bank", requestedAt: Date.now() },
      ]}); render(<AdminPayouts />);
      expect(screen.getByText("1 payout requests")).toBeTruthy();
    });
  });

  describe("Payout List", () => {
    it("shows payout with amount and status", () => {
      setQueryData({ "admin/payouts": [
        { id: 1, amount: 75000, status: "pending", userId: 1, paymentMethod: "bank", requestedAt: Date.now() },
      ]}); render(<AdminPayouts />);
      expect(screen.getByText(/75,000/)).toBeTruthy();
      expect(screen.getByText("pending")).toBeTruthy();
    });
    it("shows Approve and Reject buttons for pending payouts", () => {
      setQueryData({ "admin/payouts": [
        { id: 1, amount: 50000, status: "pending", userId: 1, paymentMethod: "bank", requestedAt: Date.now() },
      ]}); render(<AdminPayouts />);
      expect(screen.getByText("Approve")).toBeTruthy();
      expect(screen.getByText("Reject")).toBeTruthy();
    });
    it("hides action buttons for paid payouts", () => {
      setQueryData({ "admin/payouts": [
        { id: 1, amount: 50000, status: "paid", userId: 1, paymentMethod: "bank", requestedAt: Date.now() },
      ]}); render(<AdminPayouts />);
      expect(screen.queryByText("Approve")).toBeNull();
    });
    it("shows empty state", () => {
      setQueryData({ "admin/payouts": [] }); render(<AdminPayouts />);
      expect(screen.getByText("No payout requests")).toBeTruthy();
    });
  });

  describe("Full Integration", () => {
    it("renders complete page", () => {
      setQueryData({}); render(<AdminPayouts />);
      expect(screen.getByText("Payouts")).toBeTruthy();
      expect(screen.getByText("0 payout requests")).toBeTruthy();
    });
  });
});
