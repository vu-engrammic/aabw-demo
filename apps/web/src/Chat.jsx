// apps/web/src/Chat.jsx
import React from "react";
import { api } from "./api";

export function Chat({ user }) {
  const [query, setQuery] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [result, setResult] = React.useState(null);
  const [error, setError] = React.useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    setError("");
    setResult(null);

    try {
      const data = await api("/chat", {
        method: "POST",
        body: JSON.stringify({ query }),
      });
      setResult(data);
    } catch (err) {
      setError(err.message || "Failed to get answer");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="chat-container">
      <form className="chat-form" onSubmit={handleSubmit}>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Ask a question about company policies, procedures..."
          disabled={loading}
        />
        <button type="submit" className="primary" disabled={loading || !query.trim()}>
          {loading ? "Thinking..." : "Ask"}
        </button>
      </form>

      {error && <div className="error-banner">{error}</div>}

      {result && (
        <div className="chat-result">
          <div className="answer-card">
            <div className="confidence-badge" data-level={result.confidence}>
              {result.confidence} confidence
            </div>
            <div className="answer-text">{result.answer}</div>
          </div>

          {result.sources?.length > 0 && (
            <div className="sources-section">
              <h3>Sources</h3>
              {result.sources.map((src) => (
                <div key={src.id} className="source-card">
                  <span className="source-id">[{src.id}]</span>
                  <span className="source-file">{src.file}</span>
                  <p className="source-chunk">{src.chunk}...</p>
                </div>
              ))}
            </div>
          )}

          {result.deniedCount > 0 && (
            <div className="denied-banner">
              {result.deniedCount} document{result.deniedCount > 1 ? "s" : ""} hidden by access level
            </div>
          )}
        </div>
      )}
    </div>
  );
}
