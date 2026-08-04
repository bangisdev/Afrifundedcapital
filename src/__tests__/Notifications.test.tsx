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

// ─── Mock: react-router ───────────────────────────────────
vi.mock("react-router", () => ({
  useNavigate: () => vi.fn(),
}));

// ─── Mock: useAuth ─────────────────────────────────────────
vi.mock("@/hooks/use-auth", () => ({
  useAuth: vi.fn(() => ({
    isLoading: false,
    isAuthenticated: true,
    user: { id: 1, name: "Test User", email: "test@example.com", role: "user" },
    error: null,
    signIn: vi.fn(),
    signOut: vi.fn(),
    refetch: vi.fn(),
  })),
}));

// ─── Mock: useApiQuery / useApiMutation ────────────────────
const queryDataMap: Record<string, any> = {};
const mockMarkAllRead = vi.fn(async () => ({ message: "ok" }));
const mockMarkRead = vi.fn(async () => ({ message: "ok" }));
const mockDeleteNotif = vi.fn(async () => ({ message: "deleted" }));

vi.mock("@/hooks/use-api", () => ({
  useApiQuery: vi.fn((key: string[], path: string, _opts?: any) => {
    // The page passes query-suffixed keys (["notifications", "my", "/api/notifications/my?..."]),
    // so look up by the stable prefix (first two segments).
    const dataKey = key.slice(0, 2).join("/");
    if (queryDataMap[dataKey] === undefined) {
      return { data: undefined, isLoading: true };
    }
    const base = queryDataMap[dataKey];
    // Simulate the server-driven notifications list: search + type filter + paginate + stats envelope.
    if (dataKey === "notifications/my" && Array.isArray(base)) {
      const query = path.includes("?") ? path.split("?")[1] : "";
      const params = new URLSearchParams(query);
      const search = (params.get("search") || "").toLowerCase();
      const type = params.get("type");
      const page = Number(params.get("page") || 1);
      const pageSize = Number(params.get("pageSize") || 10);

      let filtered = base;
      if (search) {
        filtered = filtered.filter((n: any) =>
          [n.title, n.message].some((v) => v && String(v).toLowerCase().includes(search)),
        );
      }
      if (type && type !== "all") filtered = filtered.filter((n: any) => n.type === type);

      const total = filtered.length;
      const totalPages = Math.max(1, Math.ceil(total / pageSize));
      return {
        data: {
          notifications: filtered.slice((page - 1) * pageSize, page * pageSize),
          total,
          page,
          pageSize,
          totalPages,
          stats: {
            total: base.length,
            unread: base.filter((n: any) => !n.read).length,
            byType: {},
          },
        },
        isLoading: false,
      };
    }
    return { data: base, isLoading: false };
  }),
  useApiMutation: vi.fn((method: string, path: string, _onSuccess?: any) => {
    if (path.includes("/read-all")) {
      return { mutateAsync: mockMarkAllRead, mutate: vi.fn(), isPending: false };
    }
    if (path.includes("/read")) {
      return { mutateAsync: mockMarkRead, mutate: vi.fn(), isPending: false };
    }
    if (method === "delete") {
      return { mutateAsync: mockDeleteNotif, mutate: vi.fn(), isPending: false };
    }
    return { mutateAsync: vi.fn(), mutate: vi.fn(), isPending: false };
  }),
}));

// ─── Import component after mocks ─────────────────────────
import Notifications from "@/pages/dashboard/Notifications";
import { toast } from "sonner";

// ─── Test data factories ──────────────────────────────────
function makeNotification(overrides: any = {}) {
  return {
    id: 1,
    type: "payment_received",
    title: "Payment Received",
    message: "Your payment of ₦50,000 was received",
    read: false,
    createdAt: Date.now() - 3600000, // 1 hour ago
    ...overrides,
  };
}

// ─── Helpers ──────────────────────────────────────────────
function clearAllQueryData() {
  Object.keys(queryDataMap).forEach((k) => delete queryDataMap[k]);
}

function setQueryData(updates: Record<string, any>) {
  Object.keys(queryDataMap).forEach((k) => delete queryDataMap[k]);
  Object.assign(queryDataMap, { "notifications/my": [], ...updates });
}

// ─── Tests ────────────────────────────────────────────────
describe("Notifications Page", () => {
  beforeEach(() => {
    clearAllQueryData();
    vi.clearAllMocks();
    mockMarkAllRead.mockResolvedValue({ message: "ok" });
  });

  // ─── Loading state ─────────────────────────────────────
  describe("Loading State", () => {
    it("shows a spinner when data is loading", () => {
      clearAllQueryData();
      const { container } = render(<Notifications />);
      expect(container.querySelector(".animate-spin")).toBeTruthy();
    });

    it("hides spinner once data is loaded", () => {
      setQueryData({});
      const { container } = render(<Notifications />);
      expect(container.querySelector(".animate-spin")).toBeNull();
    });
  });

  // ─── Page header ───────────────────────────────────────
  describe("Page Header", () => {
    it("renders the Notifications title", () => {
      setQueryData({});
      render(<Notifications />);
      expect(screen.getByText("Notifications")).toBeTruthy();
    });

    it("renders the page description", () => {
      setQueryData({});
      render(<Notifications />);
      expect(screen.getByText(/Stay updated/)).toBeTruthy();
    });
  });

  // ─── Empty state ───────────────────────────────────────
  describe("Empty State", () => {
    it("shows empty state when no notifications exist", () => {
      setQueryData({ "notifications/my": [] });
      render(<Notifications />);
      expect(screen.getByText("No notifications")).toBeTruthy();
    });
  });

  // ─── Notification list ─────────────────────────────────
  describe("Notification List", () => {
    it("renders a single notification", () => {
      setQueryData({
        "notifications/my": [makeNotification({ title: "Hello", message: "World" })],
      });
      render(<Notifications />);
      expect(screen.getByText("Hello")).toBeTruthy();
      expect(screen.getByText("World")).toBeTruthy();
    });

    it("renders multiple notifications", () => {
      setQueryData({
        "notifications/my": [
          makeNotification({ id: 1, title: "Payment", message: "Received" }),
          makeNotification({ id: 2, title: "KYC", message: "Approved", type: "kyc_approved" }),
        ],
      });
      render(<Notifications />);
      expect(screen.getByText("Payment")).toBeTruthy();
      expect(screen.getByText("KYC")).toBeTruthy();
    });

    it("shows unread indicator dot for unread notifications", () => {
      setQueryData({
        "notifications/my": [makeNotification({ read: false })],
      });
      render(<Notifications />);
      // Unread dot is a small colored circle
      const unreadDots = document.querySelectorAll("[class*='rounded-full'][class*='bg-foreground']");
      expect(unreadDots.length).toBeGreaterThanOrEqual(1);
    });

    it("does not show unread indicator for read notifications", () => {
      setQueryData({
        "notifications/my": [makeNotification({ read: true })],
      });
      render(<Notifications />);
      const unreadDots = document.querySelectorAll("[class*='rounded-full'][class*='bg-foreground']");
      expect(unreadDots.length).toBe(0);
    });

    it("applies bg-secondary/20 class for unread notifications", () => {
      setQueryData({
        "notifications/my": [makeNotification({ read: false })],
      });
      const { container } = render(<Notifications />);
      const cards = container.querySelectorAll(".card-subtle");
      const hasUnreadBg = Array.from(cards).some((c) =>
        c.className.includes("bg-secondary/20")
      );
      expect(hasUnreadBg).toBeTruthy();
    });

    it("does not apply bg-secondary/20 for read notifications", () => {
      setQueryData({
        "notifications/my": [makeNotification({ read: true })],
      });
      const { container } = render(<Notifications />);
      const cards = container.querySelectorAll(".card-subtle");
      const hasUnreadBg = Array.from(cards).some((c) =>
        c.className.includes("bg-secondary/20")
      );
      expect(hasUnreadBg).toBeFalsy();
    });
  });

  // ─── Sortable headers ─────────────────────────────────
  describe("Sortable Headers", () => {
    it("renders sortable column headers with the default column active", () => {
      setQueryData({
        "notifications/my": [makeNotification({ title: "Payment Received" })],
      });
      render(<Notifications />);

      for (const label of ["Title", "Type", "Read", "Date"]) {
        expect(screen.getByRole("button", { name: `Sort by ${label}` })).toBeTruthy();
      }
      // Default sort is createdAt desc → Date is active
      expect(screen.getByRole("button", { name: "Sort by Date" }).getAttribute("aria-pressed")).toBe("true");
    });

    it("calls the API with sortBy/sortOrder when a header is clicked", async () => {
      const user = userEvent.setup();
      setQueryData({
        "notifications/my": [makeNotification({ title: "Payment Received" })],
      });
      render(<Notifications />);

      await user.click(screen.getByRole("button", { name: "Sort by Type" }));

      const calls = vi.mocked(useApiQuery).mock.calls;
      const myCall = calls.find((c) => String(c[1]).includes("/api/notifications/my?") && String(c[1]).includes("sortBy=type"));
      expect(myCall).toBeTruthy();
      expect(String(myCall![1])).toContain("sortOrder=desc");
      expect(screen.getByRole("button", { name: "Sort by Type" }).getAttribute("aria-pressed")).toBe("true");
    });

    it("toggles to ascending when the active column is clicked again", async () => {
      const user = userEvent.setup();
      setQueryData({
        "notifications/my": [makeNotification({ title: "Payment Received" })],
      });
      render(<Notifications />);

      await user.click(screen.getByRole("button", { name: "Sort by Type" }));
      await user.click(screen.getByRole("button", { name: "Sort by Type" }));

      const calls = vi.mocked(useApiQuery).mock.calls;
      const ascCall = calls.find((c) => String(c[1]).includes("/api/notifications/my?") && String(c[1]).includes("sortBy=type&sortOrder=asc"));
      expect(ascCall).toBeTruthy();
    });
  });

  // ─── Relative time ─────────────────────────────────────
  describe("Relative Time", () => {
    it("shows 'Just now' for very recent notifications", () => {
      setQueryData({
        "notifications/my": [makeNotification({ createdAt: Date.now() - 30000 })],
      });
      render(<Notifications />);
      expect(screen.getByText("Just now")).toBeTruthy();
    });

    it("shows minutes ago for recent notifications", () => {
      setQueryData({
        "notifications/my": [makeNotification({ createdAt: Date.now() - 300000 })],
      });
      render(<Notifications />);
      expect(screen.getByText("5m ago")).toBeTruthy();
    });

    it("shows hours ago for older notifications", () => {
      setQueryData({
        "notifications/my": [makeNotification({ createdAt: Date.now() - 7200000 })],
      });
      render(<Notifications />);
      expect(screen.getByText("2h ago")).toBeTruthy();
    });

    it("shows days ago for old notifications", () => {
      setQueryData({
        "notifications/my": [makeNotification({ createdAt: Date.now() - 172800000 })],
      });
      render(<Notifications />);
      expect(screen.getByText("2d ago")).toBeTruthy();
    });

    it("shows formatted date for very old notifications", () => {
      const date = new Date("2025-01-15");
      setQueryData({
        "notifications/my": [makeNotification({ createdAt: date.getTime() })],
      });
      render(<Notifications />);
      expect(screen.getByText(/Jan 15/)).toBeTruthy();
    });
  });

  // ─── Search ────────────────────────────────────────────
  describe("Search", () => {
    it("renders search input", () => {
      setQueryData({});
      render(<Notifications />);
      expect(screen.getByPlaceholderText("Search notifications...")).toBeTruthy();
    });

    it("filters by title", async () => {
      const user = userEvent.setup();
      setQueryData({
        "notifications/my": [
          makeNotification({ id: 1, title: "Payment Received", message: "Money in" }),
          makeNotification({ id: 2, title: "KYC Approved", message: "Verified", type: "kyc_approved" }),
        ],
      });
      render(<Notifications />);
      await user.type(screen.getByPlaceholderText("Search notifications..."), "payment");
      await waitFor(() => {
        expect(screen.getByText("Payment Received")).toBeTruthy();
        expect(screen.queryByText("KYC Approved")).toBeNull();
      });
    });

    it("filters by message", async () => {
      const user = userEvent.setup();
      setQueryData({
        "notifications/my": [
          makeNotification({ id: 1, title: "Alert", message: "Your challenge was funded" }),
          makeNotification({ id: 2, title: "Notice", message: "KYC verified" }),
        ],
      });
      render(<Notifications />);
      await user.type(screen.getByPlaceholderText("Search notifications..."), "challenge");
      await waitFor(() => {
        expect(screen.getByText("Your challenge was funded")).toBeTruthy();
        expect(screen.queryByText("KYC verified")).toBeNull();
      });
    });

    it("search is case-insensitive", async () => {
      const user = userEvent.setup();
      setQueryData({
        "notifications/my": [
          makeNotification({ id: 1, title: "Payment Received", message: "Money" }),
          makeNotification({ id: 2, title: "KYC Approved", message: "Verified" }),
        ],
      });
      render(<Notifications />);
      await user.type(screen.getByPlaceholderText("Search notifications..."), "PAYMENT");
      await waitFor(() => {
        expect(screen.getByText("Payment Received")).toBeTruthy();
        expect(screen.queryByText("KYC Approved")).toBeNull();
      });
    });

    it("shows all when search is cleared", async () => {
      const user = userEvent.setup();
      setQueryData({
        "notifications/my": [
          makeNotification({ id: 1, title: "Payment", message: "Money" }),
          makeNotification({ id: 2, title: "KYC", message: "Verified" }),
        ],
      });
      render(<Notifications />);
      const searchInput = screen.getByPlaceholderText("Search notifications...");
      await user.type(searchInput, "payment");
      await waitFor(() => {
        expect(screen.queryByText("KYC")).toBeNull();
      });

      await user.clear(searchInput);
      await waitFor(() => {
        expect(screen.getByText("KYC")).toBeTruthy();
      });
    });
  });

  // ─── Mark all read ─────────────────────────────────────
  describe("Mark All Read", () => {
    it("shows Mark all read button when there are unread notifications", () => {
      setQueryData({
        "notifications/my": [
          makeNotification({ id: 1, read: false }),
          makeNotification({ id: 2, read: true }),
        ],
      });
      render(<Notifications />);
      expect(screen.getByText("Mark all read")).toBeTruthy();
    });

    it("hides Mark all read button when all are read", () => {
      setQueryData({
        "notifications/my": [
          makeNotification({ id: 1, read: true }),
          makeNotification({ id: 2, read: true }),
        ],
      });
      render(<Notifications />);
      expect(screen.queryByText("Mark all read")).toBeNull();
    });

    it("hides Mark all read button when no notifications", () => {
      setQueryData({ "notifications/my": [] });
      render(<Notifications />);
      expect(screen.queryByText("Mark all read")).toBeNull();
    });

    it("calls markAllRead mutation when clicked", async () => {
      const user = userEvent.setup();
      setQueryData({
        "notifications/my": [makeNotification({ read: false })],
      });
      render(<Notifications />);
      await user.click(screen.getByText("Mark all read"));
      await waitFor(() => {
        expect(mockMarkAllRead).toHaveBeenCalled();
      });
    });

    it("shows success toast after marking all read", async () => {
      const user = userEvent.setup();
      setQueryData({
        "notifications/my": [makeNotification({ read: false })],
      });
      render(<Notifications />);
      await user.click(screen.getByText("Mark all read"));
      await waitFor(() => {
        expect(toast.success).toHaveBeenCalledWith("All marked as read");
      });
    });
  });

  // ─── Notification types ────────────────────────────────
  describe("Notification Types", () => {
    it("renders payment_received notification", () => {
      setQueryData({
        "notifications/my": [makeNotification({ type: "payment_received" })],
      });
      render(<Notifications />);
      expect(screen.getByText("Payment Received")).toBeTruthy();
    });

    it("renders kyc_approved notification", () => {
      setQueryData({
        "notifications/my": [makeNotification({ type: "kyc_approved", title: "KYC Verified" })],
      });
      render(<Notifications />);
      expect(screen.getByText("KYC Verified")).toBeTruthy();
    });

    it("renders challenge_violated notification", () => {
      setQueryData({
        "notifications/my": [makeNotification({ type: "challenge_violated", title: "Violation" })],
      });
      render(<Notifications />);
      expect(screen.getByText("Violation")).toBeTruthy();
    });

    it("renders certificate_issued notification", () => {
      setQueryData({
        "notifications/my": [makeNotification({ type: "certificate_issued", title: "Certificate" })],
      });
      render(<Notifications />);
      expect(screen.getByText("Certificate")).toBeTruthy();
    });

    it("renders system notification with fallback icon", () => {
      setQueryData({
        "notifications/my": [makeNotification({ type: "system", title: "System Update" })],
      });
      render(<Notifications />);
      expect(screen.getByText("System Update")).toBeTruthy();
    });

    it("renders unknown type with fallback icon", () => {
      setQueryData({
        "notifications/my": [makeNotification({ type: "unknown_type", title: "Mystery" })],
      });
      render(<Notifications />);
      expect(screen.getByText("Mystery")).toBeTruthy();
    });
  });

  // ─── Full integration ──────────────────────────────────
  describe("Full Integration", () => {
    it("renders all sections with complete data", () => {
      setQueryData({
        "notifications/my": [
          makeNotification({ id: 1, title: "Payment", message: "Received", read: false, type: "payment_received" }),
          makeNotification({ id: 2, title: "KYC", message: "Approved", read: true, type: "kyc_approved" }),
        ],
      });
      render(<Notifications />);

      // Header
      expect(screen.getByText("Notifications")).toBeTruthy();
      expect(screen.getByText(/Stay updated/)).toBeTruthy();

      // Mark all read (since there are unread)
      expect(screen.getByText("Mark all read")).toBeTruthy();

      // Search
      expect(screen.getByPlaceholderText("Search notifications...")).toBeTruthy();

      // Notifications
      expect(screen.getByText("Payment")).toBeTruthy();
      expect(screen.getByText("KYC")).toBeTruthy();
    });

    it("renders mixed read/unread states", () => {
      setQueryData({
        "notifications/my": [
          makeNotification({ id: 1, title: "Unread 1", read: false }),
          makeNotification({ id: 2, title: "Read 1", read: true }),
          makeNotification({ id: 3, title: "Unread 2", read: false }),
        ],
      });
      const { container } = render(<Notifications />);

      expect(screen.getByText("Unread 1")).toBeTruthy();
      expect(screen.getByText("Read 1")).toBeTruthy();
      expect(screen.getByText("Unread 2")).toBeTruthy();

      const unreadCards = container.querySelectorAll("[class*='bg-secondary/20']");
      expect(unreadCards.length).toBe(2);
    });

    it("paginates many notifications", async () => {
      const user = userEvent.setup();
      const notifs = Array.from({ length: 30 }, (_, i) =>
        makeNotification({ id: i + 1, title: `Notification ${i + 1}` })
      );
      setQueryData({ "notifications/my": notifs });
      render(<Notifications />);
      // Page 1 shows the first 10 of 30
      expect(screen.getByText("Notification 1")).toBeTruthy();
      expect(screen.queryByText("Notification 30")).toBeNull();
      expect(screen.getByText(/Showing 10 of 30 notifications/)).toBeTruthy();

      // Next page shows more
      await user.click(screen.getByText("Next"));
      expect(screen.getByText("Notification 11")).toBeTruthy();

      // Last page reaches Notification 30
      while (screen.getByText(/\d+ \/ 3/)) {
        const nextBtn = screen.getByText("Next");
        const disabled = (nextBtn.closest("button") as HTMLButtonElement)?.disabled;
        if (disabled) break;
        await user.click(nextBtn);
      }
      expect(screen.getByText("Notification 30")).toBeTruthy();
    });
  });
});
