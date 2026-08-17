import type { ReactNode } from "react";

/**
 * Shared admin page header — eyebrow section label, page title, subtitle and
 * an optional actions slot. Keeps every admin section on the same visual
 * rhythm (see AdminOverview for the originating pattern).
 */
export function AdminPageHeader({
  eyebrow,
  title,
  subtitle,
  actions,
}: {
  eyebrow: string;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="eyebrow mb-1">{eyebrow}</p>
        <h1 className="text-xl font-medium tracking-tight">{title}</h1>
        {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}
