// @vitest-environment jsdom
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
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
    // Server-aware pagination: the payments list endpoint returns a paginated envelope
    if (path && path.startsWith("/api/payments/admin/all")) {
      const base = queryDataMap["admin/payments"];
      if (base === undefined) return { data: undefined, isLoading: true, refetch: vi.fn() };
      const url = new URL(path, "http://localhost");
      const search = (url.searchParams.get("search") || "").toLowerCase();
      const status = url.searchParams.get("status") || "all";
      const provider = url.searchParams.get("provider") || "all";
      const page = parseInt(url.searchParams.get("page") || "1", 10);
      const pageSize = parseInt(url.searchParams.get("pageSize") || "10", 10);
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
    const dataKey = `${key.join("/")}`;
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

// ─── Mock: react-router (audit trail deep links) ────────
vi.mock("react-router", () => ({
  Link: ({ to, children, ...rest }: any) => <a href={to} {...rest}>{children}</a>,
}));

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

  describe("Sortable Headers", () => {
    it("renders sortable column headers with the default column active", () => {
      setQueryData({ "admin/payments": [
        { id: 1, reference: "FLW-001", amount: 50000, status: "completed", provider: "flutterwave", userId: 1, createdAt: Date.now() },
      ]}); render(<AdminPayments />);

      for (const label of ["Reference", "Amount", "Provider", "Status", "Date"]) {
        expect(screen.getByRole("button", { name: `Sort by ${label}` })).toBeTruthy();
      }
      // Default sort is createdAt desc → Date is active
      expect(screen.getByRole("button", { name: "Sort by Date" }).getAttribute("aria-pressed")).toBe("true");
    });

    it("calls the API with sortBy/sortOrder when a header is clicked", async () => {
      const user = userEvent.setup();
      setQueryData({ "admin/payments": [
        { id: 1, reference: "FLW-001", amount: 50000, status: "completed", provider: "flutterwave", userId: 1, createdAt: Date.now() },
      ]}); render(<AdminPayments />);

      await user.click(screen.getByRole("button", { name: "Sort by Amount" }));

      const calls = vi.mocked(useApiQuery).mock.calls;
      const paymentsCall = calls.find((c) => String(c[1]).includes("/api/payments/admin/all?") && String(c[1]).includes("sortBy=amount"));
      expect(paymentsCall).toBeTruthy();
      expect(String(paymentsCall![1])).toContain("sortOrder=desc");
      expect(screen.getByRole("button", { name: "Sort by Amount" }).getAttribute("aria-pressed")).toBe("true");
    });

    it("toggles to ascending when the active column is clicked again", async () => {
      const user = userEvent.setup();
      setQueryData({ "admin/payments": [
        { id: 1, reference: "FLW-001", amount: 50000, status: "completed", provider: "flutterwave", userId: 1, createdAt: Date.now() },
      ]}); render(<AdminPayments />);

      await user.click(screen.getByRole("button", { name: "Sort by Amount" }));
      await user.click(screen.getByRole("button", { name: "Sort by Amount" }));

      const calls = vi.mocked(useApiQuery).mock.calls;
      const ascCall = calls.find((c) => String(c[1]).includes("/api/payments/admin/all?") && String(c[1]).includes("sortBy=amount&sortOrder=asc"));
      expect(ascCall).toBeTruthy();
    });
  });

  describe("Audit Trail Links", () => {
    it("links each payment to its audit entries", async () => {
      setQueryData({ "admin/payments": [
        { id: 7, reference: "FLW-007", amount: 50000, status: "completed", provider: "flutterwave", userId: 1, createdAt: Date.now() },
      ]});
      render(<AdminPayments />);

      const link = await screen.findByLabelText("View audit trail for payment 7");
      expect(link.getAttribute("href")).toBe("/admin/audit-logs?entity=payment&entityId=7");
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

  // ─── Clean Up Abandoned ────────────────────────────────
  describe("Clean Up Abandoned", () => {
    it("renders the cleanup button", () => {
      setQueryData({});
      render(<AdminPayments />);
      expect(screen.getByRole("button", { name: /Clean Up Abandoned/i })).toBeTruthy();
    });

    it("calls the cleanup API and shows a toast on success", async () => {
      const user = userEvent.setup();
      setQueryData({});
      render(<AdminPayments />);

      await user.click(screen.getByRole("button", { name: /Clean Up Abandoned/i }));

      await waitFor(() => {
        expect(toast.success).toHaveBeenCalledWith("Cleanup complete");
      });
    });
  });

  describe("Resume Challenge", () => {
    it("shows Resume button for refunded payments", () => {
      setQueryData({ "admin/payments": [
        { id: 2, reference: "FLW-REFUNDED", amount: 50000, status: "refunded", provider: "flutterwave", userId: 1, createdAt: Date.now() },
      ]}); render(<AdminPayments />);
      expect(screen.getByRole("button", { name: /Resume/i })).toBeTruthy();
    });

    it("does not show Resume button for completed payments", () => {
      setQueryData({ "admin/payments": [
        { id: 1, reference: "FLW-001", amount: 50000, status: "completed", provider: "flutterwave", userId: 1, createdAt: Date.now() },
      ]}); render(<AdminPayments />);
      expect(screen.queryByRole("button", { name: /Resume/i })).toBeNull();
    });

    it("shows why the coupon was not restored in the success toast", async () => {
      const { useApiMutation } = await import("@/hooks/use-api");
      (useApiMutation as any).mockImplementation((method: string, path: string) => {
        if (path && path.includes("resume")) {
          return { mutateAsync: vi.fn().mockResolvedValue({ success: true, redemptionRestored: false, redemptionRestoreReason: "expired" }), isPending: false };
        }
        return { mutateAsync: vi.fn(), isPending: false };
      });

      const user = userEvent.setup();
      setQueryData({ "admin/payments": [
        { id: 2, reference: "FLW-REFUNDED", amount: 50000, status: "refunded", provider: "flutterwave", userId: 1, createdAt: Date.now() },
      ]});
      render(<AdminPayments />);

      await user.click(screen.getByRole("button", { name: /Resume/i }));
      await user.click(screen.getByTestId("alert-confirm"));

      await waitFor(() => {
        expect(toast.success).toHaveBeenCalledWith(
          expect.stringContaining("coupon not restored: Coupon has expired"),
        );
      });
    });

    it("shows a plain success toast when the coupon was restored", async () => {
      const { useApiMutation } = await import("@/hooks/use-api");
      (useApiMutation as any).mockImplementation((method: string, path: string) => {
        if (path && path.includes("resume")) {
          return { mutateAsync: vi.fn().mockResolvedValue({ success: true, redemptionRestored: true }), isPending: false };
        }
        return { mutateAsync: vi.fn(), isPending: false };
      });

      const user = userEvent.setup();
      setQueryData({ "admin/payments": [
        { id: 2, reference: "FLW-REFUNDED", amount: 50000, status: "refunded", provider: "flutterwave", userId: 1, createdAt: Date.now() },
      ]});
      render(<AdminPayments />);

      await user.click(screen.getByRole("button", { name: /Resume/i }));
      await user.click(screen.getByTestId("alert-confirm"));

      await waitFor(() => {
        expect(toast.success).toHaveBeenCalledWith("Challenge for FLW-REFUNDED resumed");
      });
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
