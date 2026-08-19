import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import FireboxAIStudio from "../FireboxAIStudio";

class FireboxErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("Firebox render error", error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#1e1e1e", color: "#f1f1f1", fontFamily: "Inter, system-ui, sans-serif", padding: 24, boxSizing: "border-box" }}>
        <div style={{ width: "min(680px, 100%)", border: "1px solid #5a2b2b", borderRadius: 12, padding: 24, background: "#252526" }}>
          <div style={{ color: "#f85149", fontWeight: 700, marginBottom: 10 }}>Firebox could not render this page</div>
          <div style={{ color: "#c9c9c9", fontSize: 13, lineHeight: 1.6, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{this.state.error?.message || String(this.state.error)}</div>
          <button onClick={() => window.location.reload()} style={{ marginTop: 18, border: "none", borderRadius: 7, padding: "9px 14px", background: "#007acc", color: "white", cursor: "pointer", fontWeight: 600 }}>Reload Firebox</button>
        </div>
      </div>
    );
  }
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <FireboxErrorBoundary>
      <FireboxAIStudio />
    </FireboxErrorBoundary>
  </React.StrictMode>
);
