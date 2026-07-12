// apps/web/src/Upload.jsx
import React from "react";

const CLASSIFICATIONS = [
  { value: "public", label: "Public - All employees" },
  { value: "internal", label: "Internal - All employees" },
  { value: "confidential", label: "Confidential - Manager+ in department" },
  { value: "restricted", label: "Restricted - Executive only" },
];

const UPLOAD_STEPS = [
  "Uploading file...",
  "Processing document...",
  "Extracting knowledge...",
  "Almost done...",
];

export function Upload({ user }) {
  const [file, setFile] = React.useState(null);
  const [classification, setClassification] = React.useState("internal");
  const [uploading, setUploading] = React.useState(false);
  const [uploadStep, setUploadStep] = React.useState(0);
  const [result, setResult] = React.useState(null);
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    if (!uploading) {
      setUploadStep(0);
      return;
    }
    const interval = setInterval(() => {
      setUploadStep((s) => (s < UPLOAD_STEPS.length - 1 ? s + 1 : s));
    }, 2000);
    return () => clearInterval(interval);
  }, [uploading]);

  async function handleUpload(e) {
    e.preventDefault();
    if (!file) return;

    setUploading(true);
    setError("");
    setResult(null);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("classification", classification);
    formData.append("team", user.department);

    try {
      const res = await fetch("/api/ingest/file", {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      setResult(data);
      setFile(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  }

  function handleDrop(e) {
    e.preventDefault();
    const dropped = e.dataTransfer.files[0];
    if (dropped) setFile(dropped);
  }

  return (
    <div className="upload-container">
      <h2>Upload Document</h2>
      <p className="muted">Add documents to the knowledge base for your team.</p>

      <form onSubmit={handleUpload}>
        <div
          className="drop-zone"
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          onClick={() => !uploading && document.getElementById("file-input").click()}
          style={{ opacity: uploading ? 0.6 : 1, cursor: uploading ? "wait" : "pointer" }}
        >
          <input
            id="file-input"
            type="file"
            accept=".pdf,.docx,.pptx,.xlsx,.txt,.md"
            onChange={(e) => setFile(e.target.files[0])}
            style={{ display: "none" }}
            disabled={uploading}
          />
          {file ? (
            <p><strong>{file.name}</strong> ({(file.size / 1024).toFixed(1)} KB)</p>
          ) : (
            <p>Drop a file here or click to select</p>
          )}
        </div>

        <label className="field">
          <span>Classification</span>
          <select value={classification} onChange={(e) => setClassification(e.target.value)} disabled={uploading}>
            {CLASSIFICATIONS.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        </label>

        <label className="field">
          <span>Team</span>
          <input type="text" value={user.department} disabled />
        </label>

        <button type="submit" className="primary" disabled={!file || uploading}>
          {uploading ? "Processing..." : "Upload"}
        </button>
      </form>

      {uploading && (
        <div className="upload-progress">
          <div className="spinner"></div>
          <span>{UPLOAD_STEPS[uploadStep]}</span>
        </div>
      )}

      {error && <div className="error-banner">{error}</div>}

      {result && (
        <div className="success-banner">
          <strong>{result.filename || "Document"}</strong> uploaded successfully!
          It will be available in search shortly.
        </div>
      )}

      <style>{`
        .upload-progress {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 16px;
          margin-top: 16px;
          background: var(--bg-secondary, #f5f5f5);
          border-radius: 8px;
          color: var(--text-secondary, #666);
        }
        .spinner {
          width: 20px;
          height: 20px;
          border: 2px solid var(--border, #ddd);
          border-top-color: var(--primary, #0066cc);
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
