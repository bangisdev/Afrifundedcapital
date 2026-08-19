/* eslint-disable @typescript-eslint/no-explicit-any */
import { useApiMutation } from "@/hooks/use-api";
import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, CheckCircle, User, BarChart3, Bell } from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "react-router";

const STEPS = [
  { label: "Profile", icon: User },
  { label: "Experience", icon: BarChart3 },
  { label: "Done", icon: Bell },
];

export default function Onboarding() {
  const { user, refetch } = useAuth();
  const navigate = useNavigate();
  const completeOnboarding = useApiMutation<any, any>("post", "/api/users/onboarding");
  const [step, setStep] = useState(1);
  const [name, setName] = useState(String(user?.name || ""));
  const [phone, setPhone] = useState(String(user?.phone || ""));
  const [country, setCountry] = useState(String(user?.country || ""));
  const [experience, setExperience] = useState(String(user?.tradingExperience || ""));
  const [saving, setSaving] = useState(false);

  const handleComplete = async (skip = false) => {
    setSaving(true);
    try {
      await completeOnboarding.mutateAsync({
        name: name || undefined,
        phone: phone || undefined,
        country: country || undefined,
        tradingExperience: experience || undefined,
        emailNotifications: true,
      });
      await refetch();
      toast.success(skip ? "Setup skipped" : "Onboarding complete!");
      navigate("/dashboard");
    } catch (e: any) {
      toast.error(e.message);
    }
    setSaving(false);
  };

  return (
    <div className="flex items-center justify-center min-h-[60vh] px-4">
      <div className="w-full max-w-md card-subtle p-8">
        {/* Step Indicator */}
        <div className="flex items-center justify-center gap-2 mb-6">
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            const isActive = step === i + 1;
            const isDone = step > i + 1;
            return (
              <div key={s.label} className="flex items-center gap-2">
                <div
                  className={`h-7 w-7 rounded-full flex items-center justify-center text-[10px] font-medium transition-all ${
                    isDone
                      ? "bg-foreground text-background"
                      : isActive
                        ? "bg-foreground text-background"
                        : "bg-secondary text-muted-foreground"
                  }`}
                >
                  {isDone ? <CheckCircle className="h-3.5 w-3.5" /> : <Icon className="h-3.5 w-3.5" />}
                </div>
                {i < STEPS.length - 1 && (
                  <div className={`w-8 h-px ${isDone ? "bg-foreground" : "bg-secondary"}`} />
                )}
              </div>
            );
          })}
        </div>

        {/* Header */}
        <div className="text-center mb-6">
          <h1 className="text-lg font-medium tracking-tight">
            {step === 1 ? "Your Profile" : step === 2 ? "Trading Experience" : "All Set!"}
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            Step {step} of 3
          </p>
        </div>

        {/* Step Content */}
        {step === 1 && (
          <div className="space-y-4">
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Full Name</label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="text-xs h-9"
                placeholder="Your name"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Phone</label>
              <Input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="text-xs h-9"
                placeholder="+234..."
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Country</label>
              <Input
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                className="text-xs h-9"
                placeholder="Nigeria"
              />
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-3">
            {["beginner", "intermediate", "advanced", "professional"].map((level) => (
              <button
                key={level}
                type="button"
                onClick={() => setExperience(level)}
                className={`w-full p-3.5 border rounded-lg text-left text-sm transition-all ${
                  experience === level
                    ? "border-foreground bg-secondary ring-1 ring-foreground/10"
                    : "border-border hover:bg-secondary/30 hover:border-muted-foreground"
                }`}
              >
                <span className="font-medium capitalize">{level}</span>
                <span className="block text-[10px] text-muted-foreground mt-0.5">
                  {level === "beginner" && "New to trading or prop firms"}
                  {level === "intermediate" && "6+ months of active trading"}
                  {level === "advanced" && "1-3 years of consistent trading"}
                  {level === "professional" && "3+ years, funded experience"}
                </span>
              </button>
            ))}
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4 text-center py-4">
            <CheckCircle className="h-14 w-14 mx-auto text-foreground" />
            <p className="text-sm text-muted-foreground leading-relaxed">
              Your profile is ready. Start your first challenge or explore the dashboard.
            </p>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3 mt-6">
          {step < 3 ? (
            <>
              <Button
                variant="outline"
                size="sm"
                className="flex-1 text-xs h-9"
                onClick={() => handleComplete(true)}
              >
                Skip
              </Button>
              <Button
                size="sm"
                className="flex-1 text-xs h-9"
                onClick={() => (step === 2 ? handleComplete() : setStep(step + 1))}
                disabled={step === 2 && !experience}
              >
                {step === 2 ? "Complete" : "Next"}
              </Button>
            </>
          ) : (
            <Button
              size="sm"
              className="w-full text-xs h-9"
              onClick={() => handleComplete()}
              disabled={saving}
            >
              {saving ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
              Go to Dashboard
            </Button>
          )}
        </div>

        <button
          type="button"
          onClick={() => handleComplete(true)}
          className="block w-full text-center text-[10px] text-muted-foreground hover:text-foreground mt-4 underline underline-offset-2 decoration-dotted transition-colors"
        >
          Skip for now
        </button>
      </div>
    </div>
  );
}
