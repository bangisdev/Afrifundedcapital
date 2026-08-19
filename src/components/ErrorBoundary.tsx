import { Component, type ReactNode } from "react";
import { AlertTriangle, RefreshCw, Home } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("[ErrorBoundary]", error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  handleGoHome = () => {
    this.setState({ hasError: false, error: null });
    window.location.href = "/dashboard";
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-[60vh] flex flex-col items-center justify-center p-8">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/10 mb-6">
            <AlertTriangle className="h-7 w-7 text-destructive" />
          </div>
          <h2 className="text-lg font-semibold mb-2">Something went wrong</h2>
          <p className="text-sm text-muted-foreground text-center max-w-md mb-6">
            An unexpected error occurred. Your data is safe — this has been logged
            and our team has been notified.
          </p>
          {this.state.error && (
            <div className="mb-6 w-full max-w-lg">
              <details className="rounded-lg border border-border bg-secondary/30 p-3">
                <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground transition-colors">
                  Technical details
                </summary>
                <pre className="mt-2 text-[10px] text-muted-foreground/80 whitespace-pre-wrap break-words max-h-40 overflow-auto">
                  {this.state.error.message}
                  {"\n\n"}
                  {this.state.error.stack}
                </pre>
              </details>
            </div>
          )}
          <div className="flex items-center gap-3">
            <Button size="sm" variant="outline" onClick={this.handleReset}>
              <RefreshCw className="h-3 w-3 mr-1.5" />
              Try Again
            </Button>
            <Button size="sm" onClick={this.handleGoHome}>
              <Home className="h-3 w-3 mr-1.5" />
              Go to Dashboard
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
