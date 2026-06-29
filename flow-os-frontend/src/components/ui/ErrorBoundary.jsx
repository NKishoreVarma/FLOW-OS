import { Component } from "react";
import { AlertTriangle } from "lucide-react";

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    // Log the error boundary catch without leaking PII payloads.
    console.error("[ErrorBoundary] Render error:", error?.message, info?.componentStack);
  }

  handleReset = () => {
    this.setState({ hasError: false });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-[calc(100vh-4rem)] items-center justify-center bg-bg-primary p-6">
          <div className="max-w-md text-center space-y-4">
            <div className="mx-auto w-12 h-12 rounded-full bg-critical/10 border border-critical/20 flex items-center justify-center">
              <AlertTriangle className="w-6 h-6 text-critical" />
            </div>
            <h2 className="text-ui-lg font-semibold text-text-primary">Something went wrong on this view</h2>
            <p className="text-ui-sm text-text-secondary">
              The rest of FLOW is still running. Try reloading this view, or navigate elsewhere from the sidebar.
            </p>
            <div className="flex items-center justify-center gap-2">
              <button
                onClick={this.handleReset}
                className="px-4 py-2 rounded-lg bg-flow-purple text-white text-ui-sm font-medium hover:bg-flow-purple/90 transition-apple cursor-pointer"
              >
                Try Again
              </button>
              <button
                onClick={() => window.location.assign("/workfeed")}
                className="px-4 py-2 rounded-lg border border-border-flow text-text-secondary text-ui-sm font-medium hover:bg-bg-hover transition-apple cursor-pointer"
              >
                Go to Workfeed
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
