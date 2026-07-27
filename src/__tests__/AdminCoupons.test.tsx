// @vitest-environment jsdom
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
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

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

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

  describe("Create Form", () => {
    it("shows form when Create is clicked", async () => {
      const user = userEvent.setup();
      setQueryData({}); render(<AdminCoupons />);
      await user.click(screen.getByText("Create"));
      expect(screen.getByPlaceholderText(/Code/)).toBeTruthy();
      expect(screen.getByPlaceholderText(/Value/)).toBeTruthy();
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
