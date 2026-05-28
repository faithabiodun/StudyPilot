import React from "react";
import Button from "./Button";

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    if (import.meta.env.DEV) {
      console.error("[StudyPilot UI]", error, info);
    }
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="min-h-screen bg-pilot-ice px-4 py-10 text-pilot-ink">
        <div className="mx-auto max-w-2xl rounded-[2rem] border border-pilot-line bg-white p-8 text-center shadow-pilot">
          <p className="text-sm font-black uppercase tracking-[0.16em] text-pilot-blue">StudyPilot</p>
          <h1 className="mt-3 text-3xl font-black">Something interrupted the interface.</h1>
          <p className="mt-3 text-sm leading-6 text-pilot-muted">
            Refresh the page or return home. The app caught the error instead of leaving a blank screen.
          </p>
          {import.meta.env.DEV && (
            <pre className="mt-5 max-h-44 overflow-auto rounded-2xl bg-pilot-ice p-4 text-left text-xs text-red-700">
              {this.state.error?.message || String(this.state.error)}
            </pre>
          )}
          <div className="mt-6 flex justify-center gap-3">
            <Button onClick={() => window.location.reload()}>Refresh</Button>
            <Button variant="secondary" onClick={() => { window.location.href = "/"; }}>Go Home</Button>
          </div>
        </div>
      </div>
    );
  }
}
