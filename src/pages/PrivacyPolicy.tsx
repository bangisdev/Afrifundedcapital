import { useNavigate } from "react-router";
import { motion } from "framer-motion";
import { ArrowLeft, Shield } from "lucide-react";

const sections = [
  {
    title: "1. Information We Collect",
    content:
      "We collect information you provide directly: name, email address, phone number, trading experience, timezone, and country. We also collect identity verification documents (passport, national ID, driver's license, proof of address, selfie) for KYC purposes. Automatically collected data includes IP address, browser type, device information, and usage analytics. Payment information is processed by our payment partners (Flutterwave, Paystack) and is never stored on our servers.",
  },
  {
    title: "2. How We Use Your Information",
    content:
      "We use your information to: provide and improve our services, process challenge purchases and payouts, verify your identity (KYC), communicate with you about your account and services, detect and prevent fraud and abuse, comply with legal obligations, send marketing communications (with your consent), and analyze platform usage to improve user experience.",
  },
  {
    title: "3. Information Sharing",
    content:
      "We do not sell your personal information. We share information only with: payment processors (Flutterwave, Paystack) for transaction processing, MT5 brokers for account provisioning, analytics services for platform improvement, law enforcement when legally required, and third parties with your explicit consent.",
  },
  {
    title: "4. Data Security",
    content:
      "We implement industry-standard security measures including encryption (TLS 1.3), secure database storage, access controls, regular security audits, and monitoring for suspicious activity. KYC documents are encrypted at rest. However, no method of transmission over the Internet is 100% secure, and we cannot guarantee absolute security.",
  },
  {
    title: "5. Data Retention",
    content:
      "We retain your personal information for as long as your account is active or as needed to provide services. Account data is retained for up to 7 years after account closure for regulatory compliance. KYC documents are retained for 5 years after verification. You may request deletion of non-essential data by contacting support.",
  },
  {
    title: "6. Your Rights",
    content:
      "You have the right to: access your personal data, correct inaccurate data, request deletion of your data, object to processing of your data, request data portability, withdraw consent for marketing communications, and lodge a complaint with a supervisory authority. To exercise these rights, contact our Data Protection Officer at privacy@afrifundedcapital.com.",
  },
  {
    title: "7. Cookies & Tracking",
    content:
      "We use essential cookies for authentication and session management, analytics cookies to understand usage patterns, and preference cookies to remember your settings (theme, language). You can control cookies through your browser settings. Disabling essential cookies may affect platform functionality.",
  },
  {
    title: "8. International Data Transfers",
    content:
      "Your information may be transferred to and processed in countries other than your own. We ensure appropriate safeguards are in place for international transfers, including standard contractual clauses and data processing agreements with our service providers.",
  },
  {
    title: "9. Children's Privacy",
    content:
      "The Platform is not intended for users under 18 years of age. We do not knowingly collect personal information from children. If you believe we have collected information from a child, please contact us immediately for removal.",
  },
  {
    title: "10. KYC & Identity Verification",
    content:
      "We collect and process identity verification documents solely for the purpose of verifying your identity as required by applicable regulations. Documents are encrypted, stored securely, and accessed only by authorized personnel. We may use third-party verification services to validate submitted documents.",
  },
  {
    title: "11. Trading Data",
    content:
      "Trading data (positions, equity, drawdown, profit/loss) is collected and processed to evaluate your challenge performance, enforce trading rules, and calculate payouts. Trading data is retained for the duration of your account and for regulatory compliance purposes.",
  },
  {
    title: "12. Marketing Communications",
    content:
      "With your consent, we may send you marketing emails about new features, promotions, and trading opportunities. You can unsubscribe at any time by clicking the unsubscribe link in any marketing email or by updating your notification preferences in your account settings.",
  },
  {
    title: "13. Changes to This Policy",
    content:
      "We may update this Privacy Policy from time to time. Material changes will be communicated via email or platform notification at least 14 days before taking effect. The 'Last updated' date at the top of this page indicates when this policy was last revised.",
  },
  {
    title: "14. Contact Us",
    content:
      "For questions about this Privacy Policy, please contact our Data Protection Officer at privacy@afrifundedcapital.com or visit our Contact page.",
  },
];

export default function PrivacyPolicy() {
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
              <Shield className="h-5 w-5 text-brand" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Privacy Policy</h1>
              <p className="text-xs text-muted-foreground mt-0.5">Last updated: August 20, 2026</p>
            </div>
          </div>

          {/* Introduction */}
          <div className="card-subtle p-6 mb-8">
            <p className="text-sm text-muted-foreground leading-relaxed">
              At AfriFundedCapital, your privacy is fundamental to our operations. This Privacy Policy
              explains how we collect, use, store, and protect your personal information when you use
              our platform and services.
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
              Have a privacy concern or request?
            </p>
            <button
              onClick={() => navigate("/contact")}
              className="text-xs font-medium text-brand hover:underline underline-offset-2"
            >
              Contact our privacy team
            </button>
          </div>
        </motion.div>
      </main>
    </div>
  );
}
