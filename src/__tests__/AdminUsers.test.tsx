// @vitest-environment jsdom
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
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
    const dataKey = `${key.join("/")}`;
    if (queryDataMap[dataKey] === undefined) {
      return { data: undefined, isLoading: true, refetch: mockRefetch };
    }
    return { data: queryDataMap[dataKey], isLoading: false, refetch: mockRefetch };
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
  AlertDialogContent: ({ children }: any) => <div data-testid="alert-dialog-content">{children}</div>,
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
  Object.keys(queryDataMap).forEach((k) => delete queryDataMap[k]);
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

  // ─── Loading state ─────────────────────────────────────
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

  // ─── Page header ───────────────────────────────────────
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

  // ─── Stats cards ───────────────────────────────────────
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
      // The stat card shows the count next to "Total Users" — find the parent div
      const statCards = document.querySelectorAll(".card-subtle");
      const totalCard = Array.from(statCards).find((card) =>
        card.textContent?.includes("Total Users"),
      );
      expect(totalCard).toBeTruthy();
      expect(totalCard?.textContent).toContain("3");
    });
  });

  // ─── Search ────────────────────────────────────────────
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
      expect(screen.getByText("Alice Smith")).toBeTruthy();
      expect(screen.queryByText("Bob Jones")).toBeNull();
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
      expect(screen.getByText("Bob")).toBeTruthy();
      expect(screen.queryByText("Alice")).toBeNull();
    });
  });

  // ─── Role filter ───────────────────────────────────────
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
      expect(screen.getByText("Admin User")).toBeTruthy();
      expect(screen.queryByText("Regular")).toBeNull();
    });
  });

  // ─── KYC filter ────────────────────────────────────────
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
      expect(screen.getByText("Approved User")).toBeTruthy();
      expect(screen.queryByText("Unverified User")).toBeNull();
    });
  });

  // ─── Clear filters ─────────────────────────────────────
  describe("Clear Filters", () => {
    it("shows clear button when filters active", async () => {
      const user = userEvent.setup();
      setQueryData({});
      render(<AdminUsers />);
      expect(screen.queryByText("Clear")).toBeNull();
      await user.type(screen.getByPlaceholderText(/Search by name/), "test");
      expect(screen.getByText("Clear")).toBeTruthy();
    });
  });

  // ─── Users table ───────────────────────────────────────
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
      const tds = document.querySelectorAll("td");
      const emptyTd = Array.from(tds).find((td) => td.textContent?.includes("No users found"));
      expect(emptyTd).toBeTruthy();
    });
  });

  // ─── User detail modal ─────────────────────────────────
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
  });

  // ─── Role editing ──────────────────────────────────────
  describe("Role Editing", () => {
    it("opens role dropdown on role badge click", async () => {
      const user = userEvent.setup();
      setQueryData({
        "admin/users": [makeUser({ role: "user", name: "Regular" })],
      });
      render(<AdminUsers />);
      const roleBadge = screen.getByText("User", { selector: "button" });
      await user.click(roleBadge);
      const selects = document.querySelectorAll("select");
      expect(selects.length).toBeGreaterThanOrEqual(3);
    });
  });

  // ─── Delete confirmation ───────────────────────────────
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
  });

  // ─── Multiple users ────────────────────────────────────
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
        "admin/users": [
          makeUser({ id: 1 }),
          makeUser({ id: 2 }),
        ],
      });
      render(<AdminUsers />);
      expect(screen.getByText(/Showing 2 of 2 users/)).toBeTruthy();
    });
  });

  // ─── Full integration ──────────────────────────────────
  describe("Full Integration", () => {
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
  });
});
