import React from "react";
import { createRoot } from "react-dom/client";
import "./style.css";
import { api } from "./api";
import {
  RecallPanel,
  Inbox,
  GraphPage,
  Conflicts,
  Sources,
  Scopes,
  Analytics,
  Install,
} from "./components.jsx";

const COMPANION_URL = "http://127.0.0.1:8792/";

if (new URLSearchParams(window.location.search).get("popup") === "1") {
  window.location.replace(COMPANION_URL);
}

const NAV = [
  { id: "inbox", label: "Inbox", component: Inbox },
  { id: "recall", label: "Recall", component: (props) => <RecallPanel {...props} /> },
  { id: "graph", label: "Graph", component: GraphPage },
  { id: "conflicts", label: "Conflicts", component: Conflicts },
  { id: "sources", label: "Sources", component: Sources },
  { id: "scopes", label: "Scopes", component: Scopes },
  { id: "analytics", label: "Analytics", component: Analytics },
  { id: "install", label: "Install MCP", component: Install },
];

function Login({ personas, workos, onSignedIn }) {
  const [busy, setBusy] = React.useState("");
  const [error, setError] = React.useState("");

  async function login(personaId) {
    setBusy(personaId);
    setError("");
    try {
      const data = await api("/auth/login", { method: "POST", body: JSON.stringify({ personaId }) });
      onSignedIn(data.user);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy("");
    }
  }

  return (
    <main className="login-shell">
      <div className="login-card">
        <p className="eyebrow">Engrammic</p>
        <h1>Org Memory</h1>
        <p className="lede">
          Admin console for governance, analytics, and MCP install. Day-to-day recall lives in the{" "}
          <a href={COMPANION_URL}>companion app</a>.
        </p>
        {error && <p className="error-text">{error}</p>}
        {workos && (
          <a className="primary link-btn" href="/api/auth/sso">Continue with SSO</a>
        )}
        <p className="muted">{workos ? "Or use a demo persona:" : "Sign in as a demo persona:"}</p>
        <div className="persona-list">
          {personas.map((p) => (
            <button key={p.userId} type="button" disabled={busy === p.userId} onClick={() => login(p.userId)}>
              <strong>{p.fullName}</strong>
              <span>{p.role} · {p.department}</span>
            </button>
          ))}
        </div>
      </div>
    </main>
  );
}

function Shell({ user, onLogout }) {
  const [page, setPage] = React.useState("inbox");
  const [silos, setSilos] = React.useState([]);
  const [silo, setSilo] = React.useState(user.department || "all");
  const Active = NAV.find((n) => n.id === page).component;

  React.useEffect(() => {
    api(`/silos?silo=${encodeURIComponent(silo)}`)
      .then((data) => {
        setSilos(data.silos || []);
        if (data.selected) setSilo(data.selected);
      })
      .catch(() => {});
  }, [silo]);

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <p className="eyebrow">Engrammic</p>
          <h1>Org Memory</h1>
        </div>
        <nav>
          {NAV.map((n) => (
            <button
              key={n.id}
              type="button"
              className={page === n.id ? "nav-item active" : "nav-item"}
              onClick={() => setPage(n.id)}
            >
              {n.label}
            </button>
          ))}
        </nav>
        <div className="sidebar-foot">
          <label className="silo-picker">
            <span className="muted">Silo</span>
            <select value={silo} onChange={(e) => setSilo(e.target.value)}>
              {silos.map((s) => (
                <option key={s.id} value={s.id}>{s.label}</option>
              ))}
            </select>
          </label>
          <a className="ghost link-btn" href={COMPANION_URL} target="_blank" rel="noreferrer">Open companion ↗</a>
          <div className="user-line">
            <span>{user.fullName}</span>
            <span className="muted">{user.role} · {user.department}</span>
          </div>
          <button type="button" className="ghost" onClick={onLogout}>Sign out</button>
        </div>
      </aside>
      <main className="content">
        <header className="content-head">
          <h2>{NAV.find((n) => n.id === page).label}</h2>
        </header>
        <Active silo={silo} onNavigate={setPage} />
      </main>
    </div>
  );
}

function Root() {
  const [booting, setBooting] = React.useState(true);
  const [user, setUser] = React.useState(null);
  const [personas, setPersonas] = React.useState([]);
  const [workos, setWorkos] = React.useState(false);

  React.useEffect(() => {
    Promise.all([api("/auth/me"), api("/auth/personas")])
      .then(([me, cfg]) => {
        if (me.authenticated) setUser(me.user);
        setPersonas(cfg.personas || []);
        setWorkos(Boolean(cfg.workos));
      })
      .catch(() => {})
      .finally(() => setBooting(false));
  }, []);

  async function logout() {
    await api("/auth/logout", { method: "POST", body: "{}" }).catch(() => {});
    setUser(null);
  }

  if (booting) return <main className="login-shell"><p className="muted">Loading…</p></main>;
  if (!user) return <Login personas={personas} workos={workos} onSignedIn={setUser} />;
  return <Shell user={user} onLogout={logout} />;
}

createRoot(document.getElementById("root")).render(<Root />);
