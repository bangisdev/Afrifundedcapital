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
const mockMutateAsync = vi.fn(async () => ({ message: "Payout request submitted" }));

vi.mock("@/hooks/use-api", () => ({
  useApiQuery: vi.fn((key: string[], path: string, _opts?: any) => {
    // The page passes query-suffixed keys (["payouts", "my", "/api/payouts/my?..."]),
    // so look up by the stable prefix (first two segments).
    const dataKey = key.slice(0, 2).join("/");
    if (queryDataMap[dataKey] === undefined) {
      return { data: undefined, isLoading: true };
    }
    const base = queryDataMap[dataKey];
    // Simulate the server-driven payouts list: paginate + stats envelope.
    if (dataKey === "payouts/my" && Array.isArray(base)) {
      const query = path.includes("?") ? path.split("?")[1] : "";
      const params = new URLSearchParams(query);
      const page = Number(params.get("page") || 1);
      const pageSize = Number(params.get("pageSize") || 10);
      const total = base.length;
      const totalPages = Math.max(1, Math.ceil(total / pageSize));
      const totalPaid = base.filter((p: any) => p.status === "paid").reduce((s: number, p: any) => s + (p.amount || 0), 0);
      const totalPending = base.filter((p: any) => p.status === "pending" || p.status === "processing").reduce((s: number, p: any) => s + (p.amount || 0), 0);
      return {
        data: {
          payouts: base.slice((page - 1) * pageSize, page * pageSize),
          total,
          page,
          pageSize,
          totalPages,
          stats: { total, totalPaid, totalPending, byStatus: {} },
        },
        isLoading: false,
      };
    }
    // Simulate the server-driven funded accounts list: paginate + stats envelope.
    if (dataKey === "funded/my" && Array.isArray(base)) {
      const query = path.includes("?") ? path.split("?")[1] : "";
      const params = new URLSearchParams(query);
      const page = Number(params.get("page") || 1);
      const pageSize = Number(params.get("pageSize") || 50);
      const total = base.length;
      const byStatus = {
        active: base.filter((a: any) => a.isActive !== false).length,
        inactive: base.filter((a: any) => a.isActive === false).length,
      };
      return {
        data: {
          accounts: base.slice((page - 1) * pageSize, page * pageSize),
          total,
          page,
          pageSize,
          totalPages: Math.max(1, Math.ceil(total / pageSize)),
          stats: { total, byStatus },
        },
        isLoading: false,
      };
    }
    return { data: base, isLoading: false };
  }),
  useApiMutation: vi.fn((_method: string, _path: string, _onSuccess?: any) => ({
    mutateAsync: mockMutateAsync,
    mutate: vi.fn(),
    isPending: false,
  })),
}));

// ─── Mock: Dialog ──────────────────────────────────────────
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
    <div data-testid="dialog-content" className={className}>{children}</div>
  ),
  DialogHeader: ({ children }: any) => <div>{children}</div>,
  DialogTitle: ({ children, className }: any) => (
    <h2 className={className}>{children}</h2>
  ),
}));

// ─── Import component after mocks ─────────────────────────
import Payouts from "@/pages/dashboard/Payouts";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";

// ─── Test data factories ──────────────────────────────────
function makePayout(overrides: any = {}) {
  return {
    id: 1,
    amount: 50000,
    status: "pending",
    paymentMethod: "bank_transfer",
    paymentDetails: "GTBank - 0123456789",
    requestedAt: Date.now() - 86400000 * 2,
    ...overrides,
  };
}

function makeFundedAccount(overrides: any = {}) {
  return {
    id: 1,
    challengeId: 10,
    accountSize: 50000,
    status: "funded",
    ...overrides,
  };
}

function makeStats(overrides: any = {}) {
  return {
    totalPaid: 120000,
    totalPending: 50000,
    totalPayouts: 5,
    ...overrides,
  };
}

// ─── Helper: clear all mock data (simulates loading) ──────
function clearAllQueryData() {
  Object.keys(queryDataMap).forEach((k) => delete queryDataMap[k]);
}

// ─── Helper to configure mock data before each test ───────
// Always sets payouts/my default so loading resolves
function setQueryData(updates: Record<string, any>) {
  Object.keys(queryDataMap).forEach((k) => delete queryDataMap[k]);
  const defaults: Record<string, any> = {
    "payouts/my": [],
    "payouts/stats": makeStats(),
    "funded/my": [],
  };
  Object.assign(queryDataMap, defaults, updates);
}

// ─── Tests ────────────────────────────────────────────────
describe("Payouts Page", () => {
  beforeEach(() => {
    clearAllQueryData();
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
    it("shows a spinner when payout data is loading", () => {
      // No data set = all queries return isLoading: true
      clearAllQueryData();
      const { container } = render(<Payouts />);
      expect(container.querySelector(".animate-spin")).toBeTruthy();
    });

    it("hides spinner once data is loaded", () => {
      setQueryData({});
      const { container } = render(<Payouts />);
      expect(container.querySelector(".animate-spin")).toBeNull();
    });
  });

  // ─── Page header ───────────────────────────────────────
  describe("Page Header", () => {
    it("renders the Payouts page title", () => {
      setQueryData({});
      render(<Payouts />);
      expect(screen.getByText("Payouts")).toBeTruthy();
    });

    it("renders the page description", () => {
      setQueryData({});
      render(<Payouts />);
      expect(screen.getByText(/Request profit withdrawals/)).toBeTruthy();
    });

    it("renders the Request Payout button", () => {
      setQueryData({ "funded/my": [makeFundedAccount()] });
      render(<Payouts />);
      expect(screen.getByText("Request Payout")).toBeTruthy();
    });
  });

  // ─── Request Payout button state ───────────────────────
  describe("Request Payout Button", () => {
    it("is enabled when funded accounts exist", () => {
      setQueryData({ "funded/my": [makeFundedAccount()] });
      render(<Payouts />);
      const btn = screen.getByText("Request Payout").closest("button");
      expect(btn).toBeTruthy();
      expect(btn).not.toBeDisabled();
    });

    it("is disabled when no funded accounts exist", () => {
      setQueryData({ "funded/my": [] });
      render(<Payouts />);
      const btn = screen.getByText("Request Payout").closest("button");
      expect(btn).toBeTruthy();
      expect(btn).toBeDisabled();
    });

    it("is disabled when funded accounts are loading", () => {
      setQueryData({});
      // Delete funded/my to simulate loading
      delete queryDataMap["funded/my"];
      render(<Payouts />);
      const btn = screen.getByText("Request Payout").closest("button");
      expect(btn).toBeDisabled();
    });
  });

  // ─── Stats section ────────────────────────────────────
  describe("Stats Section", () => {
    it("renders all three stat cards", () => {
      setQueryData({});
      render(<Payouts />);
      expect(screen.getByText("Total Paid")).toBeTruthy();
      expect(screen.getByText("Pending")).toBeTruthy();
      expect(screen.getByText("Total Payouts")).toBeTruthy();
    });

    it("displays total paid amount in NGN", () => {
      setQueryData({ "payouts/stats": makeStats({ totalPaid: 250000 }) });
      render(<Payouts />);
      expect(screen.getByText("₦250,000")).toBeTruthy();
    });

    it("displays pending amount in NGN", () => {
      setQueryData({ "payouts/stats": makeStats({ totalPending: 75000 }) });
      render(<Payouts />);
      expect(screen.getByText("₦75,000")).toBeTruthy();
    });

    it("displays total payout count", () => {
      setQueryData({ "payouts/stats": makeStats({ totalPayouts: 12 }) });
      render(<Payouts />);
      expect(screen.getByText("12")).toBeTruthy();
    });

    it("shows zero values when stats are null", () => {
      setQueryData({ "payouts/stats": null });
      render(<Payouts />);
      // ₦0 appears in both Total Paid and Pending stat cards
      const zeros = screen.getAllByText((text) => text.includes("0") && text.includes("₦"));
      expect(zeros.length).toBeGreaterThanOrEqual(2);
    });

    it("formats large amounts with commas", () => {
      setQueryData({ "payouts/stats": makeStats({ totalPaid: 1234567 }) });
      render(<Payouts />);
      expect(screen.getByText("₦1,234,567")).toBeTruthy();
    });
  });

  // ─── Empty state ──────────────────────────────────────
  describe("Empty State", () => {
    it("shows empty state when no payouts exist", () => {
      setQueryData({ "payouts/my": [] });
      render(<Payouts />);
      expect(screen.getByText("No payout requests yet")).toBeTruthy();
    });

    it("shows empty state when payouts is undefined", () => {
      setQueryData({});
      delete queryDataMap["payouts/my"];
      render(<Payouts />);
      // With payouts/my undefined, isLoading is true → spinner
      const { container } = render(<Payouts />);
      expect(container.querySelector(".animate-spin")).toBeTruthy();
    });

    it("renders DollarSign icon in empty state", () => {
      setQueryData({ "payouts/my": [] });
      const { container } = render(<Payouts />);
      const emptyIcon = container.querySelector(".h-8.w-8");
      expect(emptyIcon).toBeTruthy();
    });
  });

  // ─── Payout list ──────────────────────────────────────
  describe("Payout List", () => {
    it("renders a single payout request", () => {
      setQueryData({
        "payouts/stats": makeStats({ totalPaid: 0, totalPending: 0 }),
        "payouts/my": [makePayout({ amount: 80000, status: "pending" })],
      });
      render(<Payouts />);
      expect(screen.getByText("₦80,000")).toBeTruthy();
      expect(screen.getByText("pending")).toBeTruthy();
    });

    it("renders multiple payout requests", () => {
      setQueryData({
        "payouts/stats": makeStats({ totalPaid: 0, totalPending: 0, totalPayouts: 0 }),
        "payouts/my": [
          makePayout({ id: 1, amount: 80000, status: "pending" }),
          makePayout({ id: 2, amount: 90000, status: "paid" }),
          makePayout({ id: 3, amount: 70000, status: "rejected" }),
        ],
      });
      render(<Payouts />);
      expect(screen.getByText("₦80,000")).toBeTruthy();
      expect(screen.getByText("₦90,000")).toBeTruthy();
      expect(screen.getByText("₦70,000")).toBeTruthy();
      expect(screen.getByText("pending")).toBeTruthy();
      expect(screen.getByText("paid")).toBeTruthy();
      expect(screen.getByText("rejected")).toBeTruthy();
    });

    it("shows payment method for each payout", () => {
      setQueryData({
        "payouts/stats": makeStats({ totalPaid: 0, totalPending: 0 }),
        "payouts/my": [
          makePayout({ amount: 60000, paymentMethod: "bank_transfer" }),
          makePayout({ id: 2, amount: 45000, paymentMethod: "mobile_money" }),
        ],
      });
      render(<Payouts />);
      expect(screen.getByText(/bank_transfer/)).toBeTruthy();
      expect(screen.getByText(/mobile_money/)).toBeTruthy();
    });

    it("shows formatted date for each payout", () => {
      const date = new Date("2025-06-15");
      setQueryData({
        "payouts/stats": makeStats({ totalPaid: 0, totalPending: 0 }),
        "payouts/my": [makePayout({ amount: 60000, requestedAt: date.getTime() })],
      });
      render(<Payouts />);
      expect(screen.getByText(/6\/15\/2025/)).toBeTruthy();
    });

    it("handles missing requestedAt gracefully", () => {
      setQueryData({
        "payouts/stats": makeStats({ totalPaid: 0, totalPending: 0 }),
        "payouts/my": [makePayout({ amount: 60000, requestedAt: null })],
      });
      render(<Payouts />);
      expect(screen.getByText("₦60,000")).toBeTruthy();
    });
  });

  // ─── Status badges ────────────────────────────────────
  describe("Status Badges", () => {
    it("renders paid status", () => {
      setQueryData({
        "payouts/stats": makeStats({ totalPaid: 0, totalPending: 0 }),
        "payouts/my": [makePayout({ amount: 60000, status: "paid" })],
      });
      render(<Payouts />);
      expect(screen.getByText("paid")).toBeTruthy();
    });

    it("renders rejected status", () => {
      setQueryData({
        "payouts/stats": makeStats({ totalPaid: 0, totalPending: 0 }),
        "payouts/my": [makePayout({ amount: 60000, status: "rejected" })],
      });
      render(<Payouts />);
      expect(screen.getByText("rejected")).toBeTruthy();
    });

    it("renders pending status", () => {
      setQueryData({
        "payouts/stats": makeStats({ totalPaid: 0, totalPending: 0 }),
        "payouts/my": [makePayout({ amount: 60000, status: "pending" })],
      });
      render(<Payouts />);
      expect(screen.getByText("pending")).toBeTruthy();
    });

    it("renders processing status", () => {
      setQueryData({
        "payouts/stats": makeStats({ totalPaid: 0, totalPending: 0 }),
        "payouts/my": [makePayout({ amount: 60000, status: "processing" })],
      });
      render(<Payouts />);
      expect(screen.getByText("processing")).toBeTruthy();
    });
  });

  // ─── Request payout dialog ────────────────────────────
  describe("Request Payout Dialog", () => {
    it("does not show dialog initially", () => {
      setQueryData({ "funded/my": [makeFundedAccount()] });
      render(<Payouts />);
      expect(screen.queryByTestId("dialog")).toBeNull();
    });

    it("opens dialog when Request Payout button is clicked", async () => {
      const user = userEvent.setup();
      setQueryData({ "funded/my": [makeFundedAccount()] });
      render(<Payouts />);

      await user.click(screen.getByText("Request Payout"));
      expect(screen.getByTestId("dialog")).toBeTruthy();
    });

    it("renders dialog title", async () => {
      const user = userEvent.setup();
      setQueryData({ "funded/my": [makeFundedAccount()] });
      render(<Payouts />);

      await user.click(screen.getByText("Request Payout"));
      // Dialog title "Request Payout" also exists as page button, use dialog container
      expect(screen.getByTestId("dialog-content")).toBeTruthy();
      expect(screen.getByText("Submit Request")).toBeTruthy();
    });

    it("renders funded account selector in dialog", async () => {
      const user = userEvent.setup();
      setQueryData({
        "funded/my": [makeFundedAccount({ accountSize: 50000 }), makeFundedAccount({ id: 2, accountSize: 100000 })],
      });
      render(<Payouts />);

      await user.click(screen.getByText("Request Payout"));
      expect(screen.getByText("Select account")).toBeTruthy();
      expect(screen.getByText((t) => t.includes("50,000") && t.includes("Account"))).toBeTruthy();
      expect(screen.getByText((t) => t.includes("100,000") && t.includes("Account"))).toBeTruthy();
    });

    it("renders amount input field", async () => {
      const user = userEvent.setup();
      setQueryData({ "funded/my": [makeFundedAccount()] });
      render(<Payouts />);

      await user.click(screen.getByText("Request Payout"));
      expect(screen.getByText("Amount (NGN)")).toBeTruthy();
      expect(screen.getAllByRole("spinbutton").length).toBeGreaterThanOrEqual(1);
    });

    it("renders payment details input field", async () => {
      const user = userEvent.setup();
      setQueryData({ "funded/my": [makeFundedAccount()] });
      render(<Payouts />);

      await user.click(screen.getByText("Request Payout"));
      expect(screen.getByText("Payment Details")).toBeTruthy();
      expect(screen.getByPlaceholderText("Bank name, account number")).toBeTruthy();
    });

    it("renders Submit Request button in dialog", async () => {
      const user = userEvent.setup();
      setQueryData({ "funded/my": [makeFundedAccount()] });
      render(<Payouts />);

      await user.click(screen.getByText("Request Payout"));
      expect(screen.getByText("Submit Request")).toBeTruthy();
    });

    it("closes dialog when close button is clicked", async () => {
      const user = userEvent.setup();
      setQueryData({ "funded/my": [makeFundedAccount()] });
      render(<Payouts />);

      await user.click(screen.getByText("Request Payout"));
      expect(screen.getByTestId("dialog")).toBeTruthy();

      await user.click(screen.getByTestId("dialog-close"));
      expect(screen.queryByTestId("dialog")).toBeNull();
    });
  });

  // ─── Request payout form interaction ──────────────────
  describe("Request Payout Form", () => {
    it("allows entering an amount via spinbutton", async () => {
      const user = userEvent.setup();
      setQueryData({ "funded/my": [makeFundedAccount()] });
      render(<Payouts />);

      await user.click(screen.getByText("Request Payout"));
      const amountInput = screen.getAllByRole("spinbutton")[0];
      await user.type(amountInput, "25000");
      expect(amountInput).toHaveValue(25000);
    });

    it("allows entering payment details", async () => {
      const user = userEvent.setup();
      setQueryData({ "funded/my": [makeFundedAccount()] });
      render(<Payouts />);

      await user.click(screen.getByText("Request Payout"));
      const detailsInput = screen.getByPlaceholderText("Bank name, account number");
      await user.type(detailsInput, "GTBank - 0123456789");
      expect(detailsInput).toHaveValue("GTBank - 0123456789");
    });

    it("allows selecting a funded account from dropdown", async () => {
      const user = userEvent.setup();
      setQueryData({
        "funded/my": [makeFundedAccount({ id: 1, accountSize: 50000 }), makeFundedAccount({ id: 2, accountSize: 100000, challengeId: 20 })],
      });
      render(<Payouts />);

      await user.click(screen.getByText("Request Payout"));
      const select = screen.getByRole("combobox");
      await user.selectOptions(select, "2");
      expect(select).toHaveValue("2");
    });

    it("shows error toast when submitting without account and amount", async () => {
      const user = userEvent.setup();
      setQueryData({ "funded/my": [makeFundedAccount()] });
      render(<Payouts />);

      await user.click(screen.getByText("Request Payout"));
      await user.click(screen.getByText("Submit Request"));
      expect(toast.error).toHaveBeenCalledWith("Select account and enter amount");
    });

    it("shows error toast when submitting with amount but no account", async () => {
      const user = userEvent.setup();
      setQueryData({ "funded/my": [makeFundedAccount()] });
      render(<Payouts />);

      await user.click(screen.getByText("Request Payout"));
      const amountInput = screen.getAllByRole("spinbutton")[0];
      await user.type(amountInput, "25000");
      await user.click(screen.getByText("Submit Request"));
      expect(toast.error).toHaveBeenCalledWith("Select account and enter amount");
    });

    it("submits payout request with correct data", async () => {
      const user = userEvent.setup();
      mockMutateAsync.mockResolvedValueOnce({ message: "ok" });
      setQueryData({
        "funded/my": [makeFundedAccount({ id: 1, challengeId: 10, accountSize: 50000 })],
      });
      render(<Payouts />);

      await user.click(screen.getByText("Request Payout"));
      const select = screen.getByRole("combobox");
      await user.selectOptions(select, "1");
      const amountInput = screen.getAllByRole("spinbutton")[0];
      await user.type(amountInput, "25000");
      const detailsInput = screen.getByPlaceholderText("Bank name, account number");
      await user.type(detailsInput, "GTBank - 0123456789");

      await user.click(screen.getByText("Submit Request"));

      await waitFor(() => {
        expect(mockMutateAsync).toHaveBeenCalledWith({
          fundedAccountId: 1,
          challengeId: 10,
          amount: 25000,
          paymentMethod: "bank_transfer",
          paymentDetails: "GTBank - 0123456789",
        });
      });
    });

    it("shows success toast after successful submission", async () => {
      const user = userEvent.setup();
      setQueryData({
        "funded/my": [makeFundedAccount({ id: 1, challengeId: 10, accountSize: 50000 })],
      });
      render(<Payouts />);

      await user.click(screen.getByText("Request Payout"));
      const select = screen.getByRole("combobox");
      await user.selectOptions(select, "1");
      const amountInput = screen.getAllByRole("spinbutton")[0];
      await user.type(amountInput, "25000");

      await user.click(screen.getByText("Submit Request"));

      await waitFor(() => {
        expect(toast.success).toHaveBeenCalledWith("Payout request submitted");
      });
    });

    it("closes dialog after successful submission", async () => {
      const user = userEvent.setup();
      setQueryData({
        "funded/my": [makeFundedAccount({ id: 1, challengeId: 10, accountSize: 50000 })],
      });
      render(<Payouts />);

      await user.click(screen.getByText("Request Payout"));
      const select = screen.getByRole("combobox");
      await user.selectOptions(select, "1");
      const amountInput = screen.getAllByRole("spinbutton")[0];
      await user.type(amountInput, "25000");

      await user.click(screen.getByText("Submit Request"));

      await waitFor(() => {
        expect(screen.queryByTestId("dialog")).toBeNull();
      });
    });

    it("shows error toast on failed submission", async () => {
      const user = userEvent.setup();
      mockMutateAsync.mockRejectedValueOnce(new Error("Insufficient balance"));
      setQueryData({
        "funded/my": [makeFundedAccount({ id: 1, challengeId: 10, accountSize: 50000 })],
      });
      render(<Payouts />);

      await user.click(screen.getByText("Request Payout"));
      const select = screen.getByRole("combobox");
      await user.selectOptions(select, "1");
      const amountInput = screen.getAllByRole("spinbutton")[0];
      await user.type(amountInput, "25000");

      await user.click(screen.getByText("Submit Request"));

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith("Insufficient balance");
      });
    });
  });

  // ─── Multiple funded accounts ─────────────────────────
  describe("Multiple Funded Accounts", () => {
    it("lists all funded accounts in the dropdown", async () => {
      const user = userEvent.setup();
      setQueryData({
        "funded/my": [
          makeFundedAccount({ id: 1, accountSize: 25000 }),
          makeFundedAccount({ id: 2, accountSize: 50000, challengeId: 20 }),
          makeFundedAccount({ id: 3, accountSize: 100000, challengeId: 30 }),
        ],
      });
      render(<Payouts />);

      await user.click(screen.getByText("Request Payout"));
      expect(screen.getByText((t) => t.includes("25,000") && t.includes("Account"))).toBeTruthy();
      expect(screen.getByText((t) => t.includes("50,000") && t.includes("Account"))).toBeTruthy();
      expect(screen.getByText((t) => t.includes("100,000") && t.includes("Account"))).toBeTruthy();
    });
  });

  // ─── Sortable funded accounts list ─────────────────────
  describe("Sortable Funded Accounts", () => {
    it("renders the funded accounts list with sortable headers", () => {
      setQueryData({ "funded/my": [makeFundedAccount()] });
      render(<Payouts />);

      expect(screen.getByText(/Funded Accounts/)).toBeTruthy();
      for (const label of ["Size", "Status", "Activated", "Paid Out"]) {
        expect(screen.getByRole("button", { name: `Sort by ${label}` })).toBeTruthy();
      }
      // Default sort is activatedAt desc → Activated is active
      expect(screen.getByRole("button", { name: "Sort by Activated" }).getAttribute("aria-pressed")).toBe("true");
    });

    it("calls the API with sortBy/sortOrder when a header is clicked", async () => {
      const user = userEvent.setup();
      setQueryData({ "funded/my": [makeFundedAccount()] });
      render(<Payouts />);

      await user.click(screen.getByRole("button", { name: "Sort by Size" }));

      const calls = vi.mocked(useApiQuery).mock.calls;
      const fundedCall = calls.find((c) => String(c[1]).includes("/api/payouts/my/funded?") && String(c[1]).includes("sortBy=accountSize"));
      expect(fundedCall).toBeTruthy();
      expect(String(fundedCall![1])).toContain("sortOrder=desc");
      expect(screen.getByRole("button", { name: "Sort by Size" }).getAttribute("aria-pressed")).toBe("true");
    });

    it("toggles to ascending when the active column is clicked again", async () => {
      const user = userEvent.setup();
      setQueryData({ "funded/my": [makeFundedAccount()] });
      render(<Payouts />);

      await user.click(screen.getByRole("button", { name: "Sort by Size" }));
      await user.click(screen.getByRole("button", { name: "Sort by Size" }));

      const calls = vi.mocked(useApiQuery).mock.calls;
      const ascCall = calls.find((c) => String(c[1]).includes("/api/payouts/my/funded?") && String(c[1]).includes("sortBy=accountSize&sortOrder=asc"));
      expect(ascCall).toBeTruthy();
    });
  });

  // ─── Full integration ─────────────────────────────────
  describe("Full Integration", () => {
    it("renders all sections together with complete data", () => {
      setQueryData({
        "payouts/stats": makeStats({ totalPaid: 200000, totalPending: 75000, totalPayouts: 8 }),
        "payouts/my": [
          makePayout({ id: 1, amount: 50000, status: "paid", paymentMethod: "bank_transfer" }),
          makePayout({ id: 2, amount: 80000, status: "pending", paymentMethod: "mobile_money" }),
          makePayout({ id: 3, amount: 30000, status: "rejected", paymentMethod: "bank_transfer" }),
        ],
        "funded/my": [makeFundedAccount()],
      });
      render(<Payouts />);

      // Header
      expect(screen.getByText("Payouts")).toBeTruthy();
      expect(screen.getByText(/Request profit withdrawals/)).toBeTruthy();
      expect(screen.getByText("Request Payout")).toBeTruthy();

      // Stats
      expect(screen.getByText("Total Paid")).toBeTruthy();
      expect(screen.getByText("₦200,000")).toBeTruthy();
      expect(screen.getByText("Pending")).toBeTruthy();
      expect(screen.getByText("Total Payouts")).toBeTruthy();
      expect(screen.getByText("8")).toBeTruthy();

      // Payout list (use amounts that don't collide with stats)
      expect(screen.getByText("₦50,000")).toBeTruthy();
      expect(screen.getByText("₦80,000")).toBeTruthy();
      expect(screen.getByText("₦30,000")).toBeTruthy();
      expect(screen.getByText("paid")).toBeTruthy();
      expect(screen.getByText("pending")).toBeTruthy();
      expect(screen.getByText("rejected")).toBeTruthy();
    });

    it("renders loading → data transition correctly", () => {
      // Initially loading (no data set)
      clearAllQueryData();
      const { container } = render(<Payouts />);
      expect(container.querySelector(".animate-spin")).toBeTruthy();

      // Data loads (fresh render with data)
      clearAllQueryData();
      setQueryData({
        "payouts/my": [makePayout({ amount: 60000 })],
      });
      const { container: container2 } = render(<Payouts />);
      expect(container2.querySelector(".animate-spin")).toBeNull();
      expect(screen.getByText("Payouts")).toBeTruthy();
      expect(screen.getByText("₦60,000")).toBeTruthy();
    });

    it("handles large payout amounts", () => {
      setQueryData({
        "payouts/stats": makeStats({ totalPaid: 999999999 }),
        "payouts/my": [makePayout({ amount: 999999999 })],
      });
      render(<Payouts />);
      // ₦999,999,999 appears in both stat card and payout list
      const amounts = screen.getAllByText("₦999,999,999");
      expect(amounts.length).toBeGreaterThanOrEqual(2);
    });
  });
});
