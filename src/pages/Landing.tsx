import { motion } from "framer-motion";
import { useNavigate } from "react-router";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  ArrowRight,
  BarChart3,
  Shield,
  Zap,
  Users,
  Award,
  ChevronRight,
  TrendingUp,
  Globe,
  CheckCircle,
} from "lucide-react";
import { LogoDropdown } from "@/components/LogoDropdown";

const fadeInUp = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.6, ease: "easeOut" as const } },
};

const stagger = {
  animate: {
    transition: { staggerChildren: 0.1, delayChildren: 0.2 },
  },
};

export default function Landing() {
  const navigate = useNavigate();
  const { isLoading, isAuthenticated } = useAuth();

  const features = [
    {
      icon: <BarChart3 className="h-5 w-5" />,
      title: "Challenge-Based Funding",
      description: "Pass our structured evaluation and get funded with up to $1M in capital.",
    },
    {
      icon: <Shield className="h-5 w-5" />,
      title: "90% Profit Share",
      description: "Keep 90% of your profits. No hidden fees, no catch.",
    },
    {
      icon: <Zap className="h-5 w-5" />,
      title: "Instant Funding",
      description: "Choose instant funding and start trading immediately with real capital.",
    },
    {
      icon: <Users className="h-5 w-5" />,
      title: "Scaling Plan",
      description: "Grow your account up to $5M as you prove your consistency.",
    },
    {
      icon: <Award className="h-5 w-5" />,
      title: "Multi-Phase Evaluation",
      description: "One-step and two-step challenges designed to identify top traders.",
    },
    {
      icon: <TrendingUp className="h-5 w-5" />,
      title: "MT5 Integration",
      description: "Trade on the industry-standard MetaTrader 5 platform with ECN execution.",
    },
  ];

  const accountSizes = [
    { size: "$5,000", price: "₦55,000" },
    { size: "$10,000", price: "₦99,000" },
    { size: "$25,000", price: "₦199,000" },
    { size: "$50,000", price: "₦349,000" },
    { size: "$100,000", price: "₦549,000" },
    { size: "$200,000", price: "₦999,000" },
  ];

  const stats = [
    { label: "Funded Traders", value: "2,400+" },
    { label: "Total Capital Deployed", value: "$48M+" },
    { label: "Payouts Processed", value: "$12M+" },
    { label: "Avg. Trader Earnings", value: "$8,400" },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* ─── Navigation ─── */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-sm border-b border-border">
        <div className="container-page flex items-center justify-between h-16">
          <div className="flex items-center gap-3">
            <LogoDropdown />
            <span className="text-sm font-medium tracking-tight">AfriFundedCapital</span>
          </div>
          <nav className="hidden md:flex items-center gap-8 text-xs text-muted-foreground">
            <a href="#features" className="hover:text-foreground transition-colors">Features</a>
            <a href="#pricing" className="hover:text-foreground transition-colors">Pricing</a>
            <a href="#how-it-works" className="hover:text-foreground transition-colors">How It Works</a>
          </nav>
          <div className="flex items-center gap-3">
            {isLoading ? null : isAuthenticated ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate("/dashboard")}
                className="text-xs"
              >
                Dashboard
                <ChevronRight className="ml-1 h-3 w-3" />
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={() => navigate("/auth")}
                className="text-xs"
              >
                Get Started
                <ArrowRight className="ml-1 h-3 w-3" />
              </Button>
            )}
          </div>
        </div>
      </header>

      {/* ─── Hero ─── */}
      <section className="min-h-screen flex items-center justify-center px-4 pt-16">
        <motion.div
          variants={stagger}
          initial="initial"
          animate="animate"
          className="max-w-4xl mx-auto text-center"
        >
          <motion.div variants={fadeInUp} className="mb-6">
            <Badge variant="outline" className="rounded-full px-4 py-1 text-xs font-normal border-border">
              Africa's Premier Prop Trading Firm
            </Badge>
          </motion.div>

          <motion.h1
            variants={fadeInUp}
            className="text-4xl sm:text-5xl md:text-6xl font-light tracking-tight leading-[1.1] mb-6"
          >
            Get Funded to{" "}
            <span className="font-medium">Trade</span>
            <br />
            Keep{" "}
            <span className="font-medium">90% of Profits</span>
          </motion.h1>

          <motion.p
            variants={fadeInUp}
            className="text-muted-foreground text-sm max-w-xl mx-auto mb-10 leading-relaxed"
          >
            AfriFundedCapital provides ambitious traders with access to significant capital.
            Pass our evaluation, prove your strategy, and trade with funds up to $1M.
          </motion.p>

          <motion.div variants={fadeInUp} className="flex items-center justify-center gap-4">
            <Button
              size="lg"
              onClick={() => navigate("/auth")}
              className="px-8 text-sm"
            >
              Start Your Challenge
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="lg"
              onClick={() => navigate("/auth")}
              className="px-8 text-sm"
            >
              Learn More
            </Button>
          </motion.div>

          {/* Stats */}
          <motion.div
            variants={fadeInUp}
            className="mt-20 grid grid-cols-2 md:grid-cols-4 gap-8"
          >
            {stats.map((stat) => (
              <div key={stat.label} className="text-center">
                <div className="text-2xl font-light tracking-tight">{stat.value}</div>
                <div className="text-xs text-muted-foreground uppercase tracking-wider mt-1">
                  {stat.label}
                </div>
              </div>
            ))}
          </motion.div>
        </motion.div>
      </section>

      {/* ─── How It Works ─── */}
      <section id="how-it-works" className="py-32 px-4">
        <div className="container-page max-w-5xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="text-center mb-20"
          >
            <h2 className="text-2xl font-light tracking-tight mb-3">How It Works</h2>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              Three simple steps to becoming a funded trader
            </p>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-12">
            {[
              {
                step: "01",
                title: "Choose Your Challenge",
                description: "Select an account size and challenge type that suits your trading style.",
              },
              {
                step: "02",
                title: "Pass the Evaluation",
                description: "Trade normally to meet profit targets while respecting risk parameters.",
              },
              {
                step: "03",
                title: "Get Funded",
                description: "Receive your funded account and start trading with real capital.",
              },
            ].map((item) => (
              <motion.div
                key={item.step}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: Number(item.step) * 0.1 }}
                className="text-center"
              >
                <div className="text-4xl font-light text-muted-foreground/30 mb-4">
                  {item.step}
                </div>
                <h3 className="text-sm font-medium mb-3">{item.title}</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {item.description}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Features ─── */}
      <section id="features" className="py-32 px-4 bg-secondary/50">
        <div className="container-page max-w-5xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-20"
          >
            <h2 className="text-2xl font-light tracking-tight mb-3">
              Everything You Need to Succeed
            </h2>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              Comprehensive tools and features built for serious traders
            </p>
          </motion.div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature, i) => (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: i * 0.05 }}
                className="p-6 border border-border rounded-lg hover:bg-secondary/50 transition-colors"
              >
                <div className="h-8 w-8 rounded-full border border-border flex items-center justify-center mb-4">
                  {feature.icon}
                </div>
                <h3 className="text-sm font-medium mb-2">{feature.title}</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {feature.description}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Pricing ─── */}
      <section id="pricing" className="py-32 px-4">
        <div className="container-page max-w-5xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="text-2xl font-light tracking-tight mb-3">
              Choose Your Account Size
            </h2>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              Affordable entry prices for every level of trader
            </p>
          </motion.div>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {accountSizes.map((acct, i) => (
              <motion.div
                key={acct.size}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.3, delay: i * 0.05 }}
                className="p-5 border border-border rounded-lg text-center hover:bg-secondary/30 transition-colors"
              >
                <div className="text-lg font-light tracking-tight">{acct.size}</div>
                <div className="text-xs text-muted-foreground mt-2">{acct.price}</div>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full mt-4 text-xs"
                  onClick={() => navigate("/auth")}
                >
                  Select
                </Button>
              </motion.div>
            ))}
          </div>

          <div className="mt-12 text-center">
            <p className="text-xs text-muted-foreground">
              All account sizes available for One Step, Two Step, and Instant Funding challenges
            </p>
          </div>
        </div>
      </section>

      {/* ─── CTA ─── */}
      <section className="py-32 px-4 border-t border-border">
        <div className="container-page max-w-3xl text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <h2 className="text-2xl font-light tracking-tight mb-4">
              Ready to Start Your Journey?
            </h2>
            <p className="text-sm text-muted-foreground max-w-md mx-auto mb-8">
              Join thousands of funded traders. No experience required, just skill and discipline.
            </p>
            <Button
              size="lg"
              onClick={() => navigate("/auth")}
              className="px-10 text-sm"
            >
              Get Funded Now
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </motion.div>
        </div>
      </section>

      {/* ─── Footer ─── */}
      <footer className="py-12 px-4 border-t border-border">
        <div className="container-page">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium tracking-tight">AfriFundedCapital</span>
              <span className="text-xs text-muted-foreground">© 2026</span>
            </div>
            <div className="flex items-center gap-6 text-xs text-muted-foreground">
              <a href="#" className="hover:text-foreground transition-colors">Terms</a>
              <a href="#" className="hover:text-foreground transition-colors">Privacy</a>
              <a href="#" className="hover:text-foreground transition-colors">Contact</a>
              <span className="hidden md:inline">support@afrifundedcapital.com</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
