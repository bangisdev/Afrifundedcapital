/* eslint-disable @typescript-eslint/no-explicit-any */
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Loader2, Ticket, ChevronRight } from "lucide-react";
import { toast } from "sonner";

export default function AdminSupport() {
  const tickets = useQuery(api.support.listAllTickets, {});
  const addMessage = useMutation(api.support.addTicketMessage);
  const updateStatus = useMutation(api.support.updateTicketStatus);
  const assignTicket = useMutation(api.support.assignTicket);

  const [selectedTicket, setSelectedTicket] = useState<string | null>(null);
  const [replyMessage, setReplyMessage] = useState("");
  const [isInternal, setIsInternal] = useState(false);

  const ticketMessages = useQuery(
    api.support.getTicketMessages,
    selectedTicket ? { ticketId: selectedTicket as any } : "skip",
  );
  const ticketDetail = useQuery(
    api.support.getTicketById,
    selectedTicket ? { ticketId: selectedTicket as any } : "skip",
  );

  if (!tickets) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const handleReply = async () => {
    if (!selectedTicket || !replyMessage) return;
    try {
      await addMessage({
        ticketId: selectedTicket as any,
        message: replyMessage,
        isInternal,
      });
      setReplyMessage("");
      toast.success("Reply sent");
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const handleStatusChange = async (status: string) => {
    if (!selectedTicket) return;
    try {
      await updateStatus({ ticketId: selectedTicket as any, status });
      toast.success(`Status updated to ${status}`);
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const statusBadge = (status: string) => {
    const variants: Record<string, string> = {
      open: "bg-foreground text-background",
      pending: "bg-secondary text-secondary-foreground",
      waiting_on_customer: "bg-secondary text-secondary-foreground",
      resolved: "bg-foreground text-background",
      closed: "bg-muted text-muted-foreground",
    };
    return (
      <span className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded ${variants[status] || ""}`}>
        {status.replace(/_/g, " ")}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-medium tracking-tight">Support</h1>
          <p className="text-xs text-muted-foreground mt-1">
            Manage support tickets
          </p>
        </div>
      </div>

      {selectedTicket && ticketDetail ? (
        <div className="space-y-4">
          <button onClick={() => setSelectedTicket(null)} className="text-xs text-muted-foreground hover:text-foreground">
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
            <div className="flex gap-2">
              <select
                className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                value={ticketDetail.status}
                onChange={(e) => handleStatusChange(e.target.value)}
              >
                <option value="open">Open</option>
                <option value="pending">Pending</option>
                <option value="waiting_on_customer">Waiting on Customer</option>
                <option value="resolved">Resolved</option>
                <option value="closed">Closed</option>
              </select>
            </div>
          </div>

          <div className="space-y-3">
            {ticketMessages?.map((msg) => (
              <div key={msg._id} className={`card-subtle p-4 ${msg.isInternal ? "border-dashed opacity-60" : ""}`}>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-medium">{msg.isInternal ? "Internal Note" : "Reply"}</span>
                  <span className="text-[10px] text-muted-foreground">{new Date(msg.createdAt).toLocaleString()}</span>
                </div>
                <p className="text-xs text-muted-foreground whitespace-pre-wrap">{msg.message}</p>
              </div>
            ))}
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <input type="checkbox" checked={isInternal} onChange={(e) => setIsInternal(e.target.checked)} />
                Internal note
              </label>
            </div>
            <Textarea
              value={replyMessage}
              onChange={(e) => setReplyMessage(e.target.value)}
              className="text-xs min-h-[80px]"
              placeholder="Type your reply..."
            />
            <Button size="sm" className="text-xs" onClick={handleReply}>
              Send Reply
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-1">
          {tickets.length === 0 ? (
            <div className="card-subtle p-8 text-center">
              <Ticket className="h-8 w-8 mx-auto mb-4 text-muted-foreground" />
              <p className="text-xs text-muted-foreground">No tickets yet</p>
            </div>
          ) : (
            tickets.map((t: any) => (
              <button
                key={t._id}
                onClick={() => setSelectedTicket(t._id)}
                className="w-full card-subtle p-4 flex items-center justify-between text-left hover:bg-secondary/30 transition-colors"
              >
                <div>
                  <div className="text-sm font-medium">{t.subject}</div>
                  <div className="flex items-center gap-2 mt-1">
                    {statusBadge(t.status)}
                    <span className="text-xs text-muted-foreground">{t.category}</span>
                    <span className="text-xs text-muted-foreground">{t.userName || t.userEmail}</span>
                    <span className="text-xs text-muted-foreground">{new Date(t.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
