// @vitest-environment jsdom
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// ─── Mock: sonner ──────────────────────────────────────────
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

// ─── Mock: useAuth ─────────────────────────────────────────
vi.mock("@/hooks/use-auth", () => ({
  useAuth: vi.fn(() => ({
    isLoading: false,
    isAuthenticated: true,
    user: { id: 1, name: "Admin", email: "admin@test.com", role: "super_admin" },
    error: null,
    signIn: vi.fn(),
    signOut: vi.fn(),
    refetch: vi.fn(),
  })),
}));

// ─── Mock: useApiQuery / useApiMutation ────────────────────
const queryDataMap: Record<string, any> = {};
const mockRefetch = vi.fn();
const mockUpdateSetting = vi.fn(async () => ({ message: "ok" }));
const mockSeedData = vi.fn(async () => ({ message: "seeded" }));

vi.mock("@/hooks/use-api", () => ({
  useApiQuery: vi.fn((key: string[], _path: string, _opts?: any) => {
    const dataKey = `${key.join("/")}`;
    if (queryDataMap[dataKey] === undefined) {
      return { data: undefined, isLoading: true, refetch: mockRefetch };
    }
    return { data: queryDataMap[dataKey], isLoading: false, refetch: mockRefetch };
  }),
  useApiMutation: vi.fn((method: string, path: string) => {
    if (path?.includes("seed")) return { mutateAsync: mockSeedData, mutate: vi.fn(), isPending: false };
    return { mutateAsync: mockUpdateSetting, mutate: vi.fn(), isPending: false };
  }),
}));

// ─── Mock: Tabs with React state for tab switching ─────────
vi.mock("@/components/ui/tabs", async () => {
  const React = await import("react");
  const TabCtx = React.createContext({ active: "flutterwave", setActive: (_: string) => {} });

  function Tabs({ defaultValue, children }: any) {
    const [active, setActive] = React.useState(defaultValue || "flutterwave");
    return (
      <TabCtx.Provider value={{ active, setActive }}>
        <div data-testid="tabs">{children}</div>
      </TabCtx.Provider>
    );
  }

  function TabsList({ children }: any) {
    return <div data-testid="tabs-list">{children}</div>;
  }

  function TabsTrigger({ value, children }: any) {
    const { active, setActive } = React.useContext(TabCtx);
    return (
      <button
        data-testid={`tab-trigger-${value}`}
        data-state={active === value ? "active" : "inactive"}
        onClick={() => setActive(value)}
      >
        {children}
      </button>
    );
  }

  function TabsContent({ value, children }: any) {
    const { active } = React.useContext(TabCtx);
    if (active !== value) return null;
    return <div data-testid={`tab-content-${value}`}>{children}</div>;
  }

  return { Tabs, TabsList, TabsTrigger, TabsContent };
});

// ─── Mock: Switch ──────────────────────────────────────────
vi.mock("@/components/ui/switch", () => ({
  Switch: ({ checked, onCheckedChange, className }: any) => (
    <button
      role="switch"
      aria-checked={checked}
      data-testid="switch"
      className={className}
      onClick={() => onCheckedChange?.(!checked)}
    />
  ),
}));

// ─── Mock: react-router (LastChanged deep link) ───────────
vi.mock("react-router", () => ({
  Link: ({ to, children, ...rest }: any) => <a href={to} {...rest}>{children}</a>,
}));

// ─── Mock: fetch ──────────────────────────────────────────
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// ─── Mock: navigator.clipboard ─────────────────────────────
Object.defineProperty(navigator, "clipboard", {
  value: { writeText: vi.fn(async () => undefined) },
  writable: true,
  configurable: true,
});

// ─── Import component ──────────────────────────────────────
import AdminSettings from "@/pages/admin/AdminSettings";
import { toast } from "sonner";

// ─── Helpers ──────────────────────────────────────────────
function clearAllQueryData() {
  Object.keys(queryDataMap).forEach((k) => delete queryDataMap[k]);
}

function setQueryData(updates: Record<string, any>) {
  Object.keys(queryDataMap).forEach((k) => delete queryDataMap[k]);
  Object.assign(queryDataMap, { "admin/settings": [], ...updates });
}

// ─── Tests ────────────────────────────────────────────────
describe("AdminSettings Page", () => {
  beforeEach(() => {
    clearAllQueryData();
    vi.clearAllMocks();
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ message: "ok" }) });
  });

  // ─── Loading state ─────────────────────────────────────
  describe("Loading State", () => {
    it("shows spinner when data is loading", () => {
      clearAllQueryData();
      const { container } = render(<AdminSettings />);
      expect(container.querySelector("[aria-label='Loading']")).toBeTruthy();
    });

    it("hides spinner once loaded", () => {
      setQueryData({});
      const { container } = render(<AdminSettings />);
      expect(container.querySelector("[aria-label='Loading']")).toBeNull();
    });
  });

  // ─── Page header ───────────────────────────────────────
  describe("Page Header", () => {
    it("renders title", () => {
      setQueryData({});
      render(<AdminSettings />);
      expect(screen.getByText("Payment Settings")).toBeTruthy();
    });

    it("renders description", () => {
      setQueryData({});
      render(<AdminSettings />);
      expect(screen.getByText(/Configure payment providers/)).toBeTruthy();
    });

    it("renders Seed Data button", () => {
      setQueryData({});
      render(<AdminSettings />);
      expect(screen.getByText("Seed All Demo Data")).toBeTruthy();
    });
  });

  // ─── Live/Test mode toggle ─────────────────────────────
  describe("Live/Test Mode", () => {
    it("defaults to test mode", () => {
      setQueryData({});
      render(<AdminSettings />);
      expect(screen.getByText("Test Mode")).toBeTruthy();
      expect(screen.getByText("SANDBOX")).toBeTruthy();
    });

    it("shows safe to test message in test mode", () => {
      setQueryData({});
      render(<AdminSettings />);
      expect(screen.getByText(/Safe to test/)).toBeTruthy();
    });

    it("switches to live mode with confirmation dialog", async () => {
      const user = userEvent.setup();
      setQueryData({});
      render(<AdminSettings />);
      // Click the mode switch
      const switches = screen.getAllByRole("switch");
      await user.click(switches[0]);
      // Confirmation dialog should appear
      expect(screen.getByText("Switch to Live Mode?")).toBeTruthy();
    });

    it("confirms switch to live mode", async () => {
      const user = userEvent.setup();
      setQueryData({});
      render(<AdminSettings />);
      // Open confirmation
      const switches = screen.getAllByRole("switch");
      await user.click(switches[0]);
      // Confirm
      await user.click(screen.getByText("Yes, Switch to Live"));
      expect(screen.getByText("Live Mode")).toBeTruthy();
      expect(screen.getByText("PRODUCTION")).toBeTruthy();
    });

    it("cancels switch to live mode", async () => {
      const user = userEvent.setup();
      setQueryData({});
      render(<AdminSettings />);
      const switches = screen.getAllByRole("switch");
      await user.click(switches[0]);
      await user.click(screen.getByText("Cancel"));
      expect(screen.getByText("Test Mode")).toBeTruthy();
    });

    it("shows live mode warning banner when in live mode", async () => {
      const user = userEvent.setup();
      setQueryData({});
      render(<AdminSettings />);
      const switches = screen.getAllByRole("switch");
      await user.click(switches[0]);
      await user.click(screen.getByText("Yes, Switch to Live"));
      expect(screen.getByText(/Production Mode Active/)).toBeTruthy();
      expect(screen.getByText(/Real payments will be processed/)).toBeTruthy();
    });

    it("switches back to test mode from live mode", async () => {
      const user = userEvent.setup();
      setQueryData({});
      render(<AdminSettings />);
      const switches = screen.getAllByRole("switch");
      await user.click(switches[0]);
      await user.click(screen.getByText("Yes, Switch to Live"));
      await user.click(screen.getByText("Switch Back to Test Mode"));
      expect(screen.getByText("Test Mode")).toBeTruthy();
    });
  });

  // ─── Tabs ──────────────────────────────────────────────
  describe("Tabs", () => {
    it("renders all four tab triggers", () => {
      setQueryData({});
      render(<AdminSettings />);
      expect(screen.getByTestId("tab-trigger-flutterwave")).toBeTruthy();
      expect(screen.getByTestId("tab-trigger-paystack")).toBeTruthy();
      expect(screen.getByTestId("tab-trigger-resend")).toBeTruthy();
      expect(screen.getByTestId("tab-trigger-webhooks")).toBeTruthy();
    });

    it("defaults to Flutterwave tab", () => {
      setQueryData({});
      render(<AdminSettings />);
      expect(screen.getByText("Test API Keys")).toBeTruthy();
    });

    it("switches to Paystack tab", async () => {
      const user = userEvent.setup();
      setQueryData({});
      render(<AdminSettings />);
      await user.click(screen.getByTestId("tab-trigger-paystack"));
      expect(screen.getByText("Coming Soon")).toBeTruthy();
    });

    it("switches to Resend tab", async () => {
      const user = userEvent.setup();
      setQueryData({});
      render(<AdminSettings />);
      await user.click(screen.getByTestId("tab-trigger-resend"));
      expect(screen.getByText("Resend Email Service")).toBeTruthy();
    });

    it("switches to Webhooks tab", async () => {
      const user = userEvent.setup();
      setQueryData({});
      render(<AdminSettings />);
      await user.click(screen.getByTestId("tab-trigger-webhooks"));
      expect(screen.getByText("Webhook Configuration")).toBeTruthy();
    });
  });

  // ─── Flutterwave config ────────────────────────────────
  describe("Flutterwave Config", () => {
    it("renders env-var status badges instead of secret inputs", () => {
      setQueryData({});
      render(<AdminSettings />);
      expect(screen.getByText("Public Key")).toBeTruthy();
      expect(screen.getByText("Secret Key")).toBeTruthy();
      expect(screen.getByText("Verif Hash (Webhook Signature)")).toBeTruthy();
      // Secrets are env-managed — status badges surface the runtime state and
      // no FLWSECK input is rendered.
      expect(screen.getByText(/FLW_SECRET_KEY.*Not configured/)).toBeTruthy();
      expect(screen.getByText(/FLW_SECRET_HASH.*Not configured/)).toBeTruthy();
      expect(screen.queryByPlaceholderText(/FLWSECK/)).toBeNull();
    });

    it("renders Save button disabled when keys are empty", () => {
      setQueryData({});
      render(<AdminSettings />);
      const saveBtn = screen.getByText("Save Test Config").closest("button");
      expect(saveBtn).toBeDisabled();
    });

    it("enables Save button once the public key is filled", async () => {
      const user = userEvent.setup();
      setQueryData({});
      render(<AdminSettings />);
      const publicKeyInput = screen.getByPlaceholderText(/FLWPUBK_TEST/);
      await user.type(publicKeyInput, "FLWPUBK_TEST-abc123");
      const saveBtn = screen.getByText("Save Test Config").closest("button");
      expect(saveBtn).not.toBeDisabled();
    });

    it("saves Flutterwave config on Save click without persisting secrets", async () => {
      const user = userEvent.setup();
      setQueryData({});
      render(<AdminSettings />);
      await user.type(screen.getByPlaceholderText(/FLWPUBK_TEST/), "FLWPUBK_TEST-abc123");
      await user.click(screen.getByText("Save Test Config").closest("button")!);
      await waitFor(() => {
        expect(toast.success).toHaveBeenCalledWith(expect.stringContaining("Flutterwave"));
      });
      // The persisted config carries the public key but never a secret key.
      const saveCall = mockFetch.mock.calls.find((c: any) => String(c[0]).includes("flutterwave_test_config"));
      const body = JSON.parse(saveCall![1].body);
      expect(body.value.publicKey).toBe("FLWPUBK_TEST-abc123");
      expect(body.value.secretKey).toBeUndefined();
    });

    it("shows test mode indicator stripe", () => {
      setQueryData({});
      render(<AdminSettings />);
      expect(screen.getByText("Editing TEST (Sandbox) keys")).toBeTruthy();
    });

    it("shows key status summary", () => {
      setQueryData({});
      render(<AdminSettings />);
      expect(screen.getByText("Key Status Summary")).toBeTruthy();
      expect(screen.getByText("Test Keys")).toBeTruthy();
      expect(screen.getByText("Live Keys")).toBeTruthy();
    });

    it("shows test mode notice when TEST keys are entered", async () => {
      const user = userEvent.setup();
      setQueryData({});
      render(<AdminSettings />);
      await user.type(screen.getByPlaceholderText(/FLWPUBK_TEST/), "FLWPUBK_TEST-abc123");
      // The yellow notice box tells user to switch to live mode for production
      expect(screen.getByText(/Switch to live mode above when/)).toBeTruthy();
    });

    it("loads existing test config from settings (secrets are not persisted)", () => {
      setQueryData({
        "admin/settings": [
          { key: "flutterwave_test_config", value: { publicKey: "FLWPUBK_TEST-existing", webhookUrl: "", isEnabled: true } },
        ],
      });
      render(<AdminSettings />);
      expect(screen.getByDisplayValue("FLWPUBK_TEST-existing")).toBeTruthy();
      // Secrets are stripped at write time — no secret input/value renders.
      expect(screen.queryByDisplayValue("FLWSECK_TEST-existing")).toBeNull();
      expect(screen.queryByPlaceholderText(/FLWSECK/)).toBeNull();
    });
  });

  // ─── Live mode key editing ─────────────────────────────
  describe("Live Mode Key Editing", () => {
    it("shows live mode indicator stripe when editing live keys", async () => {
      const user = userEvent.setup();
      setQueryData({});
      render(<AdminSettings />);
      const switches = screen.getAllByRole("switch");
      await user.click(switches[0]);
      await user.click(screen.getByText("Yes, Switch to Live"));
      expect(screen.getByText("Editing LIVE (Production) keys")).toBeTruthy();
    });

    it("shows live public-key placeholder and env badges when in live mode", async () => {
      const user = userEvent.setup();
      setQueryData({});
      render(<AdminSettings />);
      const switches = screen.getAllByRole("switch");
      await user.click(switches[0]);
      await user.click(screen.getByText("Yes, Switch to Live"));
      expect(screen.getByPlaceholderText(/FLWPUBK_live/)).toBeTruthy();
      // Secrets are shared across modes and come from the environment.
      expect(screen.getByText(/FLW_SECRET_KEY.*Not configured/)).toBeTruthy();
      expect(screen.queryByPlaceholderText(/FLWSECK_live/)).toBeNull();
    });
  });

  // ─── Seed Data ─────────────────────────────────────────
  describe("Seed Data", () => {
    it("calls seed API on Seed All Demo Data click", async () => {
      const user = userEvent.setup();
      mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, message: "All demo data seeded successfully!" }) });
      setQueryData({});
      render(<AdminSettings />);
      await user.click(screen.getByText("Seed All Demo Data"));
      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith("/api/seed/bulk", expect.objectContaining({ method: "POST" }));
        expect(toast.success).toHaveBeenCalledWith("All demo data seeded successfully!");
      });
    });
  });

  // ─── Resend tab ────────────────────────────────────────
  describe("Resend Tab", () => {
    it("renders Resend API key input", async () => {
      const user = userEvent.setup();
      setQueryData({});
      render(<AdminSettings />);
      await user.click(screen.getByTestId("tab-trigger-resend"));
      expect(screen.getByText("Resend API Key")).toBeTruthy();
      expect(screen.getByText("From Email")).toBeTruthy();
    });

    it("renders test email section", async () => {
      const user = userEvent.setup();
      setQueryData({});
      render(<AdminSettings />);
      await user.click(screen.getByTestId("tab-trigger-resend"));
      expect(screen.getByText("Send Test Email")).toBeTruthy();
      expect(screen.getByText("Send Test")).toBeTruthy();
    });

    it("saves Resend config without persisting the API key", async () => {
      const user = userEvent.setup();
      setQueryData({});
      render(<AdminSettings />);
      await user.click(screen.getByTestId("tab-trigger-resend"));
      await user.click(screen.getByText("Save Resend Config").closest("button")!);
      await waitFor(() => {
        expect(toast.success).toHaveBeenCalledWith("Resend email configuration saved");
      });
      // The API key is env-managed — the persisted config never contains it.
      const saveCall = mockFetch.mock.calls.find((c: any) => String(c[0]).includes("resend_config"));
      const body = JSON.parse(saveCall![1].body);
      expect(body.value.fromEmail).toContain("noreply");
      expect(body.value.apiKey).toBeUndefined();
    });
  });

  // ─── Webhooks tab ──────────────────────────────────────
  describe("Webhooks Tab", () => {
    it("renders webhook configuration", async () => {
      const user = userEvent.setup();
      setQueryData({});
      render(<AdminSettings />);
      await user.click(screen.getByTestId("tab-trigger-webhooks"));
      expect(screen.getByText("Webhook Configuration")).toBeTruthy();
      expect(screen.getByText("Flutterwave Webhook URL")).toBeTruthy();
      expect(screen.getByText("Paystack Webhook URL")).toBeTruthy();
    });

    it("renders setup instructions", async () => {
      const user = userEvent.setup();
      setQueryData({});
      render(<AdminSettings />);
      await user.click(screen.getByTestId("tab-trigger-webhooks"));
      expect(screen.getByText("Setup Instructions")).toBeTruthy();
    });

    it("has copy buttons for webhook URLs", async () => {
      const user = userEvent.setup();
      setQueryData({});
      render(<AdminSettings />);
      await user.click(screen.getByTestId("tab-trigger-webhooks"));
      const copyButtons = screen.getAllByRole("button").filter(
        (btn) => btn.querySelector("svg") && btn.closest(".flex.gap-2")
      );
      expect(copyButtons.length).toBeGreaterThanOrEqual(2);
    });
  });

  // ─── Full integration ──────────────────────────────────
  describe("Full Integration", () => {
    it("renders complete page with all sections", () => {
      setQueryData({});
      render(<AdminSettings />);
      expect(screen.getByText("Payment Settings")).toBeTruthy();
      expect(screen.getByText("Test Mode")).toBeTruthy();
      expect(screen.getByTestId("tabs")).toBeTruthy();
      expect(screen.getByText("Seed All Demo Data")).toBeTruthy();
    });

    it("renders with pre-existing config", () => {
      setQueryData({
        "admin/settings": [
          { key: "flutterwave_test_config", value: { publicKey: "FLWPUBK_TEST-abc", secretKey: "FLWSECK_TEST-xyz", isEnabled: true } },
          { key: "resend_config", value: { apiKey: "re_test123", isEnabled: true } },
        ],
      });
      render(<AdminSettings />);
      expect(screen.getByDisplayValue("FLWPUBK_TEST-abc")).toBeTruthy();
    });
  });

  // ─── Last changed attribution ────────────────────────
  describe("Last Changed Attribution", () => {
    it("renders the 'Last changed by' line as a deep link to the filtered audit log", () => {
      setQueryData({
        "admin/settings": [
          {
            key: "flutterwave_config",
            value: { publicKey: "FLWPUBK_TEST-abc", secretKey: "FLWSECK_TEST-xyz", isEnabled: true },
            lastChangedAt: Date.now() - 60 * 60 * 1000,
            lastChangedBy: "Ada Obi",
            lastChangedByEmail: "ada@afrifundedcapital.com",
            lastChangedAction: "settings.updated",
            lastChangedUserId: 3,
            lastChangedUserDeleted: false,
          },
        ],
      });
      render(<AdminSettings />);

      const link = screen.getByText("Ada Obi").closest("a");
      expect(link).toBeTruthy();
      expect(link!.getAttribute("href")).toBe("/admin/audit-logs?entity=setting&entityId=flutterwave_config");
      expect(screen.getByText(/Last changed by/)).toBeTruthy();
      expect(screen.getByText("1h ago")).toBeTruthy();
    });

    it("hides the attribution for configs that were never changed", () => {
      setQueryData({
        "admin/settings": [
          { key: "flutterwave_config", value: { publicKey: "", secretKey: "", isEnabled: true } },
        ],
      });
      render(<AdminSettings />);
      expect(screen.queryByText(/Last changed by/)).toBeNull();
    });

    it("falls back to a deleted-user label when the actor's account is gone", () => {
      setQueryData({
        "admin/settings": [
          {
            key: "flutterwave_config",
            value: { publicKey: "", secretKey: "", isEnabled: true },
            lastChangedAt: Date.now() - 60 * 1000,
            lastChangedBy: null,
            lastChangedUserDeleted: true,
            lastChangedUserId: 42,
            lastChangedAction: "settings.created",
          },
        ],
      });
      render(<AdminSettings />);
      expect(screen.getByText("Deleted user #42")).toBeTruthy();
      expect(screen.getByText(/Last changed by/)).toBeTruthy();
    });

    it("renders a View history button on each config card linking to the filtered audit log", async () => {
      const user = userEvent.setup();
      // Empty settings — the button is discoverable even before a config is ever changed
      setQueryData({});
      render(<AdminSettings />);

      const hrefOf = () => screen.getByText("View history").closest("a")!.getAttribute("href");

      // Flutterwave (default tab)
      expect(hrefOf()).toBe("/admin/audit-logs?entity=setting&entityId=flutterwave_config");

      await user.click(screen.getByTestId("tab-trigger-paystack"));
      expect(hrefOf()).toBe("/admin/audit-logs?entity=setting&entityId=paystack_config");

      await user.click(screen.getByTestId("tab-trigger-resend"));
      expect(hrefOf()).toBe("/admin/audit-logs?entity=setting&entityId=resend_config");

      await user.click(screen.getByTestId("tab-trigger-affiliate"));
      expect(hrefOf()).toBe("/admin/audit-logs?entity=setting&entityId=affiliate_auto_approve_threshold");
    });
  });
});
