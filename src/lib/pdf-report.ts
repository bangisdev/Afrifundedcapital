/**
 * PerformanceReport — generates a branded PDF performance report for traders.
 *
 * Uses jspdf to create a professional report with:
 *   - AFC header / branding
 *   - Challenge summary
 *   - Key performance metrics
 *   - Drawdown analysis
 *   - Equity curve (drawn as a line chart)
 *   - Compliance status
 *   - Footer with generation date
 */
import { jsPDF } from "jspdf";

// ─── Brand colors ───
const AFC = {
  black: [10, 10, 10] as const,
  white: [255, 255, 255] as const,
  green: [16, 185, 129] as const,
  red: [239, 68, 68] as const,
  blue: [59, 130, 246] as const,
  gray: [107, 114, 128] as const,
  lightGray: [243, 244, 246] as const,
  gold: [245, 158, 11] as const,
};

export interface ReportData {
  traderName: string;
  traderEmail?: string;
  challenge: {
    name: string;
    accountSize: number;
    phase: number;
    status: string;
    profitTarget: number;
    maxDrawdown: number;
    dailyDrawdown: number;
    minTradingDays: number;
    maxLeverage: number;
  };
  metrics: {
    balance: number;
    equity: number;
    floatingPL: number;
    totalPL: number;
    winRate: number;
    profitFactor: number;
    closedTrades: number;
    openPositions: number;
    tradingDays: number;
    currentDrawdown: number;
    dailyDrawdown: number;
    remainingDrawdown: number;
    profitTargetProgress: number;
    healthScore: number;
    largestWin?: number;
    largestLoss?: number;
    averageRR?: number;
    consecutiveWins?: number;
    consecutiveLosses?: number;
  };
  equityCurve?: Array<{ date: string; equity: number }>;
}

function fmt(n: number): string {
  return `₦${n.toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function generatePerformanceReport(data: ReportData): void {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageW = 210;
  const margin = 20;
  const contentW = pageW - margin * 2;
  let y = 0;

  // ═══════════════════════════════════════════════════
  //  HEADER
  // ═══════════════════════════════════════════════════
  doc.setFillColor(...AFC.black);
  doc.rect(0, 0, pageW, 40, "F");

  // AFC logo text
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor(...AFC.white);
  doc.text("AfriFundedCapital", margin, 18);

  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(180, 180, 180);
  doc.text("Performance Report", margin, 26);

  // Date on the right
  doc.setFontSize(8);
  doc.setTextColor(180, 180, 180);
  const now = new Date();
  doc.text(
    `Generated: ${now.toLocaleDateString("en-NG", { year: "numeric", month: "long", day: "numeric" })}`,
    pageW - margin,
    18,
    { align: "right" },
  );
  doc.text(
    `Time: ${now.toLocaleTimeString("en-NG", { hour: "2-digit", minute: "2-digit" })}`,
    pageW - margin,
    26,
    { align: "right" },
  );

  y = 50;

  // ═══════════════════════════════════════════════════
  //  TRADER INFO
  // ═══════════════════════════════════════════════════
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...AFC.black);
  doc.text("Trader Information", margin, y);
  y += 8;

  const traderInfo = [
    ["Name", data.traderName],
    ["Email", data.traderEmail || "—"],
    ["Report Date", now.toLocaleDateString("en-NG")],
  ];

  for (const [label, value] of traderInfo) {
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...AFC.gray);
    doc.text(label, margin, y);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...AFC.black);
    doc.text(value, margin + 40, y);
    y += 6;
  }

  y += 4;

  // ═══════════════════════════════════════════════════
  //  CHALLENGE DETAILS
  // ═══════════════════════════════════════════════════
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...AFC.black);
  doc.text("Challenge Details", margin, y);
  y += 2;

  // Separator line
  doc.setDrawColor(...AFC.lightGray);
  doc.setLineWidth(0.3);
  doc.line(margin, y, margin + contentW, y);
  y += 6;

  const ch = data.challenge;
  const challengeRows = [
    ["Challenge", ch.name],
    ["Account Size", fmt(ch.accountSize)],
    ["Phase", `Phase ${ch.phase}`],
    ["Status", ch.status],
    ["Profit Target", `${ch.profitTarget}%`],
    ["Max Drawdown", `${ch.maxDrawdown}%`],
    ["Daily Drawdown", `${ch.dailyDrawdown}%`],
    ["Min Trading Days", `${ch.minTradingDays}`],
    ["Max Leverage", `1:${ch.maxLeverage}`],
  ];

  // Draw as a 2-column table
  const col1W = contentW / 2 - 5;
  const col2X = margin + contentW / 2 + 5;

  for (let i = 0; i < challengeRows.length; i += 2) {
    const row1 = challengeRows[i];
    const row2 = challengeRows[i + 1];

    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...AFC.gray);
    doc.text(row1[0], margin, y);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...AFC.black);
    doc.text(row1[1], margin + 35, y);

    if (row2) {
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...AFC.gray);
      doc.text(row2[0], col2X, y);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...AFC.black);
      doc.text(row2[1], col2X + 35, y);
    }
    y += 6;
  }

  y += 6;

  // ═══════════════════════════════════════════════════
  //  PERFORMANCE METRICS
  // ═══════════════════════════════════════════════════
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...AFC.black);
  doc.text("Performance Metrics", margin, y);
  y += 2;
  doc.setDrawColor(...AFC.lightGray);
  doc.line(margin, y, margin + contentW, y);
  y += 6;

  const m = data.metrics;
  const metricPairs = [
    ["Balance", fmt(m.balance)],
    ["Equity", fmt(m.equity)],
    ["Floating P&L", `${m.floatingPL >= 0 ? "+" : ""}${fmt(m.floatingPL)}`],
    ["Total P&L", `${m.totalPL >= 0 ? "+" : ""}${fmt(m.totalPL)}`],
    ["Win Rate", `${m.winRate.toFixed(1)}%`],
    ["Profit Factor", m.profitFactor.toFixed(2)],
    ["Closed Trades", String(m.closedTrades)],
    ["Open Positions", String(m.openPositions)],
    ["Trading Days", `${m.tradingDays}`],
    ["Health Score", `${m.healthScore}/100`],
    ["Largest Win", m.largestWin != null ? fmt(m.largestWin) : "—"],
    ["Largest Loss", m.largestLoss != null ? fmt(m.largestLoss) : "—"],
    ["Avg R:R", m.averageRR != null ? m.averageRR.toFixed(2) : "—"],
    ["Streak", `${m.consecutiveWins ?? 0}W / ${m.consecutiveLosses ?? 0}L`],
  ];

  for (let i = 0; i < metricPairs.length; i += 2) {
    const pair1 = metricPairs[i];
    const pair2 = metricPairs[i + 1];

    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...AFC.gray);
    doc.text(pair1[0], margin, y);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...AFC.black);
    doc.text(pair1[1], margin + 35, y);

    if (pair2) {
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...AFC.gray);
      doc.text(pair2[0], col2X, y);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...AFC.black);
      doc.text(pair2[1], col2X + 35, y);
    }
    y += 6;
  }

  y += 6;

  // ═══════════════════════════════════════════════════
  //  DRAWDOWN ANALYSIS
  // ═══════════════════════════════════════════════════
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...AFC.black);
  doc.text("Drawdown Analysis", margin, y);
  y += 2;
  doc.setDrawColor(...AFC.lightGray);
  doc.line(margin, y, margin + contentW, y);
  y += 8;

  // Drawdown bars
  const barMaxW = contentW - 60;

  // Max Drawdown
  const ddPct = ch.maxDrawdown > 0 ? (m.currentDrawdown / ch.maxDrawdown) * 100 : 0;
  const ddBarW = (Math.min(ddPct, 100) / 100) * barMaxW;

  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...AFC.gray);
  doc.text(`Max Drawdown: ${m.currentDrawdown.toFixed(2)}% / ${ch.maxDrawdown}%`, margin, y);
  y += 4;

  // Background bar
  doc.setFillColor(...AFC.lightGray);
  doc.roundedRect(margin, y - 3, barMaxW, 5, 2, 2, "F");

  // Fill bar
  if (ddPct >= 80) doc.setFillColor(...AFC.red);
  else if (ddPct >= 50) doc.setFillColor(...AFC.gold);
  else doc.setFillColor(...AFC.green);
  doc.roundedRect(margin, y - 3, Math.max(ddBarW, 2), 5, 2, 2, "F");
  y += 8;

  // Daily Drawdown
  const dailyPct = ch.dailyDrawdown > 0 ? (m.dailyDrawdown / ch.dailyDrawdown) * 100 : 0;
  const dailyBarW = (Math.min(dailyPct, 100) / 100) * barMaxW;

  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...AFC.gray);
  doc.text(`Daily Drawdown: ${m.dailyDrawdown.toFixed(2)}% / ${ch.dailyDrawdown}%`, margin, y);
  y += 4;

  doc.setFillColor(...AFC.lightGray);
  doc.roundedRect(margin, y - 3, barMaxW, 5, 2, 2, "F");

  if (dailyPct >= 80) doc.setFillColor(...AFC.red);
  else if (dailyPct >= 50) doc.setFillColor(...AFC.gold);
  else doc.setFillColor(...AFC.green);
  doc.roundedRect(margin, y - 3, Math.max(dailyBarW, 2), 5, 2, 2, "F");
  y += 8;

  // Profit Target
  const ptPct = Math.min(m.profitTargetProgress, 100);
  const ptBarW = (ptPct / 100) * barMaxW;

  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...AFC.gray);
  doc.text(`Profit Target: ${m.profitTargetProgress.toFixed(1)}% / ${ch.profitTarget}%`, margin, y);
  y += 4;

  doc.setFillColor(...AFC.lightGray);
  doc.roundedRect(margin, y - 3, barMaxW, 5, 2, 2, "F");

  if (ptPct >= 100) doc.setFillColor(...AFC.green);
  else if (ptPct >= 70) doc.setFillColor(...AFC.blue);
  else doc.setFillColor(...AFC.gold);
  doc.roundedRect(margin, y - 3, Math.max(ptBarW, 2), 5, 2, 2, "F");
  y += 12;

  // ═══════════════════════════════════════════════════
  //  EQUITY CURVE CHART
  // ═══════════════════════════════════════════════════
  if (data.equityCurve && data.equityCurve.length > 1) {
    // Check if we need a new page
    if (y > 200) {
      doc.addPage();
      y = 20;
    }

    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...AFC.black);
    doc.text("Equity Curve", margin, y);
    y += 2;
    doc.setDrawColor(...AFC.lightGray);
    doc.line(margin, y, margin + contentW, y);
    y += 8;

    const chartH = 60;
    const chartW = contentW;
    const points = data.equityCurve;
    const values = points.map((p) => p.equity);
    const minVal = Math.min(...values);
    const maxVal = Math.max(...values);
    const range = maxVal - minVal || 1;
    const padding = 4;

    // Chart background
    doc.setFillColor(250, 250, 250);
    doc.roundedRect(margin, y, chartW, chartH, 2, 2, "F");

    // Draw grid lines
    doc.setDrawColor(230, 230, 230);
    doc.setLineWidth(0.1);
    for (let i = 0; i <= 4; i++) {
      const gy = y + padding + ((chartH - padding * 2) / 4) * i;
      doc.line(margin + padding, gy, margin + chartW - padding, gy);
    }

    // Draw equity line
    doc.setDrawColor(...AFC.blue);
    doc.setLineWidth(0.6);
    doc.setLineCap("round");

    const pointsToDraw: Array<[number, number]> = [];
    for (let i = 0; i < points.length; i++) {
      const px = margin + padding + (i / (points.length - 1)) * (chartW - padding * 2);
      const py = y + padding + (1 - (values[i] - minVal) / range) * (chartH - padding * 2);
      pointsToDraw.push([px, py]);
    }

    // Draw the line segment by segment
    for (let i = 1; i < pointsToDraw.length; i++) {
      const [x1, y1] = pointsToDraw[i - 1];
      const [x2, y2] = pointsToDraw[i];
      doc.line(x1, y1, x2, y2);
    }

    // Fill area under the curve with light horizontal lines
    if (pointsToDraw.length > 1) {
      const bottomY = y + chartH - padding;
      doc.setDrawColor(200, 220, 250);
      doc.setLineWidth(0.15);

      for (let i = 0; i < pointsToDraw.length - 1; i++) {
        const [x1, y1] = pointsToDraw[i];
        const [x2] = pointsToDraw[i + 1];
        // Draw vertical fill lines at intervals
        if (i % 3 === 0) {
          doc.line(x1, y1, x1, bottomY);
        }
      }
    }

    // Y-axis labels
    doc.setFontSize(6);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...AFC.gray);
    for (let i = 0; i <= 4; i++) {
      const val = maxVal - (range / 4) * i;
      const gy = y + padding + ((chartH - padding * 2) / 4) * i;
      doc.text(fmt(val), margin + padding + 1, gy - 1);
    }

    // X-axis labels (first and last date)
    if (points.length > 0) {
      const firstDate = points[0].date.slice(5); // MM-DD
      const lastDate = points[points.length - 1].date.slice(5);
      doc.text(firstDate, margin + padding, y + chartH + 4);
      doc.text(lastDate, margin + chartW - padding, y + chartH + 4, { align: "right" });
    }

    y += chartH + 12;
  }

  // ═══════════════════════════════════════════════════
  //  COMPLIANCE STATUS
  // ═══════════════════════════════════════════════════
  if (y > 230) {
    doc.addPage();
    y = 20;
  }

  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...AFC.black);
  doc.text("Compliance Status", margin, y);
  y += 2;
  doc.setDrawColor(...AFC.lightGray);
  doc.line(margin, y, margin + contentW, y);
  y += 8;

  const complianceChecks = [
    {
      label: "Drawdown Within Limits",
      pass: m.currentDrawdown < ch.maxDrawdown,
      detail: `${m.currentDrawdown.toFixed(2)}% used of ${ch.maxDrawdown}% max`,
    },
    {
      label: "Daily Drawdown Within Limits",
      pass: m.dailyDrawdown < ch.dailyDrawdown,
      detail: `${m.dailyDrawdown.toFixed(2)}% used of ${ch.dailyDrawdown}% daily max`,
    },
    {
      label: "Minimum Trading Days",
      pass: m.tradingDays >= ch.minTradingDays,
      detail: `${m.tradingDays} of ${ch.minTradingDays} required days`,
    },
    {
      label: "Profit Target",
      pass: m.profitTargetProgress >= 100,
      detail: `${m.profitTargetProgress.toFixed(1)}% of ${ch.profitTarget}% target`,
    },
    {
      label: "Account Health",
      pass: m.healthScore >= 60,
      detail: `Health score: ${m.healthScore}/100`,
    },
  ];

  for (const check of complianceChecks) {
    // Checkbox
    if (check.pass) {
      doc.setFillColor(...AFC.green);
      doc.roundedRect(margin, y - 4, 4, 4, 1, 1, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(...AFC.white);
      doc.text("✓", margin + 0.8, y - 0.8);
    } else {
      doc.setFillColor(...AFC.red);
      doc.roundedRect(margin, y - 4, 4, 4, 1, 1, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(...AFC.white);
      doc.text("✗", margin + 0.8, y - 0.8);
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(...AFC.black);
    doc.text(check.label, margin + 7, y);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...AFC.gray);
    doc.text(check.detail, margin + 7, y + 4);

    y += 10;
  }

  // ═══════════════════════════════════════════════════
  //  FOOTER
  // ═══════════════════════════════════════════════════
  const footerY = 287;
  doc.setDrawColor(...AFC.lightGray);
  doc.setLineWidth(0.3);
  doc.line(margin, footerY, pageW - margin, footerY);

  doc.setFontSize(7);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...AFC.gray);
  doc.text("AfriFundedCapital — Confidential Performance Report", margin, footerY + 4);
  doc.text(
    `Page 1 of ${doc.getNumberOfPages()}`,
    pageW - margin,
    footerY + 4,
    { align: "right" },
  );

  // Save the PDF
  const fileName = `AFC-Performance-Report-${data.traderName.replace(/\s+/g, "-")}-${now.toISOString().slice(0, 10)}.pdf`;
  doc.save(fileName);
}
