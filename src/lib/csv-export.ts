/**
 * CSV Export Utility for AfriFundedCapital
 *
 * Reusable helpers to convert arrays of objects into CSV strings,
 * create a Blob, and trigger a browser download.
 */

// ─── Types ────────────────────────────────────────────────

interface CSVColumn<T> {
  /** Header label for the CSV column */
  header: string;
  /** Accessor: extracts the cell value from a row object */
  accessor: (row: T) => string | number | null | undefined;
  /** Optional custom formatter (defaults to String(value)) */
  format?: (value: string | number | null | undefined) => string;
}

interface CSVExportOptions {
  /** Filename without .csv extension */
  filename: string;
  /** BOM for Excel UTF-8 compatibility */
  includeBOM?: boolean;
}

// ─── Helpers ──────────────────────────────────────────────

/** Escape a CSV cell value: wrap in quotes if it contains comma, quote, newline, or starts/ends with spaces */
function escapeCell(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n") || value.includes("\r") || value.startsWith(" ") || value.endsWith(" ")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/** Default formatter: converts null/undefined to empty string, otherwise String() */
function defaultFormat(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  return String(value);
}

// ─── Core Export Function ─────────────────────────────────

/**
 * Export an array of typed rows to a CSV file download.
 *
 * @example
 * ```ts
 * exportToCSV({
 *   filename: "AFC-Journal-Export",
 *   columns: [
 *     { header: "Symbol", accessor: (r) => r.symbol },
 *     { header: "P&L", accessor: (r) => r.pnl, format: (v) => `₦${v ?? 0}` },
 *   ],
 *   rows: entries,
 * });
 * ```
 */
export function exportToCSV<T extends Record<string, any>>(
  options: CSVExportOptions & {
    columns: CSVColumn<T>[];
    rows: T[];
  },
): void {
  const { filename, columns, rows, includeBOM = true } = options;

  // Header row
  const headerLine = columns.map((col) => escapeCell(col.header)).join(",");

  // Data rows
  const dataLines = rows.map((row) =>
    columns
      .map((col) => {
        const raw = col.accessor(row);
        const formatted = (col.format ?? defaultFormat)(raw);
        return escapeCell(formatted);
      })
      .join(","),
  );

  // Combine
  const csvContent = [headerLine, ...dataLines].join("\n");
  const blob = new Blob(
    [(includeBOM ? "\uFEFF" : "") + csvContent],
    { type: "text/csv;charset=utf-8;" },
  );

  // Trigger download
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${filename}.csv`;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// ─── Pre-built column definitions for Journal entries ─────

export interface JournalExportRow {
  id: number;
  symbol: string;
  direction: string;
  outcome: string;
  entryPrice: number | null;
  exitPrice: number | null;
  stopLoss: number | null;
  takeProfit: number | null;
  lotSize: number | null;
  pnl: number | null;
  pips: number | null;
  commission: number | null;
  swap: number | null;
  strategy: string | null;
  timeframe: string | null;
  setupQuality: number | null;
  emotionalState: string | null;
  notes: string | null;
  lessonsLearned: string | null;
  tags: string | null;
  createdAt: number;
}

export const JOURNAL_COLUMNS: CSVColumn<JournalExportRow>[] = [
  { header: "ID", accessor: (r) => r.id },
  { header: "Symbol", accessor: (r) => r.symbol },
  { header: "Direction", accessor: (r) => r.direction },
  { header: "Outcome", accessor: (r) => r.outcome },
  { header: "Entry Price", accessor: (r) => r.entryPrice },
  { header: "Exit Price", accessor: (r) => r.exitPrice },
  { header: "Stop Loss", accessor: (r) => r.stopLoss },
  { header: "Take Profit", accessor: (r) => r.takeProfit },
  { header: "Lot Size", accessor: (r) => r.lotSize },
  {
    header: "P&L",
    accessor: (r) => r.pnl,
    format: (v) => (v != null ? String(v) : ""),
  },
  {
    header: "Pips",
    accessor: (r) => r.pips,
    format: (v) => (v != null ? String(v) : ""),
  },
  {
    header: "Commission",
    accessor: (r) => r.commission,
    format: (v) => (v != null ? String(v) : ""),
  },
  {
    header: "Swap",
    accessor: (r) => r.swap,
    format: (v) => (v != null ? String(v) : ""),
  },
  { header: "Strategy", accessor: (r) => r.strategy },
  { header: "Timeframe", accessor: (r) => r.timeframe },
  {
    header: "Setup Quality",
    accessor: (r) => r.setupQuality,
    format: (v) => (v != null ? `${v}/5` : ""),
  },
  { header: "Emotional State", accessor: (r) => r.emotionalState },
  { header: "Notes", accessor: (r) => r.notes },
  { header: "Lessons Learned", accessor: (r) => r.lessonsLearned },
  { header: "Tags", accessor: (r) => r.tags },
  {
    header: "Date",
    accessor: (r) => r.createdAt,
    format: (v) =>
      v ? new Date(Number(v)).toLocaleDateString("en-NG") : "",
  },
];

/**
 * Export journal entries to CSV.
 */
export function exportJournalToCSV(
  entries: JournalExportRow[],
  filename = "AFC-Journal-Export",
): void {
  exportToCSV({
    filename,
    columns: JOURNAL_COLUMNS,
    rows: entries,
  });
}

// ─── Pre-built column definitions for Trading data ────────

export interface TradingExportRow {
  date: string;
  balance: number | null;
  equity: number | null;
  floatingPL: number | null;
  dailyPL: number | null;
  drawdown: number | null;
  dailyDrawdown: number | null;
  closedTrades: number | null;
  winRate: number | null;
  profitFactor: number | null;
  [key: string]: unknown;
}

export const TRADING_COLUMNS: CSVColumn<TradingExportRow>[] = [
  { header: "Date", accessor: (r) => r.date },
  {
    header: "Balance",
    accessor: (r) => r.balance,
    format: (v) => (v != null ? String(v) : ""),
  },
  {
    header: "Equity",
    accessor: (r) => r.equity,
    format: (v) => (v != null ? String(v) : ""),
  },
  {
    header: "Floating P&L",
    accessor: (r) => r.floatingPL,
    format: (v) => (v != null ? String(v) : ""),
  },
  {
    header: "Daily P&L",
    accessor: (r) => r.dailyPL,
    format: (v) => (v != null ? String(v) : ""),
  },
  {
    header: "Drawdown %",
    accessor: (r) => r.drawdown,
    format: (v) => (v != null ? `${Number(v).toFixed(2)}%` : ""),
  },
  {
    header: "Daily Drawdown %",
    accessor: (r) => r.dailyDrawdown,
    format: (v) => (v != null ? `${Number(v).toFixed(2)}%` : ""),
  },
  {
    header: "Closed Trades",
    accessor: (r) => r.closedTrades,
    format: (v) => (v != null ? String(v) : ""),
  },
  {
    header: "Win Rate %",
    accessor: (r) => r.winRate,
    format: (v) => (v != null ? `${Number(v).toFixed(1)}%` : ""),
  },
  {
    header: "Profit Factor",
    accessor: (r) => r.profitFactor,
    format: (v) => (v != null ? Number(v).toFixed(2) : ""),
  },
];

/**
 * Export trading metrics history to CSV.
 */
export function exportTradingToCSV(
  metrics: TradingExportRow[],
  filename = "AFC-Trading-Export",
): void {
  exportToCSV({
    filename,
    columns: TRADING_COLUMNS,
    rows: metrics,
  });
}
