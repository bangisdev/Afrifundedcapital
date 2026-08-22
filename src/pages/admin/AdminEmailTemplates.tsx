/* eslint-disable @typescript-eslint/no-explicit-any */
import { useApiQuery } from "@/hooks/use-api";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { PageLoader } from "@/components/dashboard/PageLoader";
import { readResponseBody } from "@/lib/api";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Loader2,
  Mail,
  Edit2,
  Eye,
  Send,
  CheckCircle,
  Clock,
  X,
  FileText,
  Zap,
  Shield,
  DollarSign,
  Award,
  AlertTriangle,
  User,
  MessageSquare,
} from "lucide-react";
import { toast } from "sonner";

interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  description: string;
  category: string;
  lastEdited: number | null;
  isActive: boolean;
  variables: string[];
}

const CATEGORY_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  auth: { label: "Authentication", color: "bg-blue-500/10 text-blue-600", icon: Shield },
  payment: { label: "Payments", color: "bg-emerald-500/10 text-emerald-600", icon: DollarSign },
  challenge: { label: "Challenges", color: "bg-violet-500/10 text-violet-600", icon: Zap },
  kyc: { label: "KYC", color: "bg-amber-500/10 text-amber-600", icon: FileText },
  support: { label: "Support", color: "bg-pink-500/10 text-pink-600", icon: MessageSquare },
  certificate: { label: "Certificates", color: "bg-orange-500/10 text-orange-600", icon: Award },
  system: { label: "System", color: "bg-secondary text-secondary-foreground", icon: AlertTriangle },
  user: { label: "User", color: "bg-cyan-500/10 text-cyan-600", icon: User },
};

const DEFAULT_TEMPLATES: EmailTemplate[] = [
  { id: "welcome", name: "Welcome Email", subject: "Welcome to AfriFundedCapital!", description: "Sent when a new user registers", category: "auth", lastEdited: null, isActive: true, variables: ["userName", "loginUrl"] },
  { id: "email_verification", name: "Email Verification", subject: "Verify your email address", description: "Email verification link", category: "auth", lastEdited: null, isActive: true, variables: ["userName", "verificationUrl"] },
  { id: "password_reset", name: "Password Reset", subject: "Reset your password", description: "Password reset request", category: "auth", lastEdited: null, isActive: true, variables: ["userName", "resetUrl", "expiryMinutes"] },
  { id: "challenge_purchased", name: "Challenge Purchased", subject: "Your challenge is ready!", description: "Challenge purchase confirmation", category: "challenge", lastEdited: null, isActive: true, variables: ["userName", "challengeName", "accountSize", "mt5Login", "mt5Password", "mt5Server"] },
  { id: "challenge_passed", name: "Challenge Passed", subject: "Congratulations! You passed!", description: "Challenge phase completed", category: "challenge", lastEdited: null, isActive: true, variables: ["userName", "challengeName", "accountSize", "phase"] },
  { id: "challenge_violated", name: "Challenge Violated", subject: "Challenge rule violation", description: "Trading rule breach notification", category: "challenge", lastEdited: null, isActive: true, variables: ["userName", "challengeName", "violationType", "violationDetail"] },
  { id: "funded_account", name: "Funded Account", subject: "Welcome to the funded program!", description: "Funded account credentials", category: "challenge", lastEdited: null, isActive: true, variables: ["userName", "accountSize", "mt5Login", "mt5Password", "profitSplit"] },
  { id: "payment_success", name: "Payment Successful", subject: "Payment confirmed", description: "Payment receipt", category: "payment", lastEdited: null, isActive: true, variables: ["userName", "amount", "reference", "challengeName"] },
  { id: "payout_approved", name: "Payout Approved", subject: "Your payout has been approved", description: "Payout approval notification", category: "payment", lastEdited: null, isActive: true, variables: ["userName", "amount", "paymentMethod"] },
  { id: "payout_paid", name: "Payout Sent", subject: "Your payout has been sent", description: "Payout disbursement notification", category: "payment", lastEdited: null, isActive: true, variables: ["userName", "amount", "paymentMethod"] },
  { id: "kyc_approved", name: "KYC Approved", subject: "Identity verified!", description: "KYC document approval", category: "kyc", lastEdited: null, isActive: true, variables: ["userName"] },
  { id: "kyc_rejected", name: "KYC Rejected", subject: "KYC document rejected", description: "KYC document rejection with reason", category: "kyc", lastEdited: null, isActive: true, variables: ["userName", "documentType", "rejectionReason"] },
  { id: "support_reply", name: "Support Reply", subject: "New reply on your ticket", description: "Support ticket response", category: "support", lastEdited: null, isActive: true, variables: ["userName", "ticketSubject", "ticketId", "replyPreview"] },
  { id: "ticket_created", name: "Ticket Created", subject: "Support ticket received", description: "Ticket creation confirmation", category: "support", lastEdited: null, isActive: true, variables: ["userName", "ticketId", "ticketSubject"] },
  { id: "certificate_earned", name: "Certificate Earned", subject: "New certificate available", description: "Certificate achievement notification", category: "certificate", lastEdited: null, isActive: true, variables: ["userName", "challengeName", "accountSize", "certificateUrl"] },
  { id: "2fa_enabled", name: "2FA Enabled", subject: "Two-factor authentication enabled", description: "2FA activation confirmation", category: "user", lastEdited: null, isActive: true, variables: ["userName"] },
  { id: "account_locked", name: "Account Locked", subject: "Your account has been locked", description: "Account lock notification", category: "system", lastEdited: null, isActive: true, variables: ["userName", "reason"] },
];

export default function AdminEmailTemplates() {
  const { data: templates, isLoading } = useApiQuery<any[]>(
    ["admin", "emailTemplates"],
    "/api/admin/email-templates"
  );

  const [selectedTemplate, setSelectedTemplate] = useState<EmailTemplate | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [testEmail, setTestEmail] = useState("");
  const [sendingTest, setSendingTest] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  const allTemplates = templates?.length ? templates : DEFAULT_TEMPLATES;

  const filteredTemplates = allTemplates.filter((t) => {
    if (categoryFilter !== "all" && t.category !== categoryFilter) return false;
    if (searchQuery && !t.name.toLowerCase().includes(searchQuery.toLowerCase()) &&
        !t.subject.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  const categoryCounts = allTemplates.reduce((acc: Record<string, number>, t) => {
    acc[t.category] = (acc[t.category] || 0) + 1;
    return acc;
  }, {});

  const handleSendTest = async () => {
    if (!testEmail.trim() || !selectedTemplate) return;
    setSendingTest(true);
    try {
      const res = await fetch("/api/admin/email-templates/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ templateId: selectedTemplate.id, email: testEmail }),
      });
      if (!res.ok) throw new Error("Failed to send test");
      toast.success(`Test email sent to ${testEmail}`);
      setTestEmail("");
    } catch (err: any) {
      toast.error(err?.message || "Failed to send test email");
    }
    setSendingTest(false);
  };

  if (isLoading) return <PageLoader />;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Communications"
        title="Email Templates"
        subtitle="Manage transactional email templates and send test emails"
      />

      {/* Category Pills */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setCategoryFilter("all")}
          className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${
            categoryFilter === "all"
              ? "bg-foreground text-background border-foreground"
              : "bg-background text-muted-foreground border-border hover:bg-muted"
          }`}
        >
          All ({allTemplates.length})
        </button>
        {Object.entries(categoryCounts).map(([cat, count]) => {
          const cfg = CATEGORY_CONFIG[cat] || CATEGORY_CONFIG.system;
          return (
            <button
              key={cat}
              onClick={() => setCategoryFilter(cat)}
              className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${
                categoryFilter === cat
                  ? "bg-foreground text-background border-foreground"
                  : "bg-background text-muted-foreground border-border hover:bg-muted"
              }`}
            >
              {cfg.label} ({count})
            </button>
          );
        })}
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Input
          placeholder="Search templates..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="h-9 text-xs pl-8"
        />
        <Mail className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
      </div>

      {/* Templates Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {filteredTemplates.map((template) => {
          const catCfg = CATEGORY_CONFIG[template.category] || CATEGORY_CONFIG.system;
          const CatIcon = catCfg.icon;

          return (
            <div
              key={template.id}
              className="card-subtle p-4 cursor-pointer hover:bg-secondary/20 transition-colors group"
              onClick={() => { setSelectedTemplate(template); setShowPreview(true); }}
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className={`h-8 w-8 rounded-md flex items-center justify-center shrink-0 ${catCfg.color}`}>
                  <CatIcon className="h-4 w-4" />
                </div>
                <div className="flex items-center gap-1">
                  {template.isActive ? (
                    <span className="h-2 w-2 rounded-full bg-emerald-500" title="Active" />
                  ) : (
                    <span className="h-2 w-2 rounded-full bg-muted-foreground/30" title="Inactive" />
                  )}
                </div>
              </div>
              <h3 className="text-xs font-medium mb-0.5">{template.name}</h3>
              <p className="text-[10px] text-muted-foreground mb-2 line-clamp-2">{template.description}</p>
              <div className="flex items-center justify-between">
                <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-medium ${catCfg.color}`}>
                  {catCfg.label}
                </span>
                {template.variables && template.variables.length > 0 && (
                  <span className="text-[9px] text-muted-foreground">
                    {template.variables.length} var{template.variables.length !== 1 ? "s" : ""}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {filteredTemplates.length === 0 && (
        <div className="card-subtle p-12 text-center">
          <Mail className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">No templates match your filters</p>
        </div>
      )}

      {/* Preview / Detail Modal */}
      {showPreview && selectedTemplate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowPreview(false)}>
          <div className="bg-background border rounded-lg shadow-lg w-full max-w-2xl mx-4 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b">
              <div className="flex items-center gap-3">
                <div className={`h-8 w-8 rounded-md flex items-center justify-center ${(CATEGORY_CONFIG[selectedTemplate.category] || CATEGORY_CONFIG.system).color}`}>
                  {(() => { const I = (CATEGORY_CONFIG[selectedTemplate.category] || CATEGORY_CONFIG.system).icon; return <I className="h-4 w-4" />; })()}
                </div>
                <div>
                  <h3 className="text-sm font-medium">{selectedTemplate.name}</h3>
                  <p className="text-[10px] text-muted-foreground">{selectedTemplate.description}</p>
                </div>
              </div>
              <button onClick={() => setShowPreview(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-4 space-y-4">
              {/* Subject Line */}
              <div>
                <label className="text-[10px] text-muted-foreground block mb-1">Subject Line</label>
                <div className="text-xs font-medium p-2 bg-secondary rounded">{selectedTemplate.subject}</div>
              </div>

              {/* Variables */}
              {selectedTemplate.variables.length > 0 && (
                <div>
                  <label className="text-[10px] text-muted-foreground block mb-1">Template Variables</label>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedTemplate.variables.map((v) => (
                      <code key={v} className="px-2 py-0.5 text-[10px] bg-secondary rounded font-mono">
                        {`{{${v}}}`}
                      </code>
                    ))}
                  </div>
                </div>
              )}

              {/* Email Preview Placeholder */}
              <div>
                <label className="text-[10px] text-muted-foreground block mb-1">Email Preview</label>
                <div className="border rounded-lg p-4 bg-muted/30 min-h-[200px]">
                  <div className="text-center mb-4">
                    <div className="h-8 w-8 rounded-lg bg-brand text-brand-foreground flex items-center justify-center text-[11px] font-semibold mx-auto mb-2">
                      AFC
                    </div>
                    <p className="text-[10px] text-muted-foreground">AfriFundedCapital</p>
                  </div>
                  <div className="text-xs text-center text-muted-foreground">
                    <p className="font-medium text-foreground mb-2">{selectedTemplate.subject}</p>
                    <p className="text-[10px]">Email template preview will render here with actual variable values.</p>
                  </div>
                </div>
              </div>

              {/* Test Send */}
              <div className="border-t pt-4">
                <label className="text-xs font-medium block mb-1.5">Send Test Email</label>
                <div className="flex gap-2">
                  <Input
                    placeholder="test@example.com"
                    value={testEmail}
                    onChange={(e) => setTestEmail(e.target.value)}
                    className="text-xs flex-1"
                    type="email"
                  />
                  <Button
                    size="sm"
                    className="text-xs"
                    onClick={handleSendTest}
                    disabled={!testEmail.trim() || sendingTest}
                  >
                    {sendingTest ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Send className="h-3 w-3 mr-1" />}
                    Send Test
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
