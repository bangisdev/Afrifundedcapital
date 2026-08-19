import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Responsive table wrapper. Renders a standard `<table>` on md+ screens and
 * a card-stack layout on mobile (< md). Each row is rendered twice: once as a
 * `<tr>` (hidden on mobile) and once as a card (hidden on md+).
 *
 * Usage:
 *   <ResponsiveTable
 *     columns={["Name", "Status", "Actions"]}
 *     keys={["name", "status", "actions"]}
 *     rows={data}
 *     renderCell={(row, key) => ...}
 *     mobileCard={(row) => <div>...</div>}
 *   />
 */
export function ResponsiveTable<T extends Record<string, any>>({
  columns,
  keys,
  rows,
  renderCell,
  mobileCard,
  className,
  emptyMessage = "No data found",
}: {
  columns: string[];
  keys: string[];
  rows: T[];
  renderCell: (row: T, key: string, index: number) => ReactNode;
  mobileCard?: (row: T, index: number) => ReactNode;
  className?: string;
  emptyMessage?: string;
}) {
  if (rows.length === 0) {
    return (
      <div className="card-subtle p-8 text-center text-sm text-muted-foreground">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className={cn("space-y-0", className)}>
      {/* Desktop table — hidden on mobile */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border">
              {columns.map((col) => (
                <th key={col} className="p-3 text-left font-medium text-muted-foreground whitespace-nowrap">
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className="border-b border-border/50 hover:bg-secondary/30 transition-colors">
                {keys.map((key) => (
                  <td key={key} className="p-3">
                    {renderCell(row, key, i)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards — hidden on desktop */}
      <div className="md:hidden space-y-2">
        {rows.map((row, i) => (
          mobileCard ? (
            <div key={i}>{mobileCard(row, i)}</div>
          ) : (
            <DefaultMobileCard key={i} row={row} columns={columns} keys={keys} renderCell={renderCell} index={i} />
          )
        ))}
      </div>
    </div>
  );
}

function DefaultMobileCard<T extends Record<string, any>>({
  row,
  columns,
  keys,
  renderCell,
  index,
}: {
  row: T;
  columns: string[];
  keys: string[];
  renderCell: (row: T, key: string, index: number) => ReactNode;
  index: number;
}) {
  return (
    <div className="card-subtle p-3 space-y-2">
      {/* First column as title */}
      <div className="font-medium text-sm">{renderCell(row, keys[0], index)}</div>
      {/* Remaining columns as key-value pairs */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
        {keys.slice(1).map((key, i) => (
          <div key={key}>
            <span className="text-[10px] text-muted-foreground">{columns[i + 1]}</span>
            <div className="text-xs">{renderCell(row, key, index)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
