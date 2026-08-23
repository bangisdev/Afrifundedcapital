// @vitest-environment jsdom
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";

// ─── Mock: sonner ──────────────────────────────────────────
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

// ─── Mock: useAuth ─────────────────────────────────────────
vi.mock("@/hooks/use-auth", () => ({
  useAuth: vi.fn(() => ({
    isLoading: false,
    isAuthenticated: true,
    user: { id: 1, name: "Trader", email: "t@x.com", role: "user" },
    error: null,
    signIn: vi.fn(),
    signOut: vi.fn(),
    refetch: vi.fn(),
  })),
}));

// ─── Mock: useApiQuery / useApiMutation ────────────────────
const mockCreateEntry = vi.fn(async () => ({ id: 99, message: "created" }));
const mockDeleteEntry = vi.fn(async () => ({ message: "deleted" }));

const journalData = {
  entries: [
    {
      id: 1,
      userId: 1,
      challengeId: 1,
      symbol: "EURUSD",
      direction: "buy",
      lotSize: 0.1,
      entryPrice: 1.1,
      exitPrice: 1.105,
      stopLoss: 1.095,
      takeProfit: 1.11,
      pnl: 50,
      commission: -2,
      swap: 0,
      pips: 50,
      openTime: Date.now() - 3600000,
      closeTime: Date.now(),
      duration: 3600,
      strategy: "Trend Following",
      timeframe: "H1",
      setupQuality: 4,
      emotionalState: "confident",
      outcome: "win",
      tags: JSON.stringify(["breakout"]),
      notes: "Clean break of resistance",
      lessonsLearned: "Patience pays off",
      screenshots: "[]",
      createdAt: Date.now(),
    },
  ],
  stats: {
    totalTrades: 1,
    wins: 1,
    losses: 0,
    breakeven: 0,
    winRate: 100,
    totalPnl: 50,
    avgWin: 50,
    avgLoss: 0,
    profitFactor: 10,
    largestWin: 50,
    largestLoss: 0,
    avgSetupQuality: 4,
    strategyStats: [
      { name: "Trend Following", total: 1, winRate: 100, pnl: 50 },
    ],
    symbolStats: [
      { symbol: "EURUSD", total: 1, winRate: 100, pnl: 50 },
    ],
  },
  symbols: ["EURUSD"],
  strategies: ["Trend Following"],
};

vi.mock("@/hooks/use-api", () => ({
  useApiQuery: vi.fn(() => ({
    data: journalData,
    isLoading: false,
    refetch: vi.fn(),
  })),
  useApiMutation: vi.fn(() => ({
    mutateAsync: vi.fn(async () => ({ id: 99 })),
    isLoading: false,
  })),
}));

// ─── Mock: framer-motion ──────────────────────────────────
vi.mock("framer-motion", () => {
  const animated = (tag: string) =>
    React.forwardRef<any, any>((props, ref) => {
      const { initial, animate, exit, transition, whileInView, viewport, ...rest } = props;
      return React.createElement(tag, { ref, ...rest }, props.children);
    });
  return {
    motion: new Proxy(
      {},
      {
        get: (_: any, tag: string) => animated(tag),
      }
    ),
    AnimatePresence: ({ children }: any) => children,
  };
});

// ─── Mock: lucide-react ───────────────────────────────────
vi.mock("lucide-react", () => {
  const createIcon = (name: string) => {
    const Icon = (props: any) =>
      React.createElement("span", { "data-testid": `icon-${name}`, ...props });
    Icon.displayName = name;
    return Icon;
  };
  const icons: Record<string, any> = {};
  const iconNames = [
    "BookOpen", "Plus", "Search", "Filter", "TrendingUp", "TrendingDown",
    "Minus", "Target", "BarChart3", "X", "ChevronDown", "ChevronUp",
    "Clock", "Star", "Brain", "Tag", "Camera", "Trash2", "Edit3", "Eye",
    "ArrowUpRight", "ArrowDownRight", "DollarSign", "Trophy", "Flame",
    "AlertTriangle", "ImagePlus", "XCircle", "ChevronLeft", "RefreshCw",
  ];
  iconNames.forEach((n) => { icons[n] = createIcon(n); });
  return icons;
});

import Journal from "@/pages/dashboard/Journal";

describe("Journal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the page title", () => {
    render(<Journal />);
    expect(screen.getByText("Trade Journal")).toBeTruthy();
  });

  it("renders the page description", () => {
    render(<Journal />);
    expect(screen.getByText(/Log every trade/)).toBeTruthy();
  });

  it("renders stats cards", () => {
    render(<Journal />);
    expect(screen.getByText("Total Trades")).toBeTruthy();
    expect(screen.getByText("Win Rate")).toBeTruthy();
    expect(screen.getByText("Total P&L")).toBeTruthy();
  });

  it("displays profit factor stat", () => {
    render(<Journal />);
    expect(screen.getByText("Profit Factor")).toBeTruthy();
  });

  it("renders the New Entry button", () => {
    render(<Journal />);
    expect(screen.getByText("New Entry")).toBeTruthy();
  });

  it("renders journal entries with symbol", () => {
    render(<Journal />);
    // EURUSD appears in the card and the symbol stats section
    const matches = screen.getAllByText("EURUSD");
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  it("displays trade direction", () => {
    render(<Journal />);
    expect(screen.getByText("BUY")).toBeTruthy();
  });

  it("displays P&L value in NGN format", () => {
    render(<Journal />);
    // formatMoney defaults to NGN: ₦ appears in stat cards and entry cards
    const nairaMatches = screen.getAllByText(/₦/);
    expect(nairaMatches.length).toBeGreaterThanOrEqual(1);
  });

  it("shows the win rate percentage", () => {
    render(<Journal />);
    // winRate is 100, rendered as toFixed(1) → "100.0%"
    expect(screen.getByText("100.0%")).toBeTruthy();
  });

  it("opens the form when New Entry is clicked", () => {
    render(<Journal />);
    fireEvent.click(screen.getByText("New Entry"));
    expect(screen.getByText("Log New Trade")).toBeTruthy();
  });

  it("renders the search input placeholder", () => {
    render(<Journal />);
    expect(screen.getByPlaceholderText(/Search trades/)).toBeTruthy();
  });

  it("shows the emotional state badge on a winning trade", () => {
    render(<Journal />);
    expect(screen.getByText("confident")).toBeTruthy();
  });

  it("renders the page header icon", () => {
    render(<Journal />);
    expect(screen.getByTestId("icon-BookOpen")).toBeTruthy();
  });

  it("displays the notes for a trade in detail view", () => {
    const { container } = render(<Journal />);
    // Click the entry card to open detail modal
    // Find the clickable group container that wraps the trade entry
    const clickableCards = container.querySelectorAll(".cursor-pointer");
    if (clickableCards.length > 0) {
      fireEvent.click(clickableCards[0]);
    }
    // Notes appear in the detail modal
    const notes = screen.queryByText("Clean break of resistance");
    expect(notes).toBeTruthy();
  });

  it("renders trade card tags", () => {
    render(<Journal />);
    expect(screen.getByText("breakout")).toBeTruthy();
  });

  it("displays the strategy name in entries", () => {
    render(<Journal />);
    // "Trend Following" appears in the entry card AND strategy stats — use getAllByText
    const matches = screen.getAllByText("Trend Following");
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  it("shows setup quality stars", () => {
    render(<Journal />);
    const stars = document.querySelectorAll("[data-testid='icon-Star']");
    expect(stars.length).toBeGreaterThanOrEqual(1);
  });

  it("shows performance by strategy section", () => {
    render(<Journal />);
    expect(screen.getByText("Performance by Strategy")).toBeTruthy();
  });

  it("shows performance by symbol section", () => {
    render(<Journal />);
    expect(screen.getByText("Performance by Symbol")).toBeTruthy();
  });

  it("shows the trade log section", () => {
    render(<Journal />);
    expect(screen.getByText("Trade Log")).toBeTruthy();
  });


});
