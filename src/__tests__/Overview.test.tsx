// @vitest-environment jsdom
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";

// ─── Mock: sonner ──────────────────────────────────────────
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

// ─── Mock: useAuth ─────────────────────────────────────────
const defaultUser: any = {
  id: 1,
  name: "John Doe",
  email: "john@example.com",
  phone: "+2348012345678",
  country: "Nigeria",
  tradingExperience: "intermediate",
  role: "user",
  kycStatus: "unverified",
};

vi.mock("@/hooks/use-auth", () => ({
  useAuth: vi.fn(() => ({
    isLoading: false,
    isAuthenticated: true,
    user: defaultUser,
    error: null,
    signIn: vi.fn(),
    signOut: vi.fn(),
    refetch: vi.fn(),
  })),
}));

// ─── Mock: react-router ────────────────────────────────────
const mockNavigate = vi.fn();
vi.mock("react-router", () => ({
  useNavigate: () => mockNavigate,
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
  useApiMutation: vi.fn(() => ({
    mutateAsync: vi.fn(),
    mutate: vi.fn(),
    isPending: false,
  })),
}));

// ─── Mock: localStorage ────────────────────────────────────
const localStorageStore: Record<string, string> = {};
vi.stubGlobal("localStorage", {
  getItem: (key: string) => localStorageStore[key] || null,
  setItem: (key: string, value: string) => { localStorageStore[key] = value; },
  removeItem: (key: string) => { delete localStorageStore[key]; },
});

// ─── Mock: framer-motion ──────────────────────────────────
vi.mock("framer-motion", () => ({
  motion: {
    div: ({ children, ...props }: any) => {
      const { ...validProps } = props;
      return <div {...validProps}>{children}</div>;
    },
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

// ─── Import component + mocked hook AFTER vi.mock ──────────
import Overview from "@/pages/dashboard/Overview";
import { useAuth } from "@/hooks/use-auth";

// ─── Helpers ──────────────────────────────────────────────
function clearAllQueryData() {
  Object.keys(queryDataMap).forEach((k) => delete queryDataMap[k]);
}

function setQueryData(updates: Record<string, any>) {
  Object.keys(queryDataMap).forEach((k) => delete queryDataMap[k]);
  Object.assign(queryDataMap, {
    "metrics/dashboard": null,
    "challenges/my": null,
    "wallet/my": null,
    "notifications/my": { notifications: [] },
    "payouts/stats": { totalPending: 0 },
    ...updates,
  });
}

function mockAuthUser(userOverrides: any = {}) {
  vi.mocked(useAuth).mockReturnValue({
    isLoading: false,
    isAuthenticated: true,
    user: { ...defaultUser, ...userOverrides },
    error: null,
    signIn: vi.fn() as any,
    signOut: vi.fn() as any,
    refetch: vi.fn() as any,
  });
}

// ─── Tests ────────────────────────────────────────────────
describe("Overview Page", () => {
  beforeEach(() => {
    clearAllQueryData();
    vi.clearAllMocks();
    Object.keys(localStorageStore).forEach((k) => delete localStorageStore[k]);
    mockAuthUser();
  });

  // ─── Loading state ─────────────────────────────────────
  describe("Loading State", () => {
    it("shows skeleton loader when data is loading", () => {
      clearAllQueryData();
      const { container } = render(<Overview />);
      expect(container.querySelector(".animate-pulse")).toBeTruthy();
    });

    it("hides skeleton loader once loaded", () => {
      setQueryData({
        "metrics/dashboard": { activeChallenges: 0, fundedAccounts: 0, totalChallenges: 0 },
        "challenges/my": [],
        "wallet/my": { balance: 0, currency: "NGN" },
      });
      const { container } = render(<Overview />);
      expect(container.querySelector(".animate-pulse")).toBeNull();
    });
  });

  // ─── Page header ───────────────────────────────────────
  describe("Page Header", () => {
    it("renders greeting title", () => {
      setQueryData({});
      render(<Overview />);
      expect(screen.getByText(/^Good (morning|afternoon|evening)/)).toBeTruthy();
    });

    it("renders welcome description", () => {
      setQueryData({});
      render(<Overview />);
      expect(screen.getByText(/Track your funded journey/)).toBeTruthy();
    });

    it("renders New Challenge button", () => {
      setQueryData({});
      render(<Overview />);
      expect(screen.getAllByText("New Challenge").length).toBeGreaterThanOrEqual(1);
    });

    it("navigates to challenges on New Challenge click", async () => {
      const user = userEvent.setup();
      setQueryData({});
      render(<Overview />);
      const btns = screen.getAllByText("New Challenge");
      await user.click(btns[0]);
      expect(mockNavigate).toHaveBeenCalledWith("/dashboard/challenges");
    });
  });

  // ─── Stats cards ───────────────────────────────────────
  describe("Stats Cards", () => {
    it("renders the stat cards", () => {
      setQueryData({});
      render(<Overview />);
      expect(screen.getByText("Active Challenges")).toBeTruthy();
      expect(screen.getByText("Funded Accounts")).toBeTruthy();
      expect(screen.getByText("Wallet Balance")).toBeTruthy();
    });

    it("displays metric values from data", () => {
      setQueryData({
        "metrics/dashboard": { activeChallenges: 3, fundedAccounts: 1, totalChallenges: 8 },
        "wallet/my": { balance: 150000, currency: "NGN" },
      });
      render(<Overview />);
      expect(screen.getByText("3")).toBeTruthy();
      expect(screen.getByText("1")).toBeTruthy();
      expect(screen.getAllByText(/₦150,000/).length).toBeGreaterThanOrEqual(1);
    });

    it("shows zero when no data", () => {
      setQueryData({
        "metrics/dashboard": { activeChallenges: 0, fundedAccounts: 0, totalChallenges: 0 },
        "wallet/my": { balance: 0, currency: "NGN" },
      });
      render(<Overview />);
      expect(screen.getByText("Active Challenges")).toBeTruthy();
    });

    it("navigates to correct path on stat card click", async () => {
      const user = userEvent.setup();
      setQueryData({});
      render(<Overview />);
      const activeCard = screen.getByText("Active Challenges").closest("button");
      expect(activeCard).toBeTruthy();
      await user.click(activeCard!);
      expect(mockNavigate).toHaveBeenCalledWith("/dashboard/challenges");
    });
  });

  // ─── Onboarding banner ─────────────────────────────────
  describe("Onboarding Banner", () => {
    it("shows banner when user has incomplete profile", () => {
      mockAuthUser({ name: null, phone: null });
      setQueryData({});
      render(<Overview />);
      expect(screen.getByText("Finish setting up your profile")).toBeTruthy();
    });

    it("hides banner when user has complete profile", () => {
      setQueryData({});
      render(<Overview />);
      expect(screen.queryByText("Finish setting up your profile")).toBeNull();
    });

    it("hides banner when dismissed via localStorage", () => {
      localStorageStore["_afc_onboarding_banner_dismissed"] = "true";
      mockAuthUser({ name: null });
      setQueryData({});
      render(<Overview />);
      expect(screen.queryByText("Finish setting up your profile")).toBeNull();
    });

    it("navigates to onboarding on Complete Setup click", async () => {
      const user = userEvent.setup();
      mockAuthUser({ name: null });
      setQueryData({});
      render(<Overview />);
      await user.click(screen.getByText("Complete Setup"));
      expect(mockNavigate).toHaveBeenCalledWith("/dashboard/onboarding");
    });

    it("dismisses banner and saves to localStorage on Dismiss click", async () => {
      const user = userEvent.setup();
      mockAuthUser({ name: null });
      setQueryData({});
      render(<Overview />);
      await user.click(screen.getByText("Dismiss"));
      expect(localStorageStore["_afc_onboarding_banner_dismissed"]).toBe("true");
    });
  });

  // ─── Active challenges ─────────────────────────────────
  describe("Active Challenges", () => {
    it("shows challenge list when challenges exist", () => {
      setQueryData({
        "challenges/my": {
          challenges: [
            { id: 1, accountSize: 50000, status: "active" },
            { id: 2, accountSize: 100000, status: "phase_1_passed" },
          ],
          total: 2,
          page: 1,
          pageSize: 10,
          totalPages: 1,
        },
      });
      render(<Overview />);
      expect(screen.getByText("Your Challenges")).toBeTruthy();
      expect(screen.getByText("Challenge #1")).toBeTruthy();
      expect(screen.getByText("Challenge #2")).toBeTruthy();
    });

    it("formats account size and status", () => {
      setQueryData({
        "challenges/my": {
          challenges: [{ id: 1, accountSize: 50000, status: "active" }],
          total: 1,
          page: 1,
          pageSize: 10,
          totalPages: 1,
        },
      });
      render(<Overview />);
      expect(screen.getByText((t) => t.includes("50,000"))).toBeTruthy();
    });

    it("limits to 3 challenges in the list", () => {
      const challenges = Array.from({ length: 8 }, (_, i) => ({
        id: i + 1,
        accountSize: 10000 * (i + 1),
        status: "active",
      }));
      setQueryData({ "challenges/my": { challenges, total: challenges.length, page: 1, pageSize: 10, totalPages: 1 } });
      render(<Overview />);
      expect(screen.getByText("Challenge #3")).toBeTruthy();
      expect(screen.queryByText("Challenge #4")).toBeNull();
    });

    it("navigates to challenges on challenge click", async () => {
      const user = userEvent.setup();
      setQueryData({
        "challenges/my": {
          challenges: [{ id: 1, accountSize: 50000, status: "active" }],
          total: 1,
          page: 1,
          pageSize: 10,
          totalPages: 1,
        },
      });
      render(<Overview />);
      await user.click(screen.getByText("Challenge #1"));
      expect(mockNavigate).toHaveBeenCalledWith("/dashboard/challenges");
    });

    it("shows empty state when no challenges", () => {
      setQueryData({ "challenges/my": [] });
      render(<Overview />);
      expect(screen.getByText(/Start your funded journey/)).toBeTruthy();
      expect(screen.getByText("Browse Challenges")).toBeTruthy();
    });

    it("navigates to challenges on Browse Challenges click", async () => {
      const user = userEvent.setup();
      setQueryData({ "challenges/my": [] });
      render(<Overview />);
      await user.click(screen.getByText("Browse Challenges"));
      expect(mockNavigate).toHaveBeenCalledWith("/dashboard/challenges");
    });
  });

  // ─── Full integration ──────────────────────────────────
  describe("Full Integration", () => {
    it("renders complete page with all sections", () => {
      setQueryData({
        "metrics/dashboard": { activeChallenges: 2, fundedAccounts: 1, totalChallenges: 5 },
        "challenges/my": {
          challenges: [
            { id: 1, accountSize: 50000, status: "active" },
            { id: 2, accountSize: 100000, status: "funded" },
          ],
          total: 2,
          page: 1,
          pageSize: 10,
          totalPages: 1,
        },
        "wallet/my": { balance: 250000, currency: "NGN" },
      });
      render(<Overview />);
      expect(screen.getByText(/^Good (morning|afternoon|evening)/)).toBeTruthy();
      expect(screen.getByText("Active Challenges")).toBeTruthy();
      expect(screen.getByText("Your Challenges")).toBeTruthy();
      expect(screen.getByText("Challenge #1")).toBeTruthy();
    });

    it("handles null metrics gracefully", () => {
      setQueryData({
        "metrics/dashboard": null,
        "challenges/my": null,
        "wallet/my": null,
      });
      render(<Overview />);
      expect(screen.getByText(/^Good (morning|afternoon|evening)/)).toBeTruthy();
    });

    it("wallet falls back to NGN formatting when currency not set", () => {
      setQueryData({
        "metrics/dashboard": { activeChallenges: 0, fundedAccounts: 0, totalChallenges: 0 },
        "wallet/my": { balance: 0 },
      });
      render(<Overview />);
      expect(screen.getAllByText(/₦0/).length).toBeGreaterThanOrEqual(1);
    });
  });
});
