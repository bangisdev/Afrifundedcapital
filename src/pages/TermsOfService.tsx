import { useNavigate } from "react-router";
import { motion } from "framer-motion";
import { ArrowLeft, FileText } from "lucide-react";

const sections = [
  {
    title: "1. Acceptance of Terms",
    content:
      "By accessing or using AfriFundedCapital (\"the Platform\"), you agree to be bound by these Terms of Service. If you do not agree to all terms, you must not access or use the Platform. These terms apply to all users, including traders, affiliates, and visitors.",
  },
  {
    title: "2. Definitions",
    content:
      "\"Trader\" refers to any individual who purchases or participates in a challenge or funded account on the Platform. \"Challenge\" refers to the evaluation process a Trader must complete to qualify for a funded account. \"Funded Account\" refers to a live or simulated trading account allocated to a Trader after successfully passing a Challenge. \"Challenge Fee\" refers to the non-refundable fee paid by the Trader to access a Challenge. \"Profit Target\" refers to the minimum profit percentage a Trader must achieve during the Challenge.",
  },
  {
    title: "3. Eligibility",
    content:
      "To use the Platform, you must be at least 18 years of age and have the legal capacity to enter into binding agreements. You must provide accurate and complete registration information. You are responsible for maintaining the confidentiality of your account credentials and for all activities under your account. You may not share your account with any third party.",
  },
  {
    title: "4. Challenge Terms",
    content:
      "Challenge Fees are non-refundable once a Challenge has been initiated. Each Challenge has specific rules including but not limited to: profit targets, daily drawdown limits, maximum drawdown limits, minimum trading days, and duration limits. Violation of any Challenge rule may result in the Challenge being marked as \"Violated\" and termination of the evaluation. AfriFundedCapital reserves the right to modify Challenge rules with reasonable notice. Challenge fees may be paid using supported payment methods via Flutterwave or other integrated payment processors.",
  },
  {
    title: "5. Funded Accounts & Profit Sharing",
    content:
      "Traders who successfully complete a Challenge are eligible for a Funded Account with up to 90% profit share. Profit share percentages are determined by the Trader's tier and account type. Payout requests are subject to compliance checks and verification. AfriFundedCapital processes payouts within 2-5 business days from approval. The minimum payout amount is ₦5,000 (or equivalent). Funded Account traders must adhere to all trading rules specified in their account agreement.",
  },
  {
    title: "6. Trading Rules & Restrictions",
    content:
      "All traders must comply with the trading rules associated with their specific Challenge or Funded Account. Prohibited activities include but are not limited to: exploiting platform bugs or latency, using unauthorized third-party software, copy trading (unless explicitly permitted), trading during news blackout periods (where configured), holding positions over weekends (where restricted), and exceeding maximum position sizes. Violation of trading rules may result in account suspension, profit forfeiture, or permanent ban.",
  },
  {
    title: "7. Risk Disclosure",
    content:
      "Trading financial instruments, including forex, commodities, indices, and cryptocurrencies, involves substantial risk of loss. Past performance is not indicative of future results. You should only trade with funds you can afford to lose. AfriFundedCapital is not responsible for any trading losses incurred on funded accounts. The Platform provides simulated trading environments for evaluation purposes. Funded Accounts may be simulated or live at the sole discretion of AfriFundedCapital.",
  },
  {
    title: "8. Payments & Refunds",
    content:
      "All Challenge Fees are non-refundable unless required by applicable law. Refund requests for technical issues will be reviewed on a case-by-case basis. Payments are processed through Flutterwave and other integrated payment processors. AfriFundedCapital reserves the right to suspend or revoke accounts where payment fraud is suspected. Chargeback disputes will result in immediate account suspension pending investigation.",
  },
  {
    title: "9. Intellectual Property",
    content:
      "All content, branding, logos, and materials on the Platform are the exclusive property of AfriFundedCapital. You may not reproduce, distribute, or create derivative works from any content on the Platform without prior written consent. The AfriFundedCapital name, logo, and all related marks are trademarks of AfriFundedCapital.",
  },
  {
    title: "10. Limitation of Liability",
    content:
      "AfriFundedCapital shall not be liable for any indirect, incidental, special, consequential, or punitive damages arising from or related to your use of the Platform. Our total liability shall not exceed the amount of Challenge Fees paid by you in the twelve (12) months preceding the claim. We are not liable for losses due to market conditions, internet outages, or force majeure events.",
  },
  {
    title: "11. Termination",
    content:
      "AfriFundedCapital reserves the right to terminate or suspend your account at any time for violations of these Terms. You may close your account at any time by contacting support. Upon termination, all rights granted to you under these Terms will cease. Outstanding payout requests will be processed in accordance with our standard procedures.",
  },
  {
    title: "12. Privacy",
    content:
      "Your use of the Platform is also governed by our Privacy Policy, which is incorporated into these Terms by reference. Please review our Privacy Policy to understand how we collect, use, and protect your personal information.",
  },
  {
    title: "13. Governing Law",
    content:
      "These Terms shall be governed by and construed in accordance with the laws of the Federal Republic of Nigeria. Any disputes arising from these Terms shall be resolved through binding arbitration in Lagos, Nigeria, unless otherwise agreed in writing.",
  },
  {
    title: "14. Changes to Terms",
    content:
      "AfriFundedCapital reserves the right to modify these Terms at any time. Material changes will be communicated via email or Platform notification at least 14 days before taking effect. Continued use of the Platform after changes take effect constitutes acceptance of the modified Terms.",
  },
  {
    title: "15. Contact",
    content:
      "For questions about these Terms, please contact us at support@afrifundedcapital.com or visit our Contact page.",
  },
];

export default function TermsOfService() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-lg border-b border-border/50">
        <div className="container-page flex items-center gap-4 h-16">
          <button
            onClick={() => navigate("/")}
            className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back
          </button>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium tracking-tight">AfriFundedCapital</span>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="container-page max-w-3xl py-12 sm:py-16">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          {/* Page Header */}
          <div className="flex items-center gap-3 mb-8">
            <div className="h-10 w-10 rounded-xl bg-brand/10 flex items-center justify-center">
              <FileText className="h-5 w-5 text-brand" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Terms of Service</h1>
              <p className="text-xs text-muted-foreground mt-0.5">Last updated: August 20, 2026</p>
            </div>
          </div>

          {/* Introduction */}
          <div className="card-subtle p-6 mb-8">
            <p className="text-sm text-muted-foreground leading-relaxed">
              Welcome to AfriFundedCapital. These Terms of Service govern your use of our platform,
              including all challenge evaluations, funded accounts, and related services. Please read
              these terms carefully before using the Platform.
            </p>
          </div>

          {/* Sections */}
          <div className="space-y-6">
            {sections.map((section) => (
              <motion.div
                key={section.title}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
              >
                <h2 className="text-sm font-semibold mb-2">{section.title}</h2>
                <p className="text-xs text-muted-foreground leading-relaxed pl-4 border-l-2 border-border">
                  {section.content}
                </p>
              </motion.div>
            ))}
          </div>

          {/* Bottom CTA */}
          <div className="mt-12 pt-8 border-t border-border text-center">
            <p className="text-xs text-muted-foreground mb-4">
              Questions about our Terms of Service?
            </p>
            <button
              onClick={() => navigate("/contact")}
              className="text-xs font-medium text-brand hover:underline underline-offset-2"
            >
              Contact our legal team
            </button>
          </div>
        </motion.div>
      </main>
    </div>
  );
}
