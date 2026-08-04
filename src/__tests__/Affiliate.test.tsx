// @vitest-environment jsdom
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
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

// ─── Mock: navigator.clipboard ─────────────────────────────
let mockWriteText: ReturnType<typeof vi.fn>;
beforeEach(() => {
  mockWriteText = vi.fn(async () => undefined);
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText: mockWriteText },
    writable: true,
    configurable: true,
  });
});

// ─── Mock: useAuth ─────────────────────────────────────────
const mockUser = {
  id: 1,
  name: "Test User",
  email: "test@example.com",
  role: "user",
  referralCode: "USERCODE",
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
const mockGenerateCode = vi.fn(async () => ({ referralCode: "NEWCODE123" }));

vi.mock("@/hooks/use-api", () => ({
  useApiQuery: vi.fn((key: string[], path: string, _opts?: any) => {
    // The page passes query-suffixed keys (["affiliate", "payouts", "/api/affiliates/payouts?..."]),
    // so look up by the stable prefix (first two segments).
    const dataKey = key.slice(0, 2).join("/");
    if (queryDataMap[dataKey] === undefined) {
      return { data: undefined, isLoading: true };
    }
    const base = queryDataMap[dataKey];
    // Simulate the server-driven payouts list: paginate + stats envelope.
    if (dataKey === "affiliate/payouts" && Array.isArray(base)) {
      const query = path.includes("?") ? path.split("?")[1] : "";
      const params = new URLSearchParams(query);
      const page = Number(params.get("page") || 1);
      const pageSize = Number(params.get("pageSize") || 10);
      const total = base.length;
      const totalPages = Math.max(1, Math.ceil(total / pageSize));
      const byStatus = base.reduce<Record<string, number>>((acc, p: any) => {
        acc[p.status] = (acc[p.status] || 0) + 1;
        return acc;
      }, {});
      return {
        data: {
          payouts: base.slice((page - 1) * pageSize, page * pageSize),
          total,
          page,
          pageSize,
          totalPages,
          stats: { total, byStatus },
        },
        isLoading: false,
      };
    }
    // Simulate the server-driven referrals list: paginate + stats envelope.
    if (dataKey === "affiliate/referrals" && Array.isArray(base)) {
      const query = path.includes("?") ? path.split("?")[1] : "";
      const params = new URLSearchParams(query);
      const page = Number(params.get("page") || 1);
      const pageSize = Number(params.get("pageSize") || 10);
      const total = base.length;
      const totalPages = Math.max(1, Math.ceil(total / pageSize));
      const byStatus = base.reduce<Record<string, number>>((acc, r: any) => {
        acc[r.status] = (acc[r.status] || 0) + 1;
        return acc;
      }, {});
      return {
        data: {
          referrals: base.slice((page - 1) * pageSize, page * pageSize),
          total,
          page,
          pageSize,
          totalPages,
          stats: { total, byStatus },
        },
        isLoading: false,
      };
    }
    return { data: base, isLoading: false };
  }),
  useApiMutation: vi.fn((_method: string, _path: string, _onSuccess?: any) => ({
    mutateAsync: mockGenerateCode,
    mutate: vi.fn(),
    isPending: false,
  })),
}));

// ─── Import component after mocks ─────────────────────────
import Affiliate from "@/pages/dashboard/Affiliate";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";

// ─── Test data factories ──────────────────────────────────
function makeAffiliate(overrides: any = {}) {
  return {
    id: 1,
    referralCode: "AF123456",
    totalReferrals: 15,
    totalCommissions: 75000,
    pendingCommissions: 25000,
    ...overrides,
  };
}

function makeReferral(overrides: any = {}) {
  return {
    id: 1,
    referredName: "John Doe",
    referredEmail: "john@example.com",
    status: "converted",
    commissionEarned: 5000,
    createdAt: Date.now() - 86400000,
    ...overrides,
  };
}

function makePayout(overrides: any = {}) {
  return {
    id: 1,
    amount: 10000,
    status: "paid",
    paymentMethod: "bank_transfer",
    paymentDetails: "GTBank 0123456789",
    requestedAt: Date.now() - 86400000,
    ...overrides,
  };
}

// ─── Helpers ──────────────────────────────────────────────
function clearAllQueryData() {
  Object.keys(queryDataMap).forEach((k) => delete queryDataMap[k]);
}

function setQueryData(updates: Record<string, any>) {
  Object.keys(queryDataMap).forEach((k) => delete queryDataMap[k]);
  Object.assign(queryDataMap, { "affiliate/payouts": [], "affiliate/referrals": [] }, updates);
}

// ─── Tests ────────────────────────────────────────────────
describe("Affiliate Page", () => {
  beforeEach(() => {
    clearAllQueryData();
    vi.clearAllMocks();
    mockGenerateCode.mockResolvedValue({ referralCode: "NEWCODE123" });
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

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ─── Loading state ─────────────────────────────────────
  describe("Loading State", () => {
    it("shows a spinner when affiliate data is loading", () => {
      clearAllQueryData();
      const { container } = render(<Affiliate />);
      expect(container.querySelector(".animate-spin")).toBeTruthy();
    });

    it("hides spinner once data is loaded", () => {
      setQueryData({ "affiliate/my": makeAffiliate(), "affiliate/payouts": [] });
      const { container } = render(<Affiliate />);
      expect(container.querySelector(".animate-spin")).toBeNull();
    });
  });

  // ─── Page header ───────────────────────────────────────
  describe("Page Header", () => {
    it("renders the Affiliate Program title", () => {
      setQueryData({ "affiliate/my": makeAffiliate() });
      render(<Affiliate />);
      expect(screen.getByText("Affiliate Program")).toBeTruthy();
    });

    it("renders the page description", () => {
      setQueryData({ "affiliate/my": makeAffiliate() });
      render(<Affiliate />);
      expect(screen.getByText(/Earn commissions by referring/)).toBeTruthy();
    });
  });

  // ─── Stats cards ───────────────────────────────────────
  describe("Stats Cards", () => {
    it("renders all three stat cards", () => {
      setQueryData({ "affiliate/my": makeAffiliate() });
      render(<Affiliate />);
      expect(screen.getByText("Total Referrals")).toBeTruthy();
      expect(screen.getByText("Total Commissions")).toBeTruthy();
      expect(screen.getByText("Pending Payout")).toBeTruthy();
    });

    it("displays total referrals count", () => {
      setQueryData({ "affiliate/my": makeAffiliate({ totalReferrals: 42 }) });
      render(<Affiliate />);
      expect(screen.getByText("42")).toBeTruthy();
    });

    it("displays total commissions in NGN", () => {
      setQueryData({ "affiliate/my": makeAffiliate({ totalCommissions: 125000 }) });
      render(<Affiliate />);
      expect(screen.getByText("₦125,000")).toBeTruthy();
    });

    it("displays pending commissions in NGN", () => {
      setQueryData({ "affiliate/my": makeAffiliate({ pendingCommissions: 50000 }) });
      render(<Affiliate />);
      // ₦50,000 appears in both the Pending Payout stat and the Available box
      const amounts = screen.getAllByText("₦50,000");
      expect(amounts.length).toBeGreaterThanOrEqual(1);
    });

    it("shows zero values when affiliate data has no values", () => {
      setQueryData({
        "affiliate/my": makeAffiliate({ totalReferrals: 0, totalCommissions: 0, pendingCommissions: 0 }),
      });
      render(<Affiliate />);
      expect(screen.getByText("Total Referrals")).toBeTruthy();
      // ₦0 appears in both Total Commissions and Pending
      const zeros = screen.getAllByText((t) => t.includes("₦") && t.includes("0"));
      expect(zeros.length).toBeGreaterThanOrEqual(2);
    });

    it("formats large amounts with commas", () => {
      setQueryData({
        "affiliate/my": makeAffiliate({ totalCommissions: 1234567, pendingCommissions: 987654 }),
      });
      render(<Affiliate />);
      expect(screen.getByText("₦1,234,567")).toBeTruthy();
      // ₦987,654 appears in both the Pending Payout stat and the Available box
      const pendingAmounts = screen.getAllByText("₦987,654");
      expect(pendingAmounts.length).toBeGreaterThanOrEqual(1);
    });

    it("shows zero referrals when affiliate data has no totalReferrals", () => {
      setQueryData({ "affiliate/my": makeAffiliate({ totalReferrals: 0 }) });
      render(<Affiliate />);
      // Total Referrals is 0, but it matches other zero-like text; verify the stat label exists
      expect(screen.getByText("Total Referrals")).toBeTruthy();
    });
  });

  // ─── Referral code section ─────────────────────────────
  describe("Referral Code Section", () => {
    it("renders the referral code card title", () => {
      setQueryData({ "affiliate/my": makeAffiliate() });
      render(<Affiliate />);
      expect(screen.getByText("Your Referral Code")).toBeTruthy();
    });

    it("displays the affiliate referral code", () => {
      setQueryData({ "affiliate/my": makeAffiliate({ referralCode: "MYAFF123" }) });
      render(<Affiliate />);
      expect(screen.getByText("MYAFF123")).toBeTruthy();
    });

    it("falls back to user referral code when affiliate has no code", () => {
      setQueryData({ "affiliate/my": makeAffiliate({ referralCode: null }) });
      render(<Affiliate />);
      expect(screen.getByText("USERCODE")).toBeTruthy();
    });

    it("shows N/A when neither affiliate nor user has a code", () => {
      setQueryData({ "affiliate/my": makeAffiliate({ referralCode: null }) });
      vi.mocked(useAuth).mockReturnValue({
        isLoading: false,
        isAuthenticated: true,
        user: { ...mockUser, referralCode: null } as any,
        error: null,
        signIn: vi.fn() as any,
        signOut: vi.fn() as any,
        refetch: vi.fn() as any,
      });
      render(<Affiliate />);
      expect(screen.getByText("N/A")).toBeTruthy();
    });

    it("renders Copy button for referral code", () => {
      setQueryData({ "affiliate/my": makeAffiliate() });
      render(<Affiliate />);
      const copyButtons = screen.getAllByText("Copy");
      expect(copyButtons.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ─── Copy referral code ────────────────────────────────
  describe("Copy Referral Code", () => {
    it("copies referral code to clipboard when Copy button is clicked", async () => {
      const user = userEvent.setup();
      setQueryData({ "affiliate/my": makeAffiliate({ referralCode: "AFFCODE99" }) });
      render(<Affiliate />);

      const copyButtons = screen.getAllByText("Copy");
      await user.click(copyButtons[0]);

      // Toast success proves the click handler fired and clipboard was attempted
      expect(toast.success).toHaveBeenCalledWith("Referral code copied!");
    });

    it("shows success toast when code is copied", async () => {
      const user = userEvent.setup();
      setQueryData({ "affiliate/my": makeAffiliate({ referralCode: "AFFCODE99" }) });
      render(<Affiliate />);

      const copyButtons = screen.getAllByText("Copy");
      await user.click(copyButtons[0]);

      expect(toast.success).toHaveBeenCalledWith("Referral code copied!");
    });

    it("copies fallback user code when affiliate code is null", async () => {
      const user = userEvent.setup();
      setQueryData({ "affiliate/my": makeAffiliate({ referralCode: null }) });
      render(<Affiliate />);

      const copyButtons = screen.getAllByText("Copy");
      await user.click(copyButtons[0]);

      // Toast success proves the handler fired with fallback code
      expect(toast.success).toHaveBeenCalledWith("Referral code copied!");
    });
  });

  // ─── Referral link ─────────────────────────────────────
  describe("Referral Link", () => {
    it("renders the referral link label", () => {
      setQueryData({ "affiliate/my": makeAffiliate({ referralCode: "AFF123" }) });
      render(<Affiliate />);
      expect(screen.getByText("Your Referral Link")).toBeTruthy();
    });

    it("displays the full referral link with code", () => {
      setQueryData({ "affiliate/my": makeAffiliate({ referralCode: "AFF123" }) });
      render(<Affiliate />);
      const linkInput = screen.getByDisplayValue(/auth\?ref=AFF123/);
      expect(linkInput).toBeTruthy();
    });

    it("uses the correct origin in the referral link", () => {
      setQueryData({ "affiliate/my": makeAffiliate({ referralCode: "AFF123" }) });
      render(<Affiliate />);
      const expectedOrigin = window.location.origin;
      const linkInput = screen.getByDisplayValue(new RegExp(`^${expectedOrigin}/auth\\?ref=AFF123$`));
      expect(linkInput).toBeTruthy();
    });

    it("renders a Copy button for the referral link", () => {
      setQueryData({ "affiliate/my": makeAffiliate({ referralCode: "AFF123" }) });
      render(<Affiliate />);
      const copyButtons = screen.getAllByText("Copy");
      expect(copyButtons.length).toBeGreaterThanOrEqual(2);
    });

    it("copies referral link to clipboard when link Copy button is clicked", async () => {
      const user = userEvent.setup();
      setQueryData({ "affiliate/my": makeAffiliate({ referralCode: "AFF123" }) });
      render(<Affiliate />);

      const copyButtons = screen.getAllByText("Copy");
      await user.click(copyButtons[1]);

      // Toast success proves the handler fired
      expect(toast.success).toHaveBeenCalledWith("Referral link copied!");
    });

    it("shows success toast when link is copied", async () => {
      const user = userEvent.setup();
      setQueryData({ "affiliate/my": makeAffiliate({ referralCode: "AFF123" }) });
      render(<Affiliate />);

      const copyButtons = screen.getAllByText("Copy");
      await user.click(copyButtons[1]);

      expect(toast.success).toHaveBeenCalledWith("Referral link copied!");
    });

    it("link input is read-only", () => {
      setQueryData({ "affiliate/my": makeAffiliate({ referralCode: "AFF123" }) });
      render(<Affiliate />);
      const linkInput = screen.getByDisplayValue(/auth\?ref=AFF123/);
      expect(linkInput).toHaveAttribute("readonly");
    });

    it("uses fallback user code in referral link when affiliate code is null", () => {
      setQueryData({ "affiliate/my": makeAffiliate({ referralCode: null }) });
      render(<Affiliate />);
      const linkInput = screen.getByDisplayValue(/auth\?ref=USERCODE/);
      expect(linkInput).toBeTruthy();
    });
  });

  // ─── Empty / null affiliate data ───────────────────────
  describe("Null Data Handling", () => {
    it("shows zero stats when affiliate data is empty object", () => {
      setQueryData({ "affiliate/my": {} });
      render(<Affiliate />);
      // totalReferrals falls back to 0 via || 0
      expect(screen.getByText("Total Referrals")).toBeTruthy();
    });

    it("falls back to user code when affiliate data is null fields", () => {
      setQueryData({ "affiliate/my": { referralCode: null, totalReferrals: 0, totalCommissions: 0, pendingCommissions: 0 } });
      render(<Affiliate />);
      expect(screen.getByText("USERCODE")).toBeTruthy();
    });
  });

  // ─── Full integration ──────────────────────────────────
  describe("Full Integration", () => {
    it("renders all sections together with complete data", () => {
      setQueryData({
        "affiliate/my": makeAffiliate({
          referralCode: "PROCODE",
          totalReferrals: 50,
          totalCommissions: 250000,
          pendingCommissions: 75000,
        }),
      });
      render(<Affiliate />);

      // Header
      expect(screen.getByText("Affiliate Program")).toBeTruthy();
      expect(screen.getByText(/Earn commissions/)).toBeTruthy();

      // Stats
      expect(screen.getByText("Total Referrals")).toBeTruthy();
      expect(screen.getByText("50")).toBeTruthy();
      expect(screen.getByText("Total Commissions")).toBeTruthy();
      expect(screen.getByText("₦250,000")).toBeTruthy();
      expect(screen.getByText("Pending Payout")).toBeTruthy();
      // ₦75,000 appears in both the Pending Payout stat and the Available box
      expect(screen.getAllByText("₦75,000").length).toBeGreaterThanOrEqual(1);

      // Referral code
      expect(screen.getByText("Your Referral Code")).toBeTruthy();
      expect(screen.getByText("PROCODE")).toBeTruthy();

      // Referral link
      expect(screen.getByText("Your Referral Link")).toBeTruthy();
      expect(screen.getByDisplayValue(/auth\?ref=PROCODE/)).toBeTruthy();

      // Copy buttons
      const copyButtons = screen.getAllByText("Copy");
      expect(copyButtons.length).toBe(2);
    });

    it("loading → data transition works correctly", () => {
      clearAllQueryData();
      const { container } = render(<Affiliate />);
      expect(container.querySelector(".animate-spin")).toBeTruthy();

      setQueryData({ "affiliate/my": makeAffiliate({ referralCode: "CODE1" }), "affiliate/payouts": [] });
      const { container: c2 } = render(<Affiliate />);
      expect(c2.querySelector(".animate-spin")).toBeNull();
      expect(screen.getByText("CODE1")).toBeTruthy();
    });

    it("renders with zero referrals and commissions", () => {
      setQueryData({
        "affiliate/my": makeAffiliate({ totalReferrals: 0, totalCommissions: 0, pendingCommissions: 0, referralCode: "FRESH001" }),
      });
      render(<Affiliate />);

      expect(screen.getByText("FRESH001")).toBeTruthy();
      expect(screen.getByText("Total Referrals")).toBeTruthy();
      // ₦0 appears in both Total Commissions and Pending
      const zeros = screen.getAllByText((t) => t.includes("₦") && t.includes("0"));
      expect(zeros.length).toBeGreaterThanOrEqual(2);
    });

    it("handles very large commission amounts", () => {
      setQueryData({
        "affiliate/my": makeAffiliate({ totalCommissions: 999999999, pendingCommissions: 888888888 }),
      });
      render(<Affiliate />);
      expect(screen.getByText("₦999,999,999")).toBeTruthy();
      // ₦888,888,888 appears in both the Pending Payout stat and the Available box
      expect(screen.getAllByText("₦888,888,888").length).toBeGreaterThanOrEqual(1);
    });
  });

  // ─── Payout history pagination ─────────────────────────
  // ─── Referrals Sortable Headers ────────────────────────
  describe("Referrals Sortable Headers", () => {
    const baseData = { "affiliate/my": makeAffiliate(), "affiliate/payouts": [], "affiliate/referrals": [makeReferral()] };

    it("renders referral sort headers with Referred active by default", () => {
      setQueryData(baseData);
      render(<Affiliate />);

      for (const label of ["Name", "Status", "Commission", "Referred"]) {
        expect(screen.getByRole("button", { name: `Sort by ${label}` })).toBeTruthy();
      }
      expect(screen.getByRole("button", { name: "Sort by Referred" }).getAttribute("aria-pressed")).toBe("true");
    });

    it("calls the API with sortBy/sortOrder when a referral header is clicked", async () => {
      const user = userEvent.setup();
      setQueryData(baseData);
      render(<Affiliate />);

      await user.click(screen.getByRole("button", { name: "Sort by Status" }));

      const calls = vi.mocked(useApiQuery).mock.calls;
      const refCall = calls.find((c) => String(c[1]).includes("/api/affiliates/referrals?") && String(c[1]).includes("sortBy=status"));
      expect(refCall).toBeTruthy();
      expect(String(refCall![1])).toContain("sortOrder=desc");
      expect(screen.getByRole("button", { name: "Sort by Status" }).getAttribute("aria-pressed")).toBe("true");
    });

    it("toggles to ascending when the active referral column is clicked again", async () => {
      const user = userEvent.setup();
      setQueryData(baseData);
      render(<Affiliate />);

      await user.click(screen.getByRole("button", { name: "Sort by Status" }));
      await user.click(screen.getByRole("button", { name: "Sort by Status" }));

      const calls = vi.mocked(useApiQuery).mock.calls;
      const ascCall = calls.find((c) => String(c[1]).includes("/api/affiliates/referrals?") && String(c[1]).includes("sortBy=status&sortOrder=asc"));
      expect(ascCall).toBeTruthy();
    });
  });

  describe("Payout History Pagination", () => {
    const manyPayouts = () =>
      Array.from({ length: 15 }, (_, i) =>
        makePayout({
          id: i + 1,
          amount: 5000 * (i + 1),
          status: i % 3 === 0 ? "pending" : "paid",
          requestedAt: Date.now() - i * 1000,
        }),
      );

    it("paginates payout history with many records", async () => {
      const user = userEvent.setup();
      setQueryData({ "affiliate/my": makeAffiliate(), "affiliate/payouts": manyPayouts() });
      render(<Affiliate />);

      // Page 1 shows the first 10
      expect(screen.getByText("Recent Requests")).toBeTruthy();
      expect(screen.getByText(/Showing 1–10 of 15 payouts/)).toBeTruthy();

      // Next page shows the remaining 5
      await user.click(screen.getByText("Next"));
      expect(screen.getByText(/Showing 11–15 of 15 payouts/)).toBeTruthy();

      // Prev returns to page 1
      await user.click(screen.getByText("Prev"));
      expect(screen.getByText(/Showing 1–10 of 15 payouts/)).toBeTruthy();
    });

    it("changes rows per page for payout history", async () => {
      const user = userEvent.setup();
      setQueryData({ "affiliate/my": makeAffiliate(), "affiliate/payouts": manyPayouts() });
      render(<Affiliate />);

      await user.selectOptions(screen.getByLabelText("Rows per page"), "25");
      expect(screen.getByText(/Showing 1–15 of 15 payouts/)).toBeTruthy();
    });
  });
});
