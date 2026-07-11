import React, { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { WarningCircle, ArrowClockwise } from '@phosphor-icons/react';

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center w-full h-full min-h-screen bg-white dark:bg-black text-[#18181B] dark:text-white p-8">
          <div className="flex flex-col items-center justify-center max-w-md text-center space-y-6">
            <div className="w-16 h-16 bg-red-100 dark:bg-red-500/10 rounded-2xl flex items-center justify-center">
              <WarningCircle size={32} className="text-red-500" weight="duotone" />
            </div>
            <div className="space-y-2">
              <h2 className="text-2xl font-bold font-sans">Something went wrong</h2>
              <p className="text-[13px] text-[#71717A] dark:text-[#A1A1AA] font-medium leading-relaxed">
                The application encountered an unexpected error. Your workspace data is safe, but
                the UI crashed.
              </p>
            </div>

            {this.state.error && (
              <div className="w-full bg-white dark:bg-[#111111] p-4 rounded-xl text-left border border-[#E4E4E7] dark:border-white/10 overflow-auto max-h-40">
                <code className="text-[11px] font-mono text-red-500 break-words whitespace-pre-wrap">
                  {this.state.error.message}
                </code>
              </div>
            )}

            <button
              onClick={() => {
                this.setState({ hasError: false, error: null });
                window.location.reload();
              }}
              className="flex items-center gap-2 px-6 py-2.5 bg-fuchsia-500 hover:bg-fuchsia-600 text-white rounded-full font-bold text-[13px] transition-all shadow-[0_4px_14px_rgba(217,70,239,0.3)]"
            >
              <ArrowClockwise size={16} weight="bold" />
              <span>Reload Application</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
