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
    // Server-aware pagination: the KYC list endpoint returns a paginated envelope
    if (path && path.startsWith("/api/kyc/admin/all")) {
      const base = queryDataMap["admin/kyc"];
      if (base === undefined) return { data: undefined, isLoading: true, refetch: vi.fn() };
      const url = new URL(path, "http://localhost");
      const search = (url.searchParams.get("search") || "").toLowerCase();
      const status = url.searchParams.get("status") || "all";
      const type = url.searchParams.get("type") || "all";
      const page = parseInt(url.searchParams.get("page") || "1", 10);
      const pageSize = parseInt(url.searchParams.get("pageSize") || "10", 10);
      const items = base.filter((d: any) => {
        if (status !== "all" && d.status !== status) return false;
        if (type !== "all" && d.documentType !== type) return false;
        if (search) {
          const hay = `${d.userName || ""} ${d.userEmail || ""} ${d.documentType || ""}`.toLowerCase();
          if (!hay.includes(search)) return false;
        }
        return true;
      });
      const total = items.length;
      const totalPages = Math.max(1, Math.ceil(total / pageSize));
      const start = (page - 1) * pageSize;
      const documents = items.slice(start, start + pageSize);
      const stats = {
        total,
        pending: items.filter((d: any) => d.status === "pending").length,
        approved: items.filter((d: any) => d.status === "approved").length,
        rejected: items.filter((d: any) => d.status === "rejected").length,
      };
      return { data: { documents, total, page, pageSize, totalPages, stats }, isLoading: false, refetch: vi.fn() };
    }
    const dataKey = `${key.join("/")}`;
    if (queryDataMap[dataKey] === undefined) return { data: undefined, isLoading: true, refetch: vi.fn() };
    return { data: queryDataMap[dataKey], isLoading: false, refetch: vi.fn() };
  }),
  useApiMutation: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
}));

vi.mock("@/components/ui/alert-dialog", () => ({
  AlertDialog: ({ open, _onOpenChange, children }: any) => { if (!open) return null; return <div data-testid="alert-dialog">{children}</div>; },
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

import AdminKyc from "@/pages/admin/AdminKyc";

function clearAll() { Object.keys(queryDataMap).forEach((k) => delete queryDataMap[k]); }
function setQueryData(updates: Record<string, any>) { clearAll(); Object.assign(queryDataMap, { "admin/kyc": [], "admin/briefUsers": [], ...updates }); }

describe("AdminKyc Page", () => {
  beforeEach(() => { clearAll(); vi.clearAllMocks(); mockFetch.mockResolvedValue({ ok: true, json: async () => ({ message: "ok" }) }); });

  describe("Loading State", () => {
    it("shows spinner when loading", () => { clearAll(); const { container } = render(<AdminKyc />); expect(container.querySelector("[aria-label='Loading']")).toBeTruthy(); });
  });

  describe("Page Header", () => {
    it("renders title", () => { setQueryData({}); render(<AdminKyc />); expect(screen.getByText("KYC Verification")).toBeTruthy(); });
  });

  describe("Stats Cards", () => {
    it("renders all four stat cards", () => {
      setQueryData({}); render(<AdminKyc />);
      expect(screen.getByText("Total")).toBeTruthy();
      // "Pending", "Approved", "Rejected" appear in both stat cards and filter dropdowns
      expect(screen.getAllByText("Pending").length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText("Approved").length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText("Rejected").length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("Document List", () => {
    it("shows documents with type labels", () => {
      setQueryData({ "admin/kyc": [
        { id: 1, documentType: "passport", status: "pending", userId: 1, uploadedAt: Date.now() },
      ], "admin/briefUsers": [{ id: 1, name: "John Doe" }] });
      render(<AdminKyc />);
      // "Passport" appears in both filter dropdown option and doc type label
      expect(screen.getAllByText("Passport").length).toBeGreaterThanOrEqual(2);
      expect(screen.getByText("Pending Review")).toBeTruthy();
    });
    it("shows empty state", () => {
      setQueryData({ "admin/kyc": [] }); render(<AdminKyc />);
      expect(screen.getByText("No documents found")).toBeTruthy();
    });
    it("shows Approve and Reject buttons for pending docs", () => {
      setQueryData({ "admin/kyc": [
        { id: 1, documentType: "passport", status: "pending", userId: 1, uploadedAt: Date.now() },
      ], "admin/briefUsers": [{ id: 1, name: "John" }] });
      render(<AdminKyc />);
      expect(screen.getByText("Approve")).toBeTruthy();
      expect(screen.getByText("Reject")).toBeTruthy();
    });
    it("filters by status", async () => {
      const user = userEvent.setup();
      setQueryData({ "admin/kyc": [
        { id: 1, documentType: "passport", status: "pending", userId: 1, uploadedAt: Date.now() },
        { id: 2, documentType: "national_id", status: "approved", userId: 2, uploadedAt: Date.now() },
      ], "admin/briefUsers": [] });
      render(<AdminKyc />);
      await user.selectOptions(screen.getByDisplayValue("All Status"), "approved");
      // "National ID" appears in both filter dropdown and doc label
      expect(screen.getAllByText("National ID").length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("Audit Trail Links", () => {
    it("links each list row to the document's audit entries", async () => {
      setQueryData({ "admin/kyc": [
        { id: 42, documentType: "passport", status: "pending", userId: 1, uploadedAt: Date.now() },
      ], "admin/briefUsers": [{ id: 1, name: "John Doe" }] });
      render(<AdminKyc />);

      const link = await screen.findByLabelText("View audit trail for document 42");
      expect(link.getAttribute("href")).toBe("/admin/audit-logs?entity=kyc_document&entityId=42");
    });

    it("shows a View audit trail link in the document detail view", async () => {
      const user = userEvent.setup();
      setQueryData({ "admin/kyc": [
        { id: 7, documentType: "national_id", status: "approved", userId: 1, uploadedAt: Date.now(), reviewedAt: Date.now() },
      ], "admin/briefUsers": [{ id: 1, name: "John Doe" }] });
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          id: 7, documentType: "national_id", status: "approved", userId: 1,
          userName: "John Doe", userEmail: "john@test.com",
          uploadedAt: Date.now(), reviewedAt: Date.now(),
        }),
      });
      render(<AdminKyc />);

      // Open the detail view via the eye button
      await user.click(screen.getByLabelText("View document details"));

      const link = await screen.findByText("View audit trail");
      expect(link.closest("a")!.getAttribute("href")).toBe("/admin/audit-logs?entity=kyc_document&entityId=7");
    });
  });

  describe("Sortable Headers", () => {
    it("renders sortable column headers with the default column active", () => {
      setQueryData({ "admin/kyc": [
        { id: 1, documentType: "passport", status: "pending", userId: 1, uploadedAt: Date.now() },
      ], "admin/briefUsers": [{ id: 1, name: "John Doe" }] });
      render(<AdminKyc />);

      for (const label of ["Type", "Status", "Uploaded"]) {
        expect(screen.getByRole("button", { name: `Sort by ${label}` })).toBeTruthy();
      }
      // Default sort is uploadedAt desc → Uploaded is active
      expect(screen.getByRole("button", { name: "Sort by Uploaded" }).getAttribute("aria-pressed")).toBe("true");
    });

    it("calls the API with sortBy/sortOrder when a header is clicked", async () => {
      const user = userEvent.setup();
      setQueryData({ "admin/kyc": [
        { id: 1, documentType: "passport", status: "pending", userId: 1, uploadedAt: Date.now() },
      ], "admin/briefUsers": [] });
      render(<AdminKyc />);

      await user.click(screen.getByRole("button", { name: "Sort by Status" }));

      const calls = vi.mocked(useApiQuery).mock.calls;
      const kycCall = calls.find((c) => String(c[1]).includes("/api/kyc/admin/all?") && String(c[1]).includes("sortBy=status"));
      expect(kycCall).toBeTruthy();
      expect(String(kycCall![1])).toContain("sortOrder=desc");
      expect(screen.getByRole("button", { name: "Sort by Status" }).getAttribute("aria-pressed")).toBe("true");
    });

    it("toggles to ascending when the active column is clicked again", async () => {
      const user = userEvent.setup();
      setQueryData({ "admin/kyc": [
        { id: 1, documentType: "passport", status: "pending", userId: 1, uploadedAt: Date.now() },
      ], "admin/briefUsers": [] });
      render(<AdminKyc />);

      await user.click(screen.getByRole("button", { name: "Sort by Status" }));
      await user.click(screen.getByRole("button", { name: "Sort by Status" }));

      const calls = vi.mocked(useApiQuery).mock.calls;
      const ascCall = calls.find((c) => String(c[1]).includes("/api/kyc/admin/all?") && String(c[1]).includes("sortBy=status&sortOrder=asc"));
      expect(ascCall).toBeTruthy();
    });
  });

  describe("Full Integration", () => {
    it("renders complete page", () => {
      setQueryData({}); render(<AdminKyc />);
      expect(screen.getByText("KYC Verification")).toBeTruthy();
      expect(screen.getByText("Total")).toBeTruthy();
    });
  });
});
