// @vitest-environment jsdom
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { useApiQuery } from "@/hooks/use-api";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/hooks/use-auth", () => ({
  useAuth: vi.fn(() => ({ isLoading: false, isAuthenticated: true, user: { id: 1, role: "super_admin" }, error: null, signIn: vi.fn(), signOut: vi.fn(), refetch: vi.fn() })),
}));

const queryDataMap: Record<string, any> = {};
vi.mock("@/hooks/use-api", () => ({
  useApiQuery: vi.fn((key: string[], path?: string) => {
    // Server-aware pagination: the support list endpoint returns a paginated envelope
    if (path && path.startsWith("/api/support/admin/all")) {
      const base = queryDataMap["admin/tickets"];
      if (base === undefined) return { data: undefined, isLoading: true, refetch: vi.fn() };
      const url = new URL(path, "http://localhost");
      const search = (url.searchParams.get("search") || "").toLowerCase();
      const status = url.searchParams.get("status") || "all";
      const priority = url.searchParams.get("priority") || "all";
      const page = parseInt(url.searchParams.get("page") || "1", 10);
      const pageSize = parseInt(url.searchParams.get("pageSize") || "10", 10);
      const items = base.filter((t: any) => {
        if (status !== "all" && t.status !== status) return false;
        if (priority !== "all" && t.priority !== priority) return false;
        if (search) {
          const hay = `${t.subject || ""} ${t.category || ""} ${t.userName || ""} ${t.userEmail || ""} ${t.id || ""}`.toLowerCase();
          if (!hay.includes(search)) return false;
        }
        return true;
      });
      const total = items.length;
      const totalPages = Math.max(1, Math.ceil(total / pageSize));
      const start = (page - 1) * pageSize;
      const tickets = items.slice(start, start + pageSize);
      const stats = {
        total,
        open: items.filter((t: any) => t.status === "open").length,
        pending: items.filter((t: any) => t.status === "pending").length,
        resolved: items.filter((t: any) => t.status === "resolved").length,
      };
      return { data: { tickets, total, page, pageSize, totalPages, stats }, isLoading: false, refetch: vi.fn() };
    }
    const dataKey = `${key.join("/")}`;
    if (queryDataMap[dataKey] === undefined) return { data: undefined, isLoading: true, refetch: vi.fn() };
    return { data: queryDataMap[dataKey], isLoading: false, refetch: vi.fn() };
  }),
  useApiMutation: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
}));

import AdminSupport from "@/pages/admin/AdminSupport";

function clearAll() { Object.keys(queryDataMap).forEach((k) => delete queryDataMap[k]); }
function setQueryData(updates: Record<string, any>) { clearAll(); Object.assign(queryDataMap, { "admin/tickets": [], "admin/briefUsers": [], ...updates }); }

describe("AdminSupport Page", () => {
  beforeEach(() => { clearAll(); vi.clearAllMocks(); });

  describe("Loading State", () => {
    it("shows spinner when loading", () => { clearAll(); const { container } = render(<AdminSupport />); expect(container.querySelector(".animate-spin")).toBeTruthy(); });
  });

  describe("Page Header", () => {
    it("renders title", () => { setQueryData({}); render(<AdminSupport />); expect(screen.getByText("Support Tickets")).toBeTruthy(); });
  });

  describe("Stats Cards", () => {
    it("renders all four stat cards", () => {
      setQueryData({}); render(<AdminSupport />);
      // "Total" appears in stats and ticket count footer
      expect(screen.getByText("Total")).toBeTruthy();
      // "Open" and "Pending" appear in stat cards and filter dropdown
      expect(screen.getAllByText("Open").length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText("Pending").length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText("Resolved").length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("Ticket List", () => {
    it("shows tickets with status badges", () => {
      setQueryData({ "admin/tickets": [
        { id: 1, subject: "Payment issue", status: "open", priority: "high", userId: 1, category: "payments", createdAt: Date.now() },
      ]}); render(<AdminSupport />);
      expect(screen.getByText("Payment issue")).toBeTruthy();
      // "High" appears in both filter dropdown and ticket badge
      expect(screen.getAllByText("High").length).toBeGreaterThanOrEqual(1);
    });
    it("shows empty state", () => {
      setQueryData({ "admin/tickets": [] }); render(<AdminSupport />);
      expect(screen.getByText("No tickets found")).toBeTruthy();
    });
    it("filters by status", async () => {
      const user = userEvent.setup();
      setQueryData({ "admin/tickets": [
        { id: 1, subject: "Open ticket", status: "open", priority: "low", userId: 1, category: "general", createdAt: Date.now() },
        { id: 2, subject: "Resolved ticket", status: "resolved", priority: "low", userId: 2, category: "general", createdAt: Date.now() },
      ]}); render(<AdminSupport />);
      await user.selectOptions(screen.getByDisplayValue("All Status"), "open");
      expect(screen.getByText("Open ticket")).toBeTruthy();
      expect(screen.queryByText("Resolved ticket")).toBeNull();
    });
  });

  describe("Sortable Headers", () => {
    it("renders sortable column headers with the default column active", () => {
      setQueryData({ "admin/tickets": [
        { id: 1, subject: "Payment issue", status: "open", priority: "high", userId: 1, category: "payments", createdAt: Date.now() },
      ]}); render(<AdminSupport />);

      for (const label of ["ID", "Subject", "Priority", "Status", "Created"]) {
        expect(screen.getByRole("button", { name: `Sort by ${label}` })).toBeTruthy();
      }
      // Default sort is createdAt desc → Created is active
      expect(screen.getByRole("button", { name: "Sort by Created" }).getAttribute("aria-pressed")).toBe("true");
    });

    it("calls the API with sortBy/sortOrder when a header is clicked", async () => {
      const user = userEvent.setup();
      setQueryData({ "admin/tickets": [
        { id: 1, subject: "Payment issue", status: "open", priority: "high", userId: 1, category: "payments", createdAt: Date.now() },
      ]}); render(<AdminSupport />);

      await user.click(screen.getByRole("button", { name: "Sort by Priority" }));

      const calls = vi.mocked(useApiQuery).mock.calls;
      const ticketsCall = calls.find((c) => String(c[1]).includes("/api/support/admin/all?") && String(c[1]).includes("sortBy=priority"));
      expect(ticketsCall).toBeTruthy();
      expect(String(ticketsCall![1])).toContain("sortOrder=desc");
      expect(screen.getByRole("button", { name: "Sort by Priority" }).getAttribute("aria-pressed")).toBe("true");
    });

    it("toggles to ascending when the active column is clicked again", async () => {
      const user = userEvent.setup();
      setQueryData({ "admin/tickets": [
        { id: 1, subject: "Payment issue", status: "open", priority: "high", userId: 1, category: "payments", createdAt: Date.now() },
      ]}); render(<AdminSupport />);

      await user.click(screen.getByRole("button", { name: "Sort by Priority" }));
      await user.click(screen.getByRole("button", { name: "Sort by Priority" }));

      const calls = vi.mocked(useApiQuery).mock.calls;
      const ascCall = calls.find((c) => String(c[1]).includes("/api/support/admin/all?") && String(c[1]).includes("sortBy=priority&sortOrder=asc"));
      expect(ascCall).toBeTruthy();
    });
  });

  describe("Full Integration", () => {
    it("renders complete page", () => {
      setQueryData({}); render(<AdminSupport />);
      expect(screen.getByText("Support Tickets")).toBeTruthy();
      expect(screen.getByText("Total")).toBeTruthy();
    });
  });
});
