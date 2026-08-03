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
  useApiQuery: vi.fn((key: string[]) => {
    // The page keys coupons queries as ["admin","coupons",queryString] — resolve by base
    // path so the sort-param variants all match "admin/coupons".
    const dataKey = `${key.join("/")}`.split("?")[0].replace(/\/+$/, "");
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

import AdminCoupons from "@/pages/admin/AdminCoupons";

function clearAll() { Object.keys(queryDataMap).forEach((k) => delete queryDataMap[k]); }
function setQueryData(updates: Record<string, any>) { clearAll(); Object.assign(queryDataMap, { "admin/coupons": [], ...updates }); }

describe("AdminCoupons Page", () => {
  beforeEach(() => { clearAll(); vi.clearAllMocks(); mockFetch.mockResolvedValue({ ok: true, json: async () => ({ message: "ok" }) }); });

  describe("Loading State", () => {
    it("shows spinner when loading", () => { clearAll(); const { container } = render(<AdminCoupons />); expect(container.querySelector(".animate-spin")).toBeTruthy(); });
  });

  describe("Page Header", () => {
    it("renders title", () => { setQueryData({}); render(<AdminCoupons />); expect(screen.getByText("Coupons")).toBeTruthy(); });
    it("renders Create button", () => { setQueryData({}); render(<AdminCoupons />); expect(screen.getByText("Create")).toBeTruthy(); });
  });

  describe("Summary Cards", () => {
    it("renders all three summary cards", () => {
      setQueryData({}); render(<AdminCoupons />);
      expect(screen.getByText("Total Coupons")).toBeTruthy();
      expect(screen.getByText("Total Redemptions")).toBeTruthy();
      expect(screen.getByText("Total Discount Given")).toBeTruthy();
    });
  });

  describe("Coupon List", () => {
    it("shows coupons with code and discount", () => {
      setQueryData({ "admin/coupons": [
        { id: 1, code: "SAVE20", discountType: "percentage", discountValue: 20, maxUses: 100, redemptionCount: 15, totalDiscountGiven: 5000 },
      ]}); render(<AdminCoupons />);
      expect(screen.getByText("SAVE20")).toBeTruthy();
      expect(screen.getByText("20%")).toBeTruthy();
    });
    it("shows fixed discount type", () => {
      setQueryData({ "admin/coupons": [
        { id: 1, code: "FLAT100", discountType: "fixed", discountValue: 100, maxUses: null, redemptionCount: 5, totalDiscountGiven: 500 },
      ]}); render(<AdminCoupons />);
      expect(screen.getByText("₦100")).toBeTruthy();
    });
    it("shows usage count", () => {
      setQueryData({ "admin/coupons": [
        { id: 1, code: "TEST", discountType: "percentage", discountValue: 10, maxUses: 50, redemptionCount: 30, totalDiscountGiven: 1000 },
      ]}); render(<AdminCoupons />);
      expect(screen.getByText("30 used")).toBeTruthy();
      expect(screen.getByText("of 50")).toBeTruthy();
    });
    it("shows Exhausted badge when max uses reached", () => {
      setQueryData({ "admin/coupons": [
        { id: 1, code: "USED", discountType: "percentage", discountValue: 10, maxUses: 10, redemptionCount: 10, totalDiscountGiven: 2000 },
      ]}); render(<AdminCoupons />);
      expect(screen.getByText("Exhausted")).toBeTruthy();
    });
  });

  describe("Audit Trail Deep Links", () => {
    it("links each coupon row to its scoped audit trail", () => {
      setQueryData({ "admin/coupons": [
        { id: 9, code: "SAVE20", discountType: "percentage", discountValue: 20, maxUses: 100, redemptionCount: 15, totalDiscountGiven: 5000 },
      ]}); render(<AdminCoupons />);
      const link = screen.getByRole("link", { name: "View audit trail for coupon 9" });
      expect(link.getAttribute("href")).toBe("/admin/audit-logs?entity=coupon&entityId=9");
    });

    it("renders a deep link per coupon", () => {
      setQueryData({ "admin/coupons": [
        { id: 1, code: "A", discountType: "percentage", discountValue: 5, maxUses: null, redemptionCount: 0, totalDiscountGiven: 0 },
        { id: 2, code: "B", discountType: "fixed", discountValue: 10, maxUses: null, redemptionCount: 0, totalDiscountGiven: 0 },
      ]}); render(<AdminCoupons />);
      expect(screen.getAllByLabelText(/View audit trail for coupon/).length).toBe(2);
    });
  });

  describe("Create Form", () => {
    it("shows form when Create is clicked", async () => {
      const user = userEvent.setup();
      setQueryData({}); render(<AdminCoupons />);
      await user.click(screen.getByText("Create"));
      expect(screen.getByPlaceholderText(/Code/)).toBeTruthy();
      expect(screen.getByPlaceholderText(/Value/)).toBeTruthy();
    });
  });

  describe("Sortable Headers", () => {
    it("renders sortable column headers with the default column active", () => {
      setQueryData({ "admin/coupons": [
        { id: 1, code: "SAVE20", discountType: "percentage", discountValue: 20, maxUses: 100, redemptionCount: 15, totalDiscountGiven: 5000 },
      ]}); render(<AdminCoupons />);

      for (const label of ["Code", "Discount", "Uses", "Expires", "Created"]) {
        expect(screen.getByRole("button", { name: `Sort by ${label}` })).toBeTruthy();
      }
      // Default sort is createdAt desc → Created is active
      expect(screen.getByRole("button", { name: "Sort by Created" }).getAttribute("aria-pressed")).toBe("true");
    });

    it("calls the API with sortBy/sortOrder when a header is clicked", async () => {
      const user = userEvent.setup();
      setQueryData({ "admin/coupons": [
        { id: 1, code: "SAVE20", discountType: "percentage", discountValue: 20, maxUses: 100, redemptionCount: 15, totalDiscountGiven: 5000 },
      ]}); render(<AdminCoupons />);

      await user.click(screen.getByRole("button", { name: "Sort by Uses" }));

      const calls = vi.mocked(useApiQuery).mock.calls;
      const couponsCall = calls.find((c) => String(c[1]).includes("/api/coupons/admin/all?") && String(c[1]).includes("sortBy=currentUses"));
      expect(couponsCall).toBeTruthy();
      expect(String(couponsCall![1])).toContain("sortOrder=desc");
      expect(screen.getByRole("button", { name: "Sort by Uses" }).getAttribute("aria-pressed")).toBe("true");
    });

    it("toggles to ascending when the active column is clicked again", async () => {
      const user = userEvent.setup();
      setQueryData({ "admin/coupons": [
        { id: 1, code: "SAVE20", discountType: "percentage", discountValue: 20, maxUses: 100, redemptionCount: 15, totalDiscountGiven: 5000 },
      ]}); render(<AdminCoupons />);

      await user.click(screen.getByRole("button", { name: "Sort by Uses" }));
      await user.click(screen.getByRole("button", { name: "Sort by Uses" }));

      const calls = vi.mocked(useApiQuery).mock.calls;
      const ascCall = calls.find((c) => String(c[1]).includes("/api/coupons/admin/all?") && String(c[1]).includes("sortBy=currentUses&sortOrder=asc"));
      expect(ascCall).toBeTruthy();
    });
  });

  describe("Full Integration", () => {
    it("renders complete page", () => {
      setQueryData({}); render(<AdminCoupons />);
      expect(screen.getByText("Coupons")).toBeTruthy();
      expect(screen.getByText("Total Coupons")).toBeTruthy();
    });
  });
});
