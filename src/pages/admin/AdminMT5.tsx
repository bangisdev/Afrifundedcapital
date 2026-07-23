import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Loader2,
  TrendingUp,
  Search,
  RefreshCw,
  MoreHorizontal,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Clock,
  Eye,
  EyeOff,
} from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

function SyncStatusBadge({ account }: { account: any }) {
  if (!account.lastSyncAt) {
    return (
      <Badge variant="outline" className="text-[10px] font-normal border-0 bg-yellow-500/10 text-yellow-600 dark:text-yellow-400">
        <AlertCircle className="h-2.5 w-2.5 mr-1" />
        Never synced
      </Badge>
    );
  }

  const hoursSinceSync = (Date.now() - account.lastSyncAt) / (1000 * 60 * 60);
  if (hoursSinceSync < 1) {
    return (
      <Badge variant="outline" className="text-[10px] font-normal border-0 bg-green-500/10 text-green-600 dark:text-green-400">
        <CheckCircle2 className="h-2.5 w-2.5 mr-1" />
        Synced recently
      </Badge>
    );
  }
  if (hoursSinceSync < 24) {
    return (
      <Badge variant="outline" className="text-[10px] font-normal border-0 bg-blue-500/10 text-blue-600 dark:text-blue-400">
        <Clock className="h-2.5 w-2.5 mr-1" />
        {Math.round(hoursSinceSync)}h ago
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-[10px] font-normal border-0 bg-red-500/10 text-red-600 dark:text-red-400">
      <AlertCircle className="h-2.5 w-2.5 mr-1" />
      {Math.round(hoursSinceSync / 24)}d ago
    </Badge>
  );
}

export default function AdminMT5() {
  const accounts = useQuery(api.mt5.listAllMt5Accounts, {});
  const syncQueue = useQuery(api.mt5.getMt5SyncQueue, {});
  const updateAccount = useMutation(api.mt5.updateMt5Account);
  const queueSync = useMutation(api.mt5.queueMt5Sync);

  const [search, setSearch] = useState("");
  const [showPasswords, setShowPasswords] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState<any>(null);
  const [updating, setUpdating] = useState<string | null>(null);

  if (!accounts || !syncQueue) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const pendingSync = syncQueue.filter((q) => q.status === "pending").length;

  const filtered = search
    ? accounts.filter(
        (a) =>
          a.login.toLowerCase().includes(search.toLowerCase()) ||
          a.userName?.toLowerCase().includes(search.toLowerCase()) ||
          a.userEmail?.toLowerCase().includes(search.toLowerCase()) ||
          a.server.toLowerCase().includes(search.toLowerCase()),
      )
    : accounts;

  const handleToggleStatus = async (account: any, suspend: boolean) => {
    setUpdating(account._id);
    try {
      await updateAccount({
        accountId: account._id,
        isSuspended: suspend,
      });
      toast.success(suspend ? "Account suspended" : "Account activated");
    } catch (error: any) {
      toast.error(error.message);
    }
    setUpdating(null);
  };

  const handleQueueSync = async (accountId: string) => {
    try {
      await queueSync({ mt5AccountId: accountId as any, action: "sync" });
      toast.success("Sync queued");
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-medium tracking-tight">MT5 Accounts</h1>
          <p className="text-xs text-muted-foreground mt-1">
            Manage MetaTrader 5 trading accounts
          </p>
        </div>
        <div className="flex items-center gap-2">
          {pendingSync > 0 && (
            <Badge variant="outline" className="text-xs font-normal">
              {pendingSync} pending sync
            </Badge>
          )}
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => setShowPasswords(!showPasswords)}
          >
            {showPasswords ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-xs">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          className="pl-8 text-xs h-9"
          placeholder="Search by login, user, or server…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Accounts list */}
      <div className="space-y-2">
        {filtered.length === 0 ? (
          <div className="card-subtle p-8 text-center">
            <TrendingUp className="h-8 w-8 mx-auto text-muted-foreground/40 mb-3" />
            <p className="text-sm text-muted-foreground">No MT5 accounts found.</p>
          </div>
        ) : (
          filtered.map((account) => (
            <div key={account._id} className="card-subtle p-4">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-sm font-medium font-mono">
                      Login: {account.login}
                    </span>
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-[10px] font-normal border-0",
                        account.isActive && !account.isSuspended
                          ? "bg-green-500/10 text-green-600 dark:text-green-400"
                          : "bg-red-500/10 text-red-600 dark:text-red-400",
                      )}
                    >
                      {account.isSuspended
                        ? "Suspended"
                        : account.isActive
                          ? "Active"
                          : "Inactive"}
                    </Badge>
                    <SyncStatusBadge account={account} />
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                    <div>
                      <span className="text-muted-foreground">User</span>
                      <p className="font-medium truncate">{account.userName || account.userEmail || "—"}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Server</span>
                      <p className="font-medium font-mono">{account.server}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Balance</span>
                      <p className="font-medium font-mono">
                        {account.currency} {account.balance?.toLocaleString() || "0"}
                      </p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Equity</span>
                      <p className="font-medium font-mono">
                        {account.currency} {account.equity?.toLocaleString() || "0"}
                      </p>
                    </div>
                  </div>

                  {showPasswords && (
                    <div className="mt-2 pt-2 border-t border-border grid grid-cols-2 gap-3 text-xs">
                      <div>
                        <span className="text-muted-foreground">Password</span>
                        <p className="font-mono">{account.password}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Investor Password</span>
                        <p className="font-mono">{account.investorPassword}</p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 ml-4 shrink-0">
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-7 w-7"
                    title="Queue sync"
                    onClick={() => handleQueueSync(account._id)}
                  >
                    <RefreshCw className="h-3 w-3" />
                  </Button>
                  {account.isSuspended ? (
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-7 w-7"
                      title="Activate"
                      onClick={() => handleToggleStatus(account, false)}
                      disabled={updating === account._id}
                    >
                      {updating === account._id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <CheckCircle2 className="h-3 w-3" />
                      )}
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-7 w-7"
                      title="Suspend"
                      onClick={() => handleToggleStatus(account, true)}
                      disabled={updating === account._id}
                    >
                      {updating === account._id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <XCircle className="h-3 w-3" />
                      )}
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-7 w-7"
                    title="Details"
                    onClick={() => setSelectedAccount(account)}
                  >
                    <MoreHorizontal className="h-3 w-3" />
                  </Button>
                </div>
              </div>

              {/* Group & Leverage info */}
              <div className="mt-2 flex items-center gap-3 text-[10px] text-muted-foreground">
                <span>Group: <span className="font-mono">{account.group}</span></span>
                <span>Leverage: <span className="font-mono">1:{account.leverage}</span></span>
                <span>Created: {new Date(account.createdAt).toLocaleDateString()}</span>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Sync Queue */}
      {syncQueue.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-medium">Sync Queue</h2>
          <div className="space-y-1">
            {syncQueue.slice(0, 10).map((item) => (
              <div key={item._id} className="card-subtle p-2 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-[10px] font-normal border-0",
                      item.status === "pending" && "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400",
                      item.status === "processing" && "bg-blue-500/10 text-blue-600 dark:text-blue-400",
                      item.status === "completed" && "bg-green-500/10 text-green-600 dark:text-green-400",
                      item.status === "failed" && "bg-red-500/10 text-red-600 dark:text-red-400",
                    )}
                  >
                    {item.status}
                  </Badge>
                  <span className="font-medium">{item.action}</span>
                </div>
                <span className="text-muted-foreground font-mono">
                  {new Date(item.createdAt).toLocaleTimeString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Detail Dialog */}
      <Dialog open={!!selectedAccount} onOpenChange={(open) => !open && setSelectedAccount(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm font-medium">
              MT5 Account — Login {selectedAccount?.login}
            </DialogTitle>
          </DialogHeader>
          {selectedAccount && (
            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <span className="text-muted-foreground">User</span>
                  <p className="font-medium">{selectedAccount.userName || selectedAccount.userEmail}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Server</span>
                  <p className="font-mono">{selectedAccount.server}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Group</span>
                  <p className="font-mono">{selectedAccount.group}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Leverage</span>
                  <p className="font-mono">1:{selectedAccount.leverage}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Balance</span>
                  <p className="font-mono">{selectedAccount.currency} {selectedAccount.balance?.toLocaleString()}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Equity</span>
                  <p className="font-mono">{selectedAccount.currency} {selectedAccount.equity?.toLocaleString()}</p>
                </div>
              </div>
              <div className="border-t border-border pt-3">
                <span className="text-muted-foreground">Status</span>
                <p>
                  {selectedAccount.isSuspended
                    ? "Suspended"
                    : selectedAccount.isActive
                      ? "Active"
                      : "Inactive"}
                  {selectedAccount.lastSyncAt && (
                    <span className="ml-2 text-muted-foreground">
                      — Last sync: {new Date(selectedAccount.lastSyncAt).toLocaleString()}
                    </span>
                  )}
                </p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
