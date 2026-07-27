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

import AdminNotifications from "@/pages/admin/AdminNotifications";

function clearAll() { Object.keys(queryDataMap).forEach((k) => delete queryDataMap[k]); }
function setQueryData(updates: Record<string, any>) { clearAll(); Object.assign(queryDataMap, { "admin/notifications": [], "admin/notifStats": null, ...updates }); }

describe("AdminNotifications Page", () => {
  beforeEach(() => { clearAll(); vi.clearAllMocks(); });

  describe("Page Header", () => {
    it("renders title", () => { setQueryData({}); render(<AdminNotifications />); expect(screen.getByText("Notifications")).toBeTruthy(); });
  });

  describe("Stats Cards", () => {
    it("renders all four stat cards", () => {
      setQueryData({}); render(<AdminNotifications />);
      expect(screen.getByText("Total Sent")).toBeTruthy();
      expect(screen.getByText("Unread")).toBeTruthy();
      expect(screen.getByText("Types")).toBeTruthy();
      expect(screen.getByText("Segments")).toBeTruthy();
    });
  });

  describe("Compose Tab", () => {
    it("defaults to compose tab", () => {
      setQueryData({}); render(<AdminNotifications />);
      expect(screen.getByText("New Notification")).toBeTruthy();
      expect(screen.getByText("Target Audience")).toBeTruthy();
    });
    it("renders form fields", () => {
      setQueryData({}); render(<AdminNotifications />);
      expect(screen.getByPlaceholderText(/Maintenance Notice/)).toBeTruthy();
      expect(screen.getByText("Send Notification")).toBeTruthy();
    });
    it("shows all audience segments", () => {
      setQueryData({}); render(<AdminNotifications />);
      expect(screen.getByText("All Users")).toBeTruthy();
      expect(screen.getByText("Admins Only")).toBeTruthy();
      expect(screen.getByText("Verified Users")).toBeTruthy();
      expect(screen.getByText("KYC Approved")).toBeTruthy();
    });
    it("Send button is disabled when form is empty", () => {
      setQueryData({}); render(<AdminNotifications />);
      const btn = screen.getByText("Send Notification").closest("button");
      expect(btn).toBeDisabled();
    });
  });

  describe("History Tab", () => {
    it("switches to history tab", async () => {
      const user = userEvent.setup();
      setQueryData({ "admin/notifications": [
        { id: 1, title: "System Update", message: "New feature released", type: "system", read: false, userId: 1, createdAt: Date.now(), link: null },
      ]}); render(<AdminNotifications />);
      await user.click(screen.getByText(/History/));
      expect(screen.getByText("System Update")).toBeTruthy();
    });
    it("shows notification type badges", async () => {
      const user = userEvent.setup();
      setQueryData({ "admin/notifications": [
        { id: 1, title: "Hello Everyone", message: "Hello everyone", type: "broadcast", read: true, userId: 0, createdAt: Date.now(), link: null },
      ]}); render(<AdminNotifications />);
      await user.click(screen.getByText(/History/));
      // "Broadcast" appears in both filter dropdown and the notification badge
      const broadcastElements = screen.getAllByText("Broadcast");
      expect(broadcastElements.length).toBeGreaterThanOrEqual(2);
    });
    it("shows empty state", async () => {
      const user = userEvent.setup();
      setQueryData({ "admin/notifications": [] }); render(<AdminNotifications />);
      await user.click(screen.getByText(/History/));
      expect(screen.getByText("No notifications found")).toBeTruthy();
    });
  });

  describe("Full Integration", () => {
    it("renders complete page", () => {
      setQueryData({}); render(<AdminNotifications />);
      expect(screen.getByText("Notifications")).toBeTruthy();
      expect(screen.getByText("Compose")).toBeTruthy();
      expect(screen.getByText(/History/)).toBeTruthy();
    });
  });
});
