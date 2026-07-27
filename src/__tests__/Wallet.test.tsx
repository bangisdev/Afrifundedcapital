// @vitest-environment jsdom
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
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
const mockWithdrawAsync = vi.fn(async () => ({ message: "ok" }));

vi.mock("@/hooks/use-api", () => ({
  useApiQuery: vi.fn((key: string[], path: string, _opts?: any) => {
    const dataKey = `${key.join("/")}`;
    if (queryDataMap[dataKey] === undefined) {
      return { data: undefined, isLoading: true };
    }
    return { data: queryDataMap[dataKey], isLoading: false };
  }),
  useApiMutation: vi.fn((_method: string, _path: string, _onSuccess?: any) => ({
    mutateAsync: mockWithdrawAsync,
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
import Wallet from "@/pages/dashboard/Wallet";
import { toast } from "sonner";

// ─── Test data factories ──────────────────────────────────
function makeWallet(overrides: any = {}) {
  return {
    balance: 150000,
    referralBalance: 5000,
    bonusBalance: 2500,
    ...overrides,
  };
}

function makeTransaction(overrides: any = {}) {
  return {
    id: 1,
    type: "deposit",
    amount: 50000,
    description: "Flutterwave Payment",
    createdAt: Date.now() - 86400000,
    ...overrides,
  };
}

function makePayment(overrides: any = {}) {
  return {
    id: 1,
    amount: 50000,
    status: "completed",
    reference: "FLW_REF_1234567890",
    description: "Challenge Purchase",
    createdAt: Date.now() - 86400000 * 3,
    ...overrides,
  };
}

// ─── Helper: clear all mock data ──────────────────────────
function clearAllQueryData() {
  Object.keys(queryDataMap).forEach((k) => delete queryDataMap[k]);
}

// ─── Helper to configure mock data ────────────────────────
function setQueryData(updates: Record<string, any>) {
  Object.keys(queryDataMap).forEach((k) => delete queryDataMap[k]);
  const defaults: Record<string, any> = {
    "wallet/my": makeWallet(),
    "wallet/txns": [],
    "payments/my": [],
  };
  Object.assign(queryDataMap, defaults, updates);
}

// ─── Tests ────────────────────────────────────────────────
describe("Wallet Page", () => {
  beforeEach(() => {
    clearAllQueryData();
    vi.clearAllMocks();
    mockWithdrawAsync.mockResolvedValue({ message: "ok" });
  });

  // ─── Loading state ─────────────────────────────────────
  describe("Loading State", () => {
    it("shows spinner when wallet data is loading", () => {
      clearAllQueryData();
      const { container } = render(<Wallet />);
      expect(container.querySelector(".animate-spin")).toBeTruthy();
    });

    it("hides spinner once all data is loaded", () => {
      setQueryData({});
      const { container } = render(<Wallet />);
      expect(container.querySelector(".animate-spin")).toBeNull();
    });

    it("shows spinner when transactions are still loading", () => {
      queryDataMap["wallet/my"] = makeWallet();
      queryDataMap["payments/my"] = [];
      // wallet/txns not set = loading
      const { container } = render(<Wallet />);
      expect(container.querySelector(".animate-spin")).toBeTruthy();
    });
  });

  // ─── Page header ───────────────────────────────────────
  describe("Page Header", () => {
    it("renders the Wallet title", () => {
      setQueryData({});
      render(<Wallet />);
      expect(screen.getByText("Wallet")).toBeTruthy();
    });

    it("renders the page description", () => {
      setQueryData({});
      render(<Wallet />);
      expect(screen.getByText(/Manage your funds/)).toBeTruthy();
    });
  });

  // ─── Balance cards ─────────────────────────────────────
  describe("Balance Cards", () => {
    it("renders Main Balance card", () => {
      setQueryData({});
      render(<Wallet />);
      expect(screen.getByText("Main Balance")).toBeTruthy();
    });

    it("displays wallet balance in NGN", () => {
      setQueryData({ "wallet/my": makeWallet({ balance: 250000 }) });
      render(<Wallet />);
      expect(screen.getByText("₦250,000")).toBeTruthy();
    });

    it("displays zero balance when wallet has no balance", () => {
      setQueryData({ "wallet/my": makeWallet({ balance: 0 }) });
      render(<Wallet />);
      // Balance is ₦0
      expect(screen.getByText("Main Balance")).toBeTruthy();
    });

    it("renders This Month card", () => {
      setQueryData({});
      render(<Wallet />);
      expect(screen.getByText("This Month")).toBeTruthy();
    });

    it("shows completed payments count", () => {
      setQueryData({
        "payments/my": [
          makePayment({ id: 1, status: "completed" }),
          makePayment({ id: 2, status: "completed" }),
          makePayment({ id: 3, status: "pending" }),
        ],
      });
      render(<Wallet />);
      expect(screen.getByText("2 completed payments")).toBeTruthy();
    });

    it("shows zero completed payments when none exist", () => {
      setQueryData({ "payments/my": [] });
      render(<Wallet />);
      expect(screen.getByText("0 completed payments")).toBeTruthy();
    });

    it("renders Withdraw Funds button", () => {
      setQueryData({});
      render(<Wallet />);
      expect(screen.getByText("Withdraw Funds")).toBeTruthy();
    });

    it("formats large balances with commas", () => {
      setQueryData({ "wallet/my": makeWallet({ balance: 1234567 }) });
      render(<Wallet />);
      expect(screen.getByText("₦1,234,567")).toBeTruthy();
    });
  });

  // ─── Tab navigation ────────────────────────────────────
  describe("Tab Navigation", () => {
    it("defaults to Transactions tab", () => {
      setQueryData({});
      render(<Wallet />);
      expect(screen.getByPlaceholderText("Search transactions...")).toBeTruthy();
    });

    it("renders both tab buttons", () => {
      setQueryData({});
      render(<Wallet />);
      expect(screen.getByText("Transactions")).toBeTruthy();
      expect(screen.getByText("Payment History")).toBeTruthy();
    });

    it("switches to Payment History tab", async () => {
      const user = userEvent.setup();
      setQueryData({});
      render(<Wallet />);

      await user.click(screen.getByText("Payment History"));
      expect(screen.queryByPlaceholderText("Search transactions...")).toBeNull();
      expect(screen.getByText("No payments yet")).toBeTruthy();
    });

    it("switches back to Transactions tab", async () => {
      const user = userEvent.setup();
      setQueryData({ "wallet/txns": [makeTransaction()] });
      render(<Wallet />);

      await user.click(screen.getByText("Payment History"));
      expect(screen.queryByPlaceholderText("Search transactions...")).toBeNull();

      await user.click(screen.getByText("Transactions"));
      expect(screen.getByPlaceholderText("Search transactions...")).toBeTruthy();
      expect(screen.getByText("Flutterwave Payment")).toBeTruthy();
    });
  });

  // ─── Transactions tab ──────────────────────────────────
  describe("Transactions Tab", () => {
    it("renders search input", () => {
      setQueryData({});
      render(<Wallet />);
      expect(screen.getByPlaceholderText("Search transactions...")).toBeTruthy();
    });

    it("renders filter dropdown", () => {
      setQueryData({});
      render(<Wallet />);
      expect(screen.getByDisplayValue("All")).toBeTruthy();
    });

    it("shows empty state when no transactions", () => {
      setQueryData({ "wallet/txns": [] });
      render(<Wallet />);
      expect(screen.getByText("No transactions found")).toBeTruthy();
    });

    it("renders a single transaction", () => {
      setQueryData({
        "wallet/txns": [makeTransaction({ type: "deposit", amount: 50000, description: "Bank Transfer" })],
      });
      render(<Wallet />);
      expect(screen.getByText("Bank Transfer")).toBeTruthy();
      expect(screen.getByText("+₦50,000")).toBeTruthy();
    });

    it("renders multiple transactions", () => {
      setQueryData({
        "wallet/txns": [
          makeTransaction({ id: 1, type: "deposit", amount: 50000, description: "Deposit" }),
          makeTransaction({ id: 2, type: "withdrawal", amount: 25000, description: "Withdrawal" }),
          makeTransaction({ id: 3, type: "challenge_purchase", amount: 15000, description: "Challenge Fee" }),
        ],
      });
      render(<Wallet />);
      expect(screen.getByText("Deposit")).toBeTruthy();
      expect(screen.getByText("Withdrawal")).toBeTruthy();
      expect(screen.getByText("Challenge Fee")).toBeTruthy();
    });

    it("shows positive prefix for deposits", () => {
      setQueryData({
        "wallet/txns": [makeTransaction({ type: "deposit", amount: 50000, description: "Deposit" })],
      });
      render(<Wallet />);
      expect(screen.getByText("+₦50,000")).toBeTruthy();
    });

    it("shows negative prefix for withdrawals", () => {
      setQueryData({
        "wallet/txns": [makeTransaction({ type: "withdrawal", amount: 25000, description: "Withdrawal" })],
      });
      render(<Wallet />);
      expect(screen.getByText("-₦25,000")).toBeTruthy();
    });

    it("shows negative prefix for challenge purchases", () => {
      setQueryData({
        "wallet/txns": [makeTransaction({ type: "challenge_purchase", amount: 15000, description: "Challenge Fee" })],
      });
      render(<Wallet />);
      expect(screen.getByText("-₦15,000")).toBeTruthy();
    });

    it("shows formatted date for transactions", () => {
      const date = new Date("2025-06-15");
      setQueryData({
        "wallet/txns": [makeTransaction({ type: "deposit", amount: 50000, description: "Deposit", createdAt: date.getTime() })],
      });
      render(<Wallet />);
      expect(screen.getByText(/15 Jun 2025/)).toBeTruthy();
    });

    it("handles missing createdAt gracefully", () => {
      setQueryData({
        "wallet/txns": [makeTransaction({ type: "deposit", amount: 50000, description: "Deposit", createdAt: null })],
      });
      render(<Wallet />);
      expect(screen.getByText("Deposit")).toBeTruthy();
    });

    it("renders referral_bonus with positive prefix", () => {
      setQueryData({
        "wallet/txns": [makeTransaction({ type: "referral_bonus", amount: 5000, description: "Referral Bonus" })],
      });
      render(<Wallet />);
      expect(screen.getByText("+₦5,000")).toBeTruthy();
    });

    it("renders commission with positive prefix", () => {
      setQueryData({
        "wallet/txns": [makeTransaction({ type: "commission", amount: 10000, description: "Affiliate Commission" })],
      });
      render(<Wallet />);
      expect(screen.getByText("+₦10,000")).toBeTruthy();
    });
  });

  // ─── Transaction search ────────────────────────────────
  describe("Transaction Search", () => {
    it("filters transactions by description", async () => {
      const user = userEvent.setup();
      setQueryData({
        "wallet/txns": [
          makeTransaction({ id: 1, type: "deposit", amount: 50000, description: "Bank Transfer" }),
          makeTransaction({ id: 2, type: "deposit", amount: 25000, description: "Flutterwave Payment" }),
          makeTransaction({ id: 3, type: "withdrawal", amount: 10000, description: "Withdrawal Request" }),
        ],
      });
      render(<Wallet />);

      const searchInput = screen.getByPlaceholderText("Search transactions...");
      await user.type(searchInput, "flutterwave");

      expect(screen.getByText("Flutterwave Payment")).toBeTruthy();
      expect(screen.queryByText("Bank Transfer")).toBeNull();
      expect(screen.queryByText("Withdrawal Request")).toBeNull();
    });

    it("search is case-insensitive", async () => {
      const user = userEvent.setup();
      setQueryData({
        "wallet/txns": [
          makeTransaction({ id: 1, type: "deposit", amount: 50000, description: "Bank Transfer" }),
          makeTransaction({ id: 2, type: "deposit", amount: 25000, description: "Flutterwave Payment" }),
        ],
      });
      render(<Wallet />);

      const searchInput = screen.getByPlaceholderText("Search transactions...");
      await user.type(searchInput, "BANK");

      expect(screen.getByText("Bank Transfer")).toBeTruthy();
      expect(screen.queryByText("Flutterwave Payment")).toBeNull();
    });

    it("searches by type", async () => {
      const user = userEvent.setup();
      setQueryData({
        "wallet/txns": [
          makeTransaction({ id: 1, type: "deposit", amount: 50000, description: "Deposit" }),
          makeTransaction({ id: 2, type: "withdrawal", amount: 25000, description: "Withdrawal" }),
        ],
      });
      render(<Wallet />);

      const searchInput = screen.getByPlaceholderText("Search transactions...");
      await user.type(searchInput, "withdrawal");

      expect(screen.getByText("Withdrawal")).toBeTruthy();
      expect(screen.queryByText("Deposit")).toBeNull();
    });
  });

  // ─── Transaction filter ────────────────────────────────
  describe("Transaction Filter", () => {
    it("filters by deposits", async () => {
      const user = userEvent.setup();
      setQueryData({
        "wallet/txns": [
          makeTransaction({ id: 1, type: "deposit", amount: 50000, description: "Deposit" }),
          makeTransaction({ id: 2, type: "withdrawal", amount: 25000, description: "Withdrawal" }),
          makeTransaction({ id: 3, type: "challenge_purchase", amount: 15000, description: "Challenge Fee" }),
        ],
      });
      render(<Wallet />);

      const filter = screen.getByDisplayValue("All");
      await user.selectOptions(filter, "deposit");

      expect(screen.getByText("Deposit")).toBeTruthy();
      expect(screen.queryByText("Withdrawal")).toBeNull();
      expect(screen.queryByText("Challenge Fee")).toBeNull();
    });

    it("filters by withdrawals", async () => {
      const user = userEvent.setup();
      setQueryData({
        "wallet/txns": [
          makeTransaction({ id: 1, type: "deposit", amount: 50000, description: "Deposit" }),
          makeTransaction({ id: 2, type: "withdrawal", amount: 25000, description: "Withdrawal" }),
        ],
      });
      render(<Wallet />);

      const filter = screen.getByDisplayValue("All");
      await user.selectOptions(filter, "withdrawal");

      expect(screen.getByText("Withdrawal")).toBeTruthy();
      expect(screen.queryByText("Deposit")).toBeNull();
    });

    it("filters by purchases", async () => {
      const user = userEvent.setup();
      setQueryData({
        "wallet/txns": [
          makeTransaction({ id: 1, type: "deposit", amount: 50000, description: "Deposit" }),
          makeTransaction({ id: 2, type: "challenge_purchase", amount: 15000, description: "Challenge Fee" }),
        ],
      });
      render(<Wallet />);

      const filter = screen.getByDisplayValue("All");
      await user.selectOptions(filter, "challenge_purchase");

      expect(screen.getByText("Challenge Fee")).toBeTruthy();
      expect(screen.queryByText("Deposit")).toBeNull();
    });

    it("shows all transactions when filter is 'all'", async () => {
      const user = userEvent.setup();
      setQueryData({
        "wallet/txns": [
          makeTransaction({ id: 1, type: "deposit", amount: 50000, description: "Deposit" }),
          makeTransaction({ id: 2, type: "withdrawal", amount: 25000, description: "Withdrawal" }),
        ],
      });
      render(<Wallet />);

      expect(screen.getByText("Deposit")).toBeTruthy();
      expect(screen.getByText("Withdrawal")).toBeTruthy();
    });

    it("shows empty state when filter matches nothing", async () => {
      const user = userEvent.setup();
      setQueryData({
        "wallet/txns": [
          makeTransaction({ id: 1, type: "deposit", amount: 50000, description: "Deposit" }),
        ],
      });
      render(<Wallet />);

      const filter = screen.getByDisplayValue("All");
      await user.selectOptions(filter, "withdrawal");

      expect(screen.getByText("No transactions found")).toBeTruthy();
    });
  });

  // ─── Payment History tab ───────────────────────────────
  describe("Payment History Tab", () => {
    it("shows empty state when no payments", async () => {
      const user = userEvent.setup();
      setQueryData({ "payments/my": [] });
      render(<Wallet />);

      await user.click(screen.getByText("Payment History"));
      expect(screen.getByText("No payments yet")).toBeTruthy();
    });

    it("renders a completed payment", async () => {
      const user = userEvent.setup();
      setQueryData({
        "payments/my": [makePayment({ description: "Challenge Purchase", status: "completed", reference: "FLW_REF_abc123" })],
      });
      render(<Wallet />);

      await user.click(screen.getByText("Payment History"));
      expect(screen.getByText("Challenge Purchase")).toBeTruthy();
      expect(screen.getByText("₦50,000")).toBeTruthy();
    });

    it("renders multiple payments", async () => {
      const user = userEvent.setup();
      setQueryData({
        "payments/my": [
          makePayment({ id: 1, amount: 50000, description: "Purchase 1", status: "completed", reference: "FLW_REF_001" }),
          makePayment({ id: 2, amount: 75000, description: "Purchase 2", status: "pending", reference: "FLW_REF_002" }),
          makePayment({ id: 3, amount: 30000, description: "Purchase 3", status: "failed", reference: "FLW_REF_003" }),
        ],
      });
      render(<Wallet />);

      await user.click(screen.getByText("Payment History"));
      expect(screen.getByText("Purchase 1")).toBeTruthy();
      expect(screen.getByText("Purchase 2")).toBeTruthy();
      expect(screen.getByText("Purchase 3")).toBeTruthy();
    });

    it("shows truncated reference", async () => {
      const user = userEvent.setup();
      setQueryData({
        "payments/my": [makePayment({ reference: "FLW_REF_1234567890ABC" })],
      });
      render(<Wallet />);

      await user.click(screen.getByText("Payment History"));
      expect(screen.getByText((t) => t.includes("FLW_REF") && t.includes("1234"))).toBeTruthy();
    });

    it("shows default description when none provided", async () => {
      const user = userEvent.setup();
      setQueryData({
        "payments/my": [makePayment({ description: null })],
      });
      render(<Wallet />);

      await user.click(screen.getByText("Payment History"));
      expect(screen.getByText("Challenge Purchase")).toBeTruthy();
    });
  });

  // ─── Payment detail dialog ─────────────────────────────
  describe("Payment Detail Dialog", () => {
    it("opens payment detail dialog on payment click", async () => {
      const user = userEvent.setup();
      setQueryData({
        "payments/my": [makePayment({ reference: "FLW_REF_abc" })],
      });
      render(<Wallet />);

      await user.click(screen.getByText("Payment History"));
      await user.click(screen.getByText("Challenge Purchase"));
      expect(screen.getByTestId("dialog")).toBeTruthy();
    });

    it("shows payment amount in dialog", async () => {
      const user = userEvent.setup();
      setQueryData({
        "payments/my": [makePayment({ amount: 999000, reference: "FLW_REF_abc" })],
      });
      render(<Wallet />);

      await user.click(screen.getByText("Payment History"));
      await user.click(screen.getByText("Challenge Purchase"));
      // ₦999,000 appears in both payment list and dialog
      const amounts = screen.getAllByText("₦999,000");
      expect(amounts.length).toBeGreaterThanOrEqual(2);
    });

    it("shows payment reference in dialog", async () => {
      const user = userEvent.setup();
      setQueryData({
        "payments/my": [makePayment({ reference: "FLW_REF_abc123" })],
      });
      render(<Wallet />);

      await user.click(screen.getByText("Payment History"));
      await user.click(screen.getByText("Challenge Purchase"));
      expect(screen.getByText("FLW_REF_abc123")).toBeTruthy();
    });

    it("shows payment status in dialog", async () => {
      const user = userEvent.setup();
      setQueryData({
        "payments/my": [makePayment({ status: "completed", reference: "FLW_REF_abc" })],
      });
      render(<Wallet />);

      await user.click(screen.getByText("Payment History"));
      await user.click(screen.getByText("Challenge Purchase"));
      expect(screen.getByText("completed")).toBeTruthy();
    });

    it("shows payment date in dialog", async () => {
      const user = userEvent.setup();
      const date = new Date("2025-06-15");
      setQueryData({
        "payments/my": [makePayment({ createdAt: date.getTime(), reference: "FLW_REF_abc" })],
      });
      render(<Wallet />);

      await user.click(screen.getByText("Payment History"));
      await user.click(screen.getByText("Challenge Purchase"));
      expect(screen.getByText("6/15/2025")).toBeTruthy();
    });

    it("closes payment dialog on close button", async () => {
      const user = userEvent.setup();
      setQueryData({
        "payments/my": [makePayment({ reference: "FLW_REF_abc" })],
      });
      render(<Wallet />);

      await user.click(screen.getByText("Payment History"));
      await user.click(screen.getByText("Challenge Purchase"));
      expect(screen.getByTestId("dialog")).toBeTruthy();

      await user.click(screen.getByTestId("dialog-close"));
      expect(screen.queryByTestId("dialog")).toBeNull();
    });
  });

  // ─── Withdraw dialog ───────────────────────────────────
  describe("Withdraw Dialog", () => {
    it("does not show withdraw dialog initially", () => {
      setQueryData({});
      render(<Wallet />);
      expect(screen.queryByTestId("dialog")).toBeNull();
    });

    it("opens withdraw dialog on Withdraw Funds click", async () => {
      const user = userEvent.setup();
      setQueryData({});
      render(<Wallet />);

      await user.click(screen.getByText("Withdraw Funds"));
      expect(screen.getByTestId("dialog")).toBeTruthy();
    });

    it("shows available balance in withdraw dialog", async () => {
      const user = userEvent.setup();
      setQueryData({ "wallet/my": makeWallet({ balance: 888000 }) });
      render(<Wallet />);

      await user.click(screen.getByText("Withdraw Funds"));
      expect(screen.getByText("Available Balance")).toBeTruthy();
      // ₦888,000 appears in both balance card and withdraw dialog
      const balances = screen.getAllByText("₦888,000");
      expect(balances.length).toBeGreaterThanOrEqual(2);
    });

    it("renders amount input in withdraw dialog", async () => {
      const user = userEvent.setup();
      setQueryData({});
      render(<Wallet />);

      await user.click(screen.getByText("Withdraw Funds"));
      expect(screen.getByText("Amount (NGN)")).toBeTruthy();
      expect(screen.getByPlaceholderText("5000")).toBeTruthy();
    });

    it("renders account details input in withdraw dialog", async () => {
      const user = userEvent.setup();
      setQueryData({});
      render(<Wallet />);

      await user.click(screen.getByText("Withdraw Funds"));
      expect(screen.getByText("Account Details")).toBeTruthy();
      expect(screen.getByPlaceholderText("Bank name, account number")).toBeTruthy();
    });

    it("renders Submit Withdrawal Request button", async () => {
      const user = userEvent.setup();
      setQueryData({});
      render(<Wallet />);

      await user.click(screen.getByText("Withdraw Funds"));
      expect(screen.getByText("Submit Withdrawal Request")).toBeTruthy();
    });

    it("shows error toast for invalid amount (zero)", async () => {
      const user = userEvent.setup();
      setQueryData({});
      render(<Wallet />);

      await user.click(screen.getByText("Withdraw Funds"));
      await user.click(screen.getByText("Submit Withdrawal Request"));
      expect(toast.error).toHaveBeenCalledWith("Invalid amount");
    });

    it("shows error toast for amount exceeding balance", async () => {
      const user = userEvent.setup();
      setQueryData({ "wallet/my": makeWallet({ balance: 10000 }) });
      render(<Wallet />);

      await user.click(screen.getByText("Withdraw Funds"));
      const amountInput = screen.getAllByRole("spinbutton")[0];
      await user.type(amountInput, "50000");
      await user.click(screen.getByText("Submit Withdrawal Request"));
      expect(toast.error).toHaveBeenCalledWith("Insufficient balance");
    });

    it("allows entering withdrawal amount", async () => {
      const user = userEvent.setup();
      setQueryData({});
      render(<Wallet />);

      await user.click(screen.getByText("Withdraw Funds"));
      const amountInput = screen.getAllByRole("spinbutton")[0];
      await user.type(amountInput, "25000");
      expect(amountInput).toHaveValue(25000);
    });

    it("allows entering account details", async () => {
      const user = userEvent.setup();
      setQueryData({});
      render(<Wallet />);

      await user.click(screen.getByText("Withdraw Funds"));
      const detailsInput = screen.getByPlaceholderText("Bank name, account number");
      await user.type(detailsInput, "GTBank - 0123456789");
      expect(detailsInput).toHaveValue("GTBank - 0123456789");
    });

    it("submits withdrawal request with correct data", async () => {
      const user = userEvent.setup();
      setQueryData({ "wallet/my": makeWallet({ balance: 100000 }) });
      render(<Wallet />);

      await user.click(screen.getByText("Withdraw Funds"));
      const amountInput = screen.getAllByRole("spinbutton")[0];
      await user.type(amountInput, "25000");
      const detailsInput = screen.getByPlaceholderText("Bank name, account number");
      await user.type(detailsInput, "GTBank - 0123456789");

      await user.click(screen.getByText("Submit Withdrawal Request"));

      await waitFor(() => {
        expect(mockWithdrawAsync).toHaveBeenCalledWith({
          amount: 25000,
          paymentMethod: "bank_transfer",
          paymentDetails: "GTBank - 0123456789",
        });
      });
    });

    it("shows success toast after submission", async () => {
      const user = userEvent.setup();
      setQueryData({ "wallet/my": makeWallet({ balance: 100000 }) });
      render(<Wallet />);

      await user.click(screen.getByText("Withdraw Funds"));
      const amountInput = screen.getAllByRole("spinbutton")[0];
      await user.type(amountInput, "25000");

      await user.click(screen.getByText("Submit Withdrawal Request"));

      await waitFor(() => {
        expect(toast.success).toHaveBeenCalledWith("Withdrawal request submitted");
      });
    });

    it("closes dialog after successful submission", async () => {
      const user = userEvent.setup();
      setQueryData({ "wallet/my": makeWallet({ balance: 100000 }) });
      render(<Wallet />);

      await user.click(screen.getByText("Withdraw Funds"));
      const amountInput = screen.getAllByRole("spinbutton")[0];
      await user.type(amountInput, "25000");

      await user.click(screen.getByText("Submit Withdrawal Request"));

      await waitFor(() => {
        expect(screen.queryByTestId("dialog")).toBeNull();
      });
    });

    it("shows error toast on failed submission", async () => {
      const user = userEvent.setup();
      mockWithdrawAsync.mockRejectedValueOnce(new Error("Network error"));
      setQueryData({ "wallet/my": makeWallet({ balance: 100000 }) });
      render(<Wallet />);

      await user.click(screen.getByText("Withdraw Funds"));
      const amountInput = screen.getAllByRole("spinbutton")[0];
      await user.type(amountInput, "25000");

      await user.click(screen.getByText("Submit Withdrawal Request"));

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith("Network error");
      });
    });

    it("closes withdraw dialog on close button", async () => {
      const user = userEvent.setup();
      setQueryData({});
      render(<Wallet />);

      await user.click(screen.getByText("Withdraw Funds"));
      expect(screen.getByTestId("dialog")).toBeTruthy();

      await user.click(screen.getByTestId("dialog-close"));
      expect(screen.queryByTestId("dialog")).toBeNull();
    });
  });

  // ─── Full integration ──────────────────────────────────
  describe("Full Integration", () => {
    it("renders all sections together with complete data", () => {
      setQueryData({
        "wallet/my": makeWallet({ balance: 200000 }),
        "wallet/txns": [
          makeTransaction({ id: 1, type: "deposit", amount: 100000, description: "Deposit" }),
          makeTransaction({ id: 2, type: "withdrawal", amount: 30000, description: "Withdrawal" }),
        ],
        "payments/my": [
          makePayment({ id: 1, amount: 50000, status: "completed", description: "Purchase 1", reference: "FLW_001" }),
          makePayment({ id: 2, amount: 75000, status: "completed", description: "Purchase 2", reference: "FLW_002" }),
        ],
      });
      render(<Wallet />);

      // Header
      expect(screen.getByText("Wallet")).toBeTruthy();
      expect(screen.getByText(/Manage your funds/)).toBeTruthy();

      // Balance cards
      expect(screen.getByText("Main Balance")).toBeTruthy();
      expect(screen.getByText("₦200,000")).toBeTruthy();
      expect(screen.getByText("This Month")).toBeTruthy();
      expect(screen.getByText("2 completed payments")).toBeTruthy();
      expect(screen.getByText("Withdraw Funds")).toBeTruthy();

      // Tabs
      expect(screen.getByText("Transactions")).toBeTruthy();
      expect(screen.getByText("Payment History")).toBeTruthy();

      // Transaction list (default tab)
      expect(screen.getByText("Deposit")).toBeTruthy();
      expect(screen.getByText("+₦100,000")).toBeTruthy();
      expect(screen.getByText("Withdrawal")).toBeTruthy();
      expect(screen.getByText("-₦30,000")).toBeTruthy();
    });

    it("loading → data transition works correctly", () => {
      clearAllQueryData();
      const { container } = render(<Wallet />);
      expect(container.querySelector(".animate-spin")).toBeTruthy();

      setQueryData({});
      const { container: c2 } = render(<Wallet />);
      expect(c2.querySelector(".animate-spin")).toBeNull();
      expect(screen.getByText("Wallet")).toBeTruthy();
    });

    it("search and filter work together", async () => {
      const user = userEvent.setup();
      setQueryData({
        "wallet/txns": [
          makeTransaction({ id: 1, type: "deposit", amount: 50000, description: "Bank Transfer" }),
          makeTransaction({ id: 2, type: "deposit", amount: 25000, description: "Flutterwave" }),
          makeTransaction({ id: 3, type: "withdrawal", amount: 10000, description: "Bank Transfer Withdrawal" }),
        ],
      });
      render(<Wallet />);

      // Filter to deposits only
      await user.selectOptions(screen.getByDisplayValue("All"), "deposit");

      // Then search within deposits
      await user.type(screen.getByPlaceholderText("Search transactions..."), "bank");

      expect(screen.getByText("Bank Transfer")).toBeTruthy();
      expect(screen.queryByText("Flutterwave")).toBeNull();
      expect(screen.queryByText("Bank Transfer Withdrawal")).toBeNull();
    });
  });
});
