import React from "react";
import { logger } from "@/services/logger";

interface State { hasError: boolean; error?: Error }

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    logger.fatal(`React crash: ${error.message}`, {
      component: "ErrorBoundary",
      stack: error.stack,
      component_stack: info.componentStack,
    });
  }

  handleReload = () => window.location.reload();

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <div className="max-w-md w-full bg-card border border-border rounded-md shadow p-6 text-center">
          <h1 className="text-lg font-semibold text-foreground mb-2">Something went wrong</h1>
          <p className="text-sm text-muted-foreground mb-4">
            The error has been reported. You can reload to try again.
          </p>
          {this.state.error?.message && (
            <pre className="text-xs text-left bg-muted p-2 rounded overflow-auto max-h-40 mb-4">
              {this.state.error.message}
            </pre>
          )}
          <button
            onClick={this.handleReload}
            className="h-9 px-4 bg-primary text-primary-foreground text-sm font-medium rounded-sm hover:bg-primary/90"
          >
            Reload
          </button>
        </div>
      </div>
    );
  }
}