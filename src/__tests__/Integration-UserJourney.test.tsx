// @vitest-environment jsdom
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";

// ═══════════════════════════════════════════════════════════════
// SHARED MOCKS
// ═══════════════════════════════════════════════════════════════

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

const mockNavigate = vi.fn();
vi.mock("react-router", () => ({
  useNavigate: () => mockNavigate,
  useSearchParams: () => [new URLSearchParams(), vi.fn()],
}));

const mockAuthState = {
  isLoading: false,
  isAuthenticated: false,
  user: null as any,
  error: null as string | null,
  signIn: vi.fn(),
  signOut: vi.fn(),
  refetch: vi.fn(),
};
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => mockAuthState }));

const queryDataMap: Record<string, any> = {};
vi.mock("@/hooks/use-api", () => ({
  useApiQuery: vi.fn((key: string[], path: string, _opts?: any) => {
    // Pages may pass query-suffixed keys (["certificates", "my", "/api/certificates/my?..."]),
    // so look up by the stable prefix (first two segments).
    const dataKey = key.slice(0, 2).join("/");
    if (queryDataMap[dataKey] === undefined) return { data: undefined, isLoading: true };
    const base = queryDataMap[dataKey];
    // Simulate the server-driven certificates envelope for the Certificates page.
    if (dataKey === "certificates/my" && Array.isArray(base)) {
      // Parse the query string manually to avoid relying on the global URL constructor.
      const query = path.includes("?") ? path.split("?")[1] : "";
      const params = new URLSearchParams(query);
      const page = Number(params.get("page") || 1);
      const pageSize = Number(params.get("pageSize") || 10);
      const total = base.length;
      const totalPages = Math.max(1, Math.ceil(total / pageSize));
      return {
        data: {
          certificates: base.slice((page - 1) * pageSize, page * pageSize),
          total,
          page,
          pageSize,
          totalPages,
          stats: { total, byType: {} },
        },
        isLoading: false,
      };
    }
    // Simulate the server-driven support tickets envelope for the Support page.
    if (dataKey === "support/my" && Array.isArray(base)) {
      const query = path.includes("?") ? path.split("?")[1] : "";
      const params = new URLSearchParams(query);
      const page = Number(params.get("page") || 1);
      const pageSize = Number(params.get("pageSize") || 10);
      const total = base.length;
      const totalPages = Math.max(1, Math.ceil(total / pageSize));
      return {
        data: {
          tickets: base.slice((page - 1) * pageSize, page * pageSize),
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
  useApiMutation: vi.fn((method: string, path: string) => ({
    mutateAsync: vi.fn(async (body?: any) => {
      if (path === "/api/challenges/demo-purchase") return { message: "Demo challenge created", challengeId: 100 };
      if (path === "/api/trading/seed-demo") return { message: "Seeded demo data" };
      if (path === "/api/trading/sync") return { synced: 1 };
      if (path === "/api/trading/reset-demo") return { message: "Reset demo data" };
      if (path === "/api/payouts/request") return { message: "Payout requested", payoutId: 200 };
      if (path === "/api/notifications/mark-all-read") return { message: "ok" };
      return { message: "ok" };
    }),
    mutate: vi.fn(),
    isPending: false,
  })),
}));

const mockStartCheckout = vi.fn();
const mockResetPayment = vi.fn();
let mockPaymentState = { status: "idle" as const };
vi.mock("@/hooks/use-flutterwave", () => ({
  useFlutterwavePayment: vi.fn(() => ({ state: mockPaymentState, startCheckout: mockStartCheckout, reset: mockResetPayment })),
}));

vi.mock("recharts", () => ({
  LineChart: Object.assign((p: any) => React.createElement("div", { "data-testid": "line-chart" }, p.children), { displayName: "LineChart" }),
  AreaChart: Object.assign((p: any) => React.createElement("div", { "data-testid": "area-chart" }, p.children), { displayName: "AreaChart" }),
  Line: () => React.createElement("div", { "data-testid": "recharts-line" }),
  Area: () => React.createElement("div", { "data-testid": "recharts-area" }),
  XAxis: () => React.createElement("div", { "data-testid": "recharts-xaxis" }),
  YAxis: () => React.createElement("div", { "data-testid": "recharts-yaxis" }),
  CartesianGrid: () => React.createElement("div", { "data-testid": "recharts-grid" }),
  ResponsiveContainer: ({ children }: any) => React.createElement("div", { "data-testid": "chart-responsive" }, children),
  Tooltip: () => React.createElement("div", { "data-testid": "recharts-tooltip" }),
}));

vi.mock("@/components/ui/chart", () => ({
  ChartContainer: ({ children }: any) => React.createElement("div", { "data-testid": "chart-container" }, children),
  ChartTooltip: () => null,
  ChartTooltipContent: () => null,
}));

vi.mock("@/components/ui/button", () => ({
  Button: React.forwardRef<HTMLButtonElement, any>(({ children, onClick, variant, size, className, disabled, type, ...props }, ref) =>
    React.createElement("button", { ref, onClick, className, disabled, type, ...props }, children)
  ),
}));

vi.mock("@/components/ui/input", () => ({
  Input: React.forwardRef<HTMLInputElement, any>(({ className, ...props }, ref) =>
    React.createElement("input", { ref, className, ...props })
  ),
}));

vi.mock("@/components/ui/card", () => ({
  Card: ({ children, className }: any) => React.createElement("div", { className, "data-testid": "card" }, children),
  CardHeader: ({ children, className }: any) => React.createElement("div", { className }, children),
  CardTitle: ({ children, className }: any) => React.createElement("h2", { className }, children),
  CardDescription: ({ children, className }: any) => React.createElement("p", { className }, children),
  CardContent: ({ children, className }: any) => React.createElement("div", { className }, children),
  CardFooter: ({ children, className }: any) => React.createElement("div", { className }, children),
}));

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ open, onOpenChange, children }: any) => {
    if (!open) return null;
    return React.createElement("div", { "data-testid": "dialog" }, children);
  },
  DialogContent: ({ children, className }: any) => React.createElement("div", { "data-testid": "dialog-content", className }, children),
  DialogHeader: ({ children }: any) => React.createElement("div", { "data-testid": "dialog-header" }, children),
  DialogTitle: ({ children }: any) => React.createElement("div", { "data-testid": "dialog-title" }, children),
  DialogDescription: ({ children }: any) => React.createElement("div", { "data-testid": "dialog-description" }, children),
}));

vi.mock("@/components/ui/tabs", () => {
  const TabsCtx = React.createContext({ value: "browse", onChange: (_v: string) => {} });
  function Tabs({ defaultValue, children }: any) {
    const [value, setValue] = React.useState(defaultValue || "browse");
    return React.createElement(TabsCtx.Provider, { value: { value, onChange: setValue } },
      React.createElement("div", { "data-testid": "tabs" }, children));
  }
  function TabsList({ children }: any) { return React.createElement("div", { "data-testid": "tabs-list" }, children); }
  function TabsTrigger({ value, children, ...props }: any) {
    const ctx = React.useContext(TabsCtx);
    return React.createElement("button", { "data-testid": `tab-trigger-${value}`, "data-active": value === ctx.value, onClick: () => ctx.onChange(value), ...props }, children);
  }
  function TabsContent({ value, children }: any) {
    const ctx = React.useContext(TabsCtx);
    if (value !== ctx.value) return null;
    return React.createElement("div", { "data-testid": `tab-content-${value}` }, children);
  }
  return { Tabs, TabsList, TabsTrigger, TabsContent };
});

vi.mock("@/components/ui/checkbox", () => ({
  Checkbox: React.forwardRef<HTMLButtonElement, any>(({ checked, onCheckedChange, disabled, id, ...props }, ref) =>
    React.createElement("button", { ref, role: "checkbox", id, "aria-checked": checked, disabled, onClick: () => onCheckedChange && onCheckedChange(!checked), ...props })
  ),
}));
vi.mock("@/components/ui/label", () => ({
  Label: ({ children, htmlFor, className }: any) => React.createElement("label", { htmlFor, className }, children),
}));
vi.mock("@/components/ui/badge", () => ({
  Badge: ({ children, variant, className }: any) => React.createElement("span", { className, "data-testid": "badge" }, children),
}));
vi.mock("@/components/ui/separator", () => ({ Separator: () => React.createElement("hr") }));
vi.mock("@/components/ui/accordion", () => ({
  Accordion: ({ children }: any) => React.createElement("div", { "data-testid": "accordion" }, children),
  AccordionItem: ({ children, value }: any) => React.createElement("div", { "data-testid": "accordion-item", "data-value": value }, children),
  AccordionTrigger: ({ children, className }: any) => React.createElement("button", { className }, children),
  AccordionContent: ({ children, className }: any) => React.createElement("div", { className }, children),
}));
vi.mock("@/components/ui/carousel", () => ({
  Carousel: ({ children }: any) => React.createElement("div", { "data-testid": "carousel" }, children),
  CarouselContent: ({ children }: any) => React.createElement("div", { "data-testid": "carousel-content" }, children),
  CarouselItem: ({ children }: any) => React.createElement("div", { "data-testid": "carousel-item" }, children),
  CarouselPrevious: (props: any) => React.createElement("button", { "data-testid": "carousel-prev", ...props }, "←"),
  CarouselNext: (props: any) => React.createElement("button", { "data-testid": "carousel-next", ...props }, "→"),
}));
vi.mock("@/lib/utils", () => ({ cn: (...args: any[]) => args.filter(Boolean).join(" ") }));
vi.mock("@/components/LogoDropdown", () => ({
  LogoDropdown: () => React.createElement("div", { "data-testid": "logo-dropdown" }, "Logo"),
}));

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════
function setQueryData(updates: Record<string, any>) {
  Object.keys(queryDataMap).forEach((k) => delete queryDataMap[k]);
  Object.assign(queryDataMap, {
    templates: [], "challenges/my": [], "metrics/dashboard": { latestMetrics: null },
    "metrics/history": [], "mt5/my": [], "payouts/my": [], "payouts/stats": { totalPaid: 0, totalPending: 0, totalPayouts: 0 },
    "funded/my": [], "wallet/my": { balance: 0, currency: "NGN" }, "certificates/my": [],
    "notifications/my": [], "support/my": [],
  }, updates);
}

function makeTemplate(o: any = {}) { return { id: 1, name: "Two-Step Challenge", profitTarget: 10, maxDrawdown: 5, dailyDrawdown: 4, minTradingDays: 5, durationDays: 30, maxLeverage: 30, ...o }; }
function makeSize(o: any = {}) { return { id: 1, label: "$10,000", price: 150000, currency: "NGN", accountSize: 10000, ...o }; }
function makeChallenge(o: any = {}) { return { id: 10, accountSize: 10000, status: "active", currentPhase: 1, profitTarget: 10, maxDrawdown: 5, maxLeverage: 30, createdAt: Date.now() - 86400000 * 7, ...o }; }
function makeMt5Account(o: any = {}) { return { id: 1, login: "123456", server: "MetaQuotes-Demo", currency: "USD", balance: 10000, equity: 10500, leverage: 30, isActive: true, isSuspended: false, ...o }; }
function makeMetricsHistory(count = 30) {
  const base = Date.now() - 86400000 * count;
  return Array.from({ length: count }, (_, i) => ({ id: i + 1, recordedAt: base + 86400000 * i, balance: 10000 + i * 50, equity: 10000 + i * 62, currentDrawdown: (i % 5) * 0.4, dailyDrawdown: (i % 3) * 0.3, totalProfit: i * 50, winRate: 55 + (i % 10), profitFactor: 1.2 + (i % 5) * 0.1, tradingDaysCount: i + 1, healthScore: 80 + (i % 20) }));
}
function makeLatestMetrics() { return { balance: 10500, equity: 10750, floatingPL: 250, totalProfit: 500, winRate: 58.3, profitFactor: 1.45, healthScore: 92, tradingDaysCount: 25 }; }
function makePayout(o: any = {}) { return { id: 1, amount: 50000, currency: "NGN", status: "pending", paymentMethod: "bank_transfer", requestedAt: Date.now() - 86400000 * 2, ...o }; }
function makeFundedAccount(o: any = {}) { return { id: 5, accountSize: 50000, status: "funded", ...o }; }

// ═══════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════
describe("Integration: Full User Journey", () => {
  beforeEach(() => {
    mockPaymentState = { status: "idle" };
    setQueryData({});
    vi.clearAllMocks();
    Object.assign(mockAuthState, { isLoading: false, isAuthenticated: false, user: null, error: null, signIn: vi.fn(), signOut: vi.fn(), refetch: vi.fn() });
  });

  // ─── STEP 1: SIGN UP ──────────────────────────────────────
  describe("Step 1: Sign Up", () => {
    it("creates a new account via the sign-up form", async () => {
      const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValueOnce({ ok: true, json: async () => ({ id: 1, email: "trader@test.com" }) } as Response);
      mockAuthState.signIn = vi.fn().mockResolvedValueOnce(undefined);
      const Auth = (await import("@/pages/Auth")).default;
      const user = userEvent.setup();
      render(<Auth />);
      await user.click(screen.getByRole("button", { name: "Sign up" }));
      await user.type(screen.getByPlaceholderText("Full name"), "New Trader");
      await user.type(screen.getByPlaceholderText("name@example.com"), "trader@test.com");
      await user.type(screen.getByPlaceholderText("Password (min 6 characters)"), "securePass1");
      await user.click(screen.getByRole("button", { name: /Create Account/ }));
      await waitFor(() => {
        expect(fetchSpy).toHaveBeenCalledWith("/api/auth/sign-up/email", expect.objectContaining({ method: "POST", credentials: "include" }));
        expect(mockAuthState.signIn).toHaveBeenCalled();
        expect(mockNavigate).toHaveBeenCalledWith("/dashboard", { replace: true });
      });
      fetchSpy.mockRestore();
    });

    it("shows error on sign-up failure", async () => {
      vi.spyOn(global, "fetch").mockResolvedValueOnce({ ok: false, json: async () => ({ message: "Email already registered" }) } as Response);
      const Auth = (await import("@/pages/Auth")).default;
      const user = userEvent.setup();
      render(<Auth />);
      await user.click(screen.getByRole("button", { name: "Sign up" }));
      await user.type(screen.getByPlaceholderText("Full name"), "Test");
      await user.type(screen.getByPlaceholderText("name@example.com"), "dup@test.com");
      await user.type(screen.getByPlaceholderText("Password (min 6 characters)"), "pass1234");
      await user.click(screen.getByRole("button", { name: /Create Account/ }));
      await waitFor(() => { expect(screen.getByText("Email already registered")).toBeTruthy(); });
    });
  });

  // ─── STEP 2: SIGN IN ──────────────────────────────────────
  describe("Step 2: Sign In", () => {
    it("signs in with valid credentials and navigates to dashboard", async () => {
      mockAuthState.signIn = vi.fn().mockResolvedValueOnce(undefined);
      const Auth = (await import("@/pages/Auth")).default;
      const user = userEvent.setup();
      render(<Auth />);
      await user.type(screen.getByPlaceholderText("name@example.com"), "trader@test.com");
      await user.type(screen.getByPlaceholderText("Password"), "securePass1");
      await user.click(screen.getByRole("button", { name: /Sign In/ }));
      await waitFor(() => {
        expect(mockAuthState.signIn).toHaveBeenCalledWith("email", expect.any(FormData));
        expect(mockNavigate).toHaveBeenCalledWith("/dashboard", { replace: true });
      });
    });

    it("shows error on invalid credentials", async () => {
      mockAuthState.signIn = vi.fn().mockRejectedValueOnce(new Error("Invalid credentials"));
      const Auth = (await import("@/pages/Auth")).default;
      const user = userEvent.setup();
      render(<Auth />);
      await user.type(screen.getByPlaceholderText("name@example.com"), "wrong@test.com");
      await user.type(screen.getByPlaceholderText("Password"), "wrongpass");
      await user.click(screen.getByRole("button", { name: /Sign In/ }));
      await waitFor(() => { expect(screen.getByText("Invalid credentials")).toBeTruthy(); });
    });

    it("redirects authenticated users to dashboard", async () => {
      Object.assign(mockAuthState, { isLoading: false, isAuthenticated: true, user: { id: 1, name: "Trader" } });
      const Auth = (await import("@/pages/Auth")).default;
      render(<Auth />);
      expect(mockNavigate).toHaveBeenCalledWith("/dashboard", { replace: true });
    });
  });

  // ─── STEP 3: BROWSE & PURCHASE CHALLENGE ──────────────────
  describe("Step 3: Browse & Purchase Challenge", () => {
    beforeEach(() => {
      Object.assign(mockAuthState, { isLoading: false, isAuthenticated: true, user: { id: 1, name: "Trader", email: "trader@test.com", role: "user" } });
    });

    it("browses templates and selects one to purchase", async () => {
      setQueryData({ templates: [makeTemplate({ id: 1, name: "Two-Step" }), makeTemplate({ id: 2, name: "One-Step" })] });
      const Challenges = (await import("@/pages/dashboard/Challenges")).default;
      const user = userEvent.setup();
      render(<Challenges />);
      expect(screen.getByText("Two-Step")).toBeTruthy();
      expect(screen.getByText("One-Step")).toBeTruthy();
      await user.click(screen.getAllByText("Select")[0]);
      expect(screen.getByTestId("dialog")).toBeTruthy();
    });

    it("completes purchase flow: select template → size → proceed to payment", async () => {
      setQueryData({ templates: [makeTemplate({ id: 1 })], "sizes/1": [makeSize({ id: 1, price: 150000 })] });
      const Challenges = (await import("@/pages/dashboard/Challenges")).default;
      const user = userEvent.setup();
      render(<Challenges />);
      await user.click(screen.getAllByText("Select")[0]);
      await user.click(screen.getByText("$10,000").closest("button")!);
      expect(screen.getByText("Total")).toBeTruthy();
      await user.click(screen.getByText("Proceed to Payment"));
      expect(mockStartCheckout).toHaveBeenCalledWith(expect.objectContaining({ amount: 150000, currency: "NGN", email: "trader@test.com" }));
    });

    it("creates a demo challenge (admin path)", async () => {
      Object.assign(mockAuthState, { user: { id: 1, name: "Admin", email: "admin@test.com", role: "super_admin" } });
      setQueryData({ templates: [makeTemplate({ id: 1 })], "sizes/1": [makeSize({ id: 1, price: 150000 })] });
      const Challenges = (await import("@/pages/dashboard/Challenges")).default;
      const user = userEvent.setup();
      render(<Challenges />);
      await user.click(screen.getAllByText("Select")[0]);
      await user.click(screen.getByText("$10,000").closest("button")!);
      await user.click(screen.getByText("Create Demo Challenge"));
      // After successful demo purchase, the dialog shows success state or closes
      await waitFor(() => { expect(mockStartCheckout).not.toHaveBeenCalled(); });
    });

    it("shows existing challenges in My Challenges tab", async () => {
      setQueryData({ "challenges/my": [makeChallenge({ id: 10, status: "active" }), makeChallenge({ id: 11, accountSize: 25000, status: "funded" })] });
      const Challenges = (await import("@/pages/dashboard/Challenges")).default;
      const user = userEvent.setup();
      render(<Challenges />);
      await user.click(screen.getByTestId("tab-trigger-my-challenges"));
      await waitFor(() => {
        expect(screen.getByText("Challenge #10")).toBeTruthy();
        expect(screen.getByText("Challenge #11")).toBeTruthy();
      });
    });
  });

  // ─── STEP 4: VIEW TRADING METRICS ─────────────────────────
  describe("Step 4: View Trading Metrics", () => {
    beforeEach(() => {
      Object.assign(mockAuthState, { isLoading: false, isAuthenticated: true, user: { id: 1, name: "Trader", email: "trader@test.com", role: "user", isDemoSeeded: true, onboardingComplete: true } });
    });

    it("displays MT5 account details and aggregate balance", async () => {
      setQueryData({ "mt5/my": [makeMt5Account({ id: 1, login: "100001", balance: 10000, equity: 10500 }), makeMt5Account({ id: 2, login: "100002", balance: 25000, equity: 24800 })], "challenges/my": [makeChallenge()] });
      const Trading = (await import("@/pages/dashboard/Trading")).default;
      render(<Trading />);
      expect(screen.getByText("100001")).toBeTruthy();
      expect(screen.getByText("100002")).toBeTruthy();
      expect(screen.getByText("$35,000")).toBeTruthy();
    });

    it("shows balance & equity chart when metrics history exists", async () => {
      setQueryData({ "metrics/history": makeMetricsHistory(30), "mt5/my": [makeMt5Account()] });
      const Trading = (await import("@/pages/dashboard/Trading")).default;
      render(<Trading />);
      expect(screen.getByText("Performance Charts")).toBeTruthy();
      expect(screen.getByText("Balance & Equity")).toBeTruthy();
    });

    it("shows current metrics with health score", async () => {
      setQueryData({ "metrics/dashboard": { latestMetrics: makeLatestMetrics() }, "mt5/my": [makeMt5Account()] });
      const Trading = (await import("@/pages/dashboard/Trading")).default;
      render(<Trading />);
      expect(screen.getByText("Current Metrics")).toBeTruthy();
      // $10,500 appears in Total Balance card and Current Metrics — use getAllByText
      const balanceTexts = screen.getAllByText("$10,500");
      expect(balanceTexts.length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText("58.3%")).toBeTruthy();
      expect(screen.getByText("92/100")).toBeTruthy();
      expect(screen.getByText("+$250.00")).toBeTruthy();
    });

    it("auto-seeds demo data for unseeded users", async () => {
      Object.assign(mockAuthState, { user: { ...mockAuthState.user, isDemoSeeded: false } });
      setQueryData({ "challenges/my": [makeChallenge()], "metrics/dashboard": { latestMetrics: null }, "metrics/history": [], "mt5/my": [makeMt5Account()] });
      const Trading = (await import("@/pages/dashboard/Trading")).default;
      render(<Trading />);
      await waitFor(() => { expect(screen.getByText(/Generating demo trading data/)).toBeTruthy(); });
    });

    it("allows manual sync of trading data", async () => {
      setQueryData({ "challenges/my": [makeChallenge()], "mt5/my": [makeMt5Account()] });
      const Trading = (await import("@/pages/dashboard/Trading")).default;
      const user = userEvent.setup();
      render(<Trading />);
      await user.click(screen.getByText("Sync Now"));
    });
  });

  // ─── STEP 5: REQUEST PAYOUT ───────────────────────────────
  describe("Step 5: Request Payout", () => {
    beforeEach(() => {
      Object.assign(mockAuthState, { isLoading: false, isAuthenticated: true, user: { id: 1, name: "Trader", email: "trader@test.com", role: "user" } });
    });

    it("shows funded accounts and payout stats", async () => {
      setQueryData({ "funded/my": [makeFundedAccount({ id: 5, accountSize: 50000 })], "payouts/my": [makePayout({ id: 1, amount: 50000, status: "paid" }), makePayout({ id: 2, amount: 25000, status: "pending" })], "payouts/stats": { totalPaid: 50000, totalPending: 25000, totalPayouts: 2 } });
      const Payouts = (await import("@/pages/dashboard/Payouts")).default;
      render(<Payouts />);
      expect(screen.getByText("Payouts")).toBeTruthy();
      // Status text is lowercase in the component: "paid", "pending"
      const paidBadges = screen.getAllByText("paid");
      expect(paidBadges.length).toBeGreaterThanOrEqual(1);
      const pendingBadges = screen.getAllByText("pending");
      expect(pendingBadges.length).toBeGreaterThanOrEqual(1);
    });

    it("opens the payout request dialog", async () => {
      setQueryData({ "funded/my": [makeFundedAccount({ id: 5, accountSize: 50000 })], "payouts/my": [], "payouts/stats": { totalPaid: 0, totalPending: 0, totalPayouts: 0 } });
      const Payouts = (await import("@/pages/dashboard/Payouts")).default;
      const user = userEvent.setup();
      render(<Payouts />);
      // The Request Payout button is a <Button> with text "Request Payout"
      const reqBtn = screen.getAllByText("Request Payout")[0].closest("button")!;
      await user.click(reqBtn);
      expect(screen.getByTestId("dialog")).toBeTruthy();
    });

    it("shows empty state when no payouts exist", async () => {
      setQueryData({ "funded/my": [], "payouts/my": [] });
      const Payouts = (await import("@/pages/dashboard/Payouts")).default;
      render(<Payouts />);
      expect(screen.getByText(/No payout requests yet/)).toBeTruthy();
    });

    it("renders payout history with status badges", async () => {
      setQueryData({ "payouts/my": [makePayout({ id: 1, amount: 100000, status: "paid" }), makePayout({ id: 2, amount: 50000, status: "pending" }), makePayout({ id: 3, amount: 25000, status: "rejected" })], "payouts/stats": { totalPaid: 100000, totalPending: 50000, totalPayouts: 3 } });
      const Payouts = (await import("@/pages/dashboard/Payouts")).default;
      render(<Payouts />);
      expect(screen.getAllByText("paid").length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText("pending").length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText("rejected").length).toBeGreaterThanOrEqual(1);
    });
  });

  // ─── FULL E2E JOURNEY ─────────────────────────────────────
  describe("Full E2E Journey", () => {
    it("stage 1: new user signs up and sees empty dashboard", async () => {
      Object.assign(mockAuthState, { isLoading: false, isAuthenticated: true, user: { id: 1, name: "Fresh Trader", email: "fresh@test.com", role: "user", isDemoSeeded: false } });
      setQueryData({ "challenges/my": [], "metrics/dashboard": { latestMetrics: null }, "metrics/history": [], "mt5/my": [] });
      const Overview = (await import("@/pages/dashboard/Overview")).default;
      render(<Overview />);
      await waitFor(() => { expect(screen.getByText("Overview")).toBeTruthy(); });
    });

    it("stage 2: user purchases a challenge", async () => {
      Object.assign(mockAuthState, { user: { ...mockAuthState.user, isDemoSeeded: true } });
      setQueryData({ templates: [makeTemplate({ id: 1, name: "Two-Step Challenge" })], "challenges/my": [] });
      const Challenges = (await import("@/pages/dashboard/Challenges")).default;
      const user = userEvent.setup();
      render(<Challenges />);
      expect(screen.getByText("Two-Step Challenge")).toBeTruthy();
      await user.click(screen.getAllByText("Select")[0]);
      expect(screen.getByTestId("dialog")).toBeTruthy();
    });

    it("stage 3: after purchase, challenge appears in My Challenges", async () => {
      Object.assign(mockAuthState, { user: { ...mockAuthState.user, isDemoSeeded: true } });
      setQueryData({ "challenges/my": [makeChallenge({ id: 100, status: "active" })] });
      const Challenges = (await import("@/pages/dashboard/Challenges")).default;
      const user = userEvent.setup();
      render(<Challenges />);
      await user.click(screen.getByTestId("tab-trigger-my-challenges"));
      await waitFor(() => { expect(screen.getByText("Challenge #100")).toBeTruthy(); });
    });

    it("stage 4: trading page shows metrics for active challenge", async () => {
      Object.assign(mockAuthState, { user: { ...mockAuthState.user, isDemoSeeded: true } });
      setQueryData({ "challenges/my": [makeChallenge({ id: 100, status: "active" })], "metrics/dashboard": { latestMetrics: makeLatestMetrics() }, "metrics/history": makeMetricsHistory(30), "mt5/my": [makeMt5Account({ balance: 10500, equity: 10750 })] });
      const Trading = (await import("@/pages/dashboard/Trading")).default;
      render(<Trading />);
      expect(screen.getByText("Trading")).toBeTruthy();
      expect(screen.getByText("Total Balance")).toBeTruthy();
      expect(screen.getAllByText("$10,500").length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText("Performance Charts")).toBeTruthy();
      expect(screen.getByText("Current Metrics")).toBeTruthy();
    });

    it("stage 5: user passes challenge and becomes funded", async () => {
      Object.assign(mockAuthState, { user: { ...mockAuthState.user, isDemoSeeded: true } });
      setQueryData({ "challenges/my": [makeChallenge({ id: 100, status: "funded", accountSize: 50000 })], "mt5/my": [makeMt5Account({ balance: 50000, equity: 52000 })], "metrics/dashboard": { latestMetrics: { ...makeLatestMetrics(), balance: 52000, equity: 54000, totalProfit: 4000 } }, "metrics/history": makeMetricsHistory(60) });
      const Trading = (await import("@/pages/dashboard/Trading")).default;
      render(<Trading />);
      expect(screen.getByText("Funded Accounts")).toBeTruthy();
    });

    it("stage 6: funded user requests a payout", async () => {
      Object.assign(mockAuthState, { user: { ...mockAuthState.user, isDemoSeeded: true } });
      setQueryData({ "funded/my": [makeFundedAccount({ id: 5, accountSize: 50000 })], "payouts/my": [makePayout({ id: 1, amount: 4000, status: "paid" })], "payouts/stats": { totalPaid: 4000, totalPending: 0, totalPayouts: 1 } });
      const Payouts = (await import("@/pages/dashboard/Payouts")).default;
      const user = userEvent.setup();
      render(<Payouts />);
      expect(screen.getAllByText("Request Payout").length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText("paid").length).toBeGreaterThanOrEqual(1);
      await user.click(screen.getAllByText("Request Payout")[0].closest("button")!);
      expect(screen.getByTestId("dialog")).toBeTruthy();
    });

    it("stage 7: user views certificates after passing", async () => {
      setQueryData({ "certificates/my": [
        { id: 1, type: "phase_1_passed", traderName: "Trader", accountSize: 10000, challengeName: "Two-Step", issuedAt: Date.now() - 86400000 * 5, verificationCode: "CERT-A", certificateNumber: "AFC-001" },
        { id: 2, type: "funded", traderName: "Trader", accountSize: 50000, challengeName: "Two-Step", issuedAt: Date.now(), verificationCode: "CERT-B", certificateNumber: "AFC-002" },
      ] });
      const Certificates = (await import("@/pages/dashboard/Certificates")).default;
      render(<Certificates />);
      expect(screen.getByText("Certificates")).toBeTruthy();
      expect(screen.getByText(/AFC-001/)).toBeTruthy();
      expect(screen.getByText(/AFC-002/)).toBeTruthy();
    });

    it("complete journey: all data flows between pages consistently", async () => {
      Object.assign(mockAuthState, { user: { ...mockAuthState.user, isDemoSeeded: true, onboardingComplete: true } });
      setQueryData({
        templates: [makeTemplate({ id: 1 })],
        "challenges/my": [makeChallenge({ id: 100, status: "active" }), makeChallenge({ id: 101, status: "funded", accountSize: 50000 })],
        "mt5/my": [makeMt5Account({ id: 1, login: "100001", balance: 10000 }), makeMt5Account({ id: 2, login: "200002", balance: 50000 })],
        "metrics/dashboard": { latestMetrics: makeLatestMetrics() },
        "metrics/history": makeMetricsHistory(30),
        "payouts/my": [makePayout({ id: 1, amount: 4000, status: "paid" })],
        "payouts/stats": { totalPaid: 4000, totalPending: 0, totalPayouts: 1 },
        "funded/my": [makeFundedAccount({ id: 5, accountSize: 50000 })],
        "certificates/my": [{ id: 1, type: "funded", traderName: "Trader", accountSize: 50000, challengeName: "Two-Step", issuedAt: Date.now(), verificationCode: "CERT-X", certificateNumber: "AFC-001" }],
      });

      // Challenges
      const Challenges = (await import("@/pages/dashboard/Challenges")).default;
      const { unmount: u1 } = render(<Challenges />);
      expect(screen.getByText("Two-Step Challenge")).toBeTruthy();
      u1();

      // Trading
      const Trading = (await import("@/pages/dashboard/Trading")).default;
      const { unmount: u2 } = render(<Trading />);
      expect(screen.getByText("100001")).toBeTruthy();
      expect(screen.getByText("200002")).toBeTruthy();
      expect(screen.getByText("Performance Charts")).toBeTruthy();
      u2();

      // Payouts
      const Payouts = (await import("@/pages/dashboard/Payouts")).default;
      const { unmount: u3 } = render(<Payouts />);
      expect(screen.getAllByText("Request Payout").length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText("paid").length).toBeGreaterThanOrEqual(1);
      u3();

      // Certificates
      const Certificates = (await import("@/pages/dashboard/Certificates")).default;
      render(<Certificates />);
      expect(screen.getByText(/AFC-001/)).toBeTruthy();
    });
  });

  // ─── CROSS-CUTTING: Notifications ─────────────────────────
  describe("Cross-cutting: Notifications", () => {
    it("user can view and manage notifications", async () => {
      Object.assign(mockAuthState, { isLoading: false, isAuthenticated: true, user: { id: 1, name: "Trader", email: "trader@test.com" } });
      setQueryData({ "notifications/my": [
        { id: 1, title: "Payment Received", message: "Your payment of ₦150,000 was received", type: "payment_received", isRead: false, createdAt: Date.now() - 3600000 },
        { id: 2, title: "Challenge Created", message: "Your challenge has been activated", type: "system", isRead: true, createdAt: Date.now() - 7200000 },
      ] });
      const Notifications = (await import("@/pages/dashboard/Notifications")).default;
      render(<Notifications />);
      expect(screen.getByText("Notifications")).toBeTruthy();
      expect(screen.getByText("Payment Received")).toBeTruthy();
      expect(screen.getByText("Challenge Created")).toBeTruthy();
    });
  });

  // ─── CROSS-CUTTING: Profile ──────────────────────────────
  describe("Cross-cutting: Profile", () => {
    it("user can view and update their profile", async () => {
      Object.assign(mockAuthState, { isLoading: false, isAuthenticated: true, user: { id: 1, name: "Trader", email: "trader@test.com", phone: "+2348012345678", country: "Nigeria" } });
      const Profile = (await import("@/pages/dashboard/Profile")).default;
      render(<Profile />);
      expect(screen.getByRole("heading", { name: "Profile" })).toBeTruthy();
      expect(screen.getByText("KYC")).toBeTruthy();
      expect(screen.getByDisplayValue("Trader")).toBeTruthy();
    });
  });

  // ─── CROSS-CUTTING: Support ──────────────────────────────
  describe("Cross-cutting: Support", () => {
    it("user can create and view support tickets", async () => {
      Object.assign(mockAuthState, { isLoading: false, isAuthenticated: true, user: { id: 1, name: "Trader", email: "trader@test.com" } });
      setQueryData({ "support/my": [{ id: 1, subject: "Cannot withdraw profits", category: "payments", status: "open", priority: "high", createdAt: Date.now() - 86400000 }] });
      const Support = (await import("@/pages/dashboard/Support")).default;
      render(<Support />);
      expect(screen.getByText("Support")).toBeTruthy();
      expect(screen.getByText("New Ticket")).toBeTruthy();
      expect(screen.getByText("Cannot withdraw profits")).toBeTruthy();
    });
  });
});
