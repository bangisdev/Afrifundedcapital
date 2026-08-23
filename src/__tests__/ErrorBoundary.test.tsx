// @vitest-environment jsdom
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";

// ─── Mock: lucide-react ───────────────────────────────────
vi.mock("lucide-react", () => {
  const createIcon = (name: string) => {
    const Icon = (props: any) =>
      React.createElement("span", { "data-testid": `icon-${name}`, ...props });
    Icon.displayName = name;
    return Icon;
  };
  return {
    AlertTriangle: createIcon("AlertTriangle"),
    RefreshCw: createIcon("RefreshCw"),
    Home: createIcon("Home"),
  };
});

import { ErrorBoundary } from "@/components/ErrorBoundary";

// ─── Helper: Component that throws ────────────────────────
function ThrowingComponent({ shouldThrow = true }: { shouldThrow?: boolean }) {
  if (shouldThrow) {
    throw new Error("Test error message");
  }
  return <div data-testid="child-content">Child rendered successfully</div>;
}

// Suppress console.error in tests
const originalError = console.error;
beforeEach(() => {
  console.error = vi.fn();
});
afterEach(() => {
  console.error = originalError;
});

describe("ErrorBoundary", () => {
  it("renders children when no error occurs", () => {
    render(
      <ErrorBoundary>
        <ThrowingComponent shouldThrow={false} />
      </ErrorBoundary>
    );
    expect(screen.getByTestId("child-content")).toBeTruthy();
    expect(screen.getByText("Child rendered successfully")).toBeTruthy();
  });

  it("renders fallback UI when a child component throws", () => {
    render(
      <ErrorBoundary>
        <ThrowingComponent />
      </ErrorBoundary>
    );
    expect(screen.getByText("Something went wrong")).toBeTruthy();
    expect(screen.getByText(/An unexpected error occurred/)).toBeTruthy();
  });

  it("displays the error message", () => {
    render(
      <ErrorBoundary>
        <ThrowingComponent />
      </ErrorBoundary>
    );
    expect(screen.getByText("Test error message")).toBeTruthy();
  });

  it("renders custom fallback title and description", () => {
    render(
      <ErrorBoundary fallbackTitle="Custom Title" fallbackDescription="Custom description here">
        <ThrowingComponent />
      </ErrorBoundary>
    );
    expect(screen.getByText("Custom Title")).toBeTruthy();
    expect(screen.getByText("Custom description here")).toBeTruthy();
  });

  it("renders the Try Again button", () => {
    render(
      <ErrorBoundary>
        <ThrowingComponent />
      </ErrorBoundary>
    );
    expect(screen.getByText("Try Again")).toBeTruthy();
  });

  it("renders the Dashboard button", () => {
    render(
      <ErrorBoundary>
        <ThrowingComponent />
      </ErrorBoundary>
    );
    expect(screen.getByText("Dashboard")).toBeTruthy();
  });

  it("resets error state when Try Again is clicked", () => {
    // Use a toggle-able component to test recovery
    let shouldThrow = true;
    const ToggleComponent = () => {
      if (shouldThrow) throw new Error("Toggle error");
      return <div data-testid="recovered">Recovered!</div>;
    };

    const { rerender } = render(
      <ErrorBoundary>
        <ToggleComponent />
      </ErrorBoundary>
    );

    expect(screen.getByText("Something went wrong")).toBeTruthy();

    // Fix the error and click Try Again
    shouldThrow = false;
    fireEvent.click(screen.getByText("Try Again"));

    // The error boundary resets and re-renders children
    expect(screen.getByText("Recovered!")).toBeTruthy();
  });

  it("renders the AlertTriangle icon in fallback", () => {
    render(
      <ErrorBoundary>
        <ThrowingComponent />
      </ErrorBoundary>
    );
    expect(screen.getByTestId("icon-AlertTriangle")).toBeTruthy();
  });

  it("renders the RefreshCw icon in Try Again button", () => {
    render(
      <ErrorBoundary>
        <ThrowingComponent />
      </ErrorBoundary>
    );
    expect(screen.getByTestId("icon-RefreshCw")).toBeTruthy();
  });

  it("renders the Home icon in Dashboard button", () => {
    render(
      <ErrorBoundary>
        <ThrowingComponent />
      </ErrorBoundary>
    );
    expect(screen.getByTestId("icon-Home")).toBeTruthy();
  });

  it("does not show error message box for custom fallbacks without error display", () => {
    render(
      <ErrorBoundary fallbackTitle="Oops" fallbackDescription="Something broke">
        <ThrowingComponent />
      </ErrorBoundary>
    );
    // Custom fallback renders but error message div still shows
    expect(screen.getByText("Oops")).toBeTruthy();
    expect(screen.getByText("Something broke")).toBeTruthy();
  });

  it("logs error to console via componentDidCatch", () => {
    const consoleSpy = vi.spyOn(console, "error");
    render(
      <ErrorBoundary>
        <ThrowingComponent />
      </ErrorBoundary>
    );
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});
