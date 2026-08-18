import { describe, it, expect } from "vitest";
import { formatMoney, formatRelativeTime, formatShortDate, cn } from "../lib/utils";

describe("cn", () => {
  it("merges class names", () => {
    expect(cn("foo", "bar")).toBe("foo bar");
  });
  it("deduplicates tailwind classes", () => {
    expect(cn("p-2 p-4")).toBe("p-4");
  });
});

describe("formatMoney", () => {
  it("formats NGN amounts with naira symbol", () => {
    const result = formatMoney(250000);
    expect(result).toContain("250,000");
    // Should use narrowSymbol for NGN (₦)
    expect(result).toMatch(/[₦]/);
  });

  it("formats USD amounts with dollar sign and 2 decimals", () => {
    const result = formatMoney(1234.56, "USD");
    expect(result).toContain("1,234.56");
    expect(result).toContain("$");
  });

  it("returns '—' for null", () => {
    expect(formatMoney(null)).toBe("—");
  });

  it("returns '—' for undefined", () => {
    expect(formatMoney(undefined)).toBe("—");
  });

  it("returns '—' for NaN", () => {
    expect(formatMoney(NaN)).toBe("—");
  });

  it("formats zero correctly", () => {
    const result = formatMoney(0);
    expect(result).toContain("0");
  });

  it("formats negative amounts", () => {
    const result = formatMoney(-5000);
    expect(result).toContain("5,000");
  });

  it("handles string input", () => {
    const result = formatMoney("100000");
    expect(result).toContain("100,000");
  });

  it("returns '—' for non-numeric string", () => {
    expect(formatMoney("abc")).toBe("—");
  });

  it("formats small decimal amounts", () => {
    const result = formatMoney(0.5, "USD");
    expect(result).toContain("0.50");
  });
});

describe("formatRelativeTime", () => {
  it("returns 'Just now' for very recent timestamps", () => {
    const now = Date.now();
    expect(formatRelativeTime(now)).toBe("Just now");
  });

  it("returns minutes ago for timestamps within an hour", () => {
    const fiveMinAgo = Date.now() - 5 * 60 * 1000;
    expect(formatRelativeTime(fiveMinAgo)).toBe("5m ago");
  });

  it("returns hours ago for timestamps within a day", () => {
    const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;
    expect(formatRelativeTime(twoHoursAgo)).toBe("2h ago");
  });

  it("returns days ago for timestamps within a week", () => {
    const threeDaysAgo = Date.now() - 3 * 24 * 60 * 60 * 1000;
    expect(formatRelativeTime(threeDaysAgo)).toBe("3d ago");
  });

  it("returns short date for older timestamps", () => {
    const twoWeeksAgo = Date.now() - 14 * 24 * 60 * 60 * 1000;
    const result = formatRelativeTime(twoWeeksAgo);
    // Should be a date string, not a relative time
    expect(result).not.toContain("ago");
    expect(result).not.toBe("Just now");
  });
});

describe("formatShortDate", () => {
  it("formats a timestamp to a readable date", () => {
    // June 15, 2025 12:00 UTC
    const ts = new Date("2025-06-15T12:00:00Z").getTime();
    const result = formatShortDate(ts);
    expect(result).toMatch(/Jun 15, 2025/);
  });

  it("formats January correctly", () => {
    const ts = new Date("2025-01-01T00:00:00Z").getTime();
    const result = formatShortDate(ts);
    expect(result).toMatch(/Jan 1, 2025/);
  });

  it("formats December correctly", () => {
    const ts = new Date("2024-12-25T00:00:00Z").getTime();
    const result = formatShortDate(ts);
    expect(result).toMatch(/Dec 25, 2024/);
  });
});
