// @vitest-environment jsdom
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";

// ─── Mock: sonner ──────────────────────────────────────────
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

// ─── Mock: useAuth ─────────────────────────────────────────
const mockRefetch = vi.fn(async () => ({}));
const mockUser: any = {
  id: 1,
  name: "John Doe",
  email: "john@example.com",
  phone: "+2348012345678",
  country: "Nigeria",
  tradingExperience: "intermediate",
  role: "user",
  kycStatus: "unverified",
};

vi.mock("@/hooks/use-auth", () => ({
  useAuth: vi.fn(() => ({
    isLoading: false,
    isAuthenticated: true,
    user: mockUser,
    error: null,
    signIn: vi.fn(),
    signOut: vi.fn(),
    refetch: mockRefetch,
  })),
}));

// ─── Mock: react-router ────────────────────────────────────
const mockNavigate = vi.fn();
vi.mock("react-router", () => ({
  useNavigate: () => mockNavigate,
}));

// ─── Mock: useApiMutation ─────────────────────────────────
const mockOnboardingMutation = vi.fn(async () => ({ message: "ok" }));
vi.mock("@/hooks/use-api", () => ({
  useApiQuery: vi.fn(() => ({ data: null, isLoading: false })),
  useApiMutation: vi.fn(() => ({
    mutateAsync: mockOnboardingMutation,
    mutate: vi.fn(),
    isPending: false,
  })),
}));

// ─── Import component ──────────────────────────────────────
import Onboarding from "@/pages/dashboard/Onboarding";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";

// ─── Tests ────────────────────────────────────────────────
describe("Onboarding Page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOnboardingMutation.mockResolvedValue({ message: "ok" });
    vi.mocked(useAuth).mockReturnValue({
      isLoading: false,
      isAuthenticated: true,
      user: { ...mockUser },
      error: null,
      signIn: vi.fn() as any,
      signOut: vi.fn() as any,
      refetch: mockRefetch as any,
    });
  });

  // ─── Step 1: Profile ────────────────────────────────────
  describe("Step 1 - Profile", () => {
    it("renders step 1 title", () => {
      render(<Onboarding />);
      expect(screen.getByText("Your Profile")).toBeTruthy();
    });

    it("shows step indicator", () => {
      render(<Onboarding />);
      expect(screen.getByText("Step 1 of 3")).toBeTruthy();
    });

    it("pre-fills name from user data", () => {
      render(<Onboarding />);
      expect(screen.getByDisplayValue("John Doe")).toBeTruthy();
    });

    it("pre-fills phone from user data", () => {
      render(<Onboarding />);
      expect(screen.getByDisplayValue("+2348012345678")).toBeTruthy();
    });

    it("pre-fills country from user data", () => {
      render(<Onboarding />);
      expect(screen.getByDisplayValue("Nigeria")).toBeTruthy();
    });

    it("renders all form labels", () => {
      render(<Onboarding />);
      expect(screen.getByText("Full Name")).toBeTruthy();
      expect(screen.getByText("Phone")).toBeTruthy();
      expect(screen.getByText("Country")).toBeTruthy();
    });

    it("renders Skip and Next buttons", () => {
      render(<Onboarding />);
      expect(screen.getByText("Skip")).toBeTruthy();
      expect(screen.getByText("Next")).toBeTruthy();
    });

    it("renders Skip for now link", () => {
      render(<Onboarding />);
      expect(screen.getByText("Skip for now")).toBeTruthy();
    });

    it("allows editing name", async () => {
      const user = userEvent.setup();
      render(<Onboarding />);
      const nameInput = screen.getByDisplayValue("John Doe");
      await user.clear(nameInput);
      await user.type(nameInput, "Jane Smith");
      expect(nameInput).toHaveValue("Jane Smith");
    });

    it("allows editing phone", async () => {
      const user = userEvent.setup();
      render(<Onboarding />);
      const phoneInput = screen.getByDisplayValue("+2348012345678");
      await user.clear(phoneInput);
      await user.type(phoneInput, "+2348098765432");
      expect(phoneInput).toHaveValue("+2348098765432");
    });

    it("allows editing country", async () => {
      const user = userEvent.setup();
      render(<Onboarding />);
      const countryInput = screen.getByDisplayValue("Nigeria");
      await user.clear(countryInput);
      await user.type(countryInput, "Ghana");
      expect(countryInput).toHaveValue("Ghana");
    });

    it("advances to step 2 on Next click", async () => {
      const user = userEvent.setup();
      render(<Onboarding />);
      await user.click(screen.getByText("Next"));
      expect(screen.getByText("Trading Experience")).toBeTruthy();
      expect(screen.getByText("Step 2 of 3")).toBeTruthy();
    });
  });

  // ─── Step 2: Trading Experience ─────────────────────────
  describe("Step 2 - Trading Experience", () => {
    it("shows all experience levels", async () => {
      const user = userEvent.setup();
      render(<Onboarding />);
      await user.click(screen.getByText("Next"));
      expect(screen.getByText("Beginner")).toBeTruthy();
      expect(screen.getByText("Intermediate")).toBeTruthy();
      expect(screen.getByText("Advanced")).toBeTruthy();
      expect(screen.getByText("Professional")).toBeTruthy();
    });

    it("highlights selected experience", async () => {
      const user = userEvent.setup();
      render(<Onboarding />);
      await user.click(screen.getByText("Next"));
      const intermediateBtn = screen.getByText("Intermediate");
      await user.click(intermediateBtn);
      expect(intermediateBtn.closest("button")?.className).toContain("border-foreground");
    });

    it("renders Skip and Next buttons on step 2", async () => {
      const user = userEvent.setup();
      render(<Onboarding />);
      await user.click(screen.getByText("Next"));
      expect(screen.getByText("Skip")).toBeTruthy();
      expect(screen.getByText("Next")).toBeTruthy();
    });

    it("advances to step 3 on Next click", async () => {
      const user = userEvent.setup();
      render(<Onboarding />);
      await user.click(screen.getByText("Next"));
      await user.click(screen.getByText("Next"));
      expect(screen.getByText("Preferences")).toBeTruthy();
      expect(screen.getByText("Step 3 of 3")).toBeTruthy();
    });
  });

  // ─── Step 3: Confirmation ──────────────────────────────
  describe("Step 3 - Confirmation", () => {
    it("shows Go to Dashboard button", async () => {
      const user = userEvent.setup();
      render(<Onboarding />);
      await user.click(screen.getByText("Next"));
      await user.click(screen.getByText("Next"));
      expect(screen.getByText("Go to Dashboard")).toBeTruthy();
    });

    it("shows confirmation message", async () => {
      const user = userEvent.setup();
      render(<Onboarding />);
      await user.click(screen.getByText("Next"));
      await user.click(screen.getByText("Next"));
      expect(screen.getByText(/all set/)).toBeTruthy();
    });

    it("calls API and navigates on Go to Dashboard click", async () => {
      const user = userEvent.setup();
      render(<Onboarding />);
      await user.click(screen.getByText("Next"));
      await user.click(screen.getByText("Next"));
      await user.click(screen.getByText("Go to Dashboard"));
      await waitFor(() => {
        expect(mockOnboardingMutation).toHaveBeenCalled();
        expect(toast.success).toHaveBeenCalledWith("Onboarding complete!");
        expect(mockNavigate).toHaveBeenCalledWith("/dashboard");
      });
    });

    it("calls refetch after saving", async () => {
      const user = userEvent.setup();
      render(<Onboarding />);
      await user.click(screen.getByText("Next"));
      await user.click(screen.getByText("Next"));
      await user.click(screen.getByText("Go to Dashboard"));
      await waitFor(() => {
        expect(mockRefetch).toHaveBeenCalled();
      });
    });

    it("shows error toast on save failure", async () => {
      mockOnboardingMutation.mockRejectedValueOnce(new Error("Save failed"));
      const user = userEvent.setup();
      render(<Onboarding />);
      await user.click(screen.getByText("Next"));
      await user.click(screen.getByText("Next"));
      await user.click(screen.getByText("Go to Dashboard"));
      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith("Save failed");
      });
    });

    it("shows saving state while saving", async () => {
      let resolve!: (v: any) => void;
      mockOnboardingMutation.mockImplementation(() => new Promise((r) => { resolve = r; }));
      const user = userEvent.setup();
      render(<Onboarding />);
      await user.click(screen.getByText("Next"));
      await user.click(screen.getByText("Next"));
      await user.click(screen.getByText("Go to Dashboard"));
      // Button should be disabled during save
      const btn = screen.getByRole("button", { name: /Go to Dashboard/ });
      expect(btn).toBeDisabled();
      resolve({});
      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalled();
      });
    });
  });

  // ─── Skip flow ─────────────────────────────────────────
  describe("Skip Flow", () => {
    it("saves and navigates on Skip button click in step 1", async () => {
      const user = userEvent.setup();
      render(<Onboarding />);
      await user.click(screen.getByText("Skip"));
      await waitFor(() => {
        expect(mockOnboardingMutation).toHaveBeenCalled();
        expect(toast.success).toHaveBeenCalledWith("Setup skipped");
        expect(mockNavigate).toHaveBeenCalledWith("/dashboard");
      });
    });

    it("saves and navigates on Skip for now link click", async () => {
      const user = userEvent.setup();
      render(<Onboarding />);
      await user.click(screen.getByText("Skip for now"));
      await waitFor(() => {
        expect(mockOnboardingMutation).toHaveBeenCalled();
        expect(toast.success).toHaveBeenCalledWith("Setup skipped");
        expect(mockNavigate).toHaveBeenCalledWith("/dashboard");
      });
    });

    it("sends undefined for empty fields when skipping", async () => {
      vi.mocked(useAuth).mockReturnValue({
        isLoading: false,
        isAuthenticated: true,
        user: { ...mockUser, name: "", phone: "", country: "", tradingExperience: "" },
        error: null,
        signIn: vi.fn() as any,
        signOut: vi.fn() as any,
        refetch: mockRefetch as any,
      });
      const user = userEvent.setup();
      render(<Onboarding />);
      await user.click(screen.getByText("Skip for now"));
      await waitFor(() => {
        expect(mockOnboardingMutation).toHaveBeenCalledWith(
          expect.objectContaining({
            name: undefined,
            phone: undefined,
            country: undefined,
            tradingExperience: undefined,
          })
        );
      });
    });
  });

  // ─── Full integration ──────────────────────────────────
  describe("Full Integration", () => {
    it("renders initial step with all elements", () => {
      render(<Onboarding />);
      expect(screen.getByText("Your Profile")).toBeTruthy();
      expect(screen.getByText("Step 1 of 3")).toBeTruthy();
      expect(screen.getByText("Skip")).toBeTruthy();
      expect(screen.getByText("Next")).toBeTruthy();
      expect(screen.getByText("Skip for now")).toBeTruthy();
    });

    it("completes full 3-step wizard flow", async () => {
      const user = userEvent.setup();
      render(<Onboarding />);
      // Step 1
      expect(screen.getByText("Your Profile")).toBeTruthy();
      await user.click(screen.getByText("Next"));
      // Step 2
      expect(screen.getByText("Trading Experience")).toBeTruthy();
      await user.click(screen.getByText("Next"));
      // Step 3
      expect(screen.getByText("Preferences")).toBeTruthy();
      await user.click(screen.getByText("Go to Dashboard"));
      await waitFor(() => {
        expect(mockOnboardingMutation).toHaveBeenCalled();
        expect(mockNavigate).toHaveBeenCalledWith("/dashboard");
      });
    });
  });
});
