import React from "react";
import { createRoot } from "react-dom/client";
import { KeycloakProvider } from "./contexts/KeycloakContext.jsx";
import App from "./App.jsx";
import "./style.css";

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("FairEnrol Uncaught React Error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: "40px", fontFamily: "sans-serif", maxWidth: "640px", margin: "40px auto", background: "#fff", borderRadius: "8px", boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }}>
          <h2 style={{ color: "#c0392b" }}>⚠️ Application Error Encountered</h2>
          <p style={{ color: "#555" }}>{this.state.error?.message || "An unexpected error occurred while rendering FairEnrol."}</p>
          <pre style={{ background: "#f8f9fa", padding: "12px", borderRadius: "4px", overflow: "auto", fontSize: "12px" }}>
            {this.state.error?.stack}
          </pre>
          <button style={{ padding: "8px 16px", cursor: "pointer", marginTop: "12px", background: "#102a29", color: "#fff", border: "none", borderRadius: "4px" }} onClick={() => window.location.reload()}>
            Reload Application
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ErrorBoundary>
      <KeycloakProvider>
        <App />
      </KeycloakProvider>
    </ErrorBoundary>
  </React.StrictMode>,
);
