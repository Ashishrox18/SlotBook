"use client";

import { Component, type ReactNode } from "react";

interface Props { children: ReactNode; }
interface State { error: string | null; }

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(err: unknown): State {
    return { error: err instanceof Error ? err.message : String(err) };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="mx-auto max-w-xl px-4 py-16 text-center">
          <p className="text-sm font-medium text-red-600">Something went wrong</p>
          <p className="mt-2 text-xs text-slate-500 font-mono break-all">{this.state.error}</p>
          <button
            onClick={() => this.setState({ error: null })}
            className="mt-4 rounded-lg border border-slate-200 px-4 py-2 text-sm hover:bg-slate-50"
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
