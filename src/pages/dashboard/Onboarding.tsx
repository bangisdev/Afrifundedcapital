/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from "react";
import { useNavigate } from "react-router";
import { useAuth } from "@/hooks/use-auth";
import { useAction, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Loader2,
  ArrowRight,
  ArrowLeft,
  Check,
  Sparkles,
} from "lucide-react";
import { motion, AnimatePresence, type Variants } from "framer-motion";
import { toast } from "sonner";

const STEPS = ["Profile", "Experience", "Preferences"] as const;

const STEP_ILLUSTRATIONS = [
  // Step 0 — Profile: an abstract user silhouette
  `<svg viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="60" cy="42" r="18" stroke="currentColor" stroke-width="2.5" fill="none"/>
    <path d="M24 96c0-19.88 16.12-36 36-36s36 16.12 36 36" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round"/>
    <circle cx="60" cy="42" r="18" stroke="currentColor" stroke-width="2.5" fill="none" opacity="0.15" transform="translate(3,-2)"/>
    <path d="M24 96c0-19.88 16.12-36 36-36s36 16.12 36 36" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" opacity="0.15" transform="translate(3,-2)"/>
  </svg>`,
  // Step 1 — Experience: a candlestick chart
  `<svg viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="18" y="68" width="8" height="36" rx="2" stroke="currentColor" stroke-width="2.5" fill="none"/>
    <rect x="18" y="68" width="8" height="36" rx="2" stroke="currentColor" stroke-width="2.5" fill="none" opacity="0.12" transform="translate(2,1)"/>
    <line x1="22" y1="58" x2="22" y2="68" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
    <rect x="40" y="44" width="8" height="60" rx="2" stroke="currentColor" stroke-width="2.5" fill="currentColor" fill-opacity="0.08"/>
    <rect x="40" y="44" width="8" height="60" rx="2" stroke="currentColor" stroke-width="2.5" fill="currentColor" fill-opacity="0.04" transform="translate(2,1)"/>
    <line x1="44" y1="34" x2="44" y2="44" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
    <rect x="62" y="56" width="8" height="48" rx="2" stroke="currentColor" stroke-width="2.5" fill="none"/>
    <rect x="62" y="56" width="8" height="48" rx="2" stroke="currentColor" stroke-width="2.5" fill="none" opacity="0.12" transform="translate(2,1)"/>
    <line x1="66" y1="46" x2="66" y2="56" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
    <rect x="84" y="34" width="8" height="70" rx="2" stroke="currentColor" stroke-width="2.5" fill="currentColor" fill-opacity="0.08"/>
    <rect x="84" y="34" width="8" height="70" rx="2" stroke="currentColor" stroke-width="2.5" fill="currentColor" fill-opacity="0.04" transform="translate(2,1)"/>
    <line x1="88" y1="24" x2="88" y2="34" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
    <line x1="12" y1="104" x2="108" y2="104" stroke="currentColor" stroke-width="2" stroke-linecap="round" opacity="0.3"/>
  </svg>`,
  // Step 2 — Preferences: a bell / notification
  `<svg viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M60 16c-18 0-28 12-28 30v16l-8 12c-2 3 0 6 3 6h66c3 0 5-3 3-6l-8-12V46c0-18-10-30-28-30z" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linejoin="round"/>
    <path d="M60 16c-18 0-28 12-28 30v16l-8 12c-2 3 0 6 3 6h66c3 0 5-3 3-6l-8-12V46c0-18-10-30-28-30z" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linejoin="round" opacity="0.12" transform="translate(3,-1)"/>
    <path d="M48 100c2 4 5 6 12 6s10-2 12-6" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" fill="none"/>
    <circle cx="32" cy="32" r="5" fill="currentColor" fill-opacity="0.08" stroke="currentColor" stroke-width="2"/>
    <circle cx="88" cy="32" r="5" fill="currentColor" fill-opacity="0.08" stroke="currentColor" stroke-width="2"/>
    <circle cx="32" cy="32" r="2" fill="currentColor" fill-opacity="0.15"/>
    <circle cx="88" cy="32" r="2" fill="currentColor" fill-opacity="0.15"/>
  </svg>`,
];

const EXPERIENCE_LEVELS = [
  { value: "beginner", label: "Beginner — New to trading" },
  { value: "intermediate", label: "Intermediate — Some experience" },
  { value: "advanced", label: "Advanced — Experienced trader" },
  { value: "professional", label: "Professional — Full-time trader" },
];

const TRADING_STYLES = [
  { value: "scalping", label: "Scalping" },
  { value: "day_trading", label: "Day Trading" },
  { value: "swing_trading", label: "Swing Trading" },
  { value: "position_trading", label: "Position Trading" },
];

const TIMEZONES = [
  "UTC",
  "Africa/Lagos",
  "Africa/Cairo",
  "Africa/Johannesburg",
  "Africa/Nairobi",
  "Africa/Casablanca",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Europe/London",
  "Europe/Berlin",
  "Europe/Paris",
  "Asia/Dubai",
  "Asia/Tokyo",
  "Asia/Singapore",
  "Asia/Shanghai",
  "Australia/Sydney",
];

const NOTIFICATION_OPTIONS = [
  { key: "email_payment", label: "Payment confirmations" },
  { key: "email_challenge", label: "Challenge updates" },
  { key: "email_kyc", label: "KYC status changes" },
  { key: "email_support", label: "Support ticket replies" },
  { key: "marketing", label: "Promotions & offers" },
];

const STAGGER: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.06, duration: 0.35, ease: "easeOut" },
  }),
};

export default function OnboardingPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const completeOnboarding = useMutation(api.users.completeOnboarding);
  const seedDemoData = useAction(api.demoSeeder.seedDemoTradingData);

  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState(0); // 1 = forward, -1 = back
  const [saving, setSaving] = useState(false);

  // Form state
  const [name, setName] = useState(user?.name || "");
  const [phone, setPhone] = useState(user?.phone || "");
  const [country, setCountry] = useState(user?.country || "");
  const [timezone, setTimezone] = useState(
    user?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
  );
  const [tradingExperience, setTradingExperience] = useState(
    user?.tradingExperience || "",
  );
  const [tradingStyle, setTradingStyle] = useState("");
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [notificationPrefs, setNotificationPrefs] = useState<
    Record<string, boolean>
  >(Object.fromEntries(NOTIFICATION_OPTIONS.map((o) => [o.key, true])));

  const canProceed = (): boolean => {
    if (step === 0) return name.trim().length > 0;
    if (step === 1) return tradingExperience !== "";
    return true;
  };

  const handleNext = () => {
    if (step < STEPS.length - 1 && canProceed()) {
      setDirection(1);
      setStep(step + 1);
    }
  };

  const handleBack = () => {
    if (step > 0) {
      setDirection(-1);
      setStep(step - 1);
    }
  };

  const handleSkip = async () => {
    setSaving(true);
    try {
      // Save whatever data was entered, then redirect
      await completeOnboarding({
        name: name.trim() || undefined,
        phone: phone.trim() || undefined,
        country: country.trim() || undefined,
        timezone: timezone || undefined,
        tradingExperience: tradingExperience || undefined,
        emailNotifications,
        notificationPreferences: notificationPrefs,
      });
      toast.success("You can finish setting up later from your profile settings.");
      navigate("/dashboard", { replace: true });
    } catch (err) {
      console.error("Skip onboarding error:", err);
      toast.error("Something went wrong. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleComplete = async () => {
    setSaving(true);
    try {
      await completeOnboarding({
        name: name.trim() || undefined,
        phone: phone.trim() || undefined,
        country: country.trim() || undefined,
        timezone: timezone || undefined,
        tradingExperience: tradingExperience || undefined,
        emailNotifications,
        notificationPreferences: notificationPrefs,
      });

      toast.promise(seedDemoData(), {
        loading: "Setting up demo trading data…",
        success: (result: any) => result?.message || "Demo data ready!",
        error: "Could not seed demo data, but onboarding is complete.",
      });

      navigate("/dashboard", { replace: true });
    } catch (err) {
      console.error("Onboarding error:", err);
      toast.error("Something went wrong. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const progress = ((step + 1) / STEPS.length) * 100;

  // ── Page transition variants ──
  const pageVariants: Variants = {
    enter: (dir: number) => ({
      x: dir > 0 ? 60 : -60,
      opacity: 0,
    }),
    center: {
      x: 0,
      opacity: 1,
      transition: { duration: 0.3, ease: "easeOut" },
    },
    exit: (dir: number) => ({
      x: dir > 0 ? -60 : 60,
      opacity: 0,
      transition: { duration: 0.2, ease: "easeIn" },
    }),
  };

  return (
    <div className="mx-auto max-w-lg py-12">
      {/* ── Header with animated illustration ── */}
      <div className="text-center mb-10">
        <div className="relative mx-auto mb-6 flex h-28 w-28 items-center justify-center">
          {/* Pulsing ring */}
          <motion.span
            className="absolute inset-0 rounded-full border border-foreground/10"
            animate={{ scale: [1, 1.06, 1], opacity: [0.4, 0.1, 0.4] }}
            transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
          />
          <motion.span
            className="absolute inset-2 rounded-full border border-foreground/5"
            animate={{ scale: [1, 1.04, 1], opacity: [0.3, 0.08, 0.3] }}
            transition={{
              duration: 3,
              repeat: Infinity,
              ease: "easeInOut",
              delay: 0.5,
            }}
          />
          {/* Step illustration */}
          <div className="relative z-10 h-20 w-20 text-foreground/80">
            <AnimatePresence mode="wait" custom={direction}>
              <motion.div
                key={step}
                custom={direction}
                variants={pageVariants}
                initial="enter"
                animate="center"
                exit="exit"
                className="h-full w-full"
                dangerouslySetInnerHTML={{
                  __html: STEP_ILLUSTRATIONS[step],
                }}
              />
            </AnimatePresence>
          </div>
        </div>

        <motion.h1
          key={`title-${step}`}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.1 }}
          className="text-xl font-semibold tracking-tight"
        >
          {step === 0 && "Welcome to AfriFundedCapital"}
          {step === 1 && "Your Trading Experience"}
          {step === 2 && "Stay in the Loop"}
        </motion.h1>
        <motion.p
          key={`desc-${step}`}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.15 }}
          className="mt-1 text-sm text-muted-foreground"
        >
          {step === 0 && "Let's get you set up in just a few steps."}
          {step === 1 &&
            "Help us recommend the right challenge for your skill level."}
          {step === 2 &&
            "Choose what updates you'd like to receive via email."}
        </motion.p>
      </div>

      {/* ── Progress bar ── */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-3">
          {STEPS.map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <motion.div
                animate={{
                  scale: i === step ? 1.15 : 1,
                }}
                transition={{ type: "spring", stiffness: 400, damping: 15 }}
                className={`flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-medium transition-colors ${
                  i <= step
                    ? "bg-foreground text-background"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {i < step ? <Check className="h-3.5 w-3.5" /> : i + 1}
              </motion.div>
              <span
                className={`text-xs hidden sm:inline ${
                  i <= step
                    ? "text-foreground font-medium"
                    : "text-muted-foreground"
                }`}
              >
                {s}
              </span>
            </div>
          ))}
        </div>
        <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
          <motion.div
            className="h-full bg-foreground rounded-full"
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.4, ease: "easeOut" }}
          />
        </div>
      </div>

      {/* ── Step content ── */}
      <div className="border border-border rounded-lg p-6 bg-card relative overflow-hidden">
        {/* Decorative corner gradient */}
        <div className="pointer-events-none absolute -top-24 -right-24 h-48 w-48 rounded-full bg-foreground/[0.02] blur-3xl" />

        <AnimatePresence mode="wait" custom={direction}>
          <motion.div
            key={`step-${step}`}
            custom={direction}
            variants={pageVariants}
            initial="enter"
            animate="center"
            exit="exit"
          >
            {step === 0 && (
              <div className="space-y-4">
                {[
                  { label: "Full Name", required: true, value: name, setter: setName, placeholder: "Enter your name", id: "name", type: "text" },
                  { label: "Phone Number", required: false, value: phone, setter: setPhone, placeholder: "+234 800 000 0000", id: "phone", type: "tel" },
                ].map((field, i) => (
                  <motion.div
                    key={field.id}
                    custom={i}
                    variants={STAGGER}
                    initial="hidden"
                    animate="visible"
                    className="space-y-1.5"
                  >
                    <Label htmlFor={field.id} className="text-xs font-medium">
                      {field.label}{" "}
                      {field.required && (
                        <span className="text-destructive">*</span>
                      )}
                    </Label>
                    <Input
                      id={field.id}
                      value={field.value}
                      onChange={(e) => field.setter(e.target.value)}
                      placeholder={field.placeholder}
                      className="h-9 text-sm"
                    />
                  </motion.div>
                ))}
                <motion.div
                  custom={2}
                  variants={STAGGER}
                  initial="hidden"
                  animate="visible"
                  className="grid grid-cols-2 gap-3"
                >
                  <div className="space-y-1.5">
                    <Label htmlFor="country" className="text-xs font-medium">
                      Country
                    </Label>
                    <Input
                      id="country"
                      value={country}
                      onChange={(e) => setCountry(e.target.value)}
                      placeholder="Nigeria"
                      className="h-9 text-sm"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="timezone" className="text-xs font-medium">
                      Timezone
                    </Label>
                    <Select value={timezone} onValueChange={setTimezone}>
                      <SelectTrigger className="h-9 text-sm">
                        <SelectValue placeholder="Select timezone" />
                      </SelectTrigger>
                      <SelectContent>
                        {TIMEZONES.map((tz) => (
                          <SelectItem key={tz} value={tz} className="text-xs">
                            {tz}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </motion.div>
              </div>
            )}

            {step === 1 && (
              <div className="space-y-5">
                <motion.div
                  custom={0}
                  variants={STAGGER}
                  initial="hidden"
                  animate="visible"
                  className="space-y-1.5"
                >
                  <Label className="text-xs font-medium">
                    Experience Level <span className="text-destructive">*</span>
                  </Label>
                  <div className="grid gap-2 mt-1">
                    {EXPERIENCE_LEVELS.map((level, i) => (
                      <motion.button
                        key={level.value}
                        custom={i + 1}
                        variants={STAGGER}
                        initial="hidden"
                        animate="visible"
                        type="button"
                        onClick={() => setTradingExperience(level.value)}
                        whileTap={{ scale: 0.98 }}
                        className={`text-left px-3 py-2.5 rounded-md border text-sm transition-colors ${
                          tradingExperience === level.value
                            ? "border-foreground bg-foreground/5 text-foreground font-medium"
                            : "border-border text-muted-foreground hover:border-muted-foreground/30 hover:text-foreground"
                        }`}
                      >
                        {level.label}
                      </motion.button>
                    ))}
                  </div>
                </motion.div>

                <motion.div
                  custom={5}
                  variants={STAGGER}
                  initial="hidden"
                  animate="visible"
                  className="space-y-1.5"
                >
                  <Label className="text-xs font-medium">
                    Preferred Trading Style
                  </Label>
                  <Select value={tradingStyle} onValueChange={setTradingStyle}>
                    <SelectTrigger className="h-9 text-sm">
                      <SelectValue placeholder="Select a style (optional)" />
                    </SelectTrigger>
                    <SelectContent>
                      {TRADING_STYLES.map((style) => (
                        <SelectItem
                          key={style.value}
                          value={style.value}
                          className="text-xs"
                        >
                          {style.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </motion.div>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-5">
                <motion.div
                  custom={0}
                  variants={STAGGER}
                  initial="hidden"
                  animate="visible"
                  className="flex items-center gap-2 mb-4 pb-4 border-b border-border"
                >
                  <Checkbox
                    id="email-notifications"
                    checked={emailNotifications}
                    onCheckedChange={(c) => setEmailNotifications(c === true)}
                  />
                  <Label
                    htmlFor="email-notifications"
                    className="text-xs font-medium cursor-pointer"
                  >
                    Enable email notifications
                  </Label>
                </motion.div>

                {emailNotifications && (
                  <div className="space-y-3 pl-1">
                    {NOTIFICATION_OPTIONS.map((opt, i) => (
                      <motion.div
                        key={opt.key}
                        custom={i + 1}
                        variants={STAGGER}
                        initial="hidden"
                        animate="visible"
                        className="flex items-center gap-2"
                      >
                        <Checkbox
                          id={opt.key}
                          checked={notificationPrefs[opt.key]}
                          onCheckedChange={(c) =>
                            setNotificationPrefs((prev) => ({
                              ...prev,
                              [opt.key]: c === true,
                            }))
                          }
                        />
                        <Label
                          htmlFor={opt.key}
                          className="text-xs text-muted-foreground cursor-pointer font-normal"
                        >
                          {opt.label}
                        </Label>
                      </motion.div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* ── Skip link ── */}
      <div className="flex justify-center mt-4">
        <button
          type="button"
          onClick={handleSkip}
          disabled={saving}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors underline underline-offset-2 decoration-dotted decoration-muted-foreground/30 hover:decoration-foreground/50"
        >
          Skip for now — I&apos;ll finish later
        </button>
      </div>

      {/* ── Actions ── */}
      <div className="flex items-center justify-between mt-6">
        <Button
          variant="ghost"
          size="sm"
          onClick={handleBack}
          disabled={step === 0 || saving}
          className="text-xs"
        >
          <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
          Back
        </Button>

        {step < STEPS.length - 1 ? (
          <Button
            size="sm"
            onClick={handleNext}
            disabled={!canProceed()}
            className="text-xs"
          >
            Next
            <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
          </Button>
        ) : (
          <Button
            size="sm"
            onClick={handleComplete}
            disabled={saving}
            className="text-xs"
          >
            {saving ? (
              <>
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                Setting up…
              </>
            ) : (
              <>
                Complete Setup
                <Check className="ml-1.5 h-3.5 w-3.5" />
              </>
            )}
          </Button>
        )}
      </div>
    </div>
  );
}
