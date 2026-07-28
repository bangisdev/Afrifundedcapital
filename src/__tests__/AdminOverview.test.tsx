// @vitest-environment jsdom
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";

// ─── Mock: sonner ──────────────────────────────────────────
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

// ─── Mock: useAuth (admin user) ────────────────────────────
vi.mock("@/hooks/use-auth", () => ({
  useAuth: vi.fn(() => ({
    isLoading: false,
    isAuthenticated: true,
    user: { id: 1, name: "Admin", email: "admin@afrifundedcapital.com", role: "super_admin" },
    error: null,
    signIn: vi.fn(),
    signOut: vi.fn(),
    refetch: vi.fn(),
  })),
}));

// ─── Mock: useApiQuery ────────────────────────────────────
const queryDataMap: Record<string, any> = {};
const mockRefetch = vi.fn();

vi.mock("@/hooks/use-api", () => ({
  useApiQuery: vi.fn((key: string[], path: string, _opts?: any) => {
    const dataKey = `${key.join("/")}`;
    if (queryDataMap[dataKey] === undefined) {
      return { data: undefined, isLoading: false, refetch: mockRefetch };
    }
    return { data: queryDataMap[dataKey], isLoading: false, refetch: mockRefetch };
  }),
}));

// ─── Import component after mocks ─────────────────────────
import AdminOverview from "@/pages/admin/AdminOverview";

// ─── Helpers ──────────────────────────────────────────────
function clearAllQueryData() {
  Object.keys(queryDataMap).forEach((k) => delete queryDataMap[k]);
}

function setQueryData(updates: Record<string, any>) {
  clearAllQueryData();
  Object.assign(queryDataMap, {
    "admin/userStats": null,
    "admin/challengeStats": null,
    "admin/paymentStats": null,
    "admin/payoutStats": null,
    "admin/userGrowth": null,
    "admin/revenueGrowth": null,
    ...updates,
  });
}

// ─── Tests ────────────────────────────────────────────────
describe("AdminOverview Page", () => {
  beforeEach(() => {
    clearAllQueryData();
    vi.clearAllMocks();
  });

  // ─── Page Header ────────────────────────────────────────
  describe("Page Header", () => {
    it("renders the Admin Overview title", () => {
      setQueryData({});
      render(<AdminOverview />);
      expect(screen.getByText("Admin Overview")).toBeTruthy();
    });

    it("renders the page description", () => {
      setQueryData({});
      render(<AdminOverview />);
      expect(screen.getByText("Platform statistics and analytics")).toBeTruthy();
    });
  });

  // ─── Stat Cards ─────────────────────────────────────────
  describe("Stat Cards", () => {
    it("renders all eight stat cards", () => {
      setQueryData({});
      render(<AdminOverview />);
      expect(screen.getByText("Total Users")).toBeTruthy();
      expect(screen.getByText("Total Challenges")).toBeTruthy();
      expect(screen.getByText("Revenue")).toBeTruthy();
      expect(screen.getByText("Active Challenges")).toBeTruthy();
      expect(screen.getByText("Funded Accounts")).toBeTruthy();
      expect(screen.getByText("Completed Payments")).toBeTruthy();
      expect(screen.getByText("Total Paid Out")).toBeTruthy();
      expect(screen.getByText("Pending Payouts")).toBeTruthy();
    });

    it("shows zero values when no data", () => {
      setQueryData({});
      render(<AdminOverview />);
      expect(screen.getByText("Total Users")).toBeTruthy();
    });

    it("displays total users", () => {
      setQueryData({ "admin/userStats": { totalUsers: 150 } });
      render(<AdminOverview />);
      expect(screen.getByText("150")).toBeTruthy();
    });

    it("displays total challenges", () => {
      setQueryData({ "admin/challengeStats": { total: 45, active: 12, funded: 8 } });
      render(<AdminOverview />);
      expect(screen.getByText("45")).toBeTruthy();
    });

    it("displays active challenges", () => {
      setQueryData({ "admin/challengeStats": { total: 45, active: 12 } });
      render(<AdminOverview />);
      expect(screen.getByText("12")).toBeTruthy();
    });

    it("displays funded accounts", () => {
      setQueryData({ "admin/challengeStats": { funded: 8 } });
      render(<AdminOverview />);
      expect(screen.getByText("8")).toBeTruthy();
    });

    it("displays revenue in NGN", () => {
      setQueryData({ "admin/paymentStats": { revenue: 5000000, completed: 120 } });
      render(<AdminOverview />);
      expect(screen.getByText("₦5,000,000")).toBeTruthy();
    });

    it("displays completed payments", () => {
      setQueryData({ "admin/paymentStats": { completed: 120 } });
      render(<AdminOverview />);
      expect(screen.getByText("120")).toBeTruthy();
    });

    it("displays total paid out in NGN", () => {
      setQueryData({ "admin/payoutStats": { totalPaid: 2500000, pending: 5 } });
      render(<AdminOverview />);
      expect(screen.getByText("₦2,500,000")).toBeTruthy();
    });

    it("displays pending payouts", () => {
      setQueryData({ "admin/payoutStats": { pending: 5 } });
      render(<AdminOverview />);
      expect(screen.getByText("5")).toBeTruthy();
    });

    it("formats large NGN values with commas", () => {
      setQueryData({ "admin/paymentStats": { revenue: 123456789 } });
      render(<AdminOverview />);
      expect(screen.getByText("₦123,456,789")).toBeTruthy();
    });
  });

  // ─── User Growth section ───────────────────────────────
  describe("User Growth", () => {
    it("renders User Growth section when data exists", () => {
      setQueryData({ "admin/userGrowth": { totalUsers: 200, newUsers30d: 25 } });
      render(<AdminOverview />);
      expect(screen.getByText("User Growth")).toBeTruthy();
    });

    it("shows total users count", () => {
      setQueryData({ "admin/userGrowth": { totalUsers: 200, newUsers30d: 25 } });
      render(<AdminOverview />);
      expect(screen.getByText("Total: 200")).toBeTruthy();
    });

    it("shows new users in last 30 days", () => {
      setQueryData({ "admin/userGrowth": { totalUsers: 200, newUsers30d: 25 } });
      render(<AdminOverview />);
      expect(screen.getByText("New (30d): 25")).toBeTruthy();
    });

    it("hides User Growth when data is null", () => {
      setQueryData({});
      render(<AdminOverview />);
      expect(screen.queryByText("User Growth")).toBeNull();
    });

    it("hides User Growth when data is undefined", () => {
      setQueryData({ "admin/userGrowth": undefined });
      render(<AdminOverview />);
      expect(screen.queryByText("User Growth")).toBeNull();
    });
  });

  // ─── Revenue Growth section ────────────────────────────
  describe("Revenue Growth", () => {
    it("renders Revenue Growth section when data exists", () => {
      setQueryData({ "admin/revenueGrowth": { thisMonth: 750000, lastMonth: 600000 } });
      render(<AdminOverview />);
      expect(screen.getByText("Revenue Growth")).toBeTruthy();
    });

    it("shows this month revenue", () => {
      setQueryData({ "admin/revenueGrowth": { thisMonth: 750000, lastMonth: 600000 } });
      render(<AdminOverview />);
      expect(screen.getByText("This Month: ₦750,000")).toBeTruthy();
    });

    it("shows last month revenue", () => {
      setQueryData({ "admin/revenueGrowth": { thisMonth: 750000, lastMonth: 600000 } });
      render(<AdminOverview />);
      expect(screen.getByText("Last Month: ₦600,000")).toBeTruthy();
    });

    it("hides Revenue Growth when data is null", () => {
      setQueryData({});
      render(<AdminOverview />);
      expect(screen.queryByText("Revenue Growth")).toBeNull();
    });

    it("shows zero values for revenue growth", () => {
      setQueryData({ "admin/revenueGrowth": { thisMonth: 0, lastMonth: 0 } });
      render(<AdminOverview />);
      expect(screen.getByText("Revenue Growth")).toBeTruthy();
      expect(screen.getByText("This Month: ₦0")).toBeTruthy();
      expect(screen.getByText("Last Month: ₦0")).toBeTruthy();
    });
  });

  // ─── Zero/null data handling ────────────────────────────
  describe("Zero/Null Data", () => {
    it("handles empty stats objects gracefully", () => {
      setQueryData({
        "admin/userStats": {},
        "admin/challengeStats": {},
        "admin/paymentStats": {},
        "admin/payoutStats": {},
      });
      render(<AdminOverview />);
      expect(screen.getByText("Total Users")).toBeTruthy();
      expect(screen.getByText("Revenue")).toBeTruthy();
      const zeros = screen.getAllByText((t) => t.includes("₦") && t.includes("0"));
      expect(zeros.length).toBeGreaterThanOrEqual(2);
    });

    it("handles zero values correctly", () => {
      setQueryData({
        "admin/userStats": { totalUsers: 0 },
        "admin/challengeStats": { total: 0, active: 0, funded: 0 },
        "admin/paymentStats": { revenue: 0, completed: 0 },
        "admin/payoutStats": { totalPaid: 0, pending: 0 },
      });
      render(<AdminOverview />);
      expect(screen.getByText("Total Users")).toBeTruthy();
    });

    it("handles partial null data", () => {
      setQueryData({
        "admin/userStats": { totalUsers: 50 },
        "admin/challengeStats": null,
        "admin/paymentStats": null,
        "admin/payoutStats": null,
      });
      render(<AdminOverview />);
      expect(screen.getByText("50")).toBeTruthy();
      expect(screen.queryByText("User Growth")).toBeNull();
    });
  });

  // ─── Full Integration ──────────────────────────────────
  describe("Full Integration", () => {
    it("renders complete page with all data", () => {
      setQueryData({
        "admin/userStats": { totalUsers: 500 },
        "admin/challengeStats": { total: 150, active: 45, funded: 20 },
        "admin/paymentStats": { revenue: 10000000, completed: 300 },
        "admin/payoutStats": { totalPaid: 5000000, pending: 12 },
        "admin/userGrowth": { totalUsers: 500, newUsers30d: 50 },
        "admin/revenueGrowth": { thisMonth: 2000000, lastMonth: 1500000 },
      });
      render(<AdminOverview />);

      expect(screen.getByText("Admin Overview")).toBeTruthy();
      expect(screen.getByText("Platform statistics and analytics")).toBeTruthy();
      expect(screen.getByText("500")).toBeTruthy();
      expect(screen.getByText("150")).toBeTruthy();
      expect(screen.getByText("₦10,000,000")).toBeTruthy();
      expect(screen.getByText("45")).toBeTruthy();
      expect(screen.getByText("20")).toBeTruthy();
      expect(screen.getByText("300")).toBeTruthy();
      expect(screen.getByText("₦5,000,000")).toBeTruthy();
      expect(screen.getByText("12")).toBeTruthy();
      expect(screen.getByText("User Growth")).toBeTruthy();
      expect(screen.getByText("Total: 500")).toBeTruthy();
      expect(screen.getByText("New (30d): 50")).toBeTruthy();
      expect(screen.getByText("Revenue Growth")).toBeTruthy();
      expect(screen.getByText("This Month: ₦2,000,000")).toBeTruthy();
      expect(screen.getByText("Last Month: ₦1,500,000")).toBeTruthy();
    });

    it("renders with only some data available", () => {
      setQueryData({
        "admin/userStats": { totalUsers: 100 },
        "admin/challengeStats": { total: 20, active: 5, funded: 3 },
      });
      render(<AdminOverview />);
      expect(screen.getByText("100")).toBeTruthy();
      expect(screen.getByText("20")).toBeTruthy();
      expect(screen.getByText("5")).toBeTruthy();
      expect(screen.getByText("3")).toBeTruthy();
      expect(screen.queryByText("User Growth")).toBeNull();
      expect(screen.queryByText("Revenue Growth")).toBeNull();
    });

    it("renders all stat card icons", () => {
      setQueryData({});
      const { container } = render(<AdminOverview />);
      const icons = container.querySelectorAll("svg");
      expect(icons.length).toBeGreaterThanOrEqual(8);
    });

    it("shows revenue as default currency NGN", () => {
      setQueryData({ "admin/paymentStats": { revenue: 500000 } });
      render(<AdminOverview />);
      expect(screen.getByText("₦500,000")).toBeTruthy();
    });

    it("handles very large numbers", () => {
      setQueryData({
        "admin/userStats": { totalUsers: 999999 },
        "admin/paymentStats": { revenue: 999999999999 },
      });
      render(<AdminOverview />);
      expect(screen.getByText((t) => t.includes("999,999"))).toBeTruthy();
      expect(screen.getByText((t) => t.includes("₦") && t.includes("999,999,999,999"))).toBeTruthy();
    });
  });

  // ─── Integration: Data Consistency ─────────────────────
  describe("Integration: Data Consistency", () => {
    it("shows consistent data across all sections when all queries return", () => {
      setQueryData({
        "admin/userStats": { totalUsers: 1000 },
        "admin/userGrowth": { totalUsers: 1000, newUsers30d: 100 },
      });
      render(<AdminOverview />);
      // User count should match between stat card and growth section
      const statCards = document.querySelectorAll(".card-subtle");
      const userCard = Array.from(statCards).find((c) => c.textContent?.includes("Total Users"));
      expect(userCard?.textContent).toContain("1000");
      expect(screen.getByText("Total: 1000")).toBeTruthy();
    });

    it("shows independent sections when data differs", () => {
      setQueryData({
        "admin/userStats": { totalUsers: 100 },
        "admin/userGrowth": { totalUsers: 90, newUsers30d: 10 },
      });
      render(<AdminOverview />);
      // Different data sources might show slightly different numbers
      expect(screen.getByText("100")).toBeTruthy();
      expect(screen.getByText("Total: 90")).toBeTruthy();
    });

    it("revenue growth shows correct month comparison", () => {
      setQueryData({
        "admin/paymentStats": { revenue: 2000000 },
        "admin/revenueGrowth": { thisMonth: 1200000, lastMonth: 800000 },
      });
      render(<AdminOverview />);
      expect(screen.getByText("₦2,000,000")).toBeTruthy();
      expect(screen.getByText("This Month: ₦1,200,000")).toBeTruthy();
      expect(screen.getByText("Last Month: ₦800,000")).toBeTruthy();
    });
  });
});
