import { useMemo } from "react";
import { cn } from "@/lib/utils";

export type GaugeStatus = "safe" | "caution" | "warning" | "danger" | "breach";

interface ComplianceGaugeProps {
  /** 0-100 usage percentage of the limit */
  percent: number;
  /** Current value displayed in center */
  value: string;
  /** Label under the gauge */
  label: string;
  /** Subtitle/limit info */
  subtitle?: string;
  /** Override status or derive from percent */
  status?: GaugeStatus;
  /** Size in pixels */
  size?: number;
  /** Show warning threshold line at 80% */
  showWarningThreshold?: boolean;
  /** Additional class names */
  className?: string;
}

const STATUS_CONFIG: Record<GaugeStatus, { color: string; ring: string; glow: string }> = {
  safe: { color: "#22c55e", ring: "stroke-green-500", glow: "drop-shadow-[0_0_6px_rgba(34,197,94,0.4)]" },
  caution: { color: "#3b82f6", ring: "stroke-blue-500", glow: "drop-shadow-[0_0_6px_rgba(59,130,246,0.4)]" },
  warning: { color: "#f59e0b", ring: "stroke-amber-500", glow: "drop-shadow-[0_0_8px_rgba(245,158,11,0.5)]" },
  danger: { color: "#ef4444", ring: "stroke-red-500", glow: "drop-shadow-[0_0_10px_rgba(239,68,68,0.5)]" },
  breach: { color: "#dc2626", ring: "stroke-red-600", glow: "drop-shadow-[0_0_12px_rgba(220,38,38,0.6)]" },
};

function getStatusFromPercent(percent: number): GaugeStatus {
  if (percent >= 100) return "breach";
  if (percent >= 90) return "danger";
  if (percent >= 70) return "warning";
  if (percent >= 50) return "caution";
  return "safe";
}

export function ComplianceGauge({
  percent,
  value,
  label,
  subtitle,
  status: statusProp,
  size = 120,
  showWarningThreshold = true,
  className,
}: ComplianceGaugeProps) {
  const clampedPercent = Math.min(Math.max(percent, 0), 100);
  const status = statusProp || getStatusFromPercent(clampedPercent);
  const config = STATUS_CONFIG[status];

  const strokeWidth = 8;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const center = size / 2;

  // Arc goes from -135° to +135° (270° total sweep)
  const startAngle = -225;
  const endAngle = 45;
  const totalSweep = endAngle - startAngle; // 270°
  const dashOffset = circumference - (clampedPercent / 100) * (totalSweep / 360) * circumference;

  // Background arc (full 270°)
  const bgArcSweep = (totalSweep / 360) * circumference;

  // Warning threshold position at 80%
  const warnAngle = startAngle + (80 / 100) * totalSweep;
  const warnRad = (warnAngle * Math.PI) / 180;
  const warnRadius = radius + strokeWidth / 2 + 4;
  const warnX = center + warnRadius * Math.cos(warnRad);
  const warnY = center + warnRadius * Math.sin(warnRad);

  return (
    <div className={cn("flex flex-col items-center", className)}>
      <div className="relative" style={{ width: size, height: size }}>
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          className={cn("transform -rotate-90", config.glow)}
        >
          <defs>
            <linearGradient id={`gauge-gradient-${label}`} x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor={config.color} stopOpacity={0.6} />
              <stop offset="100%" stopColor={config.color} stopOpacity={1} />
            </linearGradient>
          </defs>

          {/* Background track */}
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke="hsl(var(--border))"
            strokeWidth={strokeWidth}
            strokeDasharray={`${bgArcSweep} ${circumference}`}
            strokeLinecap="round"
            opacity={0.3}
          />

          {/* Value arc */}
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke={`url(#gauge-gradient-${label})`}
            strokeWidth={strokeWidth}
            strokeDasharray={`${circumference}`}
            strokeDashoffset={dashOffset}
            strokeLinecap="round"
            className="transition-all duration-700 ease-out"
          />

          {/* Warning threshold tick */}
          {showWarningThreshold && clampedPercent < 100 && (
            <circle
              cx={warnX}
              cy={warnY}
              r={2.5}
              fill="hsl(var(--muted-foreground))"
              opacity={0.5}
            />
          )}
        </svg>

        {/* Center value */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span
            className={cn(
              "font-semibold tabular-nums leading-none",
              status === "breach" || status === "danger"
                ? "text-red-500 dark:text-red-400"
                : status === "warning"
                ? "text-amber-500 dark:text-amber-400"
                : "text-foreground"
            )}
            style={{ fontSize: size * 0.2 }}
          >
            {value}
          </span>
        </div>
      </div>

      <div className="mt-2 text-center">
        <div className="text-xs font-medium text-foreground">{label}</div>
        {subtitle && (
          <div className="text-[10px] text-muted-foreground mt-0.5">{subtitle}</div>
        )}
      </div>
    </div>
  );
}

export { getStatusFromPercent, STATUS_CONFIG };
export type { ComplianceGaugeProps };
