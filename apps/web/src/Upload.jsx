// apps/web/src/Upload.jsx
import React from "react";
import { useLocale } from "./i18n.jsx";
<<<<<<< HEAD

const DEPARTMENTS = [
  { code: "COMP", slug: "company", en: "Company", vi: "Công ty" },
  { code: "HR", slug: "human-resources", en: "Human Resources", vi: "Nhân sự" },
  { code: "FIN", slug: "finance", en: "Finance", vi: "Tài chính" },
  { code: "PROD", slug: "product", en: "Product", vi: "Sản phẩm" },
  { code: "ENG", slug: "engineering", en: "Engineering", vi: "Kỹ thuật" },
  { code: "OPS", slug: "operations", en: "Operations", vi: "Vận hành" },
  { code: "LEGAL", slug: "legal", en: "Legal & Compliance", vi: "Pháp chế & Tuân thủ" },
  { code: "EXEC", slug: "executive", en: "Executive Office", vi: "Ban Điều hành" },
];

function deptForUser(user) {
  const name = String(user?.department || "").toLowerCase();
  return (
    DEPARTMENTS.find(
      (d) =>
        d.en.toLowerCase() === name ||
        d.slug === name ||
        d.code.toLowerCase() === String(user?.departmentCode || "").toLowerCase()
    ) || DEPARTMENTS.find((d) => d.slug === "engineering")
  );
}

export function Upload({ user }) {
  const { t, locale } = useLocale();
  const defaultDept = deptForUser(user);
=======

export function Upload({ user }) {
  const { t } = useLocale();

  const CLASSIFICATIONS = [
    { value: "public", label: t("upload.classPublic") },
    { value: "internal", label: t("upload.classInternal") },
    { value: "confidential", label: t("upload.classConfidential") },
    { value: "restricted", label: t("upload.classRestricted") },
  ];

  const UPLOAD_STEPS = [
    t("upload.step1"),
    t("upload.step2"),
    t("upload.step3"),
    t("upload.step4"),
  ];

>>>>>>> 1821cc796a39f85bcd576e201f168efc20f265aa
  const [file, setFile] = React.useState(null);
  const [classification, setClassification] = React.useState("internal");
  const [team, setTeam] = React.useState(defaultDept?.en || user.department);
  const [uploading, setUploading] = React.useState(false);
  const [uploadStep, setUploadStep] = React.useState(0);
  const [result, setResult] = React.useState(null);
  const [error, setError] = React.useState("");

  const CLASSIFICATIONS = [
    { value: "public", label: t("upload.classPublic") },
    { value: "internal", label: t("upload.classInternal") },
    { value: "confidential", label: t("upload.classConfidential") },
    { value: "restricted", label: t("upload.classRestricted") },
  ];

  const UPLOAD_STEPS = [
    t("upload.step1"),
    t("upload.step2"),
    t("upload.step3"),
    t("upload.step4"),
  ];

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
    formData.append("team", team);

    try {
      const res = await fetch("/api/ingest/file", {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t("upload.uploadFailed"));
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
      <h2>{t("upload.title")}</h2>
      <p className="muted">{t("upload.subtitle")}</p>
<<<<<<< HEAD
      <p className="muted">{t("upload.oneClassWarning")}</p>
=======
>>>>>>> 1821cc796a39f85bcd576e201f168efc20f265aa

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
            <p>{t("upload.dropZone")}</p>
          )}
        </div>

        <label className="field">
          <span>{t("upload.classification")}</span>
          <select value={classification} onChange={(e) => setClassification(e.target.value)} disabled={uploading}>
            {CLASSIFICATIONS.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        </label>

        <label className="field">
          <span>{t("upload.team")}</span>
<<<<<<< HEAD
          <select value={team} onChange={(e) => setTeam(e.target.value)} disabled={uploading}>
            {DEPARTMENTS.map((d) => (
              <option key={d.code} value={d.en}>
                {d.code} — {locale === "vi" ? d.vi : d.en}
              </option>
            ))}
          </select>
=======
          <input type="text" value={user.department} disabled />
>>>>>>> 1821cc796a39f85bcd576e201f168efc20f265aa
        </label>

        <button type="submit" className="primary" disabled={!file || uploading}>
          {uploading ? t("upload.processing") : t("upload.uploadButton")}
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
<<<<<<< HEAD
          <strong>{result.filename || t("upload.documentFallback")}</strong>{" "}
          {t("upload.successSuffix")}
          {result.metadata?.tags?.length ? (
            <div className="muted" style={{ marginTop: 8 }}>
              tags: {result.metadata.tags.join(", ")}
            </div>
          ) : null}
=======
          <strong>{result.filename || t("upload.documentFallback")}</strong> {t("upload.successSuffix")}
>>>>>>> 1821cc796a39f85bcd576e201f168efc20f265aa
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
