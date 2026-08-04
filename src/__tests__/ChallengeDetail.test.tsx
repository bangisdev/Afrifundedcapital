// @vitest-environment jsdom
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";

// ─── Mock: sonner ──────────────────────────────────────────
vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  },
}));

// ─── Mock: react-router ────────────────────────────────────
const mockNavigate = vi.fn();
const mockParams: Record<string, string> = { id: "1" };

vi.mock("react-router", () => ({
  useParams: () => mockParams,
  useNavigate: () => mockNavigate,
}));

// ─── Mock: useAuth ─────────────────────────────────────────
const mockUser = {
  id: 1,
  name: "Test User",
  email: "test@example.com",
  role: "user",
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
  useApiQuery: vi.fn((key: string[], _path: string, _opts?: any) => {
    const dataKey = `${key.join("/")}`;
    if (queryDataMap[dataKey] === undefined) {
      return { data: undefined, isLoading: true };
    }
    return { data: queryDataMap[dataKey], isLoading: false };
  }),
  useApiMutation: vi.fn((_method: string, _path: string, _onSuccess?: any) => {
    return {
      mutateAsync: vi.fn(async () => ({ message: "ok" })),
      mutate: vi.fn(),
      isPending: false,
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
import ChallengeDetail from "@/pages/dashboard/ChallengeDetail";
import { useAuth } from "@/hooks/use-auth";

// ─── Test data factories ──────────────────────────────────
function makeChallenge(overrides: any = {}) {
  return {
    id: 1,
    accountSize: 10000,
    status: "active",
    profitTarget: 10,
    maxDrawdown: 5,
    dailyDrawdown: 4,
    maxLeverage: 30,
    currentPhase: 1,
    createdAt: Date.now() - 86400000 * 14,
    minTradingDays: 5,
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

function makeLatestMetrics(overrides: any = {}) {
  return {
    balance: 10500,
    equity: 10750,
    floatingPL: 250,
    totalProfit: 500,
    winRate: 58.3,
    profitFactor: 1.45,
    healthScore: 92,
    tradingDaysCount: 25,
    profitTargetProgress: 65.2,
    ...overrides,
  };
}

// ─── Helper to configure mock data before each test ───────
function setQueryData(updates: Record<string, any>) {
  Object.keys(queryDataMap).forEach((k) => delete queryDataMap[k]);
  const defaults: Record<string, any> = {};
  Object.assign(queryDataMap, defaults, updates);
}

// ─── Tests ────────────────────────────────────────────────
describe("ChallengeDetail Page", () => {
  beforeEach(() => {
    mockParams.id = "1";
    setQueryData({});
    vi.clearAllMocks();
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
    it("shows a spinner when challenge data is loading", () => {
      setQueryData({});
      const { container } = render(<ChallengeDetail />);
      expect(container.querySelector(".animate-spin")).toBeTruthy();
    });

    it("shows a spinner when metrics history is loading", () => {
      setQueryData({
        "challenge/1": makeChallenge(),
      });
      // challenge loaded but metrics still loading
      setQueryData({
        "challenge/1": makeChallenge(),
        // metrics/history key is "challenge/1/metrics" — not set = loading
      });
      const { container } = render(<ChallengeDetail />);
      expect(container.querySelector(".animate-spin")).toBeTruthy();
    });
  });

  // ─── Not found state ───────────────────────────────────
  describe("Not Found", () => {
    it("shows 'Challenge not found' when challenge is null", () => {
      setQueryData({
        "challenge/1": null,
        "challenge/1/metrics": [],
      });
      render(<ChallengeDetail />);
      expect(screen.getByText("Challenge not found")).toBeTruthy();
    });

    it("shows back button in not found state", () => {
      setQueryData({
        "challenge/1": null,
        "challenge/1/metrics": [],
      });
      render(<ChallengeDetail />);
      expect(screen.getByText("Back")).toBeTruthy();
    });

    it("navigates back to challenges list when Back is clicked", async () => {
      const user = userEvent.setup();
      setQueryData({
        "challenge/1": null,
        "challenge/1/metrics": [],
      });
      render(<ChallengeDetail />);

      await user.click(screen.getByText("Back"));
      expect(mockNavigate).toHaveBeenCalledWith("/dashboard/challenges");
    });
  });

  // ─── Challenge header ──────────────────────────────────
  describe("Challenge Header", () => {
    it("renders challenge title with account size", () => {
      setQueryData({
        "challenge/1": makeChallenge({ accountSize: 50000 }),
        "challenge/1/metrics": [],
      });
      render(<ChallengeDetail />);
      expect(screen.getByText("$50,000 Challenge")).toBeTruthy();
    });

    it("shows challenge rules in subtitle", () => {
      setQueryData({
        "challenge/1": makeChallenge({ profitTarget: 10, maxDrawdown: 5, maxLeverage: 30 }),
        "challenge/1/metrics": [],
      });
      render(<ChallengeDetail />);
      expect(screen.getByText(/Target: 10%/)).toBeTruthy();
      expect(screen.getByText(/Max DD: 5%/)).toBeTruthy();
      expect(screen.getByText(/Leverage: 1:30/)).toBeTruthy();
    });

    it("renders Active status badge", () => {
      setQueryData({
        "challenge/1": makeChallenge({ status: "active" }),
        "challenge/1/metrics": [],
      });
      render(<ChallengeDetail />);
      expect(screen.getByText("active")).toBeTruthy();
    });

    it("renders funded status badge", () => {
      setQueryData({
        "challenge/1": makeChallenge({ status: "funded" }),
        "challenge/1/metrics": [],
      });
      render(<ChallengeDetail />);
      expect(screen.getByText("funded")).toBeTruthy();
    });

    it("renders violated status badge", () => {
      setQueryData({
        "challenge/1": makeChallenge({ status: "violated" }),
        "challenge/1/metrics": [],
      });
      render(<ChallengeDetail />);
      expect(screen.getByText("violated")).toBeTruthy();
    });

    it("renders back navigation button", () => {
      setQueryData({
        "challenge/1": makeChallenge(),
        "challenge/1/metrics": [],
      });
      render(<ChallengeDetail />);
      // The back button uses ArrowLeft icon, check for the navigate call on click
      const buttons = screen.getAllByRole("button");
      expect(buttons.length).toBeGreaterThanOrEqual(1);
    });

    it("navigates back to challenges when back button is clicked", async () => {
      const user = userEvent.setup();
      setQueryData({
        "challenge/1": makeChallenge(),
        "challenge/1/metrics": [],
      });
      render(<ChallengeDetail />);

      // Click the first button (back button)
      const buttons = screen.getAllByRole("button");
      await user.click(buttons[0]);
      expect(mockNavigate).toHaveBeenCalledWith("/dashboard/challenges");
    });
  });

  // ─── Real-time metrics cards ───────────────────────────
  describe("Real-time Metrics Cards", () => {
    it("renders all four metric cards when metrics are available", () => {
      setQueryData({
        "challenge/1": makeChallenge(),
        "challenge/1/metrics": makeMetricsHistory(10),
        "challenge/1/latest": makeLatestMetrics(),
      });
      render(<ChallengeDetail />);
      expect(screen.getByText("Balance")).toBeTruthy();
      expect(screen.getByText("Equity")).toBeTruthy();
      expect(screen.getByText("Profit Target")).toBeTruthy();
      expect(screen.getByText("Health")).toBeTruthy();
    });

    it("displays correct balance value", () => {
      setQueryData({
        "challenge/1": makeChallenge(),
        "challenge/1/metrics": makeMetricsHistory(10),
        "challenge/1/latest": makeLatestMetrics({ balance: 25000 }),
      });
      render(<ChallengeDetail />);
      expect(screen.getByText("$25,000")).toBeTruthy();
    });

    it("displays correct equity value", () => {
      setQueryData({
        "challenge/1": makeChallenge(),
        "challenge/1/metrics": makeMetricsHistory(10),
        "challenge/1/latest": makeLatestMetrics({ equity: 27500 }),
      });
      render(<ChallengeDetail />);
      expect(screen.getByText("$27,500")).toBeTruthy();
    });

    it("displays profit target progress", () => {
      setQueryData({
        "challenge/1": makeChallenge(),
        "challenge/1/metrics": makeMetricsHistory(10),
        "challenge/1/latest": makeLatestMetrics({ profitTargetProgress: 45.7 }),
      });
      render(<ChallengeDetail />);
      expect(screen.getByText("45.7%")).toBeTruthy();
    });

    it("displays health score", () => {
      setQueryData({
        "challenge/1": makeChallenge(),
        "challenge/1/metrics": makeMetricsHistory(10),
        "challenge/1/latest": makeLatestMetrics({ healthScore: 88 }),
      });
      render(<ChallengeDetail />);
      expect(screen.getByText("88/100")).toBeTruthy();
    });

    it("does not render metrics cards when metrics are null", () => {
      setQueryData({
        "challenge/1": makeChallenge(),
        "challenge/1/metrics": makeMetricsHistory(10),
        "challenge/1/latest": null,
      });
      render(<ChallengeDetail />);
      expect(screen.queryByText("Balance")).toBeNull();
      expect(screen.queryByText("Equity")).toBeNull();
    });

    it("handles zero balance and equity", () => {
      setQueryData({
        "challenge/1": makeChallenge(),
        "challenge/1/metrics": makeMetricsHistory(10),
        "challenge/1/latest": makeLatestMetrics({ balance: 0, equity: 0 }),
      });
      render(<ChallengeDetail />);
      // Balance and Equity labels prove the cards render with zero values
      expect(screen.getByText("Balance")).toBeTruthy();
      expect(screen.getByText("Equity")).toBeTruthy();
      // The $ and 0 are split by React, so verify the stat-value divs exist
      const statValues = screen.getAllByText((t) => t.includes("0") && !t.includes("10,000"));
      expect(statValues.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ─── Balance & Equity chart ────────────────────────────
  describe("Balance & Equity Chart", () => {
    it("renders the Balance & Equity chart section when history exists", () => {
      setQueryData({
        "challenge/1": makeChallenge(),
        "challenge/1/metrics": makeMetricsHistory(30),
      });
      render(<ChallengeDetail />);
      expect(screen.getByText("Balance & Equity")).toBeTruthy();
      expect(screen.getByTestId("line-chart")).toBeTruthy();
    });

    it("renders chart with balance and equity data lines", () => {
      setQueryData({
        "challenge/1": makeChallenge(),
        "challenge/1/metrics": makeMetricsHistory(20),
      });
      render(<ChallengeDetail />);
      const lines = screen.getAllByTestId("recharts-line");
      expect(lines.length).toBeGreaterThanOrEqual(1);
    });

    it("renders chart axes", () => {
      setQueryData({
        "challenge/1": makeChallenge(),
        "challenge/1/metrics": makeMetricsHistory(15),
      });
      render(<ChallengeDetail />);
      expect(screen.getAllByTestId("recharts-xaxis").length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByTestId("recharts-yaxis").length).toBeGreaterThanOrEqual(1);
    });

    it("renders chart grid", () => {
      setQueryData({
        "challenge/1": makeChallenge(),
        "challenge/1/metrics": makeMetricsHistory(10),
      });
      render(<ChallengeDetail />);
      expect(screen.getAllByTestId("recharts-grid").length).toBeGreaterThanOrEqual(1);
    });

    it("renders chart container with config", () => {
      setQueryData({
        "challenge/1": makeChallenge(),
        "challenge/1/metrics": makeMetricsHistory(10),
      });
      render(<ChallengeDetail />);
      expect(screen.getAllByTestId("chart-container").length).toBeGreaterThanOrEqual(1);
    });

    it("renders chart tooltip", () => {
      setQueryData({
        "challenge/1": makeChallenge(),
        "challenge/1/metrics": makeMetricsHistory(10),
      });
      render(<ChallengeDetail />);
      const tooltips = screen.getAllByTestId("chart-tooltip");
      expect(tooltips.length).toBeGreaterThanOrEqual(1);
      expect(tooltips.length).toBe(2); // one per chart (line + area)
    });
  });

  // ─── Drawdown tracker ──────────────────────────────────
  describe("Drawdown Tracker", () => {
    it("renders the Drawdown chart section when history exists", () => {
      setQueryData({
        "challenge/1": makeChallenge(),
        "challenge/1/metrics": makeMetricsHistory(30),
      });
      render(<ChallengeDetail />);
      expect(screen.getByText("Drawdown")).toBeTruthy();
      expect(screen.getByTestId("area-chart")).toBeTruthy();
    });

    it("renders drawdown area chart with gradient fill", () => {
      setQueryData({
        "challenge/1": makeChallenge(),
        "challenge/1/metrics": makeMetricsHistory(20),
      });
      render(<ChallengeDetail />);
      const areaChart = screen.getByTestId("area-chart");
      expect(areaChart).toBeTruthy();
      // The drawdown chart renders an Area component
      expect(screen.getByTestId("recharts-area")).toBeTruthy();
    });

    it("does not render drawdown chart when no history", () => {
      setQueryData({
        "challenge/1": makeChallenge(),
        "challenge/1/metrics": [],
      });
      render(<ChallengeDetail />);
      expect(screen.queryByText("Drawdown")).toBeNull();
      expect(screen.queryByTestId("area-chart")).toBeNull();
    });

    it("renders drawdown data with both current and daily drawdown", () => {
      setQueryData({
        "challenge/1": makeChallenge(),
        "challenge/1/metrics": makeMetricsHistory(15),
      });
      render(<ChallengeDetail />);
      // Both charts should be present
      expect(screen.getByTestId("line-chart")).toBeTruthy();
      expect(screen.getByTestId("area-chart")).toBeTruthy();
    });
  });

  // ─── Empty metrics state ───────────────────────────────
  describe("Empty Metrics State", () => {
    it("shows 'No metrics recorded yet' when no history data", () => {
      setQueryData({
        "challenge/1": makeChallenge(),
        "challenge/1/metrics": [],
      });
      render(<ChallengeDetail />);
      expect(screen.getByText("No metrics recorded yet")).toBeTruthy();
    });

    it("shows Activity icon in empty state", () => {
      setQueryData({
        "challenge/1": makeChallenge(),
        "challenge/1/metrics": [],
      });
      const { container } = render(<ChallengeDetail />);
      // The Activity icon is rendered with h-8 w-8 class
      const emptyIcon = container.querySelector(".h-8.w-8");
      expect(emptyIcon).toBeTruthy();
    });

    it("does not render charts when metrics are empty", () => {
      setQueryData({
        "challenge/1": makeChallenge(),
        "challenge/1/metrics": [],
      });
      render(<ChallengeDetail />);
      expect(screen.queryByTestId("line-chart")).toBeNull();
      expect(screen.queryByTestId("area-chart")).toBeNull();
    });
  });

  // ─── Large datasets / downsampling ─────────────────────
  describe("Chart Downsampling", () => {
    it("renders charts with large datasets without errors", () => {
      setQueryData({
        "challenge/1": makeChallenge(),
        "challenge/1/metrics": makeMetricsHistory(200),
      });
      render(<ChallengeDetail />);
      expect(screen.getByTestId("line-chart")).toBeTruthy();
      expect(screen.getByTestId("area-chart")).toBeTruthy();
    });

    it("renders charts with small datasets", () => {
      setQueryData({
        "challenge/1": makeChallenge(),
        "challenge/1/metrics": makeMetricsHistory(3),
      });
      render(<ChallengeDetail />);
      expect(screen.getByTestId("line-chart")).toBeTruthy();
      expect(screen.getByTestId("area-chart")).toBeTruthy();
    });

    it("renders charts with single data point", () => {
      setQueryData({
        "challenge/1": makeChallenge(),
        "challenge/1/metrics": makeMetricsHistory(1),
      });
      render(<ChallengeDetail />);
      expect(screen.getByTestId("line-chart")).toBeTruthy();
    });
  });

  // ─── Challenge statuses in header ──────────────────────
  describe("Challenge Status Variants", () => {
    it("renders phase_1_passed status", () => {
      setQueryData({
        "challenge/1": makeChallenge({ status: "phase_1_passed" }),
        "challenge/1/metrics": [],
      });
      render(<ChallengeDetail />);
      expect(screen.getByText("phase_1_passed")).toBeTruthy();
    });

    it("renders phase_2_passed status", () => {
      setQueryData({
        "challenge/1": makeChallenge({ status: "phase_2_passed" }),
        "challenge/1/metrics": [],
      });
      render(<ChallengeDetail />);
      expect(screen.getByText("phase_2_passed")).toBeTruthy();
    });

    it("renders expired status", () => {
      setQueryData({
        "challenge/1": makeChallenge({ status: "expired" }),
        "challenge/1/metrics": [],
      });
      render(<ChallengeDetail />);
      expect(screen.getByText("expired")).toBeTruthy();
    });
  });

  // ─── Full integration ──────────────────────────────────
  describe("Full Integration", () => {
    it("renders all sections together with complete data", () => {
      setQueryData({
        "challenge/1": makeChallenge({ accountSize: 25000, status: "active", profitTarget: 10, maxDrawdown: 5, maxLeverage: 50 }),
        "challenge/1/metrics": makeMetricsHistory(30),
        "challenge/1/latest": makeLatestMetrics(),
      });
      render(<ChallengeDetail />);

      // Header
      expect(screen.getByText("$25,000 Challenge")).toBeTruthy();
      expect(screen.getByText(/Target: 10%/)).toBeTruthy();
      expect(screen.getByText(/Max DD: 5%/)).toBeTruthy();
      expect(screen.getByText(/Leverage: 1:50/)).toBeTruthy();
      expect(screen.getByText("active")).toBeTruthy();

      // Metrics cards
      expect(screen.getByText("Balance")).toBeTruthy();
      expect(screen.getByText("Equity")).toBeTruthy();
      expect(screen.getByText("Profit Target")).toBeTruthy();
      expect(screen.getByText("Health")).toBeTruthy();

      // Balance & Equity chart
      expect(screen.getByText("Balance & Equity")).toBeTruthy();
      expect(screen.getByTestId("line-chart")).toBeTruthy();

      // Drawdown chart
      expect(screen.getByText("Drawdown")).toBeTruthy();
      expect(screen.getByTestId("area-chart")).toBeTruthy();
    });

    it("renders without metrics cards when latest metrics are null", () => {
      setQueryData({
        "challenge/1": makeChallenge({ accountSize: 10000 }),
        "challenge/1/metrics": makeMetricsHistory(10),
        "challenge/1/latest": null,
      });
      render(<ChallengeDetail />);

      // Header still shows
      expect(screen.getByText("$10,000 Challenge")).toBeTruthy();

      // Metrics cards hidden
      expect(screen.queryByText("Balance")).toBeNull();
      expect(screen.queryByText("Health")).toBeNull();

      // Charts still show
      expect(screen.getByTestId("line-chart")).toBeTruthy();
      expect(screen.getByTestId("area-chart")).toBeTruthy();
    });

    it("renders not found state with correct navigation", async () => {
      const user = userEvent.setup();
      setQueryData({
        "challenge/999": null,
        "challenge/999/metrics": [],
      });
      mockParams.id = "999";
      render(<ChallengeDetail />);

      expect(screen.getByText("Challenge not found")).toBeTruthy();

      await user.click(screen.getByText("Back"));
      expect(mockNavigate).toHaveBeenCalledWith("/dashboard/challenges");
    });
  });

  // ─── User parameter ────────────────────────────────────
  describe("URL Parameter", () => {
    it("uses the id from URL params for API queries", () => {
      mockParams.id = "42";
      setQueryData({
        "challenge/42": makeChallenge({ id: 42, accountSize: 100000 }),
        "challenge/42/metrics": makeMetricsHistory(5),
      });
      render(<ChallengeDetail />);
      expect(screen.getByText("$100,000 Challenge")).toBeTruthy();
    });

    it("defaults to '0' when no id param", () => {
      mockParams.id = undefined as any;
      setQueryData({
        "challenge/0": null,
        "challenge/0/metrics": [],
      });
      render(<ChallengeDetail />);
      expect(screen.getByText("Challenge not found")).toBeTruthy();
    });
  });
});
