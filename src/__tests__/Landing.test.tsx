// @vitest-environment jsdom
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";

// ─── Mock: react-router ───────────────────────────────────
const mockNavigate = vi.fn();
vi.mock("react-router", () => ({
  useNavigate: () => mockNavigate,
}));

// ─── Mock: useAuth ─────────────────────────────────────────
vi.mock("@/hooks/use-auth", () => ({
  useAuth: vi.fn(() => ({
    isLoading: false,
    isAuthenticated: false,
    user: null,
    error: null,
  })),
}));

// ─── Mock: framer-motion ──────────────────────────────────
vi.mock("framer-motion", () => {
  const animated = (tag: string) =>
    React.forwardRef<any, any>((props, ref) => {
      const { ...rest } = props;
      return React.createElement(tag, { ref, ...rest }, props.children);
    });
  return {
    motion: new Proxy(
      {},
      {
        get: (_: any, tag: string) => {
          if (tag === "div" || tag === "span" || tag === "h1" || tag === "p" || tag === "a") return animated(tag);
          return animated("div");
        },
      }
    ),
    AnimatePresence: ({ children }: any) => children,
    useScroll: () => ({ scrollYProgress: { get: () => 0 } }),
    useTransform: () => 0,
    useInView: () => true,
    useMotionValueEvent: vi.fn(),
  };
});

// ─── Mock: lucide-react ───────────────────────────────────
vi.mock("lucide-react", () => {
  const createIcon = (name: string) => {
    const Icon = (props: any) => React.createElement("span", { "data-testid": `icon-${name}`, ...props });
    Icon.displayName = name;
    return Icon;
  };
  return {
    ArrowRight: createIcon("ArrowRight"),
    BarChart3: createIcon("BarChart3"),
    Shield: createIcon("Shield"),
    Zap: createIcon("Zap"),
    Users: createIcon("Users"),
    Award: createIcon("Award"),
    ChevronRight: createIcon("ChevronRight"),
    TrendingUp: createIcon("TrendingUp"),
    CheckCircle: createIcon("CheckCircle"),
    Quote: createIcon("Quote"),
    Star: createIcon("Star"),
    MoveRight: createIcon("MoveRight"),
    Sparkles: createIcon("Sparkles"),
    MousePointer2: createIcon("MousePointer2"),
    Loader2: createIcon("Loader2"),
    Mail: createIcon("Mail"),
    Lock: createIcon("Lock"),
    UserIcon: createIcon("UserIcon"),
    AlertCircle: createIcon("AlertCircle"),
  };
});

// ─── Mock: LogoDropdown ───────────────────────────────────
vi.mock("@/components/LogoDropdown", () => ({
  LogoDropdown: () => React.createElement("div", { "data-testid": "logo-dropdown" }, "Logo"),
}));

// ─── Mock: shadcn components ──────────────────────────────
vi.mock("@/components/ui/button", () => ({
  Button: React.forwardRef<HTMLButtonElement, any>(({ children, onClick, className, disabled, ...props }, ref) =>
    React.createElement("button", { ref, onClick, className, disabled, ...props }, children)
  ),
}));

vi.mock("@/components/ui/badge", () => ({
  Badge: ({ children, className }: any) =>
    React.createElement("span", { className, "data-testid": "badge" }, children),
}));

vi.mock("@/components/ui/separator", () => ({
  Separator: () => React.createElement("hr"),
}));

vi.mock("@/components/ui/accordion", () => ({
  Accordion: ({ children }: any) =>
    React.createElement("div", { "data-testid": "accordion" }, children),
  AccordionItem: ({ children, value }: any) =>
    React.createElement("div", { "data-testid": "accordion-item", "data-value": value }, children),
  AccordionTrigger: ({ children, className }: any) =>
    React.createElement("button", { className }, children),
  AccordionContent: ({ children, className }: any) =>
    React.createElement("div", { className }, children),
}));

vi.mock("@/components/ui/carousel", () => ({
  Carousel: ({ children, ...props }: any) =>
    React.createElement("div", { "data-testid": "carousel", ...props }, children),
  CarouselContent: ({ children }: any) =>
    React.createElement("div", { "data-testid": "carousel-content" }, children),
  CarouselItem: ({ children }: any) =>
    React.createElement("div", { "data-testid": "carousel-item" }, children),
  CarouselPrevious: (props: any) => React.createElement("button", { "data-testid": "carousel-prev", ...props }, "←"),
  CarouselNext: (props: any) => React.createElement("button", { "data-testid": "carousel-next", ...props }, "→"),
}));

vi.mock("@/lib/utils", () => ({
  cn: (...args: any[]) => args.filter(Boolean).join(" "),
}));

// ─── Import component under test ──────────────────────────
import Landing from "@/pages/Landing";
import { useAuth } from "@/hooks/use-auth";

// ─── Tests ────────────────────────────────────────────────
describe("Landing Page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Navigation Header", () => {
    it("renders the brand name in header", () => {
      render(<Landing />);
      // AfriFundedCapital appears in header + footer; check header nav area
      const brands = screen.getAllByText("AfriFundedCapital");
      expect(brands.length).toBeGreaterThanOrEqual(2);
    });

    it("renders logo dropdown", () => {
      render(<Landing />);
      expect(screen.getByTestId("logo-dropdown")).toBeTruthy();
    });

    it("renders nav links for features, testimonials, pricing, faq", () => {
      render(<Landing />);
      // Nav links are <a> elements with href="#section"
      const featuresLink = screen.getByRole("link", { name: "Features" });
      const testimonialsLink = screen.getByRole("link", { name: "Testimonials" });
      const pricingLink = screen.getByRole("link", { name: "Pricing" });
      const faqLink = screen.getByRole("link", { name: "Faq" });
      expect(featuresLink.getAttribute("href")).toBe("#features");
      expect(testimonialsLink.getAttribute("href")).toBe("#testimonials");
      expect(pricingLink.getAttribute("href")).toBe("#pricing");
      expect(faqLink.getAttribute("href")).toBe("#faq");
    });

    it("shows Get Started button when not authenticated", () => {
      (useAuth as any).mockReturnValue({
        isLoading: false,
        isAuthenticated: false,
        user: null,
      });
      render(<Landing />);
      // Get Started appears in nav header button
      const getStartedButtons = screen.getAllByText("Get Started");
      expect(getStartedButtons.length).toBeGreaterThanOrEqual(1);
    });

    it("shows Dashboard button when authenticated", () => {
      (useAuth as any).mockReturnValue({
        isLoading: false,
        isAuthenticated: true,
        user: { id: 1, name: "User" },
      });
      render(<Landing />);
      expect(screen.getByText("Dashboard")).toBeTruthy();
    });

    it("navigates to /auth on header Get Started click", () => {
      (useAuth as any).mockReturnValue({ isLoading: false, isAuthenticated: false, user: null });
      render(<Landing />);
      // The nav button with "Get Started" is inside a header element
      const header = document.querySelector("header")!;
      const getStartedBtn = header.querySelector("button")!;
      fireEvent.click(getStartedBtn);
      expect(mockNavigate).toHaveBeenCalledWith("/auth");
    });

    it("navigates to /dashboard on Dashboard button click", () => {
      (useAuth as any).mockReturnValue({ isLoading: false, isAuthenticated: true, user: { id: 1 } });
      render(<Landing />);
      fireEvent.click(screen.getByText("Dashboard"));
      expect(mockNavigate).toHaveBeenCalledWith("/dashboard");
    });

    it("hides nav CTA buttons when auth is loading", () => {
      (useAuth as any).mockReturnValue({ isLoading: true, isAuthenticated: false, user: null });
      render(<Landing />);
      // When loading, header buttons should not be visible
      const header = document.querySelector("header")!;
      const buttons = header.querySelectorAll("button");
      expect(buttons.length).toBe(0);
    });
  });

  describe("Hero Section", () => {
    it("renders the main headline", () => {
      render(<Landing />);
      expect(screen.getByText("Get Funded to")).toBeTruthy();
      expect(screen.getByText("Trade")).toBeTruthy();
    });

    it("renders the 90% profit headline", () => {
      render(<Landing />);
      expect(screen.getByText("Keep")).toBeTruthy();
      expect(screen.getByText("90%")).toBeTruthy();
      // "of Profits" is a separate text node; verify it exists somewhere
      const allText = document.body.textContent || "";
      expect(allText).toContain("of Profits");
    });

    it("renders the badge", () => {
      render(<Landing />);
      expect(screen.getByText("Africa's Premier Prop Trading Firm")).toBeTruthy();
    });

    it("renders the subtitle", () => {
      render(<Landing />);
      expect(
        screen.getByText(/AfriFundedCapital provides ambitious traders/)
      ).toBeTruthy();
    });

    it("renders Start Your Challenge CTA button", () => {
      render(<Landing />);
      expect(screen.getByText("Start Your Challenge")).toBeTruthy();
    });

    it("renders Explore Features button", () => {
      render(<Landing />);
      expect(screen.getByText("Explore Features")).toBeTruthy();
    });

    it("navigates to /auth on Start Your Challenge click", () => {
      render(<Landing />);
      fireEvent.click(screen.getByText("Start Your Challenge"));
      expect(mockNavigate).toHaveBeenCalledWith("/auth");
    });

    it("renders scroll to explore indicator", () => {
      render(<Landing />);
      expect(screen.getByText("Scroll to explore")).toBeTruthy();
    });
  });

  describe("Stats Bar", () => {
    it("renders all 4 stat labels", () => {
      render(<Landing />);
      expect(screen.getByText("Funded Traders")).toBeTruthy();
      expect(screen.getByText("Capital Deployed")).toBeTruthy();
      expect(screen.getByText("Payouts Processed")).toBeTruthy();
      expect(screen.getByText("Avg. Earnings")).toBeTruthy();
    });
  });

  describe("How It Works Section", () => {
    it("renders the section header", () => {
      render(<Landing />);
      expect(screen.getByText("How It Works")).toBeTruthy();
      expect(screen.getByText("Three simple steps to becoming a funded trader with AfriFundedCapital")).toBeTruthy();
    });

    it("renders all 3 step titles", () => {
      render(<Landing />);
      expect(screen.getByText("Choose Your Challenge")).toBeTruthy();
      expect(screen.getByText("Pass the Evaluation")).toBeTruthy();
      expect(screen.getByText("Get Funded")).toBeTruthy();
    });

    it("renders step numbers", () => {
      render(<Landing />);
      expect(screen.getByText("01")).toBeTruthy();
      expect(screen.getByText("02")).toBeTruthy();
      expect(screen.getByText("03")).toBeTruthy();
    });

    it("renders step descriptions", () => {
      render(<Landing />);
      expect(screen.getByText(/Select an account size/)).toBeTruthy();
      expect(screen.getByText(/Trade normally to meet profit targets/)).toBeTruthy();
      expect(screen.getByText(/Receive your funded account/)).toBeTruthy();
    });
  });

  describe("Features Grid", () => {
    it("renders the section header", () => {
      render(<Landing />);
      expect(screen.getByText("Everything You Need to Succeed")).toBeTruthy();
    });

    it("renders all 6 feature titles", () => {
      render(<Landing />);
      expect(screen.getByText("Challenge-Based Funding")).toBeTruthy();
      expect(screen.getByText("90% Profit Share")).toBeTruthy();
      expect(screen.getByText("Instant Funding")).toBeTruthy();
      expect(screen.getByText("Scaling Plan")).toBeTruthy();
      expect(screen.getByText("Multi-Phase Evaluation")).toBeTruthy();
      expect(screen.getByText("MT5 Integration")).toBeTruthy();
    });

    it("renders feature descriptions", () => {
      render(<Landing />);
      expect(screen.getByText(/Pass our structured evaluation/)).toBeTruthy();
      expect(screen.getByText(/Keep 90% of every dollar/)).toBeTruthy();
      expect(screen.getByText(/Select instant funding/)).toBeTruthy();
      expect(screen.getByText(/Prove your consistency/)).toBeTruthy();
      expect(screen.getByText(/One-step and two-step challenges/)).toBeTruthy();
      // "MetaTrader 5" appears in both features and FAQ, use getAllByText
      const mt5Elements = screen.getAllByText(/MetaTrader 5/);
      expect(mt5Elements.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("Testimonials Carousel", () => {
    it("renders the section header", () => {
      render(<Landing />);
      expect(screen.getByText("Trusted by Traders Across Africa")).toBeTruthy();
    });

    it("renders the carousel component", () => {
      render(<Landing />);
      expect(screen.getByTestId("carousel")).toBeTruthy();
    });

    it("renders all 5 testimonial carousel items", () => {
      render(<Landing />);
      const items = screen.getAllByTestId("carousel-item");
      expect(items.length).toBe(5);
    });

    it("renders carousel navigation buttons", () => {
      render(<Landing />);
      expect(screen.getByTestId("carousel-prev")).toBeTruthy();
      expect(screen.getByTestId("carousel-next")).toBeTruthy();
    });

    it("renders testimonial author names", () => {
      render(<Landing />);
      expect(screen.getByText("Emeka O.")).toBeTruthy();
      expect(screen.getByText("Amina K.")).toBeTruthy();
      expect(screen.getByText("Tunde B.")).toBeTruthy();
      expect(screen.getByText("Chidinma N.")).toBeTruthy();
      expect(screen.getByText("Kofi A.")).toBeTruthy();
    });

    it("renders testimonial roles", () => {
      render(<Landing />);
      expect(screen.getByText("Funded Trader — $100K Account")).toBeTruthy();
      expect(screen.getByText("Funded Trader — $50K Account")).toBeTruthy();
      expect(screen.getByText("Funded Trader — $200K Account")).toBeTruthy();
      expect(screen.getByText("Funded Trader — $25K Account")).toBeTruthy();
      expect(screen.getByText("Funded Trader — $10K Account")).toBeTruthy();
    });
  });

  describe("Pricing Section", () => {
    it("renders the section header", () => {
      render(<Landing />);
      expect(screen.getByText("Choose Your Account Size")).toBeTruthy();
    });

    it("renders all 6 pricing cards", () => {
      render(<Landing />);
      expect(screen.getByText("$5,000")).toBeTruthy();
      expect(screen.getByText("$10,000")).toBeTruthy();
      expect(screen.getByText("$25,000")).toBeTruthy();
      expect(screen.getByText("$50,000")).toBeTruthy();
      expect(screen.getByText("$100,000")).toBeTruthy();
      expect(screen.getByText("$200,000")).toBeTruthy();
    });

    it("renders NGN prices", () => {
      render(<Landing />);
      expect(screen.getByText("₦55,000")).toBeTruthy();
      expect(screen.getByText("₦99,000")).toBeTruthy();
      expect(screen.getByText("₦199,000")).toBeTruthy();
      expect(screen.getByText("₦349,000")).toBeTruthy();
      expect(screen.getByText("₦549,000")).toBeTruthy();
      expect(screen.getByText("₦999,000")).toBeTruthy();
    });

    it("renders Select buttons for each pricing card", () => {
      render(<Landing />);
      const selectButtons = screen.getAllByText("Select");
      expect(selectButtons.length).toBe(6);
    });

    it("navigates to /auth when Select is clicked", () => {
      render(<Landing />);
      const selectButtons = screen.getAllByText("Select");
      fireEvent.click(selectButtons[0]);
      expect(mockNavigate).toHaveBeenCalledWith("/auth");
    });

    it("renders the challenge types note", () => {
      render(<Landing />);
      expect(
        screen.getByText(/All account sizes available for One Step, Two Step, and Instant Funding challenges/)
      ).toBeTruthy();
    });
  });

  describe("FAQ Section", () => {
    it("renders the section header", () => {
      render(<Landing />);
      expect(screen.getByText("Frequently Asked Questions")).toBeTruthy();
    });

    it("renders the accordion", () => {
      render(<Landing />);
      expect(screen.getByTestId("accordion")).toBeTruthy();
    });

    it("renders all 8 FAQ questions", () => {
      render(<Landing />);
      expect(screen.getByText("How does the challenge process work?")).toBeTruthy();
      expect(screen.getByText("What happens if I violate a challenge rule?")).toBeTruthy();
      expect(screen.getByText("How much of the profits do I keep?")).toBeTruthy();
      expect(screen.getByText("How are payouts processed?")).toBeTruthy();
      expect(screen.getByText("What trading platforms do you support?")).toBeTruthy();
      expect(screen.getByText("Is there a scaling plan?")).toBeTruthy();
      expect(screen.getByText("Can I trade news or hold positions over weekends?")).toBeTruthy();
      expect(screen.getByText("What payment methods do you accept?")).toBeTruthy();
    });

    it("renders all 8 accordion items", () => {
      render(<Landing />);
      const items = screen.getAllByTestId("accordion-item");
      expect(items.length).toBe(8);
    });

    it("renders FAQ answers in accordion content", () => {
      render(<Landing />);
      expect(screen.getByText(/You select an account size and challenge type/)).toBeTruthy();
      expect(screen.getByText(/exceed the maximum drawdown/)).toBeTruthy();
      expect(screen.getByText(/You keep 90% of all profits/)).toBeTruthy();
      expect(screen.getByText(/processed through your preferred payment method/)).toBeTruthy();
      // MetaTrader 5 / raw ECN spreads appears in FAQ AND features, use getAllByText
      const ecnElements = screen.getAllByText(/raw ECN spreads/);
      expect(ecnElements.length).toBeGreaterThanOrEqual(2);
      expect(screen.getByText(/grow your account through our scaling plan/)).toBeTruthy();
      expect(screen.getByText(/depends on the challenge type/)).toBeTruthy();
      expect(screen.getByText(/Flutterwave for Nigerian Naira/)).toBeTruthy();
    });
  });

  describe("CTA Section", () => {
    it("renders the final CTA heading", () => {
      render(<Landing />);
      expect(screen.getByText("Ready to Start Your Journey?")).toBeTruthy();
    });

    it("renders CTA description", () => {
      render(<Landing />);
      expect(
        screen.getByText(/Join thousands of funded traders across Africa/)
      ).toBeTruthy();
    });

    it("renders Get Funded Now button", () => {
      render(<Landing />);
      expect(screen.getByText("Get Funded Now")).toBeTruthy();
    });

    it("renders Learn More button", () => {
      render(<Landing />);
      expect(screen.getByText("Learn More")).toBeTruthy();
    });

    it("navigates to /auth on Get Funded Now click", () => {
      render(<Landing />);
      fireEvent.click(screen.getByText("Get Funded Now"));
      expect(mockNavigate).toHaveBeenCalledWith("/auth");
    });

    it("navigates to /auth on Learn More click", () => {
      render(<Landing />);
      fireEvent.click(screen.getByText("Learn More"));
      expect(mockNavigate).toHaveBeenCalledWith("/auth");
    });
  });

  describe("Footer", () => {
    it("renders brand and copyright in footer", () => {
      render(<Landing />);
      // Brand appears in header + footer; verify at least 2 occurrences
      const brands = screen.getAllByText("AfriFundedCapital");
      expect(brands.length).toBeGreaterThanOrEqual(2);
      expect(screen.getByText("© 2026")).toBeTruthy();
    });

    it("renders footer links", () => {
      render(<Landing />);
      expect(screen.getByText("Terms")).toBeTruthy();
      expect(screen.getByText("Privacy")).toBeTruthy();
      expect(screen.getByText("Contact")).toBeTruthy();
    });

    it("renders support email", () => {
      render(<Landing />);
      expect(screen.getByText("support@afrifundedcapital.com")).toBeTruthy();
    });
  });

  describe("Full Integration", () => {
    it("renders all major sections without crashing", () => {
      render(<Landing />);
      // Hero
      expect(screen.getByText("Get Funded to")).toBeTruthy();
      // Stats
      expect(screen.getByText("Funded Traders")).toBeTruthy();
      // How it works
      expect(screen.getByText("How It Works")).toBeTruthy();
      // Features
      expect(screen.getByText("Everything You Need to Succeed")).toBeTruthy();
      // Testimonials
      expect(screen.getByText("Trusted by Traders Across Africa")).toBeTruthy();
      // Pricing
      expect(screen.getByText("Choose Your Account Size")).toBeTruthy();
      // FAQ
      expect(screen.getByText("Frequently Asked Questions")).toBeTruthy();
      // CTA
      expect(screen.getByText("Ready to Start Your Journey?")).toBeTruthy();
      // Footer
      expect(screen.getByText("© 2026")).toBeTruthy();
    });
  });
});
