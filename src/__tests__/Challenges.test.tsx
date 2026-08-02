// @vitest-environment jsdom
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
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

// ─── Mock: react-router ────────────────────────────────────
const mockNavigate = vi.fn();
vi.mock("react-router", () => ({
  useNavigate: () => mockNavigate,
}));

// ─── Mock: useAuth ─────────────────────────────────────────
const mockUser = {
  id: 1,
  name: "Test User",
  email: "test@example.com",
  role: "user",
  phone: "+2348012345678",
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
    // The page passes query-suffixed keys (["challenges", "my", "/api/challenges/my?..."]),
    // so look up by the stable prefix (first two segments; single-segment keys like
    // ["templates"] and ["sizes", "1"] resolve unchanged).
    const dataKey = key.slice(0, 2).join("/");
    if (queryDataMap[dataKey] === undefined) {
      return { data: undefined, isLoading: true };
    }
    const base = queryDataMap[dataKey];
    // Simulate the server-driven challenges list: paginate + stats envelope.
    if (dataKey === "challenges/my" && Array.isArray(base)) {
      const query = path.includes("?") ? path.split("?")[1] : "";
      const params = new URLSearchParams(query);
      const page = Number(params.get("page") || 1);
      const pageSize = Number(params.get("pageSize") || 10);
      const total = base.length;
      const totalPages = Math.max(1, Math.ceil(total / pageSize));
      return {
        data: {
          challenges: base.slice((page - 1) * pageSize, page * pageSize),
          total,
          page,
          pageSize,
          totalPages,
          stats: { total, byStatus: {} },
        },
        isLoading: false,
      };
    }
    // Simulate the server-driven coupons list: paginate + stats envelope.
    if (dataKey === "coupons/my" && Array.isArray(base)) {
      const query = path.includes("?") ? path.split("?")[1] : "";
      const params = new URLSearchParams(query);
      const page = Number(params.get("page") || 1);
      const pageSize = Number(params.get("pageSize") || 10);
      const total = base.length;
      const totalPages = Math.max(1, Math.ceil(total / pageSize));
      return {
        data: {
          coupons: base.slice((page - 1) * pageSize, page * pageSize),
          total,
          page,
          pageSize,
          totalPages,
          stats: { total, totalDiscount: 0 },
        },
        isLoading: false,
      };
    }
    return { data: base, isLoading: false };
  }),
  useApiMutation: vi.fn((method: string, path: string, _onSuccess?: any) => {
    return {
      mutateAsync: vi.fn(async (body?: any) => {
        if (path === "/api/challenges/demo-purchase") {
          return { message: "Demo challenge created", challengeId: 999 };
        }
        return { message: "ok" };
      }),
      mutate: vi.fn(),
      isPending: false,
    };
  }),
}));

// ─── Mock: useFlutterwavePayment ───────────────────────────
const mockStartCheckout = vi.fn();
const mockResetPayment = vi.fn();
let mockPaymentState: CheckoutState = { status: "idle" };

vi.mock("@/hooks/use-flutterwave", () => ({
  useFlutterwavePayment: vi.fn(() => ({
    state: mockPaymentState,
    startCheckout: mockStartCheckout,
    reset: mockResetPayment,
  })),
}));

// ─── Mock: @/components/ui/dialog ──────────────────────────
vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ open, onOpenChange, children }: any) => {
    if (!open) return null;
    return (
      <div data-testid="dialog" data-open={open}>
        {children}
        <button data-testid="dialog-close" onClick={() => onOpenChange(false)}>
          Close
        </button>
      </div>
    );
  },
  DialogContent: ({ children, className }: any) => (
    <div data-testid="dialog-content" className={className}>
      {children}
    </div>
  ),
  DialogHeader: ({ children }: any) => (
    <div data-testid="dialog-header">{children}</div>
  ),
  DialogTitle: ({ children }: any) => (
    <div data-testid="dialog-title">{children}</div>
  ),
  DialogDescription: ({ children }: any) => (
    <div data-testid="dialog-description">{children}</div>
  ),
}));

// ─── Mock: @/components/ui/tabs with React state ───────────
vi.mock("@/components/ui/tabs", () => {
  const TabsCtx = React.createContext({ value: "browse", onChange: (_v: string) => {} });

  function Tabs({ defaultValue, children }: any) {
    const [value, setValue] = React.useState(defaultValue || "browse");
    return (
      <TabsCtx.Provider value={{ value, onChange: setValue }}>
        <div data-testid="tabs">{children}</div>
      </TabsCtx.Provider>
    );
  }

  function TabsList({ children }: any) {
    return <div data-testid="tabs-list">{children}</div>;
  }

  function TabsTrigger({ value, children, ...props }: any) {
    const ctx = React.useContext(TabsCtx);
    return (
      <button
        data-testid={`tab-trigger-${value}`}
        data-active={value === ctx.value}
        onClick={() => ctx.onChange(value)}
        {...props}
      >
        {children}
      </button>
    );
  }

  function TabsContent({ value, children }: any) {
    const ctx = React.useContext(TabsCtx);
    if (value !== ctx.value) return null;
    return <div data-testid={`tab-content-${value}`}>{children}</div>;
  }

  return { Tabs, TabsList, TabsTrigger, TabsContent };
});

// ─── Import component after mocks ─────────────────────────
import Challenges from "@/pages/dashboard/Challenges";
import { useAuth } from "@/hooks/use-auth";
import { useFlutterwavePayment, type CheckoutState } from "@/hooks/use-flutterwave";
import { toast } from "sonner";

// ─── Test data factories ──────────────────────────────────
function makeTemplate(overrides: any = {}) {
  return {
    id: 1,
    name: "Two-Step Challenge",
    description: "Pass two phases to become a funded trader",
    profitTarget: 10,
    maxDrawdown: 5,
    dailyDrawdown: 4,
    minTradingDays: 5,
    durationDays: 30,
    maxLeverage: 30,
    ...overrides,
  };
}

function makeSize(overrides: any = {}) {
  return {
    id: 1,
    label: "$10,000",
    price: 150000,
    currency: "NGN",
    accountSize: 10000,
    ...overrides,
  };
}

function makeChallenge(overrides: any = {}) {
  return {
    id: 10,
    accountSize: 10000,
    status: "active",
    currentPhase: 1,
    createdAt: Date.now() - 86400000 * 7,
    ...overrides,
  };
}

// ─── Helper to configure mock data before each test ───────
function setQueryData(updates: Record<string, any>) {
  Object.keys(queryDataMap).forEach((k) => delete queryDataMap[k]);
  const defaults: Record<string, any> = {
    templates: [],
    "challenges/my": [],
    "coupons/my": [],
  };
  Object.assign(queryDataMap, defaults, updates);
}

// ─── Tests ────────────────────────────────────────────────
describe("Challenges Page", () => {
  beforeEach(() => {
    mockPaymentState = { status: "idle" };
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
    vi.mocked(useFlutterwavePayment).mockReturnValue({
      state: mockPaymentState,
      startCheckout: mockStartCheckout,
      reset: mockResetPayment,
    });
  });

  // ─── Loading state ─────────────────────────────────────
  describe("Loading State", () => {
    it("shows a spinner when data is loading", () => {
      Object.keys(queryDataMap).forEach((k) => delete queryDataMap[k]);
      const { container } = render(<Challenges />);
      expect(container.querySelector(".animate-spin")).toBeTruthy();
    });
  });

  // ─── Page header ───────────────────────────────────────
  describe("Page Header", () => {
    it("renders the Challenges page title and description", () => {
      render(<Challenges />);
      expect(screen.getByText("Challenges")).toBeTruthy();
      expect(screen.getByText(/Browse challenge types/)).toBeTruthy();
    });
  });

  // ─── Tab navigation ────────────────────────────────────
  describe("Tabs", () => {
    it("renders Browse and My Challenges tabs", () => {
      render(<Challenges />);
      expect(screen.getByText("Browse")).toBeTruthy();
      expect(screen.getByText("My Challenges")).toBeTruthy();
    });

    it("defaults to Browse tab", () => {
      render(<Challenges />);
      expect(screen.getByTestId("tab-content-browse")).toBeTruthy();
    });
  });

  // ─── Template browsing ─────────────────────────────────
  describe("Template Browsing", () => {
    it("renders challenge templates with details", () => {
      setQueryData({
        templates: [
          makeTemplate({ id: 1, name: "Two-Step Challenge" }),
          makeTemplate({ id: 2, name: "One-Step Challenge", profitTarget: 8, maxDrawdown: 6 }),
        ],
      });
      render(<Challenges />);
      expect(screen.getByText("Two-Step Challenge")).toBeTruthy();
      expect(screen.getByText("One-Step Challenge")).toBeTruthy();
      expect(screen.getAllByText(/Profit Target/).length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText(/Max Drawdown/).length).toBeGreaterThanOrEqual(1);
    });

    it("shows template rules with correct values", () => {
      setQueryData({
        templates: [makeTemplate({ profitTarget: 10, maxDrawdown: 5, dailyDrawdown: 4, minTradingDays: 5 })],
      });
      render(<Challenges />);
      expect(screen.getByText("10%")).toBeTruthy();
      expect(screen.getByText("5%")).toBeTruthy();
      expect(screen.getByText("4%")).toBeTruthy();
      expect(screen.getByText("5")).toBeTruthy();
    });

    it("shows duration or Unlimited for templates", () => {
      setQueryData({
        templates: [
          makeTemplate({ id: 1, durationDays: 30 }),
          makeTemplate({ id: 2, name: "No Expiry", durationDays: 0 }),
        ],
      });
      render(<Challenges />);
      expect(screen.getByText("30 days")).toBeTruthy();
      expect(screen.getByText("Unlimited")).toBeTruthy();
    });

    it("renders Select button for each template", () => {
      setQueryData({
        templates: [makeTemplate()],
      });
      render(<Challenges />);
      const selectButtons = screen.getAllByText("Select");
      expect(selectButtons.length).toBeGreaterThanOrEqual(1);
    });

    it("shows empty state when no templates exist", () => {
      setQueryData({ templates: [] });
      render(<Challenges />);
      expect(screen.getByTestId("tab-content-browse")).toBeTruthy();
    });
  });

  // ─── Template selection ────────────────────────────────
  describe("Template Selection", () => {
    it("opens purchase dialog when Select is clicked", async () => {
      const user = userEvent.setup();
      setQueryData({
        templates: [makeTemplate()],
        "sizes/1": [makeSize()],
      });
      render(<Challenges />);

      const selectButtons = screen.getAllByText("Select");
      await user.click(selectButtons[0]);

      expect(screen.getByTestId("dialog")).toBeTruthy();
      expect(screen.getByText("Purchase Challenge")).toBeTruthy();
    });

    it("highlights selected template card", async () => {
      const user = userEvent.setup();
      setQueryData({
        templates: [makeTemplate({ id: 1 }), makeTemplate({ id: 2, name: "One-Step" })],
      });
      render(<Challenges />);

      const card = screen.getByText("Two-Step Challenge").closest("[class*='cursor-pointer']")!;
      await user.click(card);

      expect(card.className).toContain("ring-1");
    });
  });

  // ─── Account size selection in dialog ──────────────────
  describe("Account Size Selection", () => {
    it("renders account size options in the dialog", async () => {
      const user = userEvent.setup();
      setQueryData({
        templates: [makeTemplate({ id: 1 })],
        "sizes/1": [
          makeSize({ id: 1, label: "$10,000", price: 150000 }),
          makeSize({ id: 2, label: "$25,000", price: 300000, accountSize: 25000 }),
          makeSize({ id: 3, label: "$50,000", price: 500000, accountSize: 50000 }),
        ],
      });
      render(<Challenges />);

      const selectButtons = screen.getAllByText("Select");
      await user.click(selectButtons[0]);

      expect(screen.getByText("$10,000")).toBeTruthy();
      expect(screen.getByText("$25,000")).toBeTruthy();
      expect(screen.getByText("$50,000")).toBeTruthy();
    });

    it("displays NGN price for each size", async () => {
      const user = userEvent.setup();
      setQueryData({
        templates: [makeTemplate({ id: 1 })],
        "sizes/1": [makeSize({ id: 1, price: 150000 })],
      });
      render(<Challenges />);

      const selectButtons = screen.getAllByText("Select");
      await user.click(selectButtons[0]);

      expect(screen.getByText((text) => text.includes("150,000"))).toBeTruthy();
    });

    it("highlights selected size with border-foreground", async () => {
      const user = userEvent.setup();
      setQueryData({
        templates: [makeTemplate({ id: 1 })],
        "sizes/1": [makeSize({ id: 1 }), makeSize({ id: 2, label: "$25,000", accountSize: 25000 })],
      });
      render(<Challenges />);

      const selectButtons = screen.getAllByText("Select");
      await user.click(selectButtons[0]);

      const sizeButtons = screen.getAllByText("$10,000");
      // The second one is inside the dialog size selector button
      const sizeButton = sizeButtons[sizeButtons.length - 1];
      await user.click(sizeButton);

      // Check the parent button element for border-foreground
      const parentButton = sizeButton.closest("button")!;
      expect(parentButton.className).toContain("border-foreground");
    });

    it("shows total price after selecting a size", async () => {
      const user = userEvent.setup();
      setQueryData({
        templates: [makeTemplate({ id: 1 })],
        "sizes/1": [makeSize({ id: 1, price: 150000 })],
      });
      render(<Challenges />);

      const selectButtons = screen.getAllByText("Select");
      await user.click(selectButtons[0]);

      const sizeButton = screen.getByText("$10,000").closest("button")!;
      await user.click(sizeButton);

      expect(screen.getByText("Total")).toBeTruthy();
      // Multiple elements may contain the price text, use getAllByText
      const priceMatches = screen.getAllByText((text) => text.includes("150,000"));
      expect(priceMatches.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ─── Coupon flow ──────────────────────────────────────
  describe("Coupon Flow", () => {
    it("renders coupon input and Apply button in dialog", async () => {
      const user = userEvent.setup();
      setQueryData({
        templates: [makeTemplate({ id: 1 })],
        "sizes/1": [makeSize()],
      });
      render(<Challenges />);

      const selectButtons = screen.getAllByText("Select");
      await user.click(selectButtons[0]);

      expect(screen.getByPlaceholderText("Enter coupon code")).toBeTruthy();
      expect(screen.getByText("Apply")).toBeTruthy();
    });

    it("shows discount info when coupon is applied", async () => {
      const user = userEvent.setup();
      setQueryData({
        templates: [makeTemplate({ id: 1 })],
        "sizes/1": [makeSize()],
      });

      const originalFetch = global.fetch;
      global.fetch = vi.fn(async (url: string, opts?: any) => {
        if (typeof url === "string" && url === "/api/coupons/validate") {
          return {
            ok: true,
            json: async () => ({
              valid: true,
              discount: 15000,
              discountType: "percentage",
              discountValue: 10,
              finalAmount: 135000,
              couponId: 1,
            }),
          };
        }
        return originalFetch(url, opts);
      }) as any;

      render(<Challenges />);

      const selectButtons = screen.getAllByText("Select");
      await user.click(selectButtons[0]);

      const sizeButton = screen.getByText("$10,000").closest("button")!;
      await user.click(sizeButton);

      const input = screen.getByPlaceholderText("Enter coupon code");
      await user.type(input, "SAVE10");

      await user.click(screen.getByText("Apply"));

      await waitFor(() => {
        expect(screen.getByText(/10% off/)).toBeTruthy();
      });

      expect(screen.getByText("Original Price")).toBeTruthy();
      expect(screen.getByText("Discount")).toBeTruthy();

      global.fetch = originalFetch;
    });

    it("shows error for invalid coupon", async () => {
      const user = userEvent.setup();
      setQueryData({
        templates: [makeTemplate({ id: 1 })],
        "sizes/1": [makeSize()],
      });

      const originalFetch = global.fetch;
      global.fetch = vi.fn(async (url: string) => {
        if (typeof url === "string" && url === "/api/coupons/validate") {
          return {
            ok: true,
            json: async () => ({ valid: false, error: "Coupon expired" }),
          };
        }
        return originalFetch(url);
      }) as any;

      render(<Challenges />);

      const selectButtons = screen.getAllByText("Select");
      await user.click(selectButtons[0]);

      const sizeButton = screen.getByText("$10,000").closest("button")!;
      await user.click(sizeButton);

      const input = screen.getByPlaceholderText("Enter coupon code");
      await user.type(input, "EXPIRED");

      await user.click(screen.getByText("Apply"));

      await waitFor(() => {
        expect(screen.getByText("Coupon expired")).toBeTruthy();
      });

      global.fetch = originalFetch;
    });
  });

  // ─── Payment flow ─────────────────────────────────────
  describe("Payment Flow", () => {
    it("shows Proceed to Payment button", async () => {
      const user = userEvent.setup();
      setQueryData({
        templates: [makeTemplate({ id: 1 })],
        "sizes/1": [makeSize()],
      });
      render(<Challenges />);

      const selectButtons = screen.getAllByText("Select");
      await user.click(selectButtons[0]);

      expect(screen.getByText("Proceed to Payment")).toBeTruthy();
    });

    it("disables payment button when no size is selected", async () => {
      const user = userEvent.setup();
      setQueryData({
        templates: [makeTemplate({ id: 1 })],
        "sizes/1": [makeSize()],
      });
      render(<Challenges />);

      const selectButtons = screen.getAllByText("Select");
      await user.click(selectButtons[0]);

      const payButton = screen.getByText("Proceed to Payment");
      expect(payButton.closest("button")?.disabled).toBeTruthy();
    });

    it("enables payment button after selecting a size", async () => {
      const user = userEvent.setup();
      setQueryData({
        templates: [makeTemplate({ id: 1 })],
        "sizes/1": [makeSize()],
      });
      render(<Challenges />);

      const selectButtons = screen.getAllByText("Select");
      await user.click(selectButtons[0]);

      const sizeButton = screen.getByText("$10,000").closest("button")!;
      await user.click(sizeButton);

      const payButton = screen.getByText("Proceed to Payment");
      expect(payButton.closest("button")?.disabled).toBeFalsy();
    });

    it("calls startCheckout when payment button is clicked", async () => {
      const user = userEvent.setup();
      setQueryData({
        templates: [makeTemplate({ id: 1 })],
        "sizes/1": [makeSize({ id: 1, price: 150000 })],
      });
      render(<Challenges />);

      const selectButtons = screen.getAllByText("Select");
      await user.click(selectButtons[0]);

      const sizeButton = screen.getByText("$10,000").closest("button")!;
      await user.click(sizeButton);

      await user.click(screen.getByText("Proceed to Payment"));

      expect(mockStartCheckout).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: 150000,
          currency: "NGN",
          email: "test@example.com",
        }),
      );
    });

    it("disables Select button during initiating state", () => {
      mockPaymentState = { status: "initiating" };
      vi.mocked(useFlutterwavePayment).mockReturnValue({
        state: mockPaymentState,
        startCheckout: mockStartCheckout,
        reset: mockResetPayment,
      });

      setQueryData({
        templates: [makeTemplate({ id: 1 })],
        "sizes/1": [makeSize()],
      });
      render(<Challenges />);

      const selectButton = screen.getAllByText("Select")[0];
      expect(selectButton.closest("button")?.disabled).toBeTruthy();
    });

    it("disables Select button during verifying state", () => {
      mockPaymentState = { status: "verifying" };
      vi.mocked(useFlutterwavePayment).mockReturnValue({
        state: mockPaymentState,
        startCheckout: mockStartCheckout,
        reset: mockResetPayment,
      });

      setQueryData({
        templates: [makeTemplate({ id: 1 })],
        "sizes/1": [makeSize()],
      });
      render(<Challenges />);

      const selectButton = screen.getAllByText("Select")[0];
      expect(selectButton.closest("button")?.disabled).toBeTruthy();
    });

    it("shows success state with reference", async () => {
      const user = userEvent.setup();
      mockPaymentState = { status: "success", reference: "abc123def456ghi" };
      vi.mocked(useFlutterwavePayment).mockReturnValue({
        state: mockPaymentState,
        startCheckout: mockStartCheckout,
        reset: mockResetPayment,
      });

      setQueryData({
        templates: [makeTemplate({ id: 1 })],
        "sizes/1": [makeSize()],
      });
      render(<Challenges />);

      await user.click(screen.getAllByText("Select")[0]);

      expect(screen.getByText(/Payment Successful/)).toBeTruthy();
      expect(screen.getByText("Challenge Created")).toBeTruthy();
      expect(screen.getByText("View My Challenges")).toBeTruthy();
    });

    it("shows error state with retry option", async () => {
      const user = userEvent.setup();
      mockPaymentState = { status: "error", message: "Payment failed" };
      vi.mocked(useFlutterwavePayment).mockReturnValue({
        state: mockPaymentState,
        startCheckout: mockStartCheckout,
        reset: mockResetPayment,
      });

      setQueryData({
        templates: [makeTemplate({ id: 1 })],
        "sizes/1": [makeSize()],
      });
      render(<Challenges />);

      await user.click(screen.getAllByText("Select")[0]);

      expect(screen.getByText("Payment Failed")).toBeTruthy();
      expect(screen.getByText("Payment failed")).toBeTruthy();
      expect(screen.getByText("Try Again")).toBeTruthy();
    });

    it("calls resetPayment when Try Again is clicked", async () => {
      const user = userEvent.setup();
      mockPaymentState = { status: "error" };
      vi.mocked(useFlutterwavePayment).mockReturnValue({
        state: mockPaymentState,
        startCheckout: mockStartCheckout,
        reset: mockResetPayment,
      });

      setQueryData({
        templates: [makeTemplate({ id: 1 })],
        "sizes/1": [makeSize()],
      });
      render(<Challenges />);

      await user.click(screen.getAllByText("Select")[0]);

      await user.click(screen.getByText("Try Again"));
      expect(mockResetPayment).toHaveBeenCalled();
    });
  });

  // ─── My Challenges tab ────────────────────────────────
  describe("My Challenges Tab", () => {
    it("shows empty state when no challenges exist", async () => {
      const user = userEvent.setup();
      setQueryData({ "challenges/my": [] });
      render(<Challenges />);

      await user.click(screen.getByTestId("tab-trigger-my-challenges"));
      await waitFor(() => {
        expect(screen.getByText(/No challenges yet/)).toBeTruthy();
      });
    });

    it("renders challenge cards with account size and status", async () => {
      const user = userEvent.setup();
      setQueryData({
        "challenges/my": [
          makeChallenge({ id: 10, accountSize: 10000, status: "active" }),
        ],
      });
      render(<Challenges />);

      await user.click(screen.getByTestId("tab-trigger-my-challenges"));
      await waitFor(() => {
        expect(screen.getByText("Challenge #10")).toBeTruthy();
      });
      expect(screen.getByText("Active")).toBeTruthy();
    });

    it("renders multiple challenges", async () => {
      const user = userEvent.setup();
      setQueryData({
        "challenges/my": [
          makeChallenge({ id: 10, accountSize: 10000, status: "active" }),
          makeChallenge({ id: 11, accountSize: 25000, status: "funded" }),
        ],
      });
      render(<Challenges />);

      await user.click(screen.getByTestId("tab-trigger-my-challenges"));
      await waitFor(() => {
        expect(screen.getByText("Challenge #10")).toBeTruthy();
        expect(screen.getByText("Challenge #11")).toBeTruthy();
      });
    });

    it("navigates to challenge detail when clicked", async () => {
      const user = userEvent.setup();
      setQueryData({
        "challenges/my": [
          makeChallenge({ id: 42, accountSize: 50000, status: "active" }),
        ],
      });
      render(<Challenges />);

      await user.click(screen.getByTestId("tab-trigger-my-challenges"));
      await waitFor(() => {
        expect(screen.getByText("Challenge #42")).toBeTruthy();
      });
      await user.click(screen.getByText("Challenge #42"));

      expect(mockNavigate).toHaveBeenCalledWith("/dashboard/challenges/42");
    });
  });

  // ─── Sortable headers ─────────────────────────────────
  describe("Sortable Headers", () => {
    it("renders sortable column headers with the default column active", async () => {
      const user = userEvent.setup();
      setQueryData({
        "challenges/my": [makeChallenge({ id: 10, accountSize: 10000, status: "active" })],
      });
      render(<Challenges />);

      await user.click(screen.getByTestId("tab-trigger-my-challenges"));
      await waitFor(() => {
        expect(screen.getByText("Challenge #10")).toBeTruthy();
      });

      for (const label of ["ID", "Account Size", "Amount Paid", "Status", "Created"]) {
        expect(screen.getByRole("button", { name: `Sort by ${label}` })).toBeTruthy();
      }
      // Default sort is createdAt desc → Created is active
      expect(screen.getByRole("button", { name: "Sort by Created" }).getAttribute("aria-pressed")).toBe("true");
    });

    it("calls the API with sortBy/sortOrder when a header is clicked", async () => {
      const user = userEvent.setup();
      setQueryData({
        "challenges/my": [makeChallenge({ id: 10, accountSize: 10000, status: "active" })],
      });
      render(<Challenges />);

      await user.click(screen.getByTestId("tab-trigger-my-challenges"));
      await waitFor(() => {
        expect(screen.getByText("Challenge #10")).toBeTruthy();
      });
      await user.click(screen.getByRole("button", { name: "Sort by Status" }));

      const calls = vi.mocked(useApiQuery).mock.calls;
      const myCall = calls.find((c) => String(c[1]).includes("/api/challenges/my?") && String(c[1]).includes("sortBy=status"));
      expect(myCall).toBeTruthy();
      expect(String(myCall![1])).toContain("sortOrder=desc");
      expect(screen.getByRole("button", { name: "Sort by Status" }).getAttribute("aria-pressed")).toBe("true");
    });

    it("toggles to ascending when the active column is clicked again", async () => {
      const user = userEvent.setup();
      setQueryData({
        "challenges/my": [makeChallenge({ id: 10, accountSize: 10000, status: "active" })],
      });
      render(<Challenges />);

      await user.click(screen.getByTestId("tab-trigger-my-challenges"));
      await waitFor(() => {
        expect(screen.getByText("Challenge #10")).toBeTruthy();
      });
      await user.click(screen.getByRole("button", { name: "Sort by Status" }));
      await user.click(screen.getByRole("button", { name: "Sort by Status" }));

      const calls = vi.mocked(useApiQuery).mock.calls;
      const ascCall = calls.find((c) => String(c[1]).includes("/api/challenges/my?") && String(c[1]).includes("sortBy=status&sortOrder=asc"));
      expect(ascCall).toBeTruthy();
    });
  });

  // ─── Status badges ────────────────────────────────────
  describe("Status Badges", () => {
    it("renders Active badge correctly", async () => {
      const user = userEvent.setup();
      setQueryData({
        "challenges/my": [makeChallenge({ status: "active" })],
      });
      render(<Challenges />);

      await user.click(screen.getByTestId("tab-trigger-my-challenges"));
      await waitFor(() => {
        expect(screen.getByText("Active")).toBeTruthy();
      });
    });

    it("renders Funded badge correctly", async () => {
      const user = userEvent.setup();
      setQueryData({
        "challenges/my": [makeChallenge({ id: 2, status: "funded" })],
      });
      render(<Challenges />);

      await user.click(screen.getByTestId("tab-trigger-my-challenges"));
      await waitFor(() => {
        expect(screen.getByText("Funded")).toBeTruthy();
      });
    });

    it("renders Violated badge correctly", async () => {
      const user = userEvent.setup();
      setQueryData({
        "challenges/my": [makeChallenge({ id: 3, status: "violated" })],
      });
      render(<Challenges />);

      await user.click(screen.getByTestId("tab-trigger-my-challenges"));
      await waitFor(() => {
        expect(screen.getByText("Violated")).toBeTruthy();
      });
    });

    it("renders Phase 1 Passed badge correctly", async () => {
      const user = userEvent.setup();
      setQueryData({
        "challenges/my": [makeChallenge({ id: 4, status: "phase_1_passed" })],
      });
      render(<Challenges />);

      await user.click(screen.getByTestId("tab-trigger-my-challenges"));
      await waitFor(() => {
        expect(screen.getByText("Phase 1 Passed")).toBeTruthy();
      });
    });

    it("renders Phase 2 Passed badge correctly", async () => {
      const user = userEvent.setup();
      setQueryData({
        "challenges/my": [makeChallenge({ id: 5, status: "phase_2_passed" })],
      });
      render(<Challenges />);

      await user.click(screen.getByTestId("tab-trigger-my-challenges"));
      await waitFor(() => {
        expect(screen.getByText("Phase 2 Passed")).toBeTruthy();
      });
    });

    it("renders Expired badge correctly", async () => {
      const user = userEvent.setup();
      setQueryData({
        "challenges/my": [makeChallenge({ id: 6, status: "expired" })],
      });
      render(<Challenges />);

      await user.click(screen.getByTestId("tab-trigger-my-challenges"));
      await waitFor(() => {
        expect(screen.getByText("Expired")).toBeTruthy();
      });
    });
  });

  // ─── Admin demo purchase ──────────────────────────────
  describe("Admin Demo Purchase", () => {
    it("shows demo purchase button for admin users", async () => {
      const user = userEvent.setup();
      vi.mocked(useAuth).mockReturnValue({
        isLoading: false,
        isAuthenticated: true,
        user: { ...mockUser, role: "super_admin" } as any,
        error: null,
        signIn: vi.fn() as any,
        signOut: vi.fn() as any,
        refetch: vi.fn() as any,
      });

      setQueryData({
        templates: [makeTemplate({ id: 1 })],
        "sizes/1": [makeSize()],
      });
      render(<Challenges />);

      const selectButtons = screen.getAllByText("Select");
      await user.click(selectButtons[0]);

      const sizeButton = screen.getByText("$10,000").closest("button")!;
      await user.click(sizeButton);

      expect(screen.getByText("Create Demo Challenge")).toBeTruthy();
    });

    it("does not show demo purchase button for non-admin users", async () => {
      const user = userEvent.setup();
      vi.mocked(useAuth).mockReturnValue({
        isLoading: false,
        isAuthenticated: true,
        user: { ...mockUser, role: "user" } as any,
        error: null,
        signIn: vi.fn() as any,
        signOut: vi.fn() as any,
        refetch: vi.fn() as any,
      });

      setQueryData({
        templates: [makeTemplate({ id: 1 })],
        "sizes/1": [makeSize()],
      });
      render(<Challenges />);

      const selectButtons = screen.getAllByText("Select");
      await user.click(selectButtons[0]);

      const sizeButton = screen.getByText("$10,000").closest("button")!;
      await user.click(sizeButton);

      expect(screen.queryByText("Create Demo Challenge")).toBeNull();
    });
  });

  // ─── Flutterwave security note ────────────────────────
  describe("Security Note", () => {
    it("shows secure payment note in dialog", async () => {
      const user = userEvent.setup();
      setQueryData({
        templates: [makeTemplate({ id: 1 })],
        "sizes/1": [makeSize()],
      });
      render(<Challenges />);

      const selectButtons = screen.getAllByText("Select");
      await user.click(selectButtons[0]);

      expect(screen.getByText(/Secure payment powered by Flutterwave/)).toBeTruthy();
    });
  });

  // ─── Full integration ─────────────────────────────────
  // ─── Coupons Sortable Headers ─────────────────────────
  describe("Coupons Sortable Headers", () => {
    const couponData = {
      "coupons/my": [
        {
          id: 1,
          code: "WELCOME10",
          discountAmount: 5000,
          originalAmount: 50000,
          redeemedAt: Date.now() - 86400000,
        },
      ],
    };

    it("renders coupon sort headers with Redeemed active by default", async () => {
      const user = userEvent.setup();
      setQueryData(couponData);
      render(<Challenges />);

      await user.click(screen.getByTestId("tab-trigger-my-challenges"));

      for (const label of ["Code", "Discount", "Redeemed"]) {
        expect(await screen.findByRole("button", { name: `Sort by ${label}` })).toBeTruthy();
      }
      expect((await screen.findByRole("button", { name: "Sort by Redeemed" })).getAttribute("aria-pressed")).toBe("true");
    });

    it("calls the API with sortBy/sortOrder when a coupon header is clicked", async () => {
      const user = userEvent.setup();
      setQueryData(couponData);
      render(<Challenges />);

      await user.click(screen.getByTestId("tab-trigger-my-challenges"));
      await user.click(await screen.findByRole("button", { name: "Sort by Code" }));

      const calls = vi.mocked(useApiQuery).mock.calls;
      const couponCall = calls.find((c) => String(c[1]).includes("/api/coupons/my?") && String(c[1]).includes("sortBy=code"));
      expect(couponCall).toBeTruthy();
      expect(String(couponCall![1])).toContain("sortOrder=desc");
      expect(screen.getByRole("button", { name: "Sort by Code" }).getAttribute("aria-pressed")).toBe("true");
    });

    it("toggles to ascending when the active coupon column is clicked again", async () => {
      const user = userEvent.setup();
      setQueryData(couponData);
      render(<Challenges />);

      await user.click(screen.getByTestId("tab-trigger-my-challenges"));
      await user.click(await screen.findByRole("button", { name: "Sort by Code" }));
      await user.click(await screen.findByRole("button", { name: "Sort by Code" }));

      const calls = vi.mocked(useApiQuery).mock.calls;
      const ascCall = calls.find((c) => String(c[1]).includes("/api/coupons/my?") && String(c[1]).includes("sortBy=code&sortOrder=asc"));
      expect(ascCall).toBeTruthy();
    });
  });

  describe("Full Integration", () => {
    it("renders complete page with templates and challenges", async () => {
      const user = userEvent.setup();
      setQueryData({
        templates: [
          makeTemplate({ id: 1, name: "Two-Step Challenge" }),
          makeTemplate({ id: 2, name: "One-Step Challenge" }),
        ],
        "challenges/my": [
          makeChallenge({ id: 10, accountSize: 10000, status: "active" }),
        ],
      });
      render(<Challenges />);

      expect(screen.getByText("Challenges")).toBeTruthy();
      expect(screen.getByText(/Browse challenge types/)).toBeTruthy();
      expect(screen.getByText("Browse")).toBeTruthy();
      expect(screen.getByText("My Challenges")).toBeTruthy();
      expect(screen.getByText("Two-Step Challenge")).toBeTruthy();
      expect(screen.getByText("One-Step Challenge")).toBeTruthy();

      await user.click(screen.getByTestId("tab-trigger-my-challenges"));
      await waitFor(() => {
        expect(screen.getByText("Challenge #10")).toBeTruthy();
        expect(screen.getByText("Active")).toBeTruthy();
      });
    });

    it("completes full purchase flow: select template → select size → proceed to payment", async () => {
      const user = userEvent.setup();
      setQueryData({
        templates: [makeTemplate({ id: 1 })],
        "sizes/1": [makeSize({ id: 1, price: 150000 })],
      });
      render(<Challenges />);

      const selectButtons = screen.getAllByText("Select");
      await user.click(selectButtons[0]);

      expect(screen.getByTestId("dialog")).toBeTruthy();
      expect(screen.getByText("Purchase Challenge")).toBeTruthy();

      const sizeButton = screen.getByText("$10,000").closest("button")!;
      await user.click(sizeButton);

      expect(screen.getByText("Total")).toBeTruthy();

      await user.click(screen.getByText("Proceed to Payment"));

      expect(mockStartCheckout).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: 150000,
          currency: "NGN",
          email: "test@example.com",
          templateId: "1",
          accountSizeId: "1",
        }),
      );
    });
  });
});
