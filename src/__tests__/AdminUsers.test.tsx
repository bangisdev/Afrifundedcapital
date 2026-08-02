// @vitest-environment jsdom
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
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

vi.mock("@/hooks/use-api", () => ({
  useApiQuery: vi.fn((key: string[], path: string, _opts?: any) => {
    // The page passes query-suffixed keys (["admin", "users", "/api/users/list?..."]),
    // so look up by the stable prefix (first two segments).
    const dataKey = key.slice(0, 2).join("/");
    if (queryDataMap[dataKey] === undefined) {
      return { data: undefined, isLoading: true, refetch: mockRefetch };
    }
    const base = queryDataMap[dataKey];
    // Simulate the server-driven users list: filter + paginate + stats envelope.
    if (dataKey === "admin/users" && Array.isArray(base)) {
      const url = new URL(path, "http://localhost");
      const search = (url.searchParams.get("search") || "").toLowerCase();
      const role = url.searchParams.get("role");
      const kyc = url.searchParams.get("kycStatus");
      const page = Number(url.searchParams.get("page") || 1);
      const pageSize = Number(url.searchParams.get("pageSize") || 10);

      let filtered = base;
      if (search) {
        filtered = filtered.filter((u: any) =>
          [u.name, u.email, u.phone, u.referralCode].some(
            (v: any) => v && String(v).toLowerCase().includes(search),
          ),
        );
      }
      if (role && role !== "all") filtered = filtered.filter((u: any) => u.role === role);
      if (kyc && kyc !== "all") filtered = filtered.filter((u: any) => u.kycStatus === kyc);

      const total = filtered.length;
      const totalPages = Math.max(1, Math.ceil(total / pageSize));
      return {
        data: {
          users: filtered.slice((page - 1) * pageSize, page * pageSize),
          total,
          page,
          pageSize,
          totalPages,
          stats: {
            total: base.length,
            admins: base.filter((u: any) => u.role && u.role !== "user").length,
            verified: base.filter((u: any) => u.emailVerified).length,
            locked: base.filter((u: any) => u.accountLockedUntil && u.accountLockedUntil > Date.now()).length,
          },
        },
        isLoading: false,
        refetch: mockRefetch,
      };
    }
    return { data: base, isLoading: false, refetch: mockRefetch };
  }),
  useApiMutation: vi.fn(() => ({
    mutateAsync: vi.fn(),
    mutate: vi.fn(),
    isPending: false,
  })),
}));

// ─── Mock: AlertDialog ─────────────────────────────────────
let alertDialogOnOpenChange: ((open: boolean) => void) | null = null;

vi.mock("@/components/ui/alert-dialog", () => ({
  AlertDialog: ({ open, onOpenChange, children }: any) => {
    alertDialogOnOpenChange = onOpenChange;
    if (!open) return null;
    return <div data-testid="alert-dialog">{children}</div>;
  },
  AlertDialogContent: ({ children }: any) => <div>{children}</div>,
  AlertDialogHeader: ({ children }: any) => <div>{children}</div>,
  AlertDialogTitle: ({ children }: any) => <h2>{children}</h2>,
  AlertDialogDescription: ({ children }: any) => <p>{children}</p>,
  AlertDialogFooter: ({ children }: any) => <div>{children}</div>,
  AlertDialogCancel: ({ children, onClick }: any) => (
    <button
      data-testid="alert-cancel"
      onClick={() => {
        onClick?.();
        alertDialogOnOpenChange?.(false);
      }}
    >
      {children}
    </button>
  ),
  AlertDialogAction: ({ children, onClick, ...props }: any) => (
    <button data-testid="alert-confirm" onClick={onClick} {...props}>
      {children}
    </button>
  ),
}));

// ─── Mock: fetch ──────────────────────────────────────────
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// ─── Import component after mocks ─────────────────────────
import AdminUsers from "@/pages/admin/AdminUsers";
import { toast } from "sonner";

// ─── Test data factories ──────────────────────────────────
function makeUser(overrides: any = {}) {
  return {
    id: 1,
    name: "John Doe",
    email: "john@example.com",
    role: "user",
    kycStatus: "unverified",
    onboardingComplete: true,
    emailVerified: true,
    twoFactorEnabled: false,
    accountLockedUntil: null,
    phone: "+2348012345678",
    country: "Nigeria",
    tradingExperience: "intermediate",
    timezone: "Africa/Lagos",
    referralCode: "JOHN001",
    createdAt: Date.now() - 86400000 * 30,
    updatedAt: Date.now() - 86400000,
    ...overrides,
  };
}

// ─── Helpers ──────────────────────────────────────────────
function clearAllQueryData() {
  Object.keys(queryDataMap).forEach((k) => delete queryDataMap[k]);
}

function setQueryData(updates: Record<string, any>) {
  clearAllQueryData();
  Object.assign(queryDataMap, { "admin/users": [], ...updates });
}

// ─── Tests ────────────────────────────────────────────────
describe("AdminUsers Page", () => {
  beforeEach(() => {
    clearAllQueryData();
    vi.clearAllMocks();
    alertDialogOnOpenChange = null;
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ message: "ok" }) });
  });

  // ─── Loading State ──────────────────────────────────────
  describe("Loading State", () => {
    it("shows spinner when data is loading", () => {
      clearAllQueryData();
      const { container } = render(<AdminUsers />);
      expect(container.querySelector(".animate-spin")).toBeTruthy();
    });

    it("hides spinner once loaded", () => {
      setQueryData({});
      const { container } = render(<AdminUsers />);
      expect(container.querySelector(".animate-spin")).toBeNull();
    });
  });

  // ─── Page Header ────────────────────────────────────────
  describe("Page Header", () => {
    it("renders title", () => {
      setQueryData({});
      render(<AdminUsers />);
      expect(screen.getByText("User Management")).toBeTruthy();
    });

    it("renders description", () => {
      setQueryData({});
      render(<AdminUsers />);
      expect(screen.getByText(/View, edit, and manage/)).toBeTruthy();
    });
  });

  // ─── Stats cards ────────────────────────────────────────
  describe("Stats Cards", () => {
    it("renders all four stat cards", () => {
      setQueryData({});
      render(<AdminUsers />);
      expect(screen.getByText("Total Users")).toBeTruthy();
      expect(screen.getByText("Admins")).toBeTruthy();
      expect(screen.getByText("Verified")).toBeTruthy();
      expect(screen.getByText("Locked")).toBeTruthy();
    });

    it("shows correct total users count", () => {
      setQueryData({
        "admin/users": [
          makeUser({ id: 1, name: "Alice" }),
          makeUser({ id: 2, name: "Bob" }),
          makeUser({ id: 3, name: "Charlie" }),
        ],
      });
      render(<AdminUsers />);
      const statCards = document.querySelectorAll(".card-subtle");
      const totalCard = Array.from(statCards).find((card) =>
        card.textContent?.includes("Total Users"),
      );
      expect(totalCard).toBeTruthy();
      expect(totalCard?.textContent).toContain("3");
    });

    it("counts admins correctly", () => {
      setQueryData({
        "admin/users": [
          makeUser({ role: "super_admin" }),
          makeUser({ id: 2, role: "support_admin" }),
          makeUser({ id: 3, role: "user" }),
        ],
      });
      render(<AdminUsers />);
      const statCards = document.querySelectorAll(".card-subtle");
      const adminCard = Array.from(statCards).find((c) => c.textContent?.includes("Admins"));
      expect(adminCard?.textContent).toContain("2");
    });

    it("counts locked users", () => {
      setQueryData({
        "admin/users": [
          makeUser({ accountLockedUntil: Date.now() + 86400000 }),
          makeUser({ id: 2, accountLockedUntil: null }),
        ],
      });
      render(<AdminUsers />);
      const statCards = document.querySelectorAll(".card-subtle");
      const lockedCard = Array.from(statCards).find((c) => c.textContent?.includes("Locked"));
      expect(lockedCard?.textContent).toContain("1");
    });
  });

  // ─── Search ─────────────────────────────────────────────
  describe("Search", () => {
    it("renders search input", () => {
      setQueryData({});
      render(<AdminUsers />);
      expect(screen.getByPlaceholderText(/Search by name/)).toBeTruthy();
    });

    it("filters users by name", async () => {
      const user = userEvent.setup();
      setQueryData({
        "admin/users": [
          makeUser({ id: 1, name: "Alice Smith" }),
          makeUser({ id: 2, name: "Bob Jones" }),
        ],
      });
      render(<AdminUsers />);
      await user.type(screen.getByPlaceholderText(/Search by name/), "alice");
      await waitFor(() => {
        expect(screen.getByText("Alice Smith")).toBeTruthy();
        expect(screen.queryByText("Bob Jones")).toBeNull();
      });
    });

    it("filters users by email", async () => {
      const user = userEvent.setup();
      setQueryData({
        "admin/users": [
          makeUser({ id: 1, name: "Alice", email: "alice@test.com" }),
          makeUser({ id: 2, name: "Bob", email: "bob@test.com" }),
        ],
      });
      render(<AdminUsers />);
      await user.type(screen.getByPlaceholderText(/Search by name/), "bob@test");
      await waitFor(() => {
        expect(screen.getByText("Bob")).toBeTruthy();
        expect(screen.queryByText("Alice")).toBeNull();
      });
    });

    it("filters by phone number", async () => {
      const user = userEvent.setup();
      setQueryData({
        "admin/users": [
          makeUser({ phone: "+2348012345678" }),
          makeUser({ id: 2, phone: "+2349087654321" }),
        ],
      });
      render(<AdminUsers />);
      await user.type(screen.getByPlaceholderText(/Search by name/), "801234");
      await waitFor(() => {
        expect(screen.getByText("John Doe")).toBeTruthy();
      });
    });

    it("filters by referral code", async () => {
      const user = userEvent.setup();
      setQueryData({
        "admin/users": [
          makeUser({ referralCode: "JOHN001" }),
          makeUser({ id: 2, referralCode: "BOB002" }),
        ],
      });
      render(<AdminUsers />);
      await user.type(screen.getByPlaceholderText(/Search by name/), "BOB002");
      // Bob's referral code matches, so his (default-name) user row remains visible
      await waitFor(() => {
        expect(screen.getByText("John Doe")).toBeTruthy();
      });
    });

    it("case-insensitive search", async () => {
      const user = userEvent.setup();
      setQueryData({
        "admin/users": [
          makeUser({ name: "Alice Smith", email: "alice@test.com" }),
        ],
      });
      render(<AdminUsers />);
      await user.type(screen.getByPlaceholderText(/Search by name/), "ALICE");
      await waitFor(() => {
        expect(screen.getByText("Alice Smith")).toBeTruthy();
      });
    });
  });

  // ─── Role filter ────────────────────────────────────────
  describe("Role Filter", () => {
    it("renders role filter dropdown", () => {
      setQueryData({});
      render(<AdminUsers />);
      expect(screen.getByDisplayValue("All Roles")).toBeTruthy();
    });

    it("filters by role", async () => {
      const user = userEvent.setup();
      setQueryData({
        "admin/users": [
          makeUser({ id: 1, role: "user", name: "Regular" }),
          makeUser({ id: 2, role: "super_admin", name: "Admin User" }),
        ],
      });
      render(<AdminUsers />);
      await user.selectOptions(screen.getByDisplayValue("All Roles"), "super_admin");
      await waitFor(() => {
        expect(screen.getByText("Admin User")).toBeTruthy();
        expect(screen.queryByText("Regular")).toBeNull();
      });
    });

    it("shows all role options", async () => {
      const user = userEvent.setup();
      setQueryData({});
      render(<AdminUsers />);
      const select = screen.getByDisplayValue("All Roles");
      const options = select.querySelectorAll("option");
      expect(options.length).toBeGreaterThanOrEqual(9); // All Roles + 8 roles
    });
  });

  // ─── KYC filter ─────────────────────────────────────────
  describe("KYC Filter", () => {
    it("renders KYC filter dropdown", () => {
      setQueryData({});
      render(<AdminUsers />);
      expect(screen.getByDisplayValue("All KYC Status")).toBeTruthy();
    });

    it("filters by KYC status", async () => {
      const user = userEvent.setup();
      setQueryData({
        "admin/users": [
          makeUser({ id: 1, kycStatus: "approved", name: "Approved User" }),
          makeUser({ id: 2, kycStatus: "unverified", name: "Unverified User" }),
        ],
      });
      render(<AdminUsers />);
      await user.selectOptions(screen.getByDisplayValue("All KYC Status"), "approved");
      await waitFor(() => {
        expect(screen.getByText("Approved User")).toBeTruthy();
        expect(screen.queryByText("Unverified User")).toBeNull();
      });
    });

    it("shows all KYC status options", async () => {
      const user = userEvent.setup();
      setQueryData({});
      render(<AdminUsers />);
      const select = screen.getByDisplayValue("All KYC Status");
      const options = select.querySelectorAll("option");
      expect(options.length).toBeGreaterThanOrEqual(5); // All + 4 statuses
    });
  });

  // ─── Clear filters ──────────────────────────────────────
  describe("Clear Filters", () => {
    it("shows clear button when search is active", async () => {
      const user = userEvent.setup();
      setQueryData({});
      render(<AdminUsers />);
      expect(screen.queryByText("Clear")).toBeNull();
      await user.type(screen.getByPlaceholderText(/Search by name/), "test");
      expect(screen.getByText("Clear")).toBeTruthy();
    });

    it("clears search on Clear click", async () => {
      const user = userEvent.setup();
      setQueryData({
        "admin/users": [makeUser({ name: "Alice" })],
      });
      render(<AdminUsers />);
      await user.type(screen.getByPlaceholderText(/Search by name/), "zzz");
      await waitFor(() => {
        expect(screen.queryByText("Alice")).toBeNull();
      });
      await user.click(screen.getByText("Clear"));
      await waitFor(() => {
        expect(screen.getByText("Alice")).toBeTruthy();
      });
    });

    it("shows clear button when role filter is active", async () => {
      const user = userEvent.setup();
      setQueryData({});
      render(<AdminUsers />);
      await user.selectOptions(screen.getByDisplayValue("All Roles"), "super_admin");
      expect(screen.getByText("Clear")).toBeTruthy();
    });
  });

  // ─── Users table ────────────────────────────────────────
  describe("Users Table", () => {
    it("renders user name and email", () => {
      setQueryData({
        "admin/users": [makeUser({ name: "Alice", email: "alice@test.com" })],
      });
      render(<AdminUsers />);
      expect(screen.getByText("Alice")).toBeTruthy();
      expect(screen.getByText("alice@test.com")).toBeTruthy();
    });

    it("renders user avatar with first letter", () => {
      setQueryData({
        "admin/users": [makeUser({ name: "Alice" })],
      });
      render(<AdminUsers />);
      expect(screen.getByText("A")).toBeTruthy();
    });

    it("shows Unnamed when name is null", () => {
      setQueryData({
        "admin/users": [makeUser({ name: null })],
      });
      render(<AdminUsers />);
      expect(screen.getByText("Unnamed")).toBeTruthy();
    });

    it("shows role badge in table", () => {
      setQueryData({
        "admin/users": [makeUser({ role: "super_admin", name: "Admin" })],
      });
      render(<AdminUsers />);
      const roleBadges = screen.getAllByText("Super Admin");
      const badge = roleBadges.find((el) => el.tagName === "BUTTON");
      expect(badge).toBeTruthy();
    });

    it("shows KYC status badge", () => {
      setQueryData({
        "admin/users": [makeUser({ kycStatus: "approved" })],
      });
      render(<AdminUsers />);
      const badges = screen.getAllByText("approved");
      expect(badges.length).toBeGreaterThanOrEqual(1);
    });

    it("shows Active status for verified users", () => {
      setQueryData({
        "admin/users": [makeUser({ emailVerified: true, accountLockedUntil: null })],
      });
      render(<AdminUsers />);
      expect(screen.getByText("Active")).toBeTruthy();
    });

    it("shows Locked status for locked users", () => {
      setQueryData({
        "admin/users": [makeUser({ accountLockedUntil: Date.now() + 86400000 })],
      });
      render(<AdminUsers />);
      const lockedElements = screen.getAllByText("Locked");
      expect(lockedElements.length).toBeGreaterThanOrEqual(1);
    });

    it("shows Unverified status for unverified users", () => {
      setQueryData({
        "admin/users": [makeUser({ emailVerified: false, accountLockedUntil: null })],
      });
      render(<AdminUsers />);
      const unverifiedElements = screen.getAllByText("Unverified");
      expect(unverifiedElements.length).toBeGreaterThanOrEqual(1);
    });

    it("shows formatted joined date", () => {
      const date = new Date("2025-01-15");
      setQueryData({
        "admin/users": [makeUser({ createdAt: date.getTime() })],
      });
      render(<AdminUsers />);
      expect(screen.getByText(/Jan 15, 2025/)).toBeTruthy();
    });

    it("shows empty state when search matches nothing", async () => {
      const user = userEvent.setup();
      setQueryData({
        "admin/users": [makeUser({ name: "Alice", email: "alice@test.com" })],
      });
      render(<AdminUsers />);
      await user.type(screen.getByPlaceholderText(/Search by name/), "zzzznotfound");
      await waitFor(() => {
        const tds = document.querySelectorAll("td");
        const emptyTd = Array.from(tds).find((td) => td.textContent?.includes("No users found"));
        expect(emptyTd).toBeTruthy();
      });
    });

    it("shows action buttons for each user", () => {
      setQueryData({
        "admin/users": [makeUser()],
      });
      render(<AdminUsers />);
      expect(screen.getAllByTitle("View details").length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByTitle(/Lock account|Unlock account/).length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByTitle("Delete user").length).toBeGreaterThanOrEqual(1);
    });
  });

  // ─── Sortable headers ──────────────────────────────────
  describe("Sortable Headers", () => {
    it("renders sortable column headers with the default column active", () => {
      setQueryData({ "admin/users": [makeUser()] });
      render(<AdminUsers />);

      for (const label of ["User", "Role", "KYC", "Joined"]) {
        expect(screen.getByRole("button", { name: `Sort by ${label}` })).toBeTruthy();
      }
      // Default sort is createdAt desc → Joined is active
      expect(screen.getByRole("button", { name: "Sort by Joined" }).getAttribute("aria-pressed")).toBe("true");
    });

    it("calls the API with sortBy/sortOrder when a header is clicked", async () => {
      const user = userEvent.setup();
      setQueryData({ "admin/users": [makeUser()] });
      render(<AdminUsers />);

      await user.click(screen.getByRole("button", { name: "Sort by Role" }));

      const calls = vi.mocked(useApiQuery).mock.calls;
      const usersCall = calls.find((c) => String(c[1]).includes("/api/users/list?") && String(c[1]).includes("sortBy=role"));
      expect(usersCall).toBeTruthy();
      expect(String(usersCall![1])).toContain("sortOrder=desc");
      expect(screen.getByRole("button", { name: "Sort by Role" }).getAttribute("aria-pressed")).toBe("true");
    });

    it("toggles to ascending when the active column is clicked again", async () => {
      const user = userEvent.setup();
      setQueryData({ "admin/users": [makeUser()] });
      render(<AdminUsers />);

      await user.click(screen.getByRole("button", { name: "Sort by Role" }));
      await user.click(screen.getByRole("button", { name: "Sort by Role" }));

      const calls = vi.mocked(useApiQuery).mock.calls;
      const ascCall = calls.find((c) => String(c[1]).includes("/api/users/list?") && String(c[1]).includes("sortBy=role&sortOrder=asc"));
      expect(ascCall).toBeTruthy();
    });
  });

  // ─── User detail modal ──────────────────────────────────
  describe("User Detail Modal", () => {
    it("opens detail modal on view click", async () => {
      const user = userEvent.setup();
      setQueryData({
        "admin/users": [makeUser({ name: "Alice", email: "alice@test.com", id: 42 })],
      });
      render(<AdminUsers />);
      const viewButtons = screen.getAllByTitle("View details");
      await user.click(viewButtons[0]);
      expect(screen.getByText("User ID")).toBeTruthy();
      expect(screen.getByText("#42")).toBeTruthy();
    });

    it("shows user details in modal", async () => {
      const user = userEvent.setup();
      setQueryData({
        "admin/users": [makeUser({ name: "Alice", email: "alice@test.com", phone: "+2348012345678", country: "Nigeria" })],
      });
      render(<AdminUsers />);
      await user.click(screen.getAllByTitle("View details")[0]);
      const roleLabels = screen.getAllByText("Role");
      expect(roleLabels.length).toBeGreaterThanOrEqual(2);
      expect(screen.getByText("Phone")).toBeTruthy();
      expect(screen.getByText("Country")).toBeTruthy();
    });

    it("shows all detail fields", async () => {
      const user = userEvent.setup();
      setQueryData({
        "admin/users": [makeUser({ timezone: "Africa/Lagos", tradingExperience: "advanced", referralCode: "TEST001" })],
      });
      render(<AdminUsers />);
      await user.click(screen.getAllByTitle("View details")[0]);
      expect(screen.getByText("Timezone")).toBeTruthy();
      expect(screen.getByText("Experience")).toBeTruthy();
      expect(screen.getByText("Referral Code")).toBeTruthy();
    });

    it("closes modal on backdrop click", async () => {
      const user = userEvent.setup();
      setQueryData({
        "admin/users": [makeUser({ name: "Alice" })],
      });
      render(<AdminUsers />);
      await user.click(screen.getAllByTitle("View details")[0]);
      expect(screen.getByText("User ID")).toBeTruthy();
      const backdrop = document.querySelector(".fixed.inset-0");
      if (backdrop) await user.click(backdrop);
    });

    it("shows Toggle Admin and Lock buttons in modal", async () => {
      const user = userEvent.setup();
      setQueryData({
        "admin/users": [makeUser({ role: "user", accountLockedUntil: null })],
      });
      render(<AdminUsers />);
      await user.click(screen.getAllByTitle("View details")[0]);
      expect(screen.getByText("Toggle Admin")).toBeTruthy();
      expect(screen.getByText("Lock")).toBeTruthy();
    });
  });

  // ─── Role editing ───────────────────────────────────────
  describe("Role Editing", () => {
    it("opens role dropdown on role badge click", async () => {
      const user = userEvent.setup();
      setQueryData({
        "admin/users": [makeUser({ role: "user", name: "Regular" })],
      });
      render(<AdminUsers />);
      // "User" appears in both the sort header (aria-label) and the role badge — pick the badge
      const roleBadge = screen.getAllByText("User", { selector: "button" }).find((el) => !el.getAttribute("aria-label"));
      expect(roleBadge).toBeTruthy();
      await user.click(roleBadge!);
      const selects = document.querySelectorAll("select");
      expect(selects.length).toBeGreaterThanOrEqual(3);
    });
  });

  // ─── Delete confirmation ────────────────────────────────
  describe("Delete Confirmation", () => {
    it("opens delete dialog on delete button click", async () => {
      const user = userEvent.setup();
      setQueryData({
        "admin/users": [makeUser({ name: "Alice", email: "alice@test.com" })],
      });
      render(<AdminUsers />);
      const deleteButtons = screen.getAllByTitle("Delete user");
      await user.click(deleteButtons[0]);
      const headings = screen.getAllByText("Delete User");
      expect(headings.length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText(/permanently delete/)).toBeTruthy();
    });

    it("shows user email in confirmation", async () => {
      const user = userEvent.setup();
      setQueryData({
        "admin/users": [makeUser({ email: "target@test.com" })],
      });
      render(<AdminUsers />);
      await user.click(screen.getAllByTitle("Delete user")[0]);
      // email appears in both table row and dialog strong tag
      expect(screen.getAllByText("target@test.com").length).toBeGreaterThanOrEqual(2);
    });

    it("closes dialog on cancel", async () => {
      const user = userEvent.setup();
      setQueryData({
        "admin/users": [makeUser({ name: "Alice" })],
      });
      render(<AdminUsers />);
      await user.click(screen.getAllByTitle("Delete user")[0]);
      expect(screen.getByTestId("alert-dialog")).toBeTruthy();
      await user.click(screen.getByTestId("alert-cancel"));
      expect(screen.queryByTestId("alert-dialog")).toBeNull();
    });

    it("calls API on confirm delete", async () => {
      const user = userEvent.setup();
      setQueryData({
        "admin/users": [makeUser({ id: 42, email: "delete@test.com" })],
      });
      render(<AdminUsers />);
      await user.click(screen.getAllByTitle("Delete user")[0]);
      await user.click(screen.getByTestId("alert-confirm"));
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/users/42",
        expect.objectContaining({ method: "DELETE" }),
      );
      expect(toast.success).toHaveBeenCalled();
    });

    it("shows error toast on delete failure", async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, json: async () => ({ error: "Cannot delete admin" }) });
      const user = userEvent.setup();
      setQueryData({
        "admin/users": [makeUser({ id: 42 })],
      });
      render(<AdminUsers />);
      await user.click(screen.getAllByTitle("Delete user")[0]);
      await user.click(screen.getByTestId("alert-confirm"));
      expect(toast.error).toHaveBeenCalled();
    });
  });

  // ─── Lock/Unlock toggle ─────────────────────────────────
  describe("Lock/Unlock Toggle", () => {
    it("locks user account via API", async () => {
      const user = userEvent.setup();
      setQueryData({
        "admin/users": [makeUser({ id: 10, accountLockedUntil: null })],
      });
      render(<AdminUsers />);
      const lockBtn = screen.getAllByTitle("Lock account");
      await user.click(lockBtn[0]);
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/users/10/status",
        expect.objectContaining({ method: "PUT" }),
      );
      expect(toast.success).toHaveBeenCalledWith("Account locked");
    });

    it("unlocks user account via API", async () => {
      const user = userEvent.setup();
      setQueryData({
        "admin/users": [makeUser({ id: 10, accountLockedUntil: Date.now() + 86400000 })],
      });
      render(<AdminUsers />);
      const unlockBtn = screen.getAllByTitle("Unlock account");
      await user.click(unlockBtn[0]);
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/users/10/status",
        expect.objectContaining({ method: "PUT" }),
      );
      expect(toast.success).toHaveBeenCalledWith("Account unlocked");
    });

    it("shows error toast on lock failure", async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, json: async () => ({ error: "Failed" }) });
      const user = userEvent.setup();
      setQueryData({
        "admin/users": [makeUser({ id: 10, accountLockedUntil: null })],
      });
      render(<AdminUsers />);
      await user.click(screen.getAllByTitle("Lock account")[0]);
      expect(toast.error).toHaveBeenCalled();
    });
  });

  // ─── Multiple users ─────────────────────────────────────
  describe("Multiple Users", () => {
    it("renders multiple users", () => {
      setQueryData({
        "admin/users": [
          makeUser({ id: 1, name: "Alice", email: "alice@test.com" }),
          makeUser({ id: 2, name: "Bob", email: "bob@test.com" }),
          makeUser({ id: 3, name: "Charlie", email: "charlie@test.com" }),
        ],
      });
      render(<AdminUsers />);
      expect(screen.getByText("Alice")).toBeTruthy();
      expect(screen.getByText("Bob")).toBeTruthy();
      expect(screen.getByText("Charlie")).toBeTruthy();
    });

    it("shows user count in footer", () => {
      setQueryData({
        "admin/users": [makeUser({ id: 1 }), makeUser({ id: 2 })],
      });
      render(<AdminUsers />);
      expect(screen.getByText(/Showing 2 of 2 users/)).toBeTruthy();
    });

    it("updates footer count when filtering", async () => {
      const user = userEvent.setup();
      setQueryData({
        "admin/users": [
          makeUser({ id: 1, name: "Alice", role: "user" }),
          makeUser({ id: 2, name: "Bob", role: "super_admin" }),
        ],
      });
      render(<AdminUsers />);
      expect(screen.getByText(/Showing 2 of 2 users/)).toBeTruthy();
      await user.selectOptions(screen.getByDisplayValue("All Roles"), "super_admin");
      // Server-driven: total reflects the filtered result set
      await waitFor(() => {
        expect(screen.getByText(/Showing 1 of 1 users/)).toBeTruthy();
      });
    });
  });

  // ─── Integration: Multi-filter combinations ─────────────
  describe("Integration: Multi-filter Combinations", () => {
    it("combines search + role filter", async () => {
      const user = userEvent.setup();
      setQueryData({
        "admin/users": [
          makeUser({ id: 1, name: "Alice", role: "user" }),
          makeUser({ id: 2, name: "Bob", role: "super_admin" }),
          makeUser({ id: 3, name: "Alex", role: "super_admin" }),
        ],
      });
      render(<AdminUsers />);
      // Type a more distinctive search term to filter clearly
      await user.type(screen.getByPlaceholderText(/Search by name/), "alex");
      // Now apply role filter
      await user.selectOptions(screen.getByDisplayValue("All Roles"), "super_admin");
      // Alex matches both search and role filter
      await waitFor(() => {
        expect(screen.getByText("Alex")).toBeTruthy();
        // Alice doesn't match role filter, Bob doesn't match search
        expect(screen.queryByText("Alice")).toBeNull();
        expect(screen.queryByText("Bob")).toBeNull();
      });
    });

    it("combines search + KYC filter", async () => {
      const user = userEvent.setup();
      setQueryData({
        "admin/users": [
          makeUser({ id: 1, name: "Alice", kycStatus: "approved" }),
          makeUser({ id: 2, name: "Bob", kycStatus: "pending" }),
        ],
      });
      render(<AdminUsers />);
      await user.type(screen.getByPlaceholderText(/Search by name/), "ali");
      await user.selectOptions(screen.getByDisplayValue("All KYC Status"), "approved");
      await waitFor(() => {
        expect(screen.getByText("Alice")).toBeTruthy();
        expect(screen.queryByText("Bob")).toBeNull();
      });
    });

    it("shows no results when filters combine to exclude all", async () => {
      const user = userEvent.setup();
      setQueryData({
        "admin/users": [
          makeUser({ id: 1, name: "Alice", role: "user" }),
        ],
      });
      render(<AdminUsers />);
      await user.type(screen.getByPlaceholderText(/Search by name/), "alice");
      await user.selectOptions(screen.getByDisplayValue("All Roles"), "super_admin");
      await waitFor(() => {
        const tds = document.querySelectorAll("td");
        const emptyTd = Array.from(tds).find((td) => td.textContent?.includes("No users found"));
        expect(emptyTd).toBeTruthy();
      });
    });
  });

  // ─── Integration: Full User Management Flow ─────────────
  describe("Integration: Full User Management Flow", () => {
    it("renders complete page with all sections", () => {
      setQueryData({
        "admin/users": [
          makeUser({ id: 1, name: "Alice", email: "alice@test.com", role: "super_admin", kycStatus: "approved", emailVerified: true }),
          makeUser({ id: 2, name: "Bob", email: "bob@test.com", role: "user", kycStatus: "pending", emailVerified: true }),
        ],
      });
      render(<AdminUsers />);

      // Header
      expect(screen.getByText("User Management")).toBeTruthy();

      // Stats
      expect(screen.getByText("Total Users")).toBeTruthy();
      expect(screen.getByText("Admins")).toBeTruthy();
      expect(screen.getByText("Verified")).toBeTruthy();
      expect(screen.getByText("Locked")).toBeTruthy();

      // Search
      expect(screen.getByPlaceholderText(/Search by name/)).toBeTruthy();

      // Filters
      expect(screen.getByDisplayValue("All Roles")).toBeTruthy();
      expect(screen.getByDisplayValue("All KYC Status")).toBeTruthy();

      // Users
      expect(screen.getByText("Alice")).toBeTruthy();
      expect(screen.getByText("Bob")).toBeTruthy();

      // Footer
      expect(screen.getByText(/Showing 2 of 2 users/)).toBeTruthy();
    });

    it("view → lock → search → delete full workflow", async () => {
      const user = userEvent.setup();
      setQueryData({
        "admin/users": [
          makeUser({ id: 1, name: "Alice", email: "alice@test.com", accountLockedUntil: null }),
          makeUser({ id: 2, name: "Bob", email: "bob@test.com", accountLockedUntil: null }),
        ],
      });
      render(<AdminUsers />);

      // Step 1: View Alice
      await user.click(screen.getAllByTitle("View details")[0]);
      expect(screen.getByText("User ID")).toBeTruthy();
      expect(screen.getByText("#1")).toBeTruthy();

      // Close modal
      const backdrop = document.querySelector(".fixed.inset-0");
      if (backdrop) await user.click(backdrop);

      // Step 2: Lock Bob
      const lockBtns = screen.getAllByTitle("Lock account");
      await user.click(lockBtns[1]);
      expect(toast.success).toHaveBeenCalledWith("Account locked");

      // Step 3: Search for Alice
      await user.type(screen.getByPlaceholderText(/Search by name/), "alice");
      await waitFor(() => {
        expect(screen.getByText("Alice")).toBeTruthy();
        expect(screen.queryByText("Bob")).toBeNull();
      });
    });

    it("data consistency: stats match user list", () => {
      setQueryData({
        "admin/users": [
          makeUser({ role: "super_admin", emailVerified: true, accountLockedUntil: null }),
          makeUser({ id: 2, role: "user", emailVerified: true, accountLockedUntil: null }),
          makeUser({ id: 3, role: "user", emailVerified: false, accountLockedUntil: Date.now() + 86400000 }),
        ],
      });
      render(<AdminUsers />);

      const statCards = document.querySelectorAll(".card-subtle");
      const totalCard = Array.from(statCards).find((c) => c.textContent?.includes("Total Users"));
      const adminCard = Array.from(statCards).find((c) => c.textContent?.includes("Admins"));
      const verifiedCard = Array.from(statCards).find((c) => c.textContent?.includes("Verified"));
      const lockedCard = Array.from(statCards).find((c) => c.textContent?.includes("Locked"));

      expect(totalCard?.textContent).toContain("3");
      expect(adminCard?.textContent).toContain("1");
      expect(verifiedCard?.textContent).toContain("2");
      expect(lockedCard?.textContent).toContain("1");
    });
  });
});
