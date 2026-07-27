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

// ─── Mock: react-router ───────────────────────────────────
const mockParams: Record<string, string> = { verificationCode: "TEST123" };
vi.mock("react-router", () => ({
  useParams: () => mockParams,
  Link: ({ children, ...props }: any) => <a {...props}>{children}</a>,
}));

// ─── Mock: useAuth ─────────────────────────────────────────
vi.mock("@/hooks/use-auth", () => ({
  useAuth: vi.fn(() => ({
    isLoading: false,
    isAuthenticated: false,
    user: null,
    error: null,
    signIn: vi.fn(),
    signOut: vi.fn(),
    refetch: vi.fn(),
  })),
}));

// ─── Mock: useApiQuery ────────────────────────────────────
const queryDataMap: Record<string, any> = {};

vi.mock("@/hooks/use-api", () => ({
  useApiQuery: vi.fn((key: string[], path: string, opts?: any) => {
    const dataKey = `${key.join("/")}`;
    if (queryDataMap[dataKey] === undefined) {
      return { data: undefined, isLoading: true };
    }
    return { data: queryDataMap[dataKey], isLoading: false };
  }),
}));

// ─── Mock: navigator.clipboard ─────────────────────────────
const mockWriteText = vi.fn(async () => undefined);
Object.defineProperty(navigator, "clipboard", {
  value: { writeText: mockWriteText },
  writable: true,
  configurable: true,
});

// ─── Mock: window.print ────────────────────────────────────
const mockPrint = vi.fn();
vi.stubGlobal("print", mockPrint);

// ─── Import component after mocks ─────────────────────────
import VerifyCertificate from "@/pages/VerifyCertificate";
import { toast } from "sonner";

// ─── Test data factories ──────────────────────────────────
function makeVerifyResult(overrides: any = {}) {
  return {
    valid: true,
    type: "phase_1",
    certificateNumber: "AFC-2025-001",
    issuedAt: Date.now() - 86400000 * 10,
    traderName: "John Doe",
    accountSize: 50000,
    challengeName: "$50K Evaluation",
    ...overrides,
  };
}

// ─── Helpers ──────────────────────────────────────────────
function clearAllQueryData() {
  Object.keys(queryDataMap).forEach((k) => delete queryDataMap[k]);
}

function setQueryData(updates: Record<string, any>) {
  Object.keys(queryDataMap).forEach((k) => delete queryDataMap[k]);
  Object.assign(queryDataMap, updates);
}

// ─── Tests ────────────────────────────────────────────────
describe("VerifyCertificate Page", () => {
  beforeEach(() => {
    clearAllQueryData();
    vi.clearAllMocks();
    mockWriteText.mockClear();
    mockPrint.mockClear();
    mockParams.verificationCode = "TEST123";
  });

  // ─── Loading state ─────────────────────────────────────
  describe("Loading State", () => {
    it("shows spinner when data is loading", () => {
      clearAllQueryData();
      const { container } = render(<VerifyCertificate />);
      expect(container.querySelector(".animate-spin")).toBeTruthy();
    });

    it("shows verifying text while loading", () => {
      clearAllQueryData();
      render(<VerifyCertificate />);
      expect(screen.getByText(/Verifying certificate/)).toBeTruthy();
    });

    it("hides spinner once data is loaded", () => {
      setQueryData({ "cert-verify/TEST123": makeVerifyResult() });
      const { container } = render(<VerifyCertificate />);
      expect(container.querySelector(".animate-spin")).toBeNull();
    });
  });

  // ─── Not Found state ───────────────────────────────────
  describe("Not Found", () => {
    it("shows Certificate Not Found when result is invalid", () => {
      setQueryData({ "cert-verify/TEST123": { valid: false } });
      render(<VerifyCertificate />);
      expect(screen.getByText("Certificate Not Found")).toBeTruthy();
    });

    it("shows the verification code in not found message", () => {
      setQueryData({ "cert-verify/TEST123": { valid: false } });
      render(<VerifyCertificate />);
      expect(screen.getByText("TEST123")).toBeTruthy();
    });

    it("shows not found description", () => {
      setQueryData({ "cert-verify/TEST123": { valid: false } });
      render(<VerifyCertificate />);
      expect(screen.getByText(/couldn't find a certificate/)).toBeTruthy();
    });

    it("renders Visit AfriFundedCapital link in not found", () => {
      setQueryData({ "cert-verify/TEST123": { valid: false } });
      render(<VerifyCertificate />);
      expect(screen.getByText("Visit AfriFundedCapital")).toBeTruthy();
    });
  });

  // ─── Valid certificate - Header ────────────────────────
  describe("Valid Certificate Header", () => {
    it("renders AfriFundedCapital title", () => {
      setQueryData({ "cert-verify/TEST123": makeVerifyResult() });
      render(<VerifyCertificate />);
      expect(screen.getByText("AfriFundedCapital")).toBeTruthy();
    });

    it("shows Certificate Verified badge", () => {
      setQueryData({ "cert-verify/TEST123": makeVerifyResult() });
      render(<VerifyCertificate />);
      expect(screen.getByText("Certificate Verified")).toBeTruthy();
    });
  });

  // ─── Valid certificate - Trader name ───────────────────
  describe("Trader Name", () => {
    it("displays trader name", () => {
      setQueryData({ "cert-verify/TEST123": makeVerifyResult({ traderName: "Jane Smith" }) });
      render(<VerifyCertificate />);
      expect(screen.getByText("Jane Smith")).toBeTruthy();
    });

    it("shows Trader label", () => {
      setQueryData({ "cert-verify/TEST123": makeVerifyResult() });
      render(<VerifyCertificate />);
      expect(screen.getByText("Trader")).toBeTruthy();
    });
  });

  // ─── Valid certificate - Type labels ───────────────────
  describe("Type Labels", () => {
    it("shows Phase 1 Evaluation Passed for phase_1", () => {
      setQueryData({ "cert-verify/TEST123": makeVerifyResult({ type: "phase_1" }) });
      render(<VerifyCertificate />);
      expect(screen.getByText("Phase 1 Evaluation Passed")).toBeTruthy();
    });

    it("shows Phase 2 Evaluation Passed for phase_2", () => {
      setQueryData({ "cert-verify/TEST123": makeVerifyResult({ type: "phase_2" }) });
      render(<VerifyCertificate />);
      expect(screen.getByText("Phase 2 Evaluation Passed")).toBeTruthy();
    });

    it("shows Funded Trader Status Achieved for funded", () => {
      setQueryData({ "cert-verify/TEST123": makeVerifyResult({ type: "funded" }) });
      render(<VerifyCertificate />);
      expect(screen.getByText("Funded Trader Status Achieved")).toBeTruthy();
    });

    it("shows Certificate of Achievement for unknown type", () => {
      setQueryData({ "cert-verify/TEST123": makeVerifyResult({ type: "custom" }) });
      render(<VerifyCertificate />);
      expect(screen.getByText("Certificate of Achievement")).toBeTruthy();
    });
  });

  // ─── Valid certificate - Details ───────────────────────
  describe("Certificate Details", () => {
    it("shows certificate number", () => {
      setQueryData({ "cert-verify/TEST123": makeVerifyResult({ certificateNumber: "AFC-999" }) });
      render(<VerifyCertificate />);
      expect(screen.getByText("Certificate Number")).toBeTruthy();
      expect(screen.getByText("AFC-999")).toBeTruthy();
    });

    it("shows challenge name when provided", () => {
      setQueryData({ "cert-verify/TEST123": makeVerifyResult({ challengeName: "$100K Challenge" }) });
      render(<VerifyCertificate />);
      expect(screen.getByText("Challenge")).toBeTruthy();
      expect(screen.getByText("$100K Challenge")).toBeTruthy();
    });

    it("hides challenge name when not provided", () => {
      setQueryData({ "cert-verify/TEST123": makeVerifyResult({ challengeName: null }) });
      render(<VerifyCertificate />);
      expect(screen.queryByText("Challenge")).toBeNull();
    });

    it("shows account size when provided", () => {
      setQueryData({ "cert-verify/TEST123": makeVerifyResult({ accountSize: 100000 }) });
      render(<VerifyCertificate />);
      expect(screen.getByText("Account Size")).toBeTruthy();
      expect(screen.getByText("$100,000")).toBeTruthy();
    });

    it("hides account size when null", () => {
      setQueryData({ "cert-verify/TEST123": makeVerifyResult({ accountSize: null }) });
      render(<VerifyCertificate />);
      expect(screen.queryByText("Account Size")).toBeNull();
    });

    it("shows issued date when provided", () => {
      const date = new Date("2025-06-15");
      setQueryData({ "cert-verify/TEST123": makeVerifyResult({ issuedAt: date.getTime() }) });
      render(<VerifyCertificate />);
      expect(screen.getByText("Issued")).toBeTruthy();
      expect(screen.getByText(/15 June 2025/)).toBeTruthy();
    });

    it("hides issued date when null", () => {
      setQueryData({ "cert-verify/TEST123": makeVerifyResult({ issuedAt: null }) });
      render(<VerifyCertificate />);
      expect(screen.queryByText("Issued")).toBeNull();
    });
  });

  // ─── Valid certificate - Verification badge ────────────
  describe("Verification Badge", () => {
    it("shows digitally verified badge", () => {
      setQueryData({ "cert-verify/TEST123": makeVerifyResult() });
      render(<VerifyCertificate />);
      expect(screen.getByText(/Digitally verified by/)).toBeTruthy();
    });
  });

  // ─── Valid certificate - Actions ───────────────────────
  describe("Action Buttons", () => {
    it("renders Copy Verification Link button", () => {
      setQueryData({ "cert-verify/TEST123": makeVerifyResult() });
      render(<VerifyCertificate />);
      expect(screen.getByText("Copy Verification Link")).toBeTruthy();
    });

    it("renders Print / Save as PDF button", () => {
      setQueryData({ "cert-verify/TEST123": makeVerifyResult() });
      render(<VerifyCertificate />);
      expect(screen.getByText("Print / Save as PDF")).toBeTruthy();
    });

    it("renders Visit AfriFundedCapital link", () => {
      setQueryData({ "cert-verify/TEST123": makeVerifyResult() });
      render(<VerifyCertificate />);
      const links = screen.getAllByText("Visit AfriFundedCapital");
      expect(links.length).toBeGreaterThanOrEqual(1);
    });

    it("shows footer confirmation text", () => {
      setQueryData({ "cert-verify/TEST123": makeVerifyResult() });
      render(<VerifyCertificate />);
      expect(screen.getByText(/successfully completed/)).toBeTruthy();
    });
  });

  // ─── Print action ──────────────────────────────────────
  describe("Print Action", () => {
    it("calls window.print when Print button is clicked", async () => {
      const user = userEvent.setup();
      setQueryData({ "cert-verify/TEST123": makeVerifyResult() });
      render(<VerifyCertificate />);
      await user.click(screen.getByText("Print / Save as PDF"));
      expect(mockPrint).toHaveBeenCalled();
    });
  });

  // ─── Full integration ──────────────────────────────────
  describe("Full Integration", () => {
    it("renders complete valid certificate", () => {
      setQueryData({
        "cert-verify/TEST123": makeVerifyResult({
          type: "funded",
          traderName: "Jane Smith",
          certificateNumber: "AFC-2025-999",
          accountSize: 200000,
          challengeName: "$200K Funded",
          issuedAt: new Date("2025-06-15").getTime(),
        }),
      });
      render(<VerifyCertificate />);

      // Header
      expect(screen.getByText("AfriFundedCapital")).toBeTruthy();
      expect(screen.getByText("Certificate Verified")).toBeTruthy();

      // Type
      expect(screen.getByText("Funded Trader Status Achieved")).toBeTruthy();

      // Trader
      expect(screen.getByText("Jane Smith")).toBeTruthy();

      // Details
      expect(screen.getByText("AFC-2025-999")).toBeTruthy();
      expect(screen.getByText("$200K Funded")).toBeTruthy();
      expect(screen.getByText("$200,000")).toBeTruthy();
      expect(screen.getByText(/15 June 2025/)).toBeTruthy();

      // Verification
      expect(screen.getByText(/Digitally verified/)).toBeTruthy();

      // Actions
      expect(screen.getByText("Copy Verification Link")).toBeTruthy();
      expect(screen.getByText("Print / Save as PDF")).toBeTruthy();
    });

    it("renders minimal certificate without optional fields", () => {
      setQueryData({
        "cert-verify/TEST123": makeVerifyResult({
          challengeName: null,
          accountSize: null,
          issuedAt: null,
        }),
      });
      render(<VerifyCertificate />);

      expect(screen.getByText("AfriFundedCapital")).toBeTruthy();
      expect(screen.getByText("Certificate Verified")).toBeTruthy();
      expect(screen.getByText("Certificate Number")).toBeTruthy();
      expect(screen.queryByText("Challenge")).toBeNull();
      expect(screen.queryByText("Account Size")).toBeNull();
      expect(screen.queryByText("Issued")).toBeNull();
    });
  });
});
