import React from "react";
import { createRoot } from "react-dom/client";
import "./style.css";
import { api } from "./api";
import { Chat } from "./Chat.jsx";
import { Upload } from "./Upload.jsx";

const NAV = [
  { id: "chat", label: "Ask", component: Chat },
  { id: "upload", label: "Upload", component: Upload },
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
        <p className="eyebrow">Tasco</p>
        <h1>My Tasco</h1>
        <p className="lede">
          Enterprise knowledge assistant with AI-powered search and role-based access control.
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
  const [page, setPage] = React.useState("chat");
  const Active = NAV.find((n) => n.id === page).component;

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <h1>My Tasco</h1>
          <p className="eyebrow">Knowledge Assistant</p>
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
          <div className="user-line">
            <span>{user.fullName}</span>
            <span className="muted">{user.role} · {user.department}</span>
          </div>
          <button type="button" className="ghost" onClick={onLogout}>Sign out</button>
        </div>
      </aside>
      <main className="content">
        <Active user={user} />
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
