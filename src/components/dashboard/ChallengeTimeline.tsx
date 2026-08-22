/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMemo } from "react";
import { motion } from "framer-motion";
import {
  ShoppingCart, Play, Target, CheckCircle2, Trophy,
  AlertTriangle, Clock, Hourglass, Zap, Crown, Flame,
} from "lucide-react";
import { cn, formatShortDate, formatMoney } from "@/lib/utils";

type MilestoneStatus = "completed" | "current" | "upcoming" | "failed" | "skipped";

interface Milestone {
  id: string;
  label: string;
  description: string;
  icon: React.ElementType;
  status: MilestoneStatus;
  date?: string;
  detail?: string;
  color: string;
}

const STATUS_STYLES: Record<MilestoneStatus, { ring: string; bg: string; text: string; line: string }> = {
  completed: {
    ring: "border-emerald-500",
    bg: "bg-emerald-500",
    text: "text-emerald-600 dark:text-emerald-400",
    line: "bg-emerald-500",
  },
  current: {
    ring: "border-brand",
    bg: "bg-brand",
    text: "text-brand",
    line: "bg-border",
  },
  upcoming: {
    ring: "border-border",
    bg: "bg-secondary",
    text: "text-muted-foreground",
    line: "bg-border",
  },
  failed: {
    ring: "border-red-500",
    bg: "bg-red-500",
    text: "text-red-600 dark:text-red-400",
    line: "bg-red-500/30",
  },
  skipped: {
    ring: "border-border",
    bg: "bg-secondary",
    text: "text-muted-foreground/50",
    line: "bg-border",
  },
};

function getMilestones(challenge: any): Milestone[] {
  const type = challenge.templateType || "two_step";
  const status = challenge.status || "active";
  const createdAt = challenge.createdAt;
  const completedAt = challenge.completedAt || challenge.fundedAt;
  const phase1PassedAt = challenge.phase1PassedAt;
  const phase2PassedAt = challenge.phase2PassedAt;
  const violatedAt = challenge.violatedAt;
  const isViolated = status === "violated";
  const isExpired = status === "expired";
  const isFunded = status === "funded";

  let violations: any[] = [];
  try { violations = challenge.violations ? JSON.parse(challenge.violations) : []; } catch { violations = []; }

  const milestones: Milestone[] = [];

  // Milestone 1: Challenge Purchased
  milestones.push({
    id: "purchased",
    label: "Challenge Purchased",
    description: `${challenge.templateName || "Challenge"} · ${formatMoney(Number(challenge.accountSize || 0), "USD")}`,
    icon: ShoppingCart,
    status: "completed",
    date: createdAt,
    detail: `Paid ${formatMoney(Number(challenge.amountPaid || 0))}`,
    color: "from-emerald-500/20 to-emerald-500/5",
  });

  if (type === "one_step") {
    // ONE-STEP: Purchased → Evaluation → Funded/Violated
    const evalActive = status === "active" || status === "phase_1_passed";
    const evalPassed = isFunded;

    milestones.push({
      id: "evaluation_started",
      label: "Evaluation Started",
      description: "Trading rules active · Profit target to reach",
      icon: Play,
      status: "completed",
      date: createdAt,
      detail: `${challenge.profitTarget}% target · ${challenge.maxDrawdown}% max DD`,
      color: "from-blue-500/20 to-blue-500/5",
    });

    milestones.push({
      id: "evaluation_active",
      label: "Evaluation In Progress",
      description: isViolated ? "Challenge violated" : evalPassed ? "Target achieved" : "Trading actively",
      icon: Flame,
      status: isViolated ? "failed" : evalPassed ? "completed" : "current",
      date: isViolated ? violatedAt : undefined,
      detail: violations.length > 0 ? `${violations.length} violation(s)` : undefined,
      color: isViolated ? "from-red-500/20 to-red-500/5" : "from-brand/20 to-brand/5",
    });

    milestones.push({
      id: "funded",
      label: "Funded Account",
      description: isFunded ? "Congratulations! You are now a funded trader" : "90% profit split · MT5 live account",
      icon: isFunded ? Crown : Trophy,
      status: isFunded ? "completed" : isViolated ? "skipped" : "upcoming",
      date: completedAt,
      detail: isFunded ? "Live account provisioned" : undefined,
      color: "from-amber-500/20 to-amber-500/5",
    });

  } else if (type === "instant_funding") {
    // INSTANT FUNDING: Purchased → Funded Immediately → Trading
    milestones.push({
      id: "funded_immediately",
      label: "Funded Instantly",
      description: "Account provisioned immediately after purchase",
      icon: Zap,
      status: "completed",
      date: createdAt,
      detail: "Live MT5 account active",
      color: "from-amber-500/20 to-amber-500/5",
    });

    milestones.push({
      id: "trading_active",
      label: "Trading Active",
      description: isViolated ? "Account breached" : "Building your track record",
      icon: Flame,
      status: isViolated ? "failed" : "current",
      date: isViolated ? violatedAt : undefined,
      detail: violations.length > 0 ? `${violations.length} violation(s)` : undefined,
      color: isViolated ? "from-red-500/20 to-red-500/5" : "from-brand/20 to-brand/5",
    });

    milestones.push({
      id: "scaling",
      label: "Scaling Plan",
      description: "Account growth up to $2M based on performance",
      icon: Trophy,
      status: isViolated ? "skipped" : "upcoming",
      color: "from-violet-500/20 to-violet-500/5",
    });

  } else {
    // TWO-STEP (default): Purchased → Phase 1 → Phase 2 → Funded
    const phase1Active = status === "active";
    const phase1Done = status === "phase_1_passed" || status === "phase_2_passed" || isFunded;
    const phase2Active = status === "phase_1_passed";
    const phase2Done = status === "phase_2_passed" || isFunded;

    milestones.push({
      id: "phase1_started",
      label: "Phase 1 Started",
      description: "First evaluation phase · Prove your skills",
      icon: Play,
      status: "completed",
      date: createdAt,
      detail: `${challenge.profitTarget}% target · ${challenge.minTradingDays || 5} min days`,
      color: "from-blue-500/20 to-blue-500/5",
    });

    milestones.push({
      id: "phase1_active",
      label: "Phase 1 In Progress",
      description: isViolated
        ? "Phase 1 violated"
        : phase1Done
          ? "Phase 1 passed!"
          : "Working toward profit target",
      icon: Target,
      status: isViolated && !phase1Done
        ? "failed"
        : phase1Done
          ? "completed"
          : "current",
      date: phase1PassedAt,
      detail: violations.length > 0 && !phase1Done
        ? `${violations.length} violation(s)`
        : undefined,
      color: isViolated && !phase1Done ? "from-red-500/20 to-red-500/5" : "from-blue-500/20 to-blue-500/5",
    });

    milestones.push({
      id: "phase2_started",
      label: "Phase 2 Started",
      description: "Second evaluation · Confirm consistency",
      icon: CheckCircle2,
      status: isViolated
        ? "skipped"
        : phase2Done
          ? "completed"
          : phase2Active
            ? "current"
            : "upcoming",
      date: phase1PassedAt,
      detail: phase2Active || phase2Done ? "Reduced target · Same discipline" : undefined,
      color: "from-violet-500/20 to-violet-500/5",
    });

    milestones.push({
      id: "phase2_active",
      label: "Phase 2 In Progress",
      description: isViolated && (phase2Active || status === "phase_1_passed")
        ? "Phase 2 violated"
        : phase2Done
          ? "Phase 2 passed!"
          : "Final stretch before funding",
      icon: Hourglass,
      status: isViolated && (phase2Active || status === "phase_1_passed")
        ? "failed"
        : phase2Done
          ? "completed"
          : phase2Active
            ? "current"
            : "upcoming",
      date: phase2PassedAt,
      color: isViolated && phase2Active ? "from-red-500/20 to-red-500/5" : "from-violet-500/20 to-violet-500/5",
    });

    milestones.push({
      id: "funded",
      label: "Funded Account",
      description: isFunded ? "Congratulations! You are now a funded trader" : "90% profit split · MT5 live account",
      icon: isFunded ? Crown : Trophy,
      status: isFunded ? "completed" : isViolated ? "skipped" : "upcoming",
      date: completedAt,
      detail: isFunded ? "Live account provisioned" : undefined,
      color: "from-amber-500/20 to-amber-500/5",
    });
  }

  // Violation terminal milestone
  if (isViolated) {
    milestones.push({
      id: "violated",
      label: "Challenge Violated",
      description: violations[0]?.message || "A trading rule was breached",
      icon: AlertTriangle,
      status: "failed",
      date: violatedAt || violations[0]?.detectedAt,
      detail: violations[0]?.code ? `Rule: ${violations[0].code.replace(/_/g, " ")}` : undefined,
      color: "from-red-500/20 to-red-500/5",
    });
  }

  if (isExpired) {
    milestones.push({
      id: "expired",
      label: "Challenge Expired",
      description: "Time limit reached without meeting targets",
      icon: Clock,
      status: "failed",
      date: challenge.expiresAt,
      color: "from-orange-500/20 to-orange-500/5",
    });
  }

  return milestones;
}

export function ChallengeTimeline({ challenge }: { challenge: any }) {
  const milestones = useMemo(() => getMilestones(challenge), [challenge]);

  const activeIndex = milestones.findIndex((m) => m.status === "current");
  const overallProgress = useMemo(() => {
    if (isFundedOrViolated) return 100;
    if (activeIndex < 0) return 0;
    return Math.round(((activeIndex) / (milestones.length - 1)) * 100);
  }, [activeIndex, milestones.length]);

  const isFundedOrViolated = challenge.status === "funded" || challenge.status === "violated" || challenge.status === "expired";

  return (
    <div className="space-y-6">
      {/* Overall Progress Header */}
      <div className="card-subtle p-5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-sm font-medium">Challenge Progress</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {challenge.status === "funded"
                ? "You made it! Your funded journey begins."
                : challenge.status === "violated"
                  ? "Challenge ended due to rule violation."
                  : challenge.status === "expired"
                    ? "Challenge expired before targets were met."
                    : `Step ${Math.min(activeIndex + 1, milestones.length)} of ${milestones.length}`}
            </p>
          </div>
          <div className={cn(
            "text-2xl font-bold tabular-nums",
            challenge.status === "funded" ? "text-amber-500" :
            challenge.status === "violated" ? "text-red-500" : "text-brand"
          )}>
            {overallProgress}%
          </div>
        </div>
        {/* Progress bar */}
        <div className="h-2 rounded-full bg-secondary overflow-hidden">
          <motion.div
            className={cn(
              "h-full rounded-full",
              challenge.status === "funded"
                ? "bg-gradient-to-r from-amber-500 to-amber-400"
                : challenge.status === "violated"
                  ? "bg-gradient-to-r from-red-500 to-red-400"
                  : "bg-gradient-to-r from-brand to-brand/70"
            )}
            initial={{ width: 0 }}
            animate={{ width: `${overallProgress}%` }}
            transition={{ duration: 1.2, ease: "easeOut", delay: 0.3 }}
          />
        </div>
        <div className="flex justify-between mt-2 text-[10px] text-muted-foreground">
          <span>Purchased</span>
          <span>{challenge.status === "funded" ? "Funded!" : "Target"}</span>
        </div>
      </div>

      {/* Vertical Timeline */}
      <div className="card-subtle p-5">
        <h3 className="text-sm font-medium mb-5">Journey Timeline</h3>
        <div className="relative">
          {milestones.map((milestone, index) => {
            const Icon = milestone.icon;
            const styles = STATUS_STYLES[milestone.status];
            const isLast = index === milestones.length - 1;
            const showConnector = !isLast;

            return (
              <motion.div
                key={milestone.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.4, delay: index * 0.1 }}
                className="relative flex gap-4"
              >
                {/* Connector line + dot */}
                <div className="flex flex-col items-center">
                  <div
                    className={cn(
                      "relative z-10 flex items-center justify-center rounded-full border-2 transition-all",
                      "h-9 w-9 shrink-0",
                      styles.ring,
                      styles.bg,
                      milestone.status === "current" && "ring-4 ring-brand/20 animate-pulse",
                      milestone.status === "completed" && "ring-2 ring-emerald-500/20",
                    )}
                  >
                    <Icon className={cn(
                      "h-4 w-4",
                      milestone.status === "completed" || milestone.status === "current"
                        ? "text-white"
                        : styles.text
                    )} />
                  </div>
                  {showConnector && (
                    <div className={cn(
                      "w-0.5 flex-1 min-h-[2rem]",
                      milestone.status === "completed" ? styles.line : "bg-border/50"
                    )} />
                  )}
                </div>

                {/* Content card */}
                <div className={cn(
                  "flex-1 pb-6 min-w-0",
                  isLast && "pb-0"
                )}>
                  <div className={cn(
                    "rounded-lg border p-3.5 transition-all",
                    milestone.status === "current"
                      ? "border-brand/30 bg-brand/5"
                      : milestone.status === "completed"
                        ? "border-emerald-500/20 bg-emerald-500/5"
                        : milestone.status === "failed"
                          ? "border-red-500/20 bg-red-500/5"
                          : "border-border/50 bg-transparent hover:bg-secondary/30"
                  )}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <h4 className={cn("text-sm font-medium", styles.text)}>
                            {milestone.label}
                          </h4>
                          {milestone.status === "current" && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-brand/10 text-brand text-[10px] font-medium">
                              <span className="h-1 w-1 rounded-full bg-brand animate-pulse" />
                              Active
                            </span>
                          )}
                          {milestone.status === "completed" && (
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                          )}
                          {milestone.status === "failed" && (
                            <AlertTriangle className="h-3.5 w-3.5 text-red-500 shrink-0" />
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">{milestone.description}</p>
                      </div>
                      {milestone.date && (
                        <span className="text-[10px] text-muted-foreground shrink-0 tabular-nums">
                          {formatShortDate(milestone.date)}
                        </span>
                      )}
                    </div>
                    {milestone.detail && (
                      <div className="mt-2 px-2.5 py-1.5 rounded-md bg-secondary/50 text-[11px] text-muted-foreground">
                        {milestone.detail}
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* Summary Card */}
      <div className={cn(
        "rounded-xl border p-5",
        challenge.status === "funded"
          ? "border-amber-500/30 bg-gradient-to-br from-amber-500/10 to-transparent"
          : challenge.status === "violated"
            ? "border-red-500/30 bg-gradient-to-br from-red-500/10 to-transparent"
            : "card-subtle"
      )}>
        <div className="flex items-start gap-3">
          <div className={cn(
            "h-10 w-10 rounded-lg flex items-center justify-center shrink-0",
            challenge.status === "funded"
              ? "bg-amber-500/20"
              : challenge.status === "violated"
                ? "bg-red-500/20"
                : "bg-brand/10"
          )}>
            {challenge.status === "funded" ? (
              <Crown className="h-5 w-5 text-amber-500" />
            ) : challenge.status === "violated" ? (
              <AlertTriangle className="h-5 w-5 text-red-500" />
            ) : (
              <Target className="h-5 w-5 text-brand" />
            )}
          </div>
          <div>
            <h4 className="text-sm font-medium">
              {challenge.status === "funded"
                ? "🎉 Funded Trader!"
                : challenge.status === "violated"
                  ? "Challenge Breached"
                  : challenge.status === "expired"
                    ? "Challenge Expired"
                    : "Keep Going!"}
            </h4>
            <p className="text-xs text-muted-foreground mt-1">
              {challenge.status === "funded"
                ? `Your live account is active with ${formatMoney(Number(challenge.accountSize || 0), "USD")} balance. You earn 90% of profits. Start trading and build your track record.`
                : challenge.status === "violated"
                  ? "Your challenge was terminated due to a rule violation. You can purchase a new challenge or retry this one."
                  : challenge.status === "expired"
                    ? "The time limit was reached. Consider purchasing a new challenge with more time."
                    : `You're making progress! Hit ${challenge.profitTarget}% profit target to advance. Check the compliance dashboard to stay on track.`}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
