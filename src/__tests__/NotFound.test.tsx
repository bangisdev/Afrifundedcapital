// @vitest-environment jsdom
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// ─── Mock: react-router ───────────────────────────────────
const mockNavigate = vi.fn();
vi.mock("react-router", () => ({
  useNavigate: () => mockNavigate,
}));

// ─── Mock: lucide-react ───────────────────────────────────
vi.mock("lucide-react", () => {
  const createIcon = (name: string) => {
    const Icon = (props: any) =>
      React.createElement("span", { "data-testid": `icon-${name}`, ...props });
    Icon.displayName = name;
    return Icon;
  };
  return {
    FileQuestion: createIcon("FileQuestion"),
    ArrowLeft: createIcon("ArrowLeft"),
    Home: createIcon("Home"),
  };
});

import React from "react";
import NotFound from "@/pages/dashboard/NotFound";

describe("NotFound", () => {
  beforeEach(() => {
    mockNavigate.mockClear();
  });

  it("renders the 404 number", () => {
    render(<NotFound />);
    expect(screen.getByText("404")).toBeTruthy();
  });

  it("renders the page not found heading", () => {
    render(<NotFound />);
    expect(screen.getByText("Page not found")).toBeTruthy();
  });

  it("renders the description for trader context", () => {
    render(<NotFound />);
    expect(screen.getByText(/Check the sidebar for available sections/)).toBeTruthy();
  });

  it("renders the description for admin context", () => {
    render(<NotFound isAdmin />);
    expect(screen.getByText(/Check the admin sidebar for available sections/)).toBeTruthy();
  });

  it("renders Go Back and Dashboard buttons", () => {
    render(<NotFound />);
    expect(screen.getByText("Go Back")).toBeTruthy();
    expect(screen.getByText("Dashboard")).toBeTruthy();
  });

  it("navigates back when Go Back is clicked", () => {
    render(<NotFound />);
    fireEvent.click(screen.getByText("Go Back"));
    expect(mockNavigate).toHaveBeenCalledWith(-1);
  });

  it("navigates to /dashboard when Dashboard button is clicked", () => {
    render(<NotFound />);
    fireEvent.click(screen.getByText("Dashboard"));
    expect(mockNavigate).toHaveBeenCalledWith("/dashboard");
  });

  it("navigates to /admin when admin and Dashboard button is clicked", () => {
    render(<NotFound isAdmin />);
    fireEvent.click(screen.getByText("Admin Overview"));
    expect(mockNavigate).toHaveBeenCalledWith("/admin");
  });

  it("renders the FileQuestion icon", () => {
    render(<NotFound />);
    expect(screen.getByTestId("icon-FileQuestion")).toBeTruthy();
  });

  it("renders the ArrowLeft icon in the Go Back button", () => {
    render(<NotFound />);
    expect(screen.getByTestId("icon-ArrowLeft")).toBeTruthy();
  });

  it("renders the Home icon in the Dashboard button", () => {
    render(<NotFound />);
    expect(screen.getByTestId("icon-Home")).toBeTruthy();
  });
});
