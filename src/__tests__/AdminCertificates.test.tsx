// @vitest-environment jsdom
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/hooks/use-auth", () => ({
  useAuth: vi.fn(() => ({
    isLoading: false,
    isAuthenticated: true,
    user: { id: 1, role: "super_admin" },
    error: null,
    signIn: vi.fn(),
    signOut: vi.fn(),
    refetch: vi.fn(),
  })),
}));

const queryDataMap: Record<string, any> = {};
vi.mock("@/hooks/use-api", () => ({
  useApiQuery: vi.fn((key: string[]) => {
    // The page keys certificates queries as ["admin","certificates", url] — look up
    // by the stable prefix (first two segments).
    const dataKey = key.slice(0, 2).join("/");
    if (queryDataMap[dataKey] === undefined) return { data: undefined, isLoading: true, refetch: vi.fn() };
    return { data: queryDataMap[dataKey], isLoading: false, refetch: vi.fn() };
  }),
  useApiMutation: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
}));

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// ─── Mock: react-router (audit trail deep links) ──────────
vi.mock("react-router", () => ({
  Link: ({ to, children, ...rest }: any) => <a href={to} {...rest}>{children}</a>,
}));

import AdminCertificates from "@/pages/admin/AdminCertificates";

function clearAll() { Object.keys(queryDataMap).forEach((k) => delete queryDataMap[k]); }
function setQueryData(updates: Record<string, any>) {
  clearAll();
  Object.assign(queryDataMap, {
    "admin/certificates": {
      certificates: [],
      total: 0,
      page: 1,
      pageSize: 10,
      totalPages: 1,
      stats: { total: 0, byType: {} },
    },
    ...updates,
  });
}

function makeCert(overrides: any = {}) {
  return {
    id: 1,
    certificateNumber: "AFC-2025-0001",
    userId: 10,
    userName: "John Doe",
    type: "phase_1_passed",
    verificationCode: "V12345",
    issuedAt: Date.now() - 86400000,
    ...overrides,
  };
}

describe("AdminCertificates Page", () => {
  beforeEach(() => { clearAll(); vi.clearAllMocks(); mockFetch.mockResolvedValue({ ok: true, json: async () => ({ message: "ok" }) }); });

  describe("Loading State", () => {
    it("shows spinner when loading", () => {
      clearAll();
      const { container } = render(<AdminCertificates />);
      expect(container.querySelector("[aria-label='Loading']")).toBeTruthy();
    });

    it("hides spinner once loaded", () => {
      setQueryData({});
      const { container } = render(<AdminCertificates />);
      expect(container.querySelector("[aria-label='Loading']")).toBeNull();
    });
  });

  describe("Page Header", () => {
    it("renders title", () => {
      setQueryData({});
      render(<AdminCertificates />);
      expect(screen.getByText("Certificates")).toBeTruthy();
    });

    it("renders description", () => {
      setQueryData({});
      render(<AdminCertificates />);
      expect(screen.getByText(/All issued certificates/)).toBeTruthy();
    });
  });

  describe("Stats", () => {
    it("shows total issued stat", () => {
      setQueryData({
        "admin/certificates": {
          certificates: [makeCert()],
          total: 1,
          page: 1,
          pageSize: 10,
          totalPages: 1,
          stats: { total: 1, byType: { phase_1_passed: 1 } },
        },
      });
      render(<AdminCertificates />);
      expect(screen.getByText("Total Issued")).toBeTruthy();
    });

    it("shows type breakdown stats", () => {
      setQueryData({
        "admin/certificates": {
          certificates: [],
          total: 2,
          page: 1,
          pageSize: 10,
          totalPages: 1,
          stats: { total: 2, byType: { funded: 2 } },
        },
      });
      render(<AdminCertificates />);
      expect(screen.getByText("funded")).toBeTruthy();
    });
  });

  describe("Certificate List", () => {
    it("renders certificate rows with number, user and type", () => {
      setQueryData({
        "admin/certificates": {
          certificates: [makeCert()],
          total: 1,
          page: 1,
          pageSize: 10,
          totalPages: 1,
          stats: { total: 1, byType: { phase_1_passed: 1 } },
        },
      });
      render(<AdminCertificates />);
      expect(screen.getByText("#AFC-2025-0001")).toBeTruthy();
      expect(screen.getByText(/John Doe/)).toBeTruthy();
      expect(screen.getAllByText("phase 1 passed").length).toBeGreaterThanOrEqual(2);
    });

    it("renders verification code", () => {
      setQueryData({
        "admin/certificates": {
          certificates: [makeCert()],
          total: 1,
          page: 1,
          pageSize: 10,
          totalPages: 1,
          stats: { total: 1, byType: {} },
        },
      });
      render(<AdminCertificates />);
      expect(screen.getByText("#V12345")).toBeTruthy();
    });

    it("shows empty state when no certificates", () => {
      setQueryData({});
      render(<AdminCertificates />);
      expect(screen.getByText("No certificates found")).toBeTruthy();
    });
  });

  describe("Search & Filter", () => {
    it("renders search input and type filter", () => {
      setQueryData({});
      render(<AdminCertificates />);
      expect(screen.getByPlaceholderText(/Search by certificate number/)).toBeTruthy();
      expect(screen.getByDisplayValue("All Types")).toBeTruthy();
    });
  });

  describe("Audit Trail Deep Links", () => {
    it("links each certificate row to its scoped audit trail", () => {
      setQueryData({
        "admin/certificates": {
          certificates: [makeCert({ id: 7 })],
          total: 1,
          page: 1,
          pageSize: 10,
          totalPages: 1,
          stats: { total: 1, byType: {} },
        },
      });
      render(<AdminCertificates />);
      const link = screen.getByRole("link", { name: "View audit trail for certificate 7" });
      expect(link.getAttribute("href")).toBe("/admin/audit-logs?entity=certificate&entityId=7");
    });

    it("renders a deep link per certificate", () => {
      setQueryData({
        "admin/certificates": {
          certificates: [makeCert({ id: 1 }), makeCert({ id: 2, certificateNumber: "AFC-2025-0002" })],
          total: 2,
          page: 1,
          pageSize: 10,
          totalPages: 1,
          stats: { total: 2, byType: {} },
        },
      });
      render(<AdminCertificates />);
      expect(screen.getAllByLabelText(/View audit trail for certificate/).length).toBe(2);
    });
  });
});
