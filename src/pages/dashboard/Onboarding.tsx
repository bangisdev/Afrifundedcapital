/* eslint-disable @typescript-eslint/no-explicit-any */
import { useApiMutation } from "@/hooks/use-api";
import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, CheckCircle } from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "react-router";

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
    } catch (e: any) { toast.error(e.message); }
    setSaving(false);
  };

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="w-full max-w-md card-subtle p-8">
        <div className="text-center mb-6">
          <h1 className="text-lg font-medium tracking-tight">{step === 1 ? "Your Profile" : step === 2 ? "Trading Experience" : "Preferences"}</h1>
          <p className="text-xs text-muted-foreground mt-1">Step {step} of 3</p>
        </div>

        {step === 1 && (
          <div className="space-y-4">
            <div><label className="text-xs text-muted-foreground block mb-1">Full Name</label><Input value={name} onChange={(e) => setName(e.target.value)} className="text-xs h-9" placeholder="Your name" /></div>
            <div><label className="text-xs text-muted-foreground block mb-1">Phone</label><Input value={phone} onChange={(e) => setPhone(e.target.value)} className="text-xs h-9" placeholder="+234..." /></div>
            <div><label className="text-xs text-muted-foreground block mb-1">Country</label><Input value={country} onChange={(e) => setCountry(e.target.value)} className="text-xs h-9" placeholder="Nigeria" /></div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-3">
            {["beginner", "intermediate", "advanced", "professional"].map((level) => (
              <button key={level} onClick={() => setExperience(level)} className={`w-full p-3 border rounded-lg text-left text-sm transition-colors ${experience === level ? "border-foreground bg-secondary" : "border-border hover:bg-secondary/30"}`}>
                {level.charAt(0).toUpperCase() + level.slice(1)}
              </button>
            ))}
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4 text-center">
            <CheckCircle className="h-12 w-12 mx-auto text-muted-foreground" />
            <p className="text-sm text-muted-foreground">You're all set! Click below to go to your dashboard.</p>
          </div>
        )}

        <div className="flex gap-3 mt-6">
          {step < 3 ? (
            <>
              <Button variant="outline" size="sm" className="flex-1 text-xs" onClick={() => handleComplete(true)}>Skip</Button>
              <Button size="sm" className="flex-1 text-xs" onClick={() => setStep(step + 1)}>Next</Button>
            </>
          ) : (
            <Button size="sm" className="w-full text-xs" onClick={() => handleComplete()} disabled={saving}>
              {saving ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null} Go to Dashboard
            </Button>
          )}
        </div>

        <button type="button" onClick={() => handleComplete(true)} className="block w-full text-center text-xs text-muted-foreground hover:text-foreground mt-3 underline underline-offset-2 decoration-dotted">
          Skip for now
        </button>
      </div>
    </div>
  );
}
