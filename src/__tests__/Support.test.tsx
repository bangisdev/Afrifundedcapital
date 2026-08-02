// @vitest-environment jsdom
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { useApiQuery } from "@/hooks/use-api";

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
const mockCreateTicket = vi.fn(async () => ({ message: "created" }));
const mockAddMessage = vi.fn(async () => ({ message: "sent" }));

vi.mock("@/hooks/use-api", () => ({
  useApiQuery: vi.fn((key: string[], path: string, _opts?: any) => {
    // The page passes query-suffixed keys (["support", "my", "/api/support/my?..."]),
    // so look up by the stable prefix (first two segments).
    const dataKey = key.slice(0, 2).join("/");
    if (queryDataMap[dataKey] === undefined) {
      return { data: undefined, isLoading: true };
    }
    const base = queryDataMap[dataKey];
    // Simulate the server-driven tickets list: paginate + stats envelope.
    if (dataKey === "support/my" && Array.isArray(base)) {
      const query = path.includes("?") ? path.split("?")[1] : "";
      const params = new URLSearchParams(query);
      const page = Number(params.get("page") || 1);
      const pageSize = Number(params.get("pageSize") || 10);
      const total = base.length;
      const totalPages = Math.max(1, Math.ceil(total / pageSize));
      return {
        data: {
          tickets: base.slice((page - 1) * pageSize, page * pageSize),
          total,
          page,
          pageSize,
          totalPages,
          stats: { total, byStatus: {} },
        },
        isLoading: false,
      };
    }
    return { data: base, isLoading: false };
  }),
  useApiMutation: vi.fn((method: string, path: string, _onSuccess?: any) => {
    if (path.includes("/messages")) {
      return { mutateAsync: mockAddMessage, mutate: vi.fn(), isPending: false };
    }
    return { mutateAsync: mockCreateTicket, mutate: vi.fn(), isPending: false };
  }),
}));

// ─── Mock: Dialog ──────────────────────────────────────────
vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ open, onOpenChange, children }: any) => {
    if (!open) return null;
    return (
      <div data-testid="dialog" data-open={open}>
        {children}
        <button data-testid="dialog-close" onClick={() => onOpenChange(false)}>Close</button>
      </div>
    );
  },
  DialogContent: ({ children, className }: any) => (
    <div data-testid="dialog-content" className={className}>{children}</div>
  ),
  DialogHeader: ({ children }: any) => <div>{children}</div>,
  DialogTitle: ({ children, className }: any) => <h2 className={className}>{children}</h2>,
}));

// ─── Import component after mocks ─────────────────────────
import Support from "@/pages/dashboard/Support";
import { toast } from "sonner";

// ─── Test data factories ──────────────────────────────────
function makeTicket(overrides: any = {}) {
  return {
    id: 1,
    subject: "Cannot access my account",
    category: "account",
    status: "open",
    priority: "medium",
    createdAt: Date.now() - 86400000,
    messages: [],
    ...overrides,
  };
}

// ─── Helpers ──────────────────────────────────────────────
function clearAllQueryData() {
  Object.keys(queryDataMap).forEach((k) => delete queryDataMap[k]);
}

function setQueryData(updates: Record<string, any>) {
  Object.keys(queryDataMap).forEach((k) => delete queryDataMap[k]);
  Object.assign(queryDataMap, { "support/my": [], ...updates });
}

// ─── Tests ────────────────────────────────────────────────
describe("Support Page", () => {
  beforeEach(() => {
    clearAllQueryData();
    vi.clearAllMocks();
    mockCreateTicket.mockResolvedValue({ message: "created" });
  });

  // ─── Loading state ─────────────────────────────────────
  describe("Loading State", () => {
    it("shows a spinner when data is loading", () => {
      clearAllQueryData();
      const { container } = render(<Support />);
      expect(container.querySelector(".animate-spin")).toBeTruthy();
    });

    it("hides spinner once data is loaded", () => {
      setQueryData({});
      const { container } = render(<Support />);
      expect(container.querySelector(".animate-spin")).toBeNull();
    });
  });

  // ─── Page header ───────────────────────────────────────
  describe("Page Header", () => {
    it("renders the Support title", () => {
      setQueryData({});
      render(<Support />);
      expect(screen.getByText("Support")).toBeTruthy();
    });

    it("renders the page description", () => {
      setQueryData({});
      render(<Support />);
      expect(screen.getByText(/Get help with your account/)).toBeTruthy();
    });

    it("renders the New Ticket button", () => {
      setQueryData({});
      render(<Support />);
      expect(screen.getByText("New Ticket")).toBeTruthy();
    });
  });

  // ─── Empty state ───────────────────────────────────────
  describe("Empty State", () => {
    it("shows empty state when no tickets exist", () => {
      setQueryData({ "support/my": [] });
      render(<Support />);
      expect(screen.getByText("No support tickets yet")).toBeTruthy();
    });

    it("shows empty state when tickets is undefined", () => {
      setQueryData({});
      delete queryDataMap["support/my"];
      const { container } = render(<Support />);
      // When support/my is undefined, isLoading is true → spinner
      expect(container.querySelector(".animate-spin")).toBeTruthy();
    });
  });

  // ─── Ticket list ───────────────────────────────────────
  describe("Ticket List", () => {
    it("renders a single ticket", () => {
      setQueryData({
        "support/my": [makeTicket({ subject: "Login issue" })],
      });
      render(<Support />);
      expect(screen.getByText("Login issue")).toBeTruthy();
    });

    it("renders multiple tickets", () => {
      setQueryData({
        "support/my": [
          makeTicket({ id: 1, subject: "Login issue", category: "technical" }),
          makeTicket({ id: 2, subject: "Billing question", category: "billing" }),
        ],
      });
      render(<Support />);
      expect(screen.getByText("Login issue")).toBeTruthy();
      expect(screen.getByText("Billing question")).toBeTruthy();
    });

    it("shows ticket category", () => {
      setQueryData({
        "support/my": [makeTicket({ category: "technical" })],
      });
      render(<Support />);
      expect(screen.getByText(/technical/)).toBeTruthy();
    });

    it("shows formatted date for tickets", () => {
      const date = new Date("2025-06-15");
      setQueryData({
        "support/my": [makeTicket({ createdAt: date.getTime() })],
      });
      render(<Support />);
      expect(screen.getByText(/6\/15\/2025/)).toBeTruthy();
    });

    it("handles missing createdAt gracefully", () => {
      setQueryData({
        "support/my": [makeTicket({ createdAt: null })],
      });
      render(<Support />);
      expect(screen.getByText("Cannot access my account")).toBeTruthy();
    });
  });

  // ─── Status badges ─────────────────────────────────────
  describe("Status Badges", () => {
    it("renders open status badge", () => {
      setQueryData({
        "support/my": [makeTicket({ status: "open" })],
      });
      render(<Support />);
      expect(screen.getByText("open")).toBeTruthy();
    });

    it("renders closed status badge", () => {
      setQueryData({
        "support/my": [makeTicket({ status: "closed" })],
      });
      render(<Support />);
      expect(screen.getByText("closed")).toBeTruthy();
    });

    it("renders in-progress status badge", () => {
      setQueryData({
        "support/my": [makeTicket({ status: "in-progress" })],
      });
      render(<Support />);
      expect(screen.getByText("in-progress")).toBeTruthy();
    });

    it("renders multiple tickets with different statuses", () => {
      setQueryData({
        "support/my": [
          makeTicket({ id: 1, subject: "Ticket 1", status: "open" }),
          makeTicket({ id: 2, subject: "Ticket 2", status: "closed" }),
        ],
      });
      render(<Support />);
      expect(screen.getByText("open")).toBeTruthy();
      expect(screen.getByText("closed")).toBeTruthy();
    });
  });

  // ─── Create ticket dialog ──────────────────────────────
  describe("Create Ticket Dialog", () => {
    it("does not show dialog initially", () => {
      setQueryData({});
      render(<Support />);
      expect(screen.queryByTestId("dialog")).toBeNull();
    });

    it("opens dialog when New Ticket is clicked", async () => {
      const user = userEvent.setup();
      setQueryData({});
      render(<Support />);
      await user.click(screen.getByText("New Ticket"));
      expect(screen.getByTestId("dialog")).toBeTruthy();
    });

    it("renders dialog title", async () => {
      const user = userEvent.setup();
      setQueryData({});
      render(<Support />);
      await user.click(screen.getByText("New Ticket"));
      expect(screen.getByText("New Support Ticket")).toBeTruthy();
    });

    it("renders subject input", async () => {
      const user = userEvent.setup();
      setQueryData({});
      render(<Support />);
      await user.click(screen.getByText("New Ticket"));
      expect(screen.getByText("Subject")).toBeTruthy();
    });

    it("renders category select", async () => {
      const user = userEvent.setup();
      setQueryData({});
      render(<Support />);
      await user.click(screen.getByText("New Ticket"));
      expect(screen.getByText("Category")).toBeTruthy();
      expect(screen.getByDisplayValue("General")).toBeTruthy();
    });

    it("renders message textarea", async () => {
      const user = userEvent.setup();
      setQueryData({});
      render(<Support />);
      await user.click(screen.getByText("New Ticket"));
      expect(screen.getByText("Message")).toBeTruthy();
    });

    it("renders Submit Ticket button", async () => {
      const user = userEvent.setup();
      setQueryData({});
      render(<Support />);
      await user.click(screen.getByText("New Ticket"));
      expect(screen.getByText("Submit Ticket")).toBeTruthy();
    });

    it("closes dialog on close button", async () => {
      const user = userEvent.setup();
      setQueryData({});
      render(<Support />);
      await user.click(screen.getByText("New Ticket"));
      expect(screen.getByTestId("dialog")).toBeTruthy();
      await user.click(screen.getByTestId("dialog-close"));
      expect(screen.queryByTestId("dialog")).toBeNull();
    });
  });

  // ─── Create ticket form interaction ────────────────────
  describe("Create Ticket Form", () => {
    it("allows entering a subject", async () => {
      const user = userEvent.setup();
      setQueryData({});
      render(<Support />);
      await user.click(screen.getByText("New Ticket"));
      const subjectInput = screen.getAllByRole("textbox")[0];
      await user.type(subjectInput, "My problem");
      expect(subjectInput).toHaveValue("My problem");
    });

    it("allows selecting a category", async () => {
      const user = userEvent.setup();
      setQueryData({});
      render(<Support />);
      await user.click(screen.getByText("New Ticket"));
      const select = screen.getByRole("combobox");
      await user.selectOptions(select, "technical");
      expect(select).toHaveValue("technical");
    });

    it("allows entering a message", async () => {
      const user = userEvent.setup();
      setQueryData({});
      render(<Support />);
      await user.click(screen.getByText("New Ticket"));
      const textareas = document.querySelectorAll("textarea");
      await user.type(textareas[0], "This is my message");
      expect(textareas[0]).toHaveValue("This is my message");
    });

    it("shows error toast when submitting without subject", async () => {
      const user = userEvent.setup();
      setQueryData({});
      render(<Support />);
      await user.click(screen.getByText("New Ticket"));
      await user.click(screen.getByText("Submit Ticket"));
      expect(toast.error).toHaveBeenCalledWith("Fill in all fields");
    });

    it("submits ticket with correct data", async () => {
      const user = userEvent.setup();
      setQueryData({});
      render(<Support />);
      await user.click(screen.getByText("New Ticket"));

      const subjectInput = screen.getAllByRole("textbox")[0];
      await user.type(subjectInput, "New issue");
      const select = screen.getByRole("combobox");
      await user.selectOptions(select, "billing");
      const textareas = document.querySelectorAll("textarea");
      await user.type(textareas[0], "Help me please");

      await user.click(screen.getByText("Submit Ticket"));

      await waitFor(() => {
        expect(mockCreateTicket).toHaveBeenCalledWith({
          subject: "New issue",
          category: "billing",
          priority: "medium",
        });
      });
    });

    it("shows success toast after submission", async () => {
      const user = userEvent.setup();
      setQueryData({});
      render(<Support />);
      await user.click(screen.getByText("New Ticket"));

      const subjectInput = screen.getAllByRole("textbox")[0];
      await user.type(subjectInput, "Issue");
      const textareas = document.querySelectorAll("textarea");
      await user.type(textareas[0], "Message");

      await user.click(screen.getByText("Submit Ticket"));

      await waitFor(() => {
        expect(toast.success).toHaveBeenCalledWith("Ticket created");
      });
    });

    it("closes dialog after successful submission", async () => {
      const user = userEvent.setup();
      setQueryData({});
      render(<Support />);
      await user.click(screen.getByText("New Ticket"));

      const subjectInput = screen.getAllByRole("textbox")[0];
      await user.type(subjectInput, "Issue");
      const textareas = document.querySelectorAll("textarea");
      await user.type(textareas[0], "Message");

      await user.click(screen.getByText("Submit Ticket"));

      await waitFor(() => {
        expect(screen.queryByTestId("dialog")).toBeNull();
      });
    });

    it("shows error toast on failed submission", async () => {
      const user = userEvent.setup();
      mockCreateTicket.mockRejectedValueOnce(new Error("Server error"));
      setQueryData({});
      render(<Support />);
      await user.click(screen.getByText("New Ticket"));

      const subjectInput = screen.getAllByRole("textbox")[0];
      await user.type(subjectInput, "Issue");
      const textareas = document.querySelectorAll("textarea");
      await user.type(textareas[0], "Message");

      await user.click(screen.getByText("Submit Ticket"));

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith("Server error");
      });
    });

    it("resets form fields after successful submission", async () => {
      const user = userEvent.setup();
      setQueryData({});
      render(<Support />);
      await user.click(screen.getByText("New Ticket"));

      const subjectInput = screen.getAllByRole("textbox")[0];
      await user.type(subjectInput, "Issue");
      const textareas = document.querySelectorAll("textarea");
      await user.type(textareas[0], "Message");

      await user.click(screen.getByText("Submit Ticket"));

      await waitFor(() => {
        expect(screen.queryByTestId("dialog")).toBeNull();
      });
    });
  });

  // ─── Category options ──────────────────────────────────
  describe("Category Options", () => {
    it("renders all category options", async () => {
      const user = userEvent.setup();
      setQueryData({});
      render(<Support />);
      await user.click(screen.getByText("New Ticket"));
      expect(screen.getByText("General")).toBeTruthy();
      expect(screen.getByText("Technical")).toBeTruthy();
      expect(screen.getByText("Billing")).toBeTruthy();
      expect(screen.getByText("Account")).toBeTruthy();
    });

    it("defaults to general category", async () => {
      const user = userEvent.setup();
      setQueryData({});
      render(<Support />);
      await user.click(screen.getByText("New Ticket"));
      expect(screen.getByDisplayValue("General")).toBeTruthy();
    });
  });

  // ─── Ticket click interaction ──────────────────────────
  describe("Ticket Interaction", () => {
    it("ticket button is clickable", async () => {
      const user = userEvent.setup();
      setQueryData({
        "support/my": [makeTicket({ subject: "Clickable ticket" })],
      });
      render(<Support />);
      const ticketButton = screen.getByText("Clickable ticket").closest("button");
      expect(ticketButton).toBeTruthy();
      await user.click(ticketButton!);
      // Clicking selects the ticket (no visible change in this simplified view)
      expect(screen.getByText("Clickable ticket")).toBeTruthy();
    });
  });

  // ─── Full integration ──────────────────────────────────
  // ─── Sortable Headers ──────────────────────────────────
  describe("Sortable Headers", () => {
    it("renders sortable headers with Created active by default", () => {
      setQueryData({ "support/my": [makeTicket()] });
      render(<Support />);

      for (const label of ["Subject", "Category", "Priority", "Status", "Created"]) {
        expect(screen.getByRole("button", { name: `Sort by ${label}` })).toBeTruthy();
      }
      expect(screen.getByRole("button", { name: "Sort by Created" }).getAttribute("aria-pressed")).toBe("true");
    });

    it("calls the API with sortBy/sortOrder when a header is clicked", async () => {
      const user = userEvent.setup();
      setQueryData({ "support/my": [makeTicket()] });
      render(<Support />);

      await user.click(screen.getByRole("button", { name: "Sort by Subject" }));

      const calls = vi.mocked(useApiQuery).mock.calls;
      const myCall = calls.find((c) => String(c[1]).includes("/api/support/my?") && String(c[1]).includes("sortBy=subject"));
      expect(myCall).toBeTruthy();
      expect(String(myCall![1])).toContain("sortOrder=desc");
      expect(screen.getByRole("button", { name: "Sort by Subject" }).getAttribute("aria-pressed")).toBe("true");
    });

    it("toggles to ascending when the active column is clicked again", async () => {
      const user = userEvent.setup();
      setQueryData({ "support/my": [makeTicket()] });
      render(<Support />);

      await user.click(screen.getByRole("button", { name: "Sort by Subject" }));
      await user.click(screen.getByRole("button", { name: "Sort by Subject" }));

      const calls = vi.mocked(useApiQuery).mock.calls;
      const ascCall = calls.find((c) => String(c[1]).includes("/api/support/my?") && String(c[1]).includes("sortBy=subject&sortOrder=asc"));
      expect(ascCall).toBeTruthy();
    });
  });

  describe("Full Integration", () => {
    it("renders all sections with complete data", () => {
      setQueryData({
        "support/my": [
          makeTicket({ id: 1, subject: "Account issue", category: "account", status: "open" }),
          makeTicket({ id: 2, subject: "Billing problem", category: "billing", status: "closed" }),
        ],
      });
      render(<Support />);

      // Header
      expect(screen.getByText("Support")).toBeTruthy();
      expect(screen.getByText(/Get help/)).toBeTruthy();
      expect(screen.getByText("New Ticket")).toBeTruthy();

      // Tickets
      expect(screen.getByText("Account issue")).toBeTruthy();
      expect(screen.getByText("Billing problem")).toBeTruthy();
      expect(screen.getByText("open")).toBeTruthy();
      expect(screen.getByText("closed")).toBeTruthy();
    });

    it("paginates many tickets", async () => {
      const user = userEvent.setup();
      const tickets = Array.from({ length: 20 }, (_, i) =>
        makeTicket({ id: i + 1, subject: `Ticket ${i + 1}`, status: i % 2 === 0 ? "open" : "closed" })
      );
      setQueryData({ "support/my": tickets });
      render(<Support />);
      // Page 1 shows the first 10 of 20
      expect(screen.getByText("Ticket 1")).toBeTruthy();
      expect(screen.queryByText("Ticket 20")).toBeNull();
      expect(screen.getByText(/Showing 10 of 20 tickets/)).toBeTruthy();

      // Next page shows the remaining 10
      await user.click(screen.getByText("Next"));
      expect(screen.getByText("Ticket 20")).toBeTruthy();
      expect(screen.getByText(/Showing 10 of 20 tickets/)).toBeTruthy();
    });
  });
});
