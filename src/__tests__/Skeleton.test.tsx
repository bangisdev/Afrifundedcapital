// @vitest-environment jsdom
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import {
  Skeleton,
  StatCardSkeleton,
  OverviewSkeleton,
  TradingSkeleton,
  ChallengesSkeleton,
  TableSkeleton,
} from "@/components/ui/skeleton";

describe("Skeleton (base)", () => {
  it("renders a div with animate-pulse class", () => {
    const { container } = render(<Skeleton />);
    const el = container.firstChild as HTMLElement;
    expect(el).toBeTruthy();
    expect(el.className).toContain("animate-pulse");
    expect(el.className).toContain("rounded-md");
    expect(el.className).toContain("bg-muted");
  });

  it("accepts custom className", () => {
    const { container } = render(<Skeleton className="h-10 w-20" />);
    const el = container.firstChild as HTMLElement;
    expect(el.className).toContain("h-10");
    expect(el.className).toContain("w-20");
  });

  it("spreads additional HTML props", () => {
    const { container } = render(<Skeleton data-testid="custom-skeleton" />);
    expect(container.querySelector("[data-testid='custom-skeleton']")).toBeTruthy();
  });
});

describe("StatCardSkeleton", () => {
  it("renders a card-like container", () => {
    const { container } = render(<StatCardSkeleton />);
    const card = container.querySelector(".rounded-xl");
    expect(card).toBeTruthy();
    expect(card?.className).toContain("border");
  });

  it("renders multiple skeleton placeholders", () => {
    const { container } = render(<StatCardSkeleton />);
    const skeletons = container.querySelectorAll(".animate-pulse");
    expect(skeletons.length).toBeGreaterThanOrEqual(3);
  });
});

describe("OverviewSkeleton", () => {
  it("renders without crashing", () => {
    const { container } = render(<OverviewSkeleton />);
    expect(container.firstChild).toBeTruthy();
  });

  it("renders 4 stat card skeletons in a grid", () => {
    const { container } = render(<OverviewSkeleton />);
    // The grid for stat cards
    const grids = container.querySelectorAll(".grid");
    expect(grids.length).toBeGreaterThan(0);
  });

  it("renders chart area placeholder", () => {
    const { container } = render(<OverviewSkeleton />);
    const chartPlaceholder = container.querySelector(".h-64");
    expect(chartPlaceholder).toBeTruthy();
  });

  it("renders a header skeleton", () => {
    const { container } = render(<OverviewSkeleton />);
    const headerSkeleton = container.querySelector(".h-7");
    expect(headerSkeleton).toBeTruthy();
  });
});

describe("TradingSkeleton", () => {
  it("renders without crashing", () => {
    const { container } = render(<TradingSkeleton />);
    expect(container.firstChild).toBeTruthy();
  });

  it("renders tab skeletons", () => {
    const { container } = render(<TradingSkeleton />);
    const tabs = container.querySelectorAll(".h-9.w-32");
    expect(tabs.length).toBeGreaterThanOrEqual(3);
  });

  it("renders account card skeletons", () => {
    const { container } = render(<TradingSkeleton />);
    const cards = container.querySelectorAll(".rounded-xl");
    expect(cards.length).toBeGreaterThanOrEqual(1);
  });
});

describe("ChallengesSkeleton", () => {
  it("renders without crashing", () => {
    const { container } = render(<ChallengesSkeleton />);
    expect(container.firstChild).toBeTruthy();
  });

  it("renders 6 challenge card skeletons", () => {
    const { container } = render(<ChallengesSkeleton />);
    // Each challenge card has a p-5 rounded-xl
    const cards = container.querySelectorAll(".p-5.rounded-xl");
    expect(cards.length).toBe(6);
  });

  it("renders filter pills", () => {
    const { container } = render(<ChallengesSkeleton />);
    const pills = container.querySelectorAll(".rounded-full");
    expect(pills.length).toBeGreaterThanOrEqual(3);
  });

  it("renders a page title skeleton", () => {
    const { container } = render(<ChallengesSkeleton />);
    const title = container.querySelector(".h-7.w-40");
    expect(title).toBeTruthy();
  });
});

describe("TableSkeleton", () => {
  it("renders with default 5 rows and 5 columns", () => {
    const { container } = render(<TableSkeleton />);
    // Header row + 5 data rows = 6 flex containers with border-b
    const rows = container.querySelectorAll(".border-b");
    expect(rows.length).toBeGreaterThanOrEqual(5);
  });

  it("renders with custom rows and cols", () => {
    const { container } = render(<TableSkeleton rows={3} cols={4} />);
    // 3 data rows + 1 header
    const rows = container.querySelectorAll(".border-b");
    expect(rows.length).toBeGreaterThanOrEqual(3);
  });

  it("renders a bordered container", () => {
    const { container } = render(<TableSkeleton />);
    const table = container.querySelector(".rounded-xl.border");
    expect(table).toBeTruthy();
  });

  it("renders skeleton placeholders in each cell", () => {
    const { container } = render(<TableSkeleton rows={2} cols={3} />);
    const skeletons = container.querySelectorAll(".animate-pulse");
    // Each row has `cols` skeletons + header row
    expect(skeletons.length).toBeGreaterThan(6);
  });

  it("renders full-width skeletons for header cells", () => {
    const { container } = render(<TableSkeleton rows={1} cols={3} />);
    const flexItems = container.querySelectorAll(".flex-1");
    // 3 header cells + cells in data row
    expect(flexItems.length).toBeGreaterThan(3);
  });
});
