// @vitest-environment jsdom
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";

// ─── Mock: sonner ──────────────────────────────────────────
vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  },
}));

// ─── Mock: useAuth ─────────────────────────────────────────
vi.mock("@/hooks/use-auth", () => ({
  useAuth: vi.fn(() => ({
    isLoading: false,
    isAuthenticated: true,
    user: { id: 1, name: "Test User", email: "test@example.com", role: "user" },
    error: null,
    signIn: vi.fn(),
    signOut: vi.fn(),
    refetch: vi.fn(),
  })),
}));

// ─── Mock: useApiQuery / useApiMutation ────────────────────
const queryDataMap: Record<string, any> = {};
const mockUpdatePrefs = vi.fn(async () => ({ message: "ok" }));

vi.mock("@/hooks/use-api", () => ({
  useApiQuery: vi.fn((key: string[], _path: string, _opts?: any) => {
    const dataKey = `${key.join("/")}`;
    if (queryDataMap[dataKey] === undefined) {
      return { data: undefined, isLoading: true };
    }
    return { data: queryDataMap[dataKey], isLoading: false };
  }),
  useApiMutation: vi.fn((_method: string, _path: string, _onSuccess?: any) => ({
    mutateAsync: mockUpdatePrefs,
    mutate: vi.fn(),
    isPending: false,
  })),
}));

// ─── Import component after mocks ─────────────────────────
import NotificationPreferences from "@/pages/dashboard/NotificationPreferences";
import { toast } from "sonner";

// ─── Helpers ──────────────────────────────────────────────
function clearAllQueryData() {
  Object.keys(queryDataMap).forEach((k) => delete queryDataMap[k]);
}

function setQueryData(updates: Record<string, any>) {
  Object.keys(queryDataMap).forEach((k) => delete queryDataMap[k]);
  Object.assign(queryDataMap, { "users/current": null, ...updates });
}

// ─── Tests ────────────────────────────────────────────────
describe("Notification Preferences Page", () => {
  beforeEach(() => {
    clearAllQueryData();
    vi.clearAllMocks();
    mockUpdatePrefs.mockResolvedValue({ message: "ok" });
  });

  // ─── Loading state ─────────────────────────────────────
  describe("Initial State", () => {
    it("renders form even when user data is loading", () => {
      clearAllQueryData();
      render(<NotificationPreferences />);
      // Component has no loading state — always renders the form
      expect(screen.getByText("Email Notifications")).toBeTruthy();
    });

    it("renders form when user data is loaded", () => {
      setQueryData({ "users/current": { emailNotifications: true } });
      render(<NotificationPreferences />);
      expect(screen.getByText("Email Notifications")).toBeTruthy();
    });
  });

  // ─── Page header ───────────────────────────────────────
  describe("Page Header", () => {
    it("renders the page title", () => {
      setQueryData({ "users/current": { emailNotifications: true } });
      render(<NotificationPreferences />);
      expect(screen.getByText("Notification Preferences")).toBeTruthy();
    });

    it("renders the page description", () => {
      setQueryData({ "users/current": { emailNotifications: true } });
      render(<NotificationPreferences />);
      expect(screen.getByText(/Control how you receive notifications/)).toBeTruthy();
    });
  });

  // ─── Email toggle ──────────────────────────────────────
  describe("Email Notifications Toggle", () => {
    it("defaults to enabled when user preference is true", () => {
      setQueryData({ "users/current": { emailNotifications: true } });
      const { container } = render(<NotificationPreferences />);
      const toggle = container.querySelector("button.rounded-full");
      expect(toggle?.className).toContain("bg-foreground");
    });

    it("defaults to disabled when user preference is false", () => {
      setQueryData({ "users/current": { emailNotifications: false } });
      const { container } = render(<NotificationPreferences />);
      const toggle = container.querySelector("button.rounded-full");
      expect(toggle?.className).toContain("bg-secondary");
    });

    it("defaults to enabled when no user preference is set", () => {
      setQueryData({ "users/current": {} });
      const { container } = render(<NotificationPreferences />);
      const toggle = container.querySelector("button.rounded-full");
      expect(toggle?.className).toContain("bg-foreground");
    });

    it("toggles from enabled to disabled on click", async () => {
      const user = userEvent.setup();
      setQueryData({ "users/current": { emailNotifications: true } });
      const { container } = render(<NotificationPreferences />);

      const toggle = container.querySelector("button.rounded-full")!;
      expect(toggle.className).toContain("bg-foreground");

      await user.click(toggle);
      expect(toggle.className).toContain("bg-secondary");
    });

    it("toggles from disabled to enabled on click", async () => {
      const user = userEvent.setup();
      setQueryData({ "users/current": { emailNotifications: false } });
      const { container } = render(<NotificationPreferences />);

      const toggle = container.querySelector("button.rounded-full")!;
      expect(toggle.className).toContain("bg-secondary");

      await user.click(toggle);
      expect(toggle.className).toContain("bg-foreground");
    });

    it("shows knob with translate-x-6 when enabled", () => {
      setQueryData({ "users/current": { emailNotifications: true } });
      const { container } = render(<NotificationPreferences />);
      const knob = container.querySelector("button.rounded-full > div");
      expect(knob?.className).toContain("translate-x-6");
    });

    it("shows knob with translate-x-1 when disabled", () => {
      setQueryData({ "users/current": { emailNotifications: false } });
      const { container } = render(<NotificationPreferences />);
      const knob = container.querySelector("button.rounded-full > div");
      expect(knob?.className).toContain("translate-x-1");
    });

    it("moves knob on toggle", async () => {
      const user = userEvent.setup();
      setQueryData({ "users/current": { emailNotifications: true } });
      const { container } = render(<NotificationPreferences />);

      const knob = container.querySelector("button.rounded-full > div")!;
      expect(knob.className).toContain("translate-x-6");

      await user.click(container.querySelector("button.rounded-full")!);
      expect(knob.className).toContain("translate-x-1");
    });
  });

  // ─── Toggle label ──────────────────────────────────────
  describe("Toggle Label", () => {
    it("renders Email Notifications label", () => {
      setQueryData({ "users/current": { emailNotifications: true } });
      render(<NotificationPreferences />);
      expect(screen.getByText("Email Notifications")).toBeTruthy();
    });

    it("renders toggle description", () => {
      setQueryData({ "users/current": { emailNotifications: true } });
      render(<NotificationPreferences />);
      expect(screen.getByText(/Receive notifications via email/)).toBeTruthy();
    });
  });

  // ─── Save preferences ──────────────────────────────────
  describe("Save Preferences", () => {
    it("renders Save Preferences button", () => {
      setQueryData({ "users/current": { emailNotifications: true } });
      render(<NotificationPreferences />);
      expect(screen.getByText("Save Preferences")).toBeTruthy();
    });

    it("saves with emailNotifications true when enabled", async () => {
      const user = userEvent.setup();
      setQueryData({ "users/current": { emailNotifications: false } });
      const { container } = render(<NotificationPreferences />);

      // Toggle to enabled
      await user.click(container.querySelector("button.rounded-full")!);
      await user.click(screen.getByText("Save Preferences"));

      await waitFor(() => {
        expect(mockUpdatePrefs).toHaveBeenCalledWith({ emailNotifications: true });
      });
    });

    it("saves with emailNotifications false when disabled", async () => {
      const user = userEvent.setup();
      setQueryData({ "users/current": { emailNotifications: true } });
      const { container } = render(<NotificationPreferences />);

      // Toggle to disabled
      await user.click(container.querySelector("button.rounded-full")!);
      await user.click(screen.getByText("Save Preferences"));

      await waitFor(() => {
        expect(mockUpdatePrefs).toHaveBeenCalledWith({ emailNotifications: false });
      });
    });

    it("shows success toast after save", async () => {
      const user = userEvent.setup();
      setQueryData({ "users/current": { emailNotifications: true } });
      render(<NotificationPreferences />);

      await user.click(screen.getByText("Save Preferences"));

      await waitFor(() => {
        expect(toast.success).toHaveBeenCalledWith("Preferences saved");
      });
    });

    it("shows error toast on save failure", async () => {
      const user = userEvent.setup();
      mockUpdatePrefs.mockRejectedValueOnce(new Error("Save failed"));
      setQueryData({ "users/current": { emailNotifications: true } });
      render(<NotificationPreferences />);

      await user.click(screen.getByText("Save Preferences"));

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith("Save failed");
      });
    });

    it("disables button and shows spinner while saving", async () => {
      const user = userEvent.setup();
      let resolveSave: (v: any) => void;
      mockUpdatePrefs.mockImplementation(() => new Promise((r) => { resolveSave = r; }));
      setQueryData({ "users/current": { emailNotifications: true } });
      const { container } = render(<NotificationPreferences />);

      await user.click(screen.getByText("Save Preferences"));

      // Button should be disabled during save
      const saveBtn = screen.getByText("Save Preferences").closest("button");
      expect(saveBtn).toBeDisabled();

      // Spinner should be present
      expect(container.querySelector(".animate-spin")).toBeTruthy();

      resolveSave!({});
      await waitFor(() => {
        expect(saveBtn).not.toBeDisabled();
      });
    });
  });

  // ─── Full integration ──────────────────────────────────
  describe("Full Integration", () => {
    it("renders complete page with all elements", () => {
      setQueryData({ "users/current": { emailNotifications: true } });
      render(<NotificationPreferences />);

      expect(screen.getByText("Notification Preferences")).toBeTruthy();
      expect(screen.getByText(/Control how you receive/)).toBeTruthy();
      expect(screen.getByText("Email Notifications")).toBeTruthy();
      expect(screen.getByText(/Receive notifications via email/)).toBeTruthy();
      expect(screen.getByText("Save Preferences")).toBeTruthy();
    });

    it("toggle and save flow works end-to-end", async () => {
      const user = userEvent.setup();
      setQueryData({ "users/current": { emailNotifications: true } });
      const { container } = render(<NotificationPreferences />);

      // Verify initial state
      const toggle = container.querySelector("button.rounded-full")!;
      expect(toggle.className).toContain("bg-foreground");

      // Toggle off
      await user.click(toggle);
      expect(toggle.className).toContain("bg-secondary");

      // Save
      await user.click(screen.getByText("Save Preferences"));

      await waitFor(() => {
        expect(mockUpdatePrefs).toHaveBeenCalledWith({ emailNotifications: false });
        expect(toast.success).toHaveBeenCalledWith("Preferences saved");
      });
    });

    it("handles null emailNotifications preference (defaults to true)", async () => {
      const user = userEvent.setup();
      setQueryData({ "users/current": { emailNotifications: null } });
      const { container } = render(<NotificationPreferences />);

      const toggle = container.querySelector("button.rounded-full")!;
      expect(toggle.className).toContain("bg-foreground");

      await user.click(screen.getByText("Save Preferences"));

      await waitFor(() => {
        expect(mockUpdatePrefs).toHaveBeenCalledWith({ emailNotifications: true });
      });
    });
  });
});
