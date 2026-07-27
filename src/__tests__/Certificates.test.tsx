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

vi.mock("@/hooks/use-api", () => ({
  useApiQuery: vi.fn((key: string[], path: string, _opts?: any) => {
    const dataKey = `${key.join("/")}`;
    if (queryDataMap[dataKey] === undefined) {
      return { data: undefined, isLoading: true };
    }
    return { data: queryDataMap[dataKey], isLoading: false };
  }),
  useApiMutation: vi.fn((_method: string, _path: string, _onSuccess?: any) => ({
    mutateAsync: vi.fn(),
    mutate: vi.fn(),
    isPending: false,
  })),
}));

// ─── Mock: window.open ────────────────────────────────────
const mockWindowOpen = vi.fn();
vi.stubGlobal("open", mockWindowOpen);

// ─── Mock: fetch for PDF download ─────────────────────────
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// ─── Mock: URL.createObjectURL ────────────────────────────
vi.stubGlobal("URL", {
  createObjectURL: vi.fn(() => "blob:http://localhost/fake-url"),
  revokeObjectURL: vi.fn(),
});

// ─── Import component after mocks ─────────────────────────
import Certificates from "@/pages/dashboard/Certificates";

// ─── Test data factories ──────────────────────────────────
function makeCertificate(overrides: any = {}) {
  return {
    id: 1,
    type: "phase_1_passed",
    certificateNumber: "AFC-2025-001",
    issuedAt: Date.now() - 86400000 * 5,
    verificationCode: "ABC123XYZ",
    challengeId: 10,
    accountSize: 50000,
    ...overrides,
  };
}

// ─── Helpers ──────────────────────────────────────────────
function clearAllQueryData() {
  Object.keys(queryDataMap).forEach((k) => delete queryDataMap[k]);
}

function setQueryData(updates: Record<string, any>) {
  Object.keys(queryDataMap).forEach((k) => delete queryDataMap[k]);
  Object.assign(queryDataMap, { "certificates/my": [], ...updates });
}

// ─── Tests ────────────────────────────────────────────────
describe("Certificates Page", () => {
  beforeEach(() => {
    clearAllQueryData();
    vi.clearAllMocks();
    mockWindowOpen.mockClear();
    mockFetch.mockResolvedValue({
      ok: true,
      blob: async () => new Blob(["fake-pdf"]),
    });
  });

  // ─── Loading state ─────────────────────────────────────
  describe("Loading State", () => {
    it("shows a spinner when data is loading", () => {
      clearAllQueryData();
      const { container } = render(<Certificates />);
      expect(container.querySelector(".animate-spin")).toBeTruthy();
    });

    it("hides spinner once data is loaded", () => {
      setQueryData({});
      const { container } = render(<Certificates />);
      expect(container.querySelector(".animate-spin")).toBeNull();
    });
  });

  // ─── Page header ───────────────────────────────────────
  describe("Page Header", () => {
    it("renders the Certificates title", () => {
      setQueryData({});
      render(<Certificates />);
      expect(screen.getByText("Certificates")).toBeTruthy();
    });

    it("renders the page description", () => {
      setQueryData({});
      render(<Certificates />);
      expect(screen.getByText(/View and download/)).toBeTruthy();
    });
  });

  // ─── Empty state ───────────────────────────────────────
  describe("Empty State", () => {
    it("shows empty state when no certificates exist", () => {
      setQueryData({ "certificates/my": [] });
      render(<Certificates />);
      expect(screen.getByText("No certificates yet")).toBeTruthy();
    });

    it("shows hint text about earning certificates", () => {
      setQueryData({ "certificates/my": [] });
      render(<Certificates />);
      expect(screen.getByText(/Complete a challenge phase/)).toBeTruthy();
    });
  });

  // ─── Certificate list ──────────────────────────────────
  describe("Certificate List", () => {
    it("renders a single certificate", () => {
      setQueryData({
        "certificates/my": [makeCertificate({ type: "phase_1_passed" })],
      });
      render(<Certificates />);
      expect(screen.getByText((t) => t.includes("Phase 1 Passed") && t.includes("Certificate"))).toBeTruthy();
    });

    it("renders multiple certificates", () => {
      setQueryData({
        "certificates/my": [
          makeCertificate({ id: 1, type: "phase_1_passed", certificateNumber: "AFC-001" }),
          makeCertificate({ id: 2, type: "phase_2_passed", certificateNumber: "AFC-002" }),
        ],
      });
      render(<Certificates />);
      expect(screen.getByText(/AFC-001/)).toBeTruthy();
      expect(screen.getByText(/AFC-002/)).toBeTruthy();
    });

    it("displays certificate number", () => {
      setQueryData({
        "certificates/my": [makeCertificate({ certificateNumber: "CERT-999" })],
      });
      render(<Certificates />);
      expect(screen.getByText(/CERT-999/)).toBeTruthy();
    });

    it("displays formatted issued date", () => {
      const date = new Date("2025-06-15");
      setQueryData({
        "certificates/my": [makeCertificate({ issuedAt: date.getTime() })],
      });
      render(<Certificates />);
      expect(screen.getByText(/6\/15\/2025/)).toBeTruthy();
    });

    it("handles null issuedAt gracefully", () => {
      setQueryData({
        "certificates/my": [makeCertificate({ issuedAt: null })],
      });
      render(<Certificates />);
      expect(screen.getByText(/CERT-999|AFC-2025-001/)).toBeTruthy();
    });
  });

  // ─── Certificate type formatting ───────────────────────
  describe("Certificate Type Formatting", () => {
    it("formats phase_1_passed correctly", () => {
      setQueryData({
        "certificates/my": [makeCertificate({ type: "phase_1_passed" })],
      });
      render(<Certificates />);
      expect(screen.getByText(/Phase 1 Passed/)).toBeTruthy();
    });

    it("formats phase_2_passed correctly", () => {
      setQueryData({
        "certificates/my": [makeCertificate({ type: "phase_2_passed" })],
      });
      render(<Certificates />);
      expect(screen.getByText(/Phase 2 Passed/)).toBeTruthy();
    });

    it("formats funded correctly", () => {
      setQueryData({
        "certificates/my": [makeCertificate({ type: "funded" })],
      });
      render(<Certificates />);
      expect(screen.getByText(/Funded Certificate/)).toBeTruthy();
    });

    it("shows type badge", () => {
      setQueryData({
        "certificates/my": [makeCertificate({ type: "phase_1_passed" })],
      });
      render(<Certificates />);
      expect(screen.getByText("phase_1_passed")).toBeTruthy();
    });
  });

  // ─── Verify button ─────────────────────────────────────
  describe("Verify Button", () => {
    it("shows Verify button when verificationCode exists", () => {
      setQueryData({
        "certificates/my": [makeCertificate({ verificationCode: "VERIFY123" })],
      });
      render(<Certificates />);
      expect(screen.getByText("Verify")).toBeTruthy();
    });

    it("hides Verify button when no verificationCode", () => {
      setQueryData({
        "certificates/my": [makeCertificate({ verificationCode: null })],
      });
      render(<Certificates />);
      expect(screen.queryByText("Verify")).toBeNull();
    });

    it("opens verification URL when Verify is clicked", async () => {
      const user = userEvent.setup();
      setQueryData({
        "certificates/my": [makeCertificate({ verificationCode: "VERIFY123" })],
      });
      render(<Certificates />);
      await user.click(screen.getByText("Verify"));
      expect(mockWindowOpen).toHaveBeenCalledWith("/verify/VERIFY123", "_blank");
    });
  });

  // ─── Download PDF ──────────────────────────────────────
  describe("Download PDF", () => {
    it("renders PDF button for each certificate", () => {
      setQueryData({
        "certificates/my": [makeCertificate()],
      });
      render(<Certificates />);
      expect(screen.getByText("PDF")).toBeTruthy();
    });

    it("calls fetch API when PDF button is clicked", async () => {
      const user = userEvent.setup();
      setQueryData({
        "certificates/my": [makeCertificate({ id: 1, certificateNumber: "CERT-001" })],
      });
      render(<Certificates />);
      await user.click(screen.getByText("PDF"));
      expect(mockFetch).toHaveBeenCalledWith("/api/certificates/1/pdf", { credentials: "include" });
    });

    it("disables PDF button while downloading", async () => {
      const user = userEvent.setup();
      let resolveFetch: (v: any) => void;
      mockFetch.mockImplementation(() => new Promise((r) => { resolveFetch = r; }));
      setQueryData({
        "certificates/my": [makeCertificate({ id: 1 })],
      });
      render(<Certificates />);

      const pdfButton = screen.getByText("PDF").closest("button")!;
      await user.click(pdfButton);

      // Button should be disabled during download
      expect(pdfButton).toBeDisabled();

      resolveFetch!({ ok: true, blob: async () => new Blob() });
      await waitFor(() => {
        expect(pdfButton).not.toBeDisabled();
      });
    });

    it("shows spinner during download", async () => {
      const user = userEvent.setup();
      let resolveFetch: (v: any) => void;
      mockFetch.mockImplementation(() => new Promise((r) => { resolveFetch = r; }));
      setQueryData({
        "certificates/my": [makeCertificate({ id: 1 })],
      });
      const { container } = render(<Certificates />);

      await user.click(screen.getByText("PDF"));
      expect(container.querySelector(".animate-spin")).toBeTruthy();

      resolveFetch!({ ok: true, blob: async () => new Blob() });
    });
  });

  // ─── Multiple certificates ─────────────────────────────
  describe("Multiple Certificates", () => {
    it("renders different certificate types", () => {
      setQueryData({
        "certificates/my": [
          makeCertificate({ id: 1, type: "phase_1_passed", certificateNumber: "CERT-001" }),
          makeCertificate({ id: 2, type: "phase_2_passed", certificateNumber: "CERT-002" }),
          makeCertificate({ id: 3, type: "funded", certificateNumber: "CERT-003" }),
        ],
      });
      render(<Certificates />);
      expect(screen.getByText(/Phase 1 Passed/)).toBeTruthy();
      expect(screen.getByText(/Phase 2 Passed/)).toBeTruthy();
      expect(screen.getByText(/Funded/)).toBeTruthy();
    });

    it("renders Verify buttons only for certs with codes", () => {
      setQueryData({
        "certificates/my": [
          makeCertificate({ id: 1, verificationCode: "CODE1" }),
          makeCertificate({ id: 2, verificationCode: null }),
          makeCertificate({ id: 3, verificationCode: "CODE3" }),
        ],
      });
      render(<Certificates />);
      const verifyButtons = screen.getAllByText("Verify");
      expect(verifyButtons.length).toBe(2);
    });

    it("renders PDF button for each certificate", () => {
      setQueryData({
        "certificates/my": [
          makeCertificate({ id: 1 }),
          makeCertificate({ id: 2 }),
          makeCertificate({ id: 3 }),
        ],
      });
      render(<Certificates />);
      const pdfButtons = screen.getAllByText("PDF");
      expect(pdfButtons.length).toBe(3);
    });
  });

  // ─── Full integration ──────────────────────────────────
  describe("Full Integration", () => {
    it("renders complete page with all sections", () => {
      setQueryData({
        "certificates/my": [
          makeCertificate({ id: 1, type: "phase_1_passed", certificateNumber: "AFC-001", verificationCode: "V1" }),
          makeCertificate({ id: 2, type: "funded", certificateNumber: "AFC-002", verificationCode: "V2" }),
        ],
      });
      render(<Certificates />);

      // Header
      expect(screen.getByText("Certificates")).toBeTruthy();
      expect(screen.getByText(/View and download/)).toBeTruthy();

      // Certificates
      expect(screen.getByText(/AFC-001/)).toBeTruthy();
      expect(screen.getByText(/AFC-002/)).toBeTruthy();

      // Buttons
      expect(screen.getAllByText("Verify").length).toBe(2);
      expect(screen.getAllByText("PDF").length).toBe(2);
    });

    it("handles many certificates", () => {
      const certs = Array.from({ length: 15 }, (_, i) =>
        makeCertificate({ id: i + 1, type: "phase_1_passed", certificateNumber: `CERT-${i + 1}` })
      );
      setQueryData({ "certificates/my": certs });
      render(<Certificates />);
      expect(screen.getByText((t) => t.includes("CERT-1 ") || t.includes("CERT-1\n"))).toBeTruthy();
      expect(screen.getByText(/CERT-15/)).toBeTruthy();
    });
  });
});
