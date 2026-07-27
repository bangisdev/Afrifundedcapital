// @vitest-environment jsdom
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/hooks/use-auth", () => ({
  useAuth: vi.fn(() => ({ isLoading: false, isAuthenticated: true, user: { id: 1, role: "super_admin" }, error: null, signIn: vi.fn(), signOut: vi.fn(), refetch: vi.fn() })),
}));

const queryDataMap: Record<string, any> = {};
vi.mock("@/hooks/use-api", () => ({
  useApiQuery: vi.fn((key: string[]) => {
    const dataKey = `${key.join("/")}`;
    if (queryDataMap[dataKey] === undefined) return { data: undefined, isLoading: true, refetch: vi.fn() };
    return { data: queryDataMap[dataKey], isLoading: false, refetch: vi.fn() };
  }),
  useApiMutation: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
}));

import AdminSupport from "@/pages/admin/AdminSupport";
import { toast } from "sonner";

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

  describe("Full Integration", () => {
    it("renders complete page", () => {
      setQueryData({}); render(<AdminSupport />);
      expect(screen.getByText("Support Tickets")).toBeTruthy();
      expect(screen.getByText("Total")).toBeTruthy();
    });
  });
});
