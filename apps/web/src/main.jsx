import React from "react";
import { createRoot } from "react-dom/client";
import "./style.css";
import { api } from "./api";
import { Chat } from "./Chat.jsx";
import { Upload } from "./Upload.jsx";
import { LocaleProvider, useLocale, LanguageToggle } from "./i18n.jsx";

function useNav() {
  const { t } = useLocale();
  return [
    { id: "chat", label: t("nav.ask"), component: Chat },
    { id: "upload", label: t("nav.upload"), component: Upload },
  ];
}

function Login({ personas, workos, onSignedIn }) {
  const { t } = useLocale();
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
        <div className="row split">
          <p className="eyebrow">{t("login.eyebrow")}</p>
          <LanguageToggle />
        </div>
        <h1>{t("login.title")}</h1>
        <p className="lede">{t("login.tagline")}</p>
        {error && <p className="error-text">{error}</p>}
        {workos && (
          <a className="primary link-btn" href="/api/auth/sso">{t("login.continueSso")}</a>
        )}
        <p className="muted">{workos ? t("login.orPersona") : t("login.signInPersona")}</p>
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
  const { t } = useLocale();
  const NAV = useNav();
  const [page, setPage] = React.useState("chat");
  const Active = NAV.find((n) => n.id === page)?.component || Chat;

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
<<<<<<< HEAD
          <div className="row split">
            <h1>My Tasco</h1>
            <LanguageToggle />
          </div>
=======
          <h1>{t("login.title")}</h1>
>>>>>>> 1821cc796a39f85bcd576e201f168efc20f265aa
          <p className="eyebrow">{t("shell.brandEyebrow")}</p>
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
          <button type="button" className="ghost" onClick={onLogout}>{t("shell.signOut")}</button>
        </div>
      </aside>
      <main className="content">
        <div className="content-topbar">
          <LanguageToggle />
        </div>
        <Active user={user} />
      </main>
    </div>
  );
}

function Root() {
  const { t } = useLocale();
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

  if (booting) return <main className="login-shell"><p className="muted">{t("login.loading")}</p></main>;
  if (!user) return <Login personas={personas} workos={workos} onSignedIn={setUser} />;
  return <Shell user={user} onLogout={logout} />;
}

createRoot(document.getElementById("root")).render(
  <LocaleProvider>
    <Root />
  </LocaleProvider>
);
