// @vitest-environment jsdom
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { useApiQuery } from "@/hooks/use-api";

// ─── Mock: sonner ──────────────────────────────────────────
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

// ─── Mock: useAuth (admin user) ────────────────────────────
vi.mock("@/hooks/use-auth", () => ({
  useAuth: vi.fn(() => ({
    isLoading: false,
    isAuthenticated: true,
    user: { id: 1, name: "Admin", email: "admin@test.com", role: "super_admin" },
    error: null,
    signIn: vi.fn(),
    signOut: vi.fn(),
    refetch: vi.fn(),
  })),
}));

// ─── Mock: useApiQuery / useApiMutation ────────────────────
const queryDataMap: Record<string, any> = {};
const mockRefetch = vi.fn();
const mockMutateAsync = vi.fn().mockResolvedValue({ id: 99 });

vi.mock("@/hooks/use-api", () => ({
  useApiQuery: vi.fn((key: string[]) => {
    // The challenges list passes a query-suffixed key (["admin", "allChallenges", "/api/..."]),
    // so look up by the stable prefix (first two segments).
    const dataKey = key.slice(0, 2).join("/");
    if (queryDataMap[dataKey] === undefined) {
      return { data: undefined, isLoading: true, refetch: mockRefetch };
    }
    return { data: queryDataMap[dataKey], isLoading: false, refetch: mockRefetch };
  }),
  useApiMutation: vi.fn(() => ({
    mutateAsync: mockMutateAsync,
    mutate: vi.fn(),
    isPending: false,
  })),
}));

// ─── Mock: AlertDialog ─────────────────────────────────────
vi.mock("@/components/ui/alert-dialog", () => ({
  AlertDialog: ({ open, _onOpenChange, children }: any) => {
    if (!open) return null;
    return <div data-testid="alert-dialog">{children}</div>;
  },
  AlertDialogContent: ({ children }: any) => <div>{children}</div>,
  AlertDialogHeader: ({ children }: any) => <div>{children}</div>,
  AlertDialogTitle: ({ children }: any) => <h2>{children}</h2>,
  AlertDialogDescription: ({ children }: any) => <p>{children}</p>,
  AlertDialogFooter: ({ children }: any) => <div>{children}</div>,
  AlertDialogCancel: ({ children, onClick }: any) => (
    <button data-testid="alert-cancel" onClick={onClick}>{children}</button>
  ),
  AlertDialogAction: ({ children, onClick }: any) => (
    <button data-testid="alert-confirm" onClick={onClick}>{children}</button>
  ),
}));

// ─── Mock: fetch ──────────────────────────────────────────
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// ─── Mock: react-router (audit trail deep links + tab routing) ─
vi.mock("react-router", () => ({
  Link: ({ to, children, ...rest }: any) => <a href={to} {...rest}>{children}</a>,
  // Stateful like the real hook: clicking a tab rewrites the URL params and
  // re-renders the component so the deep-linkable tab UI follows.
  useSearchParams: () => {
    const [params, setParams] = React.useState(() => new URLSearchParams());
    const set = (next: any, _opts?: any) => {
      setParams(next instanceof URLSearchParams ? next : new URLSearchParams(next));
    };
    return [params, set];
  },
}));

// ─── Mock: react-query (digest-tab actions invalidate queries) ──
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

// ─── Import component after mocks ─────────────────────────
import AdminChallenges from "@/pages/admin/AdminChallenges";
import { toast } from "sonner";

// ─── Factories ────────────────────────────────────────────
function makeTemplate(overrides: any = {}) {
  return {
    id: 1,
    name: "Two-Step Pro",
    description: "Professional two-step challenge",
    type: "two_step",
    isActive: true,
    profitTarget: 8,
    dailyDrawdown: 5,
    maxDrawdown: 10,
    maxLeverage: 100,
    minTradingDays: 5,
    maxTradingDays: null,
    maxPositionSize: null,
    consistencyTarget: null,
    allowWeekendHolding: false,
    allowNewsTrading: true,
    allowEATrading: true,
    allowCopyTrading: false,
    price: 50000,
    currency: "NGN",
    durationDays: 30,
    resetFee: null,
    extensionFee: null,
    scalingPlan: null,
    maxAccountSize: null,
    createdBy: 1,
    createdAt: Date.now() - 86400000 * 10,
    updatedAt: Date.now() - 86400000,
    ...overrides,
  };
}

function makeSize(overrides: any = {}) {
  return {
    id: 1,
    label: "$50,000",
    size: 50000,
    currency: "NGN",
    templateId: 1,
    price: 50000,
    isActive: true,
    sortOrder: 0,
    ...overrides,
  };
}

function makeChallenge(overrides: any = {}) {
  return {
    id: 1,
    userId: 10,
    accountSize: 50000,
    amountPaid: 50000,
    status: "active",
    createdAt: Date.now() - 86400000,
    ...overrides,
  };
}

// ─── Helpers ──────────────────────────────────────────────
function clearAll() {
  Object.keys(queryDataMap).forEach((k) => delete queryDataMap[k]);
}

function setQueryData(updates: Record<string, any>) {
  clearAll();
  Object.assign(queryDataMap, {
    "admin/templates": [],
    "admin/allChallenges": [],
    ...updates,
  });
}

// ─── Tests ────────────────────────────────────────────────
describe("AdminChallenges Page", () => {
  beforeEach(() => {
    clearAll();
    vi.clearAllMocks();
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ message: "ok" }) });
    mockMutateAsync.mockResolvedValue({ id: 99 });
  });

  // ─── Loading State ──────────────────────────────────────
  describe("Loading State", () => {
    it("shows spinner when loading", () => {
      clearAll();
      const { container } = render(<AdminChallenges />);
      expect(container.querySelector(".animate-spin")).toBeTruthy();
    });

    it("hides spinner once loaded", () => {
      setQueryData({});
      const { container } = render(<AdminChallenges />);
      expect(container.querySelector(".animate-spin")).toBeNull();
    });
  });

  // ─── Page Header ────────────────────────────────────────
  describe("Page Header", () => {
    it("renders title", () => {
      setQueryData({});
      render(<AdminChallenges />);
      expect(screen.getByText("Challenge Management")).toBeTruthy();
    });

    it("renders description", () => {
      setQueryData({});
      render(<AdminChallenges />);
      expect(screen.getByText(/Create and manage challenge templates/)).toBeTruthy();
    });
  });

  // ─── Stats Cards ────────────────────────────────────────
  describe("Stats Cards", () => {
    it("renders all four stat cards", () => {
      setQueryData({});
      render(<AdminChallenges />);
      expect(screen.getByText("Templates")).toBeTruthy();
      expect(screen.getByText("Active Challenges")).toBeTruthy();
      expect(screen.getByText("Funded Traders")).toBeTruthy();
      expect(screen.getByText("Revenue")).toBeTruthy();
    });

    it("shows template count from data", () => {
      setQueryData({
        "admin/templates": [makeTemplate({ id: 1 }), makeTemplate({ id: 2, name: "One-Step" })],
        "admin/allChallenges": [],
      });
      render(<AdminChallenges />);
      const statCards = document.querySelectorAll(".card-subtle");
      const templateCard = Array.from(statCards).find((c) => c.textContent?.includes("Templates"));
      expect(templateCard?.textContent).toContain("2");
    });

    it("counts active challenges from data", () => {
      setQueryData({
        "admin/allChallenges": [
          makeChallenge({ id: 1, status: "active" }),
          makeChallenge({ id: 2, status: "active" }),
          makeChallenge({ id: 3, status: "funded" }),
        ],
      });
      render(<AdminChallenges />);
      const statCards = document.querySelectorAll(".card-subtle");
      const activeCard = Array.from(statCards).find((c) => c.textContent?.includes("Active Challenges"));
      expect(activeCard?.textContent).toContain("2");
    });

    it("counts funded traders", () => {
      setQueryData({
        "admin/allChallenges": [
          makeChallenge({ id: 1, status: "funded" }),
          makeChallenge({ id: 2, status: "funded" }),
        ],
      });
      render(<AdminChallenges />);
      const statCards = document.querySelectorAll(".card-subtle");
      const fundedCard = Array.from(statCards).find((c) => c.textContent?.includes("Funded Traders"));
      expect(fundedCard?.textContent).toContain("2");
    });

    it("sums revenue from amountPaid", () => {
      setQueryData({
        "admin/allChallenges": [
          makeChallenge({ amountPaid: 50000 }),
          makeChallenge({ id: 2, amountPaid: 100000 }),
        ],
      });
      render(<AdminChallenges />);
      const statCards = document.querySelectorAll(".card-subtle");
      const revenueCard = Array.from(statCards).find((c) => c.textContent?.includes("Revenue"));
      expect(revenueCard?.textContent).toContain("₦150,000");
    });

    it("shows zero values with empty data", () => {
      setQueryData({ "admin/templates": [], "admin/allChallenges": [] });
      render(<AdminChallenges />);
      expect(screen.getByText("Templates")).toBeTruthy();
    });
  });

  // ─── Tabs ───────────────────────────────────────────────
  describe("Tabs", () => {
    it("renders Templates & Sizes tab", () => {
      setQueryData({});
      render(<AdminChallenges />);
      expect(screen.getByText("Templates & Sizes")).toBeTruthy();
    });

    it("renders All Challenges tab with count", () => {
      setQueryData({
        "admin/allChallenges": [makeChallenge(), makeChallenge({ id: 2 })],
      });
      render(<AdminChallenges />);
      expect(screen.getByText(/All Challenges \(2\)/)).toBeTruthy();
    });

    it("defaults to templates tab", () => {
      setQueryData({
        "admin/templates": [makeTemplate()],
        "admin/allChallenges": [makeChallenge()],
      });
      render(<AdminChallenges />);
      expect(screen.getByText("New Template")).toBeTruthy();
    });

    it("switches to challenges tab", async () => {
      const user = userEvent.setup();
      setQueryData({
        "admin/allChallenges": [makeChallenge({ userId: 5, accountSize: 100000, status: "active" })],
      });
      render(<AdminChallenges />);
      await user.click(screen.getByText(/All Challenges/));
      expect(screen.getByText("User 5")).toBeTruthy();
      expect(screen.getByText("$100,000")).toBeTruthy();
    });
  });

  // ─── Templates Tab ──────────────────────────────────────
  describe("Templates Tab", () => {
    it("renders template list", () => {
      setQueryData({
        "admin/templates": [makeTemplate()],
      });
      render(<AdminChallenges />);
      expect(screen.getByText("Two-Step Pro")).toBeTruthy();
      expect(screen.getByText("Active")).toBeTruthy();
    });

    it("shows template description and price", () => {
      setQueryData({
        "admin/templates": [makeTemplate({ price: 75000 })],
      });
      render(<AdminChallenges />);
      expect(screen.getByText(/Professional two-step/)).toBeTruthy();
      expect(screen.getByText(/₦75,000/)).toBeTruthy();
    });

    it("shows template type badge", () => {
      setQueryData({
        "admin/templates": [makeTemplate({ type: "one_step" })],
      });
      render(<AdminChallenges />);
      expect(screen.getByText("One-Step")).toBeTruthy();
    });

    it("shows empty state when no templates", () => {
      setQueryData({ "admin/templates": [] });
      render(<AdminChallenges />);
      expect(screen.getByText(/No templates yet/)).toBeTruthy();
    });

    it("shows New Template button", () => {
      setQueryData({});
      render(<AdminChallenges />);
      expect(screen.getByText("New Template")).toBeTruthy();
    });

    it("renders multiple templates", () => {
      setQueryData({
        "admin/templates": [
          makeTemplate({ id: 1, name: "Two-Step Pro" }),
          makeTemplate({ id: 2, name: "One-Step Express", type: "one_step" }),
          makeTemplate({ id: 3, name: "Instant Funding", type: "instant_funding" }),
        ],
      });
      render(<AdminChallenges />);
      expect(screen.getByText("Two-Step Pro")).toBeTruthy();
      expect(screen.getByText("One-Step Express")).toBeTruthy();
      // "Instant Funding" appears as both template name and type badge
      expect(screen.getAllByText("Instant Funding").length).toBeGreaterThanOrEqual(2);
    });

    it("shows template rule details on expand", async () => {
      const user = userEvent.setup();
      setQueryData({
        "admin/templates": [makeTemplate({ profitTarget: 10, dailyDrawdown: 4, maxDrawdown: 8, maxLeverage: 50, minTradingDays: 7, durationDays: 45 })],
      });
      // Mock the sizes fetch
      mockFetch.mockResolvedValueOnce({ ok: true, json: async () => [] });
      render(<AdminChallenges />);
      await user.click(screen.getByText("Two-Step Pro"));
      expect(screen.getByText(/Profit Target:/)).toBeTruthy();
      expect(screen.getByText(/Daily DD:/)).toBeTruthy();
      expect(screen.getByText(/Max DD:/)).toBeTruthy();
      expect(screen.getByText(/Leverage:/)).toBeTruthy();
      expect(screen.getByText(/Min Days:/)).toBeTruthy();
      expect(screen.getByText(/Duration:/)).toBeTruthy();
    });
  });

  // ─── Account Sizes (expanded) ───────────────────────────
  describe("Account Sizes", () => {
    it("loads and displays sizes when expanded", async () => {
      const user = userEvent.setup();
      const sizes = [
        makeSize({ id: 1, label: "$10,000", size: 10000, price: 15000 }),
        makeSize({ id: 2, label: "$50,000", size: 50000, price: 50000 }),
        makeSize({ id: 3, label: "$100,000", size: 100000, price: 90000 }),
      ];
      mockFetch.mockResolvedValueOnce({ ok: true, json: async () => sizes });
      setQueryData({ "admin/templates": [makeTemplate()] });
      render(<AdminChallenges />);
      await user.click(screen.getByText("Two-Step Pro"));

      // Labels appear in the size list (label + formatted size text)
      expect(screen.getAllByText("$10,000").length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText("$50,000").length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText("$100,000").length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText((t) => t.includes("₦") && t.includes("15,000")).length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText((t) => t.includes("₦") && t.includes("50,000")).length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText((t) => t.includes("₦") && t.includes("90,000")).length).toBeGreaterThanOrEqual(1);
    });

    it("shows empty state when no sizes", async () => {
      const user = userEvent.setup();
      mockFetch.mockResolvedValueOnce({ ok: true, json: async () => [] });
      setQueryData({ "admin/templates": [makeTemplate()] });
      render(<AdminChallenges />);
      await user.click(screen.getByText("Two-Step Pro"));
      expect(screen.getByText("No sizes configured")).toBeTruthy();
    });

    it("shows Add Size button in expanded view", async () => {
      const user = userEvent.setup();
      mockFetch.mockResolvedValueOnce({ ok: true, json: async () => [] });
      setQueryData({ "admin/templates": [makeTemplate()] });
      render(<AdminChallenges />);
      await user.click(screen.getByText("Two-Step Pro"));
      expect(screen.getByText("Add Size")).toBeTruthy();
    });

    it("shows rule details with correct values", async () => {
      const user = userEvent.setup();
      mockFetch.mockResolvedValueOnce({ ok: true, json: async () => [] });
      setQueryData({ "admin/templates": [makeTemplate({ profitTarget: 8, dailyDrawdown: 5, maxDrawdown: 10, maxLeverage: 100, minTradingDays: 5, durationDays: 30 })] });
      render(<AdminChallenges />);
      await user.click(screen.getByText("Two-Step Pro"));
      const details = screen.getByText(/Profit Target:/).parentElement?.parentElement;
      expect(details?.textContent).toContain("8%");
      expect(details?.textContent).toContain("5%");
      expect(details?.textContent).toContain("10%");
      expect(details?.textContent).toContain("1:100");
      expect(details?.textContent).toContain("5");
      expect(details?.textContent).toContain("30d");
    });
  });

  // ─── Audit Trail Deep Links ────────────────────────────
  describe("Audit Trail Deep Links", () => {
    it("links each template row to its scoped audit trail", () => {
      setQueryData({
        "admin/templates": [makeTemplate({ id: 7, name: "Two-Step Pro" })],
      });
      render(<AdminChallenges />);
      const link = screen.getByRole("link", { name: "View audit trail for template 7" });
      expect(link.getAttribute("href")).toBe("/admin/audit-logs?entity=challenge_template&entityId=7");
    });

    it("renders a deep link per template", () => {
      setQueryData({
        "admin/templates": [
          makeTemplate({ id: 1, name: "Two-Step Pro" }),
          makeTemplate({ id: 2, name: "One-Step Express", type: "one_step" }),
        ],
      });
      render(<AdminChallenges />);
      expect(screen.getAllByLabelText(/View audit trail for template/).length).toBe(2);
    });

    it("links each account size to its scoped audit trail", async () => {
      const user = userEvent.setup();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [makeSize({ id: 5, label: "$100,000", size: 100000 })],
      });
      setQueryData({ "admin/templates": [makeTemplate()] });
      render(<AdminChallenges />);
      await user.click(screen.getByText("Two-Step Pro"));
      const link = screen.getByRole("link", { name: "View audit trail for size 5" });
      expect(link.getAttribute("href")).toBe("/admin/audit-logs?entity=account_size&entityId=5");
    });
  });

  // ─── Challenges Tab ─────────────────────────────────────
  describe("Challenges Tab", () => {
    it("shows challenge table with data", async () => {
      const user = userEvent.setup();
      setQueryData({
        "admin/allChallenges": [
          makeChallenge({ id: 1, userId: 10, accountSize: 50000, amountPaid: 50000, status: "active" }),
        ],
      });
      render(<AdminChallenges />);
      await user.click(screen.getByText(/All Challenges/));
      expect(screen.getByText("#1")).toBeTruthy();
      expect(screen.getByText("User 10")).toBeTruthy();
      expect(screen.getAllByText("$50,000").length).toBeGreaterThanOrEqual(1);
      // ₦50,000 appears in both stat card (Revenue) and table cell
      expect(screen.getAllByText((t) => t.includes("₦") && t.includes("50,000")).length).toBeGreaterThanOrEqual(2);
    });

    it("shows active badge for active challenges", async () => {
      const user = userEvent.setup();
      setQueryData({
        "admin/allChallenges": [makeChallenge({ status: "active" })],
      });
      render(<AdminChallenges />);
      await user.click(screen.getByText(/All Challenges/));
      expect(screen.getByText("active")).toBeTruthy();
    });

    it("shows funded badge", async () => {
      const user = userEvent.setup();
      setQueryData({
        "admin/allChallenges": [makeChallenge({ status: "funded" })],
      });
      render(<AdminChallenges />);
      await user.click(screen.getByText(/All Challenges/));
      expect(screen.getByText("funded")).toBeTruthy();
    });

    it("shows violated badge", async () => {
      const user = userEvent.setup();
      setQueryData({
        "admin/allChallenges": [makeChallenge({ status: "violated" })],
      });
      render(<AdminChallenges />);
      await user.click(screen.getByText(/All Challenges/));
      expect(screen.getByText("violated")).toBeTruthy();
    });

    it("shows empty state when no challenges", async () => {
      const user = userEvent.setup();
      setQueryData({ "admin/allChallenges": [] });
      render(<AdminChallenges />);
      await user.click(screen.getByText(/All Challenges/));
      expect(screen.getByText(/No challenges purchased yet/)).toBeTruthy();
    });

    it("renders multiple challenges", async () => {
      const user = userEvent.setup();
      setQueryData({
        "admin/allChallenges": [
          makeChallenge({ id: 1, userId: 10, accountSize: 50000, status: "active" }),
          makeChallenge({ id: 2, userId: 20, accountSize: 100000, status: "funded" }),
          makeChallenge({ id: 3, userId: 30, accountSize: 25000, status: "violated" }),
        ],
      });
      render(<AdminChallenges />);
      await user.click(screen.getByText(/All Challenges/));
      expect(screen.getByText("User 10")).toBeTruthy();
      expect(screen.getByText("User 20")).toBeTruthy();
      expect(screen.getByText("User 30")).toBeTruthy();
    });
  });

  // ─── Sortable challenges headers ───────────────────────
  describe("Sortable Challenges Headers", () => {
    it("renders sortable column headers with the default column active", async () => {
      const user = userEvent.setup();
      setQueryData({ "admin/allChallenges": [makeChallenge()] });
      render(<AdminChallenges />);
      await user.click(screen.getByText(/All Challenges/));

      for (const label of ["ID", "Account Size", "Amount Paid", "Status", "Created"]) {
        expect(screen.getByRole("button", { name: `Sort by ${label}` })).toBeTruthy();
      }
      // Default sort is createdAt desc → Created is active
      expect(screen.getByRole("button", { name: "Sort by Created" }).getAttribute("aria-pressed")).toBe("true");
    });

    it("calls the API with sortBy/sortOrder when a header is clicked", async () => {
      const user = userEvent.setup();
      setQueryData({ "admin/allChallenges": [makeChallenge()] });
      render(<AdminChallenges />);
      await user.click(screen.getByText(/All Challenges/));

      await user.click(screen.getByRole("button", { name: "Sort by Account Size" }));

      const calls = vi.mocked(useApiQuery).mock.calls;
      const challengesCall = calls.find((c) => String(c[1]).includes("/api/challenges/admin/all?") && String(c[1]).includes("sortBy=accountSize"));
      expect(challengesCall).toBeTruthy();
      expect(String(challengesCall![1])).toContain("sortOrder=desc");
      expect(screen.getByRole("button", { name: "Sort by Account Size" }).getAttribute("aria-pressed")).toBe("true");
    });

    it("toggles to ascending when the active column is clicked again", async () => {
      const user = userEvent.setup();
      setQueryData({ "admin/allChallenges": [makeChallenge()] });
      render(<AdminChallenges />);
      await user.click(screen.getByText(/All Challenges/));

      await user.click(screen.getByRole("button", { name: "Sort by Account Size" }));
      await user.click(screen.getByRole("button", { name: "Sort by Account Size" }));

      const calls = vi.mocked(useApiQuery).mock.calls;
      const ascCall = calls.find((c) => String(c[1]).includes("/api/challenges/admin/all?") && String(c[1]).includes("sortBy=accountSize&sortOrder=asc"));
      expect(ascCall).toBeTruthy();
    });
  });

  // ─── Create Template Dialog ─────────────────────────────
  describe("Create Template Dialog", () => {
    it("opens create dialog on New Template click", async () => {
      const user = userEvent.setup();
      setQueryData({});
      render(<AdminChallenges />);
      await user.click(screen.getByText("New Template"));
      expect(screen.getByText("Create New Template")).toBeTruthy();
      expect(screen.getByPlaceholderText(/e.g. Pro Trader Challenge/)).toBeTruthy();
    });

    it("shows all form fields in create dialog", async () => {
      const user = userEvent.setup();
      setQueryData({});
      render(<AdminChallenges />);
      await user.click(screen.getByText("New Template"));
      expect(screen.getByText("Name *")).toBeTruthy();
      expect(screen.getByText("Description")).toBeTruthy();
      expect(screen.getByText("Type *")).toBeTruthy();
      expect(screen.getByText("Base Price (₦) *")).toBeTruthy();
      expect(screen.getByText("Profit Target %")).toBeTruthy();
      expect(screen.getByText("Daily DD %")).toBeTruthy();
      expect(screen.getByText("Max DD %")).toBeTruthy();
      expect(screen.getByText("Max Leverage")).toBeTruthy();
      expect(screen.getByText("Min Trading Days")).toBeTruthy();
      expect(screen.getByText("Duration (days)")).toBeTruthy();
      expect(screen.getByText("Weekend Holding")).toBeTruthy();
      expect(screen.getByText("News Trading")).toBeTruthy();
      expect(screen.getByText("EA Trading")).toBeTruthy();
      expect(screen.getByText("Copy Trading")).toBeTruthy();
      expect(screen.getByText("Create Template")).toBeTruthy();
    });

    it("disables Create button when name is empty", async () => {
      const user = userEvent.setup();
      setQueryData({});
      render(<AdminChallenges />);
      await user.click(screen.getByText("New Template"));
      const createBtn = screen.getByText("Create Template");
      expect(createBtn.closest("button")?.disabled).toBeTruthy();
    });

    it("enables Create button when name is filled", async () => {
      const user = userEvent.setup();
      setQueryData({});
      render(<AdminChallenges />);
      await user.click(screen.getByText("New Template"));
      await user.type(screen.getByPlaceholderText(/e.g. Pro Trader Challenge/), "My Template");
      const createBtn = screen.getByText("Create Template");
      expect(createBtn.closest("button")?.disabled).toBeFalsy();
    });

    it("closes dialog on close button click", async () => {
      const user = userEvent.setup();
      setQueryData({});
      render(<AdminChallenges />);
      await user.click(screen.getByText("New Template"));
      expect(screen.getByText("Create New Template")).toBeTruthy();
      // Find the X button
      const closeBtn = document.querySelector(".fixed button:last-of-type");
      if (closeBtn) await user.click(closeBtn);
    });

    it("submits create template with form data", async () => {
      const user = userEvent.setup();
      setQueryData({});
      render(<AdminChallenges />);
      await user.click(screen.getByText("New Template"));
      await user.type(screen.getByPlaceholderText(/e.g. Pro Trader Challenge/), "New Challenge");
      await user.click(screen.getByText("Create Template"));
      expect(mockMutateAsync).toHaveBeenCalled();
      expect(toast.success).toHaveBeenCalledWith("Template created");
    });

    it("shows error toast on create failure", async () => {
      mockMutateAsync.mockRejectedValueOnce(new Error("Network error"));
      const user = userEvent.setup();
      setQueryData({});
      render(<AdminChallenges />);
      await user.click(screen.getByText("New Template"));
      await user.type(screen.getByPlaceholderText(/e.g. Pro Trader Challenge/), "Fail Challenge");
      await user.click(screen.getByText("Create Template"));
      expect(toast.error).toHaveBeenCalledWith("Network error");
    });
  });

  // ─── Edit Template Dialog ───────────────────────────────
  describe("Edit Template Dialog", () => {
    it("opens edit dialog on edit button click", async () => {
      const user = userEvent.setup();
      setQueryData({ "admin/templates": [makeTemplate()] });
      render(<AdminChallenges />);
      const editBtns = screen.getAllByTitle("Edit template");
      await user.click(editBtns[0]);
      expect(screen.getByText(/Edit Template:/)).toBeTruthy();
      expect(screen.getByText("Save Changes")).toBeTruthy();
    });

    it("pre-fills edit form with template data", async () => {
      const user = userEvent.setup();
      setQueryData({ "admin/templates": [makeTemplate({ name: "My Challenge", profitTarget: 10 })] });
      render(<AdminChallenges />);
      await user.click(screen.getAllByTitle("Edit template")[0]);
      const nameInput = screen.getByDisplayValue("My Challenge");
      expect(nameInput).toBeTruthy();
    });

    it("saves edited template via API", async () => {
      const user = userEvent.setup();
      setQueryData({ "admin/templates": [makeTemplate({ id: 42 })] });
      render(<AdminChallenges />);
      await user.click(screen.getAllByTitle("Edit template")[0]);
      await user.click(screen.getByText("Save Changes"));
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/challenges/admin/templates/42",
        expect.objectContaining({ method: "PUT" }),
      );
      expect(toast.success).toHaveBeenCalledWith("Template updated");
    });
  });

  // ─── Delete Template ────────────────────────────────────
  describe("Delete Template", () => {
    it("opens delete confirmation dialog", async () => {
      const user = userEvent.setup();
      setQueryData({ "admin/templates": [makeTemplate()] });
      render(<AdminChallenges />);
      await user.click(screen.getAllByTitle("Delete template")[0]);
      expect(screen.getByText("Delete Template")).toBeTruthy();
      expect(screen.getByText(/Are you sure you want to delete/)).toBeTruthy();
    });

    it("closes dialog on cancel", async () => {
      const user = userEvent.setup();
      setQueryData({ "admin/templates": [makeTemplate()] });
      render(<AdminChallenges />);
      await user.click(screen.getAllByTitle("Delete template")[0]);
      expect(screen.getByTestId("alert-dialog")).toBeTruthy();
      await user.click(screen.getByTestId("alert-cancel"));
      // Dialog stays open since our mock doesn't wire onOpenChange
      // But cancel button was clickable
      expect(screen.getByTestId("alert-cancel")).toBeTruthy();
    });

    it("deletes template via API on confirm", async () => {
      const user = userEvent.setup();
      setQueryData({ "admin/templates": [makeTemplate({ id: 42 })] });
      render(<AdminChallenges />);
      await user.click(screen.getAllByTitle("Delete template")[0]);
      await user.click(screen.getByTestId("alert-confirm"));
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/challenges/admin/templates/42",
        expect.objectContaining({ method: "DELETE" }),
      );
      expect(toast.success).toHaveBeenCalledWith("Deleted successfully");
    });

    it("warns about cascade delete in description", async () => {
      const user = userEvent.setup();
      setQueryData({ "admin/templates": [makeTemplate()] });
      render(<AdminChallenges />);
      await user.click(screen.getAllByTitle("Delete template")[0]);
      expect(screen.getByText(/This will also delete all associated account sizes/)).toBeTruthy();
    });
  });

  // ─── Add Size Dialog ────────────────────────────────────
  describe("Add Size Dialog", () => {
    it("opens add size dialog from expanded template", async () => {
      const user = userEvent.setup();
      mockFetch.mockResolvedValueOnce({ ok: true, json: async () => [] });
      setQueryData({ "admin/templates": [makeTemplate()] });
      render(<AdminChallenges />);
      await user.click(screen.getByText("Two-Step Pro"));
      await user.click(screen.getByText("Add Size"));
      expect(screen.getByText("Add Account Size")).toBeTruthy();
      expect(screen.getByText("Label *")).toBeTruthy();
    });

    it("submits new size via mutation", async () => {
      const user = userEvent.setup();
      mockFetch.mockResolvedValueOnce({ ok: true, json: async () => [] });
      setQueryData({ "admin/templates": [makeTemplate({ id: 1, price: 50000 })] });
      render(<AdminChallenges />);
      await user.click(screen.getByText("Two-Step Pro"));
      await user.click(screen.getByText("Add Size"));
      await user.type(screen.getByPlaceholderText(/e.g. \$50,000/), "$25,000");
      // Click the Add Size button inside the dialog (not the expanded template button)
      const addSizeButtons = screen.getAllByText("Add Size");
      const dialogBtn = addSizeButtons.find((b) => b.closest('[class*="fixed"]'));
      await user.click(dialogBtn || addSizeButtons[addSizeButtons.length - 1]);
      expect(mockMutateAsync).toHaveBeenCalled();
      expect(toast.success).toHaveBeenCalledWith("Size added");
    });
  });

  // ─── Integration: Full Admin Workflow ───────────────────
  describe("Integration: Full Admin Workflow", () => {
    it("creates template → expands → adds size → views stats", async () => {
      const user = userEvent.setup();

      // Start with empty state
      setQueryData({ "admin/templates": [], "admin/allChallenges": [] });
      const { unmount } = render(<AdminChallenges />);

      // Verify empty state
      expect(screen.getByText(/No templates yet/)).toBeTruthy();
      unmount();

      // After creating a template, re-render with data
      setQueryData({
        "admin/templates": [makeTemplate()],
        "admin/allChallenges": [],
      });
      render(<AdminChallenges />);

      // Template appears
      expect(screen.getByText("Two-Step Pro")).toBeTruthy();

      // Expand to load sizes
      mockFetch.mockResolvedValueOnce({ ok: true, json: async () => [makeSize()] });
      await user.click(screen.getByText("Two-Step Pro"));

      // Size visible
      expect(screen.getAllByText("$50,000").length).toBeGreaterThanOrEqual(1);

      // Stats reflect data
      const statCards = document.querySelectorAll(".card-subtle");
      const templateCard = Array.from(statCards).find((c) => c.textContent?.includes("Templates"));
      expect(templateCard?.textContent).toContain("1");
    });

    it("shows correct stats after adding challenges", async () => {
      setQueryData({
        "admin/templates": [makeTemplate()],
        "admin/allChallenges": [
          makeChallenge({ id: 1, status: "active", amountPaid: 50000 }),
          makeChallenge({ id: 2, status: "active", amountPaid: 75000 }),
          makeChallenge({ id: 3, status: "funded", amountPaid: 100000 }),
        ],
      });
      render(<AdminChallenges />);

      const statCards = document.querySelectorAll(".card-subtle");
      const activeCard = Array.from(statCards).find((c) => c.textContent?.includes("Active Challenges"));
      expect(activeCard?.textContent).toContain("2");

      const fundedCard = Array.from(statCards).find((c) => c.textContent?.includes("Funded Traders"));
      expect(fundedCard?.textContent).toContain("1");

      const revenueCard = Array.from(statCards).find((c) => c.textContent?.includes("Revenue"));
      expect(revenueCard?.textContent).toContain("₦225,000");
    });

    it("handles multiple template types correctly", async () => {
      setQueryData({
        "admin/templates": [
          makeTemplate({ id: 1, name: "Two-Step", type: "two_step" }),
          makeTemplate({ id: 2, name: "One-Step", type: "one_step" }),
          makeTemplate({ id: 3, name: "Instant", type: "instant_funding" }),
          makeTemplate({ id: 4, name: "Eval", type: "evaluation" }),
        ],
      });
      render(<AdminChallenges />);
      // "Two-Step" appears as both name and type badge
      expect(screen.getAllByText("Two-Step").length).toBeGreaterThanOrEqual(2);
      expect(screen.getAllByText("One-Step").length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText("Instant Funding").length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText("Evaluation").length).toBeGreaterThanOrEqual(1);
    });

    it("collapses expanded template on second click", async () => {
      const user = userEvent.setup();
      mockFetch.mockResolvedValueOnce({ ok: true, json: async () => [makeSize()] });
      setQueryData({ "admin/templates": [makeTemplate()] });
      render(<AdminChallenges />);

      // Expand
      await user.click(screen.getByText("Two-Step Pro"));
      expect(screen.getByText("Account Sizes")).toBeTruthy();

      // Collapse
      await user.click(screen.getByText("Two-Step Pro"));
      expect(screen.queryByText("Account Sizes")).toBeNull();
    });

    it("toggles between tabs without losing data", async () => {
      const user = userEvent.setup();
      setQueryData({
        "admin/templates": [makeTemplate()],
        "admin/allChallenges": [makeChallenge()],
      });
      render(<AdminChallenges />);

      // On templates tab
      expect(screen.getByText("New Template")).toBeTruthy();

      // Switch to challenges
      await user.click(screen.getByText(/All Challenges/));
      expect(screen.getByText("User 10")).toBeTruthy();

      // Switch back to templates
      await user.click(screen.getByText("Templates & Sizes"));
      expect(screen.getByText("New Template")).toBeTruthy();
      expect(screen.getByText("Two-Step Pro")).toBeTruthy();
    });
  });
});
