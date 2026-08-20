import { useNavigate } from "react-router";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  Mail,
  MessageCircle,
  Clock,
  MapPin,
  Send,
  Loader2,
  CheckCircle,
  Headphones,
  Shield,
  HelpCircle,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

const contactMethods = [
  {
    icon: <Mail className="h-5 w-5" />,
    title: "Email",
    detail: "support@afrifundedcapital.com",
    description: "We respond within 24 hours",
    action: "mailto:support@afrifundedcapital.com",
  },
  {
    icon: <MessageCircle className="h-5 w-5" />,
    title: "Live Chat",
    detail: "Available 24/7",
    description: "Instant support from our team",
    action: "#",
  },
  {
    icon: <Headphones className="h-5 w-5" />,
    title: "Phone",
    detail: "+234 (0) 800 AFC HELP",
    description: "Mon-Fri, 9AM-6PM WAT",
    action: "tel:+2348002324357",
  },
];

const quickLinks = [
  {
    icon: <Shield className="h-4 w-4" />,
    title: "Trading Rules",
    description: "View challenge rules and requirements",
    path: "/docs/trading-rules",
  },
  {
    icon: <HelpCircle className="h-4 w-4" />,
    title: "FAQ",
    description: "Frequently asked questions",
    path: "/#faq",
  },
  {
    icon: <Mail className="h-4 w-4" />,
    title: "Affiliate Inquiries",
    description: "Partner with us",
    path: "/auth",
  },
];

export default function Contact() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !email || !subject || !message) {
      toast.error("Please fill in all fields");
      return;
    }
    setSending(true);
    try {
      const res = await fetch("/api/support/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, subject, message }),
      });
      if (res.ok) {
        setSent(true);
        toast.success("Message sent! We'll get back to you within 24 hours.");
      } else {
        toast.error("Failed to send message. Please try again.");
      }
    } catch {
      toast.error("Failed to send message. Please try again.");
    } finally {
      setSending(false);
    }
  };

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

      <main className="container-page max-w-5xl py-12 sm:py-16">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          {/* Hero */}
          <div className="text-center mb-12">
            <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight mb-3">
              Get in Touch
            </h1>
            <p className="text-sm text-muted-foreground max-w-md mx-auto leading-relaxed">
              Have a question about your challenge, need technical support, or want to
              explore partnership opportunities? We're here to help.
            </p>
          </div>

          {/* Contact Methods */}
          <div className="grid sm:grid-cols-3 gap-4 mb-12">
            {contactMethods.map((method, i) => (
              <motion.a
                key={method.title}
                href={method.action}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: i * 0.1 }}
                className="card-subtle p-6 text-center hover:bg-secondary/30 transition-all duration-300 group hover:-translate-y-0.5 hover:shadow-md"
              >
                <div className="h-12 w-12 rounded-xl bg-brand/10 flex items-center justify-center mx-auto mb-4 text-brand group-hover:scale-110 transition-transform">
                  {method.icon}
                </div>
                <h3 className="text-sm font-medium mb-1">{method.title}</h3>
                <p className="text-sm font-medium text-brand">{method.detail}</p>
                <p className="text-[10px] text-muted-foreground mt-1">{method.description}</p>
              </motion.a>
            ))}
          </div>

          <div className="grid lg:grid-cols-5 gap-8">
            {/* Contact Form */}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="lg:col-span-3"
            >
              <div className="card-subtle p-6 sm:p-8">
                <h2 className="text-lg font-semibold mb-1">Send a Message</h2>
                <p className="text-xs text-muted-foreground mb-6">
                  Fill out the form below and we'll get back to you within 24 hours.
                </p>

                {sent ? (
                  <div className="text-center py-12">
                    <div className="h-14 w-14 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center mx-auto mb-4">
                      <CheckCircle className="h-7 w-7 text-emerald-600 dark:text-emerald-400" />
                    </div>
                    <h3 className="text-sm font-medium mb-1">Message Sent!</h3>
                    <p className="text-xs text-muted-foreground mb-6">
                      Thank you for reaching out. Our team will respond within 24 hours.
                    </p>
                    <button
                      onClick={() => {
                        setSent(false);
                        setName("");
                        setEmail("");
                        setSubject("");
                        setMessage("");
                      }}
                      className="text-xs font-medium text-brand hover:underline underline-offset-2"
                    >
                      Send another message
                    </button>
                  </div>
                ) : (
                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid sm:grid-cols-2 gap-4">
                      <div>
                        <label className="text-xs text-muted-foreground block mb-1.5">
                          Your Name
                        </label>
                        <input
                          type="text"
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          placeholder="John Doe"
                          className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm placeholder:text-muted-foreground outline-none focus:border-foreground transition-colors"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground block mb-1.5">
                          Email Address
                        </label>
                        <input
                          type="email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder="john@example.com"
                          className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm placeholder:text-muted-foreground outline-none focus:border-foreground transition-colors"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground block mb-1.5">
                        Subject
                      </label>
                      <select
                        value={subject}
                        onChange={(e) => setSubject(e.target.value)}
                        className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm appearance-none cursor-pointer outline-none focus:border-foreground transition-colors"
                      >
                        <option value="">Select a topic</option>
                        <option value="general">General Inquiry</option>
                        <option value="technical">Technical Support</option>
                        <option value="billing">Billing & Payments</option>
                        <option value="kyc">KYC Verification</option>
                        <option value="payout">Payout Request</option>
                        <option value="affiliate">Affiliate Program</option>
                        <option value="partnership">Partnership</option>
                        <option value="other">Other</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground block mb-1.5">
                        Message
                      </label>
                      <textarea
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        rows={5}
                        placeholder="Tell us how we can help..."
                        className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm placeholder:text-muted-foreground outline-none focus:border-foreground transition-colors resize-none"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={sending || !name || !email || !subject || !message}
                      className="w-full h-10 rounded-md bg-brand text-brand-foreground font-medium text-sm flex items-center justify-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {sending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Send className="h-4 w-4" />
                      )}
                      {sending ? "Sending..." : "Send Message"}
                    </button>
                  </form>
                )}
              </div>
            </motion.div>

            {/* Sidebar Info */}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.3 }}
              className="lg:col-span-2 space-y-4"
            >
              {/* Business Hours */}
              <div className="card-subtle p-5">
                <div className="flex items-center gap-2 mb-3">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <h3 className="text-sm font-medium">Business Hours</h3>
                </div>
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Monday - Friday</span>
                    <span className="font-medium">9:00 AM - 6:00 PM WAT</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Saturday</span>
                    <span className="font-medium">10:00 AM - 2:00 PM WAT</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Sunday</span>
                    <span className="text-muted-foreground">Closed</span>
                  </div>
                  <div className="pt-2 border-t border-border">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Live Chat</span>
                      <span className="font-medium text-brand">24/7</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Location */}
              <div className="card-subtle p-5">
                <div className="flex items-center gap-2 mb-3">
                  <MapPin className="h-4 w-4 text-muted-foreground" />
                  <h3 className="text-sm font-medium">Headquarters</h3>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  AfriFundedCapital Ltd.<br />
                  Victoria Island, Lagos<br />
                  Nigeria
                </p>
              </div>

              {/* Quick Links */}
              <div className="card-subtle p-5">
                <h3 className="text-sm font-medium mb-3">Quick Links</h3>
                <div className="space-y-2">
                  {quickLinks.map((link) => (
                    <button
                      key={link.title}
                      onClick={() => navigate(link.path)}
                      className="w-full flex items-start gap-3 p-2 rounded-lg hover:bg-secondary/50 transition-colors text-left"
                    >
                      <span className="mt-0.5 text-muted-foreground">{link.icon}</span>
                      <div>
                        <div className="text-xs font-medium">{link.title}</div>
                        <div className="text-[10px] text-muted-foreground">{link.description}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </motion.div>
          </div>
        </motion.div>
      </main>
    </div>
  );
}
