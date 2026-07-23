/* eslint-disable @typescript-eslint/no-explicit-any */
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Plus, MessageSquare, ChevronRight } from "lucide-react";
import { toast } from "sonner";

export default function Support() {
  const tickets = useQuery(api.support.getMyTickets);
  const createTicket = useMutation(api.support.createTicket);
  const [showNew, setShowNew] = useState(false);
  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState("general");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  // Selected ticket detail
  const [selectedTicket, setSelectedTicket] = useState<string | null>(null);
  const ticketMessages = useQuery(
    api.support.getTicketMessages,
    selectedTicket ? { ticketId: selectedTicket as any } : "skip",
  );
  const ticketDetail = useQuery(
    api.support.getTicketById,
    selectedTicket ? { ticketId: selectedTicket as any } : "skip",
  );
  const addMessage = useMutation(api.support.addTicketMessage);
  const [replyMessage, setReplyMessage] = useState("");

  if (!tickets) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const handleCreateTicket = async () => {
    if (!subject || !message) {
      toast.error("Subject and message are required");
      return;
    }
    setSaving(true);
    try {
      await createTicket({
        subject,
        category,
        message,
      });
      toast.success("Ticket created");
      setShowNew(false);
      setSubject("");
      setMessage("");
    } catch (error: any) {
      toast.error(error.message);
    }
    setSaving(false);
  };

  const handleSendReply = async () => {
    if (!selectedTicket || !replyMessage) return;
    try {
      await addMessage({
        ticketId: selectedTicket as any,
        message: replyMessage,
      });
      setReplyMessage("");
      toast.success("Reply sent");
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const statusBadge = (status: string) => {
    const variants: Record<string, string> = {
      open: "bg-foreground text-background",
      pending: "bg-secondary text-secondary-foreground",
      waiting_on_customer: "bg-secondary text-secondary-foreground",
      resolved: "bg-secondary text-secondary-foreground",
      closed: "bg-muted text-muted-foreground",
    };
    const className = variants[status] || variants.open;
    return (
      <span className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded ${className}`}>
        {status.replace(/_/g, " ")}
      </span>
    );
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-medium tracking-tight">Support</h1>
          <p className="text-xs text-muted-foreground mt-1">
            Get help from our support team
          </p>
        </div>
        <Button size="sm" className="text-xs" onClick={() => setShowNew(true)}>
          <Plus className="h-3 w-3 mr-1" />
          New Ticket
        </Button>
      </div>

      {selectedTicket && ticketDetail ? (
        /* Ticket Detail View */
        <div className="space-y-4">
          <button
            onClick={() => setSelectedTicket(null)}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            ← Back to tickets
          </button>

          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-medium">{ticketDetail.subject}</h2>
              <div className="flex items-center gap-2 mt-1">
                {statusBadge(ticketDetail.status)}
                <span className="text-xs text-muted-foreground">{ticketDetail.category}</span>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            {ticketMessages?.map((msg) => (
              <div
                key={msg._id}
                className={`card-subtle p-4 ${msg.isInternal ? "border-dashed opacity-60" : ""}`}
              >
                <div className="text-xs font-medium mb-2">
                  {msg.isInternal ? "Internal Note" : "Message"}
                  <span className="text-muted-foreground ml-2 font-normal">
                    {new Date(msg.createdAt).toLocaleString()}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground whitespace-pre-wrap">{msg.message}</p>
              </div>
            ))}
          </div>

          {ticketDetail.status !== "closed" && ticketDetail.status !== "resolved" && (
            <div className="space-y-2">
              <Textarea
                placeholder="Type your reply..."
                value={replyMessage}
                onChange={(e) => setReplyMessage(e.target.value)}
                className="text-xs min-h-[80px]"
              />
              <Button size="sm" className="text-xs" onClick={handleSendReply}>
                Send Reply
              </Button>
            </div>
          )}
        </div>
      ) : (
        /* Ticket List */
        <div className="space-y-1">
          {tickets.length === 0 ? (
            <div className="card-subtle p-8 text-center">
              <MessageSquare className="h-8 w-8 mx-auto mb-4 text-muted-foreground" />
              <p className="text-sm text-muted-foreground mb-1">No support tickets</p>
              <p className="text-xs text-muted-foreground mb-4">
                Create a ticket and our team will get back to you
              </p>
              <Button size="sm" variant="outline" className="text-xs" onClick={() => setShowNew(true)}>
                Create Ticket
              </Button>
            </div>
          ) : (
            tickets.map((ticket) => (
              <button
                key={ticket._id}
                onClick={() => setSelectedTicket(ticket._id)}
                className="w-full card-subtle p-4 flex items-center justify-between text-left hover:bg-secondary/30 transition-colors"
              >
                <div>
                  <div className="text-sm font-medium">{ticket.subject}</div>
                  <div className="flex items-center gap-2 mt-1">
                    {statusBadge(ticket.status)}
                    <span className="text-xs text-muted-foreground">{ticket.category}</span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(ticket.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
              </button>
            ))
          )}
        </div>
      )}

      {/* New Ticket Dialog */}
      <Dialog open={showNew} onOpenChange={setShowNew}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-medium">New Support Ticket</DialogTitle>
            <DialogDescription className="text-xs">
              Describe your issue and we'll respond as soon as possible
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Subject</label>
              <Input
                placeholder="Brief description of your issue"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="text-xs h-9"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Category</label>
              <select
                className="w-full h-9 rounded-md border border-input bg-background px-3 text-xs"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                <option value="general">General</option>
                <option value="kyc">KYC</option>
                <option value="payment">Payment</option>
                <option value="challenge">Challenge</option>
                <option value="trading">Trading</option>
                <option value="withdrawal">Withdrawal</option>
                <option value="technical">Technical</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Message</label>
              <Textarea
                placeholder="Describe your issue in detail"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="text-xs min-h-[120px]"
              />
            </div>
            <Button
              className="w-full text-xs"
              size="sm"
              onClick={handleCreateTicket}
              disabled={saving}
            >
              {saving ? "Submitting..." : "Submit Ticket"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
