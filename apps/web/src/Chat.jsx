// apps/web/src/Chat.jsx
import React from "react";
import { api } from "./api";

// Simple markdown renderer for chat responses
function Markdown({ text }) {
  if (!text) return null;

  // Split into paragraphs/lines
  const lines = text.split('\n');
  const elements = [];
  let listItems = [];
  let inList = false;

  function flushList() {
    if (listItems.length > 0) {
      elements.push(<ul key={`list-${elements.length}`}>{listItems}</ul>);
      listItems = [];
    }
    inList = false;
  }

  function renderInline(str) {
    // Bold: **text** or __text__
    // Italic: *text* or _text_
    // Source refs: [Source: filename]
    const parts = [];
    let remaining = str;
    let key = 0;

    const patterns = [
      { regex: /\*\*(.+?)\*\*/g, render: (m) => <strong key={key++}>{m}</strong> },
      { regex: /\*(.+?)\*/g, render: (m) => <em key={key++}>{m}</em> },
      { regex: /\[Source:\s*([^\]]+)\]/g, render: (m) => <span key={key++} className="source-ref">[{m}]</span> },
    ];

    // Simple approach: process bold first, then others
    remaining = remaining.replace(/\*\*(.+?)\*\*/g, '⟦BOLD⟧$1⟦/BOLD⟧');
    remaining = remaining.replace(/\[Source:\s*([^\]]+)\]/g, '⟦SRC⟧$1⟦/SRC⟧');

    const tokens = remaining.split(/(⟦BOLD⟧|⟦\/BOLD⟧|⟦SRC⟧|⟦\/SRC⟧)/);
    let inBold = false;
    let inSrc = false;

    for (const token of tokens) {
      if (token === '⟦BOLD⟧') { inBold = true; continue; }
      if (token === '⟦/BOLD⟧') { inBold = false; continue; }
      if (token === '⟦SRC⟧') { inSrc = true; continue; }
      if (token === '⟦/SRC⟧') { inSrc = false; continue; }
      if (!token) continue;

      if (inBold) {
        parts.push(<strong key={key++}>{token}</strong>);
      } else if (inSrc) {
        parts.push(<span key={key++} className="source-ref">[{token}]</span>);
      } else {
        parts.push(token);
      }
    }

    return parts;
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // List item (- or * or numbered)
    const listMatch = trimmed.match(/^[-*•]\s+(.+)$/) || trimmed.match(/^\d+\.\s+(.+)$/);
    if (listMatch) {
      if (!inList) inList = true;
      listItems.push(<li key={`li-${i}`}>{renderInline(listMatch[1])}</li>);
      continue;
    }

    // End of list
    if (inList && trimmed === '') {
      flushList();
      continue;
    }

    if (inList) {
      flushList();
    }

    // Empty line
    if (trimmed === '') {
      continue;
    }

    // Regular paragraph
    elements.push(<p key={`p-${i}`}>{renderInline(trimmed)}</p>);
  }

  flushList();

  return <div className="markdown-content">{elements}</div>;
}

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
            <Markdown text={result.answer} />
          </div>

          {result.sources?.length > 0 && (
            <details className="sources-section">
              <summary>
                <h3>Sources ({result.sources.length})</h3>
              </summary>
              <div className="sources-list">
                {result.sources.slice(0, 5).map((src) => (
                  <div key={src.id} className="source-card">
                    <div className="source-header">
                      <span className="source-id">[{src.id}]</span>
                      <span className="source-file">{src.file || 'knowledge base'}</span>
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
              {result.deniedCount} document{result.deniedCount > 1 ? "s" : ""} hidden by access level
            </div>
          )}
        </div>
      )}

      <style>{`
        .markdown-content p {
          margin: 0 0 0.75em;
          line-height: 1.6;
        }
        .markdown-content p:last-child {
          margin-bottom: 0;
        }
        .markdown-content ul {
          margin: 0.5em 0 1em 1.5em;
          padding: 0;
        }
        .markdown-content li {
          margin: 0.4em 0;
          line-height: 1.5;
        }
        .markdown-content strong {
          font-weight: 600;
          color: var(--text-primary, #1a1a1a);
        }
        .source-ref {
          font-size: 0.85em;
          color: var(--primary, #0066cc);
          background: var(--bg-secondary, #f0f4f8);
          padding: 0.1em 0.4em;
          border-radius: 4px;
          font-family: var(--font-mono, monospace);
        }
        .sources-section {
          margin-top: 1.5em;
          border: 1px solid var(--border, #e0e0e0);
          border-radius: 8px;
          overflow: hidden;
        }
        .sources-section summary {
          padding: 0.75em 1em;
          background: var(--bg-secondary, #f5f5f5);
          cursor: pointer;
          user-select: none;
        }
        .sources-section summary h3 {
          display: inline;
          font-size: 0.9em;
          margin: 0;
        }
        .sources-list {
          padding: 0.5em;
        }
        .source-card {
          padding: 0.75em;
          margin: 0.5em 0;
          background: var(--bg-primary, #fff);
          border: 1px solid var(--border-light, #eee);
          border-radius: 6px;
        }
        .source-header {
          display: flex;
          align-items: center;
          gap: 0.5em;
          margin-bottom: 0.5em;
        }
        .source-id {
          font-weight: 600;
          color: var(--primary, #0066cc);
        }
        .source-file {
          font-family: var(--font-mono, monospace);
          font-size: 0.85em;
          color: var(--text-secondary, #666);
        }
        .source-score {
          margin-left: auto;
          font-size: 0.8em;
          padding: 0.2em 0.5em;
          background: var(--bg-secondary, #f0f0f0);
          border-radius: 4px;
          color: var(--text-secondary, #666);
        }
        .source-chunk {
          font-size: 0.85em;
          color: var(--text-secondary, #555);
          margin: 0;
          line-height: 1.4;
          display: -webkit-box;
          -webkit-line-clamp: 3;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
      `}</style>
    </div>
  );
}
