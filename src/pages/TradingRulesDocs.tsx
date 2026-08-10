import { useNavigate } from "react-router";
import { RULE_HINTS } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  ArrowRight,
  CalendarX2,
  Newspaper,
  Bot,
  Fingerprint,
  ShieldCheck,
  Clock,
  AlertTriangle,
} from "lucide-react";

const RULES: Array<{
  id: keyof typeof RULE_HINTS;
  title: string;
  icon: typeof Newspaper;
  accent: string;
  flag: string;
}> = [
  {
    id: "weekendHolding",
    title: "Weekend Holding",
    icon: CalendarX2,
    accent: "text-amber-400",
    flag: "No weekend positions when restricted",
  },
  {
    id: "newsTrading",
    title: "News Trading",
    icon: Newspaper,
    accent: "text-sky-400",
    flag: "Blackout window around high-impact releases",
  },
  {
    id: "eaTrading",
    title: "Expert Advisors",
    icon: Bot,
    accent: "text-violet-400",
    flag: "Automated strategies detected by heuristics",
  },
  {
    id: "copyTrading",
    title: "Copy Trading",
    icon: Fingerprint,
    accent: "text-emerald-400",
    flag: "Signature-matched duplicate trade flow",
  },
];

export default function TradingRulesDocs() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background">
      {/* ─── Navigation ─── */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-lg border-b border-border/50">
        <div className="container-page flex items-center justify-between h-16">
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium tracking-tight">AfriFundedCapital</span>
            <span className="badge-subtle hidden sm:inline-block">Trading Rules</span>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate("/")}
            className="text-xs"
          >
            <ArrowLeft className="mr-1 h-3 w-3" />
            Back to Home
          </Button>
        </div>
      </header>

      {/* ─── Hero ─── */}
      <section className="pt-32 pb-16 px-4">
        <div className="container-page">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 badge-subtle mb-5">
              <ShieldCheck className="h-3 w-3" />
              Rule Engine
            </div>
            <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight leading-tight">
              Trading Rules
            </h1>
            <p className="text-sm text-muted-foreground mt-4 leading-relaxed">
              Every challenge template ships with a set of trading rules enforced
              automatically by the platform&apos;s rule engine. Rules are configured
              per template by administrators and flagged in real time against your
              synced account metrics — so the parameters you sign up for are the
              parameters that are enforced.
            </p>
            <p className="text-xs text-muted-foreground/70 mt-3 leading-relaxed">
              Which rules apply to your challenge depends on the template you choose.
              Always review the <span className="text-foreground">Trading Rules</span>{" "}
              section on the challenge card before purchasing.
            </p>
          </div>
        </div>
      </section>

      {/* ─── Rule cards ─── */}
      <section className="px-4 pb-16">
        <div className="container-page">
          <div className="grid sm:grid-cols-2 gap-4">
            {RULES.map((rule) => {
              const Icon = rule.icon;
              return (
                <div key={rule.id} className="card-subtle p-6 hover:bg-secondary/30 transition-colors duration-200">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="h-9 w-9 rounded-lg border border-border flex items-center justify-center">
                      <Icon className={`h-4 w-4 ${rule.accent}`} />
                    </div>
                    <div>
                      <h3 className="text-sm font-medium">{rule.title}</h3>
                      <p className="text-[10px] text-muted-foreground">{rule.flag}</p>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {RULE_HINTS[rule.id]}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ─── News blackout explainer ─── */}
      <section className="px-4 pb-16">
        <div className="container-page">
          <div className="card-subtle p-6 sm:p-8">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="h-4 w-4 text-sky-400" />
              <h2 className="text-sm font-medium">The news blackout window</h2>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed max-w-3xl">
              When a template restricts news trading, positions opened inside a
              blackout window around high-impact releases are flagged. The window is
              template-configured — by default it blocks trading for{" "}
              <span className="text-foreground">15 minutes before and 15 minutes after</span>{" "}
              a scheduled high-impact event. Templates may widen or narrow each side
              independently (for example <span className="text-foreground">30m before / 5m after</span>),
              or disable a side entirely. The exact window is shown on the challenge
              card wherever news trading is restricted.
            </p>
          </div>
        </div>
      </section>

      {/* ─── Enforcement note ─── */}
      <section className="px-4 pb-16">
        <div className="container-page">
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-5">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <h2 className="text-sm font-medium">Violations are automatic</h2>
                <p className="text-xs text-muted-foreground leading-relaxed mt-1.5 max-w-3xl">
                  The rule engine evaluates synced account metrics continuously and
                  records a violation the moment a restriction is crossed — no manual
                  review required. Repeated violations can result in the challenge
                  being marked violated. For questions about how a rule was applied
                  to your account, open a support ticket from your dashboard.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── CTA ─── */}
      <section className="px-4 pb-24">
        <div className="container-page">
          <div className="card-subtle p-8 text-center max-w-2xl mx-auto">
            <h2 className="text-lg font-medium tracking-tight">Pick a challenge that fits your style</h2>
            <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
              Compare templates side by side — profit targets, drawdowns, leverage,
              and every trading rule — before you start.
            </p>
            <Button size="sm" onClick={() => navigate("/auth")} className="mt-5 text-xs group">
              Browse Challenges
              <ArrowRight className="ml-1 h-3 w-3 transition-transform group-hover:translate-x-0.5" />
            </Button>
          </div>
        </div>
      </section>

      <footer className="py-8 px-4 border-t border-border/50">
        <div className="container-page flex flex-col md:flex-row items-center justify-between gap-3">
          <span className="text-xs text-muted-foreground">AfriFundedCapital © 2026</span>
          <span className="text-xs text-muted-foreground/70">support@afrifundedcapital.com</span>
        </div>
      </footer>
    </div>
  );
}
