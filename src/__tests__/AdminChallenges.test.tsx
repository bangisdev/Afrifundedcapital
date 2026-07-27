// @vitest-environment jsdom
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

vi.mock("@/components/ui/alert-dialog", () => ({
  AlertDialog: ({ open, onOpenChange, children }: any) => { if (!open) return null; return <div data-testid="alert-dialog">{children}</div>; },
  AlertDialogContent: ({ children }: any) => <div>{children}</div>,
  AlertDialogHeader: ({ children }: any) => <div>{children}</div>,
  AlertDialogTitle: ({ children }: any) => <h2>{children}</h2>,
  AlertDialogDescription: ({ children }: any) => <p>{children}</p>,
  AlertDialogFooter: ({ children }: any) => <div>{children}</div>,
  AlertDialogCancel: ({ children }: any) => <button data-testid="alert-cancel">{children}</button>,
  AlertDialogAction: ({ children, onClick }: any) => <button data-testid="alert-confirm" onClick={onClick}>{children}</button>,
}));

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import AdminChallenges from "@/pages/admin/AdminChallenges";

function clearAll() { Object.keys(queryDataMap).forEach((k) => delete queryDataMap[k]); }
function setQueryData(updates: Record<string, any>) { clearAll(); Object.assign(queryDataMap, { "admin/templates": [], "admin/allChallenges": [], ...updates }); }

describe("AdminChallenges Page", () => {
  beforeEach(() => { clearAll(); vi.clearAllMocks(); mockFetch.mockResolvedValue({ ok: true, json: async () => ({ message: "ok" }) }); });

  describe("Loading State", () => {
    it("shows spinner when loading", () => { clearAll(); const { container } = render(<AdminChallenges />); expect(container.querySelector(".animate-spin")).toBeTruthy(); });
  });

  describe("Page Header", () => {
    it("renders title", () => { setQueryData({}); render(<AdminChallenges />); expect(screen.getByText("Challenge Management")).toBeTruthy(); });
  });

  describe("Stats Cards", () => {
    it("renders all four stat cards", () => {
      setQueryData({}); render(<AdminChallenges />);
      expect(screen.getByText("Templates")).toBeTruthy();
      expect(screen.getByText("Active Challenges")).toBeTruthy();
      expect(screen.getByText("Funded Traders")).toBeTruthy();
      expect(screen.getByText("Revenue")).toBeTruthy();
    });
  });

  describe("Templates Tab", () => {
    it("shows template list", () => {
      setQueryData({ "admin/templates": [
        { id: 1, name: "Two-Step Pro", type: "two_step", isActive: true, profitTarget: 8, dailyDrawdown: 5, maxDrawdown: 10, maxLeverage: 100, minTradingDays: 5, maxTradingDays: null, maxPositionSize: null, consistencyTarget: null, allowWeekendHolding: false, allowNewsTrading: true, allowEATrading: true, allowCopyTrading: false, price: 50000, currency: "NGN", durationDays: 30, resetFee: null, extensionFee: null, scalingPlan: null, maxAccountSize: null, createdBy: 1, createdAt: Date.now(), updatedAt: Date.now(), description: "Pro challenge" },
      ]}); render(<AdminChallenges />);
      expect(screen.getByText("Two-Step Pro")).toBeTruthy();
      expect(screen.getByText("Active")).toBeTruthy();
    });
    it("shows empty state when no templates", () => {
      setQueryData({ "admin/templates": [] }); render(<AdminChallenges />);
      expect(screen.getByText(/No templates yet/)).toBeTruthy();
    });
    it("has New Template button", () => {
      setQueryData({}); render(<AdminChallenges />);
      expect(screen.getByText("New Template")).toBeTruthy();
    });
  });

  describe("Challenges Tab", () => {
    it("switches to challenges tab", async () => {
      const user = userEvent.setup();
      setQueryData({ "admin/allChallenges": [
        { id: 1, userId: 1, accountSize: 50000, amountPaid: 50000, status: "active", createdAt: Date.now() },
      ]}); render(<AdminChallenges />);
      await user.click(screen.getByText(/All Challenges/));
      // After switching, the challenges table should be visible
      expect(screen.getByText("User 1")).toBeTruthy();
      expect(screen.getByText(/active/)).toBeTruthy();
    });
  });

  describe("Full Integration", () => {
    it("renders complete page", () => {
      setQueryData({}); render(<AdminChallenges />);
      expect(screen.getByText("Challenge Management")).toBeTruthy();
      expect(screen.getByText("Templates")).toBeTruthy();
    });
  });
});
