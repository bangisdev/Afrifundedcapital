import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMoney } from "@/lib/utils";
import { Calculator, TrendingUp, DollarSign, Percent } from "lucide-react";

/**
 * Interactive profit split calculator. Traders slide a profit amount and see
 * exactly how much they keep (80%) vs the firm's share (20%), with monthly
 * compounding projections.
 */
export function ProfitSplitCalculator({ currentProfit = 0 }: { currentProfit?: number }) {
  const [monthlyProfit, setMonthlyProfit] = useState(
    currentProfit > 0 ? Math.round(currentProfit) : 5000,
  );
  const profitSharePct = 80;
  const firmSharePct = 20;

  const calculations = useMemo(() => {
    const traderShare = monthlyProfit * (profitSharePct / 100);
    const firmShare = monthlyProfit * (firmSharePct / 100);

    // 6-month compounding projection (reinvesting profits)
    const projections = Array.from({ length: 6 }, (_, i) => {
      const month = i + 1;
      const cumProfit = monthlyProfit * month;
      const cumTrader = cumProfit * (profitSharePct / 100);
      return { month, cumProfit, cumTrader };
    });

    // Annual projection
    const annualTrader = monthlyProfit * 12 * (profitSharePct / 100);

    return { traderShare, firmShare, projections, annualTrader };
  }, [monthlyProfit]);

  // Slider percentage for visual fill
  const sliderPct = Math.min((monthlyProfit / 100000) * 100, 100);

  return (
    <Card className="gap-0 overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
            <Calculator className="h-4 w-4 text-emerald-600" />
          </div>
          <div>
            <CardTitle className="text-sm font-medium">Profit Split Calculator</CardTitle>
            <p className="text-[10px] text-muted-foreground">See exactly what you earn</p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Profit input */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-xs text-muted-foreground">Monthly Profit</label>
            <span className="text-lg font-bold">{formatMoney(monthlyProfit)}</span>
          </div>
          <div className="relative">
            <input
              type="range"
              min={0}
              max={100000}
              step={500}
              value={monthlyProfit}
              onChange={(e) => setMonthlyProfit(Number(e.target.value))}
              className="w-full h-2 rounded-full appearance-none cursor-pointer bg-secondary"
              style={{
                background: `linear-gradient(to right, #10b981 0%, #10b981 ${sliderPct}%, var(--secondary) ${sliderPct}%, var(--secondary) 100%)`,
              }}
            />
            <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
              <span>₦0</span>
              <span>₦100,000</span>
            </div>
          </div>
        </div>

        {/* Split breakdown */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-lg p-4 space-y-2">
            <div className="flex items-center gap-1.5">
              <DollarSign className="h-3.5 w-3.5 text-emerald-600" />
              <span className="text-xs font-medium text-emerald-600">Your Share</span>
            </div>
            <div className="text-2xl font-bold text-emerald-600">
              {formatMoney(calculations.traderShare)}
            </div>
            <div className="flex items-center gap-1 text-[10px] text-emerald-600/70">
              <Percent className="h-2.5 w-2.5" />
              {profitSharePct}% of profits
            </div>
          </div>
          <div className="bg-secondary/50 border border-border rounded-lg p-4 space-y-2">
            <div className="flex items-center gap-1.5">
              <DollarSign className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs font-medium text-muted-foreground">Firm Share</span>
            </div>
            <div className="text-2xl font-bold text-muted-foreground">
              {formatMoney(calculations.firmShare)}
            </div>
            <div className="flex items-center gap-1 text-[10px] text-muted-foreground/70">
              <Percent className="h-2.5 w-2.5" />
              {firmSharePct}% of profits
            </div>
          </div>
        </div>

        {/* Projections */}
        <div className="space-y-3">
          <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            6-Month Projection
          </h4>
          <div className="space-y-2">
            {calculations.projections.map((p) => (
              <div key={p.month} className="flex items-center gap-3">
                <span className="text-[10px] text-muted-foreground w-12 shrink-0">Month {p.month}</span>
                <div className="flex-1 h-1.5 bg-secondary rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                    style={{ width: `${Math.min((p.cumTrader / (calculations.projections[5]?.cumTrader || 1)) * 100, 100)}%` }}
                  />
                </div>
                <span className="text-[11px] font-medium tabular-nums w-24 text-right">
                  {formatMoney(p.cumTrader)}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Annual summary */}
        <div className="bg-gradient-to-r from-emerald-500/5 to-blue-500/5 border border-emerald-500/10 rounded-lg p-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-emerald-600" />
            <span className="text-xs font-medium">Annual Projection</span>
          </div>
          <span className="text-lg font-bold text-emerald-600">
            {formatMoney(calculations.annualTrader)}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
