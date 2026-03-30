import React, { Component, ErrorInfo, ReactNode } from "react";

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class AppErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 20, color: 'white', maxWidth: '800px', margin: '0 auto' }}>
          <h1 style={{ color: '#f87171' }}>Критическая ошибка React</h1>
          <p>В компонентах произошла ошибка рендеринга. Вот сырой трейс для ИИ:</p>
          <pre style={{ background: 'rgba(255,0,0,0.1)', padding: '16px', borderRadius: '8px', overflowX: 'auto' }}>
             {this.state.error?.toString()}
          </pre>
        </div>
      );
    }

    return this.props.children;
  }
}
