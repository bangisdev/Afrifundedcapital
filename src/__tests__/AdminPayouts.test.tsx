// @vitest-environment jsdom
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { useApiQuery } from "@/hooks/use-api";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/hooks/use-auth", () => ({
  useAuth: vi.fn(() => ({ isLoading: false, isAuthenticated: true, user: { id: 1, role: "super_admin" }, error: null, signIn: vi.fn(), signOut: vi.fn(), refetch: vi.fn() })),
}));

const queryDataMap: Record<string, any> = {};
vi.mock("@/hooks/use-api", () => ({
  useApiQuery: vi.fn((key: string[]) => {
    // The page keys payouts queries as ["admin","payouts",queryParams] where queryParams
    // is a query string — resolve by base path so sort/filter variants all match.
    const dataKey = `${key.join("/")}`.split("?")[0].replace(/\/+$/, "");
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
      expect(screen.getByText("1 total · 1 pending")).toBeTruthy();
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

  describe("Sortable Headers", () => {
    it("renders sortable column headers with the default column active", () => {
      setQueryData({ "admin/payouts": [
        { id: 1, amount: 75000, status: "pending", userId: 1, paymentMethod: "bank", requestedAt: Date.now() },
      ]}); render(<AdminPayouts />);

      for (const label of ["Amount", "Status", "Method", "Requested", "Processed"]) {
        expect(screen.getByRole("button", { name: `Sort by ${label}` })).toBeTruthy();
      }
      // Default sort is requestedAt desc → Requested is active
      expect(screen.getByRole("button", { name: "Sort by Requested" }).getAttribute("aria-pressed")).toBe("true");
    });

    it("calls the API with sortBy/sortOrder when a header is clicked", async () => {
      const user = userEvent.setup();
      setQueryData({ "admin/payouts": [
        { id: 1, amount: 75000, status: "pending", userId: 1, paymentMethod: "bank", requestedAt: Date.now() },
      ]}); render(<AdminPayouts />);

      await user.click(screen.getByRole("button", { name: "Sort by Amount" }));

      const calls = vi.mocked(useApiQuery).mock.calls;
      const payoutsCall = calls.find((c) => String(c[1]).includes("/api/payouts/admin/all?") && String(c[1]).includes("sortBy=amount"));
      expect(payoutsCall).toBeTruthy();
      expect(String(payoutsCall![1])).toContain("sortOrder=desc");
      expect(screen.getByRole("button", { name: "Sort by Amount" }).getAttribute("aria-pressed")).toBe("true");
    });

    it("toggles to ascending when the active column is clicked again", async () => {
      const user = userEvent.setup();
      setQueryData({ "admin/payouts": [
        { id: 1, amount: 75000, status: "pending", userId: 1, paymentMethod: "bank", requestedAt: Date.now() },
      ]}); render(<AdminPayouts />);

      await user.click(screen.getByRole("button", { name: "Sort by Amount" }));
      await user.click(screen.getByRole("button", { name: "Sort by Amount" }));

      const calls = vi.mocked(useApiQuery).mock.calls;
      const ascCall = calls.find((c) => String(c[1]).includes("/api/payouts/admin/all?") && String(c[1]).includes("sortBy=amount&sortOrder=asc"));
      expect(ascCall).toBeTruthy();
    });
  });

  describe("Full Integration", () => {
    it("renders complete page", () => {
      setQueryData({}); render(<AdminPayouts />);
      expect(screen.getByText("Payouts")).toBeTruthy();
      expect(screen.getByText("0 total · 0 pending")).toBeTruthy();
    });
  });
});
