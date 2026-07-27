// @vitest-environment jsdom
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";

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

vi.mock("@/hooks/use-api", () => ({
  useApiQuery: vi.fn((key: string[], path: string, _opts?: any) => {
    const dataKey = `${key.join("/")}`;
    if (queryDataMap[dataKey] === undefined) {
      return { data: undefined, isLoading: false };
    }
    return { data: queryDataMap[dataKey], isLoading: false };
  }),
}));

// ─── Mock: recharts ───────────────────────────────────────
vi.mock("recharts", () => ({
  BarChart: Object.assign(({ children }: any) => React.createElement("div", { "data-testid": "bar-chart" }, children), { displayName: "BarChart" }),
  Bar: (props: any) => React.createElement("div", { "data-testid": "recharts-bar", "data-key": props.dataKey }),
  LineChart: Object.assign(({ children }: any) => React.createElement("div", { "data-testid": "line-chart" }, children), { displayName: "LineChart" }),
  Line: (props: any) => React.createElement("div", { "data-testid": "recharts-line", "data-key": props.dataKey }),
  XAxis: () => React.createElement("div", { "data-testid": "recharts-xaxis" }),
  YAxis: () => React.createElement("div", { "data-testid": "recharts-yaxis" }),
  CartesianGrid: () => React.createElement("div", { "data-testid": "recharts-grid" }),
  ResponsiveContainer: ({ children }: any) => React.createElement("div", { "data-testid": "recharts-responsive-container" }, children),
  Tooltip: () => React.createElement("div", { "data-testid": "recharts-tooltip" }),
}));

// ─── Import component after mocks ─────────────────────────
import AdminOverview from "@/pages/admin/AdminOverview";

// ─── Helpers ──────────────────────────────────────────────
function clearAllQueryData() {
  Object.keys(queryDataMap).forEach((k) => delete queryDataMap[k]);
}

function setQueryData(updates: Record<string, any>) {
  Object.keys(queryDataMap).forEach((k) => delete queryDataMap[k]);
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
  });

  // ─── Page header ───────────────────────────────────────
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

  // ─── Stat Cards ────────────────────────────────────────
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
      // All stats show 0 or ₦0 by default
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
      // ₦0 appears in both Revenue and Total Paid Out
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
  });

  // ─── Full integration ──────────────────────────────────
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

      // Header
      expect(screen.getByText("Admin Overview")).toBeTruthy();
      expect(screen.getByText("Platform statistics and analytics")).toBeTruthy();

      // Stat cards
      expect(screen.getByText("500")).toBeTruthy();
      expect(screen.getByText("150")).toBeTruthy();
      expect(screen.getByText("₦10,000,000")).toBeTruthy();
      expect(screen.getByText("45")).toBeTruthy();
      expect(screen.getByText("20")).toBeTruthy();
      expect(screen.getByText("300")).toBeTruthy();
      expect(screen.getByText("₦5,000,000")).toBeTruthy();
      expect(screen.getByText("12")).toBeTruthy();

      // Growth sections
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
  });
});
