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
    const joined = `${key.join("/")}`;
    // Server-aware pagination: list key looks like admin/payments/api/payments/admin/all?page=1&pageSize=10
    const listMatch = joined.match(/^admin\/payments\/api\/payments\/admin\/all\?(.*)$/);
    if (listMatch) {
      const base = queryDataMap["admin/payments"];
      if (base === undefined) return { data: undefined, isLoading: true, refetch: vi.fn() };
      const qp = new URLSearchParams(listMatch[1]);
      const search = (qp.get("search") || "").toLowerCase();
      const status = qp.get("status") || "all";
      const provider = qp.get("provider") || "all";
      const page = parseInt(qp.get("page") || "1", 10);
      const pageSize = parseInt(qp.get("pageSize") || "10", 10);
      const items = base.filter((p: any) => {
        if (status !== "all" && p.status !== status) return false;
        if (provider !== "all" && p.provider !== provider) return false;
        if (search) {
          const hay = `${p.reference || ""} ${p.userName || ""} ${p.userEmail || ""} ${p.description || ""} ${p.amount || ""}`.toLowerCase();
          if (!hay.includes(search)) return false;
        }
        return true;
      });
      const total = items.length;
      const totalPages = Math.max(1, Math.ceil(total / pageSize));
      const start = (page - 1) * pageSize;
      const payments = items.slice(start, start + pageSize);
      const stats = {
        total,
        completed: items.filter((p: any) => p.status === "completed").length,
        pending: items.filter((p: any) => p.status === "pending").length,
        failed: items.filter((p: any) => p.status === "failed").length,
        refunded: items.filter((p: any) => p.status === "refunded").length,
        revenue: items.reduce((s: number, p: any) => s + (p.status === "completed" ? p.amount || 0 : 0), 0),
      };
      return { data: { payments, total, page, pageSize, totalPages, stats }, isLoading: false, refetch: vi.fn() };
    }
    const dataKey = joined;
    if (queryDataMap[dataKey] === undefined) return { data: undefined, isLoading: true, refetch: vi.fn() };
    return { data: queryDataMap[dataKey], isLoading: false, refetch: vi.fn() };
  }),
  useApiMutation: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
}));

vi.mock("@/components/ui/alert-dialog", () => ({
  AlertDialog: ({ open, onOpenChange, children }: any) => { if (!open) return null; return <div data-testid="alert-dialog">{children}</div>; },
  AlertDialogContent: ({ children }: any) => <div>{children}</div>,
  AlertDialogHeader: ({ children }: any) => <div>{children}</div>,
  AlertDialogTitle: ({ children }: any) => <h2>{children}</h2>,
  AlertDialogDescription: ({ children }: any) => <p>{children}</p>,
  AlertDialogFooter: ({ children }: any) => <div>{children}</div>,
  AlertDialogCancel: ({ children }: any) => <button data-testid="alert-cancel">{children}</button>,
  AlertDialogAction: ({ children, onClick }: any) => <button data-testid="alert-confirm" onClick={onClick}>{children}</button>,
}));

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import AdminPayments from "@/pages/admin/AdminPayments";
import { toast } from "sonner";

function clearAll() { Object.keys(queryDataMap).forEach((k) => delete queryDataMap[k]); }
function setQueryData(updates: Record<string, any>) { clearAll(); Object.assign(queryDataMap, { "admin/payments": [], "admin/paymentStats": null, "admin/revenueGrowth": null, ...updates }); }

describe("AdminPayments Page", () => {
  beforeEach(() => { clearAll(); vi.clearAllMocks(); mockFetch.mockResolvedValue({ ok: true, json: async () => ({ message: "ok" }) }); });

  describe("Loading State", () => {
    it("shows spinner when loading", () => { clearAll(); const { container } = render(<AdminPayments />); expect(container.querySelector(".animate-spin")).toBeTruthy(); });
    it("hides spinner when loaded", () => { setQueryData({}); const { container } = render(<AdminPayments />); expect(container.querySelector(".animate-spin")).toBeNull(); });
  });

  describe("Page Header", () => {
    it("renders title", () => { setQueryData({}); render(<AdminPayments />); expect(screen.getByText("Payments")).toBeTruthy(); });
    it("renders Refresh button", () => { setQueryData({}); render(<AdminPayments />); expect(screen.getByText("Refresh")).toBeTruthy(); });
  });

  describe("Stats Cards", () => {
    it("renders all four stat cards", () => {
      setQueryData({}); render(<AdminPayments />);
      expect(screen.getByText("Total Revenue")).toBeTruthy();
      expect(screen.getByText("Total Transactions")).toBeTruthy();
      expect(screen.getByText("This Month")).toBeTruthy();
      expect(screen.getByText("Last Month")).toBeTruthy();
    });
  });

  describe("Transactions Tab", () => {
    it("shows transaction list with data", () => {
      setQueryData({ "admin/payments": [
        { id: 1, reference: "FLW-001", amount: 50000, status: "completed", provider: "flutterwave", userId: 1, createdAt: Date.now() - 3600000 },
      ]}); render(<AdminPayments />);
      expect(screen.getByText("FLW-001")).toBeTruthy();
      // Amount appears in both stat card and table — use getAllByText
      const amounts = screen.getAllByText((t) => t.includes("50,000"));
      expect(amounts.length).toBeGreaterThanOrEqual(2);
    });
    it("shows Completed badge for completed payments", () => {
      setQueryData({ "admin/payments": [
        { id: 1, reference: "FLW-001", amount: 50000, status: "completed", provider: "flutterwave", userId: 1, createdAt: Date.now() },
      ]}); render(<AdminPayments />);
      // "Completed" appears in both the filter dropdown option and the status badge
      const completedElements = screen.getAllByText("Completed");
      expect(completedElements.length).toBeGreaterThanOrEqual(2);
    });
    it("shows Refund button for completed payments", () => {
      setQueryData({ "admin/payments": [
        { id: 1, reference: "FLW-001", amount: 50000, status: "completed", provider: "flutterwave", userId: 1, createdAt: Date.now() },
      ]}); render(<AdminPayments />);
      expect(screen.getByText("Refund")).toBeTruthy();
    });
    it("shows empty state when no payments", () => {
      setQueryData({ "admin/payments": [] }); render(<AdminPayments />);
      expect(screen.getByText("No transactions found")).toBeTruthy();
    });
    it("filters by status", async () => {
      const user = userEvent.setup();
      setQueryData({ "admin/payments": [
        { id: 1, reference: "FLW-001", amount: 50000, status: "completed", provider: "flutterwave", userId: 1, createdAt: Date.now() },
        { id: 2, reference: "FLW-002", amount: 30000, status: "failed", provider: "flutterwave", userId: 2, createdAt: Date.now() },
      ]}); render(<AdminPayments />);
      await user.selectOptions(screen.getByDisplayValue("All Status"), "completed");
      expect(screen.getByText("FLW-001")).toBeTruthy();
      expect(screen.queryByText("FLW-002")).toBeNull();
    });
    it("searches by reference", async () => {
      const user = userEvent.setup();
      setQueryData({ "admin/payments": [
        { id: 1, reference: "FLW-001", amount: 50000, status: "completed", provider: "flutterwave", userId: 1, createdAt: Date.now() },
        { id: 2, reference: "PSK-002", amount: 30000, status: "completed", provider: "paystack", userId: 2, createdAt: Date.now() },
      ]}); render(<AdminPayments />);
      await user.type(screen.getByPlaceholderText(/Search by reference/), "FLW");
      // Search is debounced (300ms) — wait for the query to re-run and filter
      await waitFor(() => {
        expect(screen.getByText("FLW-001")).toBeTruthy();
        expect(screen.queryByText("PSK-002")).toBeNull();
      });
    });
  });

  describe("Analytics Tab", () => {
    it("switches to analytics tab", async () => {
      const user = userEvent.setup();
      setQueryData({}); render(<AdminPayments />);
      await user.click(screen.getByText("Analytics"));
      expect(screen.getByText("Payment Status Breakdown")).toBeTruthy();
    });
    it("shows revenue summary in analytics", async () => {
      const user = userEvent.setup();
      setQueryData({}); render(<AdminPayments />);
      await user.click(screen.getByText("Analytics"));
      // "Total Revenue" appears in both stat cards and analytics tab
      const revenueElements = screen.getAllByText("Total Revenue");
      expect(revenueElements.length).toBeGreaterThanOrEqual(2);
      expect(screen.getByText("Monthly Comparison")).toBeTruthy();
    });
  });

  describe("Full Integration", () => {
    it("renders complete page with all sections", () => {
      setQueryData({}); render(<AdminPayments />);
      expect(screen.getByText("Payments")).toBeTruthy();
      expect(screen.getByText("Transactions")).toBeTruthy();
      expect(screen.getByText("Analytics")).toBeTruthy();
    });
  });
});
