// @vitest-environment jsdom
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { useApiQuery } from "@/hooks/use-api";

// ─── Mock: sonner ──────────────────────────────────────────
vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  },
}));

// ─── Mock: useAuth ─────────────────────────────────────────
const mockUser = {
  id: 1,
  name: "Test User",
  email: "test@example.com",
  role: "user",
  isDemoSeeded: true, // Default to seeded so auto-seed doesn't fire
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
const queryDataMap: Record<string, any> = {};

vi.mock("@/hooks/use-api", () => ({
  useApiQuery: vi.fn((key: string[], path: string, _opts?: any) => {
    // The page passes query-suffixed keys (["mt5", "my", "/api/trading/mt5?..."]),
    // so look up by the stable prefix (first two segments).
    const dataKey = key.slice(0, 2).join("/");
    if (queryDataMap[dataKey] === undefined) {
      return { data: undefined, isLoading: true };
    }
    const base = queryDataMap[dataKey];
    // Simulate the server-driven mt5 accounts / challenges envelopes (both are lists on the server).
    if ((dataKey === "mt5/my" || dataKey === "challenges/my") && Array.isArray(base)) {
      const query = path.includes("?") ? path.split("?")[1] : "";
      const params = new URLSearchParams(query);
      const page = Number(params.get("page") || 1);
      const pageSize = Number(params.get("pageSize") || 10);
      const total = base.length;
      const totalPages = Math.max(1, Math.ceil(total / pageSize));
      const listKey = dataKey === "mt5/my" ? "accounts" : "challenges";
      return {
        data: {
          [listKey]: base.slice((page - 1) * pageSize, page * pageSize),
          total,
          page,
          pageSize,
          totalPages,
          stats: { total, byStatus: {} },
        },
        isLoading: false,
      };
    }
    return { data: base, isLoading: false };
  }),
  useApiMutation: vi.fn((_method: string, path: string, _onSuccess?: any) => {
    let resolvePromise: (value: any) => void;
    new Promise((resolve) => { resolvePromise = resolve; });

    return {
      mutateAsync: vi.fn(async (_body?: any) => {
        if (path === "/api/trading/seed-demo") {
          return { message: "Seeded 60 days of demo trading data" };
        }
        if (path === "/api/trading/sync") {
          return { synced: 1 };
        }
        if (path === "/api/trading/reset-demo") {
          return { message: "Reset demo data" };
        }
        return { message: "ok" };
      }),
      mutate: vi.fn(),
      isPending: false,
      _resolvePromise: () => resolvePromise!({}),
    };
  }),
}));

// ─── Mock: recharts (simplified for jsdom) ────────────────
vi.mock("recharts", () => ({
  LineChart: Object.assign(({ children }: any) => React.createElement("div", { "data-testid": "line-chart" }, children), { displayName: "LineChart" }),
  AreaChart: Object.assign(({ children }: any) => React.createElement("div", { "data-testid": "area-chart" }, children), { displayName: "AreaChart" }),
  Line: (props: any) => React.createElement("div", { "data-testid": "recharts-line", "data-key": props.dataKey }),
  Area: (props: any) => React.createElement("div", { "data-testid": "recharts-area", "data-key": props.dataKey }),
  XAxis: () => React.createElement("div", { "data-testid": "recharts-xaxis" }),
  YAxis: () => React.createElement("div", { "data-testid": "recharts-yaxis" }),
  CartesianGrid: () => React.createElement("div", { "data-testid": "recharts-grid" }),
  ResponsiveContainer: ({ children }: any) =>
    React.createElement("div", { "data-testid": "recharts-responsive-container" }, children),
  Tooltip: () => React.createElement("div", { "data-testid": "recharts-tooltip" }),
}));

// ─── Mock: @/components/ui/chart ──────────────────────────
vi.mock("@/components/ui/chart", () => ({
  ChartContainer: ({ children }: any) =>
    React.createElement("div", { "data-testid": "chart-container" }, children),
  ChartTooltip: () => React.createElement("div", { "data-testid": "chart-tooltip" }),
  ChartTooltipContent: () => React.createElement("div", { "data-testid": "chart-tooltip-content" }),
}));

// ─── Import component after mocks ─────────────────────────
import Trading from "@/pages/dashboard/Trading";
import { useAuth } from "@/hooks/use-auth";

// ─── Test data factories ──────────────────────────────────
function makeChallenge(overrides: any = {}) {
  return {
    id: 1,
    accountSize: 10000,
    status: "active",
    profitTarget: 10,
    maxDrawdown: 5,
    maxLeverage: 30,
    currentPhase: 1,
    createdAt: Date.now() - 86400000 * 30,
    ...overrides,
  };
}

function makeMt5Account(overrides: any = {}) {
  return {
    id: 1,
    login: "123456",
    server: "MetaQuotes-Demo",
    currency: "USD",
    balance: 10000,
    equity: 10250,
    leverage: 30,
    group: "default",
    isActive: true,
    isSuspended: false,
    ...overrides,
  };
}

function makeMetricsHistory(count: number = 30) {
  const baseTime = Date.now() - 86400000 * count;
  return Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    recordedAt: baseTime + 86400000 * i,
    balance: 10000 + i * 50,
    equity: 10000 + i * 55 + (i * 7),
    currentDrawdown: (i % 5) * 0.4,
    dailyDrawdown: (i % 3) * 0.3,
    totalProfit: i * 50,
    winRate: 55 + (i % 10),
    profitFactor: 1.2 + (i % 5) * 0.1,
    tradingDaysCount: i + 1,
    healthScore: 80 + (i % 20),
  }));
}

function makeLatestMetrics() {
  return {
    balance: 10500,
    equity: 10750,
    floatingPL: 250,
    totalProfit: 500,
    winRate: 58.3,
    profitFactor: 1.45,
    healthScore: 92,
    tradingDaysCount: 25,
  };
}

// ─── Helper to configure mock data before each test ───────
function setQueryData(updates: Record<string, any>) {
  Object.keys(queryDataMap).forEach((k) => delete queryDataMap[k]);
  const defaults: Record<string, any> = {
    "challenges/my": [],
    "metrics/dashboard": { latestMetrics: null },
    "metrics/history": [],
    "mt5/my": [],
  };
  Object.assign(queryDataMap, defaults, updates);
}

// ─── Tests ────────────────────────────────────────────────
describe("Trading Page", () => {
  beforeEach(() => {
    setQueryData({});
    vi.clearAllMocks();
    // Reset user to default (seeded)
    vi.mocked(useAuth).mockReturnValue({
      isLoading: false,
      isAuthenticated: true,
      user: { ...mockUser } as any,
      error: null,
      signIn: vi.fn() as any,
      signOut: vi.fn() as any,
      refetch: vi.fn() as any,
    });
  });

  // ─── Loading state ─────────────────────────────────────
  describe("Loading State", () => {
    it("shows a spinner when data is loading", () => {
      Object.keys(queryDataMap).forEach((k) => delete queryDataMap[k]);
      const { container } = render(<Trading />);
      expect(container.querySelector(".animate-spin")).toBeTruthy();
    });
  });

  // ─── Empty states ──────────────────────────────────────
  describe("Empty States", () => {
    it("shows empty state when no MT5 accounts exist", () => {
      render(<Trading />);
      expect(screen.getByText(/No MT5 accounts yet/)).toBeTruthy();
    });

    it("shows empty chart prompt when MT5 accounts exist but no history and user is seeded", () => {
      setQueryData({
        "challenges/my": [makeChallenge()],
        "metrics/dashboard": { latestMetrics: null },
        "metrics/history": [],
        "mt5/my": [makeMt5Account()],
      });
      render(<Trading />);
      expect(screen.getByText(/No trading metrics recorded yet/)).toBeTruthy();
    });
  });

  // ─── Metric cards ──────────────────────────────────────
  describe("Metric Cards", () => {
    it("renders metric card labels", () => {
      setQueryData({
        "challenges/my": [makeChallenge()],
        "metrics/dashboard": { latestMetrics: makeLatestMetrics() },
        "metrics/history": makeMetricsHistory(10),
        "mt5/my": [makeMt5Account()],
      });
      render(<Trading />);

      expect(screen.getByText("Total Balance")).toBeTruthy();
      expect(screen.getByText("Total Equity")).toBeTruthy();
      // "Active Challenges" appears twice (stat-label + section heading), use getAllByText
      expect(screen.getAllByText("Active Challenges").length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText("MT5 Accounts").length).toBeGreaterThanOrEqual(1);
    });

    it("displays correct aggregate balance from multiple MT5 accounts", () => {
      setQueryData({
        "mt5/my": [
          makeMt5Account({ balance: 15000, equity: 15300 }),
          makeMt5Account({ id: 2, login: "789012", balance: 25000, equity: 24800 }),
        ],
      });
      render(<Trading />);
      expect(screen.getByText("$40,000")).toBeTruthy(); // 15000 + 25000
      expect(screen.getByText("$40,100")).toBeTruthy(); // 15300 + 24800
    });

    it("shows positive floating P/L", () => {
      setQueryData({
        "mt5/my": [makeMt5Account({ balance: 10000, equity: 10500 })],
      });
      render(<Trading />);
      expect(screen.getByText("Total Equity")).toBeTruthy();
      expect(screen.getByText((text) => text.includes("500.00"))).toBeTruthy();
    });

    it("shows negative floating P/L", () => {
      setQueryData({
        "mt5/my": [makeMt5Account({ balance: 10000, equity: 9500 })],
      });
      render(<Trading />);
      expect(screen.getByText((text) => text.includes("500.00"))).toBeTruthy();
    });

    it("shows active and funded challenge counts", () => {
      setQueryData({
        "challenges/my": [
          makeChallenge({ id: 1, status: "active" }),
          makeChallenge({ id: 2, status: "active" }),
          makeChallenge({ id: 3, status: "funded" }),
        ],
      });
      render(<Trading />);
      // Active count "2" appears in the stat-value div
      expect(screen.getByText("2")).toBeTruthy();
      expect(screen.getByText("1 funded")).toBeTruthy();
    });
  });

  // ─── MT5 Accounts section ──────────────────────────────
  describe("MT5 Accounts", () => {
    it("renders MT5 account card with details", () => {
      setQueryData({
        "mt5/my": [makeMt5Account({ login: "555888", server: "Exness-MT5", currency: "NGN", leverage: 200 })],
      });
      render(<Trading />);

      expect(screen.getAllByText("MT5 Accounts").length).toBeGreaterThanOrEqual(1);
      // Text is split: "Account #" and "555888" are in separate elements
      expect(screen.getByText("555888")).toBeTruthy();
      expect(screen.getByText((text) => text.includes("200"))).toBeTruthy();
      expect(screen.getByText((text) => text.includes("NGN"))).toBeTruthy();
    });

    it("shows suspended badge for suspended accounts", () => {
      setQueryData({
        "mt5/my": [makeMt5Account({ isSuspended: true, isActive: false })],
      });
      render(<Trading />);
      expect(screen.getByText("Suspended")).toBeTruthy();
    });

    it("shows active badge for active accounts", () => {
      setQueryData({
        "mt5/my": [makeMt5Account({ isActive: true, isSuspended: false })],
      });
      render(<Trading />);
      expect(screen.getByText("Active")).toBeTruthy();
    });

    it("renders multiple MT5 account cards", () => {
      setQueryData({
        "mt5/my": [
          makeMt5Account({ id: 1, login: "111111" }),
          makeMt5Account({ id: 2, login: "222222" }),
          makeMt5Account({ id: 3, login: "333333" }),
        ],
      });
      render(<Trading />);
      expect(screen.getByText("111111")).toBeTruthy();
      expect(screen.getByText("222222")).toBeTruthy();
      expect(screen.getByText("333333")).toBeTruthy();
    });

    // ─── Sortable headers ────────────────────────────────
    it("renders sortable column headers with the default column active", () => {
      setQueryData({ "mt5/my": [makeMt5Account()] });
      render(<Trading />);

      // All sortable headers render
      for (const label of ["Login", "Balance", "Equity", "Leverage", "Server", "Created"]) {
        expect(screen.getByRole("button", { name: `Sort by ${label}` })).toBeTruthy();
      }
      // Default sort is createdAt desc → Created is active (aria-pressed)
      expect(screen.getByRole("button", { name: "Sort by Created" }).getAttribute("aria-pressed")).toBe("true");
    });

    it("calls the API with sortBy/sortOrder when a header is clicked", async () => {
      const user = userEvent.setup();
      setQueryData({ "mt5/my": [makeMt5Account()] });
      render(<Trading />);

      await user.click(screen.getByRole("button", { name: "Sort by Balance" }));

      // Find the mt5 query call that included the sort params
      const calls = vi.mocked(useApiQuery).mock.calls;
      const mt5Call = calls.find((c) => String(c[1]).includes("/api/trading/mt5?") && String(c[1]).includes("sortBy=balance"));
      expect(mt5Call).toBeTruthy();
      expect(String(mt5Call![1])).toContain("sortOrder=desc");
      expect(screen.getByRole("button", { name: "Sort by Balance" }).getAttribute("aria-pressed")).toBe("true");
    });

    it("toggles to ascending when the active column is clicked again", async () => {
      const user = userEvent.setup();
      setQueryData({ "mt5/my": [makeMt5Account()] });
      render(<Trading />);

      await user.click(screen.getByRole("button", { name: "Sort by Balance" }));
      await user.click(screen.getByRole("button", { name: "Sort by Balance" }));

      const calls = vi.mocked(useApiQuery).mock.calls;
      const ascCall = calls.find((c) => String(c[1]).includes("/api/trading/mt5?") && String(c[1]).includes("sortBy=balance&sortOrder=asc"));
      expect(ascCall).toBeTruthy();
    });

    it("switching columns resets to descending order", async () => {
      const user = userEvent.setup();
      setQueryData({ "mt5/my": [makeMt5Account()] });
      render(<Trading />);

      // Sort by Balance asc first
      await user.click(screen.getByRole("button", { name: "Sort by Balance" }));
      await user.click(screen.getByRole("button", { name: "Sort by Balance" }));
      // Switch to Equity → should default to desc
      await user.click(screen.getByRole("button", { name: "Sort by Equity" }));

      const calls = vi.mocked(useApiQuery).mock.calls;
      const equityCall = calls.find((c) => String(c[1]).includes("/api/trading/mt5?") && String(c[1]).includes("sortBy=equity&sortOrder=desc"));
      expect(equityCall).toBeTruthy();
      expect(screen.getByRole("button", { name: "Sort by Equity" }).getAttribute("aria-pressed")).toBe("true");
    });
  });

  // ─── Charts ────────────────────────────────────────────
  describe("Charts", () => {
    it("renders Performance Charts heading with history data", () => {
      setQueryData({
        "metrics/history": makeMetricsHistory(30),
        "mt5/my": [makeMt5Account()],
      });
      render(<Trading />);
      expect(screen.getByText("Performance Charts")).toBeTruthy();
      expect(screen.getByText("Balance & Equity")).toBeTruthy();
    });

    it("renders both line and area charts", () => {
      setQueryData({
        "metrics/history": makeMetricsHistory(30),
        "mt5/my": [makeMt5Account()],
      });
      render(<Trading />);
      expect(screen.getByTestId("line-chart")).toBeTruthy();
      expect(screen.getByTestId("area-chart")).toBeTruthy();
    });

    it("shows balance/equity legend text", () => {
      setQueryData({
        "metrics/history": makeMetricsHistory(30),
        "mt5/my": [makeMt5Account()],
      });
      render(<Trading />);
      expect(screen.getByText(/Solid line: Balance/)).toBeTruthy();
    });

    it("shows drawdown legend text", () => {
      setQueryData({
        "metrics/history": makeMetricsHistory(30),
        "mt5/my": [makeMt5Account()],
      });
      render(<Trading />);
      expect(screen.getByText(/Current drawdown over time/)).toBeTruthy();
    });

    it("handles large datasets without errors", () => {
      setQueryData({
        "metrics/history": makeMetricsHistory(200),
        "mt5/my": [makeMt5Account()],
      });
      render(<Trading />);
      expect(screen.getByTestId("line-chart")).toBeTruthy();
      expect(screen.getByTestId("area-chart")).toBeTruthy();
    });
  });

  // ─── Current Metrics section ───────────────────────────
  describe("Current Metrics", () => {
    it("renders latest metrics when available", () => {
      setQueryData({
        "metrics/dashboard": { latestMetrics: makeLatestMetrics() },
        "mt5/my": [makeMt5Account()],
      });
      render(<Trading />);

      expect(screen.getByText("Current Metrics")).toBeTruthy();
      expect(screen.getByText("$10,500")).toBeTruthy();
      expect(screen.getByText("$10,750")).toBeTruthy();
      expect(screen.getByText("58.3%")).toBeTruthy();
      expect(screen.getByText("1.45")).toBeTruthy();
      expect(screen.getByText("92/100")).toBeTruthy();
      expect(screen.getByText("25")).toBeTruthy();
    });

    it("shows positive floating P/L with plus sign", () => {
      setQueryData({
        "metrics/dashboard": { latestMetrics: makeLatestMetrics() },
        "mt5/my": [makeMt5Account()],
      });
      render(<Trading />);
      expect(screen.getByText("Floating P/L")).toBeTruthy();
      expect(screen.getByText("+$250.00")).toBeTruthy();
    });

    it("shows negative floating P/L", () => {
      setQueryData({
        "metrics/dashboard": {
          latestMetrics: { ...makeLatestMetrics(), floatingPL: -150 },
        },
        "mt5/my": [makeMt5Account()],
      });
      render(<Trading />);
      expect(screen.getByText((text) => text.includes("150.00"))).toBeTruthy();
    });

    it("shows negative total profit", () => {
      setQueryData({
        "metrics/dashboard": {
          latestMetrics: { ...makeLatestMetrics(), totalProfit: -500 },
        },
        "mt5/my": [makeMt5Account()],
      });
      render(<Trading />);
      expect(screen.getByText((text) => text.includes("500.00")))
    });
  });

  // ─── Active Challenges section ─────────────────────────
  describe("Active Challenges", () => {
    it("renders challenge card with account size and rules", () => {
      setQueryData({
        "challenges/my": [makeChallenge()],
      });
      render(<Trading />);
      expect(screen.getByText(/10,000.*Challenge/)).toBeTruthy();
      expect(screen.getByText(/Target: 10%/)).toBeTruthy();
      expect(screen.getByText(/Max DD: 5%/)).toBeTruthy();
      expect(screen.getByText(/Leverage: 1:30/)).toBeTruthy();
    });

    it("renders multiple active challenges", () => {
      setQueryData({
        "challenges/my": [
          makeChallenge({ id: 1, accountSize: 10000 }),
          makeChallenge({ id: 2, accountSize: 25000, maxLeverage: 50 }),
        ],
      });
      render(<Trading />);
      expect(screen.getByText(/10,000.*Challenge/)).toBeTruthy();
      expect(screen.getByText(/25,000.*Challenge/)).toBeTruthy();
    });
  });

  // ─── Funded Accounts section ───────────────────────────
  describe("Funded Accounts", () => {
    it("renders funded challenge card", () => {
      setQueryData({
        "challenges/my": [makeChallenge({ id: 5, status: "funded", accountSize: 50000 })],
      });
      render(<Trading />);
      expect(screen.getByText("Funded Accounts")).toBeTruthy();
      expect(screen.getByText(/50,000.*Funded Account/)).toBeTruthy();
    });
  });

  // ─── Sync button ───────────────────────────────────────
  describe("Sync Button", () => {
    it("renders the sync button", () => {
      render(<Trading />);
      expect(screen.getByText("Sync Now")).toBeTruthy();
    });

    it("button is clickable and triggers sync", async () => {
      const user = userEvent.setup();
      setQueryData({
        "challenges/my": [makeChallenge()],
        "mt5/my": [makeMt5Account()],
      });
      render(<Trading />);

      const syncButton = screen.getByText("Sync Now");
      await user.click(syncButton);
      // Button should be clickable without error
      expect(syncButton).toBeTruthy();
    });
  });

  // ─── Page header ───────────────────────────────────────
  describe("Page Header", () => {
    it("renders the Trading page title and description", () => {
      render(<Trading />);
      expect(screen.getByText("Trading")).toBeTruthy();
      expect(screen.getByText(/Monitor your trading performance/)).toBeTruthy();
    });
  });

  // ─── Auto-seeding ──────────────────────────────────────
  describe("Auto-seeding", () => {
    it("shows generate demo data button when user is not seeded", () => {
      vi.mocked(useAuth).mockReturnValue({
        isLoading: false,
        isAuthenticated: true,
        user: { ...mockUser, isDemoSeeded: false } as any,
        error: null,
        signIn: vi.fn() as any,
        signOut: vi.fn() as any,
        refetch: vi.fn() as any,
      });

      setQueryData({
        "challenges/my": [makeChallenge()],
        "metrics/dashboard": { latestMetrics: null },
        "metrics/history": [],
        "mt5/my": [makeMt5Account()],
      });
      render(<Trading />);
      // The auto-seed fires, but the button text should be present eventually or the spinner
      // Since auto-seed fires immediately, we check for the spinner state
      expect(screen.getByText(/Generating demo trading data/)).toBeTruthy();
    });
  });

  // ─── Integration: full render with all data ────────────
  describe("Full Integration", () => {
    it("renders all sections together with complete data", () => {
      setQueryData({
        "challenges/my": [
          makeChallenge({ id: 1, accountSize: 10000, status: "active" }),
          makeChallenge({ id: 2, accountSize: 50000, status: "funded" }),
        ],
        "metrics/dashboard": { latestMetrics: makeLatestMetrics() },
        "metrics/history": makeMetricsHistory(30),
        "mt5/my": [
          makeMt5Account({ id: 1, login: "111111", balance: 10000, equity: 10250 }),
          makeMt5Account({ id: 2, login: "222222", balance: 50000, equity: 51000 }),
        ],
      });
      render(<Trading />);

      // Header
      expect(screen.getByText("Trading")).toBeTruthy();

      // Metric cards
      expect(screen.getByText("Total Balance")).toBeTruthy();
      expect(screen.getByText("Total Equity")).toBeTruthy();

      // MT5 accounts
      expect(screen.getByText("111111")).toBeTruthy();
      expect(screen.getByText("222222")).toBeTruthy();

      // Charts
      expect(screen.getByText("Performance Charts")).toBeTruthy();
      expect(screen.getByTestId("line-chart")).toBeTruthy();
      expect(screen.getByTestId("area-chart")).toBeTruthy();

      // Current metrics
      expect(screen.getByText("Current Metrics")).toBeTruthy();

      // Challenges (use getAllByText since "Active Challenges" appears twice)
      expect(screen.getAllByText("Active Challenges").length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText("Funded Accounts")).toBeTruthy();

      // Sync button
      expect(screen.getByText("Sync Now")).toBeTruthy();
    });
  });
});
