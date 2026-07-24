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
import { Loader2, ArrowRight, ArrowLeft, Check, Sparkles } from "lucide-react";
import { toast } from "sonner";

const STEPS = ["Profile", "Experience", "Preferences"] as const;

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

export default function OnboardingPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const completeOnboarding = useMutation(api.users.completeOnboarding);
  const seedDemoData = useAction(api.demoSeeder.seedDemoTradingData);

  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);

  // Form state
  const [name, setName] = useState(user?.name || "");
  const [phone, setPhone] = useState(user?.phone || "");
  const [country, setCountry] = useState(user?.country || "");
  const [timezone, setTimezone] = useState(user?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone);
  const [tradingExperience, setTradingExperience] = useState(user?.tradingExperience || "");
  const [tradingStyle, setTradingStyle] = useState("");
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [notificationPrefs, setNotificationPrefs] = useState<Record<string, boolean>>(
    Object.fromEntries(NOTIFICATION_OPTIONS.map((o) => [o.key, true])),
  );

  const canProceed = (): boolean => {
    if (step === 0) return name.trim().length > 0;
    if (step === 1) return tradingExperience !== "";
    return true;
  };

  const handleNext = () => {
    if (step < STEPS.length - 1 && canProceed()) {
      setStep(step + 1);
    }
  };

  const handleBack = () => {
    if (step > 0) setStep(step - 1);
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

      // Auto-seed demo data so charts render immediately
      toast.promise(seedDemoData(), {
        loading: "Setting up demo trading data…",
        success: (result: any) => {
          const msg = result?.message || "Demo data ready!";
          return msg;
        },
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

  return (
    <div className="mx-auto max-w-lg py-12">
      {/* Header */}
      <div className="text-center mb-10">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-foreground/5">
          <Sparkles className="h-5 w-5 text-foreground/70" />
        </div>
        <h1 className="text-xl font-semibold tracking-tight">Welcome to AfriFundedCapital</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Let&apos;s get you set up in just a few steps.
        </p>
      </div>

      {/* Progress bar */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-2">
          {STEPS.map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div
                className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-medium transition-colors ${
                  i <= step
                    ? "bg-foreground text-background"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {i < step ? <Check className="h-3 w-3" /> : i + 1}
              </div>
              <span
                className={`text-xs hidden sm:inline ${
                  i <= step ? "text-foreground font-medium" : "text-muted-foreground"
                }`}
              >
                {s}
              </span>
            </div>
          ))}
        </div>
        <div className="h-1 w-full rounded-full bg-muted overflow-hidden">
          <div
            className="h-full bg-foreground transition-all duration-500 ease-out rounded-full"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Step content */}
      <div className="border border-border rounded-lg p-6 bg-card">
        {step === 0 && (
          <div className="space-y-4">
            <div>
              <h2 className="text-sm font-medium mb-4">Your Profile</h2>
              <p className="text-xs text-muted-foreground mb-5">
                Tell us a bit about yourself so we can personalize your experience.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="name" className="text-xs font-medium">
                Full Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter your name"
                className="h-9 text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="phone" className="text-xs font-medium">
                Phone Number
              </Label>
              <Input
                id="phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+234 800 000 0000"
                className="h-9 text-sm"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
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
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-5">
            <div>
              <h2 className="text-sm font-medium mb-4">Trading Experience</h2>
              <p className="text-xs text-muted-foreground mb-5">
                Help us understand your trading background so we can recommend the right challenge.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium">
                Experience Level <span className="text-destructive">*</span>
              </Label>
              <div className="grid gap-2 mt-1">
                {EXPERIENCE_LEVELS.map((level) => (
                  <button
                    key={level.value}
                    type="button"
                    onClick={() => setTradingExperience(level.value)}
                    className={`text-left px-3 py-2.5 rounded-md border text-sm transition-colors ${
                      tradingExperience === level.value
                        ? "border-foreground bg-foreground/5 text-foreground font-medium"
                        : "border-border text-muted-foreground hover:border-muted-foreground/30 hover:text-foreground"
                    }`}
                  >
                    {level.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Preferred Trading Style</Label>
              <Select value={tradingStyle} onValueChange={setTradingStyle}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="Select a style (optional)" />
                </SelectTrigger>
                <SelectContent>
                  {TRADING_STYLES.map((style) => (
                    <SelectItem key={style.value} value={style.value} className="text-xs">
                      {style.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-5">
            <div>
              <h2 className="text-sm font-medium mb-4">Notification Preferences</h2>
              <p className="text-xs text-muted-foreground mb-5">
                Choose what updates you&apos;d like to receive via email.
              </p>
            </div>

            <div className="flex items-center gap-2 mb-4 pb-4 border-b border-border">
              <Checkbox
                id="email-notifications"
                checked={emailNotifications}
                onCheckedChange={(c) => setEmailNotifications(c === true)}
              />
              <Label htmlFor="email-notifications" className="text-xs font-medium cursor-pointer">
                Enable email notifications
              </Label>
            </div>

            {emailNotifications && (
              <div className="space-y-3 pl-1">
                {NOTIFICATION_OPTIONS.map((opt) => (
                  <div key={opt.key} className="flex items-center gap-2">
                    <Checkbox
                      id={opt.key}
                      checked={notificationPrefs[opt.key]}
                      onCheckedChange={(c) =>
                        setNotificationPrefs((prev) => ({ ...prev, [opt.key]: c === true }))
                      }
                    />
                    <Label htmlFor={opt.key} className="text-xs text-muted-foreground cursor-pointer font-normal">
                      {opt.label}
                    </Label>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Actions */}
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
          <Button size="sm" onClick={handleNext} disabled={!canProceed()} className="text-xs">
            Next
            <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
          </Button>
        ) : (
          <Button size="sm" onClick={handleComplete} disabled={saving} className="text-xs">
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
