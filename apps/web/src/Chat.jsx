// apps/web/src/Chat.jsx
import React from "react";
import Markdown from "react-markdown";
import { api } from "./api";
import { useLocale } from "./i18n.jsx";

export function Chat({ user }) {
  const { t } = useLocale();
  const [query, setQuery] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [result, setResult] = React.useState(null);
  const [error, setError] = React.useState("");
  const responseRef = React.useRef(null);

  React.useEffect(() => {
    if (result && responseRef.current) {
      responseRef.current.scrollTop = 0;
    }
  }, [result]);

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
      setError(err.message || t("chat.failedToGetAnswer"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="chat-layout">
      {/* Scrollable response area */}
      <div className="chat-response-area" ref={responseRef}>
        {!result && !loading && !error && (
          <div className="chat-placeholder">
            <h2>{t("chat.placeholderTitle")}</h2>
            <p>{t("chat.placeholderBody")}</p>
            <div className="example-queries">
              <span>{t("chat.tryLabel")}</span>
              <button type="button" onClick={() => setQuery(t("chat.queryLeave"))}>{t("chat.exampleLeave")}</button>
              <button type="button" onClick={() => setQuery(t("chat.queryExpense"))}>{t("chat.exampleExpense")}</button>
              <button type="button" onClick={() => setQuery(t("chat.queryProbation"))}>{t("chat.exampleProbation")}</button>
            </div>
          </div>
        )}

        {loading && (
          <div className="chat-loading">
            <div className="spinner"></div>
            <span>{t("chat.searching")}</span>
          </div>
        )}

        {error && <div className="error-banner">{error}</div>}

        {result && (
          <div className="chat-result">
            <div className="answer-card">
              <div className="confidence-badge" data-level={result.confidence}>
                {result.confidence} {t("chat.confidence")}
              </div>
              <div className="answer-content">
                <Markdown>{result.answer}</Markdown>
              </div>
            </div>

            {result.sources?.length > 0 && (
              <details className="sources-section" open>
                <summary>{t("chat.sources", { count: result.sources.length })}</summary>
                <div className="sources-list">
                  {result.sources.slice(0, 5).map((src) => (
                    <div key={src.id} className="source-card">
                      <div className="source-header">
                        <span className="source-id">[{src.id}]</span>
                        <span className="source-file">{src.file || t("chat.knowledgeBase")}</span>
                        {src.score && <span className="source-score">{(src.score * 100).toFixed(0)}%</span>}
                      </div>
                      <p className="source-chunk">{src.chunk}</p>
                    </div>
                  ))}
                </div>
              </details>
            )}

            {result.deniedCount > 0 && (
              <div className="denied-banner">
                {t("chat.deniedBanner", { count: result.deniedCount, plural: result.deniedCount > 1 ? "s" : "" })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Input at bottom */}
      <form className="chat-input-bar" onSubmit={handleSubmit}>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("chat.inputPlaceholder")}
          disabled={loading}
        />
        <button type="submit" className="primary" disabled={loading || !query.trim()}>
          {loading ? t("chat.asking") : t("chat.ask")}
        </button>
      </form>

      <style>{`
        .chat-layout {
          display: flex;
          flex-direction: column;
          height: calc(100vh - 120px);
          max-height: 800px;
        }
        .chat-response-area {
          flex: 1;
          overflow-y: auto;
          padding: 1.5rem;
          background: var(--bg-secondary, #fafafa);
          border-radius: 12px 12px 0 0;
        }
        .chat-placeholder {
          text-align: center;
          padding: 3rem 1rem;
          color: var(--text-secondary, #666);
        }
        .chat-placeholder h2 {
          margin: 0 0 0.5rem;
          color: var(--text-primary, #1a1a1a);
        }
        .example-queries {
          margin-top: 1.5rem;
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem;
          justify-content: center;
          align-items: center;
        }
        .example-queries span {
          font-size: 0.85em;
        }
        .example-queries button {
          font-size: 0.85em;
          padding: 0.4em 0.8em;
          border: 1px solid var(--border, #ddd);
          background: var(--bg-primary, #fff);
          border-radius: 20px;
          cursor: pointer;
        }
        .example-queries button:hover {
          background: var(--primary, #c75a3a);
          color: white;
          border-color: var(--primary, #c75a3a);
        }
        .chat-loading {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 1rem;
          padding: 3rem;
          color: var(--text-secondary, #666);
        }
        .spinner {
          width: 24px;
          height: 24px;
          border: 3px solid var(--border, #ddd);
          border-top-color: var(--primary, #c75a3a);
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }

        .chat-input-bar {
          display: flex;
          gap: 0.75rem;
          padding: 1rem;
          background: var(--bg-primary, #fff);
          border: 1px solid var(--border, #e0e0e0);
          border-radius: 0 0 12px 12px;
          border-top: none;
        }
        .chat-input-bar input {
          flex: 1;
          padding: 0.75rem 1rem;
          font-size: 1rem;
          border: 1px solid var(--border, #ddd);
          border-radius: 8px;
        }
        .chat-input-bar button {
          padding: 0.75rem 1.5rem;
        }

        .answer-card {
          background: var(--bg-primary, #fff);
          border-radius: 12px;
          padding: 1.5rem;
          box-shadow: 0 2px 8px rgba(0,0,0,0.06);
        }
        .answer-content {
          line-height: 1.7;
        }
        .answer-content h1, .answer-content h2, .answer-content h3 {
          margin: 1em 0 0.5em;
          line-height: 1.3;
        }
        .answer-content h1 { font-size: 1.4em; }
        .answer-content h2 { font-size: 1.2em; }
        .answer-content h3 { font-size: 1.1em; }
        .answer-content p {
          margin: 0 0 1em;
        }
        .answer-content ul, .answer-content ol {
          margin: 0.5em 0 1em;
          padding-left: 1.5em;
        }
        .answer-content li {
          margin: 0.4em 0;
        }
        .answer-content code {
          background: var(--bg-secondary, #f5f5f5);
          padding: 0.2em 0.4em;
          border-radius: 4px;
          font-size: 0.9em;
        }
        .answer-content strong {
          font-weight: 600;
        }

        .confidence-badge {
          display: inline-block;
          font-size: 0.75rem;
          font-weight: 500;
          padding: 0.25em 0.75em;
          border-radius: 20px;
          margin-bottom: 1rem;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        .confidence-badge[data-level="high"] {
          background: #d4edda;
          color: #155724;
        }
        .confidence-badge[data-level="medium"] {
          background: #fff3cd;
          color: #856404;
        }
        .confidence-badge[data-level="low"] {
          background: #f8d7da;
          color: #721c24;
        }

        .sources-section {
          margin-top: 1.5rem;
          background: var(--bg-primary, #fff);
          border-radius: 8px;
          overflow: hidden;
        }
        .sources-section summary {
          padding: 0.75rem 1rem;
          background: var(--bg-secondary, #f5f5f5);
          cursor: pointer;
          font-weight: 500;
          font-size: 0.9rem;
        }
        .sources-list {
          padding: 0.5rem;
        }
        .source-card {
          padding: 0.75rem;
          margin: 0.5rem 0;
          border: 1px solid var(--border-light, #eee);
          border-radius: 6px;
        }
        .source-header {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          margin-bottom: 0.5rem;
        }
        .source-id {
          font-weight: 600;
          color: var(--primary, #c75a3a);
        }
        .source-file {
          font-family: monospace;
          font-size: 0.8em;
          color: var(--text-secondary, #666);
          background: var(--bg-secondary, #f5f5f5);
          padding: 0.2em 0.5em;
          border-radius: 4px;
        }
        .source-score {
          margin-left: auto;
          font-size: 0.75em;
          color: var(--text-secondary, #888);
        }
        .source-chunk {
          font-size: 0.85em;
          color: var(--text-secondary, #555);
          margin: 0;
          line-height: 1.4;
        }
        .denied-banner {
          margin-top: 1rem;
          padding: 0.75rem;
          background: #fff3cd;
          border-radius: 6px;
          font-size: 0.85em;
          color: #856404;
        }
      `}</style>
    </div>
  );
}
