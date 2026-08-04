// @vitest-environment jsdom
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
const mockUser = {
  id: 1,
  name: "John Doe",
  email: "john@example.com",
  phone: "+2348012345678",
  address: "123 Lagos Street",
  country: "Nigeria",
  role: "user",
  kycStatus: "unverified",
  referralCode: "JOHN001",
};

vi.mock("@/hooks/use-auth", () => ({
  useAuth: vi.fn(() => ({
    isLoading: false,
    isAuthenticated: true,
    user: mockUser,
    error: null,
    signIn: vi.fn(),
    signOut: vi.fn(),
    refetch: vi.fn(),
  })),
}));

// ─── Mock: useApiQuery / useApiMutation ────────────────────
const queryDataMap: Record<string, any> = {};
const mockUpdateProfile = vi.fn(async () => ({ message: "ok" }));
const mockUploadKyc = vi.fn(async () => ({ message: "uploaded" }));
const mockRefetchKyc = vi.fn(async () => ({}));

vi.mock("@/hooks/use-api", () => ({
  useApiQuery: vi.fn((key: string[], path: string, _opts?: any) => {
    // The page passes query-suffixed keys (["kyc", "my", "/api/kyc/my?..."]),
    // so look up by the stable prefix (first two segments).
    const dataKey = key.slice(0, 2).join("/");
    if (queryDataMap[dataKey] === undefined) {
      return { data: undefined, isLoading: true, refetch: mockRefetchKyc };
    }
    const base = queryDataMap[dataKey];
    // Simulate the server-driven KYC documents list: paginate + stats envelope.
    if (dataKey === "kyc/my" && Array.isArray(base)) {
      const query = path.includes("?") ? path.split("?")[1] : "";
      const params = new URLSearchParams(query);
      const page = Number(params.get("page") || 1);
      const pageSize = Number(params.get("pageSize") || 10);
      const total = base.length;
      const totalPages = Math.max(1, Math.ceil(total / pageSize));
      const byStatus = base.reduce<Record<string, number>>((acc, d: any) => {
        const status = d.status || "unverified";
        acc[status] = (acc[status] || 0) + 1;
        return acc;
      }, {});
      return {
        data: {
          documents: base.slice((page - 1) * pageSize, page * pageSize),
          total,
          page,
          pageSize,
          totalPages,
          stats: { total, byStatus },
        },
        isLoading: false,
        refetch: mockRefetchKyc,
      };
    }
    return { data: base, isLoading: false, refetch: mockRefetchKyc };
  }),
  useApiMutation: vi.fn((method: string, path: string, _onSuccess?: any) => {
    if (path === "/api/kyc/upload") {
      return { mutateAsync: mockUploadKyc, mutate: vi.fn(), isPending: false };
    }
    return { mutateAsync: mockUpdateProfile, mutate: vi.fn(), isPending: false };
  }),
}));

// ─── Mock: Tabs with React state for tab switching ─────────
vi.mock("@/components/ui/tabs", () => {
  const React = require("react");
  const TabCtx = React.createContext({ active: "profile", setActive: (_: string) => {} });

  function Tabs({ defaultValue, children }: any) {
    const [active, setActive] = React.useState(defaultValue || "profile");
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

// ─── Import component after mocks ─────────────────────────
import Profile from "@/pages/dashboard/Profile";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";

// ─── Helpers ──────────────────────────────────────────────
function clearAllQueryData() {
  Object.keys(queryDataMap).forEach((k) => delete queryDataMap[k]);
}

function setQueryData(updates: Record<string, any>) {
  Object.keys(queryDataMap).forEach((k) => delete queryDataMap[k]);
  Object.assign(queryDataMap, { "kyc/my": [], ...updates });
}

function makeKycDoc(overrides: any = {}) {
  return {
    id: 1,
    documentType: "passport",
    status: "pending",
    uploadedAt: Date.now() - 86400000 * 3,
    fileUrl: "data:image/jpeg;base64,abc123",
    fileName: "passport.jpg",
    rejectionReason: null,
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────
describe("Profile Page", () => {
  beforeEach(() => {
    clearAllQueryData();
    vi.clearAllMocks();
    mockUpdateProfile.mockResolvedValue({ message: "ok" });
    mockUploadKyc.mockResolvedValue({ message: "uploaded" });
    vi.mocked(useAuth).mockReturnValue({
      isLoading: false,
      isAuthenticated: true,
      user: { ...mockUser } as any,
      error: null,
      signIn: vi.fn() as any,
      signOut: vi.fn() as any,
      refetch: vi.fn() as any,
    });
  });

  // ─── Loading state ─────────────────────────────────────
  describe("Loading State", () => {
    it("shows spinner when user is null", () => {
      vi.mocked(useAuth).mockReturnValue({
        isLoading: false,
        isAuthenticated: true,
        user: null as any,
        error: null,
        signIn: vi.fn() as any,
        signOut: vi.fn() as any,
        refetch: vi.fn() as any,
      });
      render(<Profile />);
      expect(container.querySelector(".animate-spin")).toBeTruthy();
    });
  });

  // ─── Page header ───────────────────────────────────────
  describe("Page Header", () => {
    it("renders the Profile heading", () => {
      setQueryData({});
      render(<Profile />);
      expect(screen.getByRole("heading", { name: "Profile" })).toBeTruthy();
    });

    it("renders the page description", () => {
      setQueryData({});
      render(<Profile />);
      expect(screen.getByText(/Manage your personal information/)).toBeTruthy();
    });
  });

  // ─── Tabs ──────────────────────────────────────────────
  describe("Tabs", () => {
    it("renders Profile and KYC tab triggers", () => {
      setQueryData({});
      render(<Profile />);
      expect(screen.getByTestId("tab-trigger-profile")).toBeTruthy();
      expect(screen.getByTestId("tab-trigger-kyc")).toBeTruthy();
    });

    it("defaults to Profile tab content", () => {
      setQueryData({});
      render(<Profile />);
      expect(screen.getByText("Save Changes")).toBeTruthy();
    });
  });

  // ─── Profile Tab ───────────────────────────────────────
  describe("Profile Tab", () => {
    it("pre-fills name from user data", () => {
      setQueryData({});
      render(<Profile />);
      expect(screen.getByDisplayValue("John Doe")).toBeTruthy();
    });

    it("pre-fills phone from user data", () => {
      setQueryData({});
      render(<Profile />);
      expect(screen.getByDisplayValue("+2348012345678")).toBeTruthy();
    });

    it("pre-fills address from user data", () => {
      setQueryData({});
      render(<Profile />);
      expect(screen.getByDisplayValue("123 Lagos Street")).toBeTruthy();
    });

    it("pre-fills country from user data", () => {
      setQueryData({});
      render(<Profile />);
      expect(screen.getByDisplayValue("Nigeria")).toBeTruthy();
    });

    it("renders all four form field labels", () => {
      setQueryData({});
      render(<Profile />);
      expect(screen.getByText("Full Name")).toBeTruthy();
      expect(screen.getByText("Phone")).toBeTruthy();
      expect(screen.getByText("Address")).toBeTruthy();
      expect(screen.getByText("Country")).toBeTruthy();
    });

    it("renders Save Changes button", () => {
      setQueryData({});
      render(<Profile />);
      expect(screen.getByText("Save Changes")).toBeTruthy();
    });

    it("allows editing name", async () => {
      const user = userEvent.setup();
      setQueryData({});
      render(<Profile />);
      const nameInput = screen.getByDisplayValue("John Doe");
      await user.clear(nameInput);
      await user.type(nameInput, "Jane Doe");
      expect(nameInput).toHaveValue("Jane Doe");
    });

    it("allows editing phone", async () => {
      const user = userEvent.setup();
      setQueryData({});
      render(<Profile />);
      const phoneInput = screen.getByDisplayValue("+2348012345678");
      await user.clear(phoneInput);
      await user.type(phoneInput, "+2348098765432");
      expect(phoneInput).toHaveValue("+2348098765432");
    });

    it("allows editing address", async () => {
      const user = userEvent.setup();
      setQueryData({});
      render(<Profile />);
      const addressInput = screen.getByDisplayValue("123 Lagos Street");
      await user.clear(addressInput);
      await user.type(addressInput, "456 Abuja Avenue");
      expect(addressInput).toHaveValue("456 Abuja Avenue");
    });

    it("allows editing country", async () => {
      const user = userEvent.setup();
      setQueryData({});
      render(<Profile />);
      const countryInput = screen.getByDisplayValue("Nigeria");
      await user.clear(countryInput);
      await user.type(countryInput, "Ghana");
      expect(countryInput).toHaveValue("Ghana");
    });
  });

  // ─── Save profile ──────────────────────────────────────
  describe("Save Profile", () => {
    it("submits profile update with correct data", async () => {
      const user = userEvent.setup();
      setQueryData({});
      render(<Profile />);
      const nameInput = screen.getByDisplayValue("John Doe");
      await user.clear(nameInput);
      await user.type(nameInput, "Jane Smith");
      await user.click(screen.getByText("Save Changes"));
      await waitFor(() => {
        expect(mockUpdateProfile).toHaveBeenCalledWith({
          name: "Jane Smith",
          phone: "+2348012345678",
          address: "123 Lagos Street",
          country: "Nigeria",
        });
      });
    });

    it("shows success toast after save", async () => {
      const user = userEvent.setup();
      setQueryData({});
      render(<Profile />);
      await user.click(screen.getByText("Save Changes"));
      await waitFor(() => {
        expect(toast.success).toHaveBeenCalledWith("Profile updated");
      });
    });

    it("shows error toast on save failure", async () => {
      const user = userEvent.setup();
      mockUpdateProfile.mockRejectedValueOnce(new Error("Update failed"));
      setQueryData({});
      render(<Profile />);
      await user.click(screen.getByText("Save Changes"));
      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith("Update failed");
      });
    });

    it("disables button and shows Saving... while saving", async () => {
      const user = userEvent.setup();
      let resolveSave: (v: any) => void;
      mockUpdateProfile.mockImplementation(() => new Promise((r) => { resolveSave = r; }));
      setQueryData({});
      render(<Profile />);
      await user.click(screen.getByText("Save Changes"));
      expect(screen.getByText("Saving...")).toBeTruthy();
      expect(screen.getByText("Saving...").closest("button")).toBeDisabled();
      resolveSave!({});
      await waitFor(() => {
        expect(screen.getByText("Save Changes")).toBeTruthy();
      });
    });
  });

  // ─── KYC Tab ───────────────────────────────────────────
  describe("KYC Tab", () => {
    it("switches to KYC tab and shows identity verification", async () => {
      const user = userEvent.setup();
      setQueryData({});
      render(<Profile />);
      await user.click(screen.getByTestId("tab-trigger-kyc"));
      expect(screen.getByText("Identity Verification")).toBeTruthy();
    });

    it("renders KYC status banner for unverified user", async () => {
      const user = userEvent.setup();
      setQueryData({});
      render(<Profile />);
      await user.click(screen.getByTestId("tab-trigger-kyc"));
      expect(screen.getByText(/Upload your identity documents/)).toBeTruthy();
      expect(screen.getByText("Not Submitted")).toBeTruthy();
    });

    it("renders KYC status banner for approved user", async () => {
      const user = userEvent.setup();
      vi.mocked(useAuth).mockReturnValue({
        isLoading: false, isAuthenticated: true,
        user: { ...mockUser, kycStatus: "approved" } as any,
        error: null, signIn: vi.fn() as any, signOut: vi.fn() as any, refetch: vi.fn() as any,
      });
      setQueryData({});
      render(<Profile />);
      await user.click(screen.getByTestId("tab-trigger-kyc"));
      expect(screen.getByText("Approved")).toBeTruthy();
      expect(screen.getByText(/Your identity is verified/)).toBeTruthy();
    });

    it("renders KYC status banner for pending user", async () => {
      const user = userEvent.setup();
      vi.mocked(useAuth).mockReturnValue({
        isLoading: false, isAuthenticated: true,
        user: { ...mockUser, kycStatus: "pending" } as any,
        error: null, signIn: vi.fn() as any, signOut: vi.fn() as any, refetch: vi.fn() as any,
      });
      setQueryData({});
      render(<Profile />);
      await user.click(screen.getByTestId("tab-trigger-kyc"));
      expect(screen.getByText("Pending Review")).toBeTruthy();
      expect(screen.getByText(/Documents are under review/)).toBeTruthy();
    });

    it("renders KYC status banner for rejected user", async () => {
      const user = userEvent.setup();
      vi.mocked(useAuth).mockReturnValue({
        isLoading: false, isAuthenticated: true,
        user: { ...mockUser, kycStatus: "rejected" } as any,
        error: null, signIn: vi.fn() as any, signOut: vi.fn() as any, refetch: vi.fn() as any,
      });
      setQueryData({});
      render(<Profile />);
      await user.click(screen.getByTestId("tab-trigger-kyc"));
      expect(screen.getByText("Rejected")).toBeTruthy();
      expect(screen.getByText(/One or more documents were rejected/)).toBeTruthy();
    });

    it("renders verification requirements", async () => {
      const user = userEvent.setup();
      setQueryData({});
      render(<Profile />);
      await user.click(screen.getByTestId("tab-trigger-kyc"));
      expect(screen.getByText("Verification Requirements")).toBeTruthy();
      expect(screen.getByText(/government-issued ID/)).toBeTruthy();
    });
  });

  // ─── KYC Document Cards ────────────────────────────────
  describe("KYC Document Cards", () => {
    it("renders all five document type cards", async () => {
      const user = userEvent.setup();
      setQueryData({});
      render(<Profile />);
      await user.click(screen.getByTestId("tab-trigger-kyc"));
      expect(screen.getByText("International Passport")).toBeTruthy();
      expect(screen.getByText("National ID")).toBeTruthy();
      expect(screen.getByText("Driver's License")).toBeTruthy();
      expect(screen.getByText("Proof of Address")).toBeTruthy();
      expect(screen.getByText("Selfie Verification")).toBeTruthy();
    });

    it("shows Required badge on passport", async () => {
      const user = userEvent.setup();
      setQueryData({});
      render(<Profile />);
      await user.click(screen.getByTestId("tab-trigger-kyc"));
      const badges = screen.getAllByText("Required");
      expect(badges.length).toBeGreaterThanOrEqual(1);
    });

    it("shows Upload button for unsubmitted documents", async () => {
      const user = userEvent.setup();
      setQueryData({});
      render(<Profile />);
      await user.click(screen.getByTestId("tab-trigger-kyc"));
      const uploadButtons = screen.getAllByText("Upload");
      expect(uploadButtons.length).toBe(5);
    });

    it("shows 'Not yet submitted' for documents without uploads", async () => {
      const user = userEvent.setup();
      setQueryData({ "kyc/my": [] });
      render(<Profile />);
      await user.click(screen.getByTestId("tab-trigger-kyc"));
      const notSubmitted = screen.getAllByText("Not yet submitted");
      expect(notSubmitted.length).toBe(5);
    });

    it("shows pending status for submitted documents", async () => {
      const user = userEvent.setup();
      setQueryData({
        "kyc/my": [makeKycDoc({ documentType: "passport", status: "pending" })],
      });
      render(<Profile />);
      await user.click(screen.getByTestId("tab-trigger-kyc"));
      expect(screen.getByText("Pending Review")).toBeTruthy();
      expect(screen.getByText("Under review")).toBeTruthy();
    });

    it("shows approved status", async () => {
      const user = userEvent.setup();
      setQueryData({
        "kyc/my": [makeKycDoc({ documentType: "passport", status: "approved" })],
      });
      render(<Profile />);
      await user.click(screen.getByTestId("tab-trigger-kyc"));
      expect(screen.getByText("Approved")).toBeTruthy();
    });

    it("hides Upload button for approved documents", async () => {
      const user = userEvent.setup();
      setQueryData({
        "kyc/my": [makeKycDoc({ documentType: "passport", status: "approved" })],
      });
      render(<Profile />);
      await user.click(screen.getByTestId("tab-trigger-kyc"));
      const uploadButtons = screen.getAllByText("Upload");
      expect(uploadButtons.length).toBe(4);
    });

    it("shows Re-upload button for rejected documents", async () => {
      const user = userEvent.setup();
      setQueryData({
        "kyc/my": [makeKycDoc({ documentType: "passport", status: "rejected", rejectionReason: "Blurry" })],
      });
      render(<Profile />);
      await user.click(screen.getByTestId("tab-trigger-kyc"));
      expect(screen.getByText("Re-upload")).toBeTruthy();
    });

    it("shows rejection reason", async () => {
      const user = userEvent.setup();
      setQueryData({
        "kyc/my": [makeKycDoc({ documentType: "passport", status: "rejected", rejectionReason: "Image is blurry" })],
      });
      render(<Profile />);
      await user.click(screen.getByTestId("tab-trigger-kyc"));
      expect(screen.getByText("Image is blurry")).toBeTruthy();
    });

    it("shows upload date for submitted documents", async () => {
      const user = userEvent.setup();
      const date = new Date("2025-06-15");
      setQueryData({
        "kyc/my": [makeKycDoc({ documentType: "passport", status: "pending", uploadedAt: date.getTime() })],
      });
      render(<Profile />);
      await user.click(screen.getByTestId("tab-trigger-kyc"));
      // Date appears in both the upload card and the Submitted Documents list
      expect(screen.getAllByText(/Jun 15, 2025/).length).toBeGreaterThanOrEqual(1);
    });

    it("renders sortable Submitted Documents headers with the default column active", async () => {
      const user = userEvent.setup();
      setQueryData({ "kyc/my": [makeKycDoc()] });
      render(<Profile />);
      await user.click(screen.getByTestId("tab-trigger-kyc"));

      for (const label of ["Type", "Status", "Uploaded"]) {
        expect(screen.getByRole("button", { name: `Sort by ${label}` })).toBeTruthy();
      }
      // Default sort is uploadedAt desc → Uploaded is active
      expect(screen.getByRole("button", { name: "Sort by Uploaded" }).getAttribute("aria-pressed")).toBe("true");
      // Submitted documents are listed
      expect(screen.getByText(/Submitted Documents/)).toBeTruthy();
    });

    it("calls the API with sortBy/sortOrder when a header is clicked", async () => {
      const user = userEvent.setup();
      setQueryData({ "kyc/my": [makeKycDoc()] });
      render(<Profile />);
      await user.click(screen.getByTestId("tab-trigger-kyc"));

      await user.click(screen.getByRole("button", { name: "Sort by Status" }));

      const calls = vi.mocked(useApiQuery).mock.calls;
      const kycCall = calls.find((c) => String(c[1]).includes("/api/kyc/my?") && String(c[1]).includes("sortBy=status"));
      expect(kycCall).toBeTruthy();
      expect(String(kycCall![1])).toContain("sortOrder=desc");
      expect(screen.getByRole("button", { name: "Sort by Status" }).getAttribute("aria-pressed")).toBe("true");
    });

    it("toggles to ascending when the active column is clicked again", async () => {
      const user = userEvent.setup();
      setQueryData({ "kyc/my": [makeKycDoc()] });
      render(<Profile />);
      await user.click(screen.getByTestId("tab-trigger-kyc"));

      await user.click(screen.getByRole("button", { name: "Sort by Status" }));
      await user.click(screen.getByRole("button", { name: "Sort by Status" }));

      const calls = vi.mocked(useApiQuery).mock.calls;
      const ascCall = calls.find((c) => String(c[1]).includes("/api/kyc/my?") && String(c[1]).includes("sortBy=status&sortOrder=asc"));
      expect(ascCall).toBeTruthy();
    });
  });

  // ─── File Upload ───────────────────────────────────────
  describe("File Upload", () => {
    it("creates hidden file input for each document type", async () => {
      const user = userEvent.setup();
      setQueryData({});
      render(<Profile />);
      await user.click(screen.getByTestId("tab-trigger-kyc"));
      const fileInputs = container.querySelectorAll('input[type="file"]');
      expect(fileInputs.length).toBe(5);
    });

    it("file inputs accept correct file types", async () => {
      const user = userEvent.setup();
      setQueryData({});
      render(<Profile />);
      await user.click(screen.getByTestId("tab-trigger-kyc"));
      const fileInputs = container.querySelectorAll('input[type="file"]');
      fileInputs.forEach((input) => {
        expect(input).toHaveAttribute("accept", "image/jpeg,image/png,image/webp,application/pdf");
      });
    });
  });

  // ─── File validation ──────────────────────────────────
  describe("File Validation", () => {
    it("rejects invalid file types with toast error", async () => {
      const user = userEvent.setup();
      setQueryData({});
      render(<Profile />);
      await user.click(screen.getByTestId("tab-trigger-kyc"));
      const fileInputs = container.querySelectorAll('input[type="file"]');
      const invalidFile = new File(["test"], "test.exe", { type: "application/x-msdownload" });
      Object.defineProperty(invalidFile, "size", { value: 1000 });
      fireEvent.change(fileInputs[0], { target: { files: [invalidFile] } });
      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith(expect.stringContaining("Invalid file type"));
      });
    });

    it("rejects oversized files with toast error", async () => {
      const user = userEvent.setup();
      setQueryData({});
      render(<Profile />);
      await user.click(screen.getByTestId("tab-trigger-kyc"));
      const fileInputs = container.querySelectorAll('input[type="file"]');
      const bigFile = new File(["x".repeat(6 * 1024 * 1024)], "big.jpg", { type: "image/jpeg" });
      Object.defineProperty(bigFile, "size", { value: 6 * 1024 * 1024 });
      fireEvent.change(fileInputs[0], { target: { files: [bigFile] } });
      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith(expect.stringContaining("File size"));
      });
    });

    it("accepts valid JPEG file and calls upload mutation", async () => {
      const user = userEvent.setup();
      setQueryData({});
      render(<Profile />);
      await user.click(screen.getByTestId("tab-trigger-kyc"));
      const fileInputs = container.querySelectorAll('input[type="file"]');
      const validFile = new File(["image-data"], "passport.jpg", { type: "image/jpeg" });
      Object.defineProperty(validFile, "size", { value: 1000 });
      fireEvent.change(fileInputs[0], { target: { files: [validFile] } });
      await waitFor(() => {
        expect(mockUploadKyc).toHaveBeenCalled();
      });
    });

    it("accepts valid PDF file", async () => {
      const user = userEvent.setup();
      setQueryData({});
      render(<Profile />);
      await user.click(screen.getByTestId("tab-trigger-kyc"));
      const fileInputs = container.querySelectorAll('input[type="file"]');
      const validPdf = new File(["pdf-data"], "doc.pdf", { type: "application/pdf" });
      Object.defineProperty(validPdf, "size", { value: 5000 });
      fireEvent.change(fileInputs[0], { target: { files: [validPdf] } });
      await waitFor(() => {
        expect(mockUploadKyc).toHaveBeenCalled();
      });
    });
  });

  // ─── Upload button states ──────────────────────────────
  describe("Upload Button States", () => {
    it("shows Upload text for each unsubmitted document", async () => {
      const user = userEvent.setup();
      setQueryData({});
      render(<Profile />);
      await user.click(screen.getByTestId("tab-trigger-kyc"));
      const uploadButtons = screen.getAllByText("Upload");
      expect(uploadButtons.length).toBe(5);
      uploadButtons.forEach((btn) => {
        const button = btn.closest("button");
        expect(button).toBeTruthy();
        expect(button).not.toBeDisabled();
      });
    });

    it("shows Re-upload text for rejected documents", async () => {
      const user = userEvent.setup();
      setQueryData({
        "kyc/my": [
          makeKycDoc({ documentType: "passport", status: "rejected", rejectionReason: "Blurry" }),
          makeKycDoc({ id: 2, documentType: "national_id", status: "pending" }),
        ],
      });
      render(<Profile />);
      await user.click(screen.getByTestId("tab-trigger-kyc"));
      expect(screen.getByText("Re-upload")).toBeTruthy();
      // The rejected doc shows Re-upload, the pending doc shows "Under review" text
      const uploadButtons = screen.getAllByText((t) => t === "Upload" || t === "Re-upload");
      expect(uploadButtons.length).toBeGreaterThanOrEqual(1);
    });

    it("does not show Upload for approved documents", async () => {
      const user = userEvent.setup();
      setQueryData({
        "kyc/my": [
          makeKycDoc({ documentType: "passport", status: "approved" }),
          makeKycDoc({ id: 2, documentType: "national_id", status: "approved" }),
          makeKycDoc({ id: 3, documentType: "drivers_license", status: "approved" }),
          makeKycDoc({ id: 4, documentType: "proof_of_address", status: "approved" }),
          makeKycDoc({ id: 5, documentType: "selfie", status: "approved" }),
        ],
      });
      render(<Profile />);
      await user.click(screen.getByTestId("tab-trigger-kyc"));
      // All 5 docs approved = no Upload/Re-upload buttons
      const uploadButtons = screen.queryAllByText((t) => t === "Upload" || t === "Re-upload");
      expect(uploadButtons.length).toBe(0);
    });
  });

  // ─── Multiple KYC documents ────────────────────────────
  describe("Multiple KYC Documents", () => {
    it("shows different statuses for different documents", async () => {
      const user = userEvent.setup();
      setQueryData({
        "kyc/my": [
          makeKycDoc({ id: 1, documentType: "passport", status: "approved" }),
          makeKycDoc({ id: 2, documentType: "national_id", status: "pending" }),
          makeKycDoc({ id: 3, documentType: "drivers_license", status: "rejected", rejectionReason: "Expired" }),
        ],
      });
      render(<Profile />);
      await user.click(screen.getByTestId("tab-trigger-kyc"));
      expect(screen.getByText("Approved")).toBeTruthy();
      expect(screen.getByText("Pending Review")).toBeTruthy();
      expect(screen.getByText("Rejected")).toBeTruthy();
      expect(screen.getByText("Expired")).toBeTruthy();
    });
  });

  // ─── Full integration ──────────────────────────────────
  describe("Full Integration", () => {
    it("renders profile tab with all fields by default", () => {
      setQueryData({});
      render(<Profile />);
      expect(screen.getByRole("heading", { name: "Profile" })).toBeTruthy();
      expect(screen.getByText("Full Name")).toBeTruthy();
      expect(screen.getByText("Phone")).toBeTruthy();
      expect(screen.getByText("Address")).toBeTruthy();
      expect(screen.getByText("Country")).toBeTruthy();
      expect(screen.getByText("Save Changes")).toBeTruthy();
      expect(screen.getByDisplayValue("John Doe")).toBeTruthy();
      expect(screen.getByDisplayValue("Nigeria")).toBeTruthy();
    });

    it("loading → data transition works", () => {
      vi.mocked(useAuth).mockReturnValue({
        isLoading: false, isAuthenticated: true, user: null as any,
        error: null, signIn: vi.fn() as any, signOut: vi.fn() as any, refetch: vi.fn() as any,
      });
      render(<Profile />);
      expect(container.querySelector(".animate-spin")).toBeTruthy();

      vi.mocked(useAuth).mockReturnValue({
        isLoading: false, isAuthenticated: true, user: { ...mockUser } as any,
        error: null, signIn: vi.fn() as any, signOut: vi.fn() as any, refetch: vi.fn() as any,
      });
      render(<Profile />);
      expect(screen.getByDisplayValue("John Doe")).toBeTruthy();
    });

    it("handles user with minimal data", () => {
      vi.mocked(useAuth).mockReturnValue({
        isLoading: false, isAuthenticated: true,
        user: { id: 2, name: "", email: "minimal@test.com", phone: null, address: null, country: null, role: "user", kycStatus: "unverified" } as any,
        error: null, signIn: vi.fn() as any, signOut: vi.fn() as any, refetch: vi.fn() as any,
      });
      setQueryData({});
      render(<Profile />);
      expect(screen.getByText("Full Name")).toBeTruthy();
      expect(screen.getByText("Save Changes")).toBeTruthy();
    });
  });

  // ─── Document History (audit timeline) ────────────────
  describe("Document History", () => {
    it("renders a View history button for submitted documents", async () => {
      const user = userEvent.setup();
      setQueryData({
        "kyc/my": [makeKycDoc({ documentType: "passport", status: "approved" })],
      });
      render(<Profile />);
      await user.click(screen.getByTestId("tab-trigger-kyc"));

      const buttons = await screen.findAllByRole("button", { name: /View history/i });
      expect(buttons.length).toBeGreaterThan(0);
    });

    it("opens the history dialog and shows the document timeline", async () => {
      const user = userEvent.setup();
      setQueryData({
        "kyc/my": [makeKycDoc({ id: 7, documentType: "passport", status: "approved" })],
      });
      queryDataMap["kyc/history"] = {
        events: [
          { action: "kyc.uploaded", timestamp: Date.now() - 86400000, actorName: "John Doe", details: { documentType: "passport" } },
          { action: "kyc.approved", timestamp: Date.now() - 3600000, actorName: "KYC Admin", details: { documentType: "passport" } },
        ],
        doc: { id: 7, documentType: "passport", status: "approved" },
      };
      render(<Profile />);
      await user.click(screen.getByTestId("tab-trigger-kyc"));
      await user.click((await screen.findAllByRole("button", { name: /View history/i }))[0]);

      expect(await screen.findByText("Document History")).toBeTruthy();
      expect(screen.getByText("Document submitted for review")).toBeTruthy();
      expect(screen.getByText("Document approved")).toBeTruthy();
      expect(screen.getAllByText(/by KYC Admin/).length).toBeGreaterThan(0);
    });

    it("shows the rejection reason in the history timeline", async () => {
      const user = userEvent.setup();
      setQueryData({
        "kyc/my": [makeKycDoc({ id: 8, documentType: "proof_of_address", status: "rejected" })],
      });
      queryDataMap["kyc/history"] = {
        events: [
          { action: "kyc.uploaded", timestamp: Date.now() - 86400000, actorName: "John Doe", details: null },
          { action: "kyc.rejected", timestamp: Date.now() - 3600000, actorName: "KYC Admin", details: { reason: "Image is blurry, please re-upload" } },
        ],
        doc: { id: 8, documentType: "proof_of_address", status: "rejected" },
      };
      render(<Profile />);
      await user.click(screen.getByTestId("tab-trigger-kyc"));
      await user.click((await screen.findAllByRole("button", { name: /View history/i }))[0]);

      expect(await screen.findByText("Document rejected")).toBeTruthy();
      expect(screen.getByText(/Image is blurry/)).toBeTruthy();
    });

    it("shows an empty state when the document has no events", async () => {
      const user = userEvent.setup();
      setQueryData({
        "kyc/my": [makeKycDoc({ id: 9, documentType: "selfie", status: "pending" })],
      });
      queryDataMap["kyc/history"] = { events: [], doc: { id: 9, documentType: "selfie", status: "pending" } };
      render(<Profile />);
      await user.click(screen.getByTestId("tab-trigger-kyc"));
      await user.click((await screen.findAllByRole("button", { name: /View history/i }))[0]);

      expect(await screen.findByText("No history available for this document yet.")).toBeTruthy();
    });
  });
});
