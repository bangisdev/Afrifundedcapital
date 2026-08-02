/* eslint-disable @typescript-eslint/no-explicit-any */
import { auditLogs } from "../schema";

/**
 * Write an audit log entry for an admin/compliance action.
 *
 * Never throws — audit failures must never break the primary business action.
 * Wrap callers in try/catch as a belt-and-suspenders measure.
 */
export function writeAuditLog(
  db: any,
  entry: {
    userId: number;
    action: string;
    entity: string;
    entityId: string | number;
    details?: Record<string, unknown>;
    ipAddress?: string;
  },
): void {
  try {
    db.insert(auditLogs)
      .values({
        userId: entry.userId,
        action: entry.action,
        entity: entry.entity,
        entityId: String(entry.entityId),
        details: entry.details ? JSON.stringify(entry.details) : null,
        ipAddress: entry.ipAddress || null,
        timestamp: Date.now(),
      })
      .run();
  } catch (e) {
    console.warn("[Audit] Failed to write audit log:", e);
  }
}
