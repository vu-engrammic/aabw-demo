// apps/web/src/Upload.jsx
import React from "react";

const CLASSIFICATIONS = [
  { value: "public", label: "Public - All employees" },
  { value: "internal", label: "Internal - All employees" },
  { value: "confidential", label: "Confidential - Manager+ in department" },
  { value: "restricted", label: "Restricted - Executive only" },
];

export function Upload({ user }) {
  const [file, setFile] = React.useState(null);
  const [classification, setClassification] = React.useState("internal");
  const [uploading, setUploading] = React.useState(false);
  const [result, setResult] = React.useState(null);
  const [error, setError] = React.useState("");

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
          onClick={() => document.getElementById("file-input").click()}
        >
          <input
            id="file-input"
            type="file"
            accept=".pdf,.docx,.pptx,.xlsx,.txt,.md"
            onChange={(e) => setFile(e.target.files[0])}
            style={{ display: "none" }}
          />
          {file ? (
            <p><strong>{file.name}</strong> ({(file.size / 1024).toFixed(1)} KB)</p>
          ) : (
            <p>Drop a file here or click to select</p>
          )}
        </div>

        <label className="field">
          <span>Classification</span>
          <select value={classification} onChange={(e) => setClassification(e.target.value)}>
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
          {uploading ? "Uploading..." : "Upload"}
        </button>
      </form>

      {error && <div className="error-banner">{error}</div>}

      {result && (
        <div className="success-banner">
          Document uploaded successfully. ID: {result.documentId}
        </div>
      )}
    </div>
  );
}
