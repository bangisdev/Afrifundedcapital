// @vitest-environment jsdom
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";

// ─── Mock: sonner ──────────────────────────────────────────
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

// ─── Mock: useAuth ─────────────────────────────────────────
const mockUser = {
  id: 1,
  name: "Test User",
  email: "test@example.com",
  role: "user",
  onboardingComplete: true,
};

vi.mock("@/hooks/use-auth", () => ({
  useAuth: vi.fn(() => ({
    isLoading: false,
    isAuthenticated: true,
    user: mockUser,
    error: null,
    signIn: vi.fn(),
    signOut: vi.fn(),
    refetch: vi.fn(),
  })),
}));

// ─── Mock: useApiQuery / useApiMutation ────────────────────
let dashboardData: any = undefined;
let dashboardLoading = true;

vi.mock("@/hooks/use-api", () => ({
  useApiQuery: vi.fn((_key: string[], path: string) => {
    if (path === "/api/trading/dashboard") {
      return { data: dashboardData, isLoading: dashboardLoading };
    }
    return { data: undefined, isLoading: true };
  }),
  useApiMutation: vi.fn((_method: string, path: string) => ({
    mutateAsync: vi.fn(async () => {
      if (path === "/api/trading/sync") return { synced: 1 };
      if (path === "/api/trading/seed-demo") return { seeded: true };
      return { message: "ok" };
    }),
    isPending: false,
  })),
}));

// ─── Mock: recharts (simplified for jsdom) ────────────────
vi.mock("recharts", () => ({
  LineChart: Object.assign(({ children }: any) => React.createElement("div", { "data-testid": "line-chart" }, children), { displayName: "LineChart" }),
  AreaChart: Object.assign(({ children }: any) => React.createElement("div", { "data-testid": "area-chart" }, children), { displayName: "AreaChart" }),
  BarChart: Object.assign(({ children }: any) => React.createElement("div", { "data-testid": "bar-chart" }, children), { displayName: "BarChart" }),
  Bar: () => React.createElement("div", { "data-testid": "recharts-bar" }),
  Line: (props: any) => React.createElement("div", { "data-testid": "recharts-line", "data-key": props.dataKey }),
  Area: (props: any) => React.createElement("div", { "data-testid": "recharts-area", "data-key": props.dataKey }),
  Cell: () => null,
  XAxis: () => React.createElement("div", { "data-testid": "recharts-xaxis" }),
  YAxis: () => React.createElement("div", { "data-testid": "recharts-yaxis" }),
  CartesianGrid: () => React.createElement("div", { "data-testid": "recharts-grid" }),
}));

// ─── Mock: @/components/ui/chart ──────────────────────────
vi.mock("@/components/ui/chart", () => ({
  ChartContainer: ({ children }: any) => React.createElement("div", { "data-testid": "chart-container" }, children),
  ChartTooltip: () => React.createElement("div", { "data-testid": "chart-tooltip" }),
  ChartTooltipContent: () => React.createElement("div", { "data-testid": "chart-tooltip-content" }),
}));

// ─── Import component after mocks ─────────────────────────
import Trading from "@/pages/dashboard/Trading";
import { useAuth } from "@/hooks/use-auth";

// ─── Test data factories ──────────────────────────────────
function makeDashboardData(overrides: any = {}) {
  return {
    challenges: [],
    accounts: [],
    metricsHistory: [],
    drawdownData: [],
    summary: {
      totalBalance: 0,
      totalEquity: 0,
      floatingPL: 0,
      activeChallengeCount: 0,
      activeAccountCount: 0,
    },
    perfSummary: null,
    ...overrides,
  };
}

function makeMetricsHistory(count = 30) {
  const baseTime = Date.now() - 86400000 * count;
  return Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    recordedAt: baseTime + 86400000 * i,
    balance: 10000 + i * 50,
    equity: 10000 + i * 55 + i * 7,
    dailyPL: 50 + Math.random() * 20 - 10,
    floatingPL: 250,
    totalProfit: i * 50,
    currentDrawdown: (i % 5) * 0.4,
    dailyDrawdown: (i % 3) * 0.3,
    remainingDrawdown: 4500 - (i % 5) * 0.4,
    profitTargetProgress: Math.min(100, i * 3),
    tradingDaysCount: i + 1,
    openPositions: 2,
    closedTrades: i * 3,
    winRate: 55 + (i % 10),
    profitFactor: 1.2 + (i % 5) * 0.1,
    averageRR: 1.8,
    expectancy: 50,
    largestWin: 200,
    largestLoss: -100,
    consecutiveWins: 5,
    consecutiveLosses: 2,
    riskScore: 30,
    healthScore: 80 + (i % 20),
  }));
}

// ─── Tests ────────────────────────────────────────────────
describe("Trading Page", () => {
  beforeEach(() => {
    dashboardData = undefined;
    dashboardLoading = true;
    vi.clearAllMocks();
  });

  // ─── Loading state ─────────────────────────────────────
  describe("Loading State", () => {
    it("shows skeleton when data is loading", () => {
      const { container } = render(<Trading />);
      expect(container.querySelector("[aria-label='Loading']")).toBeTruthy();
    });
  });

  // ─── Empty states ──────────────────────────────────────
  describe("Empty States", () => {
    it("shows empty state when no challenges or accounts", () => {
      dashboardLoading = false;
      dashboardData = makeDashboardData();
      render(<Trading />);
      expect(screen.getByText("No Trading Activity Yet")).toBeTruthy();
      expect(screen.getByText("Browse Challenges")).toBeTruthy();
    });
  });

  // ─── Summary stats ─────────────────────────────────────
  describe("Summary Stats", () => {
    it("renders all four summary stat cards", () => {
      dashboardLoading = false;
      dashboardData = makeDashboardData({
        accounts: [{ id: 1, login: "123456", balance: 10000, equity: 10250, isActive: true, isSuspended: false, server: "Demo", currency: "USD", leverage: 30, group: "default", createdAt: Date.now() }],
        challenges: [{ id: 1, status: "active", accountSize: 10000, metrics: { balance: 10000, equity: 10250 } }],
        summary: { totalBalance: 10000, totalEquity: 10250, floatingPL: 250, activeChallengeCount: 1, activeAccountCount: 1 },
      });
      render(<Trading />);
      expect(screen.getByText("Total Balance")).toBeTruthy();
      expect(screen.getByText("Total Equity")).toBeTruthy();
      expect(screen.getByText("Active Challenges")).toBeTruthy();
      expect(screen.getByText("Total P&L")).toBeTruthy();
    });
  });

  // ─── Active challenge card ─────────────────────────────
  describe("Active Challenge Card", () => {
    it("renders challenge with template name and account size", () => {
      dashboardLoading = false;
      dashboardData = makeDashboardData({
        challenges: [{
          id: 1, status: "active", accountSize: 50000, templateName: "Two-Step Evaluation",
          profitTarget: 10, maxDrawdown: 5, dailyDrawdown: 2.5, maxLeverage: 30,
          minTradingDays: 5, currentPhase: 1,
          metrics: { balance: 50000, equity: 51200, floatingPL: 1200, dailyPL: 200, totalProfit: 1200, currentDrawdown: 0, dailyDrawdown: 0, remainingDrawdown: 1300, profitTargetProgress: 24, tradingDaysCount: 12, openPositions: 3, closedTrades: 36, winRate: 62.5, profitFactor: 1.8, healthScore: 88, recordedAt: Date.now() },
          violations: [],
        }],
        summary: { totalBalance: 50000, totalEquity: 51200, floatingPL: 1200, activeChallengeCount: 1, activeAccountCount: 1 },
      });
      render(<Trading />);
      expect(screen.getByText("Two-Step Evaluation")).toBeTruthy();
      expect(screen.getByText("Active")).toBeTruthy();
    });

    it("shows drawdown gauges", () => {
      dashboardLoading = false;
      dashboardData = makeDashboardData({
        challenges: [{
          id: 1, status: "active", accountSize: 10000, templateName: "One-Step",
          profitTarget: 8, maxDrawdown: 5, dailyDrawdown: 2.5, maxLeverage: 30,
          minTradingDays: 3, currentPhase: 1,
          metrics: { balance: 10000, equity: 10100, floatingPL: 100, dailyPL: 50, totalProfit: 100, currentDrawdown: 1.5, dailyDrawdown: 0.3, remainingDrawdown: 350, profitTargetProgress: 12, tradingDaysCount: 5, openPositions: 1, closedTrades: 12, winRate: 58, profitFactor: 1.5, healthScore: 85, recordedAt: Date.now() },
          violations: [],
        }],
        summary: { totalBalance: 10000, totalEquity: 10100, floatingPL: 100, activeChallengeCount: 1, activeAccountCount: 1 },
      });
      render(<Trading />);
      expect(screen.getByText("Maximum Drawdown")).toBeTruthy();
      expect(screen.getByText("Daily Drawdown")).toBeTruthy();
      expect(screen.getByText("Profit Target")).toBeTruthy();
    });

    it("shows violations warning when violations exist", () => {
      dashboardLoading = false;
      dashboardData = makeDashboardData({
        challenges: [{
          id: 1, status: "active", accountSize: 10000, templateName: "One-Step",
          profitTarget: 8, maxDrawdown: 5, dailyDrawdown: 2.5, maxLeverage: 30,
          minTradingDays: 3, currentPhase: 1,
          metrics: { balance: 10000, equity: 10100, floatingPL: 100, dailyPL: 50, totalProfit: 100, currentDrawdown: 1.5, dailyDrawdown: 0.3, remainingDrawdown: 350, profitTargetProgress: 12, tradingDaysCount: 5, openPositions: 1, closedTrades: 12, winRate: 58, profitFactor: 1.5, healthScore: 85, recordedAt: Date.now() },
          violations: [{ type: "news_trading", date: Date.now() }],
        }],
        summary: { totalBalance: 10000, totalEquity: 10100, floatingPL: 100, activeChallengeCount: 1, activeAccountCount: 1 },
      });
      render(<Trading />);
      expect(screen.getByText("Rule Violations Detected")).toBeTruthy();
    });
  });

  // ─── Performance analytics ─────────────────────────────
  describe("Performance Analytics", () => {
    it("renders performance stats when available", () => {
      dashboardLoading = false;
      dashboardData = makeDashboardData({
        accounts: [{ id: 1, login: "123456", balance: 10000, equity: 10250, isActive: true, isSuspended: false, server: "Demo", currency: "USD", leverage: 30, group: "default", createdAt: Date.now() }],
        challenges: [{
          id: 1, status: "active", accountSize: 10000, templateName: "One-Step",
          profitTarget: 8, maxDrawdown: 5, dailyDrawdown: 2.5, maxLeverage: 30, minTradingDays: 3, currentPhase: 1,
          metrics: { balance: 10000, equity: 10250, floatingPL: 250, dailyPL: 50, totalProfit: 250, currentDrawdown: 1, dailyDrawdown: 0.3, remainingDrawdown: 350, profitTargetProgress: 31, tradingDaysCount: 10, openPositions: 2, closedTrades: 30, winRate: 60, profitFactor: 1.8, averageRR: 2.0, largestWin: 300, largestLoss: -150, consecutiveWins: 6, consecutiveLosses: 2, healthScore: 85, recordedAt: Date.now() },
          violations: [],
        }],
        perfSummary: { winRate: 60, profitFactor: 1.8, averageRR: 2.0, expectancy: 50, largestWin: 300, largestLoss: -150, consecutiveWins: 6, consecutiveLosses: 2, closedTrades: 30, riskScore: 30, healthScore: 85 },
        summary: { totalBalance: 10000, totalEquity: 10250, floatingPL: 250, activeChallengeCount: 1, activeAccountCount: 1 },
      });
      render(<Trading />);
      expect(screen.getAllByText("Win Rate").length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText("Profit Factor").length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText("Avg R:R")).toBeTruthy();
      expect(screen.getByText("Largest Win")).toBeTruthy();
      expect(screen.getByText("Largest Loss")).toBeTruthy();
    });
  });

  // ─── Charts ────────────────────────────────────────────
  describe("Charts", () => {
    it("renders equity curve and drawdown charts with history data", () => {
      dashboardLoading = false;
      const history = makeMetricsHistory(30);
      dashboardData = makeDashboardData({
        accounts: [{ id: 1, login: "123456", balance: 10000, equity: 10250, isActive: true, isSuspended: false, server: "Demo", currency: "USD", leverage: 30, group: "default", createdAt: Date.now() }],
        challenges: [{
          id: 1, status: "active", accountSize: 10000, templateName: "One-Step",
          profitTarget: 8, maxDrawdown: 5, dailyDrawdown: 2.5, maxLeverage: 30, minTradingDays: 3, currentPhase: 1,
          metrics: { balance: 10000, equity: 10250, floatingPL: 250, dailyPL: 50, totalProfit: 250, currentDrawdown: 1, dailyDrawdown: 0.3, remainingDrawdown: 350, profitTargetProgress: 31, tradingDaysCount: 10, openPositions: 2, closedTrades: 30, winRate: 60, profitFactor: 1.8, healthScore: 85, recordedAt: Date.now() },
          violations: [],
        }],
        metricsHistory: history,
        drawdownData: history.map((m: any) => ({ recordedAt: m.recordedAt, drawdown: m.currentDrawdown, dailyDrawdown: m.dailyDrawdown })),
        perfSummary: { winRate: 60, profitFactor: 1.8, averageRR: 2.0, expectancy: 50, largestWin: 300, largestLoss: -150, consecutiveWins: 6, consecutiveLosses: 2, closedTrades: 30, riskScore: 30, healthScore: 85 },
        summary: { totalBalance: 10000, totalEquity: 10250, floatingPL: 250, activeChallengeCount: 1, activeAccountCount: 1 },
      });
      render(<Trading />);
      expect(screen.getByText("Performance Charts")).toBeTruthy();
      expect(screen.getByText("Equity Curve")).toBeTruthy();
      expect(screen.getByTestId("line-chart")).toBeTruthy();
      expect(screen.getByTestId("area-chart")).toBeTruthy();
    });

    it("shows daily P&L bar chart", () => {
      dashboardLoading = false;
      const history = makeMetricsHistory(30);
      dashboardData = makeDashboardData({
        accounts: [{ id: 1, login: "123456", balance: 10000, equity: 10250, isActive: true, isSuspended: false, server: "Demo", currency: "USD", leverage: 30, group: "default", createdAt: Date.now() }],
        challenges: [{
          id: 1, status: "active", accountSize: 10000, templateName: "One-Step",
          profitTarget: 8, maxDrawdown: 5, dailyDrawdown: 2.5, maxLeverage: 30, minTradingDays: 3, currentPhase: 1,
          metrics: { balance: 10000, equity: 10250, floatingPL: 250, dailyPL: 50, totalProfit: 250, currentDrawdown: 1, dailyDrawdown: 0.3, remainingDrawdown: 350, profitTargetProgress: 31, tradingDaysCount: 10, openPositions: 2, closedTrades: 30, winRate: 60, profitFactor: 1.8, healthScore: 85, recordedAt: Date.now() },
          violations: [],
        }],
        metricsHistory: history,
        drawdownData: history.map((m: any) => ({ recordedAt: m.recordedAt, drawdown: m.currentDrawdown, dailyDrawdown: m.dailyDrawdown })),
        perfSummary: { winRate: 60, profitFactor: 1.8, averageRR: 2.0, expectancy: 50, largestWin: 300, largestLoss: -150, consecutiveWins: 6, consecutiveLosses: 2, closedTrades: 30, riskScore: 30, healthScore: 85 },
        summary: { totalBalance: 10000, totalEquity: 10250, floatingPL: 250, activeChallengeCount: 1, activeAccountCount: 1 },
      });
      render(<Trading />);
      expect(screen.getByText("Daily P&L (Last 30 Days)")).toBeTruthy();
      expect(screen.getByTestId("bar-chart")).toBeTruthy();
    });
  });

  // ─── MT5 Accounts ──────────────────────────────────────
  describe("MT5 Accounts", () => {
    it("renders MT5 account cards", () => {
      dashboardLoading = false;
      dashboardData = makeDashboardData({
        accounts: [
          { id: 1, login: "111111", balance: 10000, equity: 10250, isActive: true, isSuspended: false, server: "MetaQuotes-Demo", currency: "USD", leverage: 30, group: "default", createdAt: Date.now(), lastSyncAt: Date.now() - 3600000 },
          { id: 2, login: "222222", balance: 50000, equity: 51000, isActive: true, isSuspended: false, server: "MetaQuotes-Demo", currency: "USD", leverage: 50, group: "default", createdAt: Date.now(), lastSyncAt: null },
        ],
        summary: { totalBalance: 60000, totalEquity: 61250, floatingPL: 1250, activeChallengeCount: 0, activeAccountCount: 2 },
      });
      render(<Trading />);
      expect(screen.getByText("MT5 Accounts")).toBeTruthy();
      expect(screen.getByText((text) => text.includes("111111"))).toBeTruthy();
      expect(screen.getByText((text) => text.includes("222222"))).toBeTruthy();
    });

    it("shows suspended badge", () => {
      dashboardLoading = false;
      dashboardData = makeDashboardData({
        accounts: [{ id: 1, login: "123456", balance: 10000, equity: 10000, isActive: false, isSuspended: true, server: "Demo", currency: "USD", leverage: 30, group: "default", createdAt: Date.now() }],
        summary: { totalBalance: 10000, totalEquity: 10000, floatingPL: 0, activeChallengeCount: 0, activeAccountCount: 0 },
      });
      render(<Trading />);
      expect(screen.getByText("Suspended")).toBeTruthy();
    });
  });

  // ─── Sync button ───────────────────────────────────────
  describe("Sync Button", () => {
    it("renders the sync button", () => {
      dashboardLoading = false;
      dashboardData = makeDashboardData({
        accounts: [{ id: 1, login: "123456", balance: 10000, equity: 10000, isActive: true, isSuspended: false, server: "Demo", currency: "USD", leverage: 30, group: "default", createdAt: Date.now() }],
        challenges: [{
          id: 1, status: "active", accountSize: 10000, templateName: "One-Step",
          profitTarget: 8, maxDrawdown: 5, dailyDrawdown: 2.5, maxLeverage: 30, minTradingDays: 3, currentPhase: 1,
          metrics: null, violations: [],
        }],
        summary: { totalBalance: 10000, totalEquity: 10000, floatingPL: 0, activeChallengeCount: 1, activeAccountCount: 1 },
      });
      render(<Trading />);
      expect(screen.getByText("Sync Now")).toBeTruthy();
    });
  });

  // ─── Page header ───────────────────────────────────────
  describe("Page Header", () => {
    it("renders the Trading Dashboard title when data exists", () => {
      dashboardLoading = false;
      dashboardData = makeDashboardData({
        accounts: [{ id: 1, login: "123456", balance: 10000, equity: 10000, isActive: true, isSuspended: false, server: "Demo", currency: "USD", leverage: 30, group: "default", createdAt: Date.now() }],
        summary: { totalBalance: 10000, totalEquity: 10000, floatingPL: 0, activeChallengeCount: 0, activeAccountCount: 1 },
      });
      render(<Trading />);
      expect(screen.getByText("Trading Dashboard")).toBeTruthy();
      expect(screen.getByText(/Real-time performance metrics/)).toBeTruthy();
    });
  });

  // ─── Full integration ──────────────────────────────────
  describe("Full Integration", () => {
    it("renders all sections together", () => {
      dashboardLoading = false;
      const history = makeMetricsHistory(30);
      dashboardData = makeDashboardData({
        accounts: [{ id: 1, login: "111111", balance: 50000, equity: 51200, isActive: true, isSuspended: false, server: "MetaQuotes-Demo", currency: "USD", leverage: 30, group: "default", createdAt: Date.now(), lastSyncAt: Date.now() - 3600000 }],
        challenges: [{
          id: 1, status: "active", accountSize: 50000, templateName: "Two-Step Evaluation",
          profitTarget: 10, maxDrawdown: 5, dailyDrawdown: 2.5, maxLeverage: 30, minTradingDays: 5, currentPhase: 1,
          metrics: { balance: 50000, equity: 51200, floatingPL: 1200, dailyPL: 200, totalProfit: 1200, currentDrawdown: 1, dailyDrawdown: 0.3, remainingDrawdown: 1300, profitTargetProgress: 24, tradingDaysCount: 12, openPositions: 3, closedTrades: 36, winRate: 62.5, profitFactor: 1.8, averageRR: 2.0, largestWin: 300, largestLoss: -150, consecutiveWins: 6, consecutiveLosses: 2, healthScore: 88, recordedAt: Date.now() },
          violations: [],
        }],
        metricsHistory: history,
        drawdownData: history.map((m: any) => ({ recordedAt: m.recordedAt, drawdown: m.currentDrawdown, dailyDrawdown: m.dailyDrawdown })),
        perfSummary: { winRate: 62.5, profitFactor: 1.8, averageRR: 2.0, expectancy: 50, largestWin: 300, largestLoss: -150, consecutiveWins: 6, consecutiveLosses: 2, closedTrades: 36, riskScore: 30, healthScore: 88 },
        summary: { totalBalance: 50000, totalEquity: 51200, floatingPL: 1200, activeChallengeCount: 1, activeAccountCount: 1 },
      });
      render(<Trading />);

      // Header
      expect(screen.getByText("Trading Dashboard")).toBeTruthy();

      // Summary stats
      expect(screen.getByText("Total Balance")).toBeTruthy();
      expect(screen.getByText("Total Equity")).toBeTruthy();
      expect(screen.getByText("Active Challenges")).toBeTruthy();
      expect(screen.getByText("Total P&L")).toBeTruthy();

      // Challenge card
      expect(screen.getByText("Two-Step Evaluation")).toBeTruthy();
      expect(screen.getByText("Maximum Drawdown")).toBeTruthy();
      expect(screen.getByText("Profit Target")).toBeTruthy();

      // Performance stats (Win Rate appears in both challenge quick stats and analytics)
      expect(screen.getAllByText("Win Rate").length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText("Profit Factor").length).toBeGreaterThanOrEqual(1);

      // Charts
      expect(screen.getByText("Performance Charts")).toBeTruthy();
      expect(screen.getByText("Equity Curve")).toBeTruthy();

      // MT5 accounts
      expect(screen.getByText("MT5 Accounts")).toBeTruthy();
      expect(screen.getByText((text) => text.includes("111111"))).toBeTruthy();

      // Sync button
      expect(screen.getByText("Sync Now")).toBeTruthy();
    });
  });
});
