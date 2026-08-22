/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  CalendarClock, Globe, Clock, ChevronDown, ChevronUp,
  AlertTriangle, Zap, Info, Filter, Bell, ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ═══════════════════════════════════════════════════════
//  Types
// ═══════════════════════════════════════════════════════

interface EconomicEvent {
  id: string;
  title: string;
  country: string;
  countryCode: string; // ISO 2-letter
  currency: string;
  date: Date;
  time: string; // HH:MM UTC
  impact: "high" | "medium" | "low";
  category: string;
  forecast: string;
  previous: string;
  actual?: string;
  description: string;
}

type ImpactFilter = "all" | "high" | "medium" | "low";
type TimeRange = "today" | "thisWeek" | "nextWeek";

// ═══════════════════════════════════════════════════════
//  Static event data generator (rotating weekly schedule)
// ═══════════════════════════════════════════════════════

const EVENT_TEMPLATES: Omit<EconomicEvent, "id" | "date">[] = [
  // Monday
  { title: "ISM Manufacturing PMI", country: "United States", countryCode: "US", currency: "USD", time: "14:00", impact: "high", category: "Manufacturing", forecast: "48.5", previous: "48.7", description: "Measures the economic activity of the manufacturing sector. Above 50 indicates expansion." },
  { title: "Retail Sales m/m", country: "United States", countryCode: "US", currency: "USD", time: "12:30", impact: "high", category: "Consumer", forecast: "0.3%", previous: "0.1%", description: "Change in the total value of sales at the retail level. Key indicator of consumer spending." },
  { title: "CPI y/y", country: "Eurozone", countryCode: "EU", currency: "EUR", time: "09:00", impact: "high", category: "Inflation", forecast: "2.5%", previous: "2.6%", description: "Consumer Price Index — the most important measure of inflation for the ECB." },
  { title: "GDP q/q", country: "United Kingdom", countryCode: "GB", currency: "GBP", time: "06:00", impact: "high", category: "Growth", forecast: "0.2%", previous: "0.1%", description: "Measures the quarterly change in gross domestic product. Primary indicator of economic health." },
  { title: "Trade Balance", country: "Japan", countryCode: "JP", currency: "JPY", time: "23:50", impact: "medium", category: "Trade", forecast: "¥-800B", previous: "¥-912B", description: "Difference between imports and exports. A wider deficit weakens the yen." },
  { title: "Employment Change q/q", country: "Australia", countryCode: "AU", currency: "AUD", time: "00:30", impact: "high", category: "Employment", forecast: "0.4%", previous: "0.8%", description: "Change in the number of employed people. Key gauge of labor market health." },
  { title: "Unemployment Rate", country: "Germany", countryCode: "DE", currency: "EUR", time: "07:55", impact: "medium", category: "Employment", forecast: "5.9%", previous: "5.9%", description: "Percentage of the total workforce that is unemployed and actively seeking employment." },
  { title: "Building Permits", country: "Canada", countryCode: "CA", currency: "CAD", time: "12:30", impact: "medium", category: "Housing", forecast: "250K", previous: "248K", description: "Number of new building permits issued. Leading indicator of housing market activity." },

  // Tuesday
  { title: "Non-Farm Employment Change", country: "United States", countryCode: "US", currency: "USD", time: "12:30", impact: "high", category: "Employment", forecast: "180K", previous: "199K", description: "The most important monthly employment report. Measures change in the number of employed people during the previous month." },
  { title: "Unemployment Rate", country: "United States", countryCode: "US", currency: "USD", time: "12:30", impact: "high", category: "Employment", forecast: "3.8%", previous: "3.7%", description: "Percentage of the total workforce that is unemployed and actively seeking employment." },
  { title: "CPI m/m", country: "United States", countryCode: "US", currency: "USD", time: "12:30", impact: "high", category: "Inflation", forecast: "0.3%", previous: "0.2%", description: "Consumer Price Index — the most important inflation metric for the Fed." },
  { title: "Core CPI m/m", country: "United States", countryCode: "US", currency: "USD", time: "12:30", impact: "high", category: "Inflation", forecast: "0.3%", previous: "0.3%", description: "CPI excluding food and energy — the Fed's preferred inflation measure." },
  { title: "ZEW Economic Sentiment", country: "Germany", countryCode: "DE", currency: "EUR", time: "09:00", impact: "medium", category: "Sentiment", forecast: "12.0", previous: "11.7", description: "Survey of institutional investors and analysts about economic expectations." },
  { title: "Producer Price Index m/m", country: "Japan", countryCode: "JP", currency: "JPY", time: "23:50", impact: "medium", category: "Inflation", forecast: "0.2%", previous: "0.3%", description: "Change in the price of goods sold by manufacturers. Leading indicator of consumer inflation." },

  // Wednesday
  { title: "FOMC Statement", country: "United States", countryCode: "US", currency: "USD", time: "18:00", impact: "high", category: "Central Bank", forecast: "—", previous: "—", description: "Federal Reserve monetary policy statement. The most market-moving event of the month." },
  { title: "Federal Funds Rate", country: "United States", countryCode: "US", currency: "USD", time: "18:00", impact: "high", category: "Central Bank", forecast: "5.50%", previous: "5.50%", description: "Interest rate at which depository institutions lend funds to each other overnight." },
  { title: "FOMC Press Conference", country: "United States", countryCode: "US", currency: "USD", time: "18:30", impact: "high", category: "Central Bank", forecast: "—", previous: "—", description: "Fed Chair's press conference following the FOMC decision. Markets react to guidance signals." },
  { title: "CPI m/m", country: "Canada", countryCode: "CA", currency: "CAD", time: "12:30", impact: "high", category: "Inflation", forecast: "0.4%", previous: "0.3%", description: "Measures the change in price of goods and services purchased by consumers." },
  { title: "Industrial Production m/m", country: "Eurozone", countryCode: "EU", currency: "EUR", time: "09:00", impact: "medium", category: "Manufacturing", forecast: "0.2%", previous: "-0.1%", description: "Measures the output of the industrial sector including manufacturing, mining, and utilities." },
  { title: "Retail Sales m/m", country: "Japan", countryCode: "JP", currency: "JPY", time: "23:50", impact: "medium", category: "Consumer", forecast: "1.2%", previous: "-0.8%", description: "Change in total sales volume at the retail level." },

  // Thursday
  { title: "ECB Interest Rate Decision", country: "Eurozone", countryCode: "EU", currency: "EUR", time: "12:15", impact: "high", category: "Central Bank", forecast: "4.50%", previous: "4.50%", description: "European Central Bank's main refinancing rate decision." },
  { title: "ECB Press Conference", country: "Eurozone", countryCode: "EU", currency: "EUR", time: "12:45", impact: "high", category: "Central Bank", forecast: "—", previous: "—", description: "ECB President's press conference explaining the rate decision." },
  { title: "Initial Jobless Claims", country: "United States", countryCode: "US", currency: "USD", time: "12:30", impact: "high", category: "Employment", forecast: "215K", previous: "222K", description: "Weekly count of unemployment insurance claims. Leading indicator of labor market health." },
  { title: "PPI m/m", country: "United States", countryCode: "US", currency: "USD", time: "12:30", impact: "medium", category: "Inflation", forecast: "0.2%", previous: "0.0%", description: "Producer Price Index — measures the average change in selling prices received by domestic producers." },
  { title: "Trade Balance", country: "China", countryCode: "CN", currency: "CNY", time: "02:00", impact: "high", category: "Trade", forecast: "$75B", previous: "$68.3B", description: "Difference between China's exports and imports. Impacts commodity currencies (AUD, NZD)." },
  { title: "BOE Interest Rate Decision", country: "United Kingdom", countryCode: "GB", currency: "GBP", time: "11:00", impact: "high", category: "Central Bank", forecast: "5.25%", previous: "5.25%", description: "Bank of England's official bank rate decision." },

  // Friday
  { title: "University of Michigan Consumer Sentiment (Final)", country: "United States", countryCode: "US", currency: "USD", time: "14:00", impact: "high", category: "Sentiment", forecast: "67.5", previous: "67.8", description: "Survey of consumer confidence. Inflation expectations component is closely watched by the Fed." },
  { title: "Retail Sales m/m", country: "United Kingdom", countryCode: "GB", currency: "GBP", time: "06:00", impact: "high", category: "Consumer", forecast: "0.3%", previous: "0.6%", description: "Measures the change in total value of retail sales." },
  { title: "Core CPI y/y", country: "Japan", countryCode: "JP", currency: "JPY", time: "23:30", impact: "high", category: "Inflation", forecast: "2.8%", previous: "2.7", description: "CPI excluding fresh food — BOJ's preferred inflation gauge." },
  { title: "Unemployment Rate", country: "Canada", countryCode: "CA", currency: "CAD", time: "12:30", impact: "high", category: "Employment", forecast: "5.8%", previous: "5.8%", description: "Percentage of total labor force that is unemployed." },
  { title: "German Factory Orders m/m", country: "Germany", countryCode: "DE", currency: "EUR", time: "07:00", impact: "medium", category: "Manufacturing", forecast: "0.5%", previous: "-1.1%", description: "Change in the total value of new purchase orders placed with manufacturers." },
  { title: "Chinese Caixin Services PMI", country: "China", countryCode: "CN", currency: "CNY", time: "01:45", impact: "medium", category: "Services", forecast: "53.0", previous: "52.7", description: "Measures service sector business conditions. Above 50 = expansion." },

  // Recurring daily events
  { title: "Crude Oil Inventories", country: "United States", countryCode: "US", currency: "USD", time: "14:30", impact: "medium", category: "Commodities", forecast: "-0.5M", previous: "-1.2M", description: "Weekly change in crude oil inventory. Impacts oil prices (WTI, Brent)." },
  { title: "10-Year Bond Auction", country: "United States", countryCode: "US", currency: "USD", time: "18:00", impact: "low", category: "Bonds", forecast: "4.250%", previous: "4.265%", description: "Treasury 10-year bond auction yield. Higher yield = stronger USD." },
];

/**
 * Generates events for a given week by placing templates on appropriate days
 */
function generateWeekEvents(baseDate: Date): EconomicEvent[] {
  const events: EconomicEvent[] = [];
  const dayOfWeek = baseDate.getDay(); // 0=Sun

  // Map day of week to event indices (each event template has a day slot)
  const dayIndices: Record<number, number[]> = {
    1: [0, 1, 2, 3, 4, 5, 6, 7, 28],  // Mon
    2: [8, 9, 10, 11, 12, 13],          // Tue
    3: [14, 15, 16, 17, 18, 19, 20],    // Wed
    4: [21, 22, 23, 24, 25, 26],        // Thu
    5: [27, 28, 29, 30, 31, 32, 33],    // Fri
  };

  for (let d = 1; d <= 5; d++) {
    const date = new Date(baseDate);
    const diff = d - dayOfWeek;
    date.setDate(baseDate.getDate() + (diff >= 0 ? diff : diff + 7));

    const indices = dayIndices[d] || [];
    for (const idx of indices) {
      if (idx < EVENT_TEMPLATES.length) {
        const tmpl = EVENT_TEMPLATES[idx];
        events.push({
          ...tmpl,
          id: `${tmpl.countryCode}-${tmpl.time.replace(":", "")}-${d}`,
          date,
        });
      }
    }
  }

  return events;
}

// ═══════════════════════════════════════════════════════
//  Country flag emoji helper
// ═══════════════════════════════════════════════════════

const FLAG_EMOJIS: Record<string, string> = {
  US: "🇺🇸", EU: "🇪🇺", GB: "🇬🇧", JP: "🇯🇵", AU: "🇦🇺",
  CA: "🇨🇦", CN: "🇨🇳", DE: "🇩🇪", FR: "🇫🇷", NG: "🇳🇬",
  ZA: "🇿🇦", CH: "🇨🇭", NZ: "🇳🇿",
};

function CountryFlag({ code }: { code: string }) {
  return <span className="text-sm leading-none">{FLAG_EMOJIS[code] || "🌐"}</span>;
}

// ═══════════════════════════════════════════════════════
//  Impact badge
// ═══════════════════════════════════════════════════════

function ImpactBadge({ impact }: { impact: "high" | "medium" | "low" }) {
  const config = {
    high: { label: "High", className: "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20", dots: 3 },
    medium: { label: "Medium", className: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20", dots: 2 },
    low: { label: "Low", className: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20", dots: 1 },
  };
  const c = config[impact];
  return (
    <span className={cn("inline-flex items-center gap-1 border rounded-full px-2 py-0.5 text-[10px] font-medium", c.className)}>
      <span className="flex gap-0.5">
        {Array.from({ length: c.dots }).map((_, i) => (
          <span key={i} className={cn("h-1 w-1 rounded-full", impact === "high" ? "bg-red-500" : impact === "medium" ? "bg-amber-500" : "bg-emerald-500")} />
        ))}
      </span>
      {c.label}
    </span>
  );
}

// ═══════════════════════════════════════════════════════
//  Event Row
// ═══════════════════════════════════════════════════════

function EventRow({ event, isExpanded, onToggle, index }: {
  event: EconomicEvent;
  isExpanded: boolean;
  onToggle: () => void;
  index: number;
}) {
  const isToday = new Date().toDateString() === event.date.toDateString();

  return (
    <motion.div
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, delay: index * 0.02 }}
    >
      <button
        onClick={onToggle}
        className={cn(
          "w-full text-left p-3 rounded-lg border transition-all",
          event.impact === "high" && !isToday
            ? "border-red-500/10 hover:bg-red-500/5"
            : "border-border/50 hover:bg-secondary/30",
          isToday && "border-brand/30 bg-brand/5",
        )}
      >
        <div className="flex items-center gap-3">
          <CountryFlag code={event.countryCode} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium truncate">{event.title}</span>
              {event.impact === "high" && <AlertTriangle className="h-3 w-3 text-red-500 shrink-0" />}
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-[10px] text-muted-foreground">{event.country}</span>
              <span className="text-[10px] text-muted-foreground">•</span>
              <span className="text-[10px] text-muted-foreground font-mono">{event.time} UTC</span>
              <span className="text-[10px] text-muted-foreground">•</span>
              <span className="text-[10px] text-muted-foreground">{event.currency}</span>
            </div>
          </div>
          <ImpactBadge impact={event.impact} />
          {isExpanded ? (
            <ChevronUp className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          )}
        </div>
      </button>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-3 py-2.5 ml-8 space-y-2.5 rounded-b-lg border border-t-0 border-border/50 bg-secondary/10">
              <p className="text-xs text-muted-foreground leading-relaxed">{event.description}</p>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">Forecast</div>
                  <div className="text-xs font-medium tabular-nums">{event.forecast}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">Previous</div>
                  <div className="text-xs font-medium tabular-nums text-muted-foreground">{event.previous}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">Category</div>
                  <div className="text-xs font-medium">{event.category}</div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════
//  Main Component
// ═══════════════════════════════════════════════════════

export function EconomicCalendar() {
  const [impactFilter, setImpactFilter] = useState<ImpactFilter>("all");
  const [timeRange, setTimeRange] = useState<TimeRange>("thisWeek");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const events = useMemo(() => {
    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay() + 1); // Monday
    startOfWeek.setHours(0, 0, 0, 0);

    if (timeRange === "today") {
      const todayEvents = generateWeekEvents(startOfWeek);
      return todayEvents.filter((e) => e.date.toDateString() === now.toDateString());
    }
    if (timeRange === "nextWeek") {
      const nextWeekStart = new Date(startOfWeek);
      nextWeekStart.setDate(startOfWeek.getDate() + 7);
      return generateWeekEvents(nextWeekStart);
    }
    return generateWeekEvents(startOfWeek);
  }, [timeRange]);

  const filteredEvents = useMemo(() => {
    if (impactFilter === "all") return events;
    return events.filter((e) => e.impact === impactFilter);
  }, [events, impactFilter]);

  // Group by date
  const groupedEvents = useMemo(() => {
    const groups: Record<string, EconomicEvent[]> = {};
    for (const event of filteredEvents) {
      const key = event.date.toDateString();
      if (!groups[key]) groups[key] = [];
      groups[key].push(event);
    }
    // Sort events within each group by time
    for (const key of Object.keys(groups)) {
      groups[key].sort((a, b) => a.time.localeCompare(b.time));
    }
    return groups;
  }, [filteredEvents]);

  const highImpactCount = events.filter((e) => e.impact === "high").length;

  const toggleExpanded = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const formatDate = (date: Date) => {
    const today = new Date();
    if (date.toDateString() === today.toDateString()) return "Today";
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    if (date.toDateString() === tomorrow.toDateString()) return "Tomorrow";
    return date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  };

  return (
    <div className="card-subtle overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-border/50">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <CalendarClock className="h-4 w-4 text-brand" />
            <h3 className="text-sm font-medium">Economic Calendar</h3>
          </div>
          {highImpactCount > 0 && (
            <div className="flex items-center gap-1.5 text-[10px] text-red-500 font-medium">
              <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
              {highImpactCount} high-impact events
            </div>
          )}
        </div>

        {/* Time range tabs */}
        <div className="flex items-center gap-1">
          {(["today", "thisWeek", "nextWeek"] as TimeRange[]).map((range) => (
            <button
              key={range}
              onClick={() => setTimeRange(range)}
              className={cn(
                "px-2.5 py-1 text-[10px] font-medium rounded-md transition-colors",
                timeRange === range
                  ? "bg-secondary text-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary/50",
              )}
            >
              {range === "today" ? "Today" : range === "thisWeek" ? "This Week" : "Next Week"}
            </button>
          ))}

          <div className="w-px h-3 bg-border mx-1" />

          {/* Impact filter */}
          {(["all", "high", "medium", "low"] as ImpactFilter[]).map((filter) => (
            <button
              key={filter}
              onClick={() => setImpactFilter(filter)}
              className={cn(
                "px-2 py-1 text-[10px] font-medium rounded-md transition-colors",
                impactFilter === filter
                  ? filter === "high"
                    ? "bg-red-500/10 text-red-600 dark:text-red-400"
                    : filter === "medium"
                      ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                      : filter === "low"
                        ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                        : "bg-secondary text-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary/50",
              )}
            >
              {filter === "all" ? "All" : filter.charAt(0).toUpperCase() + filter.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Events list */}
      <div className="max-h-[400px] overflow-y-auto">
        {Object.keys(groupedEvents).length === 0 ? (
          <div className="p-6 text-center">
            <CalendarClock className="h-6 w-6 mx-auto mb-2 text-muted-foreground" />
            <p className="text-xs text-muted-foreground">No events for this period</p>
          </div>
        ) : (
          <div className="divide-y divide-border/30">
            {Object.entries(groupedEvents).map(([dateStr, dayEvents]) => (
              <div key={dateStr}>
                {/* Date header */}
                <div className="px-4 py-2 bg-secondary/20 sticky top-0 z-10">
                  <div className="flex items-center gap-2">
                    <Clock className="h-3 w-3 text-muted-foreground" />
                    <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                      {formatDate(dayEvents[0].date)}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      ({dayEvents.length} event{dayEvents.length !== 1 ? "s" : ""})
                    </span>
                  </div>
                </div>
                {/* Events */}
                <div className="p-2 space-y-1.5">
                  {dayEvents.map((event, i) => (
                    <EventRow
                      key={event.id}
                      event={event}
                      index={i}
                      isExpanded={expandedIds.has(event.id)}
                      onToggle={() => toggleExpanded(event.id)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
