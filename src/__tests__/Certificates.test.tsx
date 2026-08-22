// @vitest-environment jsdom
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";

// ─── Mock: sonner ──────────────────────────────────────────
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

// ─── Mock: react-router ────────────────────────────────────
const mockNavigate = vi.fn();
vi.mock("react-router", () => ({
  useNavigate: () => mockNavigate,
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

// ─── Mock: useApiQuery ─────────────────────────────────────
// The mock returns queryDataMap[dataKey] as `data`. The Certificates
// component reads `data?.certificates` for the array.
const queryDataMap: Record<string, any> = {};

vi.mock("@/hooks/use-api", () => ({
  useApiQuery: vi.fn((key: string[]) => {
    const dataKey = key.slice(0, 2).join("/");
    if (queryDataMap[dataKey] === undefined) {
      return { data: undefined, isLoading: true };
    }
    return { data: queryDataMap[dataKey], isLoading: false };
  }),
  useApiMutation: vi.fn(() => ({
    mutateAsync: vi.fn(),
    mutate: vi.fn(),
    isPending: false,
  })),
}));

// ─── Mock: window.open ────────────────────────────────────
const mockWindowOpen = vi.fn();
vi.stubGlobal("open", mockWindowOpen);

// ─── Import component after mocks ─────────────────────────
import Certificates from "@/pages/dashboard/Certificates";

// ─── Helpers ──────────────────────────────────────────────
function clearAllQueryData() {
  Object.keys(queryDataMap).forEach((k) => delete queryDataMap[k]);
}

// Component reads: data?.certificates || [] where data = queryDataMap["certificates/my"]
function setCertificates(certs: any[]) {
  Object.keys(queryDataMap).forEach((k) => delete queryDataMap[k]);
  queryDataMap["certificates/my"] = { certificates: certs };
}

function makeCertificate(overrides: any = {}) {
  return {
    id: 1,
    title: "Phase 1 Passed Certificate",
    accountSize: 50000,
    issuedAt: Date.now() - 86400000 * 5,
    certificateNumber: "AFC-2025-001",
    verified: false,
    verifyUrl: "https://verify.afrifunded.com/ABC123",
    downloadUrl: "https://cdn.afrifunded.com/certs/1.pdf",
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────
describe("Certificates Page", () => {
  beforeEach(() => {
    clearAllQueryData();
    vi.clearAllMocks();
    mockWindowOpen.mockClear();
  });

  // ─── Loading state ─────────────────────────────────────
  describe("Loading State", () => {
    it("shows a loading indicator when data is loading", () => {
      clearAllQueryData();
      const { container } = render(<Certificates />);
      expect(container.querySelector('[aria-label="Loading"]')).toBeTruthy();
    });

    it("hides loading indicator once data is loaded", () => {
      setCertificates([]);
      const { container } = render(<Certificates />);
      expect(container.querySelector('[aria-label="Loading"]')).toBeNull();
    });
  });

  // ─── Page header ───────────────────────────────────────
  describe("Page Header", () => {
    it("renders the Certificates title", () => {
      setCertificates([]);
      render(<Certificates />);
      expect(screen.getByText("Certificates")).toBeTruthy();
    });

    it("renders the page description", () => {
      setCertificates([]);
      render(<Certificates />);
      expect(screen.getByText(/funded trader certificates/)).toBeTruthy();
    });
  });

  // ─── Empty state ───────────────────────────────────────
  describe("Empty State", () => {
    it("shows empty state when no certificates exist", () => {
      setCertificates([]);
      render(<Certificates />);
      expect(screen.getByText("No certificates yet")).toBeTruthy();
    });

    it("shows hint text about earning certificates", () => {
      setCertificates([]);
      render(<Certificates />);
      expect(screen.getByText(/Complete a challenge/)).toBeTruthy();
    });

    it("renders Browse Challenges button that navigates to challenges", async () => {
      const user = userEvent.setup();
      setCertificates([]);
      render(<Certificates />);
      await user.click(screen.getByText("Browse Challenges"));
      expect(mockNavigate).toHaveBeenCalledWith("/dashboard/challenges");
    });
  });

  // ─── Certificate list ──────────────────────────────────
  describe("Certificate List", () => {
    it("renders a single certificate", () => {
      setCertificates([makeCertificate({ title: "Funded Trader Certificate" })]);
      render(<Certificates />);
      expect(screen.getByText("Funded Trader Certificate")).toBeTruthy();
    });

    it("renders multiple certificates", () => {
      setCertificates([
        makeCertificate({ id: 1, title: "Phase 1 Passed", certificateNumber: "AFC-001" }),
        makeCertificate({ id: 2, title: "Phase 2 Passed", certificateNumber: "AFC-002" }),
      ]);
      render(<Certificates />);
      expect(screen.getByText("Phase 1 Passed")).toBeTruthy();
      expect(screen.getByText("Phase 2 Passed")).toBeTruthy();
    });

    it("displays certificate number", () => {
      setCertificates([makeCertificate({ certificateNumber: "CERT-999" })]);
      render(<Certificates />);
      expect(screen.getByText(/CERT-999/)).toBeTruthy();
    });

    it("displays account size", () => {
      setCertificates([makeCertificate({ accountSize: 100000 })]);
      render(<Certificates />);
      expect(screen.getByText(/\$100,000/)).toBeTruthy();
    });
  });

  // ─── Verified / Pending badge ──────────────────────────
  describe("Status Badges", () => {
    it("shows Verified badge when certificate is verified", () => {
      setCertificates([makeCertificate({ verified: true })]);
      render(<Certificates />);
      expect(screen.getByText("Verified")).toBeTruthy();
    });

    it("shows Pending badge when certificate is not verified", () => {
      setCertificates([makeCertificate({ verified: false })]);
      render(<Certificates />);
      expect(screen.getByText("Pending")).toBeTruthy();
    });
  });

  // ─── Verify button ─────────────────────────────────────
  describe("Verify Button", () => {
    it("shows Verify button when verifyUrl exists", () => {
      setCertificates([makeCertificate({ verifyUrl: "https://verify.example.com/ABC" })]);
      render(<Certificates />);
      expect(screen.getByText("Verify")).toBeTruthy();
    });

    it("hides Verify button when no verifyUrl", () => {
      setCertificates([makeCertificate({ verifyUrl: null })]);
      render(<Certificates />);
      expect(screen.queryByText("Verify")).toBeNull();
    });

    it("opens verification URL when Verify is clicked", async () => {
      const user = userEvent.setup();
      setCertificates([makeCertificate({ verifyUrl: "https://verify.example.com/ABC" })]);
      render(<Certificates />);
      await user.click(screen.getByText("Verify"));
      expect(mockWindowOpen).toHaveBeenCalledWith("https://verify.example.com/ABC", "_blank");
    });
  });

  // ─── Download button ───────────────────────────────────
  describe("Download Button", () => {
    it("renders Download button when downloadUrl exists", () => {
      setCertificates([makeCertificate({ downloadUrl: "https://cdn.example.com/1.pdf" })]);
      render(<Certificates />);
      expect(screen.getByText("Download")).toBeTruthy();
    });

    it("hides Download button when no downloadUrl", () => {
      setCertificates([makeCertificate({ downloadUrl: null })]);
      render(<Certificates />);
      expect(screen.queryByText("Download")).toBeNull();
    });

    it("opens download URL when Download is clicked", async () => {
      const user = userEvent.setup();
      setCertificates([makeCertificate({ downloadUrl: "https://cdn.example.com/1.pdf" })]);
      render(<Certificates />);
      await user.click(screen.getByText("Download"));
      expect(mockWindowOpen).toHaveBeenCalledWith("https://cdn.example.com/1.pdf", "_blank");
    });
  });

  // ─── Multiple certificates ─────────────────────────────
  describe("Multiple Certificates", () => {
    it("renders different certificate titles", () => {
      setCertificates([
        makeCertificate({ id: 1, title: "Phase 1 Passed" }),
        makeCertificate({ id: 2, title: "Phase 2 Passed" }),
        makeCertificate({ id: 3, title: "Funded Trader Certificate" }),
      ]);
      render(<Certificates />);
      expect(screen.getByText("Phase 1 Passed")).toBeTruthy();
      expect(screen.getByText("Phase 2 Passed")).toBeTruthy();
      expect(screen.getByText("Funded Trader Certificate")).toBeTruthy();
    });

    it("renders Verify buttons only for certs with verifyUrl", () => {
      setCertificates([
        makeCertificate({ id: 1, verifyUrl: "https://verify.example.com/1" }),
        makeCertificate({ id: 2, verifyUrl: null }),
        makeCertificate({ id: 3, verifyUrl: "https://verify.example.com/3" }),
      ]);
      render(<Certificates />);
      const verifyButtons = screen.getAllByText("Verify");
      expect(verifyButtons.length).toBe(2);
    });

    it("renders Download button for each certificate with downloadUrl", () => {
      setCertificates([
        makeCertificate({ id: 1 }),
        makeCertificate({ id: 2 }),
        makeCertificate({ id: 3 }),
      ]);
      render(<Certificates />);
      const downloadButtons = screen.getAllByText("Download");
      expect(downloadButtons.length).toBe(3);
    });
  });

  // ─── Full integration ──────────────────────────────────
  describe("Full Integration", () => {
    it("renders complete page with all sections", () => {
      setCertificates([
        makeCertificate({ id: 1, title: "Phase 1 Passed", certificateNumber: "AFC-001", verified: true }),
        makeCertificate({ id: 2, title: "Funded Trader Certificate", certificateNumber: "AFC-002", verified: false }),
      ]);
      render(<Certificates />);

      expect(screen.getByText("Certificates")).toBeTruthy();
      expect(screen.getByText(/funded trader certificates/)).toBeTruthy();
      expect(screen.getByText("Phase 1 Passed")).toBeTruthy();
      expect(screen.getByText("Funded Trader Certificate")).toBeTruthy();
      expect(screen.getByText(/AFC-001/)).toBeTruthy();
      expect(screen.getByText(/AFC-002/)).toBeTruthy();
      expect(screen.getByText("Verified")).toBeTruthy();
      expect(screen.getByText("Pending")).toBeTruthy();
      expect(screen.getAllByText("Verify").length).toBe(2);
      expect(screen.getAllByText("Download").length).toBe(2);
    });
  });
});
