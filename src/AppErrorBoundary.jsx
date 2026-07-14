import { Component, createRef } from "react";

export const RECOVERY_SESSION_KEY = "taskcabinet_open_recovery";

export class AppErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null, retryCount: 0 };
    this.headingRef = createRef();
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("GlowDocket encountered an unexpected interface error:", error, errorInfo);
  }

  componentDidUpdate(previousProps, previousState) {
    if (!previousState.error && this.state.error) this.headingRef.current?.focus();
  }

  handleRetry = () => {
    this.setState((state) => ({ error: null, retryCount: state.retryCount + 1 }));
  };

  handleReload = () => {
    window.location.reload();
  };

  handleOpenRecovery = () => {
    try {
      sessionStorage.setItem(RECOVERY_SESSION_KEY, "1");
    } catch {
      // Reload still provides a safe recovery attempt when sessionStorage is unavailable.
    }
    window.location.reload();
  };

  render() {
    if (!this.state.error) return <div key={this.state.retryCount} className="app-error-boundary-content">{this.props.children}</div>;

    return (
      <main className="app-crash-screen" role="alert" aria-labelledby="app-crash-title">
        <section className="app-crash-card">
          <div className="app-crash-mark" aria-hidden="true">!</div>
          <p className="eyebrow">Recovery mode</p>
          <h1 id="app-crash-title" ref={this.headingRef} tabIndex="-1">GlowDocket hit an unexpected error</h1>
          <p>Your assignments and settings have not been cleared. Try the screen again, reload the app, or open Backup &amp; Restore after reloading.</p>
          <div className="app-crash-actions">
            <button type="button" className="btn btn-primary" onClick={this.handleRetry}>Try Again</button>
            <button type="button" className="btn btn-secondary" onClick={this.handleReload}>Reload GlowDocket</button>
            <button type="button" className="btn btn-secondary" onClick={this.handleOpenRecovery}>Reload into Backup &amp; Restore</button>
          </div>
          <details className="app-crash-details">
            <summary>Technical details</summary>
            <code>{this.state.error?.message || "Unknown interface error"}</code>
          </details>
        </section>
      </main>
    );
  }
}

export default AppErrorBoundary;
