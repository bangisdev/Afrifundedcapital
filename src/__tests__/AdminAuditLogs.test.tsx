// @vitest-environment jsdom
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/hooks/use-auth", () => ({
  useAuth: vi.fn(() => ({ isLoading: false, isAuthenticated: true, user: { id: 1, role: "super_admin" }, error: null, signIn: vi.fn(), signOut: vi.fn(), refetch: vi.fn() })),
}));

const queryDataMap: Record<string, any> = {};
vi.mock("@/hooks/use-api", () => ({
  useApiQuery: vi.fn((key: string[], path?: string) => {
    // Server-aware pagination for the audit-logs list endpoint
    if (path && path.startsWith("/api/users/audit-logs")) {
      const base = queryDataMap["admin/auditLogs"];
      if (base === undefined) return { data: undefined, isLoading: true, refetch: vi.fn() };
      const url = new URL(path, "http://localhost");
      const search = (url.searchParams.get("search") || "").toLowerCase();
      const action = url.searchParams.get("action") || "all";
      const page = parseInt(url.searchParams.get("page") || "1", 10);
      const pageSize = parseInt(url.searchParams.get("pageSize") || "10", 10);
      const items = (base.logs as any[]).filter((l) => {
        if (action !== "all" && l.action !== action) return false;
        if (search) {
          const hay = `${l.action || ""} ${l.entity || ""} ${l.userName || ""} ${l.userEmail || ""} ${l.entityId || ""}`.toLowerCase();
          if (!hay.includes(search)) return false;
        }
        return true;
      });
      const total = items.length;
      const totalPages = Math.max(1, Math.ceil(total / pageSize));
      const start = (page - 1) * pageSize;
      const logs = items.slice(start, start + pageSize);
      return {
        data: { logs, total, page, pageSize, totalPages, stats: base.stats || { total, byAction: {} } },
        isLoading: false,
        refetch: vi.fn(),
      };
    }
    const dataKey = `${key.join("/")}`;
    if (queryDataMap[dataKey] === undefined) return { data: undefined, isLoading: true, refetch: vi.fn() };
    return { data: queryDataMap[dataKey], isLoading: false, refetch: vi.fn() };
  }),
}));

import AdminAuditLogs from "@/pages/admin/AdminAuditLogs";

describe("AdminAuditLogs", () => {
  beforeEach(() => {
    delete queryDataMap["admin/auditLogs"];
  });

  it("shows the acting admin's name and email on each entry", async () => {
    queryDataMap["admin/auditLogs"] = {
      logs: [
        { id: 1, action: "payment.refunded", entity: "payment", entityId: "42", userId: 3, userName: "Ada Obi", userEmail: "ada@afrifundedcapital.com", userDeleted: false, timestamp: Date.now(), details: null },
        { id: 2, action: "kyc.approved", entity: "kyc_document", entityId: "7", userId: 3, userName: "Ada Obi", userEmail: "ada@afrifundedcapital.com", userDeleted: false, timestamp: Date.now(), details: null },
      ],
      total: 2,
      page: 1,
      pageSize: 10,
      totalPages: 1,
      stats: { total: 2, byAction: { "payment.refunded": 1, "kyc.approved": 1 } },
    };

    render(<AdminAuditLogs />);

    expect((await screen.findAllByText("Ada Obi")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("ada@afrifundedcapital.com").length).toBeGreaterThan(0);
    expect(screen.getAllByText("payment.refunded").length).toBeGreaterThan(0);
    expect(screen.getByText("on payment")).toBeTruthy();
  });

  it("falls back to 'Deleted user #id' when the actor's account is gone", async () => {
    queryDataMap["admin/auditLogs"] = {
      logs: [
        { id: 5, action: "user.deleted", entity: "user", entityId: "9", userId: 12, userName: null, userEmail: null, userDeleted: true, timestamp: Date.now(), details: null },
      ],
      total: 1,
      page: 1,
      pageSize: 10,
      totalPages: 1,
      stats: { total: 1, byAction: { "user.deleted": 1 } },
    };

    render(<AdminAuditLogs />);

    expect(await screen.findByText("Deleted user #12")).toBeTruthy();
  });

  it("falls back to 'User #id' when the actor row exists but has no profile", async () => {
    queryDataMap["admin/auditLogs"] = {
      logs: [
        { id: 9, action: "payout.approved", entity: "payout", entityId: "3", userId: 21, userName: null, userEmail: null, userDeleted: false, timestamp: Date.now(), details: null },
      ],
      total: 1,
      page: 1,
      pageSize: 10,
      totalPages: 1,
      stats: { total: 1, byAction: { "payout.approved": 1 } },
    };

    render(<AdminAuditLogs />);

    expect(await screen.findByText("User #21")).toBeTruthy();
  });

  it("renders an empty state when there are no logs", async () => {
    queryDataMap["admin/auditLogs"] = {
      logs: [],
      total: 0,
      page: 1,
      pageSize: 10,
      totalPages: 1,
      stats: { total: 0, byAction: {} },
    };

    render(<AdminAuditLogs />);

    expect(await screen.findByText("No audit log entries found")).toBeTruthy();
  });

  it("renders the details JSON for entries that carry them", async () => {
    queryDataMap["admin/auditLogs"] = {
      logs: [
        { id: 4, action: "payment.refunded", entity: "payment", entityId: "42", userId: 3, userName: "Ada Obi", userEmail: "ada@afrifundedcapital.com", userDeleted: false, timestamp: Date.now(), details: '{"reference":"FLW-123","amount":50000}' },
      ],
      total: 1,
      page: 1,
      pageSize: 10,
      totalPages: 1,
      stats: { total: 1, byAction: { "payment.refunded": 1 } },
    };

    render(<AdminAuditLogs />);

    expect(await screen.findByText(/"reference":"FLW-123"/)).toBeTruthy();
  });
});
