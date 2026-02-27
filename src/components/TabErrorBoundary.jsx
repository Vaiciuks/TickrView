import React from "react";
import "./TabErrorBoundary.css";

export default class TabErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error(
      `[TabErrorBoundary] ${this.props.tabName || "Tab"} crashed:`,
      error,
      info.componentStack,
    );
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="tab-error-boundary">
          <div className="tab-error-icon">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
          <h2 className="tab-error-title">This tab encountered an error</h2>
          <p className="tab-error-message">
            {this.state.error?.message || "Something unexpected happened."}
          </p>
          <button className="tab-error-retry" onClick={this.handleRetry}>
            Try Again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
