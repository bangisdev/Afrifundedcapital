import { motion, useScroll, useTransform, useInView, type Variants } from "framer-motion";
import { useNavigate, Link } from "react-router";
import { useAuth } from "@/hooks/use-auth";
import { useEffect, useRef, useState, useCallback } from "react";
import { newsBlackoutWindow, RULE_HINTS, formatMoney } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
  type CarouselApi,
} from "@/components/ui/carousel";
import {
  ArrowRight,
  BarChart3,
  Shield,
  Zap,
  Users,
  Award,
  ChevronRight,
  TrendingUp,
  Quote,
  Star,
  MoveRight,
  Sparkles,
  MousePointer2,
  CheckCircle,
  XCircle,
  Loader2,
  CreditCard,
  ShieldCheck,
  Headphones,
  ExternalLink,
  Activity,
  Wallet,
  ArrowUpRight,
  ArrowDownRight,
  Menu,
  X,
} from "lucide-react";
import { LogoDropdown } from "@/components/LogoDropdown";
import { readResponseBody } from "@/lib/api";

// ─── Animation Variants ───

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 30 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.7 },
  },
};

const fadeIn: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { duration: 0.8 },
  },
};

const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.95 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: { duration: 0.5 },
  },
};

const stagger: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08, delayChildren: 0.15 } },
};

// ─── Animated Counter ───

function AnimatedCounter({ value, suffix = "", prefix = "" }: { value: string; suffix?: string; prefix?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true });
  const num = parseInt(value.replace(/[^0-9]/g, ""));
  const hasPlus = value.includes("+");
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    if (!isInView) return;
    let start = 0;
    const duration = 2000;
    const step = Math.max(1, Math.floor(num / 60));
    const timer = setInterval(() => {
      start += step;
      if (start >= num) {
        setDisplay(num);
        clearInterval(timer);
      } else {
        setDisplay(start);
      }
    }, duration / 60);
    return () => clearInterval(timer);
  }, [isInView, num]);

  return (
    <div ref={ref} className="text-center">
      <div className="text-3xl sm:text-4xl font-light tracking-tight">
        {prefix}{display.toLocaleString()}{hasPlus ? "+" : ""}{suffix}
      </div>
    </div>
  );
}

// ─── Testimonial Data ───

const testimonials = [
  {
    name: "Emeka O.",
    role: "Funded Trader — $100K Account",
    content:
      "After failing two challenges with other firms, AfriFundedCapital's transparent rules and fair evaluation gave me the confidence to succeed. Passed my one-step on the first try.",
    rating: 5,
  },
  {
    name: "Amina K.",
    role: "Funded Trader — $50K Account",
    content:
      "The 90% profit share is unmatched. I've already received two payouts and the process was seamless. Finally a prop firm that actually pays what they promise.",
    rating: 5,
  },
  {
    name: "Tunde B.",
    role: "Funded Trader — $200K Account",
    content:
      "What sets AFC apart is the support team. When I had questions about my trading metrics, they responded within minutes. Real people who care about your success.",
    rating: 5,
  },
  {
    name: "Chidinma N.",
    role: "Funded Trader — $25K Account",
    content:
      "Started with the $5K account to test the waters. The scaling plan is incredible — I'm now trading a $50K account and working toward $100K. Best decision I've made.",
    rating: 5,
  },
  {
    name: "Kofi A.",
    role: "Funded Trader — $10K Account",
    content:
      "The consistency rules helped me become a better trader. Having clear targets and drawdown limits forced me to develop a proper risk management strategy.",
    rating: 5,
  },
];

// ─── Feature Data ───

const features = [
  {
    icon: <BarChart3 className="h-5 w-5" />,
    title: "Challenge-Based Funding",
    description: "Pass our structured evaluation and get funded with up to $1M in capital. Choose from one-step, two-step, or instant funding.",
  },
  {
    icon: <Shield className="h-5 w-5" />,
    title: "90% Profit Share",
    description: "Keep 90% of every dollar you earn. No hidden fees, no performance gates, no excuses. You earn, we pay.",
  },
  {
    icon: <Zap className="h-5 w-5" />,
    title: "Instant Funding",
    description: "Select instant funding and begin trading with real capital immediately. Skip the evaluation and start earning right away.",
  },
  {
    icon: <Users className="h-5 w-5" />,
    title: "Scaling Plan",
    description: "Prove your consistency and grow your account up to $5M. Every profitable quarter unlocks the next level of capital.",
  },
  {
    icon: <Award className="h-5 w-5" />,
    title: "Multi-Phase Evaluation",
    description: "One-step and two-step challenges designed to identify top traders. Fair profit targets with reasonable time frames.",
  },
  {
    icon: <TrendingUp className="h-5 w-5" />,
    title: "MT5 Integration",
    description: "Trade on MetaTrader 5 with raw ECN spreads. Real-time metrics, drawdown tracking, and daily performance monitoring.",
  },
];

// ─── Challenge Selection Data & Helpers ───

interface ChallengeTemplate {
  id: number | string;
  name: string;
  description?: string;
  type: string;
  profitTarget?: number;
  dailyDrawdown?: number;
  maxDrawdown?: number;
  maxLeverage?: number;
  minTradingDays?: number;
  durationDays?: number;
  allowWeekendHolding?: boolean;
  allowNewsTrading?: boolean;
  allowEATrading?: boolean;
  allowCopyTrading?: boolean;
  newsBlackoutBeforeMinutes?: number | null;
  newsBlackoutAfterMinutes?: number | null;
  resetFee?: number | null;
  extensionFee?: number | null;
  consistencyTarget?: number | null;
  maxPositionSize?: number | null;
  scalingPlan?: string | null;
  maxAccountSize?: number | null;
}

interface AccountSizeRow {
  id?: number | string;
  label: string;
  price: number | string;
}

const FALLBACK_TYPES: ChallengeTemplate[] = [
  {
    id: "one-step",
    name: "One-Step Challenge",
    type: "one_step",
    description: "Single-phase challenge with a 10% profit target. Fast track to funding with a 4% daily drawdown limit.",
    profitTarget: 10,
    dailyDrawdown: 4,
    maxDrawdown: 8,
    maxLeverage: 50,
    minTradingDays: 3,
    durationDays: 30,
    allowWeekendHolding: false,
    allowNewsTrading: true,
    allowEATrading: true,
    allowCopyTrading: false,
    newsBlackoutBeforeMinutes: 15,
    newsBlackoutAfterMinutes: 15,
    resetFee: 8000,
    extensionFee: 4000,
    consistencyTarget: 20,
    maxPositionSize: 25,
    scalingPlan:
      "Grow up to $1M — 20% account increase after 3 consecutive profitable months.",
  },
  {
    id: "two-step",
    name: "Two-Step Evaluation",
    type: "two_step",
    description: "Classic two-phase evaluation with 8% profit target, 5% daily and 10% max drawdown. Prove your skills in two steps.",
    profitTarget: 8,
    dailyDrawdown: 5,
    maxDrawdown: 10,
    maxLeverage: 100,
    minTradingDays: 5,
    durationDays: 30,
    allowWeekendHolding: false,
    allowNewsTrading: true,
    allowEATrading: true,
    allowCopyTrading: false,
    newsBlackoutBeforeMinutes: 15,
    newsBlackoutAfterMinutes: 15,
    resetFee: 10000,
    extensionFee: 5000,
    consistencyTarget: 20,
    maxPositionSize: 30,
    scalingPlan:
      "Grow up to $1M — 20% account increase after 3 consecutive profitable months.",
  },
  {
    id: "instant-funding",
    name: "Instant Funding",
    type: "instant_funding",
    description: "Get funded immediately with no evaluation. Higher leverage and flexible rules for experienced traders.",
    profitTarget: 10,
    dailyDrawdown: 5,
    maxDrawdown: 10,
    maxLeverage: 100,
    minTradingDays: 0,
    durationDays: 30,
    allowWeekendHolding: true,
    allowNewsTrading: true,
    allowEATrading: true,
    allowCopyTrading: true,
    newsBlackoutBeforeMinutes: 15,
    newsBlackoutAfterMinutes: 15,
    resetFee: 16000,
    extensionFee: 8000,
    consistencyTarget: null,
    maxPositionSize: 50,
    scalingPlan:
      "Grow up to $1M — 20% account increase after 3 consecutive profitable months.",
  },
];

const FALLBACK_SIZES: AccountSizeRow[] = [
  { label: "$5,000", price: "₦55,000" },
  { label: "$10,000", price: "₦99,000" },
  { label: "$25,000", price: "₦199,000" },
  { label: "$50,000", price: "₦349,000" },
  { label: "$100,000", price: "₦549,000" },
  { label: "$200,000", price: "₦999,000" },
];

const TYPE_LABELS: Record<string, string> = {
  one_step: "One-Step",
  two_step: "Two-Step",
  instant_funding: "Instant",
};

const PHASE_LABELS: Record<string, string> = {
  one_step: "1 Phase",
  two_step: "2 Phases",
  instant_funding: "No Evaluation",
};

function challengeTypeLabel(type?: string) {
  return TYPE_LABELS[type || ""] || "Challenge";
}

function challengePhaseLabel(type?: string) {
  return PHASE_LABELS[type || ""] || "—";
}

function formatPrice(price: number | string) {
  return typeof price === "number" ? `₦${price.toLocaleString()}` : price;
}


/**
 * Public-facing news-trading rule label. When a template allows news trading
 * it reads "Allowed"; when restricted it surfaces the template's configured
 * blackout window via the shared newsBlackoutWindow formatter (mirroring the
 * "No news 30m/5m" chips on the admin MT5 page).
 */
function newsTradingLabel(t: ChallengeTemplate) {
  if (t.allowNewsTrading !== false) return "Allowed";
  const win = newsBlackoutWindow(t);
  return win ? `Restricted · ${win}` : "Restricted · no blackout";
}

function ruleRow(ok: boolean, label: string, value: string) {
  return (
    <div className="flex items-center gap-2 text-xs">
      {ok ? (
        <CheckCircle className="h-3.5 w-3.5 text-brand shrink-0" />
      ) : (
        <XCircle className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" />
      )}
      <span className="text-muted-foreground">{label}</span>
      <span className={`ml-auto font-medium tabular-nums ${ok ? "" : "text-muted-foreground"}`}>{value}</span>
    </div>
  );
}

// ─── Live Platform Preview ───
// Stylised product shot: a floating trader-portal panel with an animated
// equity curve, stat tiles and payout chips. Pure decoration — no data,
// no links — rendered between the hero and the stats bar.

const EQUITY_PATH = "M0,148 C42,146 70,134 104,136 C138,138 166,116 198,114 C230,112 258,126 288,120 C318,114 348,94 378,90 C408,86 436,96 466,82 C496,68 530,54 560,46";
const EQUITY_AREA = `${EQUITY_PATH} L560,180 L0,180 Z`;

function PlatformPreview() {
  return (
    <section className="relative py-20 sm:py-24 px-4 overflow-hidden">
      <div className="container-page max-w-5xl">
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.7, ease: "easeOut" }}
          className="relative"
        >
          {/* Ambient glow behind the panel */}
          <div
            aria-hidden
            className="absolute -inset-8 rounded-[2rem] bg-brand/5 blur-3xl"
          />

          {/* ── Window frame ── */}
          <div className="relative panel overflow-hidden">
            {/* Title bar */}
            <div className="flex items-center gap-2 px-5 py-3 border-b border-border/60 bg-secondary/30">
              <span className="h-2.5 w-2.5 rounded-full bg-border" />
              <span className="h-2.5 w-2.5 rounded-full bg-border" />
              <span className="h-2.5 w-2.5 rounded-full bg-border" />
              <div className="ml-3 flex items-center gap-1.5 text-[10px] font-medium text-muted-foreground min-w-0">
                <Activity className="h-3 w-3 shrink-0" />
                <span className="truncate">Trader Portal — One-Step Challenge</span>
              </div>
              <span className="ml-auto inline-flex shrink-0 items-center gap-1.5 rounded-full border border-brand/25 bg-brand/10 px-2 py-0.5 text-[9px] font-medium uppercase tracking-wider text-brand">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand opacity-60" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-brand" />
                </span>
                Live
              </span>
            </div>

            <div className="grid sm:grid-cols-[150px_1fr]">
              {/* Mini sidebar */}
              <div className="hidden sm:flex flex-col gap-1 border-r border-border/60 p-3 text-[10px] text-muted-foreground">
                {[
                  { icon: <BarChart3 className="h-3.5 w-3.5" />, label: "Overview" },
                  { icon: <Wallet className="h-3.5 w-3.5" />, label: "Wallet" },
                  { icon: <Award className="h-3.5 w-3.5" />, label: "Challenges" },
                  { icon: <TrendingUp className="h-3.5 w-3.5" />, label: "Metrics" },
                  { icon: <Shield className="h-3.5 w-3.5" />, label: "Security" },
                ].map((item, i) => (
                  <div
                    key={item.label}
                    className={`flex items-center gap-2 rounded-md px-2 py-1.5 ${
                      i === 0 ? "bg-secondary text-foreground" : "hover:bg-secondary/50"
                    }`}
                  >
                    {item.icon}
                    {item.label}
                  </div>
                ))}
              </div>

              {/* Main area */}
              <div className="p-5 sm:p-6 space-y-5">
                {/* Stat tiles */}
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: "Equity", value: "$50,412", delta: "+2.4%", up: true },
                    { label: "Today", value: "+$312.40", delta: "+0.6%", up: true },
                    { label: "Drawdown", value: "2.1%", delta: "−0.4%", up: false },
                  ].map((s) => (
                    <div key={s.label} className="rounded-lg border border-border/60 bg-background p-3">
                      <div className="text-[9px] uppercase tracking-wider text-muted-foreground mb-1">{s.label}</div>
                      <div className="text-sm sm:text-base font-light tracking-tight tabular-nums">{s.value}</div>
                      <div
                        className={`mt-0.5 inline-flex items-center gap-0.5 text-[9px] font-medium tabular-nums ${
                          s.up ? "text-brand" : "text-destructive"
                        }`}
                      >
                        {s.up ? (
                          <ArrowUpRight className="h-2.5 w-2.5" />
                        ) : (
                          <ArrowDownRight className="h-2.5 w-2.5" />
                        )}
                        {s.delta}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Equity chart */}
                <div className="rounded-lg border border-border/60 bg-background p-4">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                      Equity Curve
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full border border-brand/25 bg-brand/10 px-2 py-0.5 text-[9px] font-medium tabular-nums text-brand">
                      <ArrowUpRight className="h-2.5 w-2.5" />
                      +13.4% this month
                    </span>
                  </div>
                  <svg viewBox="0 0 560 180" className="w-full h-32 sm:h-40" role="img" aria-label="Illustrative equity curve trending upward">
                    <defs>
                      <linearGradient id="afc-eq-fill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--brand)" stopOpacity="0.16" />
                        <stop offset="100%" stopColor="var(--brand)" stopOpacity="0" />
                      </linearGradient>
                    </defs>
                    {/* Horizontal gridlines */}
                    {[36, 72, 108, 144].map((y) => (
                      <line key={y} x1="0" x2="560" y1={y} y2={y} stroke="var(--border)" strokeWidth="1" strokeDasharray="2 6" />
                    ))}
                    {/* Max drawdown reference line */}
                    <line x1="0" x2="560" y1="132" y2="132" stroke="var(--muted-foreground)" strokeOpacity="0.35" strokeWidth="1" strokeDasharray="6 5" />
                    <text x="552" y="126" textAnchor="end" fontSize="8" fill="var(--muted-foreground)" fillOpacity="0.7" fontFamily="var(--font-mono)">
                      max DD
                    </text>
                    {/* Area fill + line */}
                    <motion.path
                      d={EQUITY_AREA}
                      fill="url(#afc-eq-fill)"
                      initial={{ opacity: 0 }}
                      whileInView={{ opacity: 1 }}
                      viewport={{ once: true }}
                      transition={{ delay: 1.4, duration: 0.6 }}
                    />
                    <motion.path
                      d={EQUITY_PATH}
                      fill="none"
                      stroke="var(--brand)"
                      strokeWidth="2"
                      strokeLinecap="round"
                      initial={{ pathLength: 0 }}
                      whileInView={{ pathLength: 1 }}
                      viewport={{ once: true }}
                      transition={{ duration: 1.8, ease: "easeInOut" }}
                    />
                    {/* Endpoint marker */}
                    <motion.circle
                      cx="560"
                      cy="46"
                      r="4"
                      fill="var(--brand)"
                      initial={{ opacity: 0, scale: 0 }}
                      whileInView={{ opacity: 1, scale: 1 }}
                      viewport={{ once: true }}
                      transition={{ delay: 1.6, duration: 0.4 }}
                    />
                    <motion.circle
                      cx="560"
                      cy="46"
                      r="9"
                      fill="var(--brand)"
                      fillOpacity="0.15"
                      initial={{ opacity: 0, scale: 0 }}
                      whileInView={{ opacity: 1, scale: 1 }}
                      viewport={{ once: true }}
                      transition={{ delay: 1.6, duration: 0.5 }}
                    />
                  </svg>
                </div>

                {/* Phase progress */}
                <div>
                  <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1.5">
                    <span>Phase 1 progress</span>
                    <span className="tabular-nums">68% of 10% target</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
                    <motion.div
                      className="h-full rounded-full bg-foreground"
                      initial={{ width: 0 }}
                      whileInView={{ width: "68%" }}
                      viewport={{ once: true }}
                      transition={{ duration: 1.2, ease: "easeOut", delay: 0.6 }}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Floating payout chip */}
          <motion.div
            className="absolute -right-2 sm:-right-10 top-14 hidden sm:flex"
            animate={{ y: [0, -8, 0] }}
            transition={{ duration: 4.5, repeat: Infinity, ease: "easeInOut" }}
          >
            <div className="card-subtle flex items-center gap-2.5 px-3.5 py-2.5 shadow-lg">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand/10 text-brand">
                <CheckCircle className="h-3.5 w-3.5" />
              </span>
              <div className="leading-tight">
                <div className="text-[10px] font-medium tabular-nums">Payout approved · ₦842,000</div>
                <div className="text-[9px] text-muted-foreground">2–5 business days</div>
              </div>
            </div>
          </motion.div>

          {/* Floating profit chip */}
          <motion.div
            className="absolute -left-2 sm:-left-10 bottom-24 hidden sm:flex"
            animate={{ y: [0, 8, 0] }}
            transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
          >
            <div className="card-subtle flex items-center gap-2.5 px-3.5 py-2.5 shadow-lg">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-secondary text-foreground/80">
                <TrendingUp className="h-3.5 w-3.5" />
              </span>
              <div className="leading-tight">
                <div className="text-[10px] font-medium tabular-nums">Profit target +9.2%</div>
                <div className="text-[9px] text-muted-foreground">On track — 68% reached</div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}

function StatsBar() {
  const [stats, setStats] = useState({ totalTraders: 0, fundedTraders: 0, totalChallenges: 0, totalDeployed: 0 });

  useEffect(() => {
    fetch("/api/stats/public")
      .then((r) => r.json())
      .then(setStats)
      .catch(() => {});
  }, []);

  const displayStats = [
    { value: stats.totalTraders > 0 ? stats.totalTraders.toLocaleString() : "2,400", label: "Funded Traders" },
    { value: stats.totalDeployed > 0 ? stats.totalDeployed.toLocaleString() : "48,000,000", label: "Capital Deployed", prefix: "$", suffix: "+" },
    { value: stats.totalChallenges > 0 ? stats.totalChallenges.toLocaleString() : "12,000,000", label: "Payouts Processed", prefix: "$", suffix: "+" },
    { value: stats.fundedTraders > 0 ? Math.round(stats.totalDeployed / stats.fundedTraders).toLocaleString() : "8,400", label: "Avg. Earnings", prefix: "$" },
  ];

  return (
    <section className="py-16 px-4 border-y border-border/50">
      <div className="container-page max-w-5xl">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          {displayStats.map((stat, i) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1, duration: 0.5 }}
              className="text-center"
            >
              <AnimatedCounter value={stat.value} prefix={stat.prefix} suffix={stat.suffix} />
              <div className="text-xs text-muted-foreground uppercase tracking-wider mt-2">
                {stat.label}
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

export default function Landing() {
  const navigate = useNavigate();
  const { isLoading, isAuthenticated } = useAuth();
  const { scrollYProgress } = useScroll();
  const heroRef = useRef<HTMLDivElement>(null);
  const [mousePos, setMousePos] = useState({ x: 0.5, y: 0.5 });
  const [autoplay, setAutoplay] = useState(true);
  const autoplayRef = useRef<NodeJS.Timeout | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Parallax mouse tracking
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const rect = heroRef.current?.getBoundingClientRect();
    if (rect) {
      setMousePos({
        x: (e.clientX - rect.left) / rect.width,
        y: (e.clientY - rect.top) / rect.height,
      });
    }
  }, []);

  // Hero parallax transforms
  const heroBgX = useTransform(scrollYProgress, [0, 0.3], [0, -50]);
  const heroBgY = useTransform(scrollYProgress, [0, 0.3], [0, 50]);
  const heroScale = useTransform(scrollYProgress, [0, 0.3], [1, 0.98]);
  const heroOpacity = useTransform(scrollYProgress, [0, 0.25], [1, 0]);

  // Live challenge templates (progressive enhancement — static fallback until loaded)
  const [challengeTypes, setChallengeTypes] = useState<ChallengeTemplate[] | null>(null);
  const [selectedTypeId, setSelectedTypeId] = useState<string | null>(null);
  const [sizesByType, setSizesByType] = useState<Record<string, AccountSizeRow[]>>({});

  useEffect(() => {
    let cancelled = false;
    if (typeof fetch !== "function") return;
    fetch("/api/challenges/templates", { headers: { Accept: "application/json" } })
      .then((r) => (r.ok ? readResponseBody(r) : Promise.reject(new Error("fetch failed"))))
      .then((data: unknown) => {
        if (cancelled || !Array.isArray(data) || data.length === 0) return;
        setChallengeTypes(data as ChallengeTemplate[]);
        setSelectedTypeId(String((data as ChallengeTemplate[])[0].id));
      })
      .catch(() => {
        /* keep the static fallback */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!selectedTypeId || typeof fetch !== "function") return;
    let cancelled = false;
    fetch(`/api/challenges/templates/${selectedTypeId}/sizes`, { headers: { Accept: "application/json" } })
      .then((r) => (r.ok ? readResponseBody(r) : Promise.reject(new Error("fetch failed"))))
      .then((data: unknown) => {
        if (cancelled || !Array.isArray(data)) return;
        setSizesByType((prev) => ({ ...prev, [selectedTypeId]: data as AccountSizeRow[] }));
      })
      .catch(() => {
        /* keep the static fallback */
      });
    return () => {
      cancelled = true;
    };
  }, [selectedTypeId]);

  const usingLiveData = !!challengeTypes && challengeTypes.length > 0;
  const displayTypes: ChallengeTemplate[] =
    usingLiveData && challengeTypes ? challengeTypes : FALLBACK_TYPES;
  const activeTypeId = selectedTypeId ?? (displayTypes.length > 0 ? String(displayTypes[0].id) : null);
  const activeType = displayTypes.find((t) => String(t.id) === activeTypeId) || displayTypes[0];
  const displaySizes: AccountSizeRow[] | null = usingLiveData
    ? (activeType && sizesByType[String(activeType.id)]) || null
    : FALLBACK_SIZES;

  // Comparison table — columns sorted into the canonical challenge order
  const orderedTypes: ChallengeTemplate[] = [...displayTypes].sort((a, b) => {
    const order = ["one_step", "two_step", "instant_funding", "evaluation"];
    const ai = order.indexOf(a.type);
    const bi = order.indexOf(b.type);
    return (ai === -1 ? order.length : ai) - (bi === -1 ? order.length : bi);
  });
  const comparisonRows: Array<{ label: string; values: string[]; hint?: string }> = [
    { label: "Evaluation Phases", values: orderedTypes.map((t) => challengePhaseLabel(t.type)) },
    { label: "Profit Target", values: orderedTypes.map((t) => `${t.profitTarget}%`) },
    { label: "Daily Drawdown", values: orderedTypes.map((t) => `${t.dailyDrawdown}%`) },
    { label: "Max Drawdown", values: orderedTypes.map((t) => `${t.maxDrawdown}%`) },
    { label: "Leverage", values: orderedTypes.map((t) => `1:${t.maxLeverage}`) },
    { label: "Min. Trading Days", values: orderedTypes.map((t) => (t.minTradingDays ? String(t.minTradingDays) : "None")) },
    { label: "Duration", values: orderedTypes.map((t) => (t.durationDays ? `${t.durationDays} days` : "Unlimited")) },
    { label: "Reset Fee", values: orderedTypes.map((t) => formatMoney(t.resetFee)) },
    { label: "Consistency Rule", values: orderedTypes.map((t) => (t.consistencyTarget ? `Max ${t.consistencyTarget}% daily` : "No restriction")) },
    { label: "Weekend Holding", values: orderedTypes.map((t) => (t.allowWeekendHolding ? "Allowed" : "Restricted")), hint: RULE_HINTS.weekendHolding },
    { label: "News Trading", values: orderedTypes.map(newsTradingLabel), hint: RULE_HINTS.newsTrading },
    { label: "Expert Advisors", values: orderedTypes.map((t) => (t.allowEATrading !== false ? "Allowed" : "Blocked")), hint: RULE_HINTS.eaTrading },
    { label: "Copy Trading", values: orderedTypes.map((t) => (t.allowCopyTrading ? "Allowed" : "Blocked")), hint: RULE_HINTS.copyTrading },
    { label: "Profit Share", values: orderedTypes.map(() => "90%") },
  ];

  // Auto-play carousel
  const [carouselApi, setCarouselApi] = useState<CarouselApi | null>(null);
  useEffect(() => {
    if (!carouselApi || !autoplay) return;
    autoplayRef.current = setInterval(() => {
      carouselApi.scrollNext();
    }, 5000);
    return () => {
      if (autoplayRef.current) clearInterval(autoplayRef.current);
    };
  }, [carouselApi, autoplay]);

  return (
    <div className="min-h-screen bg-background overflow-x-hidden">
      {/* ─── Scroll Progress ─── */}
      <motion.div
        className="fixed top-0 left-0 right-0 h-[1px] bg-foreground/20 z-[60] origin-left"
        style={{ scaleX: scrollYProgress }}
      />

      {/* ─── Navigation ─── */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-lg border-b border-border/50">
        <div className="container-page flex items-center justify-between h-16">
          <div className="flex items-center gap-3">
            <LogoDropdown />
            <span className="text-sm font-medium tracking-tight">AfriFundedCapital</span>
          </div>
          <nav className="hidden md:flex items-center gap-8 text-xs text-muted-foreground">
            {["features", "testimonials", "pricing", "faq"].map((section) => (
              <a
                key={section}
                href={`#${section}`}
                className="relative hover:text-foreground transition-colors duration-200 after:absolute after:bottom-[-4px] after:left-0 after:h-[1px] after:w-0 after:bg-foreground after:transition-all after:duration-300 hover:after:w-full"
              >
                {section.charAt(0).toUpperCase() + section.slice(1)}
              </a>
            ))}
          </nav>
          <div className="flex items-center gap-3">
            {isLoading ? null : isAuthenticated ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate("/dashboard")}
                className="text-xs group hidden sm:inline-flex"
              >
                Dashboard
                <ChevronRight className="ml-1 h-3 w-3 transition-transform group-hover:translate-x-0.5" />
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={() => navigate("/auth")}
                className="text-xs group hidden sm:inline-flex"
              >
                Get Started
                <ArrowRight className="ml-1 h-3 w-3 transition-transform group-hover:translate-x-1" />
              </Button>
            )}
            {/* Mobile hamburger */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden h-9 w-9 inline-flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
              aria-label="Toggle menu"
            >
              {mobileMenuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </button>
          </div>
        </div>
        {/* Mobile menu overlay */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-border/50 bg-background/95 backdrop-blur-lg">
            <div className="container-page py-4 space-y-1">
              {["features", "testimonials", "pricing", "faq"].map((section) => (
                <a
                  key={section}
                  href={`#${section}`}
                  onClick={() => setMobileMenuOpen(false)}
                  className="block py-2.5 px-3 text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/50 rounded-lg transition-colors"
                >
                  {section.charAt(0).toUpperCase() + section.slice(1)}
                </a>
              ))}
              <div className="pt-3 border-t border-border/50 space-y-2">
                {isAuthenticated ? (
                  <Button
                    size="sm"
                    onClick={() => { navigate("/dashboard"); setMobileMenuOpen(false); }}
                    className="w-full text-xs justify-center"
                  >
                    Go to Dashboard
                    <ChevronRight className="ml-1 h-3 w-3" />
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    onClick={() => { navigate("/auth"); setMobileMenuOpen(false); }}
                    className="w-full text-xs justify-center btn-brand"
                  >
                    Get Started
                    <ArrowRight className="ml-1 h-3 w-3" />
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}
      </header>

      {/* ─── HERO ─── */}
      <section
        ref={heroRef}
        onMouseMove={handleMouseMove}
        className="relative min-h-screen flex items-center justify-center px-4 pt-16 overflow-hidden"
      >
        {/* Animated background grid */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <motion.div
            className="absolute inset-0"
            style={{ x: heroBgX, y: heroBgY, scale: heroScale }}
          >
            <div
              className="absolute inset-0 opacity-[0.03] dark:opacity-[0.05]"
              style={{
                backgroundImage:
                  "radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)",
                backgroundSize: "48px 48px",
              }}
            />
            {/* Gradient orbs — brand-tinted for depth */}
            <motion.div
              className="absolute w-[600px] h-[600px] rounded-full bg-brand/10 blur-[120px] -top-48 -right-48"
              animate={{
                x: mousePos.x * 30 - 15,
                y: mousePos.y * 30 - 15,
              }}
              transition={{ type: "spring", stiffness: 50, damping: 30 }}
            />
            <motion.div
              className="absolute w-[400px] h-[400px] rounded-full bg-brand/5 blur-[100px] -bottom-32 -left-32"
              animate={{
                x: mousePos.x * -20 + 10,
                y: mousePos.y * -20 + 10,
              }}
              transition={{ type: "spring", stiffness: 50, damping: 30 }}
            />
            {/* Film-grain texture for depth */}
            <div
              className="absolute inset-0 opacity-[0.03] dark:opacity-[0.05]"
              style={{
                backgroundImage:
                  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='160' height='160' filter='url(%23n)'/%3E%3C/svg%3E\")",
              }}
            />
          </motion.div>
        </div>

        <motion.div
          variants={stagger}
          initial="hidden"
          animate="visible"
          style={{ opacity: heroOpacity }}
          className="max-w-4xl w-full mx-auto text-center relative z-10"
        >
          {/* Badge */}
          <motion.div variants={fadeUp} custom={0} className="mb-8">
            <Badge
              variant="outline"
              className="rounded-full px-5 py-1.5 text-xs font-normal border-border/60 bg-background/50 backdrop-blur-sm"
            >
              <Sparkles className="h-3 w-3 mr-1.5 inline-block text-brand" />
              #1 Rated African Prop Firm
            </Badge>
          </motion.div>

          {/* Headline */}
          <motion.h1
            variants={fadeUp}
            custom={1}
            className="text-[clamp(1.5rem,7.5vw,2.25rem)] sm:text-5xl md:text-7xl font-light tracking-tight leading-[1.05] mb-6"
          >
            Trade with Real
            <br />
            <span className="relative">
              <span className="font-medium text-brand">Capital</span>
              <motion.span
                className="absolute -bottom-1 left-0 right-0 h-[3px] bg-brand/40 rounded-full"
                initial={{ scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{ delay: 1.2, duration: 0.8, ease: "easeOut" }}
              />
            </span>
            {" "}Keep <span className="font-medium">90% of Profits</span>
          </motion.h1>

          {/* Subtitle */}
          <motion.p
            variants={fadeUp}
            custom={2}
            className="text-muted-foreground text-sm sm:text-base max-w-xl mx-auto mb-12 leading-relaxed"
          >
            AfriFundedCapital provides ambitious traders with access to significant capital.
            Pass our evaluation, prove your strategy, and trade with funds up to $1M.
          </motion.p>

          {/* CTA Buttons */}
          <motion.div variants={fadeUp} custom={3} className="flex w-full flex-col items-center justify-center gap-4 sm:flex-row">              <Button
              size="lg"
              onClick={() => navigate("/auth")}
              className="w-full px-8 text-sm group btn-brand sm:w-auto"
            >
              <span className="relative z-10 flex items-center">
                Start Your Challenge
                <MoveRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
              </span>
            </Button>
            <Button
              variant="outline"
              size="lg"
              onClick={() => {
                document.getElementById("features")?.scrollIntoView({ behavior: "smooth" });
              }}
              className="w-full px-8 text-sm sm:w-auto"
            >
              Explore Features
            </Button>
          </motion.div>

          {/* Scroll indicator */}
          <motion.div
            variants={fadeIn}
            className="mt-24 flex flex-col items-center gap-2"
            animate={{ opacity: [0.3, 0.7, 0.3] }}
            transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
          >
            <MousePointer2 className="h-4 w-4 text-muted-foreground/50" />
            <span className="text-[10px] text-muted-foreground/40 uppercase tracking-[0.15em]">
              Scroll to explore
            </span>
          </motion.div>
        </motion.div>
      </section>

      {/* ─── PLATFORM PREVIEW ─── */}
      <PlatformPreview />

      {/* ─── STATS BAR ─── */}
      <StatsBar />

      {/* ─── HOW IT WORKS ─── */}
      <section className="py-28 px-4">
        <div className="container-page max-w-5xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="text-center mb-20"
          >
            <Badge variant="outline" className="rounded-full px-4 py-1 text-xs font-normal mb-6 border-border/60">
              Process
            </Badge>
            <h2 className="text-2xl sm:text-3xl font-light tracking-tight mb-3">
              How It Works
            </h2>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              Three simple steps to becoming a funded trader with AfriFundedCapital
            </p>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-8 md:gap-16 relative">
            {/* Connecting line */}
            <div className="hidden md:block absolute top-12 left-[16.66%] right-[16.66%] h-px bg-border/60" />

            {[
              {
                step: "01",
                title: "Choose Your Challenge",
                description: "Select an account size and challenge type that fits your trading style. Options from $5K to $200K+.",
                icon: <BarChart3 className="h-6 w-6" />,
              },
              {
                step: "02",
                title: "Pass the Evaluation",
                description: "Trade normally to meet profit targets while respecting daily and maximum drawdown limits.",
                icon: <TrendingUp className="h-6 w-6" />,
              },
              {
                step: "03",
                title: "Get Funded",
                description: "Receive your funded account, start trading with real capital, and keep 90% of your profits.",
                icon: <Award className="h-6 w-6" />,
              },
            ].map((item, i) => (
              <motion.div
                key={item.step}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: i * 0.15 }}
                className="text-center relative group"
              >
                <div className="relative h-24 w-24 rounded-2xl border border-border/60 bg-background flex items-center justify-center mx-auto mb-6 z-10 transition-all duration-300 group-hover:border-brand/40 group-hover:ring-4 group-hover:ring-brand/10 group-hover:shadow-lg group-hover:shadow-brand/5">
                  <span className="absolute inset-0 rounded-2xl bg-gradient-to-b from-brand/[0.06] to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" aria-hidden />
                  <span className="relative text-brand">{item.icon}</span>
                </div>
                <div className="text-[10px] font-mono text-muted-foreground/40 mb-3 tracking-widest">
                  {item.step}
                </div>
                <h3 className="text-sm font-medium mb-3">{item.title}</h3>
                <p className="text-xs text-muted-foreground leading-relaxed max-w-xs mx-auto">
                  {item.description}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── FEATURES GRID ─── */}
      <section id="features" className="py-28 px-4 bg-secondary/30">
        <div className="container-page max-w-6xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <Badge variant="outline" className="rounded-full px-4 py-1 text-xs font-normal mb-6 border-border/60">
              Features
            </Badge>
            <h2 className="text-2xl sm:text-3xl font-light tracking-tight mb-3">
              Everything You Need to Succeed
            </h2>
            <p className="text-sm text-muted-foreground max-w-lg mx-auto">
              Comprehensive tools and infrastructure built for serious traders who demand the best
            </p>
          </motion.div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {features.map((feature, i) => (
              <motion.div
                key={feature.title}
                variants={scaleIn}
                initial="hidden"
                whileInView="visible"
                custom={i}
                viewport={{ once: true, margin: "-50px" }}
                className="group relative p-6 border border-border/60 rounded-lg bg-background hover:bg-secondary/50 transition-all duration-300 hover:border-foreground/20"
              >
                {/* Hover indicator */}
                <div className="absolute inset-0 rounded-xl bg-gradient-to-b from-brand/[0.03] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

                <div className="relative z-10">
                  <div className="h-10 w-10 rounded-xl bg-brand/[0.06] flex items-center justify-center mb-4 group-hover:bg-brand/[0.1] transition-colors duration-300 text-brand">
                    {feature.icon}
                  </div>
                  <h3 className="text-sm font-medium mb-2 group-hover:text-foreground transition-colors">
                    {feature.title}
                  </h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {feature.description}
                  </p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── TESTIMONIALS CAROUSEL ─── */}
      <section id="testimonials" className="py-28 px-4">
        <div className="container-page max-w-5xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <Badge variant="outline" className="rounded-full px-4 py-1 text-xs font-normal mb-6 border-border/60">
              Testimonials
            </Badge>
            <h2 className="text-2xl sm:text-3xl font-light tracking-tight mb-3">
              Trusted by Traders Across Africa
            </h2>
            <p className="text-sm text-muted-foreground max-w-lg mx-auto">
              Hear from traders who have transformed their careers with AfriFundedCapital
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <Carousel
              setApi={setCarouselApi}
              className="w-full max-w-2xl mx-auto"
              opts={{
                align: "center",
                loop: true,
              }}
              onMouseEnter={() => setAutoplay(false)}
              onMouseLeave={() => setAutoplay(true)}
            >
              <CarouselContent>
                {testimonials.map((t, i) => (
                  <CarouselItem key={i}>
                    <div className="px-2">
                      <div className="glass-card p-8 md:p-10 text-center">
                        {/* Quote icon */}
                        <Quote className="h-8 w-8 mx-auto mb-6 text-brand/30" />

                        {/* Stars */}
                        <div className="flex items-center justify-center gap-1 mb-6">
                          {Array.from({ length: t.rating }).map((_, j) => (
                            <Star
                              key={j}
                              className="h-4 w-4 fill-brand text-brand"
                            />
                          ))}
                        </div>

                        {/* Testimonial */}
                        <blockquote className="text-sm sm:text-base text-foreground/80 leading-relaxed mb-8 max-w-lg mx-auto">
                          "{t.content}"
                        </blockquote>

                        {/* Author */}
                        <div>
                          <div className="text-sm font-medium">{t.name}</div>
                          <div className="text-xs text-muted-foreground mt-1">
                            {t.role}
                          </div>
                        </div>
                      </div>
                    </div>
                  </CarouselItem>
                ))}
              </CarouselContent>

              <div className="flex items-center justify-center gap-4 mt-8">
                <CarouselPrevious className="static translate-y-0 size-8 rounded-full border-border/60" />
                <CarouselNext className="static translate-y-0 size-8 rounded-full border-border/60" />
              </div>
            </Carousel>
          </motion.div>
        </div>
      </section>

      {/* ─── PRICING / CHALLENGE SELECTION ─── */}
      <section id="pricing" className="py-28 px-4 bg-secondary/30">
        <div className="container-page max-w-6xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-12"
          >
            <Badge variant="outline" className="rounded-full px-4 py-1 text-xs font-normal mb-6 border-border/60">
              Pricing
            </Badge>
            <h2 className="text-2xl sm:text-3xl font-light tracking-tight mb-3">
              Choose Your Account Size
            </h2>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              Affordable entry prices designed for every level of trader, from beginners to professionals
            </p>
          </motion.div>

          {/* Challenge type selector */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="flex flex-wrap items-center justify-center gap-2 mb-8"
          >
            {displayTypes.map((t) => {
              const active = String(t.id) === activeTypeId;
              return (
                <button
                  key={String(t.id)}
                  type="button"
                  onClick={() => setSelectedTypeId(String(t.id))}
                  aria-pressed={active}
                  className={`relative px-5 py-2 text-xs rounded-full border transition-all duration-300 ${
                    active
                      ? "border-foreground bg-foreground text-background"
                      : "border-border/60 bg-background text-muted-foreground hover:border-foreground/40 hover:text-foreground"
                  }`}
                >
                  {challengeTypeLabel(t.type)}
                  {active && <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-brand" />}
                </button>
              );
            })}
          </motion.div>

          {/* Rules panel for the selected challenge */}
          {activeType && (
            <motion.div
              key={String(activeType.id)}
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4 }}
              className="card-subtle p-6 md:p-8 mb-10 max-w-4xl mx-auto"
            >
              <div className="flex items-start justify-between gap-4 mb-6">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-medium">{activeType.name}</h3>
                    <span className="hidden sm:inline-flex h-1.5 w-1.5 rounded-full bg-brand" />
                  </div>
                  <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
                    {activeType.description}
                  </p>
                </div>
                <span className="badge-subtle shrink-0">{challengePhaseLabel(activeType.type)}</span>
              </div>

              {/* Core trading parameters */}
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-x-6 gap-y-5">
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Profit Target</div>
                  <div className="text-sm font-medium tabular-nums">{activeType.profitTarget}%</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Daily Drawdown</div>
                  <div className="text-sm font-medium tabular-nums">{activeType.dailyDrawdown}%</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Max Drawdown</div>
                  <div className="text-sm font-medium tabular-nums">{activeType.maxDrawdown}%</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Leverage</div>
                  <div className="text-sm font-medium tabular-nums">1:{activeType.maxLeverage}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Min. Trading Days</div>
                  <div className="text-sm font-medium tabular-nums">
                    {activeType.minTradingDays ? activeType.minTradingDays : "None"}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Duration</div>
                  <div className="text-sm font-medium tabular-nums">
                    {activeType.durationDays ? `${activeType.durationDays} days` : "Unlimited"}
                  </div>
                </div>
              </div>

              <div className="divider-subtle my-5" />

              {/* Costs & consistency */}
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-x-6 gap-y-5">
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Profit Share</div>
                  <div className="text-sm font-medium tabular-nums text-brand">90%</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Reset Fee</div>
                  <div className="text-sm font-medium tabular-nums">{formatMoney(activeType.resetFee)}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Extension Fee</div>
                  <div className="text-sm font-medium tabular-nums">{formatMoney(activeType.extensionFee)}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Consistency Rule</div>
                  <div className="text-sm font-medium tabular-nums">
                    {activeType.consistencyTarget ? `Max ${activeType.consistencyTarget}% daily` : "No restriction"}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Max Position Size</div>
                  <div className="text-sm font-medium tabular-nums">
                    {activeType.maxPositionSize ? `${activeType.maxPositionSize}% of balance` : "Flexible"}
                  </div>
                </div>
              </div>

              <div className="divider-subtle my-5" />

              <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-3">
                {ruleRow(!!activeType.allowWeekendHolding, "Weekend Holding", activeType.allowWeekendHolding ? "Allowed" : "Restricted")}
                {ruleRow(activeType.allowNewsTrading !== false, "News Trading", newsTradingLabel(activeType))}
                {ruleRow(activeType.allowEATrading !== false, "Expert Advisors", activeType.allowEATrading !== false ? "Allowed" : "Blocked")}
                {ruleRow(!!activeType.allowCopyTrading, "Copy Trading", activeType.allowCopyTrading ? "Allowed" : "Blocked")}
              </div>

              {activeType.scalingPlan && (
                <div className="mt-5 pt-4 border-t border-border flex items-start gap-2.5 text-xs">
                  <TrendingUp className="h-3.5 w-3.5 text-brand shrink-0 mt-0.5" />
                  <p className="text-muted-foreground leading-relaxed">
                    <span className="font-medium text-foreground">Scaling Plan:</span> {activeType.scalingPlan}
                  </p>
                </div>
              )}
            </motion.div>
          )}

          {/* Account sizes */}
          {displaySizes === null ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                {displaySizes.map((acct, i) => {
                  const isPopular = i === Math.floor((displaySizes.length - 1) / 2);
                  const sizeNum = parseFloat((acct.label || "").replace(/[^0-9.]/g, ""));
                  const profitUsd =
                    sizeNum && activeType?.profitTarget ? sizeNum * (activeType.profitTarget / 100) : null;
                  return (
                    <motion.div
                      key={acct.label}
                      variants={scaleIn}
                      initial="hidden"
                      whileInView="visible"
                      custom={i}
                      viewport={{ once: true, margin: "-30px" }}
                      className={`group relative p-5 border rounded-lg text-center bg-background transition-all duration-300 ${
                        isPopular
                          ? "border-foreground/30 hover:border-foreground/60"
                          : "border-border/60 hover:border-foreground/20"
                      }`}
                    >
                      {isPopular && (
                        <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 inline-flex items-center px-2.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider bg-brand text-brand-foreground rounded-full shadow-sm">
                          Most Popular
                        </span>
                      )}
                      <div className="text-lg font-light tracking-tight mb-1 pt-1">{acct.label}</div>
                      <div className="text-[11px] text-muted-foreground mb-1 tabular-nums">
                        {(activeType?.profitTarget ?? 0)}% target
                        {profitUsd ? ` · $${profitUsd.toLocaleString()}` : ""}
                      </div>
                      <div className="text-xs text-muted-foreground mb-5">{formatPrice(acct.price)}</div>
                      <Button
                        variant={isPopular ? "default" : "outline"}
                        size="sm"
                        className={`w-full text-xs ${isPopular ? "btn-brand" : ""}`}
                        onClick={() => {
                          // Deep-link into the real checkout with this template + size preselected.
                          const sizeId = acct.id;
                          if (sizeId === undefined || sizeId === null || sizeId === "") {
                            navigate(isAuthenticated ? "/dashboard/challenges" : "/auth");
                            return;
                          }
                          const deep = `/dashboard/challenges?template=${encodeURIComponent(
                            String(activeType.id),
                          )}&size=${encodeURIComponent(String(sizeId))}`;
                          if (isAuthenticated) navigate(deep);
                          else navigate(`/auth?returnTo=${encodeURIComponent(deep)}`);
                        }}
                      >
                        Select
                      </Button>
                    </motion.div>
                  );
                })}
              </div>
              <p className="text-[10px] text-muted-foreground text-center mt-3">
                Profit target shown per account size. All prices in NGN (₦).
              </p>
            </>
          )}

          {/* Challenge comparison table */}
          {displayTypes.length > 1 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="mt-16"
            >
              <div className="text-center mb-8">
                <Badge variant="outline" className="rounded-full px-4 py-1 text-xs font-normal mb-6 border-border/60">
                  Comparison
                </Badge>
                <h2 className="text-xl sm:text-2xl font-light tracking-tight mb-3">
                  Choose the Right Challenge
                </h2>
                <p className="text-sm text-muted-foreground max-w-lg mx-auto">
                  Every detail side-by-side, so you can pick the structure that fits your trading style
                </p>
              </div>

              <div className="card-subtle overflow-x-auto">
                <table className="w-full text-xs min-w-[560px]">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left font-medium text-muted-foreground text-[10px] uppercase tracking-wider px-5 py-4">
                        Compare
                      </th>
                      {orderedTypes.map((t) => (
                        <th key={String(t.id)} className="text-left font-medium px-5 py-4">
                          <span className="block text-sm">{t.name}</span>
                          <span className="block text-[10px] text-muted-foreground font-normal mt-0.5">
                            {challengePhaseLabel(t.type)}
                          </span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {comparisonRows.map((row) => (
                      <tr key={row.label} className="border-b border-border/60 last:border-0">
                        <td className="px-5 py-3 text-muted-foreground align-top">
                          <div className="whitespace-nowrap">{row.label}</div>
                          {row.hint && (
                            <div className="mt-1 whitespace-normal text-[10px] leading-snug text-muted-foreground/70 max-w-44">
                              {row.hint}
                            </div>
                          )}
                        </td>
                        {row.values.map((v, i) => (
                          <td
                            key={i}
                            className={`px-5 py-3 font-medium tabular-nums whitespace-nowrap ${
                              row.label === "Profit Share" ? "text-brand" : ""
                            }`}
                          >
                            {v}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </motion.div>
          )}

          {/* Trust strip */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mt-14 grid grid-cols-2 lg:grid-cols-4 gap-3 max-w-3xl mx-auto"
          >
            {[
              {
                icon: <CreditCard className="h-4 w-4" />,
                title: "Secure Payments",
                text: "Flutterwave · Paystack · Cards · Bank transfer",
              },
              {
                icon: <ShieldCheck className="h-4 w-4" />,
                title: "No Hidden Fees",
                text: "Transparent pricing, instant activation",
              },
              {
                icon: <Headphones className="h-4 w-4" />,
                title: "24/7 Support",
                text: "Real humans ready when you need them",
              },
              {
                icon: <Zap className="h-4 w-4" />,
                title: "Fast Payouts",
                text: "90% profit share within 2–5 business days",
              },
            ].map((item) => (
              <div
                key={item.title}
                className="p-4 border border-border/60 rounded-lg bg-background flex items-start gap-3"
              >
                <div className="h-8 w-8 rounded-full border border-border/60 flex items-center justify-center shrink-0 text-brand">
                  {item.icon}
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-medium mb-0.5">{item.title}</div>
                  <div className="text-[10px] text-muted-foreground leading-relaxed">{item.text}</div>
                </div>
              </div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ─── FAQ ─── */}
      <section id="faq" className="py-28 px-4">
        <div className="container-page max-w-3xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="text-center mb-16"
          >
            <Badge variant="outline" className="rounded-full px-4 py-1 text-xs font-normal mb-6 border-border/60">
              FAQ
            </Badge>
            <h2 className="text-2xl sm:text-3xl font-light tracking-tight mb-3">
              Frequently Asked Questions
            </h2>
            <p className="text-sm text-muted-foreground max-w-lg mx-auto">
              Everything you need to know about getting funded with AfriFundedCapital
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <Accordion type="single" collapsible className="w-full">
              {[
                {
                  q: "How does the challenge process work?",
                  a: "You select an account size and challenge type (one-step, two-step, or instant funding), pay the entry fee, and trade the evaluation account. If you meet the profit target while respecting the drawdown limits within the required trading days, you pass and receive a funded account.",
                },
                {
                  q: "What happens if I violate a challenge rule?",
                  a: "If you exceed the maximum drawdown or daily drawdown limits, the challenge is marked as violated. You can purchase a reset at a reduced fee to restart. Minor violations without critical impact may result in a warning instead.",
                },
                {
                  q: "How much of the profits do I keep?",
                  a: "You keep 90% of all profits generated on your funded account. There are no performance gates or hidden fees. We take a 10% share, and you can request payouts at any time.",
                },
                {
                  q: "How are payouts processed?",
                  a: "Payouts are processed through your preferred payment method. You can request a payout at any time from your dashboard. Our finance team processes requests within 2-5 business days.",
                },
                {
                  q: "What trading platforms do you support?",
                  a: "We integrate with MetaTrader 5 (MT5) with raw ECN spreads. This gives you access to real-time market data, advanced charting tools, automated trading via Expert Advisors, and fast execution.",
                },
                {
                  q: "Is there a scaling plan?",
                  a: "Yes. After becoming funded, you can grow your account through our scaling plan. Every profitable quarter demonstrates your consistency and unlocks additional capital, allowing you to scale up to $5M.",
                },
                {
                  q: "What trading rules apply to my challenge?",
                  a: "Every challenge template ships with automatically enforced rules — weekend holding, news trading (with a configured blackout window), expert advisors, and copy trading. The exact rules for your template are shown on the challenge card before you buy.",
                  docLink: true,
                },
                {
                  q: "Can I trade news or hold positions over weekends?",
                  a: "Holding over weekends and trading during news events depends on the challenge type. Our standard challenges restrict news trading and weekend holding. Instant funding accounts offer more flexibility with these rules.",
                },
                {
                  q: "What payment methods do you accept?",
                  a: "We accept payments via Flutterwave for Nigerian Naira (NGN) transactions. We also support Paystack and are expanding to include Stripe, cryptocurrency, and direct bank transfers for international traders.",
                },
              ].map((faq, i) => (
                <AccordionItem
                  key={i}
                  value={`item-${i}`}
                  className="border-border/60 group"
                >
                  <AccordionTrigger className="text-xs font-medium hover:no-underline hover:text-foreground/80 transition-colors py-5">
                    {faq.q}
                  </AccordionTrigger>
                  <AccordionContent className="text-xs text-muted-foreground leading-relaxed pb-5">
                    {faq.a}
                    {"docLink" in faq && faq.docLink && (
                      <span className="block mt-2">
                        <Link
                          to="/docs/trading-rules"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 font-medium text-foreground hover:text-brand transition-colors duration-150"
                        >
                          Full trading rules
                          <ExternalLink className="h-3 w-3" />
                        </Link>
                      </span>
                    )}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </motion.div>
        </div>
      </section>

      {/* ─── CTA ─── */}
      <section className="py-28 px-4">
        <div className="container-page max-w-3xl text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <Badge variant="outline" className="rounded-full px-4 py-1 text-xs font-normal mb-6 border-border/60">
              Get Started
            </Badge>
            <h2 className="text-2xl sm:text-3xl font-light tracking-tight mb-4">
              Ready to Start Your Journey?
            </h2>
            <p className="text-sm text-muted-foreground max-w-md mx-auto mb-10 leading-relaxed">
              Join thousands of funded traders across Africa. No experience required, just skill, discipline, and the desire to succeed.
            </p>
            <div className="flex items-center justify-center gap-4">
              <Button
                size="lg"
                onClick={() => navigate("/auth")}
                className="px-10 text-sm group"
              >
                Get Funded Now
                <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
              </Button>
              <Button
                variant="outline"
                size="lg"
                onClick={() => navigate("/auth")}
                className="px-10 text-sm"
              >
                Learn More
              </Button>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ─── FOOTER ─── */}
      <footer className="py-12 px-4 border-t border-border/50">
        <div className="container-page">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium tracking-tight">AfriFundedCapital</span>
              <span className="text-xs text-muted-foreground">© 2026</span>
            </div>
            <div className="flex items-center gap-6 text-xs text-muted-foreground">
              <button
                onClick={() => navigate("/docs/trading-rules")}
                className="hover:text-foreground transition-colors duration-200"
              >
                Trading Rules
              </button>
              <button onClick={() => navigate("/terms")} className="hover:text-foreground transition-colors duration-200">Terms</button>
              <button onClick={() => navigate("/privacy")} className="hover:text-foreground transition-colors duration-200">Privacy</button>
              <button onClick={() => navigate("/contact")} className="hover:text-foreground transition-colors duration-200">Contact</button>
              <span className="hidden md:inline text-muted-foreground/60">|</span>
              <span className="hidden md:inline">support@afrifundedcapital.com</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
